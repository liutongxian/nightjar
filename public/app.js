/** @typedef {import('../src/contracts.js').RecoveryState} RecoveryState */
/** @type {RecoveryState|null} */
let state = null;
let busy = false;
let dirty = false;
let toastTimer;
let approvalVersion = null;
/** @param {string} id @returns {any} DOM IDs refer to fixed controls in index.html. */
const $ = (id) => document.getElementById(id);
const initialPlanMarkup = $('plan-content').innerHTML;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',minimumFractionDigits:Number.isInteger(Number(value ?? 0))?0:2,maximumFractionDigits:2}).format(Number(value ?? 0));
const time = (value) => value ? new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(value)) : '—';
const dateKey = (value) => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(String(value)));
const arrivalDay = (value) => dateKey(value) === dateKey(state.scenario.now) ? 'Tonight' : 'Tomorrow';
const detailText = (value) => typeof value === 'string' ? value : JSON.stringify(value);

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function showError(message) {
  $('global-error').innerHTML = `<span>${esc(message)}</span> <button type="button" class="button outline" data-action="reload-state">Check saved state</button>`;
  $('global-error').hidden = false;
}

async function api(path, input) {
  const response = await fetch(`/api/${path}`, input === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'The request could not be completed.');
  return result;
}

async function action(path, input = {}) {
  if (busy) return;
  busy = true;
  $('global-error').hidden = true;
  document.querySelectorAll('button,input,select').forEach((control) => { /** @type {HTMLInputElement} */ (control).disabled = true; });
  $('main').setAttribute('aria-busy', 'true');
  try {
    state = await api(path, path === 'state' ? undefined : input);
    if (path === 'plan' || path === 'reset') dirty = false;
    if (['plan','reset','state'].includes(path)) { dirty = false; syncConstraints(); }
    render();
    return state;
  } catch (error) {
    showError(path === 'execute' ? `${error.message} The saved outcome may already exist. Check saved state before retrying.` : error.message);
    $('global-error').scrollIntoView({block:'nearest',behavior:'smooth'});
  } finally {
    busy = false;
    $('main').setAttribute('aria-busy', 'false');
    document.querySelectorAll('button,input,select').forEach((control) => { /** @type {HTMLInputElement} */ (control).disabled = false; });
    $('approval-confirm').disabled = !$('approval-consent').checked;
  }
}

function syncConstraints() {
  if (!state) return;
  $('budget').value = String(state.constraints.budget);
  const date = new Date(state.constraints.latestArrival);
  $('latest-arrival').value = new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Los_Angeles'}).format(date);
  $('accessibility').checked = state.constraints.accessibility;
  $('fault').value = state.fault?.kind ?? 'none';
}

function render() {
  if (!state) return;
  const plan = state.plan;
  const status = state.execution.status;
  const approved = state.approval?.status === 'approved' && state.approval.planVersion === plan?.version;
  let label = 'Ready to plan';
  let pill = '';
  if (plan) { label = 'Approval needed'; pill = 'approval'; }
  if (plan?.status === 'blocked' || status === 'blocked') { label = 'Needs a new plan'; pill = 'error'; }
  if (approved && status !== 'needs-retry' && status !== 'blocked') { label = 'Approved'; pill = 'success'; }
  if (status === 'needs-retry') { label = 'Safely paused'; pill = 'approval'; }
  if (status === 'completed') { label = 'Recovery complete'; pill = 'success'; }
  if (dirty && plan) { label = 'Boundaries changed'; pill = 'approval'; }
  $('status-pill').textContent = label;
  $('status-pill').className = `status-pill ${pill}`;
  $('plan-heading').textContent = status === 'completed' ? 'Your night is back on track.' : plan ? 'A connected plan for tonight.' : 'A clear path, before you commit.';
  $('plan-button').textContent = plan ? 'Update recovery plan' : 'Find a recovery plan';
  if (plan) renderPlan();
  else if (!$('example-button')) { $('plan-content').innerHTML = initialPlanMarkup; $('example-button').addEventListener('click', buildPlan); }
  renderActions();
  renderEvidence();
}

