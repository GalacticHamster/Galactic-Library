# Automatic saved-purchase synchronization

This design extends purchase handoff version 1; it does not replace its transport or merge rules. Galactic Library coordinates an additive round trip for each explicitly paired Humble or Fanatical account. No storefront acquisition, ownership inference or deletion propagation is involved.

## Consent and account identity

Extension authorization permits communication, not automatic imports. Enabling synchronization requires standing consent in each extension's own Options page. The first confirmation proposes an account relationship; the other extension confirms that relationship once. Later imports require neither offers nor receiver interaction. An external message can propose setup but cannot approve it.

GL account identifiers are persistent provider-profile UUIDs. Companions keep device-local UUIDs separately from backup data, translating those UUIDs to fresh handoff account references at execution time. Nicknames are labels, never proof of identity. Rename preserves a UUID; restore/clear replaces the registry and suspends old relationships. Deleted or missing accounts suspend synchronization. Changing the companion's configured GL target suspends both ends immediately; restoring the same authorized target can reconnect the existing confirmed mapping without approving a new account. New destinations are created through the existing validated empty-snapshot import before confirmation.

## Durable state machine

Each provider has at most one automatic relationship per extension in this initial version. Its small persisted state includes relationship UUID, actual authorized peer ID, local/remote stable account IDs, both confirmations, pending intent, completed fingerprint pair, last success, retry count/deadline, and bounded error/skip details. It contains no duplicate purchase library.

States are disconnected, confirmation needed, pending, syncing, synced, waiting for companion, and attention required. A remote proposal is inert until local confirmation. Disconnect clears consent and pending work locally and asks the peer to disable the same relationship. Every operation checks consent, actual sender, provider and relationship UUID again; late responses cannot reactivate a disconnected mapping.

GL pulls the mapped companion snapshot through the existing chunk/hash validation and guarded atomic import, then asks the companion to pull GL's committed snapshot through that same importer. Account references/stamps are freshly resolved on each leg. Completion follows both confirmed commits, never an offer or transport acknowledgment alone.

## Changes, fingerprints and recovery

Only meaningful committed provider purchases schedule work. Scans remain protected by existing scan/import guards. Changes coalesce; synchronization's own writes may produce another check but fingerprints suppress an unchanged round trip. Fingerprints cover validated transferable purchases with deterministic key/record ordering, excluding snapshot UUID, capture time and account display labels. Each side's fingerprint is tracked separately because their record representations need not match.

Pending intent is persisted before transfer. A worker restart retries from committed state, not an in-memory cursor. Imports remain idempotent; an uncertain response requires rereading both sides and comparing the last observed pair before replay. Successful merges never append redundant history solely for a check. Durable one-shot alarms provide bounded exponential retry; startup and authenticated reconnect notifications also wake pending work. No continuous polling or keepalive is added. The alarms permission is required solely for this recovery contract.

Conflicts follow existing adapters. Automatic imports additionally skip contradictory known concrete media or native purchase associations instead of overwriting them; manual recovery retains its existing behavior. Richer merges fill missing information and retain existing nonempty facts, rather than choosing a last writer. Supported safe subsets can commit; excluded records remain in their source and appear under Advanced. No automatic identity/category correction is introduced. Manual pending offers remain separate and require their original approval.

## UI and validation

Normal UI shows connection, mapped accounts, standing approval, status, last success, Sync now, Change mapping and Disconnect. The former direction/preview/offer/import workflow remains under Advanced. Validation covers synthetic account lifecycles, all four propagation directions, replay/no-change storage growth, actual packaged Chrome/Firefox messaging, and restart/retry handling. Real installed extensions and personal backups are never used as test destinations.
