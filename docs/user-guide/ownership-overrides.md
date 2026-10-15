# Treat library items as owned

Use **Change access** on a Library card for ordinary corrections. Choose the
status, optionally add a note, and Save. No explanation, receipt, evidence date
or confirmation checkbox is required. GL records when you made the correction;
it does not infer when you purchased, returned or lost access to the book.
Cancel keeps the previous status.

For several books, use the **Select** checkbox on each card, then **Change access
for selected**. Cards containing several account copies offer **Select account
copies** so you can choose exactly which provider/accounts to change. The editor
previews every chosen copy and its current status before Save. Changes apply
atomically to up to 500 selected account copies; an outdated selection must be
reloaded rather than partially applied. Selection can span pages and filters.
**Change access** on any selected card opens the same selected group. On an
unselected card, it edits that card's copies only.

Choose **Use provider status (clear correction)** in the same editor to remove
your correction. Quick corrections use the existing ownership-review storage,
survive imports and backup/restore, and update coverage and duplicate counts.
They take precedence over provider inference and assume-owned preferences.
Reseller purchase confirmations still do not establish destination activation.
Original provider observations, titles, contents and purchase information stay
unchanged. Other owned copies of an issue continue contributing to coverage.

The existing **Details → Your library → Confirm ownership with dated evidence**
form remains available for detailed documentation. It retains its evidence/date
requirements; ordinary changes do not require opening it.

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

For detailed refund documentation, open **Details → Your library → Confirm ownership with
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
confirmation. A new quick correction is your explicit choice about current
access. Clearing it restores provider-derived status. Absence from a scan never
establishes a return.

The Kindle scanner reads Amazon's Content & Devices library response, not order
history. It recognizes completed return/refund, revoked and expired status when
Amazon supplies that status for the exact library item. A blank status cannot
establish whether an earlier purchase was refunded. No order-history scraping or
additional Amazon permissions are enabled; the existing correction is the way
to record a return checked in your Amazon account.

In **Settings → Ownership display and matching**, enable **Treat everything as owned** to count every item in the active imported libraries as owned. This includes unknown ownership, subscriptions, borrowed or rented items and expired/unavailable keys. Each connected provider also has a **Treat all [provider] items as owned** checkbox for applying the same choice to that library alone.

The global choice takes precedence. Provider checkboxes are disabled while it is on, but their saved choices remain intact and resume when it is turned off. All choices start off.

This is a display and matching preference. It does not change stored provider observations, ownership confirmations, media type, purchase provenance, access dates, reading/download states or receipts. **Details → Advanced → Matching, editions and source evidence** shows the original ownership and identifies the display override. Switching the setting off restores the normal ownership rules, including dated confirmations and key/access expiry checks.

Owned filters, provider labels, reading ownership, matching and owned reviewed contents use the preference. Original access and key reminders retain their source evidence. It does not create records for other account archives or missing purchases, invent collection contents, establish platform activation, or bypass title, edition, identifier, author or scope matching. A related edition can still be Possible.

HB/FAN receive the derived `ownership: owned` for matching records through the existing Galactic Library API. Narrow public evidence marks `ownershipBasis: user-assumed-owned` and retains `observedOwnership`. Refresh open HB/FAN bundle pages after changing this setting so they run fresh checks.

The setting is stored separately from provider records in database `ownershipPolicy`, survives imports and backup/restore, and is reset by Clear local library. Schema 12 adds this field; schemas 1–11 migrate with the preference off. The serialized writer validates and merges preference patches, preserving concurrent changes from multiple Library windows. Provider pages and companion extensions cannot change the preference.
