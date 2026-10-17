# Provider synchronization parity: shared scan starts and completion gate

## Observation completion update — October 17, 2026

Stage 2 enables bounded observations after the existing importer proves an
exact closed observation/success-state delta. Proven ordinary unchanged full
scans and supported quick subsets use zero full writes/validations and one
receipt commit. Changed/unsupported scans retain the validated save. Console full
scans retain it because their current additive health mode is incremental; their
existing semantics were not changed. Empty/incomplete/failed/cancelled checks keep
their established status behavior. Fanatical origins and Kobo clocks are scoped,
not indiscriminately refreshed.

The extended 156-case full-save oracle probe covers all 14 providers/26 modes,
with 23 receipt cases and exact effective results. It retains the two existing
PlayStation empty-list rejections without explicit zero totals. The original
88-case baseline probe also remains useful; its writer has optimization disabled
to keep the original persistence oracle. See the
[completion/recovery contract](unchanged-full-scan-completion.md) for the enabled
classes, native restart/quota tests, benchmark distributions, fallback exceptions
and live Epic profiling instructions. Its correctness and controlled cold-matching
gates pass. The original performance stop is explained by overlapping Options
work/scheduling variance and a small duplicate packet-validation pass, now removed;
the initial measurements remain historical evidence. No overall provider acquisition parity or
real-library performance result is implied. The sections below describe the
earlier lease-only baseline where they say completion always saves the database.

**Baseline: `b75ab51`; shared lease-only starts implemented October 17, 2026.**
Eligible repeated full scans now announce Running through the existing durable
scan lease, without a catalog write or redundant semantic validation. Completion
still performs its validated full save. This implements the first bounded
improvement, not overall synchronization parity. Moving record and purchase-origin
observations out of completion writes remains a separate freshness-model design.

The [unchanged full-scan completion investigation](unchanged-full-scan-completion.md)
compares versioned observation overlays with provider segments and a hybrid using
disposable native experiments. It recommends a reader-first, bounded overlay design
for a subsequent approved task; current full completion remains unchanged, and
overall synchronization parity is not marked complete.

## Implemented admission contract

`beginProviderScan` shares lease admission between full and incremental modes.
For full mode it requires the same active immutable profile, connected state,
successful full baseline, unchanged account binding, and an exact validated
committed database. Console fingerprints remain mandatory. The lease is durably
written before acquisition is admitted. Existing status consumers project Running
from that lease; the catalog is not published merely to announce the attempt.

First imports, account switches, disconnected/no-baseline profiles, changed console
bindings and writers without immutable query-snapshot support retain the existing
validated start save. Missing/mismatched cold certificates require ordinary read
validation to establish the exact committed base; that required validation is not
skipped or counted as redundant. A valid cold certificate can reuse its proof.

Full leases pin the SHA-256 digest of the complete raw committed database in
existing scan metadata. Completion rereads authoritative storage and checks the
base, profile, token, sender tab, mode and console fingerprint. The pinned base is
checked again immediately before the validated save, including mutations observed
during cooperative validation. A catalog change, even in another provider, rejects
this full result and requires a fresh scan; it cannot overwrite newer data. Small
status receipts from an independent provider do not change that raw catalog and
remain compatible. This conservative restriction avoids a new reconciliation model.

Replacement completion still validates source boundaries, reobserves returned
records/origins and reconciles absence/history. Console completion remains additive
and retains older unobserved records. Both use one validated save and publish the
result. No observation, ownership, import, backup or schema semantics changed.

Failure/cancellation use existing terminal receipts without advancing successful
dates or record evidence. Interrupted leases remain Running/long-running, survive
worker restart, and can be cancelled, resumed by a valid token, or replaced by a
new attempt. No expiration/keepalive policy was added. Restore/clear retire old
leases, including restoration of an identical backup. A failed admission write
does not authorize acquisition; a lost reply after a durable write remains
recoverable through the same cancel/replacement controls.

## Common paths and account guarantees

All 14 registered providers in [constants.js](../../src/lib/constants.js) are
inventoried below. Each store action uses its `src/providers/*-content.js`
panel, [floating-panel.js](../../src/providers/floating-panel.js), the worker's
`GET_PROVIDER_SYNC_STATE` / `COMMIT_PROVIDER_SCAN`, and the queued
[storage writer](../../src/background/storage-writer.js). Fandango additionally
persists a resumable movie/TV capture in `FANDANGO_IMPORT_STATE`.

