# Galactic Library

See the [documentation index](docs/README.md) for current user guides, architecture, development instructions and selected historical audits.

Galactic Library is a Manifest V3 Chrome and Firefox desktop extension for a browser-local index of digital media ownership. Humble is a first-class provider here; this project remains independent from Humble Comic Library and may later provide that extension with a narrow ownership lookup.

## Current foundation

Version 0.1.0 establishes the parts that must not be provider-specific:

- a stable identity of `provider + providerItemId`, never a title;
- normalized provider records and reproducible canonical game, audiobook, book, movie, and TV records;
- conservative edition matching with separate Possible candidates and reviewed contents coverage;
- private browser-local storage plus versioned export/restore; and
- a minimal library browser and an internal batched `MATCH_ITEMS` handler; and
- a duplicate-review queue for edition variants and provider-added book/series labels; and
- user-initiated Steam Store, GOG, Epic Games Store, Audible, Kindle, Amazon Video, Fandango at Home, Kobo, and Humble importers for signed-in libraries.

To import Steam, select **Open signed-in Steam Store** on the options page. **Quick update** reads the signed-in Store account's owned App IDs, then resolves only newly seen App IDs through Steam's batched StoreBrowse title service. **Full rescan** resolves every owned app again. DLC is stored as an add-on linked to Steam's parent App ID and does not count as a game. It does not use or request a Steam Web API key, password, or cookie.

To import GOG, select **Open signed-in GOG**. **Quick update** reads GOG's newest-first purchase-date pages until reaching a complete page already stored locally, including a separate hidden-games pass when GOG reports one. **Full rescan** reads every page. The importer records GOG's available game IDs, titles, and supported platforms. It never asks for, copies, or stores a GOG password, cookie, or OAuth token.

To import Epic Games Store, select **Open signed-in Epic Store** and then **Sync Epic library**. The importer reads the signed-in Epic library with its catalog titles and add-on parent links. Unreal Engine assets, private/test entries, and items Epic does not identify as games or add-ons are excluded. It never asks for, copies, or stores an Epic password, cookie, or OAuth token.

To import Amazon Games, select **Open signed-in Amazon Games** and choose the Games view in the signed-in collection. **Quick update** scans Amazon's past-three-month claim window; if the previous sync is older than 70 days, it automatically uses a full year-by-year scan to avoid a gap. **Full rescan** always scans every calendar-year range Amazon exposes. The importer reads rendered cards marked **Delivered** and retains only claims whose summary says they were sent to the Amazon Games library. Claims delivered to GOG, Epic, EA, Ubisoft, or another store remain the responsibility of that store's importer. Rotating Luna subscription titles are not imported. It never asks for, copies, or stores an Amazon password, cookie, or token.

To import Audible, select **Open signed-in Audible**. **Quick update** uses Audible's explicit newest-first **Date added** order and stops once it reaches a fully known page; **Full rescan** reads every page. The importer records audiobook IDs, titles, and any displayed author, narrator, and series metadata. When an Audible library card explicitly offers **Remove from your library**, the title is recorded as membership-linked; all other Audible entries remain unknown rather than being assumed to be purchases. It never asks for, copies, or stores an Audible password, cookie, token, or device authorization.

To import Kindle content, select **Open signed-in Kindle library**. **Quick update** reads Amazon's newest-first Content & Devices pages until it reaches a complete page already stored locally; **Full rescan** reads every page. The importer records each item's ID, title, available author, series, collection, acquisition date, entitlement source, and available publisher, publication date, and format metadata. It requests only this account's content, excluding Household-shared content because access is not proof of ownership. Explicit purchases are stored as owned; Kindle Unlimited, Comics Unlimited, Prime, and trial titles as subscription access; lending as borrowed; and rentals as rented. Comixology-origin titles and personal documents remain unconfirmed pending better ownership evidence. A missing ownership field also defaults to unconfirmed. Full rescan is required to refresh ownership states on previously saved titles; saved enrichment is preserved. It never asks for, copies, or stores an Amazon password, cookie, or token.

The Library search controls include **Download Comixology review list**, which exports a current Markdown checklist with title, ASIN, and date added. Reviewing the list does not change ownership automatically. Humble and Fanatical companion badges show **Check ownership** for an exact title match whose Galactic Library record is unconfirmed or temporary access; they do not count it as owned or new.

