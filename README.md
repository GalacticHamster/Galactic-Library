# Galactic Library

Galactic Library combines browser-local libraries for games, software, books,
audiobooks, movies and TV. It supports Chrome and Firefox desktop. There is no
cloud library or account service. Start with the [documentation index](docs/README.md)
and [privacy policy](PRIVACY.md).

## Find your way around

The main navigation is **Library | Providers | Books & Contents | Settings**.

- **Library → All items:** search all saved items, including unconfirmed,
  borrowed, subscription and returned records. Equivalent products can appear as
  one entry while retaining their original account copies and purchase history.
- **Books & Contents → Book information:** run bulk book lookups and review metadata
  suggestions. Its primary review controls open immediately. Individual book
  lookups and source undo are available in item Details.
- **Library → Reading:** track book/audiobook progress and create custom reading
  orders. The workbench opens immediately. Reading and downloaded status do not
  establish ownership.
- **Library → Comic Coverage:** browse Series Coverage and Collection Overlap.
  Inspect complete, partial, repeated and missing issue coverage, supporting
  books, and unresolved publications.
- **Library → Ownership and access:** choose ownership corrections, product/edition
  relationships, optional receipt matching, or key/access reminders. Quick corrections
  remain on Library cards; ordinary edition decisions remain in item Details.
- **Providers:** import or update signed-in libraries, manage saved accounts,
  connect companion purchase sync, and inspect update health.
- **Books & Contents → Included contents:** inspect an exact book/account's included works, review or enter
  contents, and inspect captured evidence. **Compare collections** retains explicit
  target issue ranges and manga-volume comparisons with explicit account scope and
  links to supporting books. Review counts separate pending decisions, failed lookups
  and usable unreviewed contents.
- **Settings:** appearance, ownership assumptions, book-service configuration,
  backups, diagnostics and advanced developer pairing.

Views remember supported filters and positions. Item links preserve account
scope and return context. A saved workspace can reopen instead of All items.

## Import and update

Open **Providers**, choose the provider, and open its signed-in website. Actual
store scans run from the Galactic Library panel there; opening a website or
selecting an account does not start a scan. First-time store scans require an
account nickname and confirmation. An unambiguous remembered account is reused
on later visits; a different store login requires deliberate account switching.
Every saved account remains in the combined Library.

Supported providers are Steam, GOG, Epic Games, Amazon Games, Audible, Kindle,
Amazon Video, Fandango at Home, Kobo, Humble Bundle, Fanatical, Xbox Web Library, PlayStation and Nintendo
Switch Virtual Game Cards. Nintendo uses **Import loaded cards** on its signed-in
portal and keeps earlier cards absent from the current non-hidden view. It does
not request or store Nintendo credentials. PlayStation supports the active PS4/PS5
Purchased web library using the existing signed-in session. Its full and quick
checks retain earlier saved records; older consoles and lifetime history are not
included. Its initial production import has been live-validated. Xbox imports the current
web-visible Owned catalog from the signed-in page, not the complete console or
lifetime purchase history; earlier records and manual access corrections remain
intact. Its initial production import is live-validated for 37 products. Epic and
Nintendo support complete imports only. Other quick updates check each provider's incremental
scope; they do not establish that missing records were removed. A successful
Full rescan reconciles the selected supported view. Other providers may move
missing records to earlier-import history; these console views retain earlier
saved records. Failed or incomplete scans preserve the previous validated library.
See [Providers and saved accounts](docs/user-guide/providers-and-accounts.md).

For HB/FAN, **Connect and sync** can populate an empty library from saved
purchases without another store scan. One confirmation authorizes ongoing sync
between the verified extensions for the selected account. Nicknames are optional
for this connection. When both contain purchases, confirm they represent the
same store account. Multiple accounts require explicit selection. **Sync now**
checks saved purchases; **Check connections** only tests communication.
See [purchase sync](docs/user-guide/purchase-sharing.md).

## Ownership, products and copies

These are separate questions:

- **Product identity:** do records represent the same edition or related works?
  Use **Details → Matching and editions**. Same Work
  keeps editions separate; Same Edition can consolidate their display. Neither
  establishes a purchase. Preferred display titles preserve original source titles.
