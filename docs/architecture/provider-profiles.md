# Persistent provider profiles

Database schema 13 adds `providerProfiles`, keyed by opaque immutable UUIDs.
Each profile owns its provider, editable nickname, provenance declaration and
independent provider state. `providers[provider].activeProfileId` identifies the
update target. Records from every remembered profile coexist in the library.

Logical product observation identity is `(provider, profileId, providerItemId)`.
The durable `recordRef` remains the anchor for acquired source/history, aliases,
ownership confirmations, reading state and enrichment reviews. Contents reviews
and relationship endpoints retain stable internal record IDs. New profiles use
`provider@profileId:nativeId`; migration reserves at most one legacy namespace
per provider to retain current `provider:nativeId` IDs and reliable references.
The `@profileId` namespace is disjoint from legacy native IDs, including native
IDs containing colons. Earlier scoped-key forms migrate by trustworthy record
references, including active/archived checkpoint targets, without changing
queue positions.
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

Successful empty Steam/Epic quick checks may keep check-only freshness in a
small exact-base receipt. Authoritative/profile/Options reads and backups flatten
it into existing profile state; ownership and item observations remain unchanged.
See [Empty provider checks](empty-provider-checks.md) for ordering and recovery.

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

## Background work and account evidence

The active Kindle checkpoint remains in `galacticLibraryKindleContentsRefresh`.
Other profiles' frozen checkpoints live in
`galacticLibraryKindleContentsRefreshArchives[profileId]`. Only selection
boundaries swap these stores, atomically with the database. Per-item/batch saves
retain the existing active checkpoint path and atomic evidence/cursor write.
Leaving a running job interrupts its lease; paused queues keep the exact cursor.
Returning restores that profile's job; resume rotates its lease. Starting B
cannot replace A's archived queue. Rename does not invalidate profile identity.
Legacy checkpoints bind by durable record references; ambiguity is retained,
never assigned from overlapping product IDs. Restore/clear still clear job
storage under the existing separate-from-backup contract.

Kindle acquisition targets only the active profile. Stored contents and normal
matching see the combined library. Google jobs keep frozen record references;
selection does not remove them. Fandango navigation contexts carry profile IDs
alongside existing scan tokens. Receipt proposals and companion reminder feeds
belong to immutable profiles. Multiple feeds from one companion can coexist;
new B uploads preserve A's completed feed and its reminder decisions. Manual
account confirmation remains necessary on each signed-in provider page.

## Management API

All operations use the existing serialized privileged storage protocol. Provider
web pages cannot call these arbitrary storage operations. Import panels retain
explicit manual signed-in-account confirmation; there is no automatic account
identification.

- `getProviderProfiles(provider = null)` returns profile IDs/nicknames, current
  media counts, genuine history counts, successful/complete update dates,
  coverage completeness, update health, active status and last selection.
- `selectProviderProfile(profileId, expectedActiveId, confirmed)` selects offline.
- `renameProviderProfile(profileId, nickname)` rejects duplicate named profiles.
- `previewProviderProfileRemoval(profileId)` returns affected record/review,
  relationship/order/canonical and job counts, plus an opaque dependency stamp.
- `removeProviderProfile(profileId, dependencyStamp, confirmed)` rechecks that
  preview inside the writer queue, removes only owned records/dependencies and
  prunes removed endpoints from shared reviews/orders. Surviving reading orders
  receive fresh revisions. If the active profile is removed, the update target
  stays unselected until the user explicitly selects another remembered account.
- `resetProviderProfileBaseline(profileId, confirmed)` clears import timestamps,
  skip authority and coverage, preserving records, acquired contents/history,
  human decisions and contents jobs. The next ordinary import requires a full
  baseline; this is distinct from a contents Refresh All.

Removal deletes only the selected profile's Kindle checkpoint, receipt/feed
state, record-specific evidence and invalid scan/session authority. A shared
Google queue keeps its cursor/counts and surviving targets; a pending affected
run is paused so stale batches cannot commit against a changed target set.
Unaffected B jobs/scan authority and global settings/policies remain intact.
Session cleanup follows the atomic private save; failure to remove a session
entry cannot restore its invalidated scan authority.

`legacyProfileNamespaces` retains tiny namespace tombstones after profile
removal, preventing accidental reuse of old native-keyed decision endpoints.
Historical switch dates for safely promoted records remain in the profile's
`legacyArchive`. Multiple conflicting historical observations of one profile
product remain archived. Reimport never chooses one arbitrarily or erases the
other observations. Ambiguous legacy decisions remain unresolved, with no
automatic resolution UI in this phase.

Combined library/provider display counts and companion status enumerate all remembered records;
active-profile status describes only acquisition. The evidence inspector reads
an item's own profile state, rather than another active account's sync date.
Backup format 1 includes the full profile catalog, baselines, records, namespace
reservations and unresolved state. Separate device jobs are intentionally not
included and are cleared on restore, as before. Current schema-13 records must
have explicit valid profile provenance. Active provider mirrors are derived
from the authoritative profile state. The certificate validation version is
bumped with these invariants; the certificate architecture is unchanged.

## Deliberate limits

This establishes the internal data/API foundation. Saved-profile pickers,
management/confirmation screens and the Providers/navigation redesign are a
later UX task. Historical missing baselines and already-deleted decisions cannot
be recovered. Unnamed profiles retain uncertain account provenance. No live
account, browser matrix or private-backup migration was exercised by this work;
regression coverage uses synthetic offline data and the real message/writer
paths. Acquisition pacing, parser/extractor versions, matching rules and HB/FAN
code are unchanged.
