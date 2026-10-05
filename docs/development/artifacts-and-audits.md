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

Private backups, purchase/account data, browser profiles, sessions, secrets and personal notes stay outside tracked source. Do not put them into fixtures to make a clean checkout pass. Inspect captured evidence for sensitive fields before adding a minimal case. Scripts requiring private input must explain that requirement; they must not acquire source automatically when input is missing.

Before the first public release, perform a **separate historical privacy/artifact scrub**. Current-tree cleanup does not remove old blobs. Keep the exact purge inventory local under `audit-artifacts/repository-hygiene/`; do not commit sensitive findings or rewrite history as incidental cleanup.
