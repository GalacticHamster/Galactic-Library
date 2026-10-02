# Firefox desktop

Build with npm run package:firefox. The generated manifest uses a module event page and the stable add-on ID galactic-library@galactichamster.com. The shared JavaScript is identical to the Chrome package. Firefox 140 or newer is the supported minimum; signed AMO installation remains a separate release step.

Firefox cannot restrict storage.local access with Chrome's setAccessLevel API. Galactic Library therefore keeps its library, API keys, sync leases, companion permissions and other writer state in extension-origin IndexedDB. Content scripts cannot access that origin's database. Privileged pages still use the same validated, serialized background writer. No sensitive state or change payload is mirrored to storage.local. UI refresh messages contain only changed key names. Session scan state uses Firefox's privileged-by-default storage.session. Chrome keeps its existing protected storage.local/session backend.

Native tests run npm run test:firefox in a disposable profile, checking real module startup, writer/backup behavior, private state outside public local storage, reopening the database and atomic rollback of failed writes. Set FIREFOX_BIN if needed. This does not access a personal Firefox profile or a provider account.

Load the extracted Firefox ZIP manifest from about:debugging to test manually. Import a backup to move an existing Chrome library into Firefox; browser profiles do not share storage automatically.

## Companion setup

In GL options, allow the companions you use:

- HB: `humble-comic-library@galactichamster.com`
- Fanatical: `fanatical-library@galactichamster.com`

In each companion, save `galactic-library@galactichamster.com` and test the link. These declared Gecko IDs work across profiles; the private `moz-extension` host is not a pairing ID. No native messaging helper is needed. Allowed companions open central review by sending `OPEN_REVIEW`; GL opens its own options. Older GL builds retain the companion's toolbar fallback. GL can likewise ask paired HB to open source review; older/unpaired HB builds show toolbar instructions.

## Verified behavior

On 2026-10-02, the 141 core checks, 34 packaged Firefox dashboard checks, 22 packaged Firefox importer-panel checks and 32 installed Firefox checks passed. The installed checks include private storage and atomic rollback, all three module/background runtimes, options-based pairing, software matching, Possible editions, Partial comics coverage, HB reminder sharing consumed by FAN, central review, GL-to-HB source review and revocation.

Run `npm run test:browser:firefox`, `npm run test:importers:firefox`, and `npm run test:firefox:companions`. The last command requires the adjacent HB and Fanatical repos for tests only. It also serializes the real GL/FAN purchase functions using Firefox's MAIN-world script injection: 200 purchases across ten pages, a quick scan across eleven pages fetching only the new purchase, and broken-pagination rejection. Those requests go only to a local synthetic server; localhost permission is granted only inside the disposable test profile. Shipping sender/origin guards remain unchanged.

Tests do not certify live signed-in providers, an unseen large Fanatical account, AMO signing or OS notification delivery. Signed release distribution remains separate from these temporary unsigned development installs.
