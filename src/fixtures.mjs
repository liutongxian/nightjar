/** Fictional, deterministic fixtures. No provider integration or real reservation exists. */
export const SCENARIO_ID = 'sfo-lax-2026-10-22';
export const DEFAULT_CONSTRAINTS = Object.freeze({
  budget: 300,
  latestArrival: '2026-10-23T01:00:00-07:00',
  accessibility: false,
  minDepartureLeadMinutes: 45,
  minGroundConnectionMinutes: 15,
});

export function createInitialState() {
  return {
    schemaVersion: 1,
    scenario: {
      id: SCENARIO_ID,
      mode: 'simulation',
      title: 'A cancelled flight. One connected recovery.',
      now: '2026-10-22T20:40:00-07:00',
      timezone: 'America/Los_Angeles',
      origin: 'SFO',
      destination: 'LAX',
      destinationCity: 'Los Angeles',
      travelerLocation: 'SFO airport, departures terminal',
      originalFlight: { id: 'PA410', departureAt: '2026-10-22T21:10:00-07:00', status: 'cancelled' },
      hotelName: 'Harbor House Los Angeles',
      hotelArrivalDeadline: '2026-10-23T00:00:00-07:00',
      hotelProtectedUntil: '2026-10-23T02:00:00-07:00',
      currency: 'USD',
      notice: 'Fictional scenario. All providers, prices, payments and bookings are simulated.',
    },
    providers: {
      airline: {
        id: 'pacific-air', name: 'Pacific Air', mode: 'simulated', version: 1,
        entitlement: { id: 'ENT-410', originalFlightId: 'PA410', status: 'preserved', description: 'Original ticket value remains protected; only fare difference is authorized.' },
        offers: [
          { id: 'PA522', label: 'Balanced rescue', departureAt: '2026-10-22T22:25:00-07:00', arrivalAt: '2026-10-22T23:55:00-07:00', amount: 186, available: true, accessible: true },
          { id: 'PA508', label: 'Earlier arrival', departureAt: '2026-10-22T21:35:00-07:00', arrivalAt: '2026-10-22T23:05:00-07:00', amount: 310, available: true, accessible: true },
          { id: 'PA548', label: 'Lower fare, later arrival', departureAt: '2026-10-22T23:15:00-07:00', arrivalAt: '2026-10-23T00:45:00-07:00', amount: 148, available: true, accessible: true },
          { id: 'PA496', label: 'Departure cutoff missed', departureAt: '2026-10-22T21:00:00-07:00', arrivalAt: '2026-10-22T22:30:00-07:00', amount: 120, available: true, accessible: true },
        ],
        bookings: [], requests: 0, reconciliationRequests: 0,
      },
      ground: {
        id: 'cityline', name: 'Cityline Transfer', mode: 'simulated', version: 1,
        offers: [
          { id: 'standard', label: 'Private airport transfer', amount: 48, available: true, accessible: false, durationMinutes: 35 },
          { id: 'accessible', label: 'Wheelchair-accessible airport transfer', amount: 68, available: true, accessible: true, durationMinutes: 35 },
        ],
        bookings: [], requests: 0, reconciliationRequests: 0,
      },
      hotel: {
        id: 'harbor-house', name: 'Harbor House Los Angeles', mode: 'simulated', version: 1,
        reservation: {
          id: 'HTL-7721', status: 'confirmed', prepaid: true, protected: true,
          city: 'Los Angeles', checkInDate: '2026-10-22', checkOutDate: '2026-10-24',
          originalAmount: 218, lateArrivalDeadline: '2026-10-23T00:00:00-07:00',
          lateArrivalProtectedUntil: null,
        },
        protections: [], requests: 0, reconciliationRequests: 0,
      },
    },
    constraints: { ...DEFAULT_CONSTRAINTS },
    plan: null,
    approval: null,
    execution: { status: 'idle', steps: [], lastError: null, completedAt: null },
    events: [{ id: 'evt-1', at: '2026-10-22T20:40:00-07:00', type: 'scenario.loaded', title: 'Flight cancellation detected', detail: 'PA410 is cancelled. Original ticket entitlement and prepaid Los Angeles hotel are protected.' }],
    fault: { kind: 'none', consumed: false },
    _meta: { nextPlanVersion: 1, eventSequence: 1 },
  };
}
