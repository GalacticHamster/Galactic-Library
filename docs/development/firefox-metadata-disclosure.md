# Firefox disclosure for online book metadata

## 1.0 determination

Optional Open Library/Google Books requests transmit imported bibliographic content outside the browser. No developer server is involved, but that does not exempt this transmission. The defensible classification is `websiteContent` for title/author/ISBN/publisher context. GL also declares `authenticationInfo` for the Google API credential entered into GL and sent to Google. Author names describe the publication, not the user's identity; these lookups do not transmit an account label, purchase history, or browsing history. Generated bibliographic queries are not intercepted browser/search-engine terms.

The existing lookup click and documentation explain the purpose, but a saved bulk queue can send many later requests. We therefore use explicit, revocable Firefox consent instead of relying on single-use implicit consent. The Firefox overlay retains required `none` and declares those two optional categories. Permissions are requested from a trusted Settings click. Bibliographic permission is a shared category for online book lookups, not a separate grant per host. Google additionally needs the credential category. Denial leaves the local library usable; revocation is checked immediately before each queued HTTP request and pauses a bulk lookup without advancing past the denied book. Already sent requests cannot be recalled.

Native grants belong to Firefox, not GL backups or companion synchronization. The minimum remains Firefox 140. Chrome's existing user-started behavior and ordinary host/API permissions are unchanged. The shared code is inactive when the Firefox declaration is absent.

HB/FAN retain their local-storage and local-companion declarations. Their user-requested import reads the provider's own signed-in history; it does not introduce this third-party metadata flow. FAN's website-context token remains with its first-party import and is not copied into saved extension data. No broad collection categories were invented for local operations or inherent browser request headers. This is an implementation/policy determination, not formal Mozilla approval.

## Official basis and implementation

- [Mozilla built-in consent and taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): optional categories, request API, revocation, and Firefox 140 support.
- [Current Add-on Policies, section 6](https://extensionworkshop.com/documentation/publish/add-on-policies/): outside-browser transmission and the limited single-use implicit-consent conditions.
- [Firefox manifest schema](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/schemas/manifest.json) and [permissions schema](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/schemas/permissions.json): declaration enums and `data_collection` request/contains/remove operations. Native regression tests exercise the actual installed browser schema and prompt, not just a JSON approximation.

`src/lib/metadata-consent.js` defines the categories and fail-closed checks; `src/ui/metadata-consent.js` requests native permission from Settings; `src/background/service-worker.js` gates the existing metadata request queue. Tests cover denial, native grant, reload, partial permission, revocation, queue pause and backup preservation with synthetic data in disposable profiles. Optional enrichment remains available.

AMO listing/privacy explanations should match this behavior. Keep local exports and cross-extension messages distinct from external metadata requests. No publication or reviewer approval is implied by passing tests.