For an individual book, select **Find Open Library metadata** in its local library card. Galactic Library prefers a checksum-valid source ISBN, falling back to its title and available author name. It presents up to five candidates and saves nothing until you select **Apply**. The chosen work's Open Library identifier, authors, subjects, ISBNs, available edition identifiers, and first-publication year are stored locally with source attribution. Work-level ISBN lists never identify your owned edition. It does not bulk-enrich a provider library.

For automated Google Books enrichment, first enter your own Google Books API key on the options page. The key is stored only in private extension storage, is excluded from backups, and is never sent anywhere except Google's Books API. The resumable job discovers candidates for books missing edition metadata, including authorless records, waits between requests, and applies full metadata only after matching that ISBN or a high-confidence title and author, while rejecting known edition/language/volume conflicts. ISBN-backed books can be looked up without an author. It stores Google Books' volume ID, categories, ISBNs, available publisher, publication date, page count, language, and source link locally. If the author matches and the Google title is a clear shorter form of the local collection title, it may save only Google Books categories as a separately labelled inferred genre; it never takes edition-specific fields from such a result. Authorless, ambiguous and low-confidence results remain in a persistent review queue. Genre hints do not complete edition enrichment; selections have source evidence and undo.

To import Amazon Video, select **Open signed-in Amazon Video library** on the Purchases & Rentals page. **Quick update** returns to Amazon Video's newest-first **Most recent addition** order and stops at a rendered group already stored locally. **Full rescan** reads the complete library. The importer records the stable Amazon title ID, title, card type, detail-page URL, and available artwork URL. Cards explicitly labelled as purchased are stored as owned, cards explicitly labelled as rentals are stored as rentals, and ambiguous cards remain unknown. It does not import Watchlist or Prime-included titles, request individual detail pages, or ask for, copy, or store an Amazon password, cookie, or token.

To import Fandango at Home, select **Open signed-in Fandango at Home** and open **My Library**. **Quick update** follows the movie and TV **View All** grids in their newest-first **Recently Purchased** order and stops at known titles. **Full rescan** reads every card and verifies the result against Fandango's reported movie and TV counts; it uses carousel traversal only when Fandango does not provide View All grids. The importer records the available Fandango content ID, title, card type, detail-page URL, and artwork URL. Explicit rental cards are stored as rentals; other library cards are stored as owned. It does not import free browsing results, request individual detail pages, or ask for, copy, or store a Fandango password, cookie, or token.

To import Kobo content, select **Open signed-in Kobo library**. **Quick update** explicitly requests Kobo's newest-first **Date Added** My Books pages and stops at a complete page already stored locally. **Full rescan** follows every My Books page, and also checks Archive and Audiobooks when Kobo exposes those views. The importer records Kobo's available item ID, title, author, series, cover URL, detail-page URL, and format. The signed-in web library is treated as an owned library. It does not emulate a Kobo device, request product-detail pages, or ask for, copy, or store a Kobo password, cookie, or token.

To import Fanatical purchases, select **Open signed-in Fanatical**. **Quick update** lists completed orders and reads details only for orders not already checked; **Full rescan** rebuilds the provider snapshot. Fanatical's session token is read only in the signed-in page's MAIN world to call Fanatical's two fixed, read-only order endpoints. The token, order IDs, activation keys, download URLs, payment details, addresses, and raw responses are never stored, exported, logged, or messaged outside that page execution. Galactic Library retains only supported game, book/comic, and audiobook product identity and available non-sensitive metadata, together with bundle provenance and purchase date.

To import Humble purchases, select **Open signed-in Humble purchases**. **Quick update** loads Humble's lightweight purchase list, then reads details only for previously unrecorded purchases. **Full rescan** rebuilds the provider snapshot and is useful after an importer upgrade. It records supported DRM-free books/comics, audiobook deliveries (MP3, M4A/M4B, AAC, FLAC, OGG/Opus, or WAV), direct games, and third-party game entitlements with their Humble purchase origin and purchase date when available. Redemption-key values are redacted from each detail response *before* it is parsed, and are never stored, exported, or logged. The importer does not ask for, copy, or store a Humble password, cookie, or redemption key. A full rescan replaces the Humble provider snapshot only after every purchase detail has been read successfully, so a temporary Humble error cannot erase a prior Humble import.

## Quick updates

