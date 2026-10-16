# Kindle contents performance instrumentation — 2026-10-04

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

This report describes the original instrumentation baseline. The subsequent live investigation and implemented batching/storage/UI fixes are documented in [Kindle contents performance fix](kindle-contents-performance-fix-2026-10-04.md). Current `migration_compare` measures semantic object comparison, and checkpoint operations are batched; the historical measurements below remain unchanged.

Baseline: `9eb31e2`. This is an instrumentation-only change. The commit hash is supplied in the completion message; this report is included in that commit.

## Findings and limits

There is no accidental fixed 10-second sleep in the Kindle contents lookup path. The normal success path has one intentional 1,000 ms post-result delay. Amazon product pages are fetched directly, read as text, parsed with `DOMParser`, and inspected immediately. There is no navigation, Amazon JavaScript execution, polling, DOM settling wait or MutationObserver in this workflow.

Every saved result performs whole-database work. At 14,081 provider records, a disposable offline control measured **1,479.004 ms mean / 1,483.250 ms median per result save**. Database read, validation, migration comparison and write account for **86.384%** of that measured local time; explicit recomputation accounts for **13.594%**. Parsing is negligible in this control. A local-only batch of 100 existing statements took **1,298.486 ms total**, including persistence.

**These measurements do not explain the entire observed live 13?14 seconds.** The control uses Node and structured-clone memory storage, without Amazon, real extension messaging, disk/IndexedDB, rendering or the intentional throttle. The dominant live bottleneck cannot honestly be identified until a signed-in diagnostic sample is exported. No live Amazon requests, intentional failures, personal extension writes or active/background browser experiment were performed here.

