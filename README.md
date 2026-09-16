# Galactic Library

Galactic Library is a Manifest V3 Chrome extension for a browser-local index of digital media ownership. It is deliberately separate from Humble Comic Library: this project will become the narrow ownership service that a later Humble update can query.

## Current foundation

Version 0.1.0 establishes the parts that must not be provider-specific:

- a stable identity of `provider + providerItemId`, never a title;
- normalized provider records and reproducible canonical game, audiobook, and book records;
- exact, conservative title matching (edition variants are not silently merged);
- local Chrome storage plus versioned export/restore; and
- a minimal library browser and an internal batched `MATCH_ITEMS` handler; and
- user-initiated Steam Store, GOG, Epic Games Store, Audible, and Kindle importers for signed-in libraries.

To import Steam, select **Open signed-in Steam Store** on the options page and select **Sync Steam library**. The importer reads the signed-in Store account's owned App IDs, then resolves full games and DLC through Steam's batched StoreBrowse title service. DLC is stored as an add-on linked to Steam's parent App ID and does not count as a game. It does not use or request a Steam Web API key, password, or cookie.

To import GOG, select **Open signed-in GOG** and then **Sync GOG library**. The importer reads GOG's paginated owned-games library on the signed-in site, including hidden games when GOG reports that the account has them. It never asks for, copies, or stores a GOG password, cookie, or OAuth token.

To import Epic Games Store, select **Open signed-in Epic Store** and then **Sync Epic library**. The importer reads the signed-in Epic library with its catalog titles and add-on parent links. Unreal Engine assets, private/test entries, and items Epic does not identify as games or add-ons are excluded. It never asks for, copies, or stores an Epic password, cookie, or OAuth token.

To import Audible, select **Open signed-in Audible** and then **Sync Audible library**. The importer reads the paginated Audible Library pages available in that signed-in tab, recording audiobook IDs, titles, and any displayed author, narrator, and series metadata. When an Audible library card explicitly offers **Remove from your library**, the title is recorded as membership-linked; all other Audible entries remain unknown rather than being assumed to be purchases. It never asks for, copies, or stores an Audible password, cookie, token, or device authorization.

To import Kindle content, select **Open signed-in Kindle library** and then **Sync Kindle library**. The importer reads Amazon's signed-in Content & Devices book library and Personal Documents category, recording each item's ID, title, available author, series, collection, acquisition date, entitlement source, and available publisher, publication date, and format metadata. Kindle Unlimited, Prime, rental, and trial titles are stored as subscription records; purchases are stored as owned. Personal documents are marked as such and retain an unknown ownership state. It never asks for, copies, or stores an Amazon password, cookie, or token.

Graphic-novel issue contents are normally product-page metadata rather than library/purchase metadata. The Kindle importer deliberately does not issue a request for every product page during sync; that would be slow and fragile for a large library. A later, user-initiated enrichment step can inspect a selected product page and record a verified contents list.

## Development

Run the deterministic core tests:

```powershell
npm test
```

To load in Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this directory. The options page opens after installation.

## Data and privacy

There is no backend, analytics, account, cloud sync, or password collection. Provider data will remain in `chrome.storage.local` until the user clears it, restores a backup, or uninstalls the extension. The implementation will access provider sites only through a tab where the user is already signed in.

The internal `MATCH_ITEMS` message uses the same matcher as the UI. It is not externally exposed yet: external messaging will wait until both Chrome Web Store extension IDs are known and the Humble extension can be explicitly allow-listed.

## Near-term sequence

1. Provider sync diagnostics and a duplicate-review queue.
2. An external, allow-listed `MATCH_ITEMS` API for Humble Comic Library.
