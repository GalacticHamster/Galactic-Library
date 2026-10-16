# Empty provider quick checks

An empty incremental Steam/Epic check can update successful-check metadata
without rewriting the catalog. This is deliberately not a general "zero new
titles" optimization. Incoming records, even content-identical ones, have new
observation evidence and continue through full validation and persistence.

## Persistence investigation and alternatives

Preparation reads authoritative data, validates or proves exact equality with
the immutable committed snapshot, and persists a tab/account/mode-bound lease.
Existing-account incremental preparation already avoids a catalog write.
Commit reads again and checks the lease against the current profile/selection.

Ordinary incremental merges refresh incoming `observedAt`/`updatedAt`, preserve
source/enrichment/manual evidence, reconcile history and canonical groups, and
recalculate counts. Provider/profile state saves connected/counts, `lastSync`,
`lastError`, source/mode, quick-check time and `syncHealth`. Final validation,
whole-value persistence, frozen publication and session certification follow.
An empty list previously still required that last validation/write/publication.

| Alternative | Benefit and integrity costs | Decision |
| --- | --- | --- |
| Skip saving and remove the existing lease | Kobo's existing identical-observation shortcut does this, but successful-check time/error/health remain old. A lease is not success evidence and is excluded from backup. | Insufficient; Kobo's special path is unchanged. |
| Exact-base check overlay | Removes final validation/write/publication for empty checks. Requires reader projection, backup flattening, stale-base rejection and interruption recovery. One bounded private key; no catalog migration. | Implemented narrowly. |
| Record-level / IndexedDB catalog | Could improve actual record updates, but needs transactional manifests, coherent readers, dependency validation, migration, backup and rollback. Firefox already stores whole values in private IndexedDB; backend selection alone does not remove whole-value work. | Deferred. |

## Eligibility, fields and anchor

Only an existing active Steam/Epic profile with a full baseline, a lease-only
incremental start, an actual empty array, no reported failed request or coverage
limitation, and closed supported scan-detail fields can use the shortcut.
Observed committed snapshots must be supported. New/switching accounts, full
scans, incoming records, incomplete scans and unsupported details take the
original path. There is no incoming item to change ownership or observation
dates. An empty check does not refresh item-level matching `checkedAt` evidence.

`galacticLibraryProviderChecks` contains format 1, a whole-database SHA-256 digest
and at most one receipt per supported provider. Each receipt names the immutable
profile UUID and a closed validated patch: `lastSync`, optional `quickSyncAt`,
`lastError: null`, optional source, incremental mode and successful `syncHealth`
(attempt UUID, start/finish, retry diagnostics, zero item differences). Catalog
records, ownership, counts and credentials cannot be patched. Source/mode here
are scan bookkeeping, separate from source observations and identities.

The anchor uses existing strict canonical serialization of the *entire* base,
not a schema flag, nickname, timestamp or in-memory sequence. Mutation reads
still acquire authoritative storage. Exact equality permits validation reuse;
otherwise full validation/migration runs. Cache digests only for the exact
worker-owned immutable base. A first receipt, cold activation or changed base
can still pay serialization/hash cost. A digest grants no authorization.

## Ordering and recovery

All commits use the existing mutation queue. Await the single receipt write
before cleaning up the lease. These are **two independent small writes**, not
an assumed transaction. Including preparation, an empty operation makes three
small writes. Completion makes no database or session-certificate write; cold
preparation can still publish/certify its validated base as before.

| Interruption | Recovery |
| --- | --- |
| Receipt not committed | No new success claimed; prior library/freshness remain. Pending lease can retry or be superseded. |
| Receipt committed but acknowledgement lost | Caller may see failure; reload observes durable success. That attempt cannot replay, fail or cancel it. |
| Receipt committed, cleanup interrupted | Durable success wins. Options does not show that matching attempt as running. New scan replaces the stale lease. Cleanup failure does not fail an acknowledged save. |
| Stale/malformed receipt or different database | Exact digest and closed validation fail. Ignore it; never infer ownership or update observations. |
| Ordinary mutation succeeds | Mutable reads flatten valid receipt state before the usual validated database save. Only after that commit, best-effort removal retires the old receipt. Failed cleanup leaves a mismatched digest that cannot overwrite newer state. |
| Ordinary save fails | No new item success is minted; existing storage failure guarantees apply. |
| Restore/clear interrupted | Remove receipt before replacement. Removal failure aborts replacement. A crash after removal but before replacement may lose check-only freshness, retaining the old catalog. It cannot invent observation/ownership success or revive a receipt on an identical old restore. |

Concurrent providers retain both receipts on one base; latest same-provider
lease wins. Intervening catalog changes are re-read/revalidated, not overwritten
with the scan-start snapshot. Account selection, baseline reset, profile removal,
full import and restore keep their token invalidation and normal save paths.
Ordinary account changes first fold valid old check metadata into the database.

No lock or compare-and-swap against arbitrary independent storage writers is
added. GL mutations must still use its writer. Exact comparison catches
out-of-band changes preceding acquisition. Independent writes are never assumed
atomic. Stale receipts left by interrupted cleanup are harmless because their
base digest differs, and a later save/receipt can retire or replace them.

## Readers, backup and compatibility

`getDatabase` returns mutable data with valid patches flattened in. Options and
provider-profile lookup project the same patches without changing frozen catalog
data. Providers observes receipt/lease notifications; receipt changes invalidate
pending backup confirmation. Export reads current state and uses existing
format-1 validation. Restore writes flattened state into the ordinary database.
No sidecar, schema migration or new backup format is needed.

`getQueryDatabase` retains the original immutable catalog object. Companion
status exposes connection/counts; matching uses records, effective ownership
and original observation dates. Empty receipts change none of these inputs, so
MATCH_ITEMS can reuse its identity/index projection. No companion protocol,
authorization or purchase-sync changes are required. A receipt never certifies
that new purchase observations were committed.

The key uses protected Chrome local storage / Firefox extension-origin private
IndexedDB. No permissions, manifest versions or validator rules change. Existing
installations without receipts work as before. Older GL ignores the new key and
sees older check-only freshness, without affecting ownership. Export a flattened
backup before downgrading if retaining that freshness matters.

This does not optimize Kobo checks carrying observations, Epic's normal full
import, cold validation, Options rendering or actual record saves. A first read
of a changed base with a stale receipt can still pay digest cost. Broader record
persistence remains a separate design task.
