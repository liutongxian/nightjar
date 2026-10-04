# Verification report

Date: 2026-10-02. Environment: assistant cloud workspace, Node.js 24.19.0. Synthetic data only.

## Passed

- `npm run lint`: project-specific JavaScript syntax and limited security checks; this is not ESLint or a comprehensive security audit
- `npm run typecheck`: TypeScript checkJs across server, engine, MCP integration, browser code, and shared contract; non-strict configuration
- `npm test`: 48 tests reported by Node's test runner, zero failures
  - 21 engine tests: cross-provider constraints, approval gate, stale versions, price/availability changes, accessibility, no feasible plan, ordered execution, unknown outcomes, restart, duplicate prevention, save rollback, protected reservations, reset replay prevention, retained execution history
  - 1 actual CLI process recovery test: forced SIGKILL after a saved unknown outcome, different process ID on restart, one transfer creation and one reconciliation lookup
  - 8 HTTP tests: product route, end-to-end flow, evidence export, timeout recovery, stale approvals, validation, request-origin/body limits, private-file isolation and Host validation
  - 11 browser-DOM integration tests using jsdom and real HTTP: review/approval, cancel/back, changed constraints, page reconstruction after unknown outcome, price refresh, blocked routes, reset, text escaping, proposed-vs-confirmed wording, same-night labels, pending-input locking, and recovery after a discarded successful HTTP response
  - 7 MCP tests counted by Node (one parent with six subtests): official SDK initialize/list/call, shared mounted app state, out-of-band approval boundary, strict schemas, supplier-response loss, discarded completed HTTP response, and transport security
- Official SDK 1.31.0 negotiated MCP 2025-11-25 over actual loopback Streamable HTTP
- `npm run smoke`: file-backed engine reconstructed in the same process after an unknown ground outcome and reconciled with exactly one create request per provider
- `npm run proof:crash`: actual server process was killed with SIGKILL; a different process restored the state and completed without duplicate creation
- A fresh `npm ci --ignore-scripts` from the recovered lockfile installed 133 packages successfully in the new cloud workspace
- `npm run preview:export`: standalone HTML built from actual page code and state, with all controls disabled
- Actual CLI entrypoint started as a subprocess; health and MCP initialization checked within the same execution context, then the process was stopped

## Evidence

- `artifacts/check.log`: aggregate check output
- `artifacts/test-results.tap`: reproducible TAP test report
- `artifacts/mcp-smoke.json`: actual HTTP exchanges and transport-boundary checks; supplier results are synthetic
- `artifacts/recovery-smoke.json`: before/after restart state, provider counters, receipts, and event trace
- `artifacts/entrypoint-smoke.json`: actual CLI startup, health, and MCP initialization checks
- `artifacts/process-crash-proof.json`: two distinct process IDs, forced exit signal, restored unknown outcome and duplicate-free reconciliation
- `artifacts/demo-proof.json` and `artifacts/demo-transcript.txt`: concise actual MCP proof with explicitly automated synthetic approvals
- `artifacts/nightjar-preview.html`: self-contained read-only DOM export; not a screenshot

## Blocked or not tested

Persistent reachability across separate tool execution contexts was not established. The available cloud browser rejected the app's loopback URL with ERR_BLOCKED_BY_CLIENT and its URL policy. No alternate network path, public tunnel, or deployment was used. Therefore these remain unverified:

- Real browser rendering and screenshots
- Mobile viewport layout and overflow
- Native dialog keyboard focus, Escape, tab order and screen-reader behavior
- Visual contrast and enlarged-text layout
- Cross-browser compatibility

jsdom is a DOM implementation, not a rendering browser. Its passing tests do not establish any of the visual claims above.

Also untested or outside current scope:

- Actual Alexa device/account/SDK integration or live voice input
- LLM-based language understanding or external AI requests
- Live airline, hotel, ground-transport, payment, cancellation or refund behavior
- Real users, multi-process concurrency, authentication and production security
- MCP interoperability with every client or Alexa itself
- Contest eligibility, submission acceptance, prize payout, public deployment, public repository and video recording

## Fixed review findings

1. Reset reused prior plan versions. Versions now remain monotonic across reset and restart; delayed approvals/executions are rejected.
2. An infeasible replan hid earlier receipts and an unknown supplier outcome. Execution history remains available and can be reconciled once a feasible plan is restored.
3. UI treated an older invalidated approval as blocking every subsequent plan. It now checks the invalidation's version before deciding whether approval is possible.

This is a verified local software prototype within the stated test boundaries, not a production agent or a certified contest-ready submission.

## Public source preparation, 2026-10-04

The release adds MIT license metadata and updates publication documentation. Historical output above remains dated 2026-10-02; it is not a new 48-test run. Absolute private execution paths in check.log and test-results.tap were replaced by `<project-root>` without changing their recorded outcomes. The lockfile dependency graph is unchanged; its root license metadata is now MIT, so its byte hash differs from the historical reproducibility snapshot.
