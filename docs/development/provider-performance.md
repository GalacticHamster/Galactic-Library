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

For a Steam reproduction using only the UI:

1. Open the signed-in Steam Store page with the GL panel.
2. Expand **Steam diagnostics** and check **Profile the next Quick Update**.
3. Click **Quick update**, then wait for the completion and **Timing captured**.
4. Follow **Export timing in GL Settings > Performance diagnostics**, then click
   **Export timing summary** promptly, before the worker restarts.
5. To measure a second update, arm the control again before that update.

The one-scan request belongs to this Steam tab, not Settings or other tabs.
Unchecking cancels it; Full rescan does not consume it. A Quick Update that
needs its initial full baseline still consumes it. Once started, success,
failure and cancellation all leave it disarmed. Reloading/closing the page
clears an unused request. Worker restart cannot rearm it: no persisted request
or message changes the checkbox. Worker buffers can disappear during a scan;
the page submits its completed trace and merged spans to whichever worker
accepts delivery. Lost delivery is reported, without silently retrying or
claiming capture. There is no worker keepalive or permanent profiling setting.

The existing `GalacticSync.setProfiling` interface remains for development,
including Epic. It is separate from the one-scan request and is not needed
for routine Steam testing. The UI does not disable an explicitly enabled
developer session.

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
different value must validate or match the protected current-code session
certificate over its entire authoritative value. See the
[certificate trust model](../architecture/query-validation-certificate.md).
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

Use `--cold-matrix --size=10000` for explicit warm/valid-certificate/no-certificate/
digest-mismatch/data-change/incomplete cases. Every cold case seeds a validated
synthetic library and certificate, then stops the disposable worker and waits
for its service-worker target to disappear. Different worker IDs are asserted.
Only the missing and mismatch cases remove or alter proof. All cases retain
real packaged code, native storage and the production writer/message path.
No provider requests are made. Each case resets its disposable library outside
the timed operation so prior mutations do not contaminate the next proof case.

Rows separate worker preparation/completion from privileged-client transport,
which includes the full database reply and worker wakeup. Capture is explicitly
zero. Read counts, small metadata mutations, validation passes, certificate
read/serialization/hash, snapshot setup and closed fallback reasons are included.
These nested durations must not be summed as independent stages. Metadata counts
cover operations only, excluding background certificate issuance and benchmark
setup. Older comparison roots lack some new substage instrumentation; zero for
those absent spans is not proof of zero cost. The total worker/validation/native
storage measurements remain comparable. Generated reports stay ignored.

For live acceptance after loading the updated extension, check **Profile the
next Quick Update** in Steam diagnostics and run Quick update to establish
current proof, then leave all GL activity idle for at least 60 seconds. Arm
the checkbox again, run another Quick update and promptly export through
Settings. Check that the worker ID changed and preparation shows `certificate_hit`,
serialization/hash and no `read_validation`; unchanged incomplete completion
should still have no full DB write/final validation. Compare a prompt warm
repeat separately. Reload/update and browser restart may lose proof, so the first
run can legitimately validate; do not advertise it as an eligible hit. Actual
records recovered by a scan still require validated saves.

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

## Shared full starts and pending completion design

See [the provider parity matrix](../architecture/provider-sync-parity.md) for
all 14 providers, all 26 store modes, companion/manual purchase imports, current
persistence counts, timestamp consumers and the proposed 22-scenario gate.
Eligible full starts now use durable leases; completion observation receipts
remain deferred. The matrix includes historical and implemented persistence counts.

Run `node scripts/audit-provider-sync-parity.mjs` from a disposable checkout to
reproduce 88 current writer probes and the Xbox retained-record / Fanatical
retained-origin counterexamples. It makes no network requests, uses no private
backup or browser profile and writes aggregate synthetic output under ignored
`audit-artifacts/provider-performance/provider-parity-full-starts.json`. An optional
first argument selects another output inside audit-artifacts.

The probe uses warm query seeding outside measurements, source acquisition of
zero, real writer normalization/validation, synthetic complete-source boundaries
and the structured-clone storage adapter. It is not a live provider scan or
proof of native storage/scheduling time. Metadata co-written with a DB commit
is counted in that DB write; only separate small writes count as metadata writes.
Native observer invalidations are not emulated. Do not use its tiny-library
durations as 1k/5k/10k/14k/20k production benchmarks.

Use `node scripts/benchmark-provider-browser.mjs --full-starts --size=14000`
for warm and genuinely restarted-worker admission/completion samples. `--root=...`
selects a comparison checkout; `--output=...` selects ignored output. Repeat at
1k/5k/10k/14k/20k. Setup/restore and certificate establishment are outside timings.
This mode uses complete Epic snapshots through shared storage, makes no provider
requests, and asserts one completion DB save. The existing `--cold-matrix` retains
incremental missing/mismatched proof controls. Native metrics include reads,
writes, validation, separate lease mutations, publications and observer changes.
Historical synchronous full-start validation is derived only when that start
actually writes; it is explicitly marked in output. Cold snapshot initialization
may publish before admission and is distinct from publishing Running. Worker times
exclude client reply transport; nested spans must not be added together.

The current matrix records before/after samples against `e1597be`. All eligible
starts eliminate the redundant catalog write/validation; successful full completion
still writes observations. Moving that remaining work into receipts requires a
shared materialization, query-evidence, backup and recovery contract. Overall
synchronization parity is not claimed.