- **Ownership / access:** is this account copy owned, borrowed, subscribed,
  returned or unconfirmed? Use **Change access** on a Library card, individually
  or for selected account copies. Notes are optional. Detailed dated evidence
  remains available in Details → Your library.
- **Copies owned:** the filter counts confirmed distinct acquisition groups,
  not repeated imports or sync observations. **All saved items** is the default.
  Expand **Purchase and access history** to inspect acquisitions and original
  transactions. Conservative repeated free claims can form one group.
- **Issue coverage:** owned collections can cover contained issues without
  creating separate purchases or making the collection identical to those issues.

Kobo library presence alone does not prove purchase. Audible and Kindle can
include temporary or unconfirmed access. Reliable migrated Comixology provider
context can establish ownership; explicit returns and contradictory temporary
access remain protected. A missing item never proves a refund. Account-level
Kobo preferences and global/per-provider ownership assumptions are opt-in and
retain original source evidence. See [ownership corrections and preferences](docs/user-guide/ownership-overrides.md).

## Book information and included contents

Google Books discovery uses a private user API key configured in Settings.
Unambiguous compatible edition results may apply automatically; uncertain
results require review. Open Library work evidence does not identify an owned
edition. Local ComicInfo.xml/EPUB/OPF, ISBN lookup and manually cited publisher
metadata create suggestions for review. Metadata lookup never confirms purchase.
See [book enrichment](docs/user-guide/comic-manga-enrichment.md).

Kindle contents acquisition runs on the signed-in Kindle page, separately from
library imports. Find contents, retry, refresh/resume and local reprocessing
preserve captured evidence and human reviews. No acquisition starts automatically.
See [Kindle contents discovery](docs/user-guide/kindle-contents-discovery.md).

Unreviewed full-issue proposals from effectively owned books contribute inferred
Comic Coverage automatically. Human-reviewed contents take precedence. Partial
material remains partial; digital chapters and unresolved publications do not
become complete print issues. Missing ranges are assumptions within the displayed
numbering span, not a complete publication bibliography. Contents review and
coverage resolution are optional corrections, not prerequisites for all coverage.
See [Contents and Comic Coverage](docs/user-guide/contents-workspace.md).

## Backups, privacy and development

**Settings → Export backup** saves library data, accounts, reviews and supported
coverage preferences. **Restore backup** validates and previews replacement; it
replaces rather than merges the local library. Private API keys, connection
consent and device-only settings are excluded. Use disposable profiles for tests.
Provider credentials and redemption-key values are not part of library backups.
Firefox uses extension-origin IndexedDB for privileged private state; Chrome
uses protected extension storage. See [Firefox setup](docs/user-guide/firefox.md).

Provider imports, identity decisions and source history use the validated
background writer. Read-only committed snapshots support browsing and companion
queries. Companion identity verification, explicit account-scoped sync consent
and atomic saves remain separate safeguards.

```powershell
npm test
npm run test:contents
npm run test:browser:release
npm run test:browser:firefox
```

Load this directory as an unpacked Chrome extension for development. For Firefox,
use `npm run package:firefox`, extract the ZIP and load its manifest through
`about:debugging`. Permanent distribution/signing is a separate release step.
See [release validation](docs/development/release-packaging.md),
[matching policy](docs/architecture/matching-policy.md), and
[companion API](docs/architecture/companion-api.md).

## Support development

Enjoying Galactic Hamster's free, open-source tools? If you'd like to support continued development, you can [buy us a coffee on Ko-fi](https://ko-fi.com/galactichamster). Donations are entirely optional.

## License and attribution

Galactic Library is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (GPL-3.0-or-later). See [LICENSE](LICENSE) for the full license text.

Copyright (C) 2026 Galactic Hamster / Galactic Hamster LLC.

Original project branding, extension icons, and promotional artwork are reserved pursuant to GPLv3 Section 7(e). Third-party storefront logos in `icons/provider-icons/` are the property of their respective owners and are displayed strictly for nominative service identification. Bibliographic issue reference data is attributed to the Grand Comics Database (CC-BY-SA 4.0). Detailed asset provenance and attribution terms are documented in [NOTICE](NOTICE).