The October 2 export was read into a temporary in-memory copy and its SHA-256 was checked again afterward. It remained unchanged. Raw diagnostic data is in [kindle-contents-local-timing-2026-10-04.json](../development/artifacts-and-audits.md#generated-output). It contains timing, generic outcomes, random-format lookup IDs and record counts, without bibliographic or account data. Deterministic offline IDs are unrelated to source records.

## Enable, sample and export

1. Reload GL and refresh the signed-in Kindle Manage Your Content and Devices page.
2. Expand **Performance diagnostics** in the Kindle importer. Check **Record local timing (last 50 operations)**. This is off by default, is not a stored preference, and clears on page reload.
3. Keep GL options open if options-render cost should be measured. Leaving it closed measures the scan without that concurrent UI cost.
4. Select **Scan eligible books** and click **Find contents**. Observe 20?50 completed pages, then click **Pause**. A partial paused request is marked separately. The existing checkpoint/resume rules apply; diagnostics never change the queue or automatically stop after N items.
5. Click **Export timing summary** after the scan and options refresh settle. Copy the selected JSON from the text box. Save it to a file manually if desired. Exporting while scanning omits the still-active lookup; completed operations remain available.
6. Uncheck the diagnostic checkbox to stop starting new traces. An already instrumented lookup may finish. Existing bounded timings remain exportable until the page is reloaded.

The page retains the last **50 operations**, including preparation and local reparse batches. A trace retains at most **512 spans**. The worker separately retains at most 50 options-refresh traces in memory; worker restart clears those optional UI measurements. No telemetry is persisted in the library, backup, storage.local or IndexedDB. No diagnostics are sent to any remote service or normal console.

A collection of 20 successes plus normal empty/unavailable/retry outcomes is sufficient. Do not deliberately provoke CAPTCHA/sign-in or HTTP errors. If every candidate was already checked, **Rescan previous results** revisits them under the existing rules; pause after the sample rather than letting a full rescan run.

For the local control, choose **Reparse saved text (no requests)** with diagnostics enabled. This uses the existing batches of up to 100; the report records batch size, and its duration is per batch rather than per book. It updates parse metadata using existing persistence semantics and preserves reviews. To avoid writing personal extension data, reproduce the disposable offline control instead:

```powershell
node scripts/measure-contents-local.mjs 'PATH_TO_GL_BACKUP.json' 20
```

That script reads the backup, validates it, uses a disposable structured-clone storage area, replays 20 empty and 20 statement-found result saves, and reparses up to 100 saved statements. It never fetches Amazon or writes the input file.

## Recorded stages and accounting

The scan already runs in the signed-in Kindle content script. The worker does not dispatch a product-page fetch through another tab or navigation handshake. `queue_prepare` captures page-to-worker queue preparation, and `save_message` captures page-to-worker checkpoint request and reply. Each enabled request carries a short-lived random diagnostic ID, e.g. `lookup-<random hex>-001`; provider IDs, ASINs and titles are never used as correlation IDs.

Each record has an epoch start, total elapsed time, generic result class, attempts, visibility/focus at its start/end and measured spans. A span contains only a fixed stage name, attempt number, start offset and elapsed duration. Page/worker spans are joined only when their diagnostic IDs agree, using `performance.timeOrigin + performance.now()` to align context clocks. Small differences from browser clock precision are expected.

| Stage | What it measures |
| --- | --- |
| `queue_prepare` | Entire candidate message round trip; once per scan |
| `candidate_selection` | Eligibility, priority sorting and local parse-state checks across the database |
| `attempt` | Each complete product-page attempt, excluding retry backoff |
| `fetch_headers` | Fetch start to response headers; includes browser/network/server scheduling |
| `response_body` | Remaining body download and `response.text()` decoding |
| `dom_parse` | `DOMParser.parseFromString` |
| `page_checks` | CAPTCHA/sign-in selectors |
| `extraction` | Description selectors, text normalization and explicit statement extraction |
| `retry_wait` | Actual elapsed 2/4-second retry backoff, tagged by attempt |
| `save_message` | Save/checkpoint request through worker response |
| `request_dispatch` | Local-reparse request through worker response |
| `worker_total` | Worker handling of preparation/save/reparse, including its writer queue |
| `writer_capture` | Structured clone of mutation arguments at admission |
| `writer_queue` | Waiting behind queued operations and storage initialization |
| `storage_read` | Full database storage read, including clone/transport costs |
| `read_validation` | Whole database validation, including its internal canonical rebuild |
| `migration_compare` | Serializing original and validated database to compare them |
| `migration_write` | Conditional whole-database normalization write on read |
| `entry_validation` | Current-record/source/statement guards and result construction |
| `parsing` | Actual contents parse/proposal generation |
| `enrichment_update` | Source selection/history update |
| `canonical_rebuild` | Explicit full canonical rebuild after a network result |
| `persist_validation` | Whole-database validation before write, including its internal canonical rebuild |
| `storage_write` | Full checkpoint write; real browser reports use storage.local or Firefox IndexedDB |
| `page_ui` | Synchronous importer status update work |
| `throttle` | Actual elapsed post-result 1,000 ms timer |
| `options_read` | Options refresh reads, including queued database access/validation and preferences |
| `options_render` | Entire synchronous options render |
| `options_workbench` | Rebuilding enrichment workbench rows |
| `options_dashboards` | Ownership/receipt, sync, reminder and reading dashboards |
| `options_filters` | Provider controls and full-library genre/filter population |
| `options_selection` | Full-library filtering, sorting, add-on indexing and summary counts |
| `options_cards` | Library card DOM construction for the current page |
| `options_reviews` | Unlinked add-ons, duplicate review and provider history |
| `options_coverage` | Series coverage and alert construction |
| `options_other` | Async companion links and Google Books status refresh |
| `options_total` | Complete options refresh |

The iteration closes at the following iteration boundary, after the measured throttle. The final/stopped iteration closes at scan completion. Start offsets plus durations expose request start, response arrival, extraction, worker receipt, validation, persistence and throttle boundaries. The interval outside measured stages is retained as `unexplained`, including scheduling, small glue work and the gap before the next iteration. It is not assumed to be network time.

`timingMs` is a non-overlapping partition:

```text
total = network + processing + persistence + recomputation + messaging
      + workerOther + ui + throttle + retry + unexplained
```

`parsing` and `extraction` are informational subdivisions of `processing`; do not add them a second time. Raw `attempt`, `save_message`, `worker_total` and options-render spans contain their child spans and must not be summed with those children. `accountingOverlap` exposes excess rather than hiding it when measurement noise or missing/malformed spans prevents the partition from fitting.

Message overhead is the measured round trip minus worker handling, plus writer capture/queue. `workerOther` retains worker time outside specifically measured local stages. Network/body intervals can include browser scheduling and decoding; fetch-header resolution is not a wire-level first-byte measurement. UI durations measure JavaScript/DOM work, not compositor paint; no animation-frame wait was added.

Options refresh is asynchronous and may overlap page/network/throttle execution, so it is reported separately with IDs and `optionsStatsMs`. A diagnostic write notice identifies the next storage-change refresh, and that ID is consumed once. Multiple options windows may produce multiple traces for the same lookup. Independent browser message/change delivery can leave a UI refresh without a correlated notice; absence of an options trace is not proof that render cost was zero. An options page opened after the event cannot reconstruct past rendering. Core page/worker timing is returned directly in the corresponding checkpoint reply and does not depend on that optional notice.

## Aggregate report

Every stage has count, minimum, median, mean, p90, p95 and maximum. Median averages the two middle values for an even sample; p90/p95 use the nearest-rank method. Raw-stage count is the number of operations that actually measured that stage; unmeasured stages have count zero and null statistics.

Separate aggregates cover all network lookups, ordinary single-attempt successes, retries, generic result classes, visible/hidden/mixed visibility, focused/unfocused/mixed focus, preparation and local reparse. Ordinary results exclude failed, paused, CAPTCHA/sign-in and save failures. Per-attempt spans expose which retry was slow; retries do not inflate the ordinary baseline. Network aggregates include items/hour and projected 2,894-request duration, using both mean and median, and percentage of total per non-overlapping stage. Preparation and local batch durations do not receive a per-book runtime projection.

### Offline result-save control

40 saves: 20 empty and 20 statement-found. This is measured local cost, not a live Amazon scan. Milliseconds:

| Stage | Count | Minimum | Median | Mean | p90 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| total | 40 | 1143.723 | 1483.250 | 1479.004 | 1586.457 | 1643.426 | 1658.778 |
| storage_read | 40 | 92.113 | 122.764 | 124.049 | 157.586 | 163.770 | 188.580 |
| read_validation | 40 | 311.917 | 447.228 | 445.847 | 499.194 | 513.035 | 592.894 |
| migration_compare | 40 | 109.688 | 147.766 | 148.381 | 167.026 | 173.877 | 192.479 |
| entry_validation | 40 | 0.052 | 0.085 | 0.101 | 0.171 | 0.199 | 0.209 |
| parsing | 40 | 0.008 | 0.078 | 0.161 | 0.573 | 0.680 | 0.726 |
| enrichment_update | 40 | 0.054 | 0.094 | 0.113 | 0.153 | 0.223 | 0.446 |
| canonical_rebuild | 40 | 146.766 | 196.643 | 200.838 | 248.596 | 256.987 | 271.198 |
| persist_validation | 40 | 327.034 | 428.266 | 433.788 | 489.613 | 504.870 | 546.679 |
| storage_write | 40 | 97.102 | 124.769 | 125.565 | 150.764 | 154.785 | 164.936 |
| writer_capture | 40 | 0.014 | 0.019 | 0.023 | 0.035 | 0.038 | 0.050 |
| writer_queue | 40 | 0.003 | 0.005 | 0.007 | 0.008 | 0.013 | 0.062 |

The synthetic statement-found saves averaged **1,488.705 ms**; empty saves averaged **1,469.303 ms**. A 19.402 ms difference in this small ordered sample is not evidence of material statement-dependent overhead. Amazon HTML download/extraction cost for these classes remains unmeasured.

| Partition | Percentage of measured local save time |
| --- | ---: |
| Amazon/network | Not measured |
| Extraction | Not measured |
| Parsing | 0.011% |
| Persistence/read/validation/comparison | 86.384% |
| Explicit recomputation and entry validation | 13.594% |
| Simulated message envelope, writer capture/queue | 0.002% |
| Other worker work | 0.008% |
| UI | Not measured |
| Intentional throttle | Not part of this control |
| Residual local scheduling/glue | 0.001% |

No network, UI or actual transport observations should be inferred from zeroes in the offline JSON. Its `measurement` field explicitly labels those omissions.

Queue preparation was **600.625 ms**, including 34.230 ms candidate selection. This occurs once per run, not per book.

The one **100-statement reparse batch** took **1,298.486 ms**. Parsing all 100 consumed 6.879 ms, enrichment updates 3.484 ms, and read/validation/comparison/write consumed 1,287.186 ms. There is no additional explicit canonical rebuild in reparse, but the two calls to whole-database validation each rebuild canonical groups internally. One batch is a control, not a statistically representative reparse distribution; JSON still exposes its count/min/median/mean/p90/p95/max as a one-observation series.

For the 40 local saves, the implied rate is **2,434 saves/hour by mean / 2,427 by median**. Repeating only these measured local costs 2,894 times would take **1.189 hours by mean / 1.192 by median**. Adding a nominal 1-second delay per item yields about **1.993 hours by mean / 1.996 by median before any Amazon, durable storage or UI costs**. The user's reported 13.5 seconds/item implies **266.7 items/hour / 10.85 hours for 2,894 requests**. That is an observation supplied by the user, not reproduced here. The live report computes the real end-to-end projection from its own sample.

## Fixed delays and scheduling audit

| Mechanism | Actual behavior | Applies to contents discovery? |
| --- | --- | --- |
| Post-result delay | 1,000 ms after success or checkpointed non-stopping failure, including the last normal result | Yes |
| Transient retry backoff | 2,000 ms after first transient failure; 4,000 ms after second; max 3 total attempts | Yes, retry only |
| Attempt abort timer | 30,000 ms per attempt, cleared in finally; does not wait for timer on success | Yes, timeout ceiling |
| Shared writer queue | Promise chain serializes every read/write and waits for storage protection readiness | Yes, workload-dependent waiting, no fixed duration |
| Storage commit | Native storage.local / IndexedDB transaction promise | Yes, no artificial sleep |
| Options storage change | Immediate refresh on storage.local change, or Firefox private-storage message | Yes if options open, no debounce/polling |
| Importer busy animation | CSS one-second pulse | Visual only, never awaited |
| Diagnostic options notice | Fire-and-forget local runtime message before measured write; no timer/handshake awaited | Enabled diagnostics only |
| Diagnostic notice expiry | 60-second timestamp comparison, not a timer/sleep | Enabled optional options correlation only |
| Kindle library pagination spacing | 300 ms between enumeration pages | Quick update/full rescan import, not Find contents |
| Google Books request gate/timeout | 1,200 ms spacing; 20,000 ms timeout | Different lookup path, not Find contents |
| Google Books options batch spacing | 1,200 ms between Google Books batches | Different enrichment job, not contents refresh |
| Companion Open review timeout | 5,000 ms race | User explicitly opens companion review, not background status refresh |
| Reminder alarms | Daily reminder notification scheduling | Independent; no contents wait |
| Worker wake-up / browser scheduling | Native workload and visibility/power behavior | Potentially; captured in queue, elapsed waits or residuals |

No contents-path 10-second timer, DOM-settling wait, animation wait, readiness poll or automatic repeated pairing handshake was found. No timeout is deliberately awaited after a successful response. The baseline's retry attempt timer remains armed during the retry backoff until its existing finally block; instrumentation preserves that behavior. Pause during a backoff still waits for that existing delay to finish; no cancellation policy was changed. The nominal three-timeout/two-backoff envelope is about 96 seconds before failure persistence, subject to browser scheduling and body/CPU behavior.

## Work proportional to library size

A normal result save performs:

1. Full database read/clone.
2. Full `validateDatabase`, including normalization of active and historical records, review/history validation and canonical reconstruction.
3. Two full JSON serializations to compare pre/post validation. A migration write occurs only when normalization changes the database; the stable control had none.
4. Small per-result guard, contents parsing and enrichment-history update.
5. Explicit full canonical rebuild.
6. Full `validateDatabase` again, including another canonical rebuild.
7. Full database checkpoint write and storage clone/serialization.

That is **three canonical reconstructions per ordinary saved result**, including the two hidden in validation. Calling the save a one-item operation does not make its database cost one-item work. Reparse avoids step 5, but retains both validation rebuilds and its whole checkpoint.

An open options page then queues another full database read/validation/comparison, rebuilds enrichment workbench rows, ownership/receipt/sync/reminder/reading dashboards, full-library filters, filtered/sorted canonical lists, duplicate review and series coverage. Card DOM is paginated to 50, but data preparation still sees the full library. Companion links, Google Books key/job status and reminder settings also require additional queued storage reads. No backup export is invoked per result, but the migration comparison performs backup-like whole-database JSON serialization. Other simultaneously running enrichment/companion operations can add shared-queue wait.

## Active versus background samples

Not measured against signed-in Amazon here. Headless fixture tests are correctness tests and cannot establish foreground browser/power-management performance.

For a small comparison, collect roughly 10?20 completed lookups with the Kindle tab visible/focused, 10?20 with another tab selected, and optionally a separate run with GL options closed. Keep each segment's conditions stable; export promptly so the rolling 50-operation window retains them. The report groups visibility/focus changes separately. Browser foreground visibility and focus are proxies; hidden includes a backgrounded tab or minimized browser, and this instrumentation does not claim to distinguish those situations. Start/end flags can miss a brief intervening visibility change.

Compare `fetch_headers`, `response_body`, `throttle`, `writer_queue`, residuals and the total. If a one-second throttle becomes several seconds while hidden, that is observed timer/scheduling expansion, not a newly added throttle. No browser power-management workaround was implemented.

## Ranked next optimization opportunities — not implemented

1. **Reduce repeated whole-database validation/canonical reconstruction for a contents checkpoint**, while preserving current guards, atomicity, identity semantics and shared writer ordering. This is the strongest measured local opportunity.
2. **Reduce unconditional whole-database serialization/comparison and checkpoint clone/write cost.** Decide on a safe persistence strategy only after native `storage_write` measurements. No batching or cache was added.
3. **Avoid rebuilding inactive options workspaces on every contents save**, if `options_*` timings show substantial cost. Closed options are an experimental comparison, not a code fix.
4. **Address queue contention only if `writer_queue` is large**, using measured competing work. Do not redesign the worker merely because a queue exists.
5. **Investigate Amazon/network or background scheduling if those dominate the signed-in sample.** These cannot be established from the local control. Request rate, sequential behavior, retries and throttle remain unchanged.

## Files changed

| File | Purpose |
| --- | --- |
| `src/lib/contents-performance.js` | Shared classic/module timing, allowlisted projection, bounded collector and statistics |
| `src/providers/kindle.js` | Fetch/header/body/DOM/extraction timing hooks |
| `src/providers/kindle-content.js` | Opt-in controls, page lifecycle/retry/throttle timing and safe export |
| `src/background/service-worker.js` | Correlated timing replies, queue selection timing and optional UI trace collection |
| `src/background/storage-writer.js` | Inert timing hooks around writer queue, reads, validation, parsing, rebuilds and writes |
| `src/ui/options.js` | Optional correlated refresh/render and rendering-substage timing |
| `manifest.json` | Load timing helper before Kindle classic scripts |
| `scripts/runtime-files.json` | Include helper in both release packages |
| `scripts/measure-contents-local.mjs` | Disposable read-only-export local performance control |
| `tests/contents-performance.js` | Focused privacy, timing, correlation, bounds and save-semantics tests |
| `tests/run.js` | Include new focused tests |
| `tests/importers-fixture.js` | Real scan controls with disabled/enabled diagnostics, retry, pause, CAPTCHA and reparse fixtures |
| `tests/browser-fixture.js` | Actual options refresh timing and one-use correlation checks |
| `audit-artifacts/kindle/kindle-contents-local-timing-2026-10-04.json` | Sanitized measured local-control spans and aggregates |
| `docs/audits/kindle-contents-performance.md` | This report and instructions |
| `docs/user-guide/kindle-contents-discovery.md` | Link to diagnostic instructions |

Disabled diagnostics do not create per-operation traces, read timing clocks, collect samples, send timing notifications or add delays. The writer keeps its original Promise scheduling when uninstrumented. Enabled instrumentation adds bounded timing work and one fire-and-forget options notice per write; it never adds provider requests or changes persistence data.

## Validation

- Full GL suite: 286 tests, including existing Kindle contents tests and six new focused diagnostic tests.
- Packaged Chrome importer checks: 28, including opt-in page/worker timing, real 2-second retry wait, pause, safe output and unchanged scan results.
- Packaged Firefox importer checks: 28.
- Packaged Chrome options/UI checks: 44, including correlated refresh and rendering substages.
- Packaged Firefox options/UI checks: 44.
- Offline real-export control: 40 replayed result saves and one local-only 100-statement reparse; source hash unchanged; no Amazon traffic.
- No HB/FAN source changes, database/schema changes, ownership/identity changes, extraction/parser behavior changes, concurrency, write batching, retry changes or throttle changes.

**Recommendation:** Repeated whole-database work dominates the measured local save cost. The next optimization should reduce redundant validation/reconstruction/checkpoint work if the signed-in trace confirms the same bottleneck. Collect a 20?50 lookup live report first to account for the remainder of the reported 13?14-second cycle.
