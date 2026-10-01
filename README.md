# Galactic Library

Galactic Library is a Manifest V3 Chrome extension for a browser-local index of digital media ownership. Humble is a first-class provider here; this project remains independent from Humble Comic Library and may later provide that extension with a narrow ownership lookup.

## Current foundation

Version 0.1.0 establishes the parts that must not be provider-specific:

- a stable identity of `provider + providerItemId`, never a title;
- normalized provider records and reproducible canonical game, audiobook, book, movie, and TV records;
- exact, conservative title matching (edition variants are not silently merged);
- local Chrome storage plus versioned export/restore; and
- a minimal library browser and an internal batched `MATCH_ITEMS` handler; and
- a conservative duplicate-review queue for edition variants and provider-added book/series labels; and
- user-initiated Steam Store, GOG, Epic Games Store, Audible, Kindle, Amazon Video, Fandango at Home, Kobo, and Humble importers for signed-in libraries.

To import Steam, select **Open signed-in Steam Store** on the options page. **Quick update** reads the signed-in Store account's owned App IDs, then resolves only newly seen App IDs through Steam's batched StoreBrowse title service. **Full rescan** resolves every owned app again. DLC is stored as an add-on linked to Steam's parent App ID and does not count as a game. It does not use or request a Steam Web API key, password, or cookie.

To import GOG, select **Open signed-in GOG**. **Quick update** reads GOG's newest-first purchase-date pages until reaching a complete page already stored locally, including a separate hidden-games pass when GOG reports one. **Full rescan** reads every page. The importer records GOG's available game IDs, titles, and supported platforms. It never asks for, copies, or stores a GOG password, cookie, or OAuth token.

To import Epic Games Store, select **Open signed-in Epic Store** and then **Sync Epic library**. The importer reads the signed-in Epic library with its catalog titles and add-on parent links. Unreal Engine assets, private/test entries, and items Epic does not identify as games or add-ons are excluded. It never asks for, copies, or stores an Epic password, cookie, or OAuth token.

To import Amazon Games, select **Open signed-in Amazon Games** and choose the Games view in the signed-in collection. **Quick update** scans Amazon's past-three-month claim window; if the previous sync is older than 70 days, it automatically uses a full year-by-year scan to avoid a gap. **Full rescan** always scans every calendar-year range Amazon exposes. The importer reads rendered cards marked **Delivered** and retains only claims whose summary says they were sent to the Amazon Games library. Claims delivered to GOG, Epic, EA, Ubisoft, or another store remain the responsibility of that store's importer. Rotating Luna subscription titles are not imported. It never asks for, copies, or stores an Amazon password, cookie, or token.

To import Audible, select **Open signed-in Audible**. **Quick update** uses Audible's explicit newest-first **Date added** order and stops once it reaches a fully known page; **Full rescan** reads every page. The importer records audiobook IDs, titles, and any displayed author, narrator, and series metadata. When an Audible library card explicitly offers **Remove from your library**, the title is recorded as membership-linked; all other Audible entries remain unknown rather than being assumed to be purchases. It never asks for, copies, or stores an Audible password, cookie, token, or device authorization.

To import Kindle content, select **Open signed-in Kindle library**. **Quick update** reads Amazon's newest-first Content & Devices pages until it reaches a complete page already stored locally; **Full rescan** reads every page. The importer records each item's ID, title, available author, series, collection, acquisition date, entitlement source, and available publisher, publication date, and format metadata. It requests only this account's content, excluding Household-shared content because access is not proof of ownership. Explicit purchases are stored as owned; Kindle Unlimited, Comics Unlimited, Prime, and trial titles as subscription access; lending as borrowed; and rentals as rented. Comixology-origin titles and personal documents remain unconfirmed pending better ownership evidence. A missing ownership field also defaults to unconfirmed. Full rescan is required to refresh ownership states on previously saved titles; saved enrichment is preserved. It never asks for, copies, or stores an Amazon password, cookie, or token.

The Library search controls include **Download Comixology review list**, which exports a current Markdown checklist with title, ASIN, and date added. Reviewing the list does not change ownership automatically. Humble and Fanatical companion badges show **Check ownership** for an exact title match whose Galactic Library record is unconfirmed or temporary access; they do not count it as owned or new.

For an individual book, select **Find Open Library metadata** in its local library card. Galactic Library sends only that title and its available author name to Open Library's public search endpoint, presents up to five candidates, and saves nothing until you select **Apply**. The chosen work's Open Library identifier, authors, subjects, ISBNs, available edition identifiers, and first-publication year are stored locally with source attribution. It does not bulk-enrich a provider library.

For automated Google Books enrichment, first enter your own Google Books API key on the options page. The key is stored only in Chrome local storage, is excluded from backups, and is never sent anywhere except Google's Books API. The resumable job queries only author-backed books that do not already have Google Books enrichment, waits between requests, and applies full metadata only when it finds a high-confidence title and author match. It stores Google Books' volume ID, categories, ISBNs, available publisher, publication date, page count, language, and source link locally. If the author matches and the Google title is a clear shorter form of the local collection title, it may save only Google Books categories as a separately labelled inferred genre; it never takes edition-specific fields from such a result. Records without an author, ambiguous results, and low-confidence results are skipped rather than guessed.

To import Amazon Video, select **Open signed-in Amazon Video library** on the Purchases & Rentals page. **Quick update** returns to Amazon Video's newest-first **Most recent addition** order and stops at a rendered group already stored locally. **Full rescan** reads the complete library. The importer records the stable Amazon title ID, title, card type, detail-page URL, and available artwork URL. Cards explicitly labelled as purchased are stored as owned, cards explicitly labelled as rentals are stored as rentals, and ambiguous cards remain unknown. It does not import Watchlist or Prime-included titles, request individual detail pages, or ask for, copy, or store an Amazon password, cookie, or token.

