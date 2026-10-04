import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInitialState } from './fixtures.mjs';

const clone = (value) => structuredClone(value);
const money = (value) => Math.round(value * 100) / 100;
const minutes = (value) => value * 60_000;
const localTime = (timestamp) => new Date(timestamp - minutes(7 * 60)).toISOString().replace('.000Z', '-07:00');
const addMinutes = (iso, count) => localTime(Date.parse(iso) + minutes(count));
const STEP_IDS = ['hotel', 'flight', 'ground'];

export class RecoveryError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'RecoveryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Single-process simulation engine. Every method is synchronous and returns a cloned state. */
export class RecoveryEngine {
  /** @param {{filePath?:string}} [options] */
  constructor({ filePath } = {}) {
    this.filePath = filePath ? resolve(filePath) : null;
    if (this.filePath && existsSync(this.filePath)) {
      try {
        this.state = JSON.parse(readFileSync(this.filePath, 'utf8'));
        if (this.state.schemaVersion !== 1 || !this.state.providers || !this.state._meta) throw new Error('Unsupported state');
      } catch (error) {
        throw new RecoveryError('INVALID_PERSISTED_STATE', `Cannot load recovery state: ${error.message}`, 500);
      }
    } else {
      this.state = createInitialState();
      this._persist();
    }
  }

  getState() { return clone(this.state); }