The shared session binds the selected immutable profile ID, active profile,
nickname confirmation/remembered-profile checks, sender tab and scan token.
For ordinary store providers the nickname is a user confirmation, **not** an
automatically verified store account ID. Automatic profile reuse requires one
connected account with a successful prior sync. Nintendo/PlayStation/Xbox also
bind a source-account fingerprint and recheck it at commit. No nickname-only
shortcut may replace those stronger checks.

All writer reads remain authoritative. Exact immutable committed-value equality
or the protected session certificate may reuse validation; neither certifies
incoming data. Validated real commits publish a new immutable snapshot, issue
current proof, and reconcile/retire existing status receipts. Changed bases,
stale tokens, wrong tabs, switched accounts, clear/restore and completed leases
retain their current guards.

## Every exposed store operation

Q = Quick update; F = Full rescan. These labels describe the actual operations,
not assumed equivalence of acquisition and persistence. Each adapter is linked;
its adjacent `*-content.js` provides the listed entry point.

| Provider / entry point | Acquisition and complete boundary | Meaning of omission / history | Normal unchanged Q result and limitation |
| --- | --- | --- | --- |
| [Steam](../../src/providers/steam-store.js), Q/F | Q reads owned IDs, resolves candidates absent from this account's saved IDs; F resolves all owned IDs. Valid games/DLC and index-complete proof; unresolved IDs prohibit replacement. | Successful F is replacement; missing saved rows enter provider history, not refund inference. | Usually empty candidates -> status receipt. Unavailable/unsupported IDs remain retryable. A returned existing record refreshes observation and writes. |
| [GOG](../../src/providers/gog.js), Q/F | Newest-first purchase pages; Q stops at known page. F completes visible and hidden sections with pagination/count checks. | Only F absence is reconciled into history. | Empty -> receipt; Q does not recheck every known title. |
| [Epic](../../src/providers/epic.js), Sync Epic library | Complete cursor traversal, finite-page/repeated-cursor/catalog guards, supported catalog items. No Q exposed. | F replacement archives omitted supported records. | Eligible full start uses a lease; completion still refreshes observations. |
| [Amazon Games](../../src/providers/amazon-games.js), Q/F | Q scans past-three-month claim window; F enumerates exposed calendar years and completed scroll scopes. Only Amazon-delivered games retained. | Only successful F replacement establishes absence within this supported claim scope. | Often returns existing recent claims, so observation changes write. Empty writer checks qualify, but no-readable-claim acquisition can throw; do not promise an empty successful UI scan. |
| [Audible](../../src/providers/audible.js), Q/F | Date-added pages; Q stops on known page; F requires terminal pagination/available count evidence. | F absence -> history; subscription/unknown access remains source-dependent. | Empty -> receipt; Q is not a complete access recheck. |
| [Kindle](../../src/providers/kindle.js), Q/F | Separate books/personal-documents sections, counts, pagination and explained duplicates. Q returns new IDs and bounded refreshed access evidence where implemented. Contents discovery is a separate acquisition, not library sync. | Valid F absence -> history; disappearance never means refund. Explicit source access/returns and user overrides remain distinct. | Empty -> receipt; returned existing access evidence/observations can require a save. |
| [Amazon Video](../../src/providers/amazon-video.js), Q/F | Most-recent-addition DOM groups; Q stops at known group. F requires stable end and available expected count. | F absence -> history within this captured view, not a revocation claim. | Empty -> receipt; DOM/card and scroll bounds are real limitations. |
| [Fandango](../../src/providers/fandango-at-home.js), Q/F | Recently Purchased movie/TV View All grids; Q stops at known titles. F validates both media counts. Multi-page capture resumes under its saved scan context. | F absence -> history only after both sections validate. | Empty -> receipt; session/capture metadata remains necessary and is not a catalog write. |
| [Kobo](../../src/providers/kobo.js), Q/F | Q reads newest My Books pages to known boundary but refreshes every observed card; F adds exposed archives/audiobook sections. Pagination/count validation remains. | F omission -> history; sparse metadata cannot erase richer evidence. | Existing unchanged sparse cards retain their previous representation and dates -> receipt even with nonempty Q input. F advances observedAt while retaining unchanged updatedAt. |
| [Humble](../../src/providers/humble.js), Q/F | Purchase index plus unknown/explicit refresh purchase details; F validates complete purchase traversal. Redemption values redacted. | F absence -> history; Q never removes omitted orders/products. | Empty with identical known-purchase cursor -> receipt. Cursor movement or returned records requires save. |
| [Fanatical](../../src/providers/fanatical-content.js), Q/F | Signed-in page projects validated completed-order history; Q skips known fingerprints. F requires completed coverage; array-only index is explicitly limited. | F replacement/history remains; native purchase occurrences merge with retained origins. | Empty with same fingerprints -> receipt. New cursor, origin evidence or observation changes writes. |
| [Nintendo](../../src/providers/nintendo-capture.js), Import loaded cards | Complete loaded **non-hidden Virtual Game Cards** list, counts, account/owner/user and supported scopes; import is full-mode but **additive**. | Omitted/hidden/other-platform records retained; this is not full purchase history. | No Q exposed. Eligible F writes once at completion. Reobservation covers only returned cards, not all saved account records. |
| [PlayStation](../../src/providers/playstation-capture.js), Q/F | Both traverse supported active PS4/PS5 Purchased listing; account verification and terminal pagination. Both commits are **additive**. | Earlier saved items retained; older consoles, inactive/other listings are not proved absent. | Q starts lease-only, but writes returned observations and snapshot evidence. Complete listing is not complete lifetime ownership. |
| [Xbox](../../src/providers/xbox-capture.js), Q/F | Complete account-scoped web-visible Owned catalog from validated site cache; both actions are **additive**. | Retain prior records outside web-visible supported catalog. No inference of revocation from omission. | Q starts lease-only, but writes returned observations and supported-snapshot evidence. Console/full purchase history remains out of scope. |

