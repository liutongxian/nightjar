# Nightjar

**A working, credential-free travel-recovery prototype for an independent Alexa+ experience concept.**

After a late-night flight cancellation, Nightjar treats the flight, the last ride, and the existing hotel room as one recovery problem. It does not claim that a flight alone solves the trip.

> All travellers, suppliers, availability, prices, receipts, and reservations are synthetic. The conversational request is scripted, and the planner is deterministic. This build has no live Alexa connection, no AI model call, no real travel integration, no payments, and no credentials. It is not certified submission-ready.

## Run from an extracted project

Use Node.js 24.19.0, the version verified for this package. The locked jsdom development dependency requires at least 24.15.0 on the Node 24 line; early 24.x versions are not sufficient for the complete test suite. Open a terminal in the project directory containing `package.json` (`nightjar` after cloning, or `alexa_hackathon` from the source archive). The app does not need an API key.

```sh
npm ci --ignore-scripts --cache /tmp/nightjar-npm-cache
npm start
```

The service binds only to `http://127.0.0.1:4173`. This is a loopback address on the machine running the app, not a public website or a link to open from another machine. The current cloud browser rejected this address under its URL policy. Separate tool executions also could not reach a server started in another execution context. The CLI and HTTP/MCP client were therefore smoke-tested together within one context, then stopped. No public tunnel or deployment was created to work around these restrictions.

Runtime state is saved in `.runtime/state.json`. Restarting the process restores the exact run. Set `PORT` or `NIGHTJAR_STATE_FILE` to use a different local port or a disposable state file. `PORT=0` selects an ephemeral port and prints the actual loopback address; the crash proof uses this to avoid fixed-port conflicts. Run one server process per state file.

```sh
npm run check   # project-specific syntax/security lint, TypeScript checkJs, all Node tests
npm test       # core + HTTP + DOM integration + MCP transport tests
npm run smoke  # same-process engine reconstruction from disk
npm run proof:crash # actual CLI process kill, new process, durable reconciliation
npm run demo:proof # real MCP calls with clearly labelled synthetic approval fixtures
npm run preview:export # standalone, read-only HTML preview (not visual QA)
```

The production web app uses native browser APIs and Node's HTTP/file APIs. TypeScript and jsdom are development tools; MCP uses the official SDK. Exact dependency versions are in `package-lock.json`.

## The 90-second proof

1. Run the example request. The default plan protects the existing room through 02:00, rebooks the 22:25 SFO→LAX flight, and reserves the 00:10 airport pickup. Arrival: 00:45. Additional cost: $234 of the $300 budget.
2. Review the three proposed changes. Check the approval box. Approval is bound to this version and spending limit; it is not a broad permission to buy travel.
3. Before executing, select **Ground booking response lost** and inject it. Run the approved simulation.
4. The hotel and flight are confirmed. The ground supplier has saved one booking, but its response was lost. Reload or restart the server.
5. Choose **Reconcile & continue**. Nightjar looks up the existing idempotency key and retrieves the receipt. It does not send a second create request.
6. Download the evidence JSON. Compare the visible receipts, supplier counters, and event trail.

Also try:

- **Transfer price changes**: the previous approval becomes invalid, even if the new $269 total still fits the budget
- **Replacement flight sells out**: the old plan stops; new options require fresh approval
- **$100 budget / 00:30 arrival**: the planner explains why nothing fits instead of inventing a route
- **02:00 arrival**: before commitments, the planner can select the cheaper $196 option
- **Accessible ground transfer**: the planned transfer changes and is repriced to $68
- **Changed boundaries after partial execution**: existing commitments remain saved; the app does not silently cancel or substitute them
- **Reset**: clears the synthetic run while keeping plan versions monotonic so delayed old approvals cannot authorize new plans

## What is implemented

