# Recovery engine contract

This is a deterministic, dependency-free Node 24 ESM simulation. All companies, booking references and prices are fictional. No API, payment, network access, credential, real booking or cancellation is involved.

## Exports and calls

- `src/engine.mjs`: `RecoveryEngine`, `RecoveryError`
- `src/fixtures.mjs`: `createInitialState`, `DEFAULT_CONSTRAINTS`, `SCENARIO_ID`
- All methods are synchronous and return a deep-cloned full state
- `new RecoveryEngine({ filePath? })`: omitted path keeps the demo in memory; supplied path loads existing state or atomically saves a new fixture
- `getState()`
- `plan({ budget?, latestArrival?, accessibility? } = {})`
- `approve({ planVersion, maxTotal })`
- `execute({ planVersion })`
- `inject({ kind: 'transport-timeout' | 'price-change' | 'sold-out' | 'none' })`
- `reset()` restores only this fictional demo's initial state

Typical sequence:

```js
const engine = new RecoveryEngine({ filePath: './data/recovery.json' });
const { plan } = engine.plan({ budget: 300, latestArrival: '01:00' });
engine.approve({ planVersion: plan.version, maxTotal: plan.total });
engine.inject({ kind: 'transport-timeout' });
engine.execute({ planVersion: plan.version }); // needs-retry
engine.execute({ planVersion: plan.version }); // completed; no duplicate
```

Malformed inputs throw `RecoveryError` with `name`, `code`, `message`, `statusCode`. Normal authorization/feasibility failures return state with `execution.status: 'blocked'` and `execution.lastError: { code, message }`. The server can serialize returned states directly. Do not present all returned blocked states as successful execution.

## Fixed scenario

All times are Los Angeles local time, UTC−07:00, October 22–23, 2026.

- Planning time: Oct 22 20:40 at SFO departures
- Cancelled PA410: SFO → LAX, originally departing 21:10
- Existing entitlement ENT-410 remains preserved
- Existing prepaid hotel HTL-7721: Harbor House Los Angeles, original check-in Oct 22, two-night booking; $218 is already paid and excluded from incremental spending
- Existing hotel's late-arrival deadline: Oct 23 00:00
- Step 1: preserve that reservation and guarantee late arrival through 02:00 for $0
- Step 2: rebook PA522, 22:25 → 23:55, with a $186 fare difference
- Step 3: LAX → hotel transfer, 00:10 → 00:45, $48
- Default total: $234 incremental USD
- Default cap: $300; latest arrival: 01:00
- Minimum departure lead: 45 minutes; minimum flight-to-pickup gap: 15 minutes
- Wheelchair-accessibility requirement selects a $68 accessible transfer: total $254

The coherent route is chosen by the lowest total among feasible candidates. Constraints are hard limits. No feasible candidate means no actionable steps and no supplier mutation.

Alternative fixtures demonstrate why the cheapest isolated flight is not necessarily usable:

| Flight | Departure → arrival | Hotel arrival | Incremental total | Default result |
|---|---|---|---|---|
| PA522 | 22:25 → 23:55 | 00:45 | $234 | Selected |
| PA508 | 21:35 → 23:05 | 23:55 | $358 | Over budget |
| PA548 | 23:15 → 00:45 | 01:35 | $196 | Too late |
| PA496 | 21:00 → 22:30 | 23:20 | $168 | Departure cutoff missed |

`latestArrival` accepts `HH:mm` or ISO with an explicit timezone. A wall-clock time at or before 20:40 refers to the following calendar day. Other wall-clock times refer to the planning day. Only this fixed fictional scenario is supported.

## UI state

```js
{
  schemaVersion: 1,
  scenario: { id, mode: 'simulation', title, now, timezone, origin, destination,
    destinationCity, travelerLocation, originalFlight, hotelName,
    hotelArrivalDeadline, hotelProtectedUntil, currency, notice },
  providers: { airline, ground, hotel },
  constraints: { budget, latestArrival, accessibility,
    minDepartureLeadMinutes, minGroundConnectionMinutes },
  plan: null | { version, status: 'ready' | 'blocked', total, currency,
    arrivalAt, selectedOptionId, steps, alternatives, reasons,
    preserved, constraintChecks },
  approval: null | { planVersion, maxTotal, status: 'approved' | 'invalidated',
    approvedAt, reason },
  execution: { status, steps, lastError, completedAt },
  events: [{ id, at, type, title, detail, ...context }],
  fault: { kind, consumed },
  _meta: { nextPlanVersion, eventSequence }
}
```