All full acquisition boundaries still pass
[provider-snapshot.js](../../src/providers/provider-snapshot.js). Console commits
add their stricter account, scope and source-contract checks. Empty responses are
not universally complete: a full snapshot needs explicit zero totals where
appropriate; several live adapters reject no-readable-library results. Duplicate
normalization/deduplication and malformed-source rejection must be tested at the
adapter boundary; a synthetic writer fixture is not evidence of page completeness.

### Additional purchase synchronization paths

Humble and Fanatical also expose **Connect and sync**, automatic saved-purchase
updates, and advanced manual purchase sharing/import. These converge on
`importPurchaseSnapshot` and
[purchase-handoff.js](../../src/background/purchase-handoff.js), not the store
scan replacement path. Standing consent, verified companion identity, account
stamp, active-scan exclusion and commit-time consent remain mandatory. These
imports are additive, preserve existing observation dates/ownership, and skip
the DB write when no records or account label change. They are not evidence
that the store was reobserved. Changed imports still use full validated saves.
Cross-provider snapshots/Steam activations must not become extra purchases.
If `importPurchaseSnapshot` is actually invoked, its ordinary `getDatabase()`
read still semantically validates the full database even when the eventual
apply is unchanged. The automatic coordinator may avoid an import earlier by
comparing meaningful snapshots; that is not a universal writer-level no-op
validation guarantee. This separate read-proof opportunity must also be tested
in a future parity implementation, preserving commit-time consent/account checks.

Legacy unscoped provider messages are rejected after profile migration; they
are not an extra supported optimization route. Backup restore, book enrichment,
Kindle contents acquisition/reparse and ownership correction are distinct data
operations, not zero-change provider syncs.

## Historical baseline persistence matrix

Measured by [the offline probe](../../scripts/audit-provider-sync-parity.mjs):
14 providers, all **26 exposed store modes**, 88 isolated writer probes plus
two observation counterexamples. All inputs are synthetic. Counts below exclude
seeding and reporting reads. No acquisition/network/browser latency is simulated.

`writes/validations` counts full DB commits / full semantic validation calls.
F = repeated identical **substantive** complete contents, not identical timestamp
bytes. Q empty = no returned item observations and unchanged cursor. Q overlap
= an existing item returned again (normal for some adapters; a writer boundary
case rather than a normal no-change Steam/GOG/etc. acquisition).

