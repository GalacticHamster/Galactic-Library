# Treat library items as owned

Kindle purchases migrated from Comixology are recognized from the saved Kindle
library context. This is separate from the optional override below: it does not
include Comics Unlimited, Kindle Unlimited, loans, rentals, samples or conflicting
access evidence. Older imports retain their original observation, and Library
details explain the recognized purchase. Existing ownership corrections take
precedence; a receipt or order ID is not required for provider-context recognition.

In **Library → Comic Coverage**, expand **Books excluded by access** to search
books whose issue information is available but whose access does not establish
ownership. Each entry shows its status, exclusion reason and issue ranges.
**Review ownership** opens that book's existing ownership correction directly.
Saving a correction updates coverage without rescanning the provider or editing
the book's contents. The section stays collapsed during ordinary browsing.

For a refunded book, open its **Details → Your library → Confirm ownership with
dated evidence**, choose **Returned / Refunded**, record the checked evidence
and date, then confirm and save. Check the exact product/ASIN and account, not
just a similar title. **Access revoked** and **Access expired** are also available.
These statuses retain the book, original purchase information and contents while
excluding that acquisition from owned coverage and duplicate counts. Other
owned books covering the same issues still contribute. Use the Library's
**More filters → Access** to find these books; **All saved items** includes them.

Explicit returned, revoked or expired states take precedence over the optional
assume-owned settings below. A saved return correction survives provider updates
and backup/restore. If the book is later purchased again, review the current
account/product evidence and update or undo the correction. A provider-reported
completed return cannot be overridden by purchase inference or an old purchase
confirmation. Absence from a scan never establishes a return.

The Kindle scanner reads Amazon's Content & Devices library response, not order
history. It recognizes completed return/refund, revoked and expired status when
Amazon supplies that status for the exact library item. A blank status cannot
establish whether an earlier purchase was refunded. No order-history scraping or
additional Amazon permissions are enabled; the existing correction is the way
to record a return checked in your Amazon account.

In **Settings → Ownership display and matching**, enable **Treat everything as owned** to count every item in the active imported libraries as owned. This includes unknown ownership, subscriptions, borrowed or rented items and expired/unavailable keys. Each connected provider also has a **Treat all [provider] items as owned** checkbox for applying the same choice to that library alone.

The global choice takes precedence. Provider checkboxes are disabled while it is on, but their saved choices remain intact and resume when it is turned off. All choices start off.

This is a display and matching preference. It does not change stored provider observations, ownership confirmations, media type, purchase provenance, access dates, reading/download states or receipts. **Details → Ownership evidence and relationships** shows the original ownership and identifies the display override. Switching the setting off restores the normal ownership rules, including dated confirmations and key/access expiry checks.

Owned filters, provider labels, reading ownership, matching and owned reviewed contents use the preference. Original access and key reminders retain their source evidence. It does not create records for other account archives or missing purchases, invent collection contents, establish platform activation, or bypass title, edition, identifier, author or scope matching. A related edition can still be Possible.

HB/FAN receive the derived `ownership: owned` for matching records through the existing Galactic Library API. Narrow public evidence marks `ownershipBasis: user-assumed-owned` and retains `observedOwnership`. Refresh open HB/FAN bundle pages after changing this setting so they run fresh checks.

The setting is stored separately from provider records in database `ownershipPolicy`, survives imports and backup/restore, and is reset by Clear local library. Schema 12 adds this field; schemas 1–11 migrate with the preference off. The serialized writer validates and merges preference patches, preserving concurrent changes from multiple Library windows. Provider pages and companion extensions cannot change the preference.
