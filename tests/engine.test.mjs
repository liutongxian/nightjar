import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecoveryEngine, RecoveryError } from '../src/engine.mjs';
import { createInitialState } from '../src/fixtures.mjs';

function planned(input) {
  const engine = new RecoveryEngine();
  engine.plan(input);
  return engine;
}
function approved(engine = planned()) {
  const { plan } = engine.getState();
  engine.approve({ planVersion: plan.version, maxTotal: plan.total });
  return engine;
}
function committedCount(state) {
  return state.providers.airline.bookings.length + state.providers.ground.bookings.length + state.providers.hotel.protections.length;
}
function assertProtected(state) {
  assert.equal(state.providers.airline.entitlement.status, 'preserved');
  assert.equal(state.providers.hotel.reservation.id, 'HTL-7721');
  assert.equal(state.providers.hotel.reservation.status, 'confirmed');
  assert.equal(state.providers.hotel.reservation.prepaid, true);
  assert.equal(state.providers.hotel.reservation.originalAmount, 218);
}

// A plan is a coherent itinerary, rather than independent cheap component picks.
test('default plan respects all cross-provider timing and cost constraints', () => {
  const state = planned().getState();
  assert.equal(state.plan.status, 'ready');
  assert.equal(state.plan.total, 234);
  assert.equal(state.plan.selectedOptionId, 'PA522');
  assert.equal(state.plan.arrivalAt, '2026-10-23T00:45:00-07:00');
  assert.deepEqual(state.plan.steps.map((step) => step.id), ['hotel', 'flight', 'ground']);
  assert.equal(state.plan.steps[1].amount, 186);
  assert.equal(state.plan.steps[2].scheduledAt, '2026-10-23T00:10:00-07:00');
  assert.equal(Date.parse(state.plan.steps[2].scheduledAt) - Date.parse(state.plan.steps[1].arrivalAt), 15 * 60_000);
  assert.equal(committedCount(state), 0);
});

test('alternatives explain budget, hotel deadline, and missed airport cutoff', () => {
  const { alternatives } = planned().getState().plan;
  assert.match(alternatives.find((option) => option.id === 'PA508').reasons.join(), /budget/);
  assert.match(alternatives.find((option) => option.id === 'PA548').reasons.join(), /latest hotel arrival/);
  assert.match(alternatives.find((option) => option.id === 'PA496').reasons.join(), /45-minute/);
});

test('no provider is mutated by execute without matching explicit approval', () => {
  const engine = planned();
  const providers = engine.getState().providers;
  const state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'blocked');
  assert.equal(state.execution.lastError.code, 'APPROVAL_REQUIRED');
  assert.deepEqual(state.providers, providers);
});

test('successful execution protects hotel first and preserves original entitlements', () => {
  const state = approved().execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'completed');
  assert.equal(committedCount(state), 3);
  assert.deepEqual(state.events.filter((event) => event.type === 'booking.confirmed').map((event) => event.stepId), ['hotel', 'flight', 'ground']);
  assert.equal(state.providers.hotel.reservation.lateArrivalProtectedUntil, '2026-10-23T02:00:00-07:00');
  assert.equal(state.execution.steps.every((step) => step.status === 'confirmed' && step.receipt?.reference), true);
  assertProtected(state);
});

test('approval is version-bound, and replanning invalidates the old approval', () => {
  const engine = approved();
  engine.plan({ budget: 400 });
  let state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.lastError.code, 'STALE_PLAN');
  assert.equal(state.approval.status, 'invalidated');
  state = engine.execute({ planVersion: 2 });
  assert.equal(state.execution.lastError.code, 'APPROVAL_REQUIRED');
  assert.equal(committedCount(state), 0);
});

test('spending authorization must cover the exact plan and stay in budget', () => {
  const engine = planned();
  assert.equal(engine.approve({ planVersion: 1, maxTotal: 233 }).execution.lastError.code, 'APPROVAL_LIMIT');
  assert.equal(engine.approve({ planVersion: 1, maxTotal: 301 }).execution.lastError.code, 'APPROVAL_LIMIT');
  assert.equal(committedCount(engine.execute({ planVersion: 1 })), 0);
  assert.equal(engine.approve({ planVersion: 1, maxTotal: 234 }).approval.maxTotal, 234);
});

test('changed prices invalidate approval even when the new total is under budget', () => {
  const engine = approved();
  engine.inject({ kind: 'price-change' });
  let state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'blocked');
  assert.equal(state.approval.status, 'invalidated');
  assert.equal(committedCount(state), 0);
  state = engine.plan();
  assert.equal(state.plan.total, 269);
  assert.equal(state.plan.version, 2);
  assert.equal(engine.execute({ planVersion: 2 }).execution.lastError.code, 'APPROVAL_REQUIRED');
  approved(engine);
  state = engine.execute({ planVersion: 2 });
  assert.equal(state.execution.status, 'completed');
  assert.equal(state.providers.ground.bookings[0].amount, 83);
});