In **Settings**, **Treat everything as owned** overrides ownership uncertainty for display and matching. Each library also has its own checkbox. The original ownership status, media type and provenance remain intact, and turning the checkbox off restores normal ownership rules. Title and edition checks still apply. Choices are included in backups; refresh open HB/FAN bundle pages after changing them. See [ownership overrides](docs/user-guide/ownership-overrides.md).

Quick updates merge newly discovered records and therefore do not infer that an old entitlement has disappeared. Use a provider's **Full rescan** when you need removals reconciled or after an importer upgrade.

| Provider | Quick update status | Basis |
| --- | --- | --- |
| Humble | Available | Fetches the purchase index, then requests details for new purchases, unresolved keys and revealed keys whose reported expiry is due. |
| Steam | Available | Compares Steam's fast owned-App-ID response before resolving only new Store titles. |
| Kindle | Available | Reads newest-first pages until reaching a full page already in the local baseline. |
| Amazon Games | Available | Uses Amazon's past-three-month claims window after a full baseline; falls back to a full scan after 70 days. |
| Audible | Available | Uses Audible's explicit newest-first Date added order until reaching a known page. |
| GOG | Available | Uses GOG's purchase-date order until reaching a complete known page, including hidden games. |
| Epic Games Store | Full rescan only | The current library cursor has no acquisition/update marker. |
| Kobo | Available | Uses Kobo's explicit Date Added descending My Books order; Full rescan also checks Archive and Audiobooks. |
| Fanatical | Available | Lists completed orders and reads details only for unseen opaque order fingerprints. |
| Amazon Video | Available | Uses the Most recent addition order and stops at a complete known rendered group. |
| Fandango at Home | Available | Uses the Recently Purchased View All grids until reaching known titles; Full rescan validates Fandango's counts. |

For Humble book records, an explicit `comic`, `manga`, or `graphic novel` label in the preserved bundle name is displayed as the local **Humble bundle genre: Comics & Graphic Novels** hint. It does not use an external request or guess from individual titles.

The Library **Genre** filter groups detailed catalogue subjects into broad genres such as Comics & Graphic Novels, Science Fiction & Fantasy, and History. The source-specific subjects and categories remain stored locally as enrichment evidence; they are not presented as an unwieldy filter list.

The options page opens in **Library**, with compact entries and 50 results per page. Open **Details** for an item's metadata and actions. **Book information** contains lookup and metadata tools, **Reading** contains progress and series coverage, **Ownership** contains evidence and reviews, and **Settings** contains imports, services, backup and recovery. Library and Book information remember separate searches, filters and pages; the selected workspace also survives reopening. These display preferences stay in private extension storage and are excluded from library backups. Pending reviews and active book lookups appear as compact notices with links to the relevant workspace.

For comic/manga classification, a book has **Comic/manga evidence** only when a provider explicitly identifies it as Comixology or ComicsUnlimited, its Humble or Fanatical bundle name explicitly says comic/manga/graphic novel, or an already-confirmed catalogue category explicitly says comic/manga/graphic novel. Character names and title patterns alone never qualify. This evidence is shown on library cards and can be filtered through **Genre: Comics & Graphic Novels**.

Contents are usually product-page information rather than library metadata. After syncing, use **Find contents** in the signed-in Kindle panel: every Kindle book with a supported Amazon product URL is eligible, regardless of comic classification. Choose normal scan, retry, **Refresh all eligible books**, or local reparse. Refresh fetches every eligible book again with source generation 5, preserving earlier evidence and a frozen resumable queue. Requests remain sequential and stop on CAPTCHA/sign-in; no network work starts automatically. Discovery saves source and editable proposals, never verified contents or ownership. See [Kindle contents discovery](docs/user-guide/kindle-contents-discovery.md) for controls, current/history policy and backup behavior.

## Storage operation ordering

One writer in the service worker handles every persistent library mutation: full and quick imports, Open Library and Google Books enrichment, genre hints, Kindle contents discovery, review decisions, backup restore, and clear. Library pages and the popup submit typed requests through [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging); provider imports use their existing validated messages and enter the same queue. Settings and enrichment-job saves also use this writer so they are ordered with clear. There is no direct database write from an extension page.

Requests run in the order the service worker admits them. Each operation reads the latest committed state inside its turn and finishes its storage write before the next operation begins or success is reported. Reads share the queue, and backup export requests a fresh snapshot. Provider fetching and external metadata searches happen outside the queue; their results enter it when they are ready to save, rather than when the scan or search started.

