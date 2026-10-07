# Companion lookup latency diagnostics

HB and FAN send lookup timestamps on their `MATCH_ITEMS` requests independently of Kindle acquisition. No contents scan needs to be running. GL retains the last 50 companion requests in worker memory. HB additionally reports preparation, prior-request waiting and post-response processing/rendering durations. These reports are best effort and never delay matching.

To reproduce an intermittent lookup:

1. Reload GL and HB after installing diagnostic changes. Reloading clears the worker's old measurements.
2. Repeat the HB bundle refreshes until both fast and slow results occur.
3. In GL Options, open **Settings → Performance diagnostics → Export timing summary**. This downloads `GL-timing-export.json` with the worker journal, companion lookups and Options timings. The worker ID/start time shown below the button belongs to that export. No Amazon page, signed-in Kindle account or acquisition checkbox is needed. Export promptly because a worker restart clears these in-memory records.

The Kindle importer keeps its existing diagnostics checkbox and export for detailed acquisition debugging. That checkbox controls acquisition tracing only. Acquisition records held by that Kindle page remain available through its own export; Options exports the existing worker API data.

The export's `companions` array contains handler admission, authorization, snapshot hit/read/wait/validation, index hit/build/wait, canonical work, matching execution, response dispatch and callback transport. `client` contains HB durations. `beforeSendMs` starts at content-script initialization, not browser navigation; `preparationMs` begins when that comparison starts. `postResponseMs` ends after processing and DOM annotation/summary updates (or cancellation), not browser paint. `renderOutcome` distinguishes rendered, superseded and incomplete comparisons. Nested/overlapping stages must not be added together twice.

`worker` identifies one worker instance and `workerStartedEpochMs` its module initialization. `snapshotSequence` identifies one validated frozen snapshot object in that worker. It is not a persistent database revision or a content hash. Equal snapshot IDs within the same worker establish that the exact committed object is reused. Different IDs need the activity journal to distinguish startup, a changed database notification, publication, migration or a failed publication. An identical explicit database write can currently publish a new object even when database values are unchanged; instrumentation does not change that behavior.

`work` separates snapshot validation, index construction and execution into work-slice elapsed time (`cpuMs`) and suspended cooperative wait time (`waitMs`). Slice measurements are not hardware CPU samples; a slice crossing a stage boundary is attributed to the current stage. Shared-build waiters report index-wait wall time, not the builder's CPU as their own. Up to 16 waits of at least 50 ms have timestamped `matching_yield_wait` / `validation_yield_wait` intervals for overlap comparison.

`activity` retains up to 192 value-free worker activity intervals: writer operation names, database/settings storage calls, validation phases, Options committed views, internal/external queries, observed changes and snapshot retention/invalidation/publication. `snapshot_compare` times the existing comparison; no extra database hashing/comparison is introduced. Journal intervals show overlap, not exclusive CPU attribution. `dropped` signals truncated history; pending activities are marked. Options reconciliation timings are retained even without acquisition records.

Exported tracing is diagnostic only: no library records, source text, settings values, titles, URLs or client IDs are included. No additional timers or matching-result caches are introduced. Detailed records remain in memory; only the tiny lifecycle summary below survives worker termination. A worker restart clears the in-memory journal and caches; its new startup identity cannot reconstruct discarded detailed events from the prior worker. Native scheduling, garbage collection and extension transport cannot be distinguished solely from an unexplained yield interval and must not be asserted as causes without further evidence.

## Lifecycle breadcrumb across worker generations

The export's `lifecycle` field adds one tiny `storage.session` checkpoint, under `galacticLibraryWorkerLifecycleBreadcrumb`. Only two flat summaries are retained: the current worker and its immediate predecessor. A new worker replaces the older predecessor; this is not a history ring or a saved journal. It contains opaque worker IDs, startup/activity/completion timestamps, allowlisted activity/request types and actual platform event observations. It never contains library data, request payloads, titles or detailed timings, and is excluded from library backups.

`previous` is the prior worker's last **successfully recorded** checkpoint. `current` contains live worker observations. Each summary includes `startedEpochMs`, `lastActivityEpochMs` / `lastActivityType`, `lastCompletedExternalEpochMs` / `lastCompletedExternalType`, and a checkpoint `recordedAtEpochMs`. The export also supplies `lastSuccessfulWriteEpochMs`, availability/write-failure status and `gapFromPreviousRecordedActivityMs` (current startup minus previous recorded activity). This gap is not a measured shutdown time or an automatic idle/active classification. Clock-order anomalies can produce a negative gap, which is preserved instead of inventing an interpretation.

Write cadence:

