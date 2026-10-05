# Kindle contents scan performance fix — October 4, 2026

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Implementation and automated validation are complete. A 50-result native Chrome storage control meets the local-overhead target, but the required signed-in Amazon after sample remains pending. The control must not be mistaken for that live acceptance test. This report is included in the single focused performance commit; its hash is provided in the completion message.

## Confirmed root causes

1. **False migration writes caused by property order.** Chrome's real `storage.local` round trip on the October 2 export produced database objects whose values were equal to their validated versions, but whose JSON strings differed. The previous string comparison therefore requested a migration on every read. The live sample showed 50 migration writes for 50 lookups, averaging 1.544 seconds per lookup. The native control independently reproduces the inequality using actual Chrome storage, without imitating its ordering in a mock.
2. **A complete database lifecycle for each small result.** Every save read and validated the database, processed the result, explicitly rebuilt canonical items, validated again and wrote the complete database. Validation also performs its existing internal reconstruction. On 14,081 provider records this dominated the live iteration, even for empty results.
3. **Options refreshed expensive views after storage notifications.** Both migration and ordinary result writes could trigger whole-library refreshes. The measured Options read/render/status work overlaps the scan; it must not be added to the page's 14.209-second lifecycle as if it were sequential.

Removing the false migration eliminates that migration's storage write and change notification. It also eliminates the Options refresh/read/render that such a notification could trigger, and the extra full database validation performed by that refresh. Genuine migrations retain their existing normalization and Google Books job remapping. The ordinary result write still notifies listeners, now once per bounded batch rather than once per result.

## Exact implementation

### Migration detection

`equalDatabaseData()` compares validated JSON-shaped values recursively. Object insertion order is irrelevant; array order, missing keys, values and object/array distinctions remain significant. It does not sort, serialize or clone either database. Full schema validation still precedes comparison.

On the native stored/validated export, ten comparisons averaged **46.190 ms** for the new comparator versus **80.400 ms** for the old two-string comparison. The old comparator returned unequal; the new comparator returned equal. The comparator remains a whole-database traversal, now paid per checkpoint/read rather than every scan result.

### Bounded persistence

The signed-in content script buffers results and sends them through the existing `SAVE_KINDLE_COMIC_CONTENTS` route in groups of **at most 20**, or after **60 seconds since the previous successful checkpoint**, whichever comes first. The elapsed-time threshold is checked at completed-result boundaries; an existing request, retry or checkpoint can extend the wall-clock interval. There is no independent background fetch timer.

Every checkpoint uses the existing serialized writer. It reads the current database rather than persisting a cached snapshot, checks current record references/source URLs, processes every entry, rebuilds with the existing rules, fully validates, and performs the existing atomic storage write. Validation is not disabled, cached or weakened. No schema, backup, matching, identity, ownership, contents extraction, canonical grouping, provider importer or HB/FAN API change is introduced.

Successful acknowledgements remove the buffered prefix. Failed checkpoints retain it, stop further Amazon requests, and permit the handled-stop tail flush to retry. A save failure is not recategorized as a failed Amazon page and cannot erase previously discovered text.

Pause aborts the current request and flushes completed results. Normal completion, CAPTCHA/sign-in stops and handled errors also drain the tail. A normal scan subsequently uses the existing eligibility plan and skips durable current results.

**Durability tradeoff:** a hard tab/browser crash or abrupt navigation can lose up to **20 unacknowledged scan results**, requiring those lookups to be repeated. Already committed library data remains durable. An acknowledgement lost after a successful write cannot corrupt the database; normal scan planning observes the durable result. A crash during a failed checkpoint can require repeating its retained batch. Explicit Rescan mode still intentionally revisits all eligible books rather than maintaining a separate durable rescan cursor.

### Lightweight Options progress

A separate worker-memory channel sends validated counts and a random run reference, without titles, ASINs, statements, accounts or provider record identifiers. It bypasses the database writer queue and stores nothing in the library or backup. Progress is limited to eight provider tabs and records checked/total/remaining, found/empty/unavailable/failed outcomes, local reparses, pending results, durable count and phase.

The small Options status element updates independently of the Library, enrichment, duplicate and history DOM. Database notifications mark full reconciliation as pending while a scan is active. A dirty view refreshes at a **120-second bounded interval**, on pause/completion/stop/interruption, or through **Refresh library now**. Simultaneous refresh requests are coalesced; completion during an in-flight refresh schedules a final reconciliation afterward. A failed idle/final reconciliation retries after 30 seconds, avoiding a permanently stale view or an immediate retry loop.

