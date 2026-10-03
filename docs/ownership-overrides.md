# Treat library items as owned

In **Settings → Ownership display and matching**, enable **Treat everything as owned** to count every item in the active imported libraries as owned. This includes unknown ownership, subscriptions, borrowed or rented items and expired/unavailable keys. Each connected provider also has a **Treat all [provider] items as owned** checkbox for applying the same choice to that library alone.

The global choice takes precedence. Provider checkboxes are disabled while it is on, but their saved choices remain intact and resume when it is turned off. All choices start off.

This is a display and matching preference. It does not change stored provider observations, ownership confirmations, media type, purchase provenance, access dates, reading/download states or receipts. **Details → Ownership evidence and relationships** shows the original ownership and identifies the display override. Switching the setting off restores the normal ownership rules, including dated confirmations and key/access expiry checks.

Owned filters, provider labels, reading ownership, matching and owned reviewed contents use the preference. Original access and key reminders retain their source evidence. It does not create records for other account archives or missing purchases, invent collection contents, establish platform activation, or bypass title, edition, identifier, author or scope matching. A related edition can still be Possible.

HB/FAN receive the derived `ownership: owned` for matching records through the existing Galactic Library API. Narrow public evidence marks `ownershipBasis: user-assumed-owned` and retains `observedOwnership`. Refresh open HB/FAN bundle pages after changing this setting so they run fresh checks.

The setting is stored separately from provider records in database `ownershipPolicy`, survives imports and backup/restore, and is reset by Clear local library. Schema 12 adds this field; schemas 1–11 migrate with the preference off. The serialized writer validates and merges preference patches, preserving concurrent changes from multiple Library windows. Provider pages and companion extensions cannot change the preference.
