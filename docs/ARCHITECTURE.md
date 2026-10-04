# Architecture and safety boundaries

## Flow

Browser / MCP client → local HTTP service → shared RecoveryEngine → three stateful in-process supplier simulators → atomic JSON checkpoint.

The model-facing interface can inspect, plan, and execute. Human approval lives outside the MCP tool surface. Execution still checks the approval version, price snapshot, spending limit, provider availability, and existing commitments on the server.

## Planning

The engine computes the combined fare difference and transfer cost. It checks the fixture's minimum departure lead, airport transfer connection, hotel-arrival deadline, late-arrival guarantee, budget, and accessible-vehicle preference. It evaluates multiple flight options and records failed constraints. It chooses the lowest-cost eligible itinerary. Changing a constraint creates a new monotonically increasing plan version and requires fresh approval.

## Execution order

1. Protect the existing prepaid hotel room for late arrival
2. Rebook the selected flight against the protected original ticket entitlement
3. Book the last transfer to that same hotel

No cancellation operation exists. Each step is checkpointed independently. Partial success is retained, not undone by an automatic compensating cancellation. A failed or infeasible replan retains earlier receipts and unknown outcomes.

## Unknown outcomes

The timeout injection is intentionally stronger than a failure before creation. The ground supplier creates and persists a booking, then loses the simulated response. Execution pauses with an unknown outcome. On resume, the same idempotency key is used to reconcile the existing supplier record before creating anything. The normal and interrupted flows therefore both produce one booking per paid supplier.

## Persistence

Every mutation snapshots the previous in-memory state, writes the updated state to a private temporary JSON file, fsyncs that file, and atomically renames it. A failed save rolls back the in-memory mutation. Restart restores the saved state. Corrupt state is refused rather than silently overwritten.

This is a single-process demonstration. It has no cross-process lock, database transaction isolation, shared tenancy, independent supplier transaction store, or power-loss guarantee beyond the local filesystem operations. Real provider idempotency and reconciliation would be required for real-world exactly-once effects. We claim repeat-safe synthetic execution, not distributed exactly-once delivery.

## Security

- Server listens on loopback only
- Static asset paths are explicitly allowlisted; source/runtime files are not served
- REST mutation requests require JSON, have a 16 KB cap, and reject cross-origin browser origins
- Script and network policies restrict browser resources to this server
- Provider text is escaped before insertion into HTML
- No secrets are read, stored, embedded, or sent
- No outbound travel/AI requests are made
- A real deployment would need independent identity, authorization, CSRF/session controls, rate limiting, audit retention, and tested multi-user isolation

## Time and evidence

Scenario time is fixed at 20:40 PDT on October 22, 2026. Event timestamps advance synthetically for deterministic replay. They do not claim to represent current travel conditions. Evidence exports separately include a real export timestamp and an explicit synthetic-data disclosure.
