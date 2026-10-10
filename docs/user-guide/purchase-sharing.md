# Share saved purchases without another scan

In GL, open **Providers -> Share Humble purchases** or **Share Fanatical purchases**. Settings contains direct links to these sections. In HB/FAN, open **Galactic Library connection -> Purchase sharing**.

Account choices load automatically when the section opens. Local accounts load independently of the connection; a remote failure does not hide your local library. Empty accounts and older accounts remain visible. Missing product or purchase identity is explained separately from the account count. Choices are cached in this open page; use **Refresh account choices** after changing either library.

For Humble, select both accounts and use **Reconcile accounts** before transferring. This is read-only and requires an existing destination. HB rows can contain several purchase origins; GL provider records can separately retain downloads and key deliveries. Different counts do not necessarily mean missing products. The summary distinguishes scoped record IDs, same-purchase evidence, ambiguity, conflicts and title-only possibilities. GL observations without a unique correspondence include extra deliveries and conflicts; this is not a count of missing titles. History is exported separately.

**Preview transfer** runs existing merge rules on a disposable copy. It shows additions, enrichment, unchanged/skipped records and safely matchable missing-ID records. GL separates observation-timestamp updates from substantive evidence updates. A preview creates no offer and saves no purchases. Confirmation is still required for Send/Import. **Export comparison report** includes private title, bundle, media, account, current/history status and reasons. Purchase references are opaque SHA-256 hashes, not purchase-page keys. Candidate numbers index `glObservations`; up to 50 are listed per row, with the complete candidate count retained.

To recover older IDs, open the signed-in **Humble Purchases** page and use HB's **Refresh missing product IDs**. Confirm the active saved account; this cannot switch profiles. It previews affected saved orders, downloads an HB safety backup and reads only those order details. IDs are filled only for a unique exact purchase/title/media/delivery association. Existing dates, bundles, titles, ownership and manual metadata are preserved. Source product tokens, scoped record IDs, key-delivery IDs and positional fallbacks are different things. Conflicts, changed titles and ambiguous products remain unchanged. Historical origins receive the same treatment. Missing bibliographic fields can be filled on an individually attributable single-origin row.

**Cancel metadata refresh** retains the original library. Evidence is staged until one validated atomic save; closing the tab discards staged work. Failed orders retain prior evidence. Unresolved IDs are reported separately from request errors. Repeated refreshes do not add purchases or duplicate origins. Afterwards refresh account choices and run Reconcile/Preview again; no transfer starts automatically. This ID refresh does not establish a new full-scan baseline.

1. Choose **Import purchases from...** or **Send purchases to...**.
2. Select the source and destination accounts. To create a separate destination, select that option and enter its nickname; the nickname field is otherwise hidden.
3. Confirm the selected accounts represent the same store account. Equal nicknames do not prove identity. The action stays disabled until all required fields and confirmation are valid.
4. **Import saved purchases** transfers, validates and atomically merges the records here. Progress reports Preparing, Transferring, Validating, Importing and Complete. **Import committed** reports actual received, added, updated, unchanged and skipped counts.

**Send saved purchases** prepares an offer and opens the receiving extension. The selected destination is suggested there, but the receiving user must review the accounts, confirm and choose Import. **Offered** means no purchases have been imported. Select **Review purchase offer** on that Options page to open the right section.

**Check connection** only verifies communication; it does not transfer purchases. Refreshing an already-open storefront bundle updates bundle matching, which is a separate feature. Refreshing a bundle does not share purchase records.

Official builds use their published IDs. For unpacked Chrome builds, allow the companion ID in GL Advanced pairing and enter GL's ID in the companion Advanced settings. GL checks responding, already authorized extension IDs and remembers their verified provider roles. If multiple custom builds respond for one provider, choose the intended allowed ID in GL's Purchase sharing Development companion controls. No webpage or arbitrary extension is authorized. A working bundle ping alone does not prove purchase-sharing capability; GL checks that protocol separately.

Transfers preserve existing richer data and purchase/bundle associations. They do not delete absent records, switch the active account, or establish a new full-scan baseline. Repeating a transfer does not duplicate purchases. Refresh choices and reconfirm if either selected account changes.

Older HB direct-download purchases may lack native product IDs. GL can enrich an unambiguous existing purchase/title but skips unmatched records; no product IDs are invented. A separate fresh HB scan can retain native IDs. GL lacks Humble prices and unsupported Fanatical media. Older FAN products may retain their primary bundle without order-level associations; incomplete product IDs are reported and excluded. Existing destination information remains intact.

Source staging expires after ten minutes or a source worker/browser restart. Failed validation never partially imports. Refresh choices and retry if staging expires. Closing Options does not cancel an already confirmed background import; if it committed, repeating remains safe. A missing/disabled companion and an incorrect ID may be indistinguishable to the browser and are reported together.

Sharing is manual: opening controls only discovers saved accounts. No scan, polling, cloud service or automatic transfer starts. Authentication/session/redemption values and signed download links are excluded. GL shares provider purchase records, not its canonical catalog, enrichment or settings.