A full import replaces only that provider's records and preserves local enrichment for retained record IDs; a quick import merges into the latest records. Concurrent imports from different providers retain both providers. Review decisions and enrichment update the latest database. For competing updates to the same field or decision, the later accepted operation wins. Restore replaces the whole database and clear removes library data and settings at their positions in the queue; requests accepted afterward apply to the restored or cleared state. For example, import → clear leaves an empty library, while clear → import saves the later import. Clear and restore do not cancel a provider scan still fetching data; its eventual save follows the same ordering rule.

Invalid operations and failed storage writes return an error and leave the queue available for later requests. An enrichment or review save whose target records were cleared or removed fails validation instead of restoring a stale database copy. The writer reloads persisted storage for each operation, including after a service-worker restart. Clients propagate message failures and do not automatically retry an operation whose acknowledgement was lost.

## Full-scan snapshot safety

Every provider full replacement requires a completion receipt, checked again by the single storage writer before any database change. Importers validate response structure and readable entries, scan every exposed required section, reconcile reported totals, and reject repeated pagination, changed totals, and page/scroll limits reached before completion. Successful receipts are stored as `providers[provider].snapshotValidation`. Older tabs without the updated receipt protocol cannot perform destructive replacements; reload the extension and provider tabs after upgrading.

Kindle must finish both Books and Personal Documents. Its returned-entry counts must equal Amazon's reported totals; duplicate IDs are explicitly counted rather than treated as missing books. For example, a response reporting 1,000 books but returning one, followed by a malformed page, fails without changing the saved library. Fandango must reconcile both movie and TV totals. Humble and Fanatical must read every selected purchase/order successfully; Steam must resolve every owned app as readable content or an explicitly unsupported type.

Where a provider exposes no numeric total, completion requires exhausting its validated cursor/pager, purchase index, or rendered scroll/load-more sequence. DOM-based imports require a settled end and reject an outstanding loader or load-more control; they cannot independently reconcile a total the site does not expose. Recognized non-game content, other-store Amazon claims, and explained duplicates can be excluded; unreadable content cannot silently justify dropping records.

A failed full scan does not update provider records, enrichment, review decisions, sync timestamps, or the full-scan baseline. Quick updates remain non-destructive merges and do not require full-snapshot evidence. In particular, Steam's unresolved/de-listed apps can block a full replacement while Quick update can still add readable new titles. Backup restore remains an explicit user-requested replacement, separate from provider scanning.

## Development

Run the deterministic core, concurrency, and provider snapshot tests (including malformed responses, count mismatches, pagination limits, and the real service-worker message handlers with delayed, copied storage values):

```powershell
npm test
```

To load in Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this directory. The options page opens after installation.

## Data and privacy

There is no backend, analytics, account, cloud sync, or password collection. Provider data will remain in `chrome.storage.local` until the user clears it, restores a backup, or uninstalls the extension. Galactic Library requests Chrome's `unlimitedStorage` permission because a complete multi-provider libraryâ€”especially a long Humble purchase history with local provenanceâ€”can exceed Chrome's default 10 MB local-storage quota. This permission expands only the browser-local storage available to this extension; it does not transmit data or grant access to other sites. The implementation will access provider sites only through a tab where the user is already signed in.

Galactic Library has a deliberately narrow companion API: `PING`, aggregate provider status/capabilities, and batched `MATCH_ITEMS` with exact matches, related Possible candidates, reviewed relationships and contents coverage. It never exposes raw library records or purchase-bearing provider IDs. Compatible official companions connect automatically. Settings shows named connection checks; **Advanced / Developer pairing** preserves custom IDs for unpacked builds. See [pairing and release requirements](docs/architecture/companion-pairing.md). See the [API contract](docs/architecture/companion-api.md) for request fields, coverage semantics and limits. HB and Fanatical consume Possible candidates, reviewed contents and entitlement reminders.

## Duplicate review

The options page lists possible duplicates separately from automatic matches, including same-title books whose identity lacks evidence. Select **Same work** for a reviewed Possible relationship that keeps editions separate. **Same edition** groups records only if known identifiers, authors, language and unit fields agree, and no Different relationship would be crossed. **Different works** blocks grouping and inferred candidates. All decisions stay in the local backup, survive provider resyncs, appear in each record's evidence inspector and can be undone.

## Near-term sequence

