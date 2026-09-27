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

To import GOG, select **Open signed-in GOG** and then **Sync GOG library**. The importer reads GOG's paginated owned-games library on the signed-in site, including hidden games when GOG reports that the account has them. It never asks for, copies, or stores a GOG password, cookie, or OAuth token.

To import Epic Games Store, select **Open signed-in Epic Store** and then **Sync Epic library**. The importer reads the signed-in Epic library with its catalog titles and add-on parent links. Unreal Engine assets, private/test entries, and items Epic does not identify as games or add-ons are excluded. It never asks for, copies, or stores an Epic password, cookie, or OAuth token.

To import Amazon Games, select **Open signed-in Amazon Games** and choose the Games view in the signed-in collection. **Quick update** scans Amazon's past-three-month claim window; if the previous sync is older than 70 days, it automatically uses a full year-by-year scan to avoid a gap. **Full rescan** always scans every calendar-year range Amazon exposes. The importer reads rendered cards marked **Delivered** and retains only claims whose summary says they were sent to the Amazon Games library. Claims delivered to GOG, Epic, EA, Ubisoft, or another store remain the responsibility of that store's importer. Rotating Luna subscription titles are not imported. It never asks for, copies, or stores an Amazon password, cookie, or token.

To import Audible, select **Open signed-in Audible**. **Quick update** uses Audible's explicit newest-first **Date added** order and stops once it reaches a fully known page; **Full rescan** reads every page. The importer records audiobook IDs, titles, and any displayed author, narrator, and series metadata. When an Audible library card explicitly offers **Remove from your library**, the title is recorded as membership-linked; all other Audible entries remain unknown rather than being assumed to be purchases. It never asks for, copies, or stores an Audible password, cookie, token, or device authorization.

To import Kindle content, select **Open signed-in Kindle library**. **Quick update** reads Amazon's newest-first Content & Devices pages until it reaches a complete page already stored locally; **Full rescan** reads every page. The importer records each item's ID, title, available author, series, collection, acquisition date, entitlement source, and available publisher, publication date, and format metadata. Kindle Unlimited, Prime, rental, and trial titles are stored as subscription records; purchases are stored as owned. Personal documents are marked as such and retain an unknown ownership state. It never asks for, copies, or stores an Amazon password, cookie, or token.

For an individual book, select **Find Open Library metadata** in its local library card. Galactic Library sends only that title and its available author name to Open Library's public search endpoint, presents up to five candidates, and saves nothing until you select **Apply**. The chosen work's Open Library identifier, authors, subjects, ISBNs, available edition identifiers, and first-publication year are stored locally with source attribution. It does not bulk-enrich a provider library.

For automated Google Books enrichment, first enter your own Google Books API key on the options page. The key is stored only in Chrome local storage, is excluded from backups, and is never sent anywhere except Google's Books API. The resumable job queries only author-backed books that do not already have Google Books enrichment, waits between requests, and applies full metadata only when it finds a high-confidence title and author match. It stores Google Books' volume ID, categories, ISBNs, available publisher, publication date, page count, language, and source link locally. If the author matches and the Google title is a clear shorter form of the local collection title, it may save only Google Books categories as a separately labelled inferred genre; it never takes edition-specific fields from such a result. Records without an author, ambiguous results, and low-confidence results are skipped rather than guessed.

To import Amazon Video, select **Open signed-in Amazon Video library** and then **Sync Amazon Video library** on the Purchases & Rentals page. The importer reads the rendered movie and TV title cards in that page, scrolling through the library as needed. It records the stable Amazon title ID, title, card type, detail-page URL, and available artwork URL. Cards explicitly labelled as purchased are stored as owned, cards explicitly labelled as rentals are stored as rentals, and ambiguous cards remain unknown. It does not import Watchlist or Prime-included titles, request individual detail pages, or ask for, copy, or store an Amazon password, cookie, or token.

To import Fandango at Home, select **Open signed-in Fandango at Home**, open **My Library**, and select **Sync Fandango at Home library**. The importer follows the visible **View All** links for the signed-in My Movies and My TV Shows grids, so it does not need to move their carousels; it uses carousel traversal only when Fandango does not provide those links. It records the available Fandango content ID, title, card type, detail-page URL, and artwork URL. Explicit rental cards are stored as rentals; other library cards are stored as owned. It does not import free browsing results, request individual detail pages, or ask for, copy, or store a Fandango password, cookie, or token.

To import Kobo content, select **Open signed-in Kobo library** and then **Sync Kobo library**. The importer reads the rendered cards in Kobo's signed-in My Books page and follows its visible pagination. It records Kobo's available item ID, title, author, series, cover URL, detail-page URL, and format. The signed-in web library is treated as an owned library; Kobo Web Reader does not support audiobooks, so audiobooks will be included only if Kobo exposes audiobook cards in that page. It does not emulate a Kobo device, request product-detail pages, or ask for, copy, or store a Kobo password, cookie, or token.

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
| GOG | Full rescan only | The current endpoint is title-sorted and supplies no recorded acquisition/update marker. |
| Epic Games Store | Full rescan only | The current library cursor has no acquisition/update marker. |
| Kobo | Full rescan only | The current library pages expose no reliable recency marker. |
| Amazon Video | Full rescan only | The rendered library supplies no reliable recency marker. |
| Fandango at Home | Full rescan only | Its full-grid count validation is required for a trustworthy result. |

For Humble book records, an explicit `comic`, `manga`, or `graphic novel` label in the preserved bundle name is displayed as the local **Humble bundle genre: Comics & Graphic Novels** hint. It does not use an external request or guess from individual titles.

The Library **Genre** filter groups detailed catalogue subjects into broad genres such as Comics & Graphic Novels, Science Fiction & Fantasy, and History. The source-specific subjects and categories remain stored locally as enrichment evidence; they are not presented as an unwieldy filter list.

Graphic-novel issue contents are normally product-page metadata rather than library/purchase metadata. The Kindle importer deliberately does not issue a request for every product page during sync; that would be slow and fragile for a large library. A later, user-initiated enrichment step can inspect a selected product page and record a verified contents list.

## Development

Run the deterministic core tests:

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