To import Fandango at Home, select **Open signed-in Fandango at Home** and open **My Library**. **Quick update** follows the movie and TV **View All** grids in their newest-first **Recently Purchased** order and stops at known titles. **Full rescan** reads every card and verifies the result against Fandango's reported movie and TV counts; it uses carousel traversal only when Fandango does not provide View All grids. The importer records the available Fandango content ID, title, card type, detail-page URL, and artwork URL. Explicit rental cards are stored as rentals; other library cards are stored as owned. It does not import free browsing results, request individual detail pages, or ask for, copy, or store a Fandango password, cookie, or token.

To import Kobo content, select **Open signed-in Kobo library**. **Quick update** explicitly requests Kobo's newest-first **Date Added** My Books pages and stops at a complete page already stored locally. **Full rescan** follows every My Books page, and also checks Archive and Audiobooks when Kobo exposes those views. The importer records Kobo's available item ID, title, author, series, cover URL, detail-page URL, and format. The signed-in web library is treated as an owned library. It does not emulate a Kobo device, request product-detail pages, or ask for, copy, or store a Kobo password, cookie, or token.

To import Fanatical purchases, select **Open signed-in Fanatical**. **Quick update** lists completed orders and reads details only for orders not already checked; **Full rescan** rebuilds the provider snapshot. Fanatical's session token is read only in the signed-in page's MAIN world to call Fanatical's two fixed, read-only order endpoints. The token, order IDs, activation keys, download URLs, payment details, addresses, and raw responses are never stored, exported, logged, or messaged outside that page execution. Galactic Library retains only supported game, book/comic, and audiobook product identity and available non-sensitive metadata, together with bundle provenance and purchase date.

To import Humble purchases, select **Open signed-in Humble purchases**. **Quick update** loads Humble's lightweight purchase list, then reads details only for previously unrecorded purchases. **Full rescan** rebuilds the provider snapshot and is useful after an importer upgrade. It records supported DRM-free books/comics, audiobook deliveries (MP3, M4A/M4B, AAC, FLAC, OGG/Opus, or WAV), direct games, and third-party game entitlements with their Humble purchase origin and purchase date when available. Redemption-key values are redacted from each detail response *before* it is parsed, and are never stored, exported, or logged. The importer does not ask for, copy, or store a Humble password, cookie, or redemption key. A full rescan replaces the Humble provider snapshot only after every purchase detail has been read successfully, so a temporary Humble error cannot erase a prior Humble import.

## Quick updates

Quick updates merge newly discovered records and therefore do not infer that an old entitlement has disappeared. Use a provider's **Full rescan** when you need removals reconciled or after an importer upgrade.

| Provider | Quick update status | Basis |
| --- | --- | --- |
| Humble | Available | Fetches the purchase index, then requests details only for new purchase IDs. |
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

The Library search controls include a saved **Show enrichment actions** checkbox. Turn it off to hide per-book lookup and apply controls while keeping existing metadata and source links visible.

For future issue-contents enrichment, a book is a **confirmed comic/manga candidate** only when a provider explicitly identifies it as Comixology or ComicsUnlimited, its Humble or Fanatical bundle name explicitly says comic/manga/graphic novel, or an already-confirmed catalogue category explicitly says comic/manga/graphic novel. Character names and title patterns alone never qualify. These candidates are shown on library cards and can be filtered through **Genre: Comics & Graphic Novels**.

On the signed-in Kindle library page, **Find contained issues** visits only unscanned confirmed Kindle comic/manga candidates. It reads Amazon product-description fields and stores the exact sentence beginning **Collects** when present; no issue list is inferred from a title, author, or description that lacks that explicit wording. Each successfully read page is recorded locally even when it has no Collects statement, so later runs continue with unscanned candidates. A product page that Amazon returns as 404—common for retired Comixology listings—is marked unavailable so it is not retried. The user can pause between pages; temporary Amazon 429/5xx/network failures are retried with backoff and summarized at the end, while CAPTCHA responses stop the scan without marking later candidates as read.

Graphic-novel issue contents are normally product-page metadata rather than library/purchase metadata. The Kindle importer deliberately does not issue a request for every product page during sync; that would be slow and fragile for a large library. A later, user-initiated enrichment step can inspect a selected product page and record a verified contents list.

## Storage operation ordering

One writer in the service worker handles every persistent library mutation: full and quick imports, Open Library and Google Books enrichment, genre hints, Kindle comic contents, review decisions, backup restore, and clear. Library pages and the popup submit typed requests through [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging); provider imports use their existing validated messages and enter the same queue. Settings and enrichment-job saves also use this writer so they are ordered with clear. There is no direct database write from an extension page.

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

Galactic Library has a deliberately narrow companion API for Humble Comic Library: `PING`, aggregate provider status, and batched exact-title `MATCH_ITEMS`. It never exposes raw library records. To pair unpacked or published extensions, enter Humble Comic Library's 32-character extension ID under **Humble Comic Library link**; Galactic then accepts requests only from that exact ID. Humble's settings separately require Galactic Library's extension ID.

## Duplicate review

The options page lists possible duplicates separately from automatic matches. It includes edition variants such as `Control` and `Control Ultimate Edition`, plus Audible/Kindle provider labels such as `Title: Series, Book 1`. These candidates are never merged automatically. Select **Same work** only when the records represent the same work; the distinct provider entitlements and edition labels remain intact. Select **Different works** to prevent that candidate from being suggested again. Both decisions stay in the local backup and survive provider resyncs.

## Near-term sequence

1. Provider sync diagnostics.
2. An external, allow-listed `MATCH_ITEMS` API for Humble Comic Library.
