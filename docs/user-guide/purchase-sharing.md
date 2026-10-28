# Automatic saved-purchase sync

Connect GL with HB or FAN to keep a selected store account's saved purchases synchronized in both directions. Existing libraries can be used immediately; installing the other extension later does not require another store scan.

Open **Purchase sync** and choose **Connect and sync**. One confirmation authorizes both verified extensions to keep the selected store account synchronized until you disconnect. You do not need to visit the other extension. If both libraries have purchases, confirm that they belong to the same store account. Nicknames alone are not identity evidence.

A single account is used automatically; an unnamed default is created when needed. Account naming is optional. Multiple saved accounts require an explicit choice under Advanced, which also contains account creation and naming tools. This initial version supports one automatic relationship per store in each extension; other accounts remain available through manual sharing. Account UUIDs survive scans, switching and renaming. Restore/clear or a missing mapped account requires a new relationship; nicknames are never used to guess a replacement.

Completed imports and meaningful purchase updates synchronize automatically. Progress, settings, identical values and timestamp-only notifications do not start a transfer. GL coordinates an additive round trip through the existing validated chunked importer. Purchases missing on one side are not deleted elsewhere; an item removed locally may return from the connected account. Existing identity, ownership and conservative merge rules remain unchanged. Unsupported or uncertain items stay at their source; skipped items are reported under Advanced.

**Sync now** checks saved state without scanning a website. **Change account mapping** under Advanced stops the old relationship before setup. **Disconnect** disables automatic sync on both sides without deleting purchases or disabling ordinary bundle matching. Opening Options only loads status/account choices; it does not enable sharing. Already-open bundle pages use their existing library-change refresh behavior.

Pending intent survives worker/browser restarts. One-shot alarms retry after roughly 1, 5, 15 and 60 minutes, with at most five scheduled retries before attention is required. Startup, reconnect and Sync now can try again. The required alarms permission supports this recovery; there is no continuous polling, cloud service or keepalive. An interrupted commit is checked against actual saved destination data before replay. Confirmed successful unchanged checks do not rewrite library/history or append duplicate evidence. Fingerprints and small device-local consent/retry metadata are excluded from library backups.

Existing extension authorization and old manual offers do not enable automatic sync. Pending offers retain their manual approval requirement. Official extension IDs and authorized development overrides use the same transport security. Tokens, authentication data, redemption values and signed download URLs remain excluded.

## Advanced manual sharing and recovery

The earlier guided transfer controls remain under **Advanced: manual purchase sharing and recovery**. They still require their own account confirmation and final import approval. Read-only comparison, previews, technical details and exports remain available there. Disconnect automatic sync before using manual recovery to maintain an intentionally different local account.

In GL, open **Providers -> Humble Bundle** or **Fanatical**. Settings contains direct links to these sections. In HB/FAN, open **Galactic Library connection -> Purchase sync -> Advanced: manual purchase sharing and recovery**.

Account choices load when the section opens; no store scan runs. A single eligible source and a single receiving account are suggested. Multiple accounts require a choice, even if nicknames match. Empty receiving accounts are allowed. Choose **Create a separate saved account** to enter a new nickname. Confirm explicitly that both accounts represent the same store account.

Choose **Continue** to review the proposed changes. This runs a read-only preview for either provider and direction; no purchases are imported and no offer is sent. The review separates new saved names from additional purchase records. This is not an edition or ownership decision. GL separates information changes from last-checked time updates. HB and FAN cannot distinguish those update types and say so. Skips and uncertainty stay visible. **Back** lets you revise choices; returning with unchanged choices reuses the review.

For sending, **Send purchases** creates an offer and opens Humble Comic Library or Fanatical Library (or GL when sending from a companion). The receiver selects/confirms its accounts, chooses Continue, reviews the changes, checks the final approval box and chooses **Import purchases**. An offer is not an import. Completion uses committed results; **Share more purchases** starts account selection again.

Changing direction, account, nickname or the development companion invalidates the review. Local purchase changes invalidate it when observed. The final transfer checks the reviewed source fingerprint and source account; the existing serialized destination checks reject changed accounts. If choices are stale, use **Advanced / Diagnostics -> Refresh account choices**, or Retry when loading fails, and review again. Closing Options does not cancel an already approved background import. If completion is uncertain, check the receiving account before retrying.

