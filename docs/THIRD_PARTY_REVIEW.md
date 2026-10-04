# Third party dependency and rights review

Inventory recorded 2026-10-03 and source-distribution review updated 2026-10-04 against package-lock.json. This is an inventory to support the entrant's review, not a legal opinion or a claim that all licensing obligations have been fulfilled.

## Locked direct dependencies

| Package | Locked version | Use | License in lockfile |
| --- | --- | --- | --- |
| @modelcontextprotocol/sdk | 1.31.0 | runtime | MIT |
| @types/node | 24.19.0 | development | MIT |
| jsdom | 30.1.1 | development | MIT |
| typescript | 5.9.3 | development | Apache-2.0 |
| zod | 4.6.5 | runtime | MIT |

## Inventory coverage

The lockfile contains 133 non-root package entries: 94 runtime and 39 development entries. Every entry has license metadata. This counts installed paths, not unique upstream projects. The exact inventory is in artifacts/dependency-license-inventory.json.

- Apache-2.0: 2 entries
- BSD-2-Clause: 3 entries
- BSD-3-Clause: 4 entries
- BlueOak-1.0.0: 1 entries
- CC0-1.0: 1 entries
- ISC: 8 entries
- MIT: 112 entries
- MIT-0: 2 entries

The source package does not bundle node_modules. Package archive LICENSE and NOTICE texts have not been downloaded or reviewed during this audit. The license strings alone do not prove compliance, ownership, compatibility with a chosen project license, or permission for any future redistribution. Retain applicable upstream notices when distributing dependency code and review the actual terms for the intended distribution.

## Entrant decisions still needed

- The project-specific source is released under MIT in LICENSE. Dependency code remains separately licensed; the MIT notice does not replace upstream terms.
- Confirm rights to project-specific code, text, design and any future recording, narration or media. AI assistance is disclosed in CONTRIBUTIONS.md and DISCLOSURE.md; do not convert that disclosure into an unverified ownership assurance.
- Record any human-authored changes and third-party assets actually added. Do not claim interviews, manual tests or external integrations that did not occur.
- Review employment, client or other contractual rights if applicable. No such relationship or restriction is assumed here.
- Treat Nightjar as a working name. This audit did not conduct trademark clearance.

## Reproducibility note

Node.js 24.19.0 is the tested runtime recorded in artifacts/reproducibility.json. The locked jsdom 30.1.1 engine range is ^22.22.2 || ^24.15.0 || >=26.0.0, so the old setup wording Node.js 24 or newer was too broad for early Node 24 releases. Setup guidance now points to the tested version. No source-code, dependency or lockfile change was needed.

Source: package.json, package-lock.json, artifacts/reproducibility.json and the project files in this archive. All historical test evidence remains dated 2026-10-02; this documentation audit does not claim a new test run.

## MIT source release review, 2026-10-04

The 133 entries were rechecked against the final lockfile. They declare permissive licenses or a public-domain dedication (MIT, MIT-0, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, CC0-1.0). No copyleft or missing-license entry was found in that metadata. This is a limited compatibility screen for publishing this project's own source under MIT, not an assurance about all downstream distribution obligations.

The published source contains project JavaScript/TypeScript, HTML/CSS, a simple inline SVG favicon, documentation, lock metadata, and synthetic test evidence. It does not contain node_modules, a compiled third-party bundle, external fonts, stock images, recorded media, or a third-party binary. Dependencies are fetched separately by npm. No upstream package is relicensed by the project's MIT file.

If later distributing dependency source or binaries, preserve the applicable upstream copyright and license notices and any required NOTICE material. Check the actual package texts, modifications, and distribution form first. Package archive license/notice contents and ownership have not been independently verified here; trademark and contest eligibility review remain outside this source-distribution check.

License references: [MIT](https://choosealicense.com/licenses/mit/), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), [BlueOak-1.0.0](https://blueoakcouncil.org/license/1.0.0). These links explain general license terms; package-specific notices still control.