| Provider | F writes/validations | Q empty writes/validations | Q overlap writes/validations | Current receipt / remaining exception |
| --- | --- | --- | --- | --- |
| Steam | 2/2 | 0/0 | 1/1 | Empty/incomplete check only; returned observations change data. |
| GOG | 2/2 | 0/0 | 1/1 | Same; normal known-page Q filters saved IDs. |
| Epic | 2/2 | N/A, no Q | N/A, no Q | No successful full receipt. |
| Amazon Games | 2/2 | 0/0, writer boundary | 1/1 | Recent claims reobserve known records; empty acquisition is conditional. |
| Audible | 2/2 | 0/0 | 1/1 | Empty Q only; returned dates change data. |
| Kindle | 2/2 | 0/0 | 1/1 | Refreshed access and observation evidence must save. |
| Amazon Video | 2/2 | 0/0 | 1/1 | Empty Q only. |
| Fandango | 2/2 | 0/0 | 1/1 | Empty Q only; capture/session writes remain separate. |
| Kobo | 2/2 | 0/0 | 0/0 | Existing sparse-Q policy preserves dates; full does not. |
| Humble | 2/2 | 0/0 | 1/1 | Empty Q only if purchase cursor also identical. |
| Fanatical | 2/2 | 0/0 | 1/1 | Empty Q only if fingerprints identical; per-origin dates differ. |
| Nintendo | 2/2 | N/A, no Q | N/A, no Q | Full supported listing is additive, not all saved account records. |
| PlayStation | 2/2 | N/A, complete-list contract | 1/1 | Q still reobserves supported listing and snapshot proof. |
| Xbox | 2/2 | N/A, complete-list contract | 1/1 | Same; web-visible subset can exclude retained records. |

All measured operations perform two authoritative DB reads. Eligible receipts
make three separate small writes (lease, receipt, lease cleanup), no DB write,
no snapshot publication and no semantic validation after warm seeding. Overlap
incrementals make one metadata lease write and one validated DB publication;
fulls make two DB writes/publications, with lease metadata co-written in the
first. The Node adapter has no native storage-change observer, so it records
zero observer invalidations; real exported Epic traces additionally show
observer invalidation/republication. Do not call zero synthetic invalidations a
browser guarantee. Timing samples from these tiny fixtures are not benchmarks.

Failed/cancelled Q probes retain the prior catalog/success dates using receipts
without DB writes. Failed/cancelled F probes incur the initial bookkeeping DB
write, then use a terminal receipt with no second DB write. Neither terminal
receipt certifies item observations. Interrupted leases remain visible as
Running/long-running until a cancel, replacement or recovered acquisition;
there is no generic proof of successful completion on tab/worker disappearance.

## Timestamp and freshness contract: the implementation gate

| Field | Existing meaning and consumers | Why a status-only shortcut is insufficient |
| --- | --- | --- |
| `providerItems[].observedAt` | Last returned record observation; set by full replacement and normal nonempty merges. Shown in Details/source evidence and exported as matcher `evidence.checkedAt`. Also participates in pending enrichment/review stale-observation guards. | Advancing only provider lastSync leaves record evidence stale and changes save-guard behavior. |
| `updatedAt` | Normalization/save timestamp; often changes on identical reobservations; Kobo preserves it for unchanged content. Not the purchase date or universal content-change marker. | Ignoring it for equality without defining effective reads changes exported record values. |
| `purchaseOrigins[].observedAt` | Fanatical refreshes returned origins while merging older origins; companion imports preserve prior origin dates. | A product can have new and old origin observation dates in the same successful full scan. |
| `acquiredAt`, origin `purchasedAt` | Source purchase/acquisition dates, retained separately from observation. | Must never be replaced with check/receipt time. |
| `lastSync`, `quickSyncAt`, `fullSyncAt` | Successful provider/account operation freshness and baseline availability. A Q does not assert every saved item was seen. | Provider freshness is not a substitute for per-record evidence. |
| `snapshotValidation.validatedAt` and scopes | Successful validated acquisition boundary, including console subset. | Complete supported listing does not imply every retained account record was observed. |
| history `missingSince` plus archived `item.observedAt` | F replacement archives the prior record image when missing; console additive imports do not archive by omission. | The next real save must materialize prior successful observations before creating history. |