function renderPlan() {
  const {plan, execution, providers} = state;
  if (!plan) return;
  if (plan.status === 'blocked') {
    $('plan-content').innerHTML = `<div class="notice error"><strong>No safe plan fits these boundaries.</strong>${plan.reasons.map(esc).join('<br>')}</div><p class="muted">Your prepaid room and original flight entitlement are unchanged. Try a larger budget or a later arrival deadline.</p>${execution.steps.some((s)=>s.receipt || s.status==='unknown') ? `<div class="notice"><strong>Earlier commitments are still saved.</strong>${execution.steps.filter((s)=>s.receipt || s.status==='unknown').map((s)=>`${esc(s.title)}: ${esc(s.status)}${s.reference ? ` · ${esc(s.reference)}` : ''}`).join('<br>')}<br>A changed boundary does not undo a confirmed booking or an unknown supplier outcome.</div>` : ''}${alternatives(plan.alternatives)}`;
    return;
  }
  const notes = [];
  if (execution.status === 'completed') notes.push('<div class="completion-banner"><strong>All three services confirmed.</strong> Your hotel is protected, your flight is replaced, and your final ride is ready. All bookings below are simulated.</div>');
  if (execution.status === 'needs-retry') notes.push(`<div class="notice"><strong>The transfer response was lost. Your progress wasn't.</strong>The supplier may already have booked it. Continue to check the receipt using the same request key, without creating a second booking.</div>`);
  if (execution.status === 'blocked' || (state.approval?.status === 'invalidated' && state.approval.planVersion === plan.version)) notes.push(`<div class="notice error"><strong>The approved plan is no longer current.</strong>${esc(state.approval?.reason ?? execution.lastError?.message ?? 'Supplier details changed.')} Review a refreshed plan before continuing.</div>`);
  const selected = plan.alternatives?.find((a) => a.id === plan.selectedOptionId) ?? plan.alternatives?.find((a) => a.eligible && a.total === plan.total);
  const icons = {hotel:'⌂',flight:'↗',ground:'◇'};
  const descriptions = {
    hotel: `${providers.hotel.name} · existing prepaid room`,
    flight: selected ? `${selected.flight.id} · SFO ${time(selected.flight.departureAt)} to LAX ${time(selected.flight.arrivalAt)}` : 'SFO to LAX · same-night replacement',
    ground: selected ? `${time(selected.pickupAt)} airport pickup · ${selected.ground.durationMinutes} min to your hotel` : 'LAX airport to your existing hotel',
  };
  const steps = plan.steps.map((step, index) => {
    const run = execution.steps.find((s) => s.id === step.id);
    const done = run?.status === 'completed' || run?.status === 'confirmed' || run?.status === 'reconciled';
    const tags = step.id === 'hotel' ? [done ? 'Room held until 2:00 AM' : 'Proposed hold until 2:00 AM','No cancellation'] : step.id === 'flight' ? ['Original ticket rights preserved','Fare difference only'] : [state.constraints.accessibility ? 'Accessible vehicle' : 'Private airport transfer','15-minute connection'];
    return `<article class="plan-step ${done?'done':''}" data-step="${esc(step.id)}"><div class="step-icon" aria-hidden="true">${done?'✓':icons[step.id]}</div><div><div class="step-title-row"><span class="step-number">0${index+1}</span><h3>${esc(step.title)}</h3></div><p class="step-sub">${esc(descriptions[step.id])}</p><div class="step-meta">${tags.map((tag)=>`<span class="chip ${done?'green':''}">${esc(tag)}</span>`).join('')}<span class="chip">Simulated supplier</span></div>${run?.receipt ? `<div class="receipt">Receipt ${esc(run.reference ?? run.receipt.reference ?? run.receipt.id ?? 'confirmed')} · ${esc(run.status)}</div>` : ''}</div><div class="step-price">${money(step.amount)}<small>${step.id==='hotel'?'already paid':'additional'}</small></div></article>`;
  }).join('');
  $('plan-content').innerHTML = `${notes.join('')}<div class="plan-summary"><div><small>Total additional spend</small><strong>${money(plan.total)}</strong><div class="cost-note">${money(state.constraints.budget-plan.total)} within your budget</div></div><div class="arrival"><small>At your hotel by</small><strong>${time(plan.arrivalAt)}</strong><div class="cost-note">${arrivalDay(plan.arrivalAt)} · Los Angeles time</div></div></div><div class="plan-steps">${steps}</div>${alternatives(plan.alternatives)}`;
}

function alternatives(items = []) {
  const rejected = items.filter((item) => !item.eligible).slice(0,5);
  return `<details class="alternative-row"><summary>Why the other routes don't fit (${rejected.length} shown)</summary>${rejected.map((item)=>`<div class="alternative-item"><strong>${esc(item.label)} · ${money(item.total)}</strong><br>${item.reasons.map(esc).join(' · ')}</div>`).join('') || '<div class="alternative-item">All current alternatives meet these boundaries.</div>'}</details>`;
}