Execution statuses: `idle`, `ready`, `running`, `needs-retry`, `blocked`, `completed`. Step statuses: `pending`, `confirmed`, `unknown`.

Plan step fields:

```js
{ id: 'hotel' | 'flight' | 'ground', provider: 'hotel' | 'airline' | 'ground',
  title, description, amount, currency, optionId, scheduledAt, arrivalAt?,
  quoteVersion, idempotencyKey, status }
```

Execution step fields:

```js
{ id, title, status, attempts, reference, receipt, idempotencyKey }
```

`receipt` is null until the client has a confirmed outcome. It then includes the provider reference, amount, currency, idempotency key and originating approval. A lost-response provider booking exists in `providers.ground.bookings` while its client execution step remains `unknown` with no receipt. This distinction is intentional.

Alternative fields:

```js
{ id, label,
  flight: { id, label, departureAt, arrivalAt, amount, available, accessible },
  ground: { id, label, amount, available, accessible, durationMinutes },
  pickupAt, arrivalAt, total, currency, eligible, reasons: [] }
```

Constraint check fields: `{ label, passed, detail }`. They describe feasibility of the plan; hotel protection is not committed until execute is approved.

Providers have `id`, `name`, `mode`, `version`, `requests`, `reconciliationRequests`.

- Airline additionally has `entitlement`, `offers`, `bookings`
- Ground additionally has `offers`, `bookings`
- Hotel additionally has the unchanged original `reservation` and a `protections` array
- `requests` counts actual simulated create/update requests; reconciliation lookups count separately

## Safety, retry and persistence

1. Planning and approval do not mutate provider reservations. Execute requires approval for the current exact plan version and within the budget and approval cap.
2. Replanning increments the version and invalidates the old approval, even if the price is unchanged.
3. `price-change` raises the selected transfer quote by $35 and increments its provider revision. `sold-out` marks the selected flight unavailable and increments its provider revision. Affected uncommitted approvals invalidate immediately. Replanning and fresh approval are required.
4. `transport-timeout` arms the next new ground booking to commit durably, then lose its response once. Hotel and flight remain confirmed. The client sees `needs-retry`, not false success.
5. Retry first looks up an existing booking by a stable scenario/step/offer idempotency key. It reports `booking.reconciled`; it does not send another create request or duplicate charge.
6. Every consequential mutation is saved by a temporary JSON file, file fsync and atomic rename. Process restart restores approvals, supplier state, unknown outcomes, keys and events. A persistence failure rolls back that in-memory mutation and prevents further execution. An unreadable or corrupt state file is reported instead of overwritten.
7. Existing confirmed commitments retain their booked price and availability if offer fixtures later change. Replanning never cancels or swaps them. Both original ticket entitlement and the prepaid destination reservation remain intact on every path.
8. Repeated execute after completion is a no-op. Replanning after partial completion preserves confirmed steps, and reconciliation reuses committed bookings.
9. `inject({kind:'none'})` disarms future faults; it does not undo prior quote or availability changes. Reset starts over.

The persistence model is deliberately single-process/single-engine. It provides application crash recovery, not distributed concurrency control or a production transaction coordinator. Multiple processes must not share the same state file. The clock is fixed for reproducibility; this prototype does not claim production inventory holds or real-world timing guarantees.

## Verification

Run `node --test tests/engine.test.mjs` from the project root. Tests cover coherent timing and alternatives, no action before approval, approval versions and spending caps, price and availability invalidation, accessibility, infeasible constraints, repeat-safe recovery after timeout, same-process engine reconstruction from disk, repeated execution, protected reservations, deterministic traces, rollback on persistence failure, reset, malformed inputs and corrupt-state refusal.

A separate actual-process check is available with `npm run proof:crash` and `tests/process-recovery.test.mjs`. It starts the real CLI, saves a synthetic unknown outcome, kills that server process with SIGKILL, starts a different process from the same state file and reconciles without another booking. This is process-crash evidence, not a power-loss or multi-process concurrency guarantee.