Relevant consumers: [models](../../src/lib/models.js),
[matcher](../../src/lib/matcher.js),
[evidence inspector](../../src/ui/evidence-inspector.js),
[item details](../../src/ui/item-details.js),
[pending book-review preparation](../../src/ui/options.js), and writer stale
review checks. Backups validate/serialize materialized records. Companion query
reads use `getQueryDatabase`, whereas receipt overlays currently apply through
`providerCheckView` to mutable/Options/profile reads. The latter does not change
the query record/index projection or its `checkedAt` evidence.
Canonical product grouping itself does not require new observation times;
however, matching output evidence, concurrency guards and backups do. Retaining
an identity index is not permission to return stale source evidence.

### Two reproduced counterexamples

1. A synthetic Xbox profile holds two records. Its next complete web-visible
   listing contains one. Both saved records survive, but **only the returned
   record's observedAt advances**. A profile-wide observation timestamp would
   falsely refresh the other record.
2. A synthetic Fanatical product has two purchase origins. The full response
   returns one origin. The product retains both; **only the returned origin's
   observedAt advances**. Even exact product-ID-set equality cannot establish
   an all-origins observation.

These are semantic counterexamples, not just byte inequality or hypothetical
future cases. An unchanged full catalog can still contain new authoritative
record/origin observations. Current format-1 receipts intentionally forbid them.
Quietly retaining old dates, updating every retained record, or only overlaying
Options would each change observable behavior.

## Shared invariants and remaining completion proposal

The user's stop condition is: **"Preserving per-record observation semantics
requires a substantial data-model change."** This audit reaches that gate.
Extending status-only receipts to become authoritative observation manifests
requires a cross-reader model contract, not a safe predicate-only optimization.
No new backend or database schema is proven necessary, but avoiding a schema
version does not remove the logical model/compatibility change.

1. **Separate acquisition capability from persistence outcome.** Explicit
   capabilities must distinguish replacement-complete, additive supported-scope
   complete, recent-window/incremental and non-store companion imports. Keep
   current endpoint/snapshot/account validators. Do not add Epic to an
   incremental allowlist or downgrade complete replacement semantics.
2. **Shared lease-only start (implemented).** For an existing unchanged active account and
   baseline, full and incremental starts use the existing lease/running
   projection. First import, binding changes and account changes remain saves.
   This removes the unnecessary announcement write in every full-mode provider.
3. **Design one observation extension to the existing receipt.** An exact base,
   active profile and validated complete identical ID set can compress all-record
   observation into one timestamp. Additive/subset observations require bounded
   per-record coverage; mixed origin observations require per-origin scope or
   an explicit fallback to a normal save. Preserve Kobo's distinct updatedAt
   policy. Define validated receipt versions and downgrade behavior first.
4. **One materialization contract for all consumers.** Options, provider reads,
   companion `checkedAt`, stale-review guards, source evidence, backups and
   subsequent history must see the same effective records. Keep raw exact-value
   certificate provenance separate from derived views. Cache/index invalidation
   must not reuse stale evidence or turn every read into a full projection build.
5. **Prove unchanged outcomes from fresh authoritative data.** Require account,
   lease/token/tab, epoch, successful boundary, exact relevant ID set, all
   substantive normalized fields, preserved origins/ownership/reviews and no
   pending absence/history difference. UI zero-update counts are insufficient.
   New/missing/changed/reappearing/ambiguous rows retain full validated saves.
6. **Crash ordering and compatibility.** Durable receipt precedes lease cleanup;
   flatten all observations before a real DB commit/history transition; ignore
   mismatched bases; clear on restore, including identical-old-backup restore.
   A failed/cancelled/partial attempt must retain prior successful observation
   scope without adding a new successful one. No permanent retry suppression.

The shared start improvement is now implemented independently. The remaining
completion optimization still requires a reviewed observation-receipt contract
and complete reader/recovery tests; it is not part of this implementation.

## Proposed cross-provider regression gate

The larger completion-design gate below remains a future requirement. Current
start regressions are documented separately below; they do not claim an
observation-receipt implementation.

