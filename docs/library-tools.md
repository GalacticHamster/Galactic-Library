# Remaining Galactic Library features

## Unicode and alternate titles (GL-17)

Comparison keys preserve Unicode letters, combining marks, Japanese voicing and composed Korean. Latin accent simplification remains available without deleting script-specific marks. Stored original titles are unchanged.

Expand **Alternate titles and aliases** on a library card to add translations/transliterations and their source or explanation. These dated, record-scoped aliases generate Possible candidates only. Edition identifiers or reviewed edition relationships remain necessary for stronger claims. Known conflicting creators, runs and unit numbers still prevent unrelated aliases from supplying candidates. Aliases cannot attach to another account's record when a provider reuses its native ID. Database schema 7 preserves aliases and accepts schemas 1–6.

## Software (GL-12)

Software is a separate central media type, filter and count. Humble explicitly typed software products and software-bundle keys retain that classification even if a PDF booklet is included. OS/platform delivery alone does not infer software. Fanatical software/assets now survive the validated order projection. Use a full rescan to correct legacy game classifications; incompatible edition/content reviews are cleared when a record's media type changes, while its persistent reference stays stable.

The version 1 companion API advertises `software` in `GET_STATUS.capabilities.mediaTypes` and accepts software match requests. Software and games never match across types. Clients should check the advertised capability before enabling software requests. Exact product titles with compatible edition evidence can establish software ownership; different packages remain Possible.

## Purchase occurrences (GL-13)

Fanatical keeps one catalog product with multiple purchase occurrences. Each occurrence retains its bundle, purchase date and last observation, using opaque order/occurrence hashes instead of raw order IDs. The inspector lists every captured origin. Quick updates and same-profile full scans merge occurrences without overwriting earlier purchase evidence or double-counting an already seen occurrence. The acquisition date is the earliest known purchase. Missing origin evidence does not establish refund or revocation. Switching profiles archives the old provenance and never merges it into the new account.

A full rescan is needed to recover historical origins that older versions discarded. Stored metadata bounds still apply: at most 500 occurrences and 100 KB metadata per product; an over-limit import fails rather than truncating its provenance. Origin details stay out of companion responses and remain in local backups.

## Ownership confirmations and local receipts (GL-29)

Expand **Confirm ownership with dated evidence** on any current record. Select purchase/permanent claim, temporary access or unknown, describe the checked evidence and its date, optionally cite a source URL and temporary access expiry, and explicitly confirm the record/account. Undo restores provider evidence. A separate source confirmation never rewrites the provider's ownership or observation dates. It survives resync and backup/restore through the persistent record reference; stale confirmations and undo requests cannot override a newer review or another profile.

The **Local purchase evidence** workbench accepts CSV/JSON exports under 5 MB, up to 1,000 entries per import. Use `title`, `acquiredAt`/`Purchase Date` (ISO date), optional `asin`, `isbn`, `providerItemId`/`Catalog ID`, `provider`, and `mediaType`. Select Kindle for Comixology evidence or Audible for audiobook receipts. Unknown customer/payment/redemption fields are discarded immediately; raw receipts never leave the browser and are not retained. This is structured-export import, not PDF/email/OCR extraction.

ASIN/ISBN/catalog IDs take priority when generating candidates. Title-only candidates remain proposals. Select and explicitly confirm the actual current edition/account before a receipt establishes a dated purchase confirmation. Known identifier/unit/edition conflicts reject approval. Unmatched receipts stay pending; sync the provider and refresh their candidates. Refresh never silently moves a receipt to a different profile. This reconciles existing library records; it does not invent provider records for unmatched receipts.

Confirmed permanent ownership can contribute separately verified contents. Temporary access, expired access and expired/unavailable reseller keys cannot. A receipt is not destination-platform activation and does not complete missing edition identity: a title-only storefront request may still be Possible. Companion responses expose only confirmation basis/date and access expiry, never receipt notes, URLs, customer details or account labels. Schema 8 preserves reviews and proposals and accepts schemas 1–7.

## Sync health (GL-32)

The Sync health dashboard shows each provider's current profile, full/quick freshness, active and historical counts, latest attempt, coverage evidence and snapshot differences. Quick updates never report unseen records as missing. Switching accounts starts a new comparison baseline. Array-only Fanatical indexes explicitly report their coverage limitation. Retry counts and failed page numbers appear only when reported by the scanner; unavailable counts stay unknown. Failures store a safe category, not raw exception text, request URLs or response bodies.

Retry links open the provider library for a new scan. Cancel pending scan commit revokes the current attempt: an in-flight network request may finish, but its late response cannot change the library. Newer attempts reject older failure/cancel reports. A restored backup cancels previously running attempts. Failures preserve the last validated library, full coverage and timestamps. A long-running attempt is flagged after ten minutes for checking its tab, without fabricating a failure.

## Entitlement reminders (GL-33)

The Entitlement reminders dashboard combines unknown destination activation, reported key expiry/unavailability and temporary-access deadlines. Activation remains unknown for purchased/revealed reseller keys. An expired reported key cannot supply current Owned or contents coverage; independent destination ownership still can. Expiry does not prove an activated license was revoked. Temporary access without a reported expiry stays explicitly unknown.

Dismiss or snooze reminders without changing ownership. Reviews are scoped to the persistent current record and its evidence; changed dates/key status/ownership reviews reactivate the reminder. Archived profiles never generate current reminders. The dashboard pages results in groups of 50 and offers navigation to the current record. Backup schema 9 preserves reminder reviews and accepts schemas 1?8.

Desktop notifications are disabled by default. Enable them from the dashboard to request optional alarms/notifications permissions. Chrome checks hourly while running, recreates missing alarms after worker/browser restart, and shows at most one aggregate count per UTC day, without titles, accounts, receipts or keys. Permission revocation disables notifications; clear/restore also disables them. Notification preferences and daily dedup state are private device settings excluded from backups. OS suppression can prevent delivery. APIs follow the official [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) and [notifications](https://developer.chrome.com/docs/extensions/reference/api/notifications) documentation.

## Reading progress, access and custom orders (GL-34)

Book/audiobook cards have Reading, access and downloads controls. Track unread/reading/completed, percentage, downloaded locally and accessible/unavailable/unknown independently. Access records include the date checked. Completion is 100%, unread is 0%; reading is 0?99%. These self-reports never alter provider ownership, manual purchase evidence or contents coverage, and are not exposed to companion extensions. Clear reading state resets only these self-reports. Stale saves/clears reject instead of overriding a newer edit.

The Reading progress and custom orders workbench searches current books/audiobooks and filters reading, download and access states in pages of 50. Create/rename/delete a custom order, select it, add current records, move entries earlier/later or remove them. Orders may mix books and audiobooks; sequence is explicitly user chosen, not inferred publisher chronology. Each order supports 500 unique records; all order entries are reachable through pagination. Reordering/deleting checks the current revision.

Progress and order references survive resync, backup and profile changes. Historical entries retain previous progress and are labeled outside the current library without claiming current ownership. New account records never inherit another account's progress through reused provider IDs. Archived records may stay in existing orders but cannot be added as new current entries. Schema 10 preserves reading states/orders and accepts schemas 1?9.
