# Live provider browser checks

Fixture tests establish behavior for their supplied inputs. They do not establish
that a provider's current website still exposes those inputs. The opt-in live
probe installs the shipping Firefox packages for GL, HB and FAN into a fresh
temporary profile and visits current provider pages.

Run `node --test tests/humble-entitlement-parity.test.mjs` with the sibling HB
checkout to verify purchase-key reference compatibility across direct GL imports
and companion transfers. This is synthetic integration coverage, not a live
provider test. It preserves destination IDs, account scope and media safeguards;
it does not migrate or delete pre-existing duplicate records.

Run from the GL checkout, with the sibling HB and Fanatical checkouts available:

```powershell
node tests/live-provider-browser.mjs --live --only=humble,fanatical --output=D:\projects\GL-extensions\logs\live-public.jsonl
node tests/live-provider-browser.mjs --live --output=D:\projects\GL-extensions\logs\live-all-providers.jsonl
```

Use a new output filename for each run. Firefox must be installed, or supplied
through `FIREFOX_BIN`. This is deliberately outside the offline unit suite. It
requires network access and respects sign-in gates and anti-bot challenges.

The probe records route paths without query parameters, public page titles,
structural counts and importer hosts. It discovers current Humble and Fanatical
bundle links, checks for one ownership summary and per-product badges, reloads
them, and records the resulting counts. Fanatical links are followed through the
page's own anchors when available; the probe records whether the navigation was
within the same document and verifies summary/badge recovery after Back/Forward.
Screenshots are limited to public
catalogue/bundle pages without detected sign-in forms or challenges. Generated
reports and images belong outside tracked source.

For signed-out Steam and GOG failure checks, use a separate fresh run:

```powershell
node tests/live-provider-browser.mjs --live --fault-public --only=steam,gog --output=D:\projects\GL-extensions\logs\live-signed-out.jsonl
```

This clicks GL's normal import action in the empty test library. It uses the
installed extension's existing scripting permission and Firefox's
`element.openOrClosedShadowRoot` accessor to inspect its closed panel. It does
not change the panel's shadow mode, provider permissions or provider data. It
requires an actionable failure and verifies that no GL items or history were
saved. A navigation-only run also verifies that visiting sites saved no items.

## Interactive authenticated testing

```powershell
node tests/live-provider-browser.mjs --live --interactive --hold --only=humble,fanatical,nintendo --output=D:\projects\GL-extensions\logs\live-login.jsonl
```

Ask the user to sign in only in the separate test window. Never copy sessions
from a personal profile, request credentials, or work around security checks.
The profile has empty extension libraries; imports must remain in those test
libraries. No authenticated import is performed merely by opening this window.

The handoff writes local control metadata to `OUTPUT.control.json`. A trusted
local test operator can submit one request at a time to `OUTPUT.command.json`:
an `id` and either `operation: "evaluate"` with a `script`, or
`operation: "webdriver"` with a `method` and `params`. Results appear in
`OUTPUT.response.json` with the same ID. This controls only that disposable
browser. Commands and results must exclude credentials, raw purchase histories,
account identifiers and redemption information. Prefer UI actions and aggregate
counts. Do not commit the control files or profile.

Wait for controls to finish loading before clicking them. For cross-extension
settings pages, use Firefox's native trusted extension-page opening path through
the local browser driver when direct Marionette navigation stalls. A driver
timeout alone does not establish an application hang; reproduce it through the
normal extension UI before changing production code.

Write `OUTPUT.stop` to finish. The probe closes only its own Firefox process and
removes its generated temporary profile after verifying the cleanup path. It
also stops after its bounded handoff window. Record authenticated imports,
repeats, incremental updates, reloads and consented companion synchronization
separately; the public probe never claims those passed. Do not report unavailable
authenticated tests as fixture or public-site successes.

Firefox exposes the closed-root accessor to extensions; it differs from
Chromium's `chrome.dom.openOrClosedShadowRoot` API. See the
[Mozilla API documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot).
