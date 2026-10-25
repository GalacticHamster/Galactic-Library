# Remaining Galactic Library features

Individual reading, ownership, book enrichment and identity actions are organized in [Library item details](item-details.md). Cross-library workbenches are in Books & Contents (Book information), and Library (Reading and Ownership and access). Detailed book contents review lives in [Contents](contents-workspace.md).

## Choose the right ownership task

**Library → Ownership and access** keeps four tasks separate:

- **Correct ownership or access:** find the item in Library and use **Change access**, including bulk corrections. For optional dated evidence, use Details → Your library.
- **Match products and editions:** open an item's Details → Matching and editions, or browse related product pairs here. A product relationship is not a purchase confirmation.
- **Match purchase receipts:** expand **Receipt files** to import local evidence. **Ready to match** counts receipts with a candidate in the same saved account; **Waiting for an account copy** is separate. Both remain available in the Receipt status filter. Nothing confirms automatically.
- **Manage keys and access reminders:** expand the existing reminders. Informational activation status, deadlines and dismissed reminders are separate from ownership corrections.

The Comixology investigation download remains under its own disclosure. Provider accounts and purchase synchronization stay in **Providers**. Product-pair decisions and earlier saved relationships are retained; this organization does not resolve anything for you.

## Understand review counts

Library alerts separate **book suggestions needing a decision**, **lookup failures / no results**, and **receipts ready to match**. Each opens its matching queue. Unmatched receipts, saved decisions and successful source selections are not included in these actionable counts. A lookup failure is a retrieval result, not proof of incorrect ownership or missing contents.

Book information shows suggestions, failures, unreviewed contents and saved source selections separately. Missing book information is optional enrichment. Included contents has a **Contents to check** filter for changed, incomplete or uncertain descriptions, separate from **Unreviewed or changed contents** and **Latest retrieval failed**. Usable inferred contents do not require a human review to contribute to coverage. Review totals count records or suggestions, not purchases or comic issues.

## Unicode and alternate titles (GL-17)

Comparison keys preserve Unicode letters, combining marks, Japanese voicing and composed Korean. Latin accent simplification remains available without deleting script-specific marks. Stored original titles are unchanged.

Open **Details → Advanced → Alternate titles and aliases** on a library card to add translations/transliterations and their source or explanation. These dated, record-scoped aliases generate Possible candidates only. Edition identifiers or reviewed edition relationships remain necessary for stronger claims. Known conflicting creators, runs and unit numbers still prevent unrelated aliases from supplying candidates. Aliases cannot attach to another account's record when a provider reuses its native ID. Database schema 7 preserves aliases and accepts schemas 1–6.

## Software (GL-12)

Software is a separate central media type, filter and count. Humble explicitly typed software products and software-bundle keys retain that classification even if a PDF booklet is included. OS/platform delivery alone does not infer software. Fanatical software/assets now survive the validated order projection. Use a full rescan to correct legacy game classifications; incompatible edition/content reviews are cleared when a record's media type changes, while its persistent reference stays stable.

The version 1 companion API advertises `software` in `GET_STATUS.capabilities.mediaTypes` and accepts software match requests. Software and games never match across types. Clients should check the advertised capability before enabling software requests. Exact product titles with compatible edition evidence can establish software ownership; different packages remain Possible.

## Purchase occurrences (GL-13)

Fanatical keeps one catalog product with multiple purchase occurrences. Each occurrence retains its bundle, purchase date and last observation, using opaque order/occurrence hashes instead of raw order IDs. The inspector lists every captured origin. Quick updates and same-profile full scans merge occurrences without overwriting earlier purchase evidence or double-counting an already seen occurrence. The acquisition date is the earliest known purchase. Missing origin evidence does not establish refund or revocation. Switching profiles archives the old provenance and never merges it into the new account.

A full rescan is needed to recover historical origins that older versions discarded. Stored metadata bounds still apply: at most 500 occurrences and 100 KB metadata per product; an over-limit import fails rather than truncating its provenance. Origin details stay out of companion responses and remain in local backups.

## Ownership confirmations and local receipts (GL-29)

Expand **Confirm ownership with dated evidence** on any current record. Select purchase/permanent claim, temporary access or unknown, describe the checked evidence and its date, optionally cite a source URL and temporary access expiry, and explicitly confirm the record/account. Undo restores provider evidence. A separate source confirmation never rewrites the provider's ownership or observation dates. It survives resync and backup/restore through the persistent record reference; stale confirmations and undo requests cannot override a newer review or another profile.

