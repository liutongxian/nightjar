import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServerProcess } from './process-harness.mjs';

/** A real CLI process is forcibly killed between an unknown outcome and recovery. */
export async function runProcessCrashProof() {
  const directory = mkdtempSync(join(tmpdir(), 'nightjar-process-crash-'));
  const stateFile = join(directory, 'state.json');
  let app, client;
  const evidence = {
    recordedAt: new Date().toISOString(),
    disclosure: 'Actual CLI subprocesses, forced process exit, durable state and official MCP HTTP calls. All travel and approvals are synthetic fixtures. No browser rendering, video or Alexa integration is claimed.',
    stages: [], success: false,
  };
  const counts = (s) => ({ hotel: s.providers.hotel.protections.length, flights: s.providers.airline.bookings.length, transfers: s.providers.ground.bookings.length, transferCreates: s.providers.ground.requests, transferLookups: s.providers.ground.reconciliationRequests });
  async function connect() {
    app = await startServerProcess({ stateFile });
    client = new Client({ name: 'nightjar-process-crash-proof', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${app.base}/mcp`)));
  }
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    return result.structuredContent.state;
  }
  async function post(path, body) {
    const response = await fetch(`${app.base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    await connect();
    const firstPid = app.child.pid;
    const planned = await call('plan_recovery', { budget: 300, latestArrival: '01:00' });
    await post('approve', { planVersion: planned.plan.version, maxTotal: planned.plan.total });
    await post('inject', { kind: 'transport-timeout' });
    const interrupted = await call('execute_recovery', { planVersion: planned.plan.version });
    assert.equal(interrupted.execution.status, 'needs-retry');
    assert.equal(interrupted.providers.ground.requests, 1);
    evidence.stages.push({ name: 'unknown-outcome-saved', processId: firstPid, status: interrupted.execution.status, counts: counts(interrupted), approvalSource: 'automated HTTP fixture, not a human or MCP approval tool' });
    await client.close(); client = null;
    const exit = await app.stop('SIGKILL'); app = null;
    assert.equal(exit.signal, 'SIGKILL');
    evidence.stages.push({ name: 'actual-process-killed', processId: firstPid, exit });
    await connect();
    assert.notEqual(app.child.pid, firstPid);
    const restored = await call('get_recovery_state');
    assert.equal(restored.execution.status, 'needs-retry');
    assert.deepEqual(counts(restored), counts(interrupted));
    evidence.stages.push({ name: 'new-process-restored', processId: app.child.pid, status: restored.execution.status, counts: counts(restored) });
    const completed = await call('execute_recovery', { planVersion: restored.plan.version });
    assert.equal(completed.execution.status, 'completed');
    assert.equal(completed.providers.ground.requests, 1);
    assert.equal(completed.providers.ground.reconciliationRequests, 1);
    const repeated = await call('execute_recovery', { planVersion: completed.plan.version });
    assert.deepEqual(counts(repeated), counts(completed));
    assert.equal(repeated.providers.hotel.reservation.status, 'confirmed');
    assert.equal(repeated.providers.airline.entitlement.status, 'preserved');
    evidence.stages.push({ name: 'reconciled-without-duplicate', processId: app.child.pid, status: repeated.execution.status, counts: counts(repeated), receipts: repeated.execution.steps.map((step) => step.reference), originalReservation: repeated.providers.hotel.reservation.status, originalTicket: repeated.providers.airline.entitlement.status });
    evidence.success = true;
    return evidence;
  } finally {
    if (client) await client.close();
    if (app) await app.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const evidence = await runProcessCrashProof();
  mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../artifacts/process-crash-proof.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
