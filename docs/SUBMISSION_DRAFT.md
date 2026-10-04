# Nightjar submission draft

Prepared for the Amazon Build Ship Shape hackathon Alexa+ track. This is a local draft for review, not a submitted entry. The project itself has not been submitted. The source release uses the MIT License; a public demonstration video is still missing. Do not copy unresolved fields into the final form.

## Project name

Nightjar

Working name only; trademark clearance has not been performed.

## Tagline

A cancelled flight, a protected room, and a recovery plan that survives lost responses.

## Short description

Nightjar is an independent Alexa+ travel-recovery concept with a working MCP server. It coordinates a replacement flight, a late hotel arrival and the final airport transfer under one spending and arrival boundary. The prototype demonstrates versioned approval, saved progress and repeat-safe recovery using clearly labelled synthetic suppliers.

## Inspiration

A late-night flight cancellation can break several reservations at once. A replacement flight may land after the hotel expects the traveller, or leave too little time for the final ride. A failed confirmation adds another problem: repeating a booking request can create a duplicate if the supplier already accepted it.

Nightjar explores a specific customer need: keeping the entire airport-to-hotel recovery coherent while preserving existing reservations and letting the traveller control new commitments. The scenario is a product hypothesis, not a claim based on interviews or measured customer demand.

## What it does

The traveller sets a maximum additional spend, a latest hotel-arrival time and an accessible-transfer preference. The planner checks connected flight and transfer options, explains rejected alternatives, and proposes three ordered steps: protect the prepaid hotel room, rebook the flight using the protected ticket entitlement, and arrange the final ride.

In the default synthetic scenario, a cancelled 21:10 SFO-to-LAX flight is replaced by a 22:25 departure. The proposed airport pickup reaches the hotel at 00:45, within a $300 budget, for $234 in additional simulated cost. These prices and times are fixtures, not current travel advice.

The traveller reviews an exact plan version and total before execution. A changed quote, changed constraint or unavailable service requires a new plan and approval. Existing ticket rights and the original hotel reservation are never cancelled by the prototype.

The key demonstration is an unknown outcome. The transfer supplier saves one booking but loses its response. Nightjar keeps the earlier hotel and flight receipts, saves the checkpoint, then looks up the existing idempotency key after restart. It retrieves the existing transfer receipt instead of creating another booking.

## How it is built

The application uses Node.js, browser-native JavaScript, HTML and CSS. A shared deterministic recovery engine owns constraints, quote versions, approvals, supplier state and an event trail. Each state change is written to an atomic JSON checkpoint. Three in-process supplier simulators make failure and recovery reproducible without an account, API key or payment.

The official MCP TypeScript SDK implements a real Streamable HTTP endpoint. The verified client/server exchange negotiates protocol 2025-11-25 and actually invokes three tools: get_recovery_state, plan_recovery and execute_recovery. There is no approval tool. Execution checks the separately recorded, version-bound approval in the shared engine.

An English web interface presents constraints, proposed changes, approval controls, receipts, failures and evidence export. The scripted request is labelled as a concept; no microphone, speech recognition, live language model or Alexa account connection is claimed.

## Technical challenges and demonstrated results

A successful supplier action can look like a failure when its response is lost. The implementation distinguishes unknown outcomes from confirmed failures and reconciles saved supplier state before retrying.

Review also exposed two subtle approval and recovery problems. Resetting a demo originally reused plan versions, allowing a delayed old approval to match a new plan. Plan versions now remain monotonic across reset and restart. An infeasible replan originally hid earlier receipts; execution history now survives that change.

The current aggregate suite reports 48 passing tests across the engine, HTTP endpoints, DOM interactions and official MCP transport. Separate proof runs record real HTTP exchanges, file-backed recovery and duplicate-free retry. Automated approval decisions in these runs are explicitly labelled as test fixtures.

Browser-DOM tests are not visual validation. The available cloud browser blocked loopback access, so rendered desktop/mobile checks and a real screen recording remain unfinished. No browser restriction was bypassed and no fabricated screenshot or video is included.

## Why the approach matters

The value is in maintaining a coherent recovery across services and interruptions. A plan includes the room and final ride, not just a replacement flight. Execution protects existing reservations, binds consent to the actual proposal and treats missing responses conservatively.