| Scenario | Required application / exception |
| --- | --- |
| 1 First import | All; a first Q must promote to validated F baseline. |
| 2 Identical complete | All 14; assert IDs, records/origins, full/scope freshness and no write where receipt proof applies. |
| 3 Identical incremental | All 12 Q providers; distinguish empty/new-only, Kobo sparse, recent-window and console complete-list Q. Epic/Nintendo N/A, no Q UI. |
| 4 New record | All; validated save, correct counts and source/access evidence. |
| 5 Removed/missing | Replacement F -> history; additive console/Q -> retain. |
| 6 Metadata update | All; save even when coarse UI counters omit this field. |
| 7 Ownership/access | All; preserve explicit negative states and user corrections. |
| 8 Observation/freshness | All; record and origin scope, timestamp consumers and companion evidence agree. |
| 9 Incomplete | Partial source results only where adapter permits (notably Steam/Humble/Fanatical limits); strict complete adapters reject rather than fabricate a partial success. |
| 10 Failed | All; no new successful freshness/absence; old baseline survives. |
| 11 Cancelled | All via scan dashboard, not invented provider-specific Cancel buttons. |
| 12 Interrupted | All; lease/recovery status without inferred success. Fandango also resumes persisted capture. |
| 13 Account switch | All; explicit confirmation; console fingerprints mandatory. |
| 14 Stale lease/token | All; tab/profile/token guard and durable terminal receipts. |
| 15 Concurrent scan | All; later attempt wins; independent providers retain independent receipts. |
| 16 Revision/epoch change | All; observed base mutation/restore cannot use old proof. |
| 17 Missing/mismatched certificate | All; fallback validation remains mandatory. |
| 18 Worker restart | All; retain protected proof when available and durable observation scopes; no keepalive. |
| 19 Backup/restore then sync | All; materialized effective observations, retirement and old-backup compatibility. |
| 20 Reappearance | Replacement histories revive same stable record safely; additive Q/console must not remove unrelated history. |
| 21 Empty complete | Only where real adapter/snapshot contracts establish zero (not every HTTP-empty result); distinguish clearing replacement from additive retain. |
| 22 Duplicate/malformed | Adapter-specific duplicate allowances (Kindle explained duplicates, normalized ID aliases), ambiguous rows reject; no manufactured source capability. |

For each, count authoritative reads, full DB writes, separate metadata writes,
validation invocations, snapshot invalidations/publications, receipt outcome,
catalog/access values and all timestamp/history fields. Record proof-miss
exceptions separately from redundant validations. Include native Chrome worker
replacement and Firefox private-storage recovery, as well as the synthetic
matrix. Existing Steam v3 and UI one-shot profiling remain regression controls.

## Current provider parity matrix

The offline probe now checks 88 cases and both retained-observation counterexamples
with the implementation. The 80 focused admission regressions exercise all 14
providers and all 26 modes, with lifecycle, stale-base and certificate controls.
Counts exclude initial seeding and required proof-miss read validation.

| Provider | F start writes/validations | F completion writes/validations | Q empty | Q overlap |
| --- | --- | --- | --- | --- |
| Steam | 0/0 | 1/1 | 0/0 | 1/1 |
| GOG | 0/0 | 1/1 | 0/0 | 1/1 |
| Epic | 0/0 | 1/1 | N/A | N/A |
| Amazon Games | 0/0 | 1/1 | 0/0, conditional acquisition | 1/1 |
| Audible | 0/0 | 1/1 | 0/0 | 1/1 |
| Kindle | 0/0 | 1/1 | 0/0 | 1/1 |
| Amazon Video | 0/0 | 1/1 | 0/0 | 1/1 |
| Fandango | 0/0 | 1/1 | 0/0 | 1/1 |
| Kobo | 0/0 | 1/1 | 0/0 | 0/0 |
| Humble | 0/0 | 1/1 | 0/0, identical cursor | 1/1 |
| Fanatical | 0/0 | 1/1 | 0/0, identical cursor | 1/1 |
| Nintendo | 0/0 | 1/1, additive | N/A | N/A |
| PlayStation | 0/0 | 1/1, additive | N/A, complete-list contract | 1/1 |
| Xbox | 0/0 | 1/1, additive | N/A, complete-list contract | 1/1 |

Each eligible full start makes one authoritative DB read and one separate small
lease write. Completion makes one authoritative DB read and one validated DB
write. Total full writes/validations fall from **2/2 to 1/1**. Quick paths retain
the historical matrix semantics. Epic/Nintendo have no incremental UI; console
empty checks cannot substitute for complete source contracts.