- Three stateful simulated suppliers: Pacific Air, Cityline Transfer, and Harbor House Los Angeles
- Constrained route selection with explanations for rejected routes
- Versioned approval, quote validation, exact plan checks, and spending limits
- Hotel protection first; original ticket entitlement and prepaid hotel reservation are never cancelled
- Stable idempotency keys, provider reconciliation, partial-success checkpoints, and repeat-click protection
- Atomic state persistence and rollback on failed saves
- Responsive English UI with approval and reset dialogs, explicit synthetic-data labels, a receipt timeline, and evidence export
- A real SDK-backed MCP Streamable HTTP endpoint; see `docs/MCP.md` for its verified contract and tests

## Project structure

```text
src/fixtures.mjs       Fictional providers and scenario
src/engine.mjs         Constraints, approval, execution, persistence
src/contracts.ts      Serializable UI/engine contract
src/server.mjs         Loopback HTTP server and REST API
src/mcp.mjs            Official SDK MCP integration
public/               Browser application, styles, and favicon
scripts/              Project checks and reproducible smoke runs
tests/                Unit, HTTP, DOM, and MCP tests
docs/                 Architecture, test results, disclosures, demo script
artifacts/            Machine-readable test/evidence artifacts
```

## Scope and readiness

This is a functional prototype, not a production travel agent. There is no authentication, multi-user isolation, real payment authorization, actual airline ticket exchange, live hotel protection, live traffic, live voice input, or LLM-based language understanding. The 15-minute airport pickup connection is a fictional fixture, not travel advice. Supply-side state and money changes occur only in local JSON. No cancellation action exists.

A standalone read-only plan preview is available at `artifacts/nightjar-preview.html`. It contains the serialized DOM produced from the page code with inline styling and disabled controls; it is not a screenshot.

Formal browser rendering, mobile viewport, keyboard-focus, and visual contrast checks remain unverified because the available cloud browser blocked loopback access. DOM integration tests exercise actual page code, controls, dialogs, and HTTP responses, but they do not replace rendered-browser validation.

Before external access: add authentication, authorization separated from model output, independent human approval, provider-specific reconciliation, real quote expiry and cancellation/refund policies, secrets handling, and appropriate data minimization. Live AI or travel-provider integration requires a separate credential and authorization decision. Do not add a key to this repository.

Before submission: verify eligibility and residence, contribution/originality obligations, current official rules, AI-assistance disclosure, open-source licenses, repository access, and a public demonstration video. A public source release does not complete project submission, public demonstration video, or payment.

## Provenance

Working name: Nightjar, not trademark-cleared. Designed and implemented with AI assistance; do not describe the code as exclusively human-written. The entrant must review, test, make real product decisions, and disclose assistance as the rules require. See `docs/DISCLOSURE.md`.

Official challenge references, rechecked on 2026-10-03:

- https://amazonappdev2026.devpost.com/rules
- https://amazonappdev2026.devpost.com/details/faqs

## Submission preparation

See `docs/SUBMISSION_DRAFT.md` for the English project draft, `docs/JUDGE_GUIDE.md` for evaluation, `docs/PRODUCT_FEEDBACK.md` for tool feedback, `docs/CONTRIBUTIONS.md` for honest AI/human attribution, and `docs/SUBMISSION_READINESS.md` for the remaining blockers. See `docs/THIRD_PARTY_REVIEW.md` for the lockfile-based dependency license inventory and pending rights review. The current suite reports 48 passing tests (recorded 2026-10-02; not rerun for the 2026-10-03 documentation-only review). No video, legal declaration or final submission is implied by those materials.

## License

Project-specific source and documentation are available under the [MIT License](LICENSE), copyright 2026 liutongxian. Third-party dependencies retain their own licenses. This source repository contains no node_modules, third-party bundle, external fonts, stock imagery or recorded media. See [THIRD_PARTY_REVIEW.md](docs/THIRD_PARTY_REVIEW.md) for the limited dependency and rights review.

Public source repository: https://github.com/liutongxian/nightjar
