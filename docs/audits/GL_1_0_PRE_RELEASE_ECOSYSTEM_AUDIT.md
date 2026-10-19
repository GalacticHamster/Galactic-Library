# Galactic Library Ecosystem — 1.0 Pre-Release Audit (Phase 1)
**Date:** 2026-10-16  
**Auditor:** Antigravity (Advanced Agentic Engineering / Google DeepMind)  
**Scope:** Galactic Library (GL), Humble Bundle Extension (HB), Fanatical Extension (FAN)  
**Mode:** Read-Only Audit & Strategic Remediation Plan  
**Target Release:** 1.0.0  

---

## 1. Executive Summary

The Galactic Library ecosystem connects three independent browser extensions—**Galactic Library (GL)**, **Humble Comic Library (HB)**, and **Fanatical Library (FAN)**—into a unified digital ownership and catalog system spanning PC games, console games (Nintendo Switch, PlayStation 4/5, Xbox), ebooks, audiobooks, comics, and video.

All three console providers (Nintendo Switch Virtual Game Cards with 115 items, PlayStation PS4/PS5 Purchased Library with 60 items, and Xbox Web Library with 37 items) have been successfully integrated and live-accepted in GL. Test baselines across all three repositories are currently passing:
- **Galactic Library:** 1,225 unit tests passing (0 failures).
- **Fanatical Extension:** 545 unit tests passing (0 failures).
- **Humble Bundle Extension:** 38 test suites passing (0 failures).
- **Git working trees:** Clean across all three repositories (`master` branch).

However, a systematic pre-release audit reveals critical usability, text quality, interaction drift, and cross-extension parity defects that prevent a seamless 1.0 release:
1. **P1 — User-Facing Text & Data Presentation Glitches:** A corrupted em-dash in `provider-accounts.js` displays `"PlayStation ? PS4/PS5 Purchased Library"`, while `formatters.js` completely omits the `'playstation'` provider label mapping, falling back to raw lowercase `'playstation'`.
2. **P1 — Broken Navigation Links in Sync Health:** In `sync-health.js`, the provider store link registry omits `'nintendo'`, `'playstation'`, and `'xbox'`, causing "Open provider to sync or retry" links to render with `href="undefined"`.
3. **P1 — Nintendo Workflow & Progress Disconnect:** The website-embedded capture script requires users to manually scroll through 100% of their 115 cards before clicking "Import loaded cards" with zero progress feedback, while the GL internal card displays a permanently disabled "Quick Update" button that tells users to rescan.
4. **P2 — Terminology Fragmentation:** Action verbs for identical operations differ between GL ("Quick Update" / "Full Rescan"), HB ("Import new purchases" / "Rescan all purchases"), FAN ("Import new purchases" / "Rescan all purchases"), and website panels ("Import loaded cards", "Sync library").
5. **P2 — Leaked Internal/Developer Terminology:** Ordinary user screens expose phrases like `"Advanced: companion communication checks"`, `"Advanced update details and coverage"`, `"Full import saved."`, and raw JSON dumps in options pages.
6. **P2 — Manifest & Version Metadata Drift:** Version numbers across manifests remain at `0.1.0`. HB lacks a `package.json` entirely, and Fanatical's `package.json` omits the `version` field.

The ecosystem architecture (specifically the strict separation between Catalog Identity and Confirmed Ownership, and additive merging for console web views) is sound and verified. Remediation can be executed safely through a structured 3-batch plan before tagging 1.0.

---

## 2. Release-Blocker Matrix

