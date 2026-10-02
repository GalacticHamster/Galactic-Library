# Firefox desktop

Build with npm run package:firefox. The generated manifest uses a module event page and the stable add-on ID galactic-library@galactichamster.com. The shared JavaScript is identical to the Chrome package. Firefox 140 or newer is the supported minimum; signed AMO installation remains a separate release step.

Firefox cannot restrict storage.local access with Chrome's setAccessLevel API. Galactic Library therefore keeps its library, API keys, sync leases, companion permissions and other writer state in extension-origin IndexedDB. Content scripts cannot access that origin's database. Privileged pages still use the same validated, serialized background writer. No sensitive state or change payload is mirrored to storage.local. UI refresh messages contain only changed key names. Session scan state uses Firefox's privileged-by-default storage.session. Chrome keeps its existing protected storage.local/session backend.

Native tests run npm run test:firefox in a disposable profile, checking real module startup, writer/backup behavior, private state outside public local storage, reopening the database and atomic rollback of failed writes. Set FIREFOX_BIN if needed. This does not access a personal Firefox profile or a provider account.

Load the extracted Firefox ZIP manifest from about:debugging to test manually. Import a backup to move an existing Chrome library into Firefox; browser profiles do not share storage automatically.