Options polls lightweight worker state every **30 seconds while active**. Worker restart, failed state retrieval and tab close/navigation clear interrupted activity and reconcile dirty data. Heartbeats older than ten minutes expire. Progress is deliberately ephemeral; the saved library, not worker-memory counts, determines resume eligibility. Explicit user actions that already update the UI from their results continue doing so.

### Amazon behavior

Requests remain sequential, with the existing **1,000 ms post-result delay**. Transient failures retain the existing **two/four-second backoffs, maximum three attempts and 30-second attempt timeout**. CAPTCHA and sign-in protections are unchanged. No additional Amazon concurrency or aggressive scheduling was added.

### Diagnostic accounting

Checkpoint time is charged to the associated network result when possible. Pause/stop tail checkpoints without a live result trace are recorded separately as `kind: checkpoint`, with aggregate checkpoint stages and `finalCheckpointMs`. For a live comparison, include standalone checkpoint cost in the per-result mean; do not omit the tail or use the fast-item median to project a whole scan. Preparation and local reparse remain separately measured. Diagnostics remain opt-in and bounded to the last 50 operations.

## Before and measured control after

The before column is the user's **50-request live** `GL-timing-export.json`. The after column is a **50-result offline native Chrome 153 control** using the actual packaged writer and actual `chrome.storage.local`, seeded from a read-only copy of the October 2 export. It alternates 25 generic statement-found and 25 empty results. It runs without Amazon, the one-second delay, content-to-worker transport or an Options page. These are different measurement environments.