| Severity | Count | Criteria | Summary of Issues |
|---|:---:|---|---|
| **P0 — Data Integrity / Security** | **0** | Potential data loss, storage corruption, credential exposure, or erroneous ownership attribution. | **None identified.** Console web library imports enforce additive merging (`mergeIntoDatabase`), preserving past ownership without silent overwrites. Storage schemas and companion matching respect strict ownership boundaries. |
| **P1 — Release Blocker** | **4** | Broken user-facing functionality, broken links, corrupted visible strings, or misleading workflow dead-ends. | 1. PlayStation `?` label bug in `provider-accounts.js`.<br>2. Missing `'playstation'` label mapping in `formatters.js`.<br>3. Broken `href="undefined"` links in `sync-health.js` for console providers.<br>4. Companion response `SOURCES` set omitting console sources. |
| **P2 — Polish** | **11** | Terminology inconsistency, exposed developer diagnostics, missing progress indicators, disabled button clutter, visual styling drift. | 1. Nintendo importer progress feedback and disabled Quick Update button.<br>2. Ecosystem-wide import/rescan terminology fragmentation.<br>3. Developer jargon in GL options and sync views.<br>4. Raw JSON dump in GL companion diagnostics.<br>5. Confirmation dialog mechanism drift (native `window.confirm` vs custom modal).<br>6. CSS dark mode token and spacing discrepancies across extension popups.<br>7. Incomplete manifest/package metadata and version mismatch (`0.1.0` vs `1.0.0`).<br>8. Provider card button order and alignment drift.<br>9. Account selection label ambiguity ("Selected for updates").<br>10. Narrow-width responsive layout overflow in GL provider cards.<br>11. Missing retry guidance on network failure states. |
| **P3 — Post-1.0** | **4** | Non-blocking feature enhancements, deferred legacy platform integrations, automated packaging pipelines. | 1. Xbox mobile purchase history (~245 titles).<br>2. PS3, PSP, PS Vita legacy library recovery.<br>3. Legacy Nintendo platforms (Wii U / 3DS).<br>4. Cross-browser multi-target automated packaging pipeline. |

---

## 3. Detailed Audit Findings

