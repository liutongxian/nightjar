# October 2 preparation update

Historical release note, recorded 2026-10-02. The project remained unsubmitted at that time. This release focuses on reproducibility and accurate evidence; it does not add a paid AI service, account access or public exposure.

## Verified changes

- Installed the recovered project's locked dependencies from a clean checkout without node_modules. The install completed with 133 packages.
- Replaced a fixed test port with an OS-assigned ephemeral port. The application still binds only to loopback and prints the actual address. This is used for internal HTTP tests, not to bypass the browser restriction.
- Added a real child-process recovery proof. The actual CLI saves an unknown synthetic transfer outcome, is terminated with SIGKILL, and a different process resumes from disk. Recovery keeps one transfer creation and performs one reconciliation lookup.
- Kept the previous same-process engine-reconstruction proof and relabelled it accurately. It is distinct from the new forced-process-exit evidence.
- Fixed portable setup instructions so judges start in the extracted project directory rather than a vanished absolute workspace path.

## Validation

The aggregate suite passes 48 tests, including the new actual-process recovery regression. TypeScript checkJs and the project-specific syntax/security lint pass. Runtime startup and MCP initialization pass through the actual CLI entry point. See TEST_REPORT.md and artifacts/process-crash-proof.json.

The test kills only the child process it creates with a disposable synthetic state file. It does not terminate unrelated services or inspect credentials. Test servers are stopped afterward.

## Remaining decisions and hard limits

1. A supported rendered-preview route is still unavailable. Browser policy must not be bypassed. Desktop/mobile visual QA and a truthful video recording therefore remain blocked.
2. Source delivery to a GitHub repository needs an authorized account/repository destination and access scope. A public route also needs a license decision; a private route needs explicit reviewer sharing permission when invitations are appropriate.
3. A completed video would need permission for its chosen upload destination and public visibility. No upload is currently available to perform because no video has been recorded.
4. Final project submission requires final review of the entry, contribution/originality claims and submission action. Source publication does not imply that approval.

No new API credential or paid integration is needed for the current reproducible MCP prototype. Further offline polishing would not resolve the remaining gates.
