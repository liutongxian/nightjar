# Actual development friction log

Recorded 2026-10-01. This log is evidence of observed development issues, not a claim that these items qualify for a contest bonus.

1. The first npm operation failed because the default cache directory was unavailable. Re-running with a writable temporary cache completed normally. No credentials were involved.
2. Independent safety review found that resetting the demo reused plan version1. A delayed approval from an older run could match a different new plan. Fixed by preserving monotonically increasing versions across reset and restart, with regression tests.
3. Independent safety review found that an infeasible replan hid previous execution receipts and an unknown supplier outcome. The provider records survived, but the UI checkpoint was lost. Fixed by preserving execution history and displaying saved commitments on the blocked-plan screen.
4. Frontend integration found that a new plan could remain trapped behind an older invalidated approval. Fixed by checking whether the invalidation belongs to the current plan version.
5. The cloud browser rejected the loopback demo URL with ERR_BLOCKED_BY_CLIENT, then refused the error page under its URL policy. Browser access was not bypassed and no tunnel/deployment was used. Rendered-browser visual and responsive checks remain pending; HTTP and jsdom DOM checks are recorded separately.

6. A service started in one tool execution context was not reachable from a separate execution context. The CLI entrypoint and real HTTP/MCP client were then verified together within one context, with the server explicitly stopped afterward. A continuously reachable cloud preview is not claimed.

## Structured entries for review

### Cloud browser cannot reach the loopback app

- Task: inspect the actual application's rendering and record a truthful demo
- Steps: start the HTTP service on its loopback address; open that address with the supported cloud browser
- Expected: the page loads for visual inspection
- Observed: ERR_BLOCKED_BY_CLIENT, followed by a browser URL-policy refusal; a separate execution context also could not reach the service
- Severity: blocker for rendered QA and video, not for local logic/protocol tests
- Workaround used: actual app/client tests within one execution context and jsdom DOM tests; neither is called visual verification
- Actionable suggestion: provide an officially supported, access-controlled preview connection for locally built apps
- Attribution: cloud execution/browser environment; not a reported Alexa or MCP SDK defect

### Default npm cache path unavailable

- Task: install official development dependencies
- Steps: run the normal package install command
- Expected: dependency installation succeeds using the default cache
- Observed: an ENOENT failure creating the default cache directory
- Severity: low; recoverable setup friction
- Workaround used: specify a writable temporary cache directory; installation then succeeded
- Actionable suggestion: configure a writable cache in the execution image
- Attribution: environment setup; not a claim of an SDK packaging defect

### Application review findings

The reset-version replay, lost execution-history, stale approval display and pending-input race were defects in this project's generated implementation. They were fixed and covered by regression tests. They should not be presented as failures of Amazon's tools or as automatic evidence for a tool-friction bonus.

## Second preparation pass

The interface now distinguishes proposed hotel protection from a confirmed receipt, labels same-night arrivals correctly, locks boundaries during pending requests and can recover a discarded successful HTTP response by checking saved state. New tests record these behaviors. A concise actual MCP proof command generates its own transcript; no screenshot or video has been fabricated.

## October 2 reproducibility correction

A release audit found that the old small smoke test described same-process engine reconstruction too broadly, and the README pointed to an obsolete absolute directory. The wording and setup instructions were corrected. A separate actual CLI subprocess is now killed with SIGKILL and restarted under a different process ID to verify durable recovery. These were project documentation and verification gaps, not Amazon SDK defects.