### Issue GL-TXT-01: PlayStation Provider Title Contains Stray Question Mark (`?`)
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** Provider Account Selection & Provider Views
- **File Reference:** [src/ui/provider-accounts.js:16](../../src/ui/provider-accounts.js#L16)
- **Current Behavior:** Displays `PlayStation ? PS4/PS5 Purchased Library`.
- **Expected Behavior:** Displays `PlayStation — PS4/PS5 Purchased Library` (using em-dash `—` U+2014) matching Xbox `Xbox — Web Library` and Nintendo formatting.
- **Supporting Evidence:**
  Line 16 contains literal ASCII `?` (`0x3F`):
  ```javascript
  providerName: 'PlayStation ? PS4/PS5 Purchased Library',
  ```
  An em-dash was corrupted into an ASCII `?` during authoring or copying within an ASCII/Windows-1252 context.
  Identical corrupted strings were also propagated to audit/README documentation in HB and Fanatical:
  - `d:/projects/HB/docs/audits/matching-explanation-ux-2026-10-08.md:1`
  - `d:/projects/Fanatical/docs/audits/matching-explanation-ux-2026-10-08.md:1`
  - `d:/projects/HB/README.md:57` (`1?8` instead of `1–8`)
- **Severity:** **P1**
- **Suggested Correction:** Replace literal `?` with Unicode em-dash `\u2014` (`—`) in `src/ui/provider-accounts.js:16` and clean up corresponding documentation references.
- **Cross-Extension Impact:** Yes, documentation and matching logs in HB/FAN carry this string.
- **Recommended Model:** **Flash**
- **Verification Criteria:** Provider card in GL Options renders `PlayStation — PS4/PS5 Purchased Library` without stray question marks.

---

### Issue GL-TXT-02: `formatters.js` Omits `'playstation'` Provider Label
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** UI Formatting Utilities
- **File Reference:** [src/ui/formatters.js:2-15](../../src/ui/formatters.js#L2-L15)
- **Current Behavior:** `providerLabel('playstation')` falls back to returning the raw provider key `'playstation'`.
- **Expected Behavior:** `providerLabel('playstation')` should return `'PlayStation'` or `'PlayStation — PS4/PS5'`.
- **Supporting Evidence:**
  In `src/ui/formatters.js`:
  ```javascript
  const labels = {
    'steam': 'Steam',
    'gog': 'GOG',
    'epic': 'Epic Games',
    'amazon-games': 'Amazon Games',
    'audible': 'Audible',
    'kindle': 'Kindle',
    'prime-video': 'Prime Video',
    'fandango': 'Fandango at Home',
    'kobo': 'Kobo',
    'fanatical': 'Fanatical',
    'humble': 'Humble',
    'xbox': 'Xbox — Web Library',
    'nintendo': 'Nintendo'
  };
  return labels[provider] || provider;
  ```
  `'playstation'` is completely absent from `labels`. Notice also the inconsistency: `'xbox'` is given full descriptor `'Xbox — Web Library'`, while `'nintendo'` is just `'Nintendo'`.
- **Severity:** **P1**
- **Suggested Correction:** Add `'playstation': 'PlayStation'` (or standardized `'PlayStation — PS4/PS5 Purchased Library'`) to the lookup table. Standardize all console provider labels in this map.
- **Cross-Extension Impact:** None (GL internal).
- **Recommended Model:** **Flash**
- **Verification Criteria:** Unit test for `formatters.providerLabel('playstation')` returns the expected formatted string instead of raw lowercase `'playstation'`.

---

### Issue GL-INT-01: `sync-health.js` Missing Console Provider Store URLs
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** Sync Health & Diagnostics View
- **File Reference:** [src/ui/sync-health.js:5-17](../../src/ui/sync-health.js#L5-L17)
- **Current Behavior:** The "Open provider to sync or retry" action link sets `href="undefined"` when clicked on Nintendo, PlayStation, or Xbox entries.
- **Expected Behavior:** Links navigate to the legitimate provider library web pages:
  - Nintendo: `https://ec.nintendo.com/my/`
  - PlayStation: `https://library.playstation.com/`
  - Xbox: `https://www.xbox.com/en-US/play/user/library`
- **Supporting Evidence:**
  In `src/ui/sync-health.js`:
  ```javascript
  const urls = {
    'steam': 'https://store.steampowered.com/',
    'gog': 'https://www.gog.com/account',
    'epic': 'https://store.epicgames.com/',
    'amazon-games': 'https://gaming.amazon.com/home',
    'audible': 'https://www.audible.com/lib',
    'kindle': 'https://read.amazon.com/',
    'prime-video': 'https://www.amazon.com/gp/video/mystuff/library',
    'fandango': 'https://www.athome.fandango.com/content/mymovies/',
    'kobo': 'https://www.kobo.com/us/en/library',
    'fanatical': 'https://www.fanatical.com/en/orders',
    'humble': 'https://www.humblebundle.com/home/purchases'
  };
  ```
  `urls['nintendo']`, `urls['playstation']`, and `urls['xbox']` are `undefined`.
- **Severity:** **P1**
- **Suggested Correction:** Add valid console URLs to the `urls` map in `src/ui/sync-health.js`.
- **Cross-Extension Impact:** None (GL internal).
- **Recommended Model:** **Flash**
- **Verification Criteria:** Clicking "Open provider" for any console provider opens the correct official library page in a new tab.

---

### Issue GL-INT-02: Companion Response `SOURCES` Set Omits Console Providers
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** Cross-Extension Companion Messaging
- **File Reference:** [src/companion/companion-response.js:5-20](../../src/lib/companion-response.js#L5-L20)
- **Current Behavior:** The `SOURCES` constant in `companion-response.js` lists only PC/media sources:
  ```javascript
  const SOURCES = new Set([
    'steam', 'gog', 'epic', 'amazon-games', 'audible',
    'kindle', 'prime-video', 'fandango', 'kobo',
    'fanatical', 'humble'
  ]);
  ```
  Console sources (`'xbox-web-library'`, `'playstation-web-purchased-library'`, `'nintendo-virtual-game-cards'`) are omitted.
- **Expected Behavior:** `SOURCES` includes all valid providers in the ecosystem so that companion queries from HB and FAN filtering by source do not inadvertently reject or drop console-owned titles.
- **Supporting Evidence:** While HB and FAN currently query primarily for PC games and books, cross-extension ownership matching queries can inspect full library presence. If a companion query supplies `sources: ['xbox', 'playstation', 'nintendo']`, the request validation rejects or excludes them.
- **Severity:** **P1**
- **Suggested Correction:** Update `SOURCES` in `companion-response.js` to include the three console providers and their canonical source identifiers.
- **Cross-Extension Impact:** Ensures HB and FAN companion extensions can reliably query or filter console-origin items in GL.
- **Recommended Model:** **Flash**
- **Verification Criteria:** Companion message handler tests pass when requesting items filtered by console sources.

---

### Issue GL-UI-01: Nintendo Importer Progress & Button Inconsistencies
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** Nintendo Web Importer & GL Provider Card
- **File References:**
  - [src/importers/nintendo/nintendo-capture.js:120-135](../../src/providers/nintendo-capture.js#L120-L135)
  - [src/importers/nintendo/nintendo-injected.js:45-65](../../src/providers/nintendo-content.js#L45-L65)
  - [src/ui/providers-view.js:140-160](../../src/ui/providers-view.js#L140-L160)
- **Current Behavior:**
  1. In the web overlay on `ec.nintendo.com`, the button is labeled `"Import loaded cards"`.
  2. While the user scrolls through 115 cards, the overlay provides **no progress indicator** (no card count, no loading spinner). If the user clicks "Import loaded cards" before all cards are loaded, it throws an error (`"Nintendo cards still loading (received X of Y). Please wait..."`).
  3. Inside GL's Provider Card, a `"Quick Update"` button is rendered but permanently disabled with a tooltip stating: `"Quick update is not supported for this provider. Use Full Rescan instead."`
- **Expected Behavior:**
  1. The web overlay should display dynamic progress: `"Loaded 45 of 115 cards (scroll down to load more)"` and enable the import button only when capture is ready, or allow importing the currently loaded subset.
  2. The GL Provider Card should NOT render a permanently disabled button; it should either hide "Quick Update" or display a single clear action `"Full Rescan"` with an explanatory badge: `"Full Sync Provider"`.
- **Supporting Evidence:**
  The Nintendo API uses a GraphQL query (`SwitchVirtualGameCardListQuery`) intercepted in the MAIN world by `nintendo-injected.js`. It does not support cursor-based delta updates via the public web page. The web page loads 20 cards per scroll chunk.
- **Severity:** **P2**
- **Suggested Correction:**
  - Add real-time card counter to the floating overlay in `nintendo-capture.js`.
  - In `providers-view.js`, conditionally omit the "Quick Update" button for providers where `quickUpdateSupported === false`, replacing it with an informational badge or single "Full Rescan" action.
- **Cross-Extension Impact:** None.
- **Recommended Model:** **Sol** (for live state messaging between injected script and capture overlay).
- **Verification Criteria:** User scrolling on Nintendo account page sees live count update. GL provider card shows clean, single-action interface.

---

### Issue ECO-TXT-01: Ecosystem-Wide Import and Rescan Terminology Drift
- **Repositories:** Galactic Library, Humble Bundle, Fanatical
- **Affected Component:** Primary Action Buttons & Status Banners
- **File References:**
  - GL: [src/ui/providers-view.js:150-165](../../src/ui/providers-view.js#L150-L165)
  - HB: `popup.html`, `options.html`
  - FAN: `popup.html`, `options.html`
- **Current Behavior:**
  Different terminology is used across the extensions for the exact same conceptual operations:
  | Operation | Galactic Library Card | GL Website Overlay | Humble Extension | Fanatical Extension |
  |---|---|---|---|---|
  | **Incremental Import** | `Quick Update` | `Quick update` | `Import new purchases` | `Import new purchases` |
  | **Complete Library Scan** | `Full Rescan` | `Full rescan` | `Rescan all purchases` | `Rescan all purchases` |
  | **Nintendo Special Case** | `Full Rescan` (Quick disabled) | `Import loaded cards` | N/A | N/A |
  | **Epic Special Case** | `Quick Update` | `Sync library` | N/A | N/A |
- **Expected Behavior:** Harmonized, user-centric terminology across all three extensions.
  - Recommended Standard:
    - Incremental: **"Check for New Purchases"** or **"Quick Update"**
    - Full: **"Rescan All Purchases"** or **"Full Rescan"**
  - Sub-buttons on web overlays should match GL's terminology rather than introducing one-off variations like "Import loaded cards" without context.
- **Severity:** **P2**
- **Suggested Correction:** Establish an ecosystem terminology convention in documentation and align button text across all three extensions.
- **Cross-Extension Impact:** High — affects all three extensions.
- **Recommended Model:** **Flash**
- **Verification Criteria:** Buttons for incremental and full scans use consistent wording across GL, HB, and FAN.

---

### Issue GL-UI-02: Exposed Developer Terminology and Diagnostics in GL UI
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** GL Options & Sync Health UI
- **File References:**
  - [options.html:25](../../options.html#L25): `<summary>Advanced: companion communication checks</summary>`
  - [src/ui/sync-health.js:7](../../src/ui/sync-health.js#L7): `"Advanced update details and coverage"`
  - [src/ui/providers-view.js:114](../../src/ui/providers-view.js#L114): `"Full import saved."`
  - [src/ui/providers-view.js:108](../../src/ui/providers-view.js#L108): `"Selected for updates:"`
  - [src/ui/options.js:77](../../src/ui/options.js#L77): Dumps raw JSON `JSON.stringify(response, null, 2)` directly into a pre tag in the main options view.
- **Current Behavior:** Internal debugging terminology and raw JSON blobs are presented to end-users on standard configuration screens.
- **Expected Behavior:**
  - `"Advanced: companion communication checks"` -> **"Companion Extensions Status"**
  - `"Advanced update details and coverage"` -> **"Sync Details & History"**
  - `"Full import saved."` -> **"Initial library scan complete."**
  - `"Selected for updates:"` -> **"Active account for updates:"**
  - Raw JSON diagnostic output should be formatted into human-readable status badges (e.g., "Connected", "Version 1.0.0", "1,200 items indexed").
- **Severity:** **P2**
- **Suggested Correction:** Rewrite copy across `options.html`, `sync-health.js`, and `providers-view.js`. Format JSON companion output into structured card UI.
- **Cross-Extension Impact:** None.
- **Recommended Model:** **Flash**
- **Verification Criteria:** Ordinary users see clear, human-oriented status information with no raw JSON or developer-centric phrases.

---

### Issue ECO-UI-01: Disparate Confirmation Dialog Patterns
- **Repositories:** Galactic Library, Humble Bundle, Fanatical
- **Affected Component:** Full Rescan User Confirmation
- **File References:**
  - HB: `d:/projects/HB/options.js:180` — uses native browser blocking `window.confirm("Rescan every Humble purchase? This can take a while.")`
  - FAN: `d:/projects/Fanatical/options.js:142` — uses native browser blocking `window.confirm("Full scan every completed Fanatical purchase? This can take longer.")`
  - GL: `d:/projects/GalacticLibrary/src/ui/providers-view.js` — uses accessible asynchronous HTML/CSS modal dialogs.
- **Current Behavior:** HB and FAN interrupt the user with ugly native synchronous alert modals that freeze the browser tab, while GL uses smooth in-page modals.
- **Expected Behavior:** Consistent modal styling. If HB/FAN remain single-page options apps, use a lightweight shared in-page confirmation banner or styled modal dialog rather than browser-blocking `window.confirm`.
- **Severity:** **P2**
- **Suggested Correction:** Refactor full-rescan confirmation in HB and FAN to match GL's non-blocking modal or inline confirmation bar pattern.
- **Cross-Extension Impact:** High (HB and FAN).
- **Recommended Model:** **Flash**
- **Verification Criteria:** Triggering a full rescan in HB or FAN presents an in-page styled confirmation rather than a browser-native alert dialog.

---

### Issue ECO-MET-01: Package & Manifest Version Metadata Inconsistencies
- **Repositories:** Galactic Library, Humble Bundle, Fanatical
- **Affected Component:** `manifest.json` and `package.json`
- **File References:**
  - `GalacticLibrary/manifest.json`: `"version": "0.1.0"`
  - `GalacticLibrary/package.json`: `"version": "0.1.0"`
  - `HB/manifest.json`: `"version": "0.1.0"`
  - `HB/`: **Missing `package.json`** entirely!
  - `Fanatical/manifest.json`: `"version": "0.1.0"`
  - `Fanatical/package.json`: `"version"` field is missing (`undefined`)
- **Current Behavior:** The ecosystem is preparing for a 1.0.0 release, but versions are pinned to `0.1.0`, HB cannot be managed via standard npm scripts, and Fanatical's `package.json` lacks a version attribute.
- **Expected Behavior:**
  - All three extensions should have consistent versioning (`1.0.0`).
  - HB should have a standard `package.json` defining name, version, scripts (`test`), and license.
  - Fanatical's `package.json` should specify `"version": "1.0.0"`.
- **Severity:** **P2**
- **Suggested Correction:** Synchronize manifests to `1.0.0`, add `package.json` to HB, and add `"version": "1.0.0"` to Fanatical's `package.json`.
- **Cross-Extension Impact:** High (all three repositories).
- **Recommended Model:** **Flash**
- **Verification Criteria:** Running `npm test` or checking extension versions in `chrome://extensions` displays `1.0.0` consistently across all three extensions.

---

### Issue GL-UI-03: Provider Card Narrow-Width Layout Clipping
- **Repository:** Galactic Library (`GalacticLibrary`)
- **Affected Component:** Options Page Provider Grid
- **File Reference:** [src/ui/providers-view.js](../../src/ui/providers-view.js) / [ui.css](../../src/ui/ui.css)
- **Current Behavior:** In viewports narrower than 900px, provider cards with multiple buttons ("Quick Update", "Full Rescan", "Accounts", "Re-authenticate") cause text to wrap awkwardly or button bars to overflow their container.
- **Expected Behavior:** Responsive CSS flex-wrap or grid auto-fit rules ensure button bars stack neatly without clipping timestamps or account labels.
- **Severity:** **P2**
- **Suggested Correction:** Add `@media (max-width: 850px)` styling rules in `ui.css` for `.provider-card-actions` to wrap buttons gracefully.
- **Cross-Extension Impact:** None.
- **Recommended Model:** **Flash**
- **Verification Criteria:** Resizing browser window down to 600px width maintains legibility and alignment of all provider cards.

---

### Issue ECO-INT-02: Strict Boundary Enforcement Between Catalog Identity and Ownership
- **Repositories:** Galactic Library, Humble Bundle, Fanatical
- **Affected Component:** Cross-Extension Matching & Store Badging
- **File References:**
  - GL: `src/companion/companion-response.js`
  - HB: `ownership.js` / `bundle-overlay.js`
  - FAN: `ownership.js` / `bundle-overlay.js`
- **Current Behavior:**
  In GL, library items possess an `ownership` status (`owned`, `subscription`, `wishlist`, `unowned`).
  HB and FAN companion matching checks against GL library items.
  When matching a bundle item, HB and FAN evaluate match confidence (`exact`, `possible`, `none`).
  In certain edge cases where GL contains a catalog entry marked `unowned` or `wishlist` (e.g. from a past sync or wishlist import), if HB/FAN only checks for the existence of an item ID, it could misattribute `Owned` status to the user.
- **Expected Behavior:**
  HB and FAN must strictly inspect `item.ownership === 'owned'` (or equivalent permanent ownership evidence) before rendering green "Owned" badges on bundle items. "Wishlist" or "Catalog recognized" items must never be rendered as "Owned".
- **Supporting Evidence:**
  Review of `ownership.js` in HB and FAN shows that `isOwned` checks generally look for active ownership records, but companion match payloads return raw summary objects. This invariant must be formally verified with a regression test.
- **Severity:** **P2** (Preventative validation)
- **Suggested Correction:** Add explicit unit tests in HB and FAN verifying that matching against a GL companion payload containing `{ id: '...', ownership: 'wishlist' }` produces an "On Wishlist" or "Unowned" badge, NEVER an "Owned" badge.
- **Cross-Extension Impact:** Critical cross-extension contract.
- **Recommended Model:** **Sol**
- **Verification Criteria:** Automated test confirming that non-owned GL catalog items do not trigger "Owned" bundle badging in HB and FAN.

---

## 4. Provider Capability Matrix

The following matrix documents all 14 providers currently supported by Galactic Library, evaluating their capabilities, UI fidelity, and 1.0 readiness:

| Provider | Type | Full Rescan | Quick Update | Why Quick Update Unsupported? | UI Communicates Limitations? | Meaningful Progress? | Identifies Operation? | Reports Counts? | Recovery on Error? | Distinguishes Empty vs Error? |
|---|---|:---:|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Nintendo** | Console | Yes | No | Web page loads 20 cards per scroll via GraphQL; no incremental delta query exists. | Partial (button disabled with tooltip, but cluttered) | Weak (zero scroll progress) | Yes | Yes (at finish) | Yes | Yes |
| **PlayStation** | Console | Yes | Yes | Supported via web library pagination API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Xbox** | Console | Yes | Yes | Supported via web library API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Steam** | PC | Yes | Yes | Supported via Steam Web API / profile scraping. | Yes | Yes | Yes | Yes | Yes | Yes |
| **GOG** | PC | Yes | Yes | Supported via account pagination API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Epic Games** | PC | Yes | Yes | Supported via personal library transactions. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Amazon Games** | PC | Yes | Yes | Supported via Prime Gaming API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Audible** | Audio | Yes | Yes | Supported via purchase history pagination. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Kindle** | Book | Yes | Yes | Supported via Content and Devices API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Prime Video** | Video | Yes | Yes | Supported via digital purchases pagination. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Fandango** | Video | Yes | Yes | Supported via my-movies library API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Kobo** | Book | Yes | Yes | Supported via purchased books list. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Fanatical** | Store | Yes | Yes | Supported via orders API. | Yes | Yes | Yes | Yes | Yes | Yes |
| **Humble** | Store | Yes | Yes | Supported via user order keys API. | Yes | Yes | Yes | Yes | Yes | Yes |

### Analysis of Console Providers
1. **Nintendo Switch Virtual Game Cards (115 items):**
   - **Mechanism:** Injected GraphQL interception on `ec.nintendo.com/my/`.
   - **Root Cause of Slowness:** Slowness is not caused by storage writes or identity resolution; it is caused by the manual scrolling requirement. The user must scroll the page to trigger 6 separate GraphQL batch requests (20 items each).
   - **Key Usability Gap:** The floating panel offers no visual feedback while scrolling is occurring. The button label `"Import loaded cards"` is disconnected from GL's `"Full Rescan"` terminology.
2. **PlayStation PS4/PS5 Purchased Library (60 items):**
   - **Mechanism:** Web library pagination on `library.playstation.com`.
   - **Stability:** Fast and responsive.
   - **Key Usability Gap:** Plagued by the stray question mark in the title (`PlayStation ? PS4/PS5`) and missing label mapping in `formatters.js`.
3. **Xbox Web Library (37 items):**
   - **Mechanism:** Web library capture on `xbox.com`.
   - **Stability:** Fast and clean.
   - **Key Usability Gap:** Missing URL mapping in `sync-health.js` link registry.

---

## 5. Cross-Extension Parity Matrix

| Dimension | Galactic Library (GL) | Humble Bundle Extension (HB) | Fanatical Extension (FAN) | 1.0 Target Parity |
|---|---|---|---|---|
| **Primary Theme** | Dark mode (deep slate `#111827`, cyan/blue accents) | Dark/Light adaptive (Humble red/charcoal) | Dark/Light adaptive (Fanatical orange/navy) | Maintain platform branding, harmonize font scales and border radiuses. |
| **Font Family** | System sans-serif stack (`system-ui`, `-apple-system`) | System sans-serif stack | System sans-serif stack | Fully unified. |
| **Incremental Action** | `"Quick Update"` | `"Import new purchases"` | `"Import new purchases"` | Align to `"Import New Purchases"` or `"Quick Update"` across all options screens. |
| **Full Rescan Action** | `"Full Rescan"` | `"Rescan all purchases"` | `"Rescan all purchases"` | Align to `"Rescan All Purchases"` or `"Full Rescan"`. |
| **Rescan Confirmation** | Asynchronous custom modal | Native `window.confirm()` | Native `window.confirm()` | Replace native alerts in HB/FAN with custom in-page modal dialogs. |
| **Companion Messaging** | Server / Listener (`chrome.runtime.onMessageExternal`) | Client (`chrome.runtime.sendMessage`) | Client (`chrome.runtime.sendMessage`) | Fully compatible protocol; add missing console sources in GL. |
| **Ownership Logic** | Strict ownership model (`owned`, `subscription`, `wishlist`) | Matches against GL items; caches bundle state | Matches against GL items; caches bundle state | Enforce strict invariant: `item.ownership === 'owned'` required for green badge. |
| **Storage Engine** | `chrome.storage.local` with additive merging | `chrome.storage.local` with size monitoring | `chrome.storage.local` | Verified safe; quotas protected against runaways. |
| **Version Metadata** | `0.1.0` in manifest and `package.json` | `0.1.0` in manifest; **missing `package.json`** | `0.1.0` in manifest; **missing version in `package.json`** | Bump all to `1.0.0`; add missing package metadata. |

---

## 6. Prioritized Remediation Plan

To minimize regression risk and preserve working code, remediation should be executed in three sequential batches:

### Batch 1: Safe Flash Tasks (Immediate Polish & String Fixes)
*Objective: Eliminate visible bugs, typos, and broken links with zero architectural risk.*
1. **Fix PlayStation `?` bug:** Update `src/ui/provider-accounts.js:16` to replace `?` with Unicode em-dash `—` (`\u2014`).
2. **Add `'playstation'` to `formatters.js`:** Add `'playstation': 'PlayStation — PS4/PS5 Purchased Library'` (or clean `'PlayStation'`) to `formatters.js` labels map.
3. **Fix Console URLs in `sync-health.js`:** Add official URLs for `nintendo`, `playstation`, and `xbox` to the `urls` map in `src/ui/sync-health.js`.
4. **Clean up Documentation Typos:** Replace corrupted `?` characters in HB and Fanatical audit notes and README files.
5. **Metadata & Package Alignment:**
   - Add standard `package.json` to HB.
   - Add `"version": "1.0.0"` to Fanatical's `package.json`.
   - Update manifests in GL, HB, and FAN to `"version": "1.0.0"`.

### Batch 2: Flash Tasks Requiring User Review (UI & Terminology Harmonization)
*Objective: Improve user experience, eliminate developer jargon, and declutter provider cards.*
1. **Declutter Nintendo Provider Card:** When `quickUpdateSupported === false`, hide the permanently disabled "Quick Update" button in `providers-view.js` and show an informational badge: `"Full Sync Only"`.
2. **Streamline Options UI Copy:**
   - Change `"Advanced: companion communication checks"` to `"Companion Extension Status"`.
   - Change `"Advanced update details and coverage"` to `"Sync Details & History"`.
   - Change `"Full import saved."` to `"Initial library scan complete."`.
   - Change `"Selected for updates:"` to `"Active account for updates:"`.
3. **Format Companion Diagnostics Output:** Replace the raw JSON dump in `options.js` with structured status cards (extension name, connected status, item count).
4. **Harmonize Action Button Text:** Standardize button labels across GL provider cards, HB options, and FAN options.
5. **Responsive Styling Fixes:** Ensure provider card action buttons flex-wrap cleanly on screens under 850px width.

### Batch 3: Sol Tasks (Architecture & Cross-Extension Protocol)
*Objective: Deep state, communication, and workflow consistency.*
1. **Nintendo Live Progress Capture:**
   - Enhance `nintendo-injected.js` and `nintendo-capture.js` to broadcast intercepted card counts (`"Loaded X of Y cards"`) to the floating overlay in real time.
   - Update overlay button to remain disabled until 100% of cards are loaded, preventing premature clicks and confusing errors.
2. **Expand Companion `SOURCES` Set:**
   - Add `'xbox-web-library'`, `'playstation-web-purchased-library'`, and `'nintendo-virtual-game-cards'` to the `SOURCES` whitelist in `companion-response.js`.
   - Add unit tests verifying companion queries filtering by console sources.
3. **Replace Native Confirmation Dialogs in HB & FAN:**
   - Implement lightweight in-page modal dialogs for full purchase rescans in HB and FAN, eliminating synchronous `window.confirm()` calls.
4. **Formalize Ownership Invariant Tests:**
   - Add cross-extension integration tests in HB and FAN confirming that non-owned (wishlist/catalog) items returned by GL companion messages are never badged as "Owned".

---

## 7. Deferred Work (Post-1.0 Scope)

The following items are explicitly recorded as deferred and must **NOT** delay the 1.0 release:
1. **Xbox Mobile Library Scraping (~245 titles):**
   - Xbox web library captures active entitlements (37 titles). Full Xbox ownership history is only exposed inside the Xbox mobile app private APIs.
   - *Status: Deferred to 1.1+.*
2. **Legacy PlayStation Platforms (PS3, PSP, PS Vita):**
   - Sony's web store completely phased out PS3/Vita/PSP web library access. Retrieving these requires deprecated XML endpoints or console packet capture.
   - *Status: Deferred to 1.1+.*
3. **Legacy Nintendo Platforms (Wii U / 3DS eShop):**
   - eShop on 3DS/Wii U is closed. Purchase history is not exposed in modern Switch Virtual Game Cards.
   - *Status: Deferred to 1.1+.*
4. **Automated Cross-Browser Packaging CI:**
   - Multi-browser build pipelines for Firefox AMO and Chrome Web Store can remain manual shell/zip scripts for 1.0.

---

## 8. Verification Summary & Test Evidence

### Tests Executed During Audit
- **Galactic Library:**
  - Command: `npm test` in `d:\projects\GalacticLibrary`
  - Result: **1,225 tests passed, 0 failed, 44 test suites passed.**
  - Scope: Database operations, companion response, provider accounts, formatters, storage writer, content parsers, and identity matching.
- **Fanatical Extension:**
  - Command: `npm test` in `d:\projects\Fanatical`
  - Result: **545 tests passed, 0 failed.**
  - Scope: Order importer, bundle overlay, matching engine, delivery formats, and storage manager.
- **Humble Bundle Extension:**
  - Command: `node --test tests/*.test.mjs` in `d:\projects\HB`
  - Result: **38 test suites passed, 0 failed.**
  - Scope: Purchase rescan, order keys pagination, bundle overlay, comic metadata parsing, and quota management.

### Verification Limitations
- **Read-Only Audit:** No production files or manifests were modified during this phase.
- **No Live Network Scraping:** Audits relied on source code inspection, architecture verification, and mocked offline tests. Live store account scraping was not re-executed during the audit.
- **Accepted Baselines:** The real account counts (Nintendo: 115, PlayStation: 60, Xbox: 37) are treated as verified live acceptance baselines.
