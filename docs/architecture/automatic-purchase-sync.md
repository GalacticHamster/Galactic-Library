# Automatic saved-purchase synchronization

This design extends purchase handoff version 1; it does not replace its transport or merge rules. Galactic Library coordinates an additive round trip for each safely mapped Humble or Fanatical account. No storefront acquisition, ownership inference or deletion propagation is involved.

## Consent and account identity

`galacticPurchaseSharing` stores version 1 of the opt-out model, with provider-specific boolean choices. Missing legacy preferences initialize to on; valid explicit false values, including future version markers, are never reset. Malformed settings fail closed. The preference is outside the library/backup replacement scope and separate from account mappings.

Trusted, provider-scoped `GH_PURCHASE_SYNC_DISCOVER` reports capability, sharing availability and saved account descriptors. GL initiates new-model mappings to avoid reciprocal setup races. A new companion can use the existing handshake with an older GL. Discovery grants no account-equivalence authority: automatic setup requires an unused destination with no saved history/import/reminder evidence, or trustworthy existing mapped dataset lineage. Account descriptors report historical occupancy and whether the dataset is unassigned. For old GL, only a verified absence of any provider profiles before default-account creation permits this fresh-receiver inference; an old zero-item account with unknown history requires a decision. Populated or ambiguous accounts need an explicit decision. Reverse-verified ACCEPT tickets still check the actual initiating peer, both stable IDs and current fingerprints. Unsolicited or stale messages cannot grant a mapping.

GL uses provider-profile UUIDs; companions embed stable UUIDs with active and archived purchase datasets. Renames do not change identity. Restore resets live mappings while preserving the sharing preference. A previously verified mapping may be reconstructed only when its exact dataset IDs remain present and no conflicting live mapping exists; a new/missing ID requires repair. Foreign identities, provider mismatches and duplicate IDs remain rejected.


## Durable state machine

Each provider has at most one automatic relationship per extension in this initial version. Its small persisted state includes relationship UUID, actual authorized peer ID, local/remote stable account IDs, both confirmations, pending intent, completed fingerprint pair, last success, retry count/deadline, and bounded error/skip details. It contains no duplicate purchase library.

States are disconnected, confirmation needed, pending, syncing, synced, waiting for companion, and attention required. Legacy remote proposals alone are not identity evidence; ACCEPT verifies a live local setup ticket at the actual initiating peer before consent can be persisted. Advanced disconnect clears the mapping; only the versioned sharing preference records a persistent opt-out. Disabling sharing blocks raw snapshot/chunk/offer requests and guarded saves, including requests from older peers. Every operation checks consent, actual sender, provider and relationship UUID again; late responses cannot reactivate a disconnected mapping.

GL pulls the mapped companion snapshot through the existing chunk/hash validation and guarded atomic import, then asks the companion to pull GL's committed snapshot through that same importer. Account references/stamps are freshly resolved on each leg. Completion follows both confirmed commits, never an offer or transport acknowledgment alone.

## Changes, fingerprints and recovery

Only meaningful committed provider purchases schedule work. Scans remain protected by existing scan/import guards. Changes coalesce; synchronization's own writes may produce another check but fingerprints suppress an unchanged round trip. Fingerprints cover validated transferable purchases with deterministic key/record ordering, excluding snapshot UUID, capture time and account display labels. Each side's fingerprint is tracked separately because their record representations need not match.

Pending intent is persisted before transfer. A worker restart retries from committed state, not an in-memory cursor. Imports remain idempotent; an uncertain response requires rereading both sides and comparing the last observed pair before replay. Successful merges never append redundant history solely for a check. Durable one-shot alarms provide bounded exponential retry; startup and authenticated reconnect notifications also wake pending work. No continuous polling or keepalive is added. The alarms permission is required solely for this recovery contract.

Conflicts follow existing adapters. Automatic imports additionally skip contradictory known concrete media or native purchase associations instead of overwriting them; manual recovery retains its existing behavior. Richer merges fill missing information and retain existing nonempty facts, rather than choosing a last writer. Supported safe subsets can commit; excluded records remain in their source and appear under Advanced. No automatic identity/category correction is introduced. Manual pending offers remain separate and require their original approval.

## UI and validation

Normal UI shows the default-on sharing checkbox, disclosure, status and last success. Account choices, repair, retry and diagnostics are under Advanced. The former direction/preview/offer/import workflow remains under Advanced. Validation covers synthetic account lifecycles, all four propagation directions, replay/no-change storage growth, actual packaged Chrome/Firefox messaging, and restart/retry handling. Real installed extensions and personal backups are never used as test destinations.