## Packaged before/after measurements

Packaged Chrome, disposable mixed-provider synthetic libraries, baseline
`e1597be` versus this implementation. Each row is one warm and one genuinely
restarted-worker sample with valid session proof, not a statistical benchmark.
No provider requests or real libraries were used. Times are worker milliseconds;
acquisition is zero and client message transport is reported separately by the tool.

| Records | Warm start before / after | Cold start before / after | Warm completion before / after | Cold completion before / after |
| --- | --- | --- | --- | --- |
| 1,000 | 139 / 33 | 194 / 59 | 183 / 163 | 152 / 170 |
| 5,000 | 715 / 172 | 873 / 160 | 931 / 879 | 858 / 852 |
| 10,000 | 1,446 / 326 | 1,538 / 335 | 1,801 / 1,721 | 1,990 / 1,763 |
| 14,000 | 1,953 / 462 | 2,089 / 481 | 2,516 / 2,458 | 2,539 / 2,527 |
| 20,000 | 3,037 / 640 | 3,103 / 643 | 3,887 / 3,829 | 3,600 / 3,529 |

In all ten before/after pairs: admission DB reads remain 1; writes and redundant
validations go 1 to 0; separate lease writes go 0 to 1. Completion remains one
read/write/validation. Warm admission publications/observer invalidations go 1/1
to 0/0. Cold admission publications are 2-3 before and 1-2 after because snapshot
setup and startup attribution overlap; observer invalidations go 1 to 0. Cold
snapshot construction is required and is not a Running announcement publication.
The old synchronous start validation is counted from its demonstrated DB-write
path because it had no journal span. Nested journal spans are not additive and
storage-write wrappers are not physical disk timings.

These lean synthetic records do not predict the runtime of a personal library
with larger source evidence. The result proves removal of the redundant start
work, not an end-to-end Epic speed guarantee. The completion save remains the
principal limitation and is deliberately unchanged.

## Implemented start regression gate

`tests/provider-full-starts.js` covers 26 mode admissions, per-provider first/
no-baseline/disconnected starts, failure/cancellation/restart, changed/missing/
reappearing records and console retention. Shared negatives cover account switches,
unbound/mismatched console fingerprints, wrong tabs/modes/tokens, concurrent
attempts, acquisition/final-validation catalog changes, restore/clear, failed or
lost lease acknowledgments, independent receipts and cold valid/missing/mismatched
proof. Existing quick-check and session-certificate regressions remain controls.
Packaged importer checks render Running through the real sync dashboard for all
14 providers; native Firefox additionally checks private-storage full admission
and completion. Generated probe/benchmark outputs stay in ignored audit-artifacts.

Validation from a disposable checkout without private inputs passed **1,425 GL
tests**, **472 contents tests**, **103 packaged importer checks per browser**,
**67 packaged UI checks per browser**, all **11 installed Firefox checks**
(private storage, recovery, atomic backup/restore, receipts and cold proof),
and both **190-file package validators**. The 166 focused provider-pipeline tests
include 80 new full-start cases. The 88-case offline probe and both observation
counterexamples also pass from that checkout. Repository layout checking retains
only the 15 known absolute links in the unchanged historical ecosystem audit.
HB/FAN, versions, real libraries and backups remain untouched.

## Validation of this audit baseline

The offline probe reproduced all 88 cases and both counterexamples from a
disposable checkout containing no private audit inputs. It writes only its own
ignored synthetic output. The unchanged runtime passed **1,345 GL tests**,
**472 contents tests**, **102 packaged importer checks per browser**,
**67 packaged UI checks per browser**, installed Firefox private-storage,
recovery, backup and cold-proof checks, and both **190-file package validators**.
Existing cold-certificate, concurrency/account and Steam v3/one-shot UI controls
remain covered. These are baseline validations, not the unimplemented 22-row
post-fix matrix or evidence of improved production performance.

Repository layout checking reports only the pre-existing absolute `file:///`
links in the unchanged historical ecosystem audit. No new broken targets were
introduced. No HB/FAN files, extension versions, runtime modules, real libraries,
backups, ownership/matching rules or source observations changed.
