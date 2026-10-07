# Companion lookup latency diagnostics

HB and FAN send lookup timestamps on their `MATCH_ITEMS` requests independently of Kindle acquisition. No contents scan needs to be running. GL retains the last 50 companion requests in worker memory. HB additionally reports preparation, prior-request waiting and post-response processing/rendering durations. These reports are best effort and never delay matching.

To reproduce an intermittent lookup:

1. Reload GL and HB after installing diagnostic changes. Reloading clears the worker's old measurements.
2. Keep a Kindle library tab available, without starting a scan. Repeat the HB bundle refreshes until both fast and slow results occur.
3. In the Kindle importer, expand **Performance diagnostics**, then select **Export timing summary**. The checkbox controls Kindle acquisition tracing; HB/FAN lookup tracing does not require it. Copy/save the exported JSON promptly.

The export's `companions` array contains handler admission, authorization, snapshot hit/read/wait/validation, index hit/build/wait, canonical work, matching execution, response dispatch and callback transport. `client` contains HB durations. `beforeSendMs` starts at content-script initialization, not browser navigation; `preparationMs` begins when that comparison starts. `postResponseMs` ends after processing and DOM annotation/summary updates (or cancellation), not browser paint. `renderOutcome` distinguishes rendered, superseded and incomplete comparisons. Nested/overlapping stages must not be added together twice.

`worker` identifies one worker instance and `workerStartedEpochMs` its module initialization. `snapshotSequence` identifies one validated frozen snapshot object in that worker. It is not a persistent database revision or a content hash. Equal snapshot IDs within the same worker establish that the exact committed object is reused. Different IDs need the activity journal to distinguish startup, a changed database notification, publication, migration or a failed publication. An identical explicit database write can currently publish a new object even when database values are unchanged; instrumentation does not change that behavior.

`work` separates snapshot validation, index construction and execution into work-slice elapsed time (`cpuMs`) and suspended cooperative wait time (`waitMs`). Slice measurements are not hardware CPU samples; a slice crossing a stage boundary is attributed to the current stage. Shared-build waiters report index-wait wall time, not the builder's CPU as their own. Up to 16 waits of at least 50 ms have timestamped `matching_yield_wait` / `validation_yield_wait` intervals for overlap comparison.

`activity` retains up to 192 value-free worker activity intervals: writer operation names, database/settings storage calls, validation phases, Options committed views, internal/external queries, observed changes and snapshot retention/invalidation/publication. `snapshot_compare` times the existing comparison; no extra database hashing/comparison is introduced. Journal intervals show overlap, not exclusive CPU attribution. `dropped` signals truncated history; pending activities are marked. Options reconciliation timings are retained even without acquisition records.

All tracing is diagnostic only: no library records, source text, settings values, titles, URLs or client IDs are logged. No additional timers, persistence or matching-result caches are introduced. A worker restart clears the in-memory journal and caches; its new startup identity helps identify a cold path but cannot reconstruct discarded events from the prior worker. Native scheduling, garbage collection and extension transport cannot be distinguished solely from an unexplained yield interval and must not be asserted as causes without further evidence.

For a GL Options-page console capture without using the Kindle export UI, the authorized read-only message is:

```js
copy(JSON.stringify(await chrome.runtime.sendMessage({
  type: 'GET_KINDLE_CONTENTS_UI_TIMINGS'
}), null, 2));
```

This copies the same worker companion/activity records and Options timings. It does not start acquisition or alter the database. Opening Options itself can create recorded reconciliation work; use the already-open Kindle exporter to minimize that activity during a reproduction.
