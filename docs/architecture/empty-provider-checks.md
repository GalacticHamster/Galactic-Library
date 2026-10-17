# Shared status-only provider checks

Provider scans can persist status separately when no authoritative catalog,
access, observation, relationship or account-cursor data changes. This extends
the original successful empty Steam/Epic receipt to the shared writer. It is
not a rule that "zero new titles means nothing changed."

## Eligibility

The worker still reads authoritative storage. Reuse requires exact equality
with a detached validated immutable committed snapshot. Cold reads may establish
that snapshot using the [protected exact-value certificate](query-validation-certificate.md);
unavailable/mismatched proof validates/migrates normally. A receipt requires that exact base to remain current,
the same active immutable profile ID, connected state and an existing full
baseline. New accounts, switching, baseline changes and unavailable proofs
retain ordinary validated persistence.

Eligible full starts also use this durable lease and Running projection, as
described in [provider-sync-parity.md](provider-sync-parity.md). They pin the raw
committed base for a subsequent validated full save. This changes admission only:
successful full completion cannot use an incremental status-only receipt. A cold
proof miss still validates the authoritative read before deciding eligibility.

Commits require a lease-only incremental start and supported scan-detail fields.
Normalize incoming records using existing import rules and compare **every
field**, including observation dates, access and provenance, to current records.
All must be identical. Empty lists qualify; nonempty lists normally refresh
observations and require a save even when title/addition counters are zero.
Changed account sync cursors also require a save. Fallback reuses already
normalized entries rather than normalizing twice.

Kobo's existing sparse-observation policy retains the prior representation/date
when metadata and access are meaningfully unchanged. This is now expressed in
normalization, permitting the same exact shared comparison without a Kobo-only
persistence branch. New metadata/access still saves; full scans still refresh
observation dates. Missing/historical records cannot pass the current-record
equality check.

Full successful scans retain snapshot validation, observations and absence/history
reconciliation. Console imports still verify fingerprints, source contracts and
complete supported scopes; their fresh snapshot evidence is a data change. No
shortcut bypasses those acquisition guards. Failed/cancelled attempts can use
status-only receipts when their established account/base remains valid, including
after a lease-only full start or an ineligible bookkeeping save. They never
reconcile missing records.

## Receipt and successful baseline

`galacticLibraryProviderChecks` remains format 1, anchored by SHA-256 of the
strict canonical serialization of the **entire base database**, not a schema
flag, nickname, timestamp or in-memory sequence. Bound entries to one per known
provider, scoped to the active profile UUID. Cache digests only for exact
worker-owned immutable bases. A cold certificate hit reuses its verified digest;
otherwise first/new-base receipts still hash.

Successful incremental patches contain only validated `lastSync`, optional
`quickSyncAt`, cleared `lastError`, optional source/mode and successful
`syncHealth`. They cannot update `fullSyncAt`, records, counts or ownership.

Partial, failed and cancelled patches contain **only terminal `syncHealth`**:
attempt ID, times, mode, safe error category, retry/count/coverage information.
They cannot advance successful timestamps, clear ownership or certify item
observations. A coverage limitation or explicit incomplete flag also produces
Partial, even when no HTTP request failed.

If an incomplete attempt replaces a successful receipt on the same base, carry
the validated successful patch as `baseline`; otherwise the raw database's older
time would replace the latest successful check. Apply baseline first, then current
health. Repeated failures retain that baseline; newer success replaces it. Both
live in one small value. Closed validation permits no additions, removals,
metadata or ownership changes in differences; checked/unchanged counts may be
nonzero without claiming refreshed item observation dates.

## Ordering and recovery

Operations share the existing writer queue. Acknowledge the single receipt write,
then independently clean up the lease. These **two writes are not assumed atomic**.
Incremental preparation adds one small lease write. Status-only completion needs
no final catalog validation/write, snapshot replacement or new certificate.
Cold preparation can verify existing proof; it never skips authoritative reads.

| Interruption | Result |
| --- | --- |
| Receipt not committed | Prior data/status remain. Lease can retry or be superseded; no completion claimed. |
| Receipt committed, acknowledgement lost | Reload observes terminal status. Caller may see an error; that attempt cannot replay/fail/cancel. |
| Lease cleanup interrupted | Receipt wins. Options does not show that attempt as Running; a new scan supersedes the stale lease. |
| Old response after a newer attempt | Token/tab/profile guards reject it; no override of a newer result. |
| Observed base change | Reject stale completion. Ignore malformed/digest-mismatched receipts. |
| Ordinary data save | Flatten valid baseline/health, fully validate/save DB, then retire receipt. Failed retirement leaves a harmless mismatched digest. |
| Restore/clear | Retire receipt first, including identical-old-backup restore. Retirement failure aborts replacement. A crash afterward may lose check-only freshness but retains the catalog; it cannot fabricate ownership or observation success. |

Independent providers preserve each other's entries. Selection, rename, reset,
removal and restore retain existing invalidation. No cross-writer lock or
compare-and-swap against arbitrary independent storage writers is introduced.

## Readers, backup and compatibility

`getDatabase`, Options and provider-profile lookup flatten valid status into
existing provider/profile fields. Providers observes receipt/lease changes;
pending backup confirmations are invalidated. Export reads current state and
uses existing format-1 validation. Restore persists flattened status/baseline.
No backup or database schema migration.

Companion queries retain their immutable catalog, identity/index cache, ownership
and per-item `checkedAt` evidence. Their status API exposes connection/counts,
not receipts. No companion protocol, permissions or purchase-sync changes.
HB/FAN account-cursor changes still require an ordinary save.

Chrome uses protected local storage; Firefox uses extension-origin private
IndexedDB. No record-level redesign or version bump. Earlier successful receipts
remain valid. Older GL may ignore unknown providers, terminal patches or baseline
fields and display older check-only freshness, without affecting ownership.
Export a flattened backup before downgrade when that freshness matters.

Whole-library reads, comparison/copy, cold certificate serialization/hash or
fallback validation, Options rendering
and genuine observation saves remain costs. Splitting actual records requires
transactional readers, migration and recovery and remains deferred.

The [cross-provider baseline audit](provider-sync-parity.md) inventories all 14
providers and 26 exposed store modes. It demonstrates why successful complete
snapshots and nonempty quick reobservations cannot simply use these status-only
receipts: record and individual purchase-origin observation dates are observable
data. No full-observation receipt extension has been implemented; that audit
stopped at the requested freshness-model design gate.
