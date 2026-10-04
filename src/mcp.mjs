import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod/v4';
import { RecoveryError } from './engine.mjs';

const DISCLOSURE = 'Synthetic travel scenario. All supplier actions, bookings and charges are simulated. No Alexa account, AI model or external provider is connected.';

/** @param {import('node:http').IncomingMessage} req */
function isAllowedLocalRequest(req) {
  const host = req.headers.host;
  // Validate the raw authority before URL parsing can normalize an unsafe value.
  if (typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\])(?::[1-9]\d{0,4})?$/i.test(host)) return false;
  const url = new URL(`http://${host}`);
  if (Number(url.port || 80) !== req.socket.localPort) return false;
  const origin = req.headers.origin;
  // Non-browser MCP clients normally send no Origin. Browsers must be same-origin.
  if (origin !== undefined && origin !== url.origin) return false;
  const remoteAddress = req.socket.remoteAddress;
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

/** @param {import('node:http').ServerResponse} res */
function httpError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** @returns {import('@modelcontextprotocol/sdk/types.js').CallToolResult} */
function stateResult(state, isError = false) {
  const data = { mode: 'simulation', externalCalls: false, disclosure: DISCLOSURE, state };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError };
}

/** @returns {import('@modelcontextprotocol/sdk/types.js').CallToolResult} */
function runTool(action, failed = (_state) => false) {
  try {
    const state = action();
    return stateResult(state, failed(state));
  } catch (error) {
    const data = {
      mode: 'simulation', externalCalls: false,
      error: error instanceof RecoveryError
        ? { code: error.code, message: error.message }
        : { code: 'INTERNAL_ERROR', message: 'Recovery operation failed. Inspect the local demo before retrying.' },
    };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: true };
  }
}

/** A fresh SDK server per HTTP request; the shared engine retains domain state. */
function makeServer(engine) {
  const server = new McpServer({ name: 'nightjar-recovery', version: '0.1.0' }, {
    instructions: `${DISCLOSURE} Tools cannot grant approval. Ask a human to review and approve the exact plan in the local Nightjar UI before execute_recovery. Replanning invalidates any earlier approval.`,
  });
  server.registerTool('get_recovery_state', {
    title: 'Read synthetic recovery state',
    description: 'Read the current shared scenario, constraints, plan, human approval and supplier receipts without changing anything.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => runTool(() => engine.getState()));
  server.registerTool('plan_recovery', {
    title: 'Plan synthetic travel recovery',
    description: 'Compute a new versioned plan from synthetic offers. Optional inputs retain current constraints when omitted. This saves a plan and invalidates prior approval; it creates no bookings or charges.',
    inputSchema: z.object({
      budget: z.number().min(0).max(100_000).optional().describe('Maximum total incremental simulated cost in USD.'),
      latestArrival: z.string().max(40).optional().describe('Hotel-arrival deadline: HH:mm in the fixed scenario or an ISO timestamp including its time zone.'),
      accessibility: z.boolean().optional().describe('Require a wheelchair-accessible flight and ground transfer.'),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (input) => runTool(() => engine.plan(input), (state) => state.plan.status === 'blocked'));
  server.registerTool('execute_recovery', {
    title: 'Execute human-approved synthetic recovery',
    description: 'Execute or reconcile ONLY the exact plan already approved by a human in the local UI. This tool never approves a plan. Stable supplier idempotency keys prevent duplicate simulated bookings on retry. No real purchase occurs.',
    inputSchema: z.object({ planVersion: z.number().int().positive().describe('Exact reviewed and human-approved plan version.') }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => runTool(() => engine.execute(input), (state) => state.execution.status !== 'completed'));
  return server;
}

/**
 * Mount at /mcp BEFORE reading the HTTP body; the official SDK parses MCP itself.
 * Use the same RecoveryEngine instance as the UI. Bind the HTTP server to 127.0.0.1.
 * Transport is stateless; engine persistence and supplier reconciliation are separate.
 * @param {import('./engine.mjs').RecoveryEngine} engine
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createMcpHandler(engine) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isAllowedLocalRequest(req)) {
      httpError(res, 403, 'Only a loopback client and a valid same-origin request may use this credential-free demo.');
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      httpError(res, 405, 'This stateless endpoint accepts POST; standalone SSE streams and sessions are not provided.');
      return;
    }
    const server = makeServer(engine);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 16_384,
    });
    // Listen before handling: JSON responses can finish before handleRequest resolves.
    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      await server.close();
    };
    res.once('close', () => { void cleanup().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) httpError(res, 500, 'MCP request could not be processed.');
      else if (!res.writableEnded) res.end();
      await cleanup();
    }
  };
}
