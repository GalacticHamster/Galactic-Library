# Offline audit tooling

Run from the repository root with Node.js. Tests and extension packages use committed inputs only; private backups and prior audit runs are deliberately absent from a clean checkout. Generated output defaults to ignored `audit-artifacts/kindle/`; writers create directories and reject output paths outside `audit-artifacts/`.

## Corpus comparisons

The historical Kindle corpus tools require a separately supplied private backup matching the audited SHA-256. They read it without modifying it, use frozen source selections and implementation snapshots, and do not acquire product pages. A different backup must not inherit its ordinal manual labels. Kindle JSON inputs and frozen implementation snapshots use LF line endings so their evidence hashes survive a Windows checkout.

```text
node scripts/audit-contents-parser.mjs <path-to-backup>
node scripts/benchmark-contents-parser.mjs <path-to-backup>
node scripts/check-contents-parser-safety.mjs <path-to-backup>
node scripts/audit-whole-manifests.mjs <path-to-backup>
node scripts/check-whole-manifest-safety.mjs <path-to-backup>
node scripts/freeze-independent-secondary.mjs <path-to-backup>
node scripts/audit-independent-secondary.mjs <path-to-backup>
node scripts/check-independent-secondary-safety.mjs <path-to-backup>
node scripts/audit-named-contents-model.mjs <path-to-backup>
node scripts/check-named-contents-safety.mjs <path-to-backup>
```

Missing private input produces a nonzero error explaining the requirement. The whole-manifest, independent-secondary and named-model tools reconstruct historical comparisons from fixtures; they need no committed replay/frozen result JSON. Output provenance now hashes the minimal pilot-input/parser fixture rather than a deleted generated result. Audit populations, proposal objects and assertions retain their historical definitions. Audit output can contain private-derived records and must remain local.

The named-model tool now expects safe parent-scoped component coverage rather than the false-Owned behavior documented in the historical audit. Its shared synthetic acceptance cases also run in the normal unit suite and packaged Chrome/Firefox UI, without private inputs. They cover actual parent/media boundaries, literal names, unscoped requests, legacy backup reconstruction, ownership gates and unchanged numbered coverage. Parser/source corpus comparisons remain unchanged.

`measure-contents-local.mjs` and `measure-contents-quality.mjs` print offline measurements to the console. `measure-contents-browser.mjs` writes anonymous timings under the ignored directory and uses a disposable Chrome profile. The quality measurement preserves its historical corpus and in-memory writer assertions. `recon-kindle-corpus.mjs` also needs a local control-evidence JSON and historical Git object `092bce4`.

## Source-capture investigation

These tools depend on explicitly generated or restored local run artifacts:

| Tool | Prerequisites / output |
| --- | --- |
| `analyze-kindle-manifest-pilot.mjs` | Input pilot JSON argument; writes pilot metrics. |
| `freeze-kindle-source-sample.mjs` | Private backup; creates the 25-record sample ledger. |
| `replay-kindle-source-sample.mjs` | Local `kindle-source-capture-live.json`; uses disposable Chrome, blocks HTTP/HTTPS, writes DOM replay. |
| `check-kindle-source-safety.mjs` | Private backup, sample ledger, replay, pilot results and pilot metrics. |
| `analyze-kindle-source-sample.mjs` | Private backup, sample/live/replay/safety artifacts and pilot results; writes analysis and per-record Markdown. |
| `render-contents-parser-audit.mjs` | Local parser audit, performance and safety results; writes a new generated report without overwriting the archived investigation. |

The missing-artifact error names the prerequisite and explains that generated results are intentionally not committed. Restore an appropriate private archive or explicitly regenerate prerequisite offline runs. Keep related ledgers/captures from the same experiment together.

The stage-by-stage source analysis is historical: it compares saved acquisition-time parser results with the matching replay and serialization from that experiment. A current whole-manifest replay can legitimately differ from the earlier child-only selection (notably King in Black). Mixing that replay with the old acquisition results correctly fails the equality assertion. Restore the matched historical capture/replay/safety set for that analysis; use the whole-manifest, independent-secondary or named-model audits for current behavior. Do not weaken assertions to make incompatible runs look equivalent.

`recon-kindle-amazon.mjs`, `pilot-kindle-manifests.mjs` and `capture-kindle-source-sample.mjs` perform network acquisition and retain their explicit invocation/authorization guards. Their presence is not permission to run them. Missing artifacts never trigger automatic acquisition. No acquisition is required for normal tests or packaging.

See [artifact policy](artifacts-and-audits.md) and [fixture provenance](../../tests/fixtures/kindle/README.md).
