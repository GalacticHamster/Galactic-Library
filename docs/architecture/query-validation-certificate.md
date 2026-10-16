# Committed database validation certificate

The worker may skip repeated full validation on a cold read only when the exact
authoritative value has a matching protected session receipt. This is a
cross-generation validation proof, not a cache of the library or matching output.

`galacticLibraryValidationCertificate` is a single bounded `storage.session` key.
Its closed descriptor contains format 1, the current database schema version, serialization version
2, `SHA-256`, a 64-character digest, and `VALIDATION_ALGORITHM_VERSION`. The latter
must change whenever database validation, normalization, source interpretation or
canonical identity rules change. Imports, backups, provider payloads and public
API messages cannot supply this receipt. The session area is protected before
library access is admitted. Extension reload/update and browser restart lose the
receipt and safely restore full validation.

There is no time-based expiry. A worker stop preserves session storage; browser
session loss or extension reload/update removes this optimization. The descriptor
is not signed or authenticated by its hash alone: provenance comes from protected
extension-only storage and internal issuance. Chrome restricts local/session
access to trusted contexts before admitting operations; Firefox uses privileged
session storage and extension-origin private IndexedDB. Arbitrary provider pages
cannot mint certificates. A privileged extension-code compromise is outside this
boundary, as it could already modify the library directly.

Only a worker-owned registered immutable committed snapshot can mint a receipt:

- A cold read completes full current validation and an exact raw/normalized
  comparison. If migration is necessary, it commits through the existing writer
  and the read retries before publication/certification.
- A successful authoritative database write publishes a detached, frozen
  snapshot only after existing validation and native commit. That registered
  snapshot then permits certification. If no snapshot was needed, the receipt
  is discarded rather than making another full-library copy just for this cache.
- Clear removes the receipt. No certificate is issued for an absent database.

All database writes flow through the storage writer's wrapped `set`/`remove`:
ordinary `persistDatabase` mutations, restore, provider scans and imports,
migration, enrichment batch commits, companion feed commits/removal, and clear.
Their full boundary validation remains unchanged. Unobserved/out-of-band changes
cannot reuse a certificate on cold activation because the entire value's digest
must match. Existing warm-cache change-observation and epoch rules are unchanged.

Strict serialization uses canonical JSON for objects, arrays and primitive
values. Undefined is rejected rather than silently omitted or converted to null.
Numeric negative zero is encoded as zero, following JSON,
native Chrome storage and the validator's existing numerical equality. Validated
manifest ranks can contain negative zero; rejecting it would prevent receipt
issuance. Serialization rejects nonfinite numbers, functions, bigints, symbols, accessors,
nonenumerable properties, special object prototypes, `toJSON`, sparse arrays and
array extras. It does not silently discard fields. Object keys are sorted;
insertion order is not an identity input in the validator's equality contract.
The entire authoritative value is covered, including source histories and state
unused by matching; a schema or `validated: true` flag is never sufficient proof.

Cold queries still perform authorization, native acquisition, receipt validation
and full-value digest verification. Epoch checks after acquisition/verification
and normal validation prevent stale publication around concurrent commits.
Every missing, malformed, unavailable, version-mismatched or digest-mismatched
receipt uses the previous full validation/migration path. A digest is not a
self-authenticating claim: only the protected internal issuance boundary grants
provenance. Compromise of privileged extension code is outside this trust model,
just as that code could previously write arbitrary valid library observations.

## Provider preparation and mutable reads

Shared `readDatabase(true)` uses the same exact-value verifier when its freshly
read database does not match an in-memory validated snapshot. It accepts only
the current closed certificate descriptor plus SHA-256 of the entire strictly
serialized authoritative value. Missing, older-validator, malformed, unavailable
or mismatched proof falls back to ordinary semantic validation and migration.
Legacy schema data cannot pass the current descriptor/schema check. An observed
snapshot epoch change during verification or fallback validation retries the
authoritative read before publication. No revision number or timestamp grants
trust. Ordinary `readDatabase()` callers retain their full validation path.

On a hit, publish a detached, frozen registered snapshot and return the separate
mutable storage result to the queued operation. Seed the immutable snapshot's
receipt-digest cache with the already verified hash. Do not reserialize/hash or
reissue the same certificate. This also avoids hashing the base again when
flattening or writing a status-only provider receipt. Snapshot-copy failure
cannot authorize status-only persistence without its immutable proof.

The proof establishes only the validity of the previously committed database,
not the incoming scan. Tab/token/profile/account guards, authoritative commit
reads, observation comparisons, console acquisition checks and final full
validation before data-changing commits remain required. New accounts, switching,
full-scan reconciliation and actual data/access changes retain their normal
save behavior. Partial/failed/cancelled status receipts preserve the last
successful baseline under the existing [status receipt contract](empty-provider-checks.md).
No independent-writer transaction or new persistence system is introduced.

Certificate hashing/writes never gate acknowledgements on session persistence.
Serialization captures the immutable value synchronously, hashing is asynchronous,
and writes are ordered. Superseded pending issues cannot overwrite later clear or
issuance. Errors affect only reuse; they do not fail an acknowledged database save.
No timers, keep-alives, full-library session copy, persisted matching index, queue
changes or database-layout changes are introduced. Each cold full-validation
publication or eligible database commit may issue one small receipt; warm hits
do not issue or verify it again.

## Canonical reuse

Only when `items === context.providerItems`, the context is registered as a
committed snapshot, and its canonical groups exist, can identity-index construction
reuse those validated groups despite manual barriers. The original reconstruction
path remains for unregistered contexts and derived provider-item views. Indexes
remain revision-local and reevaluate effective ownership, expiry, reviewed
coverage, profile history and request semantics normally.

## Diagnostics and acceptance

Existing Options/Kindle exports include `snapshot_certificate`,
`certificate_read`, `certificate_serialize`, `certificate_hash`, `certificate_hit`
or `certificate_miss`, `certificate_issue`, and `matching_canonical_reuse` stages.
`snapshot_validation` still appears on fallback; `matching_canonical` remains for
untrusted reconstruction. Certificate issue measures synchronous capture only;
it does not claim to measure the subsequent fire-and-forget session write.

Provider traces additionally expose `read_certificate` and, on interruption,
`read_certificate_retry`. Closed miss reasons are `certificate_missing`,
`certificate_invalid`, `certificate_mismatch`, `certificate_unavailable` and
`certificate_error`. Serialization and hash spans are nested within verification;
do not add them twice. The bounded worker journal includes these stages, read/
comparison/copy stages and snapshot setup so packaged offline measurements need
no provider requests. Digests, certificates and library values are never exported.

Compare warm requests with a request after at least 60 seconds without GL/HB
activity. Verify the worker ID actually changed; elapsed idle time alone is not
proof. Inspect receipt hit/miss, native read, serialization/hash, snapshot total,
canonical reuse, index, matching, sender/callback and HB initialization/render
durations. Extension reload gives a natural certificate-miss control. Do not
force a production worker stop or change the user's library for this test.