- One small startup read and write per worker generation, after storage access protection is ready.
- Ordinary instrumented activity updates memory immediately and checkpoints on an existing activity event at most once per **10 seconds**. There is no delayed flush, heartbeat, alarm or polling timer; idle time causes no write.
- Each completed authorized external companion API request checkpoints immediately **after response dispatch**, without making the response await storage. Diagnostic callback/render messages are activity only and do not count as completed companion API requests.
- Actual `runtime.onStartup` / `runtime.onInstalled` observations also checkpoint. Installation reasons are recorded only from the supplied, allowlisted Chrome reason. Pending critical writes coalesce into one follow-up containing the latest summary.

Thus a typical bundle lookup adds one tiny session write on completion, rather than writes for its hundreds of validation/matching events. Ordinary activity contributes at most six attempts per minute, plus startup/completion/platform-event writes. There is at most one session write in flight. No database/storage-writer queue is involved. Failure is diagnostic only; there is no storage.local fallback, matching retry, cache invalidation or lifetime keep-alive. API calls themselves may affect Chrome's idle timer; writes occur on existing activity/completion and do not schedule new wakeups.

Completion means GL dispatched a response, including an error response; it does not establish successful matching or that HB/FAN received/rendered it. Last observed activity covers the existing instrumented worker operations, journal spans, accepted companion diagnostic callbacks, Options timing receipts and actual startup/install observations. It does not measure native storage/GC execution or every possible uninstrumented platform task.

Sampling limitations: activity after the last checkpoint may be missing (normally less than 10 seconds of observed activity between attempts; delayed/failed writes and abrupt termination can lose more). A final completion checkpoint is best effort, so termination before it settles can also lose that completion. The current live fields may be newer than `recordedAtEpochMs`. Session storage survives worker termination but clears when the browser restarts or the extension is reloaded, disabled or updated; the first export after those boundaries can legitimately have `previous: null`. [Chrome storage/session documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas).

`shutdownReason` remains null with `shutdownReasonStatus: "not-exposed"`. Chrome does not provide this code with a reliable per-MV3-worker termination reason. Actual startup/install events are labeled as those events, not as explanations for the preceding worker's exit. Chrome's documented idle rules are useful context, not proof of an individual termination. `runtime.onSuspend` is documented for event pages, has no reason argument, and asynchronous cleanup is not guaranteed; this implementation does not depend on it or add an unload flush. [Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [runtime.onSuspend](https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onSuspend).

## In-memory retention and reset boundaries

| Buffer | Retained data and limits | Eviction/reset |
| --- | --- | --- |
| Worker companion timings | Last 50 completed timing records; allowlisted stages, scheduling/work counters, HB client durations and opaque worker/snapshot IDs. At most 512 timing events per record; at most 16 timestamped waits of 50 ms or more across snapshot/matching work. Aggregate counters still include later waits. | Oldest added/completed record is evicted on the 51st; new worker realm clears everything. |
| Worker Options timings | Last 50 received Options reconciliation records, with at most 512 allowlisted events each. | Oldest receipt is evicted on the 51st; worker restart clears everything. |
| Worker activity journal | Up to 192 completed intervals plus up to 192 active intervals internally; export returns the newest 192 combined intervals by admission sequence. Value-free stages/operation names, safe key categories and snapshot transitions only. | Completed rows evict oldest by completion; active rows evict oldest by admission. `dropped` counts those physical evictions; combined export truncation can hide additional rows without increasing it. Worker restart clears everything. |
| Companion callback correlation | Up to 50 lookup IDs with authorized sender ID (not exported), send/response timestamps and callback/render flags. No matching payloads. | Oldest inserted entry is evicted on the 51st response. Reports older than 60 seconds after response are rejected; expired entries are not swept automatically. Worker restart clears everything. |
| Kindle page acquisition timings | Last 50 finished network/prepare/reparse/checkpoint records in that content-script context, with at most 512 allowlisted events each. Available through the Kindle export, not the worker-only Options export. | Oldest completion is evicted on the 51st; closing/navigating/reloading the page or replacing its script context resets the buffer. Turning off acquisition tracing stops new detailed records but does not clear retained records. |

Collectors also support an explicit internal `clear()` method, with no new user-facing clear/persistence controls. The Options page holds only the transient trace for its current reconciliation and sends the completed trace to the worker. The tiny session lifecycle checkpoint survives a worker reset independently of these buffers; it cannot recover their lost contents.

For a GL Options-page console capture without using the Kindle export UI, the authorized read-only message is:

```js
copy(JSON.stringify(await chrome.runtime.sendMessage({
  type: 'GET_KINDLE_CONTENTS_UI_TIMINGS'
}), null, 2));
```

This copies the same worker companion/activity records and Options timings. It does not start acquisition or alter the database. Opening Options itself can create recorded reconciliation work; the export does not refresh the library or poll the worker.
