# Automatic saved-purchase sharing

With compatible official extensions installed in the same browser profile, GL and Humble Library or Fanatical Library discover each other and share supported saved purchases automatically. Installing a companion later does not require a new store scan. All three also work independently.

**Automatically share purchases with Galactic Library** is on by default in HB and FAN. GL has a separate sharing setting for each companion in Providers. Turning either side off stops subsequent purchase transfers without deleting saved copies. Turning it back on reconciles the saved accounts additively. Bundle matching remains a separate comparison feature.

Upgrades enable this model for legacy enabled, disabled, disconnected and unconfigured states: those old states did not reliably record an explicit opt-out. The new versioned preference remembers an explicit off choice across restarts, updates and library restore while browser settings survive. Library backups do not export that device-local preference.

When each extension has exactly one account for the store, those accounts connect automatically even if both contain current or historical purchases. If GL has no account yet, it creates the receiver. Purchases reconcile additively; absence never deletes the other dataset. Verified saved mappings are reused by their stable dataset IDs, never by display name. With multiple accounts, an unambiguous verified mapping is reused; genuine ambiguity or conflicting relationships need a decision under **Advanced: accounts and diagnostics**. Only one automatic relationship per store is supported; other accounts remain available through advanced manual sharing.

Completed imports and relevant committed purchase changes synchronize automatically, including partial imports that safely saved independently verified purchases. Missing purchases never authorize deletion at the other extension. User corrections, purchase history, ownership distinctions and provenance retain their existing merge rules. Unsupported records stay at their source and appear in Advanced diagnostics.

Unavailable peers retain pending work. Bounded one-shot alarms retry transport failures; peer startup and later installation can also wake discovery. There is no continuous polling, remote service or store rescan. Account conflicts require a decision rather than repeated automatic attempts. An interrupted transfer is checked against committed destination data before replay.

Advanced **Sync now** retries saved data without a website scan. **Change account mapping** reviews the account relationship; it is not the persistent opt-out. Use the sharing checkbox to stop transfers. Manual pending offers keep their separate approval requirement. Provider credentials, redemption values and signed download links are never shared.

## Advanced manual sharing and recovery

The earlier guided transfer controls remain under **Advanced: manual purchase sharing and recovery**. They still require their own account confirmation and final import approval. Read-only comparison, previews, technical details and exports remain available there. For intentionally separate accounts, use Advanced to select a separate receiving account. Turn automatic sharing off when no further transfers are wanted.

In GL, open **Providers -> Humble Bundle** or **Fanatical**. Settings contains direct links to these sections. In HB/FAN, open **Galactic Library connection -> Purchase sync -> Advanced: manual purchase sharing and recovery**.

Account choices load when the section opens; no store scan runs. A single eligible source and a single receiving account are suggested. Multiple accounts require a choice, even if nicknames match. Empty receiving accounts are allowed. Choose **Create a separate saved account** to enter a new nickname. Confirm explicitly that both accounts represent the same store account.

Choose **Continue** to review the proposed changes. This runs a read-only preview for either provider and direction; no purchases are imported and no offer is sent. The review separates new saved names from additional purchase records. This is not an edition or ownership decision. GL separates information changes from last-checked time updates. HB and FAN cannot distinguish those update types and say so. Skips and uncertainty stay visible. **Back** lets you revise choices; returning with unchanged choices reuses the review.

For sending, **Send purchases** creates an offer and opens Humble Library or Fanatical Library (or GL when sending from a companion). The receiver selects/confirms its accounts, chooses Continue, reviews the changes, checks the final approval box and chooses **Import purchases**. An offer is not an import. Completion uses committed results; **Share more purchases** starts account selection again.

Changing direction, account, nickname or the development companion invalidates the review. Local purchase changes invalidate it when observed. The final transfer checks the reviewed source fingerprint and source account; the existing serialized destination checks reject changed accounts. If choices are stale, use **Advanced / Diagnostics -> Refresh account choices**, or Retry when loading fails, and review again. Closing Options does not cancel an already approved background import. If completion is uncertain, check the receiving account before retrying.

**Advanced / Diagnostics** is collapsed by default. It contains **Refresh account choices**, optional **Preview transfer**, **Export comparison report**, sharing limits and development companion selection. **Compare saved purchases** is available for Humble only. It explains coverage, uncertainty and category differences without changing either library. Different totals alone do not mean purchases are missing. Technical details retain exact counts; exported reports include private titles, bundle names and account labels. Keep reports private. Normal sharing does not require these diagnostic controls.

To recover older IDs, open the signed-in **Humble Purchases** page and use HB's **Refresh missing product IDs**. Confirm the active saved account; this cannot switch profiles. It previews affected saved orders, downloads an HB safety backup and reads only those order details. IDs are filled only for a unique exact purchase/title/media/delivery association. Existing dates, bundles, titles, ownership and manual metadata are preserved. Source product tokens, scoped record IDs, key-delivery IDs and positional fallbacks are different things. Conflicts, changed titles and ambiguous products remain unchanged. Historical origins receive the same treatment. Missing bibliographic fields can be filled on an individually attributable single-origin row.

