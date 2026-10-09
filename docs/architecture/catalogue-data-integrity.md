# Catalogue data integrity

Routine complete/incremental provider imports normalize provider payloads with enrichment disabled, then preserve trusted enrichment for the same provider/profile/native item and media. An importer cannot erase or inject catalogue evidence. Complete scans archive missing records with enrichment; unambiguous same-profile reappearance restores it. Profile baseline reset clears scan state, not records. Switching/renaming profiles preserves each account's evidence.

Routine Google Books reacquisition of the same nonempty volumeId (or its exact validated source URL in sparse recovered evidence) preserves existing categories when the new response omits them or supplies an empty list. It does not retain historical identity fields or cross catalogue identifiers. Nonempty replacement categories are accepted. Explicit reviewed source selection, undo, full restore and reset keep their existing replacement semantics. Open Library selection is explicitly user-selected, so it is not treated as automatic reacquisition. Kindle failed/omitted source details retain the previous observation; trustworthy changed source remains a new observation under existing history rules.

## Replacement and deletion paths

| Operation | Effect and boundary |
| --- | --- |
| Missing initial database | Creates an empty database only when no saved database exists; malformed saved databases fail validation. |
| Explicit restore | Replaces all library state with the validated selected backup. UI warns, offers current export, requires confirmation and rejects a stale review. |
| Explicit clear | Removes the saved library/settings/jobs. User reset is intentionally destructive. |
| Provider full scan | Replaces only its account's current records; absent records move to providerHistory. Same-media metadata omission preserves enrichment. |
| Provider quick scan | Adds/refreshes returned records; omission of other records is not deletion. |
| Media change | Deliberately drops incompatible book enrichment and contents/identity relationships. This is a distinct media correction, not an omission. No cross-media bibliographic trust is introduced. |
| Profile removal | Requires a dependency preview stamp and confirmation; removes that profile and dependent state. Other accounts remain. |
| Profile switch/migration | Moves account associations and quarantines ambiguous legacy decisions. Enrichment travels with its provider record. Invalid profile relationships fail validation. |
| Catalogue/source selection | Replaces the selected source envelope and retains previous value in enrichmentHistory for undo. An explicit choice can legitimately remove categories. |
| Source undo | Restores that exact previous selection; rejects newer selection references. |
| Canonical rebuild | Reconstructs grouping from provider records; does not delete their enrichment. |
| Backup parsing | Bounded validation normalizes known fields; unknown schema fields are dropped. The supported catalogue category fields remain supported. |
| Persistence/worker transition | One serialized writer, atomic saved database and validated committed read snapshots. Storage read/write failures are surfaced; no automatic empty replacement on malformed data. Firefox uses extension-origin IndexedDB. |

## Historical investigation

Saved backups establish enrichment present on September 26 and absent by October 2. They do not record the deletion operation. Reading the old backup with the current actual parser retains the catalogue evidence, so the current validator does not reproduce the loss.

Historical code before `56714e2` replaced/merged provider records without preserveEnrichment; a provider reimport could overwrite enriched records. `56714e2` added retention. Before `75ad2c7`, separate pages could perform competing read/modify/write database saves; that commit introduced the centralized writer. These are credible historical mechanisms, not proof that either caused this user's loss. October 1 bounded validation already included Google Books categories/genre hints and Open Library subjects. Firefox storage migration changed storage location, not catalogue fields. No retained operation log identifies whether restore/reset, stale state, provider resync or another operation occurred between the saved exports.

The new protection addresses a reproducible same-volume category omission, not an asserted reconstruction of the historical mass loss. No arbitrary percentage alarm or automatic recovery is added. Synthetic tests prove sync retention, archival/reappearance, untrusted payload exclusion, baseline reset, routine omission protection and intentional new-source/undo/restore/clear behavior.
