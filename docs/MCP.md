# Nightjar MCP interface

Nightjar exposes a real MCP Streamable HTTP endpoint at `http://127.0.0.1:4173/mcp` while the app is running. The transport is implemented by the official `@modelcontextprotocol/sdk`, not a custom JSON-RPC emulator. The app uses SDK **1.31.0** and **zod 4.6.5**, pinned in `package.json` and the lockfile. The integration test negotiates **MCP 2025-11-25** with the official SDK client.

**Only the protocol/network transport is real.** Every traveler, offer, supplier, booking, payment and injected fault is synthetic. This demo has no Alexa account connection, Alexa+ certification, production authentication, live AI model, or external supplier integration. An MCP-capable local client can exercise the workflow; that does not establish compatibility or acceptance by any particular Alexa service.

## Start and connect

```sh
npm ci --ignore-scripts --cache /tmp/nightjar-npm-cache
npm start
```

Configure a local Streamable HTTP MCP client with URL `http://127.0.0.1:4173/mcp`. No credentials are needed because this server is restricted to loopback and synthetic state. It is not intended to be remotely hosted. Do not add a public tunnel, remote bind, broad CORS policy or forwarded-header bypass.

Example using the installed official client from the project directory:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'nightjar-local-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:4173/mcp')));
console.log(await client.listTools());
console.log(await client.callTool({ name: 'get_recovery_state', arguments: {} }));
console.log(await client.callTool({
  name: 'plan_recovery',
  arguments: { budget: 300, latestArrival: '01:00', accessibility: false },
}));
await client.close();
```

The human then opens the app at `http://127.0.0.1:4173/`, reviews that exact plan, and uses its approval control. A client may subsequently call `execute_recovery` with the approved `planVersion`. Calling execution without that approval is safe to demonstrate: the result is an MCP tool error with `APPROVAL_REQUIRED`, and no supplier action occurs.

## Tools

| Tool | Inputs | Effect |
| --- | --- | --- |
| `get_recovery_state` | Empty object | Reads the same state displayed by the app |
| `plan_recovery` | Optional `budget` number (USD, 0–100000), `latestArrival` string (`HH:mm` or timezone-qualified ISO timestamp), `accessibility` boolean | Creates a new versioned plan; invalidates earlier approval; creates no bookings |
| `execute_recovery` | Required positive integer `planVersion` | Runs or reconciles synthetic supplier operations, only for the exact previously human-approved version |

There is deliberately **no approval tool** and no fault-injection tool. All input schemas reject unexpected fields, including a fabricated `approved` flag. Planning retains omitted constraints. Time-only arrivals are interpreted by the fixed scenario, not the current wall clock; validation and itinerary selection remain in `RecoveryEngine`.

Successful tool results provide both JSON text in `content` and the same data in `structuredContent`, including `mode`, `externalCalls`, a simulation disclosure, and `state`. A blocked plan, blocked execution or uncertain execution outcome returns `isError: true`; callers should inspect `state.execution.lastError` or the blocked plan's reasons. A schema-validation error is produced by the SDK. Domain exceptions are returned as tool errors with a safe code/message.

Tool annotations describe read-only, idempotency and closed-world behavior. Annotations are descriptive hints; the actual approval, version, quote and budget enforcement occurs in the engine.

## Server integration

`src/mcp.mjs` exports `createMcpHandler(engine)`. Instantiate it once per HTTP server with the same `RecoveryEngine` instance used by the UI routes:

```js
import { createMcpHandler } from './mcp.mjs';

const mcpHandler = createMcpHandler(engine);
// Inside the existing HTTP callback, BEFORE reading/parsing the request body:
if (url.pathname === '/mcp') {
  await mcpHandler(req, res);
  return;
}
```

The existing `src/server.mjs` already mounts this route. The handler creates a fresh `McpServer` and `StreamableHTTPServerTransport` for each request, with `sessionIdGenerator: undefined`, `enableJsonResponse: true`, and `maxRequestBodySize: 16384`. The official SDK handles framing, protocol negotiation, request validation, tool dispatch, notifications and JSON serialization. Response-close cleanup closes the per-request SDK instance. Domain state survives requests through the shared engine and its normal persistence path.