test('sold-out flight blocks execution; explicit relaxed budget enables a different plan', () => {
  const engine = approved();
  engine.inject({ kind: 'sold-out' });
  assert.equal(engine.execute({ planVersion: 1 }).execution.status, 'blocked');
  assert.equal(engine.plan().plan.status, 'blocked');
  const state = engine.plan({ budget: 400 });
  assert.equal(state.plan.selectedOptionId, 'PA508');
  assert.equal(state.plan.total, 358);
  assert.equal(committedCount(state), 0);
  assertProtected(state);
});

test('accessibility is enforced end-to-end and the accessible transfer is priced', () => {
  const state = planned({ accessibility: true }).getState();
  assert.equal(state.plan.total, 254);
  assert.equal(state.plan.steps[2].optionId, 'accessible');
  const selected = state.plan.alternatives.find((option) => option.eligible);
  assert.equal(selected.flight.accessible, true);
  assert.equal(selected.ground.accessible, true);
});

test('HH:mm latest arrival handles midnight; unsatisfiable constraints never authorize action', () => {
  const engine = planned({ latestArrival: '02:00', budget: 210 });
  assert.equal(engine.getState().plan.selectedOptionId, 'PA548');
  assert.equal(engine.getState().constraints.latestArrival, '2026-10-23T02:00:00-07:00');
  const blocked = engine.plan({ budget: 100 });
  assert.equal(blocked.plan.status, 'blocked');
  assert.equal(blocked.plan.total, null);
  assert.equal(engine.approve({ planVersion: 2, maxTotal: 100 }).execution.status, 'blocked');
  assert.equal(committedCount(engine.execute({ planVersion: 2 })), 0);
});

test('lost transport response commits once, retry reconciles by idempotency key', () => {
  const engine = approved();
  engine.inject({ kind: 'transport-timeout' });
  let state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'needs-retry');
  assert.equal(state.execution.steps[2].status, 'unknown');
  assert.equal(state.execution.steps[2].reference, null);
  assert.equal(state.providers.ground.bookings.length, 1);
  assert.equal(state.providers.ground.requests, 1);
  assertProtected(state);
  state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'completed');
  assert.equal(state.providers.ground.bookings.length, 1);
  assert.equal(state.providers.ground.requests, 1);
  assert.equal(state.providers.ground.reconciliationRequests, 1);
  assert.equal(state.execution.steps[2].reference, 'GR-REC-0001');
  assert.equal(state.providers.hotel.requests, 1);
  assert.equal(state.providers.airline.requests, 1);
  assert.equal(state.events.some((event) => event.type === 'booking.reconciled'), true);
});

test('engine reconstruction from disk restores unknown outcome and safely finishes the chain', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-engine-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'recovery.json');
  const engine = new RecoveryEngine({ filePath });
  engine.plan(); approved(engine); engine.inject({ kind: 'transport-timeout' });
  engine.execute({ planVersion: 1 });
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(saved.execution.status, 'needs-retry');
  assert.equal(saved.providers.ground.bookings.length, 1);
  const restarted = new RecoveryEngine({ filePath });
  assert.deepEqual(restarted.getState(), saved);
  const state = restarted.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'completed');
  assert.equal(committedCount(state), 3);
  assert.equal(state.providers.ground.requests, 1);
  assert.deepEqual(new RecoveryEngine({ filePath }).getState(), state);
});

test('repeated execute clicks are a no-op after completion', () => {
  const engine = approved();
  const completed = engine.execute({ planVersion: 1 });
  assert.deepEqual(engine.execute({ planVersion: 1 }), completed);
  assert.deepEqual(engine.execute({ planVersion: 1 }), completed);
});

test('supplier changes cannot change committed prices or duplicate recovered bookings', () => {
  const engine = approved();
  engine.inject({ kind: 'transport-timeout' }); engine.execute({ planVersion: 1 });
  engine.inject({ kind: 'price-change' });
  engine.inject({ kind: 'sold-out' });
  const state = engine.execute({ planVersion: 1 });
  assert.equal(state.execution.status, 'completed');
  assert.equal(state.providers.ground.bookings[0].amount, 48);
  assert.equal(state.providers.airline.bookings[0].amount, 186);
  assert.equal(committedCount(state), 3);
  assertProtected(state);
});

test('public state is detached; fixture and execution traces are deterministic', () => {
  const engine = planned();
  const copy = engine.getState();
  copy.providers.airline.offers[0].amount = 0;
  copy.plan.total = 0;
  assert.equal(engine.getState().plan.total, 234);
  assert.equal(engine.getState().providers.airline.offers[0].amount, 186);
  assert.deepEqual(approved().execute({ planVersion: 1 }), approved().execute({ planVersion: 1 }));
  const fixture = createInitialState(); fixture.providers.ground.offers[0].amount = 999;
  assert.equal(createInitialState().providers.ground.offers[0].amount, 48);
});

