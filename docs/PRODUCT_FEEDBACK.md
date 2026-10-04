# Product feedback draft

These observations come from the implementation and tests in this repository. They do not claim real Alexa onboarding, actual travel-provider access or personal feedback from a human entrant. The suggested repeat-use choices below are technical recommendations for entrant review, not invented personal preferences.

## Official MCP TypeScript SDK 1.31.0

Used for: the real Streamable HTTP server and client, initialization, tool discovery, schema validation and invocation. Three tools share state with the web application.

Worked well: the official stateless server pattern could be integrated without an AI API key. The real client negotiated protocol 2025-11-25. Input-schema validation rejected an attempted extra approval flag. Recorded tests exercised response loss and safe retry over actual HTTP.

Needs work or clearer guidance: an application-specific example combining a stateless transport, persistent domain checkpoints and a separate human-consent interface would reduce integration effort. This is a documentation/feature suggestion, not an observed SDK defect. A transport retry does not automatically make an external business operation safe to repeat.

Onboarding: current official SDK documentation and examples were used, dependencies were installed from npm, then initialize/list/call were verified against the actual mounted app endpoint. No sign-in, device or credentials were required for this local synthetic workflow.

Suggested repeat-use answer: Yes, for a similar local protocol integration, because it avoided implementing a custom JSON-RPC transport. Entrant confirmation remains pending.

Evidence: src/mcp.mjs, tests/mcp.test.mjs, artifacts/mcp-smoke.json and artifacts/demo-proof.json.

## zod 4.6.5

Used for: the MCP tool input contracts, numeric bounds and rejection of unknown input properties.

Worked well: the schemas remain close to tool registration. The same live SDK path rejected unexpected fields, including a fabricated approved flag.

Needs work: no library-specific defect was demonstrated during this build. Domain checks still belong in the engine; structural schemas cannot verify whether a quoted itinerary is current or approved.

Onboarding: installed alongside the official MCP SDK and imported in the MCP module.

Suggested repeat-use answer: Yes, for explicit tool contracts. Entrant confirmation remains pending.

Evidence: src/mcp.mjs and strict-schema tests in tests/mcp.test.mjs.

## Node.js 24 and built-in HTTP filesystem and test APIs

Used for: the loopback app service, durable JSON state, supplier simulators, test runner and CLI proof scripts.

Worked well: no paid backend or database was needed for a reproducible single-process prototype. File-backed tests verified reconstruction after an unknown outcome, while HTTP tests exercised the real service boundary.

Needs work: the JSON persistence design is intentionally limited to one process and one state file. It is not a replacement for transactional multi-user storage. This is an application limitation, not a demonstrated Node.js bug.

Onboarding: the cloud workspace already had Node.js 24.19.0. An unavailable default npm cache directory was an environment issue; using a writable temporary cache allowed installation to complete.

Suggested repeat-use answer: Yes, for this prototype; production storage needs a separate design. Entrant confirmation remains pending.

Evidence: src/server.mjs, src/engine.mjs, scripts/entrypoint-smoke.mjs and tests/engine.test.mjs.

## TypeScript checkJs

Used for: checking JavaScript modules and the serializable browser/engine contract without introducing a frontend build step.

Worked well: the check caught malformed source edits and missing parameter contracts. It covers the server, engine, MCP integration and browser code.

Needs work: the current configuration is non-strict, and portions of persisted JSON are not fully statically typed. Passing this check does not imply strict type safety. No compiler defect was identified.

Onboarding: added a small tsconfig and JSDoc parameter declarations, then ran the check in the aggregate validation command.

Suggested repeat-use answer: Yes, as an incremental safeguard; stricter domain typing is a future improvement. Entrant confirmation remains pending.

Evidence: tsconfig.json, src/contracts.ts and artifacts/check.log.

## jsdom

Used for: testing real browser-page code against the real local HTTP service when the cloud browser could not access the loopback app.

Worked well: DOM tests cover approval controls, changed constraints, reset, proposed-versus-confirmed wording, duplicate clicks, lost HTTP responses and escaping provider text.

Needs work: jsdom does not render layout. Dialog opening is stubbed in tests, so native focus, keyboard behavior, mobile layout, contrast and screenshots remain unverified. These are known scope limits, not a claim of rendering support that failed.

Onboarding: installed as a development dependency. The page source is executed in jsdom's isolated context, and HTTP requests go to a temporary local server.

Suggested repeat-use answer: Yes for DOM behavior, alongside a real browser for visual/accessibility checks. Entrant confirmation remains pending.

Evidence: tests/ui.test.mjs and docs/TEST_REPORT.md.

## AI coding assistance

Used for: product framing, architecture, code, tests, debugging, safety review and documentation.

Worked well: assistance produced a runnable local prototype and regression tests for concrete defects, including approval replay across reset and loss of receipts after infeasible replanning.

Needs work: generated code still required review. The original implementation contained real bugs that were fixed; a passing test suite does not prove contest eligibility or production safety. Current wording and contribution records must be reviewed by the entrant.

Onboarding: used through the assistant's existing coding environment. No model API key or new paid AI service was added to the product.

Suggested repeat-use answer: Yes as supervised development assistance, with review and truthful attribution. Entrant confirmation remains pending.

Evidence: docs/DISCLOSURE.md, docs/CONTRIBUTIONS.md and regression tests.

## Browser preview environment

Attempted use: rendered verification of the locally served application.

Observed limitation: the available cloud browser rejected the loopback address under its URL policy. A separately started execution context also could not connect to the service. The implementation did not disable protections, create a tunnel or publish the app to work around that restriction.

What would help: an officially supported, access-controlled local-preview mechanism visible to the cloud browser. This is environment feedback, not an Alexa SDK complaint.

Current workaround: real HTTP/MCP tests and jsdom interaction tests in one execution context. This preserves useful verification but does not replace screenshots, mobile layout validation or a real demonstration video.

Repeat-use decision: unresolved for rendered app testing until a supported preview mechanism is available. Do not attribute an answer to the entrant.

## Tools not used

No AWS service, closed Alexa preview SDK, live travel API, payment platform, microphone, image/video generator or production LLM endpoint is used in this product. No feedback about their onboarding or reliability is claimed.