Potential users are travellers dealing with time-sensitive disruptions who need a clear view of what is proposed, already confirmed or still uncertain. Whether the product reduces stress, duplicate bookings or recovery time has not been tested with users or real travel providers.

## Current limitations and next work

All travel suppliers and their effects remain synthetic. The planner is deterministic, the conversation is scripted, and real Alexa interoperability is unverified. The local consent flow is not authenticated production authorization. Multi-user access, live quote expiry, real airline exchange rules, cancellation/refund terms, payments and external supplier reconciliation are outside the current implementation.

The next release gate is a supported rendered preview and a truthful demonstration recording. Later work would require explicit decisions about live AI access, real provider contracts, human-consent identity, secure credentials and production storage. No paid service is needed to evaluate the current code.

## Build with

Node.js 24.19.0 (verified runtime); JavaScript; HTML; CSS; Model Context Protocol; @modelcontextprotocol/sdk 1.31.0; zod 4.6.5; TypeScript checkJs; jsdom; node:test.

AI coding assistance was used substantially. See the disclosure below. No AWS service is used by this implementation.

## Primary track and mini challenges

Primary track: Alexa+. This project submission remains a draft.

Implemented technical evidence: a working self-hosted MCP server using Streamable HTTP and protocol 2025-11-25, plus a standalone simulated experience. This does not assert Alexa certification, closed-preview access or guaranteed track acceptance.

Mini challenges: none claimed at this stage. Do not claim AWS Builder or Open Source eligibility merely because the project uses open-source dependencies.

## AI assistance disclosure

Substantial AI assistance was used for product framing, architecture, implementation, test design, debugging and documentation. The prototype was developed in an assistant-managed cloud workspace under the entrant's direction. It should not be represented as exclusively human-authored.

Any further human review, creative decisions, implementation and testing contributions must be recorded accurately before final submission. This draft does not assert that the originality and ownership conditions are already satisfied. AI-generated suggestions are not a substitute for that review.

## Required final fields still unresolved

- Entrant/team identity and confirmed eligibility: not included in this public source release
- Repository URL: https://github.com/liutongxian/nightjar (public, MIT-licensed source)
- License: MIT for project-specific source; third-party dependencies retain their own terms
- Demonstration video URL: no video recorded or uploaded
- Product-feedback preference answers: recommendations are drafted in PRODUCT_FEEDBACK.md; the entrant's own answers are not invented
- Final declaration/terms/submission: not performed by this document

## Judging and testing notes

The repository must include the source, lockfile and instructions. The main app can be started with npm start after dependency installation. npm run check runs the automated suite. npm run demo:proof starts the app and official MCP client in one local execution context, prints a concise trace and writes evidence, then stops them. It needs no account or secret.

For manual evaluation, follow JUDGE_GUIDE.md. The CLI proof is an executable supplement, not a replacement for the required public demonstration video.

Official requirements reference, rechecked 2026-10-03: https://amazonappdev2026.devpost.com/rules and https://amazonappdev2026.devpost.com/details/faqs


## Submission field mapping

This draft maps the public requirements to repository evidence. The authenticated Devpost entry form has not been inspected in this review; its exact labels, character limits and additional declarations must still be checked before copying content.

| Required content | Prepared source | Still needed |
| --- | --- | --- |
| Project description and functionality | This document | Entrant review of final wording |
| Working implementation and testing instructions | README.md, JUDGE_GUIDE.md, TEST_REPORT.md | Public repository access must remain available through judging |
| Public demonstration | DEMO_SCRIPT.md | Actual runtime recording under three minutes and public YouTube/Vimeo URL |
| Developer-tool feedback | PRODUCT_FEEDBACK.md | Entrant-approved repeat-use answers |
| Primary track and mini challenges | Alexa+; none currently claimed | Final form selection |
| Originality and work during the entry window | CONTRIBUTIONS.md and DISCLOSURE.md | Truthful entrant contribution and rights review |

The FAQ confirms that a locally runnable repository plus the demonstration video can suffice for Alexa+ evaluation; a live deployment is not required. This does not resolve the current recording blocker or authorize publication. Keep evaluation materials accessible through the end of judging.
