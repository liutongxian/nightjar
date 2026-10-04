import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.mjs';
import { RecoveryEngine } from '../src/engine.mjs';

const parse = (text) => { try { return JSON.parse(text); } catch { return text; } };
const commitments = (state) => state.providers.hotel.protections.length + state.providers.airline.bookings.length + state.providers.ground.bookings.length;
const stateOf = (result) => result.structuredContent.state;

async function startServer(engine) {
  const server = createServer({ engine });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: new URL(`http://127.0.0.1:${server.address().port}/mcp`) };
}

function rawRequest(url, { method = 'POST', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('official MCP SDK client exercises real Streamable HTTP, human gate, and retry recovery', async (t) => {
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-11-25'));
  const evidence = {
    generatedAt: new Date().toISOString(),
    disclosure: 'Real localhost HTTP and official MCP SDK client/server; all travel data, supplier outcomes, approvals and faults are synthetic test fixtures. No Alexa or external supplier account is connected.',
    sdkVersion: JSON.parse(readFileSync(new URL('../node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url), 'utf8')).version,
    supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    transport: 'Streamable HTTP, stateless, JSON responses',
    assertions: [], exchanges: [],
  };
  const engine = new RecoveryEngine();
  const { server, url } = await startServer(engine);
  const client = new Client({ name: 'nightjar-sdk-smoke', version: '1.0.0' }, { capabilities: {} });
  let dropNextExecutionResponse = false;
  const fetchWithEvidence = async (input, init) => {
    const request = new Request(input, init);
    const body = parse(await request.clone().text());
    const entry = { sequence: evidence.exchanges.length + 1, request: { method: request.method, path: new URL(request.url).pathname, headers: Object.fromEntries(request.headers), body }, response: null };
    evidence.exchanges.push(entry);
    const response = await fetch(request);
    entry.response = { status: response.status, headers: Object.fromEntries(response.headers), body: parse(await response.clone().text()) };
    if (dropNextExecutionResponse && body?.method === 'tools/call' && body.params?.name === 'execute_recovery') {
      dropNextExecutionResponse = false;
      entry.clientFault = 'Test discarded a real successful HTTP response after the server completed execution.';
      throw new TypeError('Simulated loss of completed MCP HTTP response');
    }
    return response;
  };
  const transport = new StreamableHTTPClientTransport(url, { fetch: fetchWithEvidence });
  t.after(async () => {
    await client.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test('initialize negotiates 2025-11-25 or newer and lists only permitted tools', async () => {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'nightjar-recovery');
    const initialize = evidence.exchanges.find((item) => item.request.body?.method === 'initialize');
    assert.ok(initialize.response.body.result.protocolVersion >= '2025-11-25');
    evidence.negotiatedProtocolVersion = initialize.response.body.result.protocolVersion;
    assert.equal(initialize.response.status, 200);
    assert.equal(initialize.response.headers['mcp-session-id'], undefined);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['execute_recovery', 'get_recovery_state', 'plan_recovery']);
    assert.equal(tools.some((tool) => /approve/i.test(tool.name)), false);
    assert.equal(tools.find((tool) => tool.name === 'get_recovery_state').annotations.readOnlyHint, true);
    assert.equal(tools.find((tool) => tool.name === 'execute_recovery').inputSchema.additionalProperties, false);
    evidence.assertions.push('Official initialize/tools/list succeed; no approval tool or session identifier is exposed.');
  });

  await t.test('planning uses tool inputs and execution requires prior version-bound human approval', async () => {
    const initial = await client.callTool({ name: 'get_recovery_state', arguments: {} });
    assert.equal(initial.isError, false);
    assert.equal(stateOf(initial).plan, null);
    const planned = await client.callTool({ name: 'plan_recovery', arguments: { budget: 300, latestArrival: '01:00', accessibility: true } });
    assert.equal(planned.isError, false);
    const plan = stateOf(planned).plan;
    assert.equal(plan.total, 254);
    assert.equal(stateOf(planned).constraints.accessibility, true);
    assert.equal(commitments(stateOf(planned)), 0);
    const providersBefore = engine.getState().providers;
    const blocked = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    assert.equal(blocked.isError, true);
    assert.equal(stateOf(blocked).execution.lastError.code, 'APPROVAL_REQUIRED');
    assert.deepEqual(engine.getState().providers, providersBefore);
    // Test fixture represents approval by a human using the separate local UI.
    engine.approve({ planVersion: plan.version, maxTotal: plan.total });
    const completed = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    assert.equal(completed.isError, false);
    assert.equal(stateOf(completed).execution.status, 'completed');
    assert.equal(commitments(stateOf(completed)), 3);
    const observed = await client.callTool({ name: 'get_recovery_state', arguments: {} });
    assert.deepEqual(stateOf(observed), engine.getState());
    const uiResponse = await fetchWithEvidence(new URL('/api/state', url));
    assert.equal(uiResponse.status, 200);
    assert.deepEqual(await uiResponse.json(), stateOf(observed));
    evidence.assertions.push('Read and plan share the UI engine; execution before human-approval fixture is blocked with zero supplier changes; exact approved version completes.');
  });

  await t.test('strict input schemas cannot smuggle approval and replanning revokes it', async () => {
    const before = engine.getState();
    const invalid = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: before.plan.version, approved: true } });
    assert.equal(invalid.isError, true);
    assert.deepEqual(engine.getState(), before);
    const planned = await client.callTool({ name: 'plan_recovery', arguments: { budget: 300 } });
    const state = stateOf(planned);
    assert.equal(state.approval.status, 'invalidated');
    const blocked = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: state.plan.version } });
    assert.equal(blocked.isError, true);
    assert.equal(stateOf(blocked).execution.lastError.code, 'APPROVAL_REQUIRED');
    evidence.assertions.push('Unexpected approval inputs are rejected; a new plan requires fresh human approval.');
  });

  await t.test('actual MCP tool calls reconcile a simulated supplier lost response without duplicates', async () => {
    engine.reset();
    const planned = await client.callTool({ name: 'plan_recovery', arguments: {} });
    const { plan } = stateOf(planned);
    engine.approve({ planVersion: plan.version, maxTotal: plan.total });
    engine.inject({ kind: 'transport-timeout' });
    const lost = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    const lostState = stateOf(lost);
    assert.equal(lost.isError, true);
    assert.equal(lostState.execution.status, 'needs-retry');
    assert.equal(lostState.execution.lastError.code, 'TRANSPORT_TIMEOUT');
    assert.equal(lostState.execution.steps.find((step) => step.id === 'ground').status, 'unknown');
    assert.equal(lostState.providers.ground.bookings.length, 1);
    const retried = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    const retryState = stateOf(retried);
    assert.equal(retried.isError, false);
    assert.equal(retryState.execution.status, 'completed');
    assert.equal(commitments(retryState), 3);
    assert.equal(retryState.providers.ground.requests, 1);
    assert.equal(retryState.providers.ground.reconciliationRequests, 1);
    assert.equal(retryState.execution.steps.find((step) => step.id === 'ground').reference, 'GR-REC-0001');
    const again = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    assert.deepEqual(stateOf(again), retryState);
    evidence.assertions.push('Two real MCP execute calls traverse a simulated supplier lost response and reconciliation; third retry is a no-op; ground booking count=1, supplier create requests=1, reconciliations=1.');
  });

  await t.test('a discarded real MCP HTTP response can be retried safely', async () => {
    engine.reset();
    const planned = await client.callTool({ name: 'plan_recovery', arguments: {} });
    const { plan } = stateOf(planned);
    engine.approve({ planVersion: plan.version, maxTotal: plan.total });
    dropNextExecutionResponse = true;
    await assert.rejects(client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } }), /Simulated loss/);
    assert.equal(engine.getState().execution.status, 'completed');
    const retried = await client.callTool({ name: 'execute_recovery', arguments: { planVersion: plan.version } });
    assert.equal(retried.isError, false);
    assert.equal(commitments(stateOf(retried)), 3);
    assert.deepEqual(['hotel', 'airline', 'ground'].map((id) => stateOf(retried).providers[id].requests), [1, 1, 1]);
    evidence.assertions.push('Real completed HTTP response intentionally discarded in client fetch wrapper; explicit MCP retry returns original confirmations without extra simulated supplier actions.');
  });

  await t.test('HTTP boundaries reject remote origins, rebinding hosts, invalid versions, and large bodies', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 88, method: 'tools/list', params: {} });
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' };
    const checks = [
      ['remote-origin', { headers: { ...headers, origin: 'https://attacker.example' }, body }, 403],
      ['null-origin', { headers: { ...headers, origin: 'null' }, body }, 403],
      ['rebinding-host', { headers: { ...headers, host: 'attacker.example' }, body }, 403],
      ['wrong-loopback-port', { headers: { ...headers, host: 'localhost:1' }, body }, 403],
      ['unsupported-version', { headers: { ...headers, 'mcp-protocol-version': '1900-01-01' }, body }, 400],
      ['malformed-json', { headers, body: '{' }, 400],
      ['large-body', { headers, body: ' '.repeat(16_385) }, 413],
      ['standalone-sse', { method: 'GET', headers: { accept: 'text/event-stream' } }, 405],
      ['session-delete', { method: 'DELETE' }, 405],
      ['same-origin-allowed', { headers: { ...headers, origin: url.origin }, body }, 200],
    ];
    evidence.securityChecks = [];
    for (const [name, request, status] of checks) {
      const response = await rawRequest(url, request);
      assert.equal(response.status, status, name);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      evidence.securityChecks.push({ name, expectedStatus: status, observed: response });
    }
    evidence.assertions.push('Loopback/same-origin checks, no wildcard CORS, unsupported method/version checks, malformed JSON, and SDK 16 KiB body bound pass.');
  });

  const artifactDirectory = new URL('../artifacts/', import.meta.url);
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(new URL('mcp-smoke.json', artifactDirectory), JSON.stringify(evidence, null, 2));
  t.diagnostic(`Recorded real MCP HTTP evidence: ${fileURLToPath(new URL('mcp-smoke.json', artifactDirectory))}`);
});
