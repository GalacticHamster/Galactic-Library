# Committed query validation certificate

The worker may skip repeated full validation on a cold read only when the exact
authoritative value has a matching protected session receipt. This is a
cross-generation validation proof, not a cache of the library or matching output.

`galacticLibraryValidationCertificate` is a single bounded `storage.session` key.
Its closed descriptor contains format 1, schema version 12, serialization version
2, `SHA-256`, a 64-character digest, and `VALIDATION_ALGORITHM_VERSION`. The latter
must change whenever database validation, normalization, source interpretation or
canonical identity rules change. Imports, backups, provider payloads and public
API messages cannot supply this receipt. The session area is protected before
library access is admitted. Extension reload/update and browser restart lose the
receipt and safely restore full validation.

Only a worker-owned registered immutable committed snapshot can mint a receipt:

- A cold read completes full current validation and an exact raw/normalized
  comparison. If migration is necessary, it commits through the existing writer
  and the read retries before publication/certification.
- A successful authoritative database write publishes a detached, frozen
  snapshot only after existing validation and native commit. An existing query
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

Compare warm requests with a request after at least 60 seconds without GL/HB
activity. Verify the worker ID actually changed; elapsed idle time alone is not
proof. Inspect receipt hit/miss, native read, serialization/hash, snapshot total,
canonical reuse, index, matching, sender/callback and HB initialization/render
durations. Extension reload gives a natural certificate-miss control. Do not
force a production worker stop or change the user's library for this test.
