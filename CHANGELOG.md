# Release notes

## Unreleased ? automatic local sharing

- Discover official Galactic Hamster companions automatically and share supported saved purchases locally by default. Upgrade legacy setup states without treating them as explicit opt-outs; remember the new sharing setting across restart and library restore.
- Preserve verified account mappings, additive purchase/history merges and save-time authorization. Ambiguous populated accounts still need a one-time account decision in Advanced.
- Keep standalone imports and reminders available without GL; share supported additional HB reminders through the mapped account without duplicate native reminders. No key values or provider credentials are shared.

## 1.0.1 — Release candidate

- Coordinate purchase-specific Fanatical reminder reviews with standalone FAN through existing consented purchase sync. Preserve local reviews across evidence refreshes and native/companion provenance reconciliation; older peers omit unsupported reviews.

- Show dated unrevealed-key observations for supported Fanatical Steam purchases in reminders, with consented companion sharing and no key-value reads or reveal actions. Quick checks new purchases; Full refreshes older observations.

- Import authenticated standalone game selections with empty bundle arrays, as rendered by Fanatical's order UI. Keep exact order/product identities, purchase provenance, duplicate occurrences and conservative history coverage.

- Prioritize precise Fanatical detail validation failures within bounded diagnostic reports, without changing product admission. Style the shared Humble/Fanatical importer-recovery notice consistently with the provider panels.

- Recover sparse completed Fanatical summaries through identity-checked order details, preserving parent evidence and requiring fully validated nonempty products. Quick rechecks these details; failed recovery retains earlier purchases and unverified listing coverage remains conservative.

- Extend shared Fanatical diagnostics with bounded structural observations for rejected bundle containers; purchase admission and conservative coverage checks remain unchanged.

- Accept identical Fanatical purchase summaries whose JSON field order differs, while retaining conflict checks for changed values and product multiplicity. Export bounded compatibility counters without purchase details; unknown statuses and malformed orders remain retryable and cannot authorize reconciliation.

- Preserve independently verified purchases during supported partial imports across Humble, Fanatical, GOG, Epic, Amazon Games, Amazon Video, Kindle, Audible, Kobo and Fandango. Earlier records and manual corrections remain protected; unresolved work can be retried without claiming complete coverage.
- Keep provider-specific Quick updates incremental where supported, with clearer recovery guidance. Nintendo refreshes avoid unnecessary unchanged catalog saves and show capture progress.
- Treat equivalent Epic product observations as duplicates rather than incomplete scans, retain warnings for conflicting records, and avoid full-catalog persistence on unchanged scans. Omitted Epic records are retained rather than treated as revoked purchases.
- Let Kindle library updates start while unrelated Contents initialization is pending, acknowledge clicks immediately and use concise successful Quick update messages. Existing acquisition limits and account/save protections remain unchanged.
- Restore Fandango Quick early stopping after a known tile finishes loading its title. Genuine unreadable cards and incomplete scans still remain protected; aggregate import diagnostics are available through the existing scan report.
- Improve provider progress, waiting states and privacy-preserving failure reports, including Fanatical page-script errors and Steam applications that still need usable title/type information.

Prepared locally for review; not submitted or published. No new permissions or storage/companion protocol version changes. These changes are measured against published 1.0.0; companion transport semantics remain unchanged.

## 1.0.0 ? Local release candidate

- Bring supported game, software, book, audiobook, movie and TV libraries together in one browser-local catalog.
- Search compact or detailed views while retaining account copies, purchase provenance, access evidence, contents reviews and manual corrections.
- Use optional Humble Library and Fanatical Library companions for conservative ownership checks and explicitly authorized saved-purchase synchronization.
- A default saved account keeps routine imports simple; additional accounts remain separate and available through account management.
- Optional Open Library and Google Books lookups improve book information. Firefox asks for optional data permissions before sending bibliographic information or a configured Google API key; permission can be declined or revoked without losing the library.

### Supported scopes

Kobo presence alone can remain ownership unconfirmed. Audible Full rescan attempts all offered purchase/refund/gift years; a provider error for a historical year can leave that scope unchecked. Quick update checks recent history only. Epic has one complete Sync action and does not classify every possible license subtype. Xbox captures the current web-visible Owned catalog; PlayStation covers the supported active PS4/PS5 listing. Nintendo imports the current non-hidden Virtual Game Cards view and retains earlier records. Console quick checks may inspect their full supported view; provider-specific Quick Update is not a claim to reconcile all historical changes.

Prepared locally; not yet published. No provider account service, cloud library or developer analytics is required.