1. Provider sync diagnostics.
2. An external, allow-listed `MATCH_ITEMS` API for Humble Comic Library.
## Identity and bibliographic evidence

Database schema 2 uses persistent edition IDs rather than titles as identity. Version-1 databases and backups migrate automatically; saved enrichment queues are remapped. Title changes during a provider sync preserve record and edition identity. Books with conflicting authors, languages, edition labels, or validated ISBNs stay separate. A "Same work" review records a relationship; it no longer merges distinct editions or shares edition metadata.

Companion book/audiobook requests containing only a title now return Possible candidates. Exact ownership needs a validated edition identifier, compatible title-and-author evidence, or a reviewed same-edition relationship. Distinct editions sharing an inconsistent identifier stay ambiguous until the request supplies distinguishing evidence. Game editions remain related Possible candidates in either direction, including base, deluxe, gold, platinum and Game of the Year packages.

Possible discovery also considers shortened/subtitled titles, parenthetical qualifiers, book delivery suffixes, small spelling differences, close word matches, software version labels, and game collections whose contents still need review. Meaningful short titles can warn; generic short prefixes and different known authors, runs or numbered units do not. Candidates include the actual library title and explain known edition/identifier/language differences. These discovery rules never merge editions, approve enrichment, prove contents, or promote a candidate to Owned; reviewed Different decisions and provider exclusions still apply.

Available source metadata is retained through a bibliographic allowlist: ISBN/ASIN, creators and contributor roles, series, volume/issue, publisher, language, edition, and format. ISBN checksums are validated and ISBN-10/13 equivalents compare consistently. Open Library's work-level ISBN lists are never treated as identifiers of the owned edition. Missing metadata remains unknown.

Each book/game record has a **Contents and coverage** editor. Parse an explicit contents statement into proposals, then correct series/run, unit type/number, language, and full versus excerpt scope before selecting **Save verified contents**. Annuals, specials, fractional issues, manga omnibus volumes, multi-series collections, and named game components can be entered. Unparsed text is shown for manual review. Only confirmed full contents of owned/claimed records contribute to coverage; temporary access and excerpts do not. Confirmation survives sync and backup/restore and can be undone. An unknown run or language cannot establish complete edition ownership.