function renderActions() {
  const {plan,execution,approval} = state;
  if (!plan) { $('action-area').innerHTML = ''; return; }
  if (dirty) { $('action-area').innerHTML = '<div class="notice">Your boundaries changed. Update the plan before approving or continuing.</div>'; return; }
  if (plan.status === 'blocked' || execution.status === 'blocked' || (approval?.status === 'invalidated' && approval.planVersion === plan.version)) {
    $('action-area').innerHTML = '<div class="action-card"><p><strong>Nothing new will run without your say-so.</strong>A changed price or unavailable service needs a new plan and approval.</p><button class="button dark" data-action="replan">Refresh options</button></div>'; return;
  }
  if (execution.status === 'completed') {
    const count = state.providers.airline.bookings.length + state.providers.ground.bookings.length;
    $('action-area').innerHTML = `<div class="action-card"><p><strong>Saved and ready to reload.</strong>${count} simulated bookings · 1 protected hotel · no duplicate reservations</p><a class="button outline" href="/api/evidence" download>View evidence</a></div>`; return;
  }
  if (execution.status === 'needs-retry') {
    $('action-area').innerHTML = '<div class="action-card"><p><strong>Resume from the saved checkpoint.</strong>Completed services stay confirmed. The transfer receipt is checked before any retry.</p><button class="button dark" data-action="execute">Reconcile & continue</button></div>'; return;
  }
  if (approval?.status === 'approved' && approval.planVersion === plan.version) {
    $('action-area').innerHTML = `<div class="action-card"><p><strong>Plan v${esc(plan.version)} approved, up to ${money(approval.maxTotal)}.</strong>We will protect the room first, then confirm the flight and final ride.</p><button class="button dark" data-action="execute">Run approved simulation</button></div>`; return;
  }
  $('action-area').innerHTML = `<div class="action-card"><p><strong>Review once. Stay in control.</strong>Approval covers this exact plan and ${money(plan.total)} total. A supplier change requires a fresh approval.</p><button class="button dark" data-action="approve">Review & approve ${money(plan.total)}</button></div>`;
}

function renderEvidence() {
  const events = state.events.slice().reverse();
  $('evidence-content').innerHTML = `<div class="event-list">${events.map((event)=>`<div class="event"><time>${esc(time(event.at))}</time><div><strong>${esc(event.title)}</strong><p>${esc(detailText(event.detail))}</p></div></div>`).join('')}</div>`;
}

async function buildPlan(event) {
  event?.preventDefault();
  if (!$('constraints-form').reportValidity()) return;
  const result = await action('plan',{budget:Number($('budget').value),latestArrival:$('latest-arrival').value,accessibility:$('accessibility').checked});
  if (result) toast(result.plan?.status === 'ready' ? 'Plan built. No reservations have changed.' : 'No route fits yet. Your existing reservations are safe.');
}

$('constraints-form').addEventListener('submit', buildPlan);
$('example-button').addEventListener('click', buildPlan);
$('constraints-form').addEventListener('input', () => { dirty = true; renderActions(); $('status-pill').textContent = 'Boundaries changed'; });
$('action-area').addEventListener('click', async (event) => {
  const target = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (event.target).closest('[data-action]'));
  if (!target || !state?.plan || dirty) return;
  if (target.dataset.action === 'replan') { await buildPlan(); return; }
  if (target.dataset.action === 'execute') { await action('execute',{planVersion:state.plan.version}); return; }
  approvalVersion = state.plan.version;
  $('approval-consent').checked = false;
  $('approval-confirm').disabled = true;
  $('approval-summary').innerHTML = `${state.plan.steps.map((step)=>`<div class="approval-line"><span>${esc(step.title)}</span><strong>${money(step.amount)}</strong></div>`).join('')}<div class="approval-line approval-total"><span>Maximum total</span><span>${money(state.plan.total)} USD</span></div><div class="approval-version">Plan v${esc(state.plan.version)} · one-time simulated changes · no real payment<br>Prepaid hotel and original flight entitlement remain protected.</div>`;
  $('approval-dialog').showModal();
});
$('approval-consent').addEventListener('change', () => { $('approval-confirm').disabled = !$('approval-consent').checked; });
$('approval-cancel').addEventListener('click', () => $('approval-dialog').close());
$('approval-confirm').addEventListener('click', async () => {
  if (!$('approval-consent').checked || !state?.plan) return;
  $('approval-dialog').close();
  const result = await action('approve',{planVersion:approvalVersion,maxTotal:state.plan.total});
  if (result) toast(result.approval?.status === 'approved' && result.approval.planVersion === result.plan?.version ? 'Exact plan approved. Choose when to run the simulation.' : 'Approval could not be applied. Review the current plan.');
});
$('inject-button').addEventListener('click', async () => {
  const kind = $('fault').value;
  const result = await action('inject',{kind});
  if (result) toast(kind === 'none' ? 'Fault injection cleared. Existing supplier state is unchanged.' : 'Simulated supplier problem injected.');
});
$('global-error').addEventListener('click', async (event) => {
  if (/** @type {HTMLElement} */ (event.target).closest('[data-action="reload-state"]')) await action('state');
});
$('reset-button').addEventListener('click', () => $('reset-dialog').showModal());
$('reset-cancel').addEventListener('click', () => $('reset-dialog').close());
$('reset-confirm').addEventListener('click', async () => { $('reset-dialog').close(); await action('reset'); });

try {
  state = await api('state');
  syncConstraints();
  render();
} catch {
  showError('The local demo server is unavailable. Your saved state will return when the server is running again.');
}
