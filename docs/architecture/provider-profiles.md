# Persistent provider profiles

Database schema 13 adds `providerProfiles`, keyed by opaque immutable UUIDs.
Each profile owns its provider, editable nickname, provenance declaration and
independent provider state. `providers[provider].activeProfileId` identifies the
update target. Records from every remembered profile coexist in the library.

Logical product observation identity is `(provider, profileId, providerItemId)`.
The durable `recordRef` remains the anchor for acquired source/history, aliases,
ownership confirmations, reading state and enrichment reviews. Contents reviews
and relationship endpoints retain stable internal record IDs. New profiles use
`provider:profileId:nativeId`; migration reserves at most one legacy namespace
per provider to retain current `provider:nativeId` IDs and reliable references.
That namespace is never reused by another profile, including after deletion.
DLC parent native IDs resolve only inside their record's profile.

Migration preserves current baseline/coverage. Named historical profile-switch
records establish remembered profiles and return to the combined corpus; their
baseline remains unknown. Genuine missing records stay history. Native-keyed
decisions with multiple possible observations or missing endpoints move to
`unresolvedProfileState`, preserved in backups but excluded from matching.
Already-deleted historical decisions cannot be reconstructed. No overlapping
catalog products are treated as proof that two accounts are the same account.

Validation certificates change version with the schema/validator. Old receipts
cannot certify migrated data. The existing atomic writer and full validation
remain authoritative. Backup format 1 carries the schema-13 database; durable
job storage remains separate from ordinary library backups.

Provider nicknames are manual declarations, not verified website account IDs.

## Selection and updates

`selectProviderProfile(profileId, expectedActiveId, confirmed)` activates an
existing profile offline with explicit account confirmation and a stale-state
check. Selection leaves records and their evidence untouched, restores that
profile's baseline and cancels outstanding provider scan authority. Rename
changes display metadata, preserving IDs, baseline and record-owned decisions.

A scan token binds the target profile ID, originating active selection, tab,
mode and attempt. A later selection/rename/reset/restore invalidates it. A new
account without a complete baseline needs a full scan; a remembered account
uses its own saved baseline. Provider-specific age and coverage checks remain
in their existing acquisition code. A full scan marks missing records only in
its target profile. A failed new-account scan does not replace the previously
active profile or its baseline.