**Advanced / Diagnostics** is collapsed by default. It contains **Refresh account choices**, optional **Preview transfer**, **Export comparison report**, sharing limits and development companion selection. **Compare saved purchases** is available for Humble only. It explains coverage, uncertainty and category differences without changing either library. Different totals alone do not mean purchases are missing. Technical details retain exact counts; exported reports include private titles, bundle names and account labels. Keep reports private. Normal sharing does not require these diagnostic controls.

To recover older IDs, open the signed-in **Humble Purchases** page and use HB's **Refresh missing product IDs**. Confirm the active saved account; this cannot switch profiles. It previews affected saved orders, downloads an HB safety backup and reads only those order details. IDs are filled only for a unique exact purchase/title/media/delivery association. Existing dates, bundles, titles, ownership and manual metadata are preserved. Source product tokens, scoped record IDs, key-delivery IDs and positional fallbacks are different things. Conflicts, changed titles and ambiguous products remain unchanged. Historical origins receive the same treatment. Missing bibliographic fields can be filled on an individually attributable single-origin row.

**Cancel metadata refresh** retains the original library. Evidence is staged until one validated atomic save; closing the tab discards staged work. Failed orders retain prior evidence. Unresolved IDs are reported separately from request errors. Repeated refreshes do not add purchases or duplicate origins. Afterwards, enabled automatic sync propagates the committed update. For manual sharing, refresh choices and review again. This ID refresh does not establish a new full-scan baseline.

**Check connection** only verifies communication; it does not transfer purchases. Refreshing an already-open storefront bundle updates bundle matching, which is a separate feature. Refreshing a bundle does not share purchase records.

Official builds use their published IDs. For unpacked Chrome builds, allow the companion ID in GL Advanced pairing and enter GL's ID in the companion Advanced settings. GL checks responding, already authorized extension IDs and remembers their verified provider roles. If multiple custom builds respond for one provider, choose the intended allowed ID in GL's Purchase sharing Development companion controls. No webpage or arbitrary extension is authorized. A working bundle ping alone does not prove purchase-sharing capability; GL checks that protocol separately.

Transfers preserve existing richer data and purchase/bundle associations. They do not delete absent records, switch the active account, or establish a new full-scan baseline. Repeating a transfer does not duplicate purchases. Refresh choices and reconfirm if either selected account changes.

Older HB direct-download purchases may lack native product IDs. GL can enrich an unambiguous existing purchase/title but skips unmatched records; no product IDs are invented. A separate fresh HB scan can retain native IDs. GL lacks Humble prices and unsupported Fanatical media. Older FAN products may retain their primary bundle without order-level associations; incomplete product IDs are reported and excluded. Existing destination information remains intact.

Source staging expires after ten minutes or a source worker/browser restart. Failed validation never partially imports. Refresh choices and retry if staging expires. Closing Options does not cancel an already confirmed background import; if it committed, repeating remains safe. A missing/disabled companion and an incorrect ID may be indistinguishable to the browser and are reported together.

Advanced sharing remains manual: opening its controls only discovers accounts. The separately enabled automatic relationship operates independently; no storefront scan or cloud service starts. Authentication/session/redemption values and signed download links are excluded. GL shares provider purchase records, not its canonical catalog, enrichment or settings.

## Saved account identity

Saved Humble and Fanatical accounts carry a stable local account ID with their purchase data. Existing valid IDs migrate automatically without changing purchases or a working purchase-sync relationship. Names and purchase updates do not change this ID. Older accounts without recoverable identity receive a new ID and may need connection repair; names and common purchases never establish identity.

Backups may retain account lineage, but restoring them resets automatic purchase-sync permission. Restored IDs do not grant permission to resume sharing. Private incremental scan authority remains separate. Conflicting or duplicate account identities are rejected rather than merging accounts.

Temporary connection failures retry within bounded limits. New committed purchases can restart a transport-exhausted check. Missing accounts, revoked purchase-sync permission and conflicting relationships stop automatic retries until repaired; restarting the extension does not repeatedly propose an obsolete account. Saved setup history is distinct from currently verified peer permission.

If a saved account or permission was replaced, choose **Repair connection** in Purchase sync. Review the current saved accounts and confirm once; there is no need to disconnect first or repeat the store scan. A single available account is preselected as a convenience, not treated as proof of identity. Multiple accounts require an explicit choice. Repair preserves purchases and replaces the obsolete synchronization relationship.
