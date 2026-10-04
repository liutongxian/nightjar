# Nightjar evaluation guide

Nightjar is a local-only, synthetic travel-recovery prototype with an actual MCP server. There are no reviewer credentials, paid API calls or live bookings. The recorded automated approval decisions are fixtures; manual UI approval can be demonstrated once a supported rendered browser is available.

## Reproduce the software checks

Use Node.js 24.19.0, the previously verified version, in the project directory. The lockfile includes jsdom 30.1.1, which needs Node 24.15.0 or later on the Node 24 line; do not use an early 24.x release for the full test suite.

1. Run npm ci --ignore-scripts. If the execution environment has an unavailable default cache, add --cache /tmp/nightjar-npm-cache.
2. Run npm run check. The current report records 48 passing tests.
3. Run npm run demo:proof. It starts the real HTTP app and official MCP client in one execution context and exits after verification. Read artifacts/demo-transcript.txt or artifacts/demo-proof.json.
4. Run npm run proof:crash for a separate forced-exit test of the actual CLI process. A different server process resumes the saved unknown outcome without a duplicate booking.
5. Run npm run smoke for a smaller same-process engine reconstruction check.

## Inspect the working application

Run npm start and open http://127.0.0.1:4173 in a browser in the same supported execution environment. It binds only to loopback. Do not infer a public hosted site or an accessible remote preview from this address.

The development cloud browser currently blocks this route. No screenshot or visual acceptance is claimed. artifacts/nightjar-preview.html is a disabled, read-only HTML export from the page's DOM, not an image of a verified browser rendering.

## Manual scenario sequence

1. Find the default plan at $300 and 01:00. Check $234, 00:45 and the proposed hotel hold. No supplier has changed.
2. Open approval and cancel. Nothing executes. Open again, check the consent box and approve.
3. Select Ground booking response lost and inject it. Run the approved simulation. Hotel and flight receipts are confirmed; the ground outcome is unknown.
4. Reload the page or restart the application with the same state file. Continue reconciliation. Expect one ground create request and one lookup, not a second booking.
5. Reset. Build and approve again. Inject Transfer price changes. The old approval becomes invalid even though the new total remains below $300. Refresh and review the $269 plan.
6. Test $100 or an early arrival deadline. An infeasible result must show reasons instead of authorizing an unsuitable itinerary.

## High-value code paths

- src/engine.mjs: constraint selection, quote/approval checks, ordered supplier actions and persistence
- src/mcp.mjs: official SDK transport, strict input schemas, loopback safety and tools without approval capability
- tests/engine.test.mjs: restart, unknown outcomes, stale approvals, reset replay and persistence failures
- tests/mcp.test.mjs: real transport exchanges, discarded HTTP response and shared app state
- tests/ui.test.mjs: actual DOM controls, pending-request locking and recoverable response loss

## What the evidence proves

The evidence demonstrates the implemented protocol, local logic and synthetic supplier state. It does not establish real Alexa compatibility, live inventory, payment safety, production authorization, customer demand or actual traveller outcomes. The fictional airport connection time is not travel advice.