The **Library → Ownership and access → Match purchase receipts → Receipt files** workbench accepts CSV/JSON exports under 5 MB, up to 1,000 entries per import. Use `title`, `acquiredAt`/`Purchase Date` (ISO date), optional `asin`, `isbn`, `providerItemId`/`Catalog ID`, `provider`, and `mediaType`. Select Kindle for Comixology evidence or Audible for audiobook receipts. Unknown customer/payment/redemption fields are discarded immediately; raw receipts never leave the browser and are not retained. This is structured-export import, not PDF/email/OCR extraction.

For an Audible purchase-history page, the optional [visible-page checker](https://www.audible.com/account/purchase-history?gl-audible-ownership-check=1) also offers **Preview purchase evidence**. Select **Your orders**, wait for the page to load, and preview the books and dates matched by exact Audible identifiers to your saved account. Shared order dates are supported; order totals are never allocated to individual books. This checks only the displayed page and does not establish complete history or current ownership.

If Audible identifies a book but does not expose a readable linked title, the preview can use that exact identifier's saved book title. It tells you when saved names are used. Purchase dates still come from the history page; surrounding author or promotional text is not guessed as the title.

After checking the account and any later returns, you may download a separate **private purchase evidence** file containing titles, identifiers and purchase dates. Unlike the diagnostic report, this file contains personal library information; keep it private. Select the same saved Audible account in Providers, import the file through **Receipt files**, and review each candidate before confirming ownership. The preview/download makes no library changes. Refund pages, unavailable account comparisons, conflicting order keys, missing titles and unmatched identifiers cannot produce positive evidence for those entries; explicit completed-return wording excludes the affected identifier from the preview. Unknown refunds and repurchases still need your review. The existing receipt workflow stores the purchase date as ownership evidence; it does not fill or replace the provider record's acquisition date. Existing corrections remain until you explicitly change or confirm them.

ASIN/ISBN/catalog IDs take priority when generating candidates. Title-only candidates remain proposals. Select and explicitly confirm the actual current edition/account before a receipt establishes a dated purchase confirmation. Known identifier/unit/edition conflicts reject approval. Unmatched receipts stay pending; sync the provider and refresh their candidates. Refresh never silently moves a receipt to a different profile. This reconciles existing library records; it does not invent provider records for unmatched receipts.

Confirmed permanent ownership can contribute separately verified contents. Temporary access, expired access and expired/unavailable reseller keys cannot. A receipt is not destination-platform activation and does not complete missing edition identity: a title-only storefront request may still be Possible. Companion responses expose only confirmation basis/date and access expiry, never receipt notes, URLs, customer details or account labels. Schema 8 preserves reviews and proposals and accepts schemas 1–7.

## Sync health (GL-32)

The Sync health dashboard shows each provider's current profile, full/quick freshness, active and historical counts, latest attempt, coverage evidence and snapshot differences. Quick updates never report unseen records as missing. Switching accounts starts a new comparison baseline. Array-only Fanatical indexes explicitly report their coverage limitation. Retry counts and failed page numbers appear only when reported by the scanner; unavailable counts stay unknown. Failures store a safe category, not raw exception text, request URLs or response bodies.

Retry links open the provider library for a new scan. Prevent this import from saving revokes the current attempt: an in-flight network request may finish, but its late response cannot change the library. Newer attempts reject older failure/cancel reports. A restored backup cancels previously running attempts. Failures preserve the last validated library, full coverage and timestamps. A long-running attempt is flagged after ten minutes for checking its tab, without fabricating a failure.

## Keys and access reminders (GL-33)

The Keys and access reminders dashboard combines unknown destination activation, reported key expiry/unavailability and temporary-access deadlines. Activation remains unknown for purchased/revealed reseller keys. An expired reported key cannot supply current Owned or contents coverage; independent destination ownership still can. Expiry does not prove an activated license was revoked. Temporary access without a reported expiry stays explicitly unknown.

Dismiss or snooze reminders without changing ownership. Reviews are scoped to the persistent current record and its evidence; changed dates/key status/ownership reviews reactivate the reminder. Archived profiles never generate current reminders. The dashboard pages results in groups of 50 and offers navigation to the current record. Backup schema 9 preserves reminder reviews and accepts schemas 1–8.

Desktop notifications are disabled by default. Enable them from the dashboard to request optional alarms/notifications permissions. Chrome checks hourly while running, recreates missing alarms after worker/browser restart, and shows at most one aggregate count per UTC day, without titles, accounts, receipts or keys. Permission revocation disables notifications; clear/restore also disables them. Notification preferences and daily dedup state are private device settings excluded from backups. OS suppression can prevent delivery. APIs follow the official [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) and [notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications) documentation.

## Reading progress, access and custom orders (GL-34)

Book/audiobook cards have Reading, access and downloads controls. A record without a saved reading state displays **Reading status not saved**, with a separate filter from explicitly saved **Unread**. Track unread/reading/completed, percentage, downloaded locally and accessible/unavailable/unknown independently. Access records include the date checked. Completion is 100%, unread is 0%; reading is 0–99%. These self-reports never alter provider ownership, manual purchase evidence or contents coverage, and are not exposed to companion extensions. Clear reading state resets only these self-reports. Stale saves/clears reject instead of overriding a newer edit.

The Reading progress and custom orders workbench searches current books/audiobooks and filters reading, download and access states in pages of 50. Create/rename/delete a custom order, select it, add current records, move entries earlier/later or remove them. Orders may mix books and audiobooks; sequence is explicitly user chosen, not inferred publisher chronology. Each order supports 500 unique records; all order entries are reachable through pagination. Rename and Delete are disabled until an order is selected. Delete asks for confirmation and keeps books and reading progress. Unsaved create/rename titles survive reconciliation and require deliberate discard when leaving. Reordering/deleting still checks the current revision.

Progress and order references survive resync, backup and profile changes. Historical entries retain previous progress and are labeled outside the current library without claiming current ownership. New account records never inherit another account's progress through reused provider IDs. Archived records may stay in existing orders but cannot be added as new current entries. Schema 10 preserves reading states/orders and accepts schemas 1–9.

Notification creation uses the callback API for the declared Chrome 102 minimum; the Promise API requires Chrome 116. Failed delivery releases the daily reservation so a later check can retry, without persisting raw OS errors.


## Humble companion reminder feeds

In HB's options, pair GL, confirm the same Humble account, enter GL's current Humble profile label and select **Send reminders to Galactic Library**. Labels may differ between extensions; account confirmation is explicit. This requires the updated HB and GL runtimes. Software comparisons also use GL's advertised capability independently of reminder sharing.

The **Keys and access reminders** dashboard labels HB reports separately from native GL evidence, with their observation date and complete/partial scan baseline. These feeds never change owned records or prove destination activation. Use **Review in Humble Comic Library** to open the source extension; dismiss, snooze and restore remain local reminder actions. **Remove Humble companion feed** deletes only that client's feed, including inactive-profile feeds. HB can also retract its own feed while paired.

Sharing is manual. A complete staged upload replaces a client's prior feed atomically; a failed transfer leaves it intact. Saved feeds are included in GL backups and remain after HB is cleared, unlinked or uninstalled. Feeds outside the current GL Humble profile do not generate active reminders. [Protocol and privacy details](../architecture/companion-api.md#account-scoped-companion-entitlement-feeds-hb-13-receiver).

## Backups and optional tools

In Settings, **Restore backup** first validates the selected file and asks before replacing this browser's saved library, accounts and reviews. It does not merge libraries. Choose **Cancel**, **Export current backup**, or **Replace library**. A changed saved library invalidates the open confirmation; select the file again. Private API keys and companion links are not included in a library backup.

**Book information** keeps bulk lookup and cross-library suggestion review separate from ordinary browsing. **Browse books in Library** opens the single catalog; book tools do not contain a second catalog. **Clear saved lookup queue** asks before abandoning incomplete progress and keeps already saved metadata.

**Performance diagnostics** in Settings exports recent companion queries and worker/Options timings without Amazon or acquisition tracing. Detailed worker buffers are in memory and reset when that worker restarts; only a tiny previous-worker breadcrumb may survive within the browser session. Detailed scan tracing on Kindle is separate and resets with that tab.

## Primary workbenches and terminology

Library → Reading and Books & Contents → Book information open their primary workbenches
without another expansion. Technical details, source history and optional lookup
help remain collapsed. Book information, Included contents and Compare collections are secondary views
under Books & Contents. Comic Coverage remains under Library.

**Review matching products and editions** concerns product identity, not whether
you purchased it. **Copies owned** counts distinct confirmed acquisition groups;
**Ownership / access** filters the account copy’s effective status. Reading’s
**Availability (self-reported)** records whether you can currently use a copy and
does not change that ownership status. Comic issue coverage is a separate view
of material included in owned books.