  _persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    let fd;
    try {
      fd = openSync(temporary, 'w', 0o600);
      writeFileSync(fd, JSON.stringify(this.state, null, 2));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, this.filePath);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temporary); } catch { /* No temporary file remains. */ }
      throw new RecoveryError('PERSISTENCE_FAILED', `Recovery state was not committed: ${error.message}`, 500);
    }
  }

  _commit(mutation) {
    const before = clone(this.state);
    try { mutation(); this._persist(); }
    catch (error) { this.state = before; throw error; }
  }

  _event(type, title, detail, extra = {}) {
    const sequence = ++this.state._meta.eventSequence;
    const at = localTime(Date.parse(this.state.scenario.now) + (sequence - 1) * 1000);
    this.state.events.push({ id: `evt-${sequence}`, at, type, title, detail, ...extra });
    return at;
  }

  _inputConstraints(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecoveryError('INVALID_CONSTRAINTS', 'Constraints must be an object.');
    const result = { ...this.state.constraints };
    if (input.budget !== undefined) {
      if (!Number.isFinite(input.budget) || input.budget < 0 || input.budget > 100_000) throw new RecoveryError('INVALID_BUDGET', 'Budget must be a number between 0 and 100000 USD.');
      result.budget = money(input.budget);
    }
    if (input.accessibility !== undefined) {
      if (typeof input.accessibility !== 'boolean') throw new RecoveryError('INVALID_ACCESSIBILITY', 'Accessibility must be true or false.');
      result.accessibility = input.accessibility;
    }
    if (input.latestArrival !== undefined) {
      let value = input.latestArrival;
      if (typeof value !== 'string') throw new RecoveryError('INVALID_ARRIVAL', 'Latest arrival must be HH:mm or an ISO timestamp.');
      if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        const date = value > '20:40' ? '2026-10-22' : '2026-10-23';
        value = `${date}T${value}:00-07:00`;
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new RecoveryError('INVALID_ARRIVAL', 'Latest arrival must be HH:mm or a valid ISO timestamp with timezone.');
      if (Date.parse(value) < Date.parse(this.state.scenario.now)) throw new RecoveryError('INVALID_ARRIVAL', 'Latest arrival must be after the scenario planning time.');
      result.latestArrival = value;
    }
    return result;
  }

  _key(step, optionId) { return `${this.state.scenario.id}:${step}:${optionId}`; }

  _booking(step) {
    if (step === 'hotel') return this.state.providers.hotel.protections[0];
    return this.state.providers[step === 'flight' ? 'airline' : 'ground'].bookings[0];
  }

  _candidates(constraints) {
    const { airline, ground } = this.state.providers;
    const bookedFlight = this._booking('flight');
    const bookedGround = this._booking('ground');
    const groundOffer = bookedGround ? clone(bookedGround.offer) : ground.offers.find((offer) => offer.id === (constraints.accessibility ? 'accessible' : 'standard'));
    return airline.offers.map((offer) => {
      const flight = bookedFlight?.optionId === offer.id ? clone(bookedFlight.offer) : clone(offer);
      const pickupAt = bookedGround?.pickupAt ?? addMinutes(flight.arrivalAt, constraints.minGroundConnectionMinutes);
      const arrivalAt = bookedGround?.arrivalAt ?? addMinutes(pickupAt, groundOffer.durationMinutes);
      const total = money(flight.amount + groundOffer.amount);
      const reasons = [];
      if (bookedFlight && bookedFlight.optionId !== flight.id) reasons.push('Existing confirmed rescue flight must be retained');
      if (!flight.available) reasons.push('Flight is sold out');
      if (!groundOffer.available) reasons.push('Ground transfer is unavailable');
      if (Date.parse(flight.departureAt) < Date.parse(this.state.scenario.now) + minutes(constraints.minDepartureLeadMinutes)) reasons.push('Misses the 45-minute airport departure cutoff');
      if (Date.parse(arrivalAt) > Date.parse(constraints.latestArrival)) reasons.push('Arrives after your latest hotel arrival');
      if (Date.parse(arrivalAt) > Date.parse(this.state.scenario.hotelProtectedUntil)) reasons.push('Arrives after the hotel can hold your room');
      if (total > constraints.budget) reasons.push(`Exceeds budget by $${money(total - constraints.budget)}`);
      if (constraints.accessibility && (!flight.accessible || !groundOffer.accessible)) reasons.push('Does not meet wheelchair-accessibility requirement');
      return { id: flight.id, label: flight.label, flight, ground: clone(groundOffer), pickupAt, arrivalAt, total, currency: 'USD', eligible: !reasons.length, reasons };
    });
  }

  plan(input = {}) {
    const constraints = this._inputConstraints(input);
    const alternatives = this._candidates(constraints);
    const selected = alternatives.filter((candidate) => candidate.eligible).sort((a, b) => a.total - b.total || a.arrivalAt.localeCompare(b.arrivalAt))[0];
    this._commit(() => {
      const version = this.state._meta.nextPlanVersion++;
      this.state.constraints = constraints;
      const previousExecution = new Map(this.state.execution.steps.map((step) => [step.id, step]));
      const steps = selected ? [
        { id: 'hotel', provider: 'hotel', title: 'Protect late hotel arrival', description: 'Keep your existing prepaid room; guarantee check-in until 02:00.', amount: 0, optionId: this.state.providers.hotel.reservation.id, scheduledAt: this.state.scenario.now, quoteVersion: this.state.providers.hotel.version },
        { id: 'flight', provider: 'airline', title: `Rebook on ${selected.flight.id}`, description: 'Use the protected ticket entitlement; pay only the fare difference.', amount: selected.flight.amount, optionId: selected.flight.id, scheduledAt: selected.flight.departureAt, arrivalAt: selected.flight.arrivalAt, quoteVersion: this._booking('flight')?.quoteVersion ?? this.state.providers.airline.version },
        { id: 'ground', provider: 'ground', title: selected.ground.label, description: 'LAX to Harbor House Los Angeles, after a 15-minute airport connection.', amount: selected.ground.amount, optionId: selected.ground.id, scheduledAt: selected.pickupAt, arrivalAt: selected.arrivalAt, quoteVersion: this._booking('ground')?.quoteVersion ?? this.state.providers.ground.version },
      ].map((step) => ({ ...step, currency: 'USD', idempotencyKey: this._key(step.id, step.optionId), status: previousExecution.get(step.id)?.status ?? 'pending' })) : [];
      this.state.plan = {
        version, status: selected ? 'ready' : 'blocked', total: selected?.total ?? null, currency: 'USD',
        arrivalAt: selected?.arrivalAt ?? null, selectedOptionId: selected?.id ?? null,
        steps, alternatives,
        reasons: selected ? [] : ['No itinerary meets all constraints. Change your budget or arrival deadline; protected reservations remain intact.'],
        preserved: ['Original flight entitlement ENT-410', 'Prepaid hotel reservation HTL-7721'],
        constraintChecks: selected ? [
          { label: 'Within budget', passed: true, detail: `$${selected.total} of $${constraints.budget}` },
          { label: 'Hotel arrival deadline', passed: true, detail: selected.arrivalAt },
          { label: 'Airport departure lead', passed: true, detail: 'At least 45 minutes' },
          { label: 'Airport pickup connection', passed: true, detail: 'At least 15 minutes' },
          { label: 'Hotel protection available', passed: true, detail: 'Approval includes a late arrival guarantee through 02:00' },
        ] : [],
      };
      if (this.state.approval) this.state.approval = { ...this.state.approval, status: 'invalidated', reason: `A new plan version (${version}) requires fresh approval.` };
      this.state.execution = {
        status: selected ? 'idle' : 'blocked',
        // Infeasible replanning must not hide existing commitments or unknown outcomes.
        steps: selected
          ? steps.map((step) => ({ id: step.id, title: step.title, status: previousExecution.get(step.id)?.status ?? 'pending', attempts: previousExecution.get(step.id)?.attempts ?? 0, reference: previousExecution.get(step.id)?.reference ?? null, receipt: clone(previousExecution.get(step.id)?.receipt ?? null), idempotencyKey: step.idempotencyKey }))
          : clone(this.state.execution.steps),
        lastError: selected ? null : { code: 'NO_FEASIBLE_PLAN', message: 'No itinerary meets every constraint.' }, completedAt: null,
      };
      this._event('plan.created', selected ? `Plan v${version} is ready for review` : `Plan v${version} needs a constraint change`, selected ? `$${selected.total} total incremental cost. All three provider actions require this plan’s approval.` : this.state.plan.reasons[0], { planVersion: version });
    });
    return this.getState();
  }

  _block(code, message, { invalidate = false } = {}) {
    this._commit(() => {
      this.state.execution.status = 'blocked';
      this.state.execution.lastError = { code, message };
      if (invalidate && this.state.approval) this.state.approval = { ...this.state.approval, status: 'invalidated', reason: message };
      this._event('execution.blocked', 'Execution blocked safely', message, { code });
    });
    return this.getState();
  }

  _quoteProblem() {
    if (!this.state.plan || this.state.plan.status !== 'ready') return 'There is no current feasible plan. Create a fresh plan.';
    for (const step of this.state.plan.steps) {
      if (this._booking(step.id)) continue; // Existing commitments keep their own booked price and availability.
      const provider = this.state.providers[step.provider];
      if (provider.version !== step.quoteVersion) return `${provider.name} changed its quote or availability. Create and approve a new plan.`;
      if (step.id !== 'hotel') {
        const offer = provider.offers.find((item) => item.id === step.optionId);
        if (!offer?.available || offer.amount !== step.amount) return `${provider.name} no longer matches the reviewed plan. Create and approve a new plan.`;
      }
    }
    return null;
  }

  /** @param {{planVersion?:number,maxTotal?:number}} [input] */
  approve({ planVersion, maxTotal } = {}) {
    if (!Number.isInteger(planVersion) || !Number.isFinite(maxTotal) || maxTotal < 0) throw new RecoveryError('INVALID_APPROVAL', 'Approval requires an integer planVersion and a numeric maxTotal.');
    if (!this.state.plan || planVersion !== this.state.plan.version) return this._block('STALE_PLAN', 'Approval does not match the current plan version.');
    const problem = this._quoteProblem();
    if (problem) return this._block('STALE_QUOTE', problem, { invalidate: true });
    if (maxTotal < this.state.plan.total || maxTotal > this.state.constraints.budget) return this._block('APPROVAL_LIMIT', 'Approval limit must cover the plan total and stay within your budget.', { invalidate: true });
    this._commit(() => {
      const at = this._event('plan.approved', `Plan v${planVersion} approved`, `Explicit authorization: up to $${money(maxTotal)} USD for the listed three simulated provider actions.`, { planVersion });
      this.state.approval = { planVersion, maxTotal: money(maxTotal), status: 'approved', approvedAt: at, reason: null };
      this.state.execution.status = 'ready';
      this.state.execution.lastError = null;
    });
    return this.getState();
  }

  /** @param {{planVersion?:number}} [input] */
  execute({ planVersion } = {}) {
    if (!Number.isInteger(planVersion)) throw new RecoveryError('INVALID_EXECUTION', 'Execution requires an integer planVersion.');
    if (!this.state.plan || planVersion !== this.state.plan.version) return this._block('STALE_PLAN', 'Execution request does not match the current plan version.');
    const approval = this.state.approval;
    if (!approval || approval.status !== 'approved' || approval.planVersion !== planVersion) return this._block('APPROVAL_REQUIRED', 'Explicit approval for this exact plan version is required before contacting suppliers.');
    const problem = this._quoteProblem();
    if (problem) return this._block('STALE_QUOTE', problem, { invalidate: true });
    if (this.state.plan.total > approval.maxTotal || this.state.plan.total > this.state.constraints.budget) return this._block('BUDGET_EXCEEDED', 'Current cost exceeds the approved spending limit.', { invalidate: true });
    if (this.state.execution.status === 'completed') return this.getState();
    this._commit(() => {
      this.state.execution.status = 'running';
      this.state.execution.lastError = null;
      this._event('execution.started', 'Recovery execution started', 'Hotel protection → flight rebooking → ground transfer. Existing commitments are retained on failure.', { planVersion });
    });
    for (const id of STEP_IDS) {
      const step = this.state.plan.steps.find((item) => item.id === id);
      const executionStep = this.state.execution.steps.find((item) => item.id === id);
      if (executionStep.status === 'confirmed') continue;
      const existing = this._booking(id);
      if (existing) {
        if (existing.idempotencyKey !== step.idempotencyKey) return this._block('EXISTING_COMMITMENT', 'An existing booking differs from this plan and will not be replaced automatically.', { invalidate: true });
        this._commit(() => {
          this.state.providers[step.provider].reconciliationRequests++;
          executionStep.status = 'confirmed';
          executionStep.reference = existing.reference;
          executionStep.receipt = clone(existing);
          step.status = 'confirmed';
          this._event('booking.reconciled', `${step.title}: booking found`, `Recovered ${existing.reference} by its durable idempotency key. No second booking or charge.`, { stepId: id, reference: existing.reference });
        });
        continue;
      }
      const loseResponse = id === 'ground' && this.state.fault.kind === 'transport-timeout' && !this.state.fault.consumed;
      this._commit(() => {
        const provider = this.state.providers[step.provider];
        const reference = `${id === 'hotel' ? 'HT' : id === 'flight' ? 'FL' : 'GR'}-REC-0001`;
        provider.requests++;
        executionStep.attempts++;
        const record = { reference, idempotencyKey: step.idempotencyKey, optionId: step.optionId, amount: step.amount, currency: 'USD', status: 'confirmed', quoteVersion: step.quoteVersion, planVersion, approvalLimit: approval.maxTotal };
        if (id === 'hotel') {
          record.protectedUntil = this.state.scenario.hotelProtectedUntil;
          provider.protections.push(record);
          provider.reservation.lateArrivalProtectedUntil = record.protectedUntil;
        } else {
          record.offer = clone(provider.offers.find((offer) => offer.id === step.optionId));
          if (id === 'ground') { record.pickupAt = step.scheduledAt; record.arrivalAt = step.arrivalAt; }
          provider.bookings.push(record);
        }
        executionStep.status = loseResponse ? 'unknown' : 'confirmed';
        executionStep.reference = loseResponse ? null : reference;
        executionStep.receipt = loseResponse ? null : clone(record);
        step.status = executionStep.status;
        if (loseResponse) {
          this.state.fault.consumed = true;
          this.state.execution.status = 'needs-retry';
          this.state.execution.lastError = { code: 'TRANSPORT_TIMEOUT', message: 'Ground transfer response was lost. Its outcome is unknown to the client. Retry to reconcile before creating anything.' };
          this._event('booking.response_lost', 'Ground transfer response lost', 'The simulated provider committed the booking, but its response never reached the client. Durable lookup will determine the outcome.', { stepId: id });
        } else {
          this._event('booking.confirmed', `${step.title}: confirmed`, `${reference} · $${step.amount} USD.`, { stepId: id, reference });
        }
      });
      if (loseResponse) return this.getState();
    }
    this._commit(() => {
      this.state.execution.status = 'completed';
      this.state.execution.lastError = null;
      this.state.execution.completedAt = this._event('execution.completed', 'Your recovery is confirmed', `All three provider outcomes verified. Total incremental cost: $${this.state.plan.total} USD. Original ticket entitlement and prepaid hotel remain protected.`);
    });
    return this.getState();
  }

  /** @param {{kind?:string}} [input] */
  inject({ kind } = {}) {
    if (!['transport-timeout', 'price-change', 'sold-out', 'none'].includes(kind)) throw new RecoveryError('INVALID_FAULT', 'Choose transport-timeout, price-change, sold-out, or none.');
    this._commit(() => {
      this.state.fault = { kind, consumed: false };
      let changed = false;
      if (kind === 'price-change') {
        const optionId = this.state.plan?.steps.find((step) => step.id === 'ground')?.optionId ?? 'standard';
        const offer = this.state.providers.ground.offers.find((item) => item.id === optionId);
        offer.amount = money(offer.amount + 35);
        this.state.providers.ground.version++;
        changed = !this._booking('ground');
        this.state.fault.consumed = true;
      } else if (kind === 'sold-out') {
        const optionId = this.state.plan?.selectedOptionId ?? 'PA522';
        this.state.providers.airline.offers.find((item) => item.id === optionId).available = false;
        this.state.providers.airline.version++;
        changed = !this._booking('flight');
        this.state.fault.consumed = true;
      }
      if (changed && this.state.plan) {
        this.state.plan.status = 'blocked';
        this.state.plan.reasons = ['Supplier quote or availability changed. Replan and approve the new version before execution.'];
        if (this.state.approval) this.state.approval = { ...this.state.approval, status: 'invalidated', reason: this.state.plan.reasons[0] };
        this.state.execution.status = 'blocked';
        this.state.execution.lastError = { code: 'STALE_QUOTE', message: this.state.plan.reasons[0] };
      }
      this._event('fault.injected', kind === 'none' ? 'Future failure injection cleared' : `Simulation: ${kind}`, kind === 'transport-timeout' ? 'The next new ground booking will commit, then lose its response once.' : kind === 'none' ? 'Existing supplier changes remain in effect. Reset starts a fresh scenario.' : 'Supplier fixture updated. Any affected uncommitted approval is invalidated.');
    });
    return this.getState();
  }

  reset() {
    this._commit(() => {
      // A delayed approval/execute from before reset must never target a new plan.
      const nextPlanVersion = this.state._meta.nextPlanVersion;
      this.state = createInitialState();
      this.state._meta.nextPlanVersion = nextPlanVersion;
    });
    return this.getState();
  }
}