test('persistence failure rolls in-memory state back before any step can proceed', () => {
  const engine = approved();
  const before = engine.getState();
  engine._persist = () => { throw new RecoveryError('PERSISTENCE_FAILED', 'Injected disk failure', 500); };
  assert.throws(() => engine.execute({ planVersion: 1 }), { code: 'PERSISTENCE_FAILED' });
  assert.deepEqual(engine.getState(), before);
  assert.equal(committedCount(engine.getState()), 0);
});

test('reset clears the demo and invalid inputs cannot silently alter state', () => {
  const engine = approved();
  engine.execute({ planVersion: 1 });
  const initial = createInitialState();
  initial._meta.nextPlanVersion = engine.getState()._meta.nextPlanVersion;
  assert.deepEqual(engine.reset(), initial);
  for (const value of [-1, NaN, '300', Infinity]) assert.throws(() => engine.plan({ budget: value }), { code: 'INVALID_BUDGET' });
  assert.throws(() => engine.plan({ latestArrival: 'tomorrow' }), { code: 'INVALID_ARRIVAL' });
  assert.throws(() => engine.plan({ accessibility: 'yes' }), { code: 'INVALID_ACCESSIBILITY' });
  assert.throws(() => engine.approve({ planVersion: 1 }), { code: 'INVALID_APPROVAL' });
  assert.throws(() => engine.inject({ kind: 'unknown' }), { code: 'INVALID_FAULT' });
  assert.deepEqual(engine.getState(), initial);
});

test('reset preserves unique plan versions and rejects delayed approvals and execution', () => {
  const engine = approved();
  const oldApproval = { planVersion: 1, maxTotal: 234 };
  engine.reset();
  const replanned = engine.plan({ latestArrival: '02:00' });
  assert.equal(replanned.plan.version, 2);
  assert.equal(replanned.plan.total, 196);
  assert.equal(engine.approve(oldApproval).execution.lastError.code, 'STALE_PLAN');
  assert.equal(engine.getState().approval, null);
  assert.equal(engine.execute({ planVersion: 1 }).execution.lastError.code, 'STALE_PLAN');
  assert.equal(engine.execute({ planVersion: 2 }).execution.lastError.code, 'APPROVAL_REQUIRED');
  assert.equal(committedCount(engine.getState()), 0);
  approved(engine);
  assert.equal(engine.execute({ planVersion: 2 }).execution.status, 'completed');
});

test('reset plan-version boundary survives persistence and restart', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-reset-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'recovery.json');
  const engine = new RecoveryEngine({ filePath });
  engine.plan(); approved(engine);
  engine.reset();
  const restarted = new RecoveryEngine({ filePath });
  assert.equal(restarted.plan().plan.version, 2);
  assert.equal(restarted.approve({ planVersion: 1, maxTotal: 234 }).execution.lastError.code, 'STALE_PLAN');
  assert.equal(committedCount(restarted.getState()), 0);
});

test('corrupt persisted state is reported rather than silently overwriting commitments', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recovery-corrupt-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'recovery.json');
  writeFileSync(filePath, '{ broken');
  assert.throws(() => new RecoveryEngine({ filePath }), { code: 'INVALID_PERSISTED_STATE' });
  assert.equal(readFileSync(filePath, 'utf8'), '{ broken');
});


test('infeasible replan preserves confirmed receipts and an unknown ground outcome', () => {
  const engine = approved();
  engine.inject({ kind: 'transport-timeout' });
  const interrupted = engine.execute({ planVersion: 1 });
  const blocked = engine.plan({ budget: 100 });
  assert.equal(blocked.plan.status, 'blocked');
  assert.deepEqual(blocked.plan.steps, []);
  assert.equal(blocked.execution.status, 'blocked');
  assert.equal(blocked.execution.lastError.code, 'NO_FEASIBLE_PLAN');
  assert.deepEqual(blocked.execution.steps, interrupted.execution.steps);
  assert.deepEqual(blocked.execution.steps.map((step) => step.status), ['confirmed', 'confirmed', 'unknown']);
  assert.equal(blocked.execution.steps[0].receipt.reference, 'HT-REC-0001');
  assert.equal(blocked.execution.steps[1].receipt.reference, 'FL-REC-0001');
  assert.equal(blocked.execution.steps[2].receipt, null);
  assert.equal(committedCount(blocked), 3);
  const restored = engine.plan({ budget: 300 });
  assert.equal(restored.plan.version, 3);
  assert.deepEqual(restored.execution.steps, interrupted.execution.steps);
  approved(engine);
  const completed = engine.execute({ planVersion: 3 });
  assert.equal(completed.execution.status, 'completed');
  assert.equal(completed.providers.ground.requests, 1);
  assert.equal(completed.providers.ground.reconciliationRequests, 1);
  assert.equal(committedCount(completed), 3);
});
