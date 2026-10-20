# Privacy Policy for Galactic Library

Last updated: October 19, 2026

Galactic Library (GL) is an unofficial personal library manager. It is not affiliated with the providers whose libraries it imports.

## Data the extension handles

GL saves its library in the current browser profile, using private extension storage (including IndexedDB in Firefox). Data includes provider/account references and labels, item identifiers and titles, available authors, series, formats, genres, artwork/page URLs, access evidence, purchase dates and bundle provenance, import state, and timestamps. It also saves user ownership corrections, identity decisions, preferred titles, metadata/contents evidence and reviews, reading information, reminders, and coverage preferences. Stored provider metadata and restored backups are validated through supported field schemas rather than retaining arbitrary response objects. This storage is not described as encrypted storage.

Provider imports run from supported signed-in pages after the user starts an import and confirms the relevant account where required:

- **Steam, GOG, and Epic:** library item identifiers, titles, platforms, and supported DLC/add-on relationships; Steam also resolves owned App IDs through Steam's title service.
- **Amazon Games:** rendered delivered claim cards for the Amazon Games library, not rotating subscription access or claims delivered to another store.
- **Kindle/Comixology and Audible:** book/audiobook identifiers, titles and available creators, series, acquisition/access metadata and library collections. Access is classified from available evidence and explicit preferences/corrections; presence in an Amazon library is not universally treated as a purchase. Personal documents may remain unknown.
- **Amazon Video and Fandango at Home:** purchased/rented library cards, titles, identifiers, available artwork and access labels. GL paginates or traverses the supported library views rather than treating general browsing results as purchases.
- **Kobo:** rendered library cards and pagination, titles, authors, source genres, available series, product identifiers and access evidence. An optional account-level ownership preference covers otherwise unconfirmed items without overriding explicit contradictory evidence.
- **Humble and Fanatical:** purchase lists and details, supported product/bundle identifiers, titles, formats, dates, purchase information and provenance. Humble redemption-key values are redacted before parsing; GL does not retain redemption-key values.
- **PlayStation:** the supported active PS4/PS5 purchased-listing scope and signed-in profile identity, with available membership/access fields; this is not a claim to include every historical PlayStation product.
- **Nintendo:** Virtual Game Card records and signed-in account identity, including ownership/lending and available product flags; the supported visible-listing scope is not the entire historical Nintendo account.
- **Xbox:** the website's account-scoped Owned catalog and supporting cached product/access information; it is not a complete mobile-app or historical-console purchase inventory.

Importers use browser-managed sessions or page authentication context. Fanatical imports temporarily use the site's session token; Nintendo page requests use its signed-in token context; PlayStation uses the website's observed request/client context. Provider credentials are not retained in GL's library, backups, or companion purchase transfers. GL does not ask users to export cookies or provider passwords. This does not imply that provider requests are unauthenticated or that memory is securely erased.

Optional Kindle contents/enrichment scans visit product pages and retain supported descriptions, bibliographic metadata, source URLs, extraction candidates and unresolved evidence locally. Captured evidence is kept separately from confirmed reviews. Timing and diagnostic tools retain bounded working information; some lifecycle breadcrumbs persist across worker restarts. User-exported diagnostics can contain library-related information and should be reviewed before sharing.

## How data is used and shared

Saved data supports library search, matching, account imports, reading/reminders, metadata and contents review, and coverage. GL does not send library data to a Galactic Hamster-operated server and has no analytics or advertising service. Provider requests, optional metadata lookups, companion exchanges and exports are distinct from developer-server collection. Opening provider, help or optional support links visits those destinations under their own policies.

When the user requests **Open Library** enrichment, GL sends the selected book's title and available author to Open Library, or its ISBN for an edition lookup; edition lookups can also retrieve the credited author records. When the user configures their own **Google Books API key** and starts enrichment, GL sends eligible books' ISBNs or title/author search terms and available publisher context to Google's Books API. The key is saved privately in this browser profile, sent to Google Books, and excluded from library backups. Returned supported metadata and enrichment progress are stored locally. These optional services receive the requests; GL does not operate those services.

Official HB and FAN companions are recognized through fixed browser-specific identities; additional IDs can be authorized in Advanced settings. Matching queries exchange requested titles and available identity/contents metadata, with bounded results containing provider, effective access and identity evidence and opaque references. These comparison responses exclude raw purchase IDs, account labels and API keys. They are not library backups.

Separately, confirming a specific provider/account relationship authorizes **bidirectional saved-purchase synchronization** between GL and HB or FAN. Supported transfers include account references and labels, product/bundle identifiers, titles, available dates, formats, and purchase provenance. Subsequent saved-purchase changes synchronize automatically, with background retries. Manual purchase transfers are also available. Recognizing a companion for queries does not itself authorize purchase writes. Identity, provider, account scope, and consent checks apply; these exchanges use local browser extension messaging, not a remote Galactic Hamster server.

HB can also explicitly publish a same-account key-reminder feed to GL containing titles, access/expiry/check information and opaque references. That feed excludes key values and raw purchase identifiers and is separate from purchase synchronization. FAN cannot publish Humble reminder feeds. GL retains saved companion data until removed; disconnecting or uninstalling a companion does not erase it. Removing an additional allowed ID does not remove built-in companion recognition; disable or uninstall a companion to stop its queries.

## Browser permissions used

- **storage** saves library data, preferences, private configuration and working state. Supported browsers restrict private storage access to trusted extension contexts; provider scripts use sender-checked worker messages for imports.
- **unlimitedStorage** accommodates large local libraries; it does not grant access to additional websites.
- **scripting** runs supported provider import/capture tasks in the relevant pages.
- **alarms** schedules background work, reminders and synchronization retries.
- **Optional notifications** supports user-enabled reminder notifications.
- Provider page access supports the import panels and provider-specific reads above. Additional host access supports Steam API requests and optional Open Library/Google Books requests. Fanatical host access supports its signed-in order importer.

## Backup, restore, and deletion

**Export backup** creates a user-requested JSON download of the validated library database, including saved provider records/provenance, profiles, identity and ownership corrections, contents reviews/evidence, reading information and saved companion feeds. It also exports coverage starting numbers, numbering transitions, merges and custom names. It is not a complete browser-storage snapshot: the Google Books key, additional companion allowlist, live synchronization authorization, transient scans, diagnostics and general UI preferences are not exported. Backups can contain purchase identifiers, dates, labels and source evidence and should be kept private.

**Restore backup** replaces the library database and restores included coverage preferences. Older backups without those preferences leave the current preferences unchanged. Restore resets live purchase-sync authorization and provider-check state and cancels restored running scans; it does not reauthorize companion synchronization or restore API keys. Existing separate configuration is not necessarily cleared by restore.

Provider account removal and individual correction/removal controls operate on their stated scopes. **Clear library** removes the library database, purchase-sync state, additional companion allowlist, Google Books key and enrichment job, scan/check state, reminder state, contents-refresh state and UI preferences. Built-in companion recognition remains. This is not a promise to erase every browser diagnostic or downloaded file. Uninstalling removes extension storage according to normal browser behavior. Neither action deletes provider records, downloaded backups, browser history or copies previously saved by HB/FAN. These controls are not a secure-erasure guarantee.

## Changes to this policy

This policy and applicable store disclosures should reflect changes to the extension's data practices before release.