The identifier query syntax follows the [Open Library search documentation](https://openlibrary.org/dev/docs/api/search?v=10) and [Google Books search documentation](https://developers.google.com/books/docs/v1/using). Known provider ISBNs take priority; aggregated work-level ISBNs do not become search evidence for the owned edition.

## Ownership inspection and series coverage

Expand **Ownership evidence and relationships** on a library card to see persistent identity, validated identifiers, creators, edition, provider/source, acquisition date, separate observation/update dates, confirmed contents and saved relationships. Account/profile is shown as unknown when the importer has no account evidence. Invalid ISBNs, catalog conflicts and outdated same-edition reviews are visible. Compare any two records of the same media type to review a relationship; undo is available on saved reviews.

The **Series completion and overlap** panel combines confirmed full contents across owned/claimed collections and providers. Each run, language and unit type stays separate. It shows sources, duplicated units and gaps inside the observed integer range. It cannot infer the final issue of an ongoing series. Use **Compare a target series range or proposed collection** to supply the intended contents and see which units remain missing or uncertain. This comparison does not change ownership.

Run `npm run test:browser` for the actual options-page checks using synthetic data and a temporary headless Chrome/Chromium profile (`CHROME_BIN` may specify an executable). No personal profile, signed-in provider or live enrichment service is used. The fixture checks relationship review/undo, conflict rejection, contents confirmation/undo, backup import, gaps, overlap, language and filtering.

Run `node tests/browser.js --importers` to exercise all eleven actual importer panels through full and quick sync controls with direct content-script storage access denied. Signed-in provider fetches are synthetic; Epic has only a full scan, and Fandango checks its final resumable View All stage. Worker tests additionally check provider/sender authorization and storage initialization failure. Chrome 102 or newer is required for trusted-context storage access controls.

Imports and restores now use [central metadata validation](docs/architecture/metadata-validation.md): provider-specific fields, bounded creators/identifiers/contents, sanitized source URLs, validated timestamps and narrow enrichment schemas. Unsupported fields are removed; malformed supported fields reject the operation without partially saving it. Provider imports cannot inject approved enrichment or verification timestamps. Existing supported enrichment and record references survive resync.

To undo an incorrect edition group, expand **Ownership evidence and relationships** and choose **Separate this record into its own edition**. The record and its enrichment/contents stay intact; its separation survives resync and backup restore. Related editions remain Possible in companions. **Undo edition separation** removes that separation while respecting any other reviews. **Same work** now also prevents automatic edition merging; **Different works** continues to block direct and indirect grouping. Database schema 3 preserves separations and accepts older schema 1/2 backups; older extension versions cannot restore schema 3 backups.

Kobo My Books presence and Read Now links alone produce **Unknown**, not confirmed ownership. Explicit purchase labels/attributes can establish Owned; explicit Kobo Plus access produces Subscription. A generic Kobo Plus eligibility badge alone stays Unknown, and conflicting purchase/access evidence needs review. Kobo confirms that [subscription titles can be added to My Books](https://help.kobo.com/hc/en-us/articles/360018811754-Add-Kobo-Plus-titles-from-kobo-com) and [can also be bought separately](https://help.kobo.com/hc/en-us/articles/360018976193-Buy-Kobo-Plus-books). Older Kobo Owned records without purchase evidence downgrade to Unknown when read or restored. Quick updates refresh ownership evidence on observed known cards, while still stopping at a fully known page; use Full rescan to revisit older pages and Archive. Evidence labels outside the recognized rules remain Unknown.

Reseller purchases, key status and destination activation are separate evidence. Humble and Fanatical games do not establish activation at Steam or another destination. Revealed keys remain activation unknown; expired/unavailable Humble key records require ownership review and cannot supply owned contents. This never revokes ownership independently observed in a destination library. The inspector and companion API expose only safe status labels and reported expiry, never key values. Quick Humble scans revisit unresolved key purchases and revealed keys whose reported expiry has passed. Legacy duplicate game-product records from the same purchase cannot conceal an expired or unavailable key. They remain present for review; a full rescan removes obsolete duplicate records and refreshes older resolved purchases.

Fanatical scans now validate order-index/detail product coverage, follow supported Link/count/range pagination, and use at most three concurrent requests. Transient failures retry up to three attempts with timeout, backoff and Retry-After handling. Incomplete scans preserve the library. The importer reports history pages, retries and coverage limitations: an array-only endpoint without pagination metadata cannot independently prove that the server did not truncate its response.

Complete provider scans archive missing records instead of deleting their purchase and enrichment evidence. The separate Provider history view shows last observation and disappearance dates. Archived records from the active profile can warn companions as Possible with unknown current access, but never contribute Owned or collected-content coverage. Missing does not prove revocation. Quick scans and failed/incomplete scans do not infer absence. Reappearing records recover their opaque reference and enrichment. Database schema 5 preserves this history in backups and accepts schemas 1–3.


In **Book information**, each lookup/import tool explains its purpose, inputs, automatic saves or review requirements, and a practical example under **How this works**. Candidate previews show provider details, the current saved source, and the suggested fields before approval. **Sources and undo** compares saved evidence and restores earlier selections; reviewed contents have their own undo control. Publisher-page proposals are entered manually and do not fetch the URL.

Comic/manga enrichment now includes local ComicInfo.xml/EPUB/OPF imports, cited publisher proposals, Open Library ISBN edition lookup and an enrichment workbench with paged queues, batch confirmation, retry, dismissal and undo. Metadata files stay in the browser; source proposals require review and never establish ownership or verified collected contents by themselves. See [comic/manga enrichment and source evaluation](docs/user-guide/comic-manga-enrichment.md).

Library tools now include Unicode title aliases, central software support, Fanatical purchase occurrences, dated ownership/receipt review, sync health/cancellation, optional entitlement reminders and private reading progress/orders. See [library tools](docs/user-guide/library-tools.md) for behavior and backup compatibility, and [release packaging](docs/development/release-packaging.md) for reproducible distribution and packaged browser checks.

## Firefox desktop

Run `npm run package:firefox` to build `dist/GalacticLibrary-0.1.0-firefox.zip` for Firefox 140+. Extract it and load its manifest from `about:debugging#/runtime/this-firefox`. This is a temporary development install; permanent distribution requires signing. Import a backup to move your Chrome library into Firefox.

The stable ID is `galactic-library@galactichamster.com`. Allow the HB and Fanatical IDs in GL options and enter GL's ID in each companion. No native messaging helper is needed. See [Firefox setup and verification](docs/user-guide/firefox.md) for IDs, privacy and test coverage.