`POST /mcp` supports SDK initialization, initialized notifications, discovery and invocation. Notifications receive the SDK's HTTP 202 response. The endpoint has no session IDs, standalone SSE stream, event store or transport replay; `GET` and `DELETE` return HTTP 405. This is the optional JSON-response form of Streamable HTTP, rather than the deprecated HTTP+SSE transport.

## Safety and recovery boundary

- The app binds to `127.0.0.1`; the MCP handler also requires a loopback socket peer, a loopback `Host` matching the listening port, and exact same-origin `Origin` when present
- Absent `Origin` is allowed for non-browser MCP clients; arbitrary, `null` and cross-origin values are rejected. There is no permissive CORS response
- MCP parsing and the 16 KiB body bound are implemented by the SDK. Unsupported protocol headers and malformed JSON are rejected
- The engine enforces version-bound approval, quote freshness and spending limits even if an MCP client attempts execution directly
- Human approval occurs in the separate local UI/HTTP workflow. This credential-free demo does not authenticate a real person's identity and is not a production authorization system; a malicious process on the same machine is outside its security boundary
- A timeout is an unknown supplier outcome. Repeated execution uses durable supplier idempotency keys and looks up committed outcomes before any new synthetic action. This is **domain-level recovery**, independent of MCP transport sessions or SSE replay

For real deployments, authenticated identity, human-consent provenance, server-side entitlement enforcement, external supplier idempotency contracts, durable multi-process storage and operational controls would all need separate design and validation. None are claimed here.

## Verification and reproducible evidence

```sh
node --test tests/mcp.test.mjs
npm run typecheck
npm run lint
```

The integration test starts the actual app's `createServer` on an ephemeral loopback port, connects through `Client` and `StreamableHTTPClientTransport`, and checks:

1. Real `initialize`, `notifications/initialized`, `tools/list` and `tools/call` HTTP exchanges; protocol 2025-11-25 or newer; only the three allowed tools
2. Tool input handling; no supplier mutations before approval; a direct engine approval fixture representing the human UI; completed execution; exact agreement between MCP state and `/api/state`
3. Unknown input-field rejection and approval invalidation after replanning
4. A simulated lost supplier response reached through an actual MCP invocation, followed by successful reconciliation and duplicate-free repeat calls
5. A distinct client-boundary fault: discarding a real successful MCP HTTP response after server execution, then explicitly retrying the MCP call without duplicate supplier requests
6. Host, Origin, invalid-version, malformed-JSON, request-size, method and CORS checks

Every run rewrites `artifacts/mcp-smoke.json` with SDK/protocol versions, timestamps, recorded real HTTP requests/responses, the deliberate response-drop marker, assertions and security outcomes. The two response-loss cases are intentionally labeled to distinguish a simulated supplier failure from a discarded MCP response. Test fixtures call `engine.approve` directly only inside the test process; no MCP approval endpoint is created.

## Official references checked

- [TypeScript SDK v1 overview and installation](https://ts.sdk.modelcontextprotocol.io/)
- [SDK server and transport guidance](https://ts.sdk.modelcontextprotocol.io/server)
- [Official stateless Streamable HTTP example](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts)
- [Official Node HTTP transport implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/streamableHttp.ts)
- [MCP 2025-11-25 transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official client guidance](https://ts.sdk.modelcontextprotocol.io/client)

## Concise proof for evaluation

Run `npm run demo:proof` to exercise the actual app and official MCP client in one execution context. It records handshake, denied unapproved execution, a separate synthetic HTTP approval fixture, supplier response loss, file-backed reconstruction, reconciliation, repeated execution and quote-change invalidation. Read `artifacts/demo-transcript.txt` or `artifacts/demo-proof.json`. The automated fixture is not a real person's approval, and this transcript is not a demo video.
