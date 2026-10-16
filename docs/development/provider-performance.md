# Provider pipeline profiling

Provider performance work should separate account preparation, source capture,
normalization/reconciliation, validation, persistence, and response/UI work.
Do not add overlapping spans to an end-to-end time or call storage-set wall time
physical disk time: snapshot publication also runs inside that wrapper.

## Existing diagnostics and opt-in detail

Settings → Performance diagnostics → Export timing summary includes the bounded
worker activity journal and provider traces. No Amazon page or Kindle tracing
is required. The journal remains always bounded; detailed Steam/Epic page traces
are disabled by default.

For a developer reproduction:

1. Open the signed-in Steam or Epic page with the GL panel.
2. Open browser developer tools. Select GL's **content-script/isolated-world**
   console context, rather than the website's top-level JavaScript context.
3. Run `GalacticSync.setProfiling(true)`.
4. Run Quick update twice (or Sync Epic library twice), waiting for each result.
5. Export the timing summary from GL Settings before the worker restarts.
6. Run `GalacticSync.setProfiling(false)`, or reload the provider page.

The opt-in is page-local, writes no setting, makes no additional provider
requests, and logs no individual records. Traces contain durations, bounded
counts and known stage/provider labels; titles, IDs, accounts and credentials
are excluded. Each existing collector retains at most 50 records, evicting the
oldest. Worker buffers reset on worker restart. Only the existing tiny lifecycle
breadcrumb survives as documented in the diagnostics guide.

`request_dispatch` includes profile readiness, request transport and worker
preparation; its nested worker stages must not be added to it. `provider_fetch`
is the capture call's wall time, including source pacing. `save_message` includes
the worker commit and response transport. `page_ui` ends at the next animation
frame after the status and controls update. Trace total covers the complete
operation. The extra animation-frame wait occurs only with profiling enabled.

Worker records expose normalized/read/written record counts when measured;
these are record counts, not purchase counts or native storage transaction
counts. `validationWork.executingMs` measures elapsed time in validation slices,
not hardware CPU time; `waitMs` measures suspension around cooperative yields.
They do not explain GC or scheduling causes. Byte estimates are confined to the
synthetic adapter; production does not serialize a database just to measure it.

## Repeatable offline measurements

Run `node scripts/benchmark-provider-pipeline.mjs` to exercise the real writer
with synthetic libraries at 100, 1,000, 5,000, 10,000 and 20,000 records, twice
per size. `--sizes=100,1000` narrows it and `--output=audit-artifacts/...json`
selects an ignored result path. It covers first/warm quick checks, incremental
changes, unchanged/changed full scans and failed scans. Source/network time is
zero by design. It is not a live-provider performance claim.

The fixture has multiple providers/accounts, shared titles, ownership states,
manual corrections, collected-book metadata and parent/add-on links. It does
not reproduce the size or contents-parsing cost of a personal inventory.

Run `node scripts/benchmark-provider-browser.mjs --size=10000` for a packaged
Chrome worker and real local storage in a disposable profile. `--root=PATH`
selects a comparison checkout. This uses the privileged storage client to
exercise scan leases and commits; it does not impersonate a storefront sender
or contact any provider. Those client calls return the database, unlike the
compact provider response, so report worker journal timings separately from
message timings. The first request follows seeding; it is not a cold worker
restart measurement. The longer diagnostic command timeout is test-only.

Generated measurements belong under ignored `audit-artifacts/`. Keep fixtures
synthetic and run the regression/package checks without private artifacts.

## Preserved boundaries and remaining cost

Existing-account incremental preparation writes only the scan lease. New
accounts, account switches and full-start bookkeeping retain their existing
commit requirements. Options displays active quick leases without rewriting
the library, and cancellation still invalidates the exact attempt.

Mutable scan reads always read authoritative storage. Validation reuse requires
exact equality with a detached, immutable, validated committed snapshot; a
different value must validate. That proof does not depend on a worker surviving.
Commit passes the checked database into private reconciliation helpers rather
than reading it again. The final database still passes full validation and an
atomic save. Freshness, ownership changes, manual corrections, history and
add-on links remain intact.

The shared writer saves status receipts when exact normalized records and
account state are unchanged, for successful, incomplete, failed and cancelled
attempts. The [receipt contract](../architecture/empty-provider-checks.md) covers
retained successful baselines, reader/backup flattening and recovery. Incoming
observation/access changes, account cursors and successful full scans retain
validated saves. No schema migration or record-level persistence is introduced.
See [Steam outcome diagnostics](steam-outcome-diagnostics.md) to distinguish
recurring candidates without personal data logging or additional requests.

For a comparable baseline use `--writer-root=PATH` with the Node benchmark. Its
matrix includes first/warm/repeated/restarted checks, actual changes, full scans,
partial failure and failure. The restarted harness has no reusable proof.
The matrix also repeats incomplete/failed operations and explicitly restarts
before another incomplete operation, retaining its prior successful baseline.
`benchmark-provider-browser.mjs --matrix --size=10000` exercises the same paths
in an actual packaged Chrome worker, stopping only its disposable worker and
removing the session certificate for the explicit restart case. Worker IDs
confirm a new generation. Use sizes 1000, 5000, 10000 and 20000 and `--root=PATH`
for the browser baseline. Run browser measurements sequentially.

Native matrix timings come from the worker journal; full-scan start includes
one synchronous validation known from its writer path, not an extra journal
span. Database byte estimates serialize the returned database outside timing;
the Node adapter separately measures exact written JSON bytes and small metadata
bytes. Neither estimate is physical storage traffic. Privileged client response
transport remains distinct from the compact production provider response.

Steam candidate App IDs are owned-list IDs absent from saved provider/account
records, including unresolved/unsupported retries. They are not newly purchased
games. Retries remain eligible on later scans; no blacklist or backoff was added.
Unresolved IDs are counted once even when a malformed batch fails after missing
IDs were collected. Request failures stay visibly incomplete. Steam/Epic added
and updated game/add-on counts reuse reconciliation; observation timestamps
alone do not make a product updated. Older backups without these optional
summary counts remain valid. This status-only extension changes neither the
database validator nor its certificate version.