**Cancel metadata refresh** retains the original library. Evidence is staged until one validated atomic save; closing the tab discards staged work. Failed orders retain prior evidence. Unresolved IDs are reported separately from request errors. Repeated refreshes do not add purchases or duplicate origins. Afterwards, enabled automatic sync propagates the committed update. For manual sharing, refresh choices and review again. This ID refresh does not establish a new full-scan baseline.

**Check connection** only verifies communication; it does not transfer purchases. Refreshing an already-open storefront bundle updates bundle matching, which is a separate feature. Refreshing a bundle does not share purchase records.

Official builds use their published IDs. For unpacked Chrome builds, allow the companion ID in GL Advanced pairing and enter GL's ID in the companion Advanced settings. GL checks responding, already authorized extension IDs and remembers their verified provider roles. If multiple custom builds respond for one provider, choose the intended allowed ID in GL's Purchase sharing Development companion controls. No webpage or arbitrary extension is authorized. A working bundle ping alone does not prove purchase-sharing capability; GL checks that protocol separately.

Transfers preserve existing richer data and purchase/bundle associations. They do not delete absent records, switch the active account, or establish a new full-scan baseline. Repeating a transfer does not duplicate purchases. Refresh choices and reconfirm if either selected account changes.

Older HB direct-download purchases may lack native product IDs. GL can enrich an unambiguous existing purchase/title but skips unmatched records; no product IDs are invented. A separate fresh HB scan can retain native IDs. GL lacks Humble prices and unsupported Fanatical media. Older FAN products may retain their primary bundle without order-level associations; incomplete product IDs are reported and excluded. Existing destination information remains intact.

Source staging expires after ten minutes or a source worker/browser restart. Failed validation never partially imports. Refresh choices and retry if staging expires. Closing Options does not cancel an already confirmed background import; if it committed, repeating remains safe. A missing/disabled companion and an incorrect ID may be indistinguishable to the browser and are reported together.

Advanced sharing remains manual: opening its controls only discovers accounts. The default-on automatic relationship operates independently unless sharing is off; no storefront scan or cloud service starts. Authentication/session/redemption values and signed download links are excluded. GL shares provider purchase records, not its canonical catalog, enrichment or settings.

## Saved account identity

Saved Humble and Fanatical accounts carry a stable local account ID with their purchase data. Existing valid IDs migrate automatically without changing purchases or a working purchase-sync relationship. Names and purchase updates do not change this ID. Older accounts without recoverable identity receive a new ID and may need connection repair; names and common purchases never establish identity.

Backups may retain account lineage. Restoring resets the live relationship but preserves the local sharing preference. An existing reverse-verified mapping can reconnect only if its exact saved dataset IDs still exist; a UUID alone does not establish provider-account equivalence. Private incremental scan authority remains separate. Conflicting or duplicate account identities are rejected rather than merging accounts.

Temporary connection failures retry within bounded limits. New committed purchases can restart a transport-exhausted check. Missing accounts, revoked purchase-sync permission and conflicting relationships stop automatic retries until repaired; restarting the extension does not repeatedly propose an obsolete account. Saved setup history is distinct from currently verified peer permission.

If a saved account or permission was replaced, choose **Repair connection** in Purchase sync. Review the current saved accounts and confirm once; there is no need to disconnect first or repeat the store scan. A single available account is preselected as a convenience, not treated as proof of identity. Multiple accounts require an explicit choice. Repair preserves purchases and replaces the obsolete synchronization relationship.

## Routine imports

Account naming is optional. A first import uses a default saved account, and routine updates reuse the selected account without repeatedly asking for a nickname or checkbox confirmation. HB and FAN do not verify which website user is signed in: if you change website accounts, use Saved accounts or Advanced accounts first. Add another account explicitly with a full scan; rename an existing account through its Rename action. These actions preserve separate account identities and import histories. GL keeps verified console-account checks in place.

## Lifecycle and connection reports

Restoring or clearing a library retires live transfer permissions before another transfer can save. The separate automatic-sharing preference stays unchanged. A restore can reconnect previously verified accounts only after rechecking their exact saved identities. A clear leaves an unused receiving account that companions may refill while sharing is on; turn sharing off first if that is unwanted. Removing a mapped GL account retires that connection along with its records; other accounts and integrations stay separate. The other extension is notified when reachable, but a failed notification does not undo a completed local operation. Reset import history only resets the scan baseline; it is not clearing purchases or granting sync permission.

In Purchase sync, open **Advanced: accounts and diagnostics**, choose **Check sync connection**, then **Export connection report**. This read-only check reports pairing, purchase permission, mapped-account availability, verified peer confirmation, last success, pending work, failure category and the next recovery action. The export omits raw account IDs, purchase lists and website credentials. It describes the connection when checked, not a guarantee about later changes. If the connection changes, check it again before exporting a current report.

Older unnamed HB/FAN libraries appear as **Default account** in Saved accounts. You can give that account a nickname using Rename account without importing again. Naming preserves its purchases, account identity and sharing permission. When repairing a connection with multiple accounts, review the account choices under Advanced and confirm Connect and sync; changes made elsewhere may require opening Repair connection again.