Raw anonymous after measurements: [native Chrome control JSON](../development/artifacts-and-audits.md#generated-output). The source export hash was checked before/after and remained unchanged. No personal extension profile or installed library was changed, and no provider requests were made.

| Measure | Live before | Native storage control after | Signed-in live after |
|---|---:|---:|---|
| Results | 50 requests | 50 replayed results | Pending, at least 20/preferably 50 |
| Total mean/item | 14.209 s | **0.194 s local work only** | Pending |
| Total median/item | 14.247 s | 0.000 s at timer precision for buffered items; excludes network/delay | Pending |
| DB read/validation/comparison/write, amortized/item | 9.097 s | **0.181 s** | Pending |
| Writer queue/message overhead/item | 1.400 s | Actual writer capture/queue included; content-to-worker transport unmeasured | Pending |
| Explicit canonical rebuild/item | 0.454 s | 0.012714 s | Pending |
| Recomputation including entry/enrichment work/item | 0.454 s | 0.012758 s | Pending |
| Amazon headers/body/item | 2.225 s | Not measured | Pending |
| Intentional delay/item | 0.985 s observed; nominal 1.000 s | Not run; production nominal 1.000 s retained | Pending |
| DOM/extraction/parsing/page checks/item | 0.01653 s | Saved-statement parsing 0.000042 s; HTML extraction unmeasured | Pending |
| Migration writes | 50; 1.00/item | **0; 0.00/item** | Pending |
| Regular/checkpoint writes | 50; 1.00/item | **3; 0.06/item**, batches 20/20/10 | Pending |
| Options database/preferences read per measured refresh | 4.636 s | Not timed; packaged DOM tests verify no per-result rebuild | Pending |
| Options render per measured refresh | 1.764 s | Not timed; periodic/final reconciliation tested | Pending |
| Options other/status work per measured refresh | 8.079 s, overlapping | Not timed | Pending |

The native mean checkpoint took **3.233 seconds**, of which the durable storage write averaged **1.565 seconds**. The control's near-zero buffered-item median is expected: 47 results require no writer operation, and three results bear the checkpoint cost. It is not a claim that a live lookup takes zero time.

Measured native per-checkpoint costs:

| Stage | Mean/checkpoint |
|---|---:|
| Storage read | 0.412 s |
| Read validation | 0.474 s |
| Semantic migration comparison | 0.058 s |
| Explicit canonical rebuild | 0.212 s |
| Persist validation | 0.510 s |
| Storage write | 1.565 s |

### Projection for 2,894 requests

The live before mean projects to **11.423 hours**. Combining the baseline Amazon mean (**2.225376 s**), unchanged nominal delay (**1.000 s**) and native control's amortized local cost (**0.193992 s**) gives a conditional model of **3.419368 s/item**, or **2.749 hours** for 2,894 requests.

This is a projection, not a measured live after runtime. It excludes initial preparation/local reparse, periodic Options contention, real message scheduling, retry/error variation and background-tab throttling. The control meets the preferred <0.5-second local target; the signed-in <1-second acceptance and real-world improvement are still unverified.

## Tests and results

All commands passed:

| Command | Result |
|---|---|
| `npm test` | **296 tests** |
| `npm run test:browser:release` | **48 packaged Chrome UI checks** |
| `npm run test:browser:firefox` | **48 packaged Firefox UI checks** |
| `npm run test:importers:release` | **29 packaged Chrome importer checks** |
| `npm run test:importers:firefox` | **29 packaged Firefox importer checks** |
| `npm run test:firefox:companions` | Installed GL/HB/FAN integration passed, including Firefox private storage, real messaging, ownership overrides and contents/Partial matching |
| `npm run check:package` | 98 runtime files validated |
| `npm run check:package:firefox` | 98 runtime files validated |
| Native Chrome export control | 50 results; no migration writes; three validated checkpoints; input unchanged |
| `git diff --check` | Passed |

Added ten focused unit/worker regressions cover order-independent equality, actual differences, stable reads under reordered storage, genuine legacy migration/backup compatibility, count/time checkpoint bounds, acknowledgement retention, failed/stale atomic batches, pause/final persistence, restart tail eligibility, unchanged ownership/grouping/reviews/proposal semantics, private bounded progress, interruption/expiry and sender restrictions, and standalone-tail diagnostic accounting.

Four packaged UI regressions verify progress/storage updates leave the Library DOM intact, completion rebuilds persisted state, bounded periodic/worker-restart reconciliation, completion during an in-flight refresh, and delayed retry after a failed final reconciliation. An additional real importer-UI regression holds the second request, pauses with the first result still buffered, verifies its persistence, and confirms resume checks only the interrupted page. Existing pacing/retry/CAPTCHA/local-reparse, contents interpretation, permanent matching and ownership tests remain passing.

## Files changed

| Files | Purpose |
|---|---|
| `src/lib/data-equality.js`, `src/background/storage-writer.js` | Order-independent migration detection |
| `src/lib/kindle-contents-scan.js`, `src/providers/kindle-content.js` | Bounded buffers, flush lifecycle, count projection and importer help |
| `src/background/service-worker.js` | Lightweight progress hub and tab interruption |
| `src/ui/contents-scan-progress.js`, `src/ui/options.js` | Small progress display and deferred/coalesced reconciliation |
| `src/lib/contents-performance.js` | Standalone tail-checkpoint accounting |
| `manifest.json`, `scripts/runtime-files.json` | Include new runtime modules in both packages |
| `tests/kindle-scan-performance.js`, `tests/contents-performance.js`, `tests/run.js` | Focused storage/lifecycle/privacy/timing regressions |
| `tests/browser-fixture.js`, `tests/importers-fixture.js` | Actual packaged UI pause/progress/reconciliation regressions |
| `scripts/measure-contents-browser.mjs` | Repeatable native Chrome storage control in a disposable profile |
| This report, `kindle-contents-browser-control-2026-10-04.json`, `kindle-contents-performance.md`, `kindle-contents-discovery.md` | Measured evidence, updated lifecycle documentation and baseline cross-references |

## Remaining bottleneck and required live check

The largest remaining measured local checkpoint component is the durable whole-database write, followed by the two validation passes. They are amortized rather than removed. After this change, Amazon latency and the intentional delay should dominate steady-state work if the native control approximates the user's browser. A periodic Options refresh can still contend with a checkpoint, and Firefox's private IndexedDB timings have not been measured on this real export. No further validation/canonical redesign is justified without the after trace.

To finish live acceptance, reload GL and refresh the signed-in Kindle content page. Keep Options open as in the baseline, enable timing, run the same discovery mode for at least 20/preferably 50 completed lookups, then pause, wait for the tail save and final Options reconciliation, and export the timing JSON. The diagnostics retain 50 operations rather than 50 guaranteed successes; preparation/reparse/paused/tail records can occupy some slots. Analyze the actual network-result count, checkpoint batch sizes and any standalone tail costs together. Preserve the visibility/focus conditions and do not deliberately provoke CAPTCHA or retry failures.

The offline control is reproducible without personal-library writes:

```powershell
node scripts/measure-contents-browser.mjs 'PATH_TO_GL_BACKUP.json' 50 'PATH_TO_ANONYMOUS_REPORT.json'
```

The optional output argument writes UTF-8 directly, avoiding PowerShell redirection encoding differences. The script uses a fresh temporary extension/profile, checks that the source export is unchanged, reports anonymous allowlisted timing only and removes its temporary storage afterward.
