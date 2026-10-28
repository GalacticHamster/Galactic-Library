# Artifacts and audits

Source control preserves code, useful documentation, reproducible tools and minimal evidence. **If a file is deterministically reproducible output, do not commit it. If a file is the minimal input required to reproduce a permanent regression, commit it as a fixture.**

| Location | Keep here |
| --- | --- |
| `docs/user-guide/` | Current feature behavior and user instructions. |
| `docs/architecture/` | Current contracts, invariants and known design limitations. |
| `docs/development/` | Development, packaging and validation instructions. |
| `docs/audits/` | Selected historical engineering reasoning. This is a selective archive, not a dump of every run. Label historical counts and versions as historical. |
| `tests/fixtures/` | Minimal synthetic or sanitized captured inputs, expected regression assertions, and narrowly necessary frozen implementations/manual annotations. Record purpose and provenance; exclude account state and personal inventories. |
| `scripts/` | Reproducible development tooling. |

The two matching matrices in `tests/` retain their existing paths for cross-repository parity. Kindle inputs live in `tests/fixtures/kindle/`. The title-free corpus labels are manual semantic annotations for a separately supplied private backup, not a committed library catalogue. Captured manifest fixtures retain bounded public source and exact historical selection coordinates needed by existing source-selection regressions; they exclude result dumps, accounts, timestamps and library record IDs.

## Generated output

Use ignored `audit-artifacts/`, normally `audit-artifacts/kindle/`. Audit writers use `scripts/audit-artifacts.mjs` to create directories and keep output inside that ignored tree. Replays, comparisons, frozen *run ledgers*, safety results, timing exports and generated Markdown belong there. A filename containing “frozen” does not make output a fixture: inspect how it is produced and consumed.

Do not add output with `git add -f`, ignore all JSON, or copy a complete result dump into fixtures to satisfy a test. Extract only the necessary source input or manual annotation. Check that tests and packaging work without local audit artifacts. Regenerating a report must not overwrite an archived engineering document automatically.

Run `npm run check:repository` to check local Markdown targets, misplaced tracked/generated material, personal path patterns and test dependencies on documentation JSON. This is a layout check, not a comprehensive secret or history scan. Also run `npm test` and both packaging checks from a clean checkout without private inputs; use the browser/importer suites when changes affect their fixtures or packaged resources.

Private backups, purchase/account data, browser profiles, sessions, secrets and personal notes stay outside tracked source. Do not put them into fixtures to make a clean checkout pass. Inspect captured evidence for sensitive fields before adding a minimal case. Scripts requiring private input must explain that requirement; they must not acquire source automatically when input is missing.

Before the first public release, perform a **separate historical privacy/artifact scrub**. Current-tree cleanup does not remove old blobs. Keep the exact purge inventory local under `audit-artifacts/repository-hygiene/`; do not commit sensitive findings or rewrite history as incidental cleanup.

## Offline numbered-parser replay

`node scripts/replay-contents-proposals.mjs FROZEN_SOURCE_LEDGER audit-artifacts/numbered-precision/replay.json` compares complete parser-4 and current manifest-review proposals without acquisition, source selection or storage writes. The private ledger must declare `referenceValuesUsed: false` and supply `records` with `inSavedCorpus`, `providerItemId`, `title`, `sourceGeneration`, `metadata.series`, `auditSource` and the frozen complete `proposal`. Human reference values must be evaluated separately; they must never be used as `auditSource` or to repair it.

The tool asserts the historical snapshot reproduces the frozen proposals, repeats current replay for determinism, compares added/removed/modified entries and complete outcomes/unresolved lists, and benchmarks nine alternating warm passes. Output includes full source/proposal objects and therefore stays ignored. The caller must inspect changed records and apparent disagreements; automatic counts do not establish correct bibliographic identity or source completeness. It fails when private inputs are missing rather than downloading replacements. Standard tests and packages require no private ledger.

## Audit document maintenance

When an implementation change fully resolves findings in a tracked audit document, update that document in the same implementation commit or remove it only if it is obsolete, contains no unique enduring technical information, and no active workflow depends on it. Preserve architectural decisions, contracts, recovery procedures, regression cases, diagnostics and unresolved limitations. Check source, test, script and documentation references before removal; retain uncertain material and label historical findings clearly rather than presenting them as current behavior. This policy applies to future ordinary commits and does not authorize rewriting history.
