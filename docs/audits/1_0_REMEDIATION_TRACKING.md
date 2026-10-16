# Galactic Library Ecosystem — 1.0 Remediation Tracking

**Audit Reference:** [GL_1_0_PRE_RELEASE_ECOSYSTEM_AUDIT.md](file:///d:/projects/GalacticLibrary/docs/audits/GL_1_0_PRE_RELEASE_ECOSYSTEM_AUDIT.md)  
**Baseline Commit:** `4cc55a6` (`GalacticLibrary`)  
**Accepted Live Baselines:**
- Nintendo Switch: 115 Virtual Game Cards
- PlayStation: 60 PS4/PS5 Purchased Library items
- Xbox: 37 Web Library items

---

## Remediation Status Summary

| Issue ID | Repo | Component | Severity | Batch | Status | Resolution Summary |
|---|---|---|:---:|:---:|:---:|---|
| **GL-TXT-01** | GL | `src/ui/provider-accounts.js:16` | P1 | Batch 1 | **Resolved** | Replaced corrupted `PlayStation ? PS4/PS5 Purchased Library` with `PlayStation — PS4/PS5 Purchased Library`. Added regression test in `tests/ui-formatting.js`. |
| **GL-TXT-02** | GL | `src/ui/formatters.js:2` | P1 | Batch 1 | **Resolved** | Added `playstation: 'PlayStation — PS4/PS5 Purchased Library'` mapping to `providerLabel()`. Added regression tests verifying all console providers and fallback. |
| **GL-INT-01** | GL | `src/ui/sync-health.js:5, 31` | P1 | Batch 1 | **Resolved** | Added verified URLs for `xbox`, `playstation`, and `nintendo` (`accounts.nintendo.com/portal/vgcs`). Added `safeProviderUrl()` helper and fallback text; verified no invalid/undefined `href` attributes can be emitted. Added unit tests in `tests/ui-formatting.js`. |
| **DOC-TXT-01** | HB | `README.md:57` | P2 | Batch 1 | **Resolved** | Corrected `1?8` to `1–8`. Cleaned up `â€”` mojibake sequences. |
| **DOC-TXT-02** | FAN | `README.md:250` | P2 | Batch 1 | **Resolved** | Cleaned up `â€”` mojibake sequence in test instructions. |
| **DOC-TXT-03** | HB/FAN | `matching-explanation-ux-2026-10-08.md:1` | P2 | Batch 1 | **Resolved** | Replaced corrupted `?` with em-dash in audit headings. |
| **DOC-TXT-04** | GL | `kindle-contents-performance.md:1, 195` | P2 | Batch 1 | **Resolved** | Replaced corrupted `?` with em-dash in engineering record headings. |
| **GL-INT-02** | GL | `src/companion/companion-response.js:5` | P1 | Batch 3 | Deferred | Adding console sources to companion query validator. |
| **GL-UI-01** | GL | `src/importers/nintendo/*`, `providers-view.js` | P2 | Batch 2/3 | Deferred | Live card count progress streaming; decluttering disabled Quick Update. |
| **ECO-TXT-01** | All | Options action buttons & web overlays | P2 | Batch 2 | Deferred | Ecosystem-wide terminology harmonization ("Quick Update" vs "Import new purchases"). |
| **GL-UI-02** | GL | `options.html`, `sync-health.js`, `options.js` | P2 | Batch 2 | Deferred | Removing developer jargon & formatting raw JSON dumps. |
| **ECO-UI-01** | HB/FAN | `options.js` full rescan confirmation | P2 | Batch 3 | Deferred | Replacing native `window.confirm()` with styled modal dialogs. |
| **ECO-MET-01** | All | `manifest.json`, `package.json` | P2 | Release | Deferred | Version synchronization to 1.0.0 deferred to final release validation. |
| **GL-UI-03** | GL | `ui.css` provider card action buttons | P2 | Batch 2 | Deferred | Responsive flex-wrapping for viewports < 850px. |
| **ECO-INT-02** | HB/FAN | `ownership.js` / bundle overlays | P2 | Batch 3 | Deferred | Integration test enforcing Catalog vs Confirmed Ownership boundary. |

---

## Batch 1 Implementation Details

### 1. Root Cause of PlayStation Question Mark Defect (GL-TXT-01)
- **Investigation:** In `src/ui/provider-accounts.js:16`, the string `'PlayStation ? PS4/PS5 Purchased Library'` contained a literal ASCII question mark (`0x3F`). Adjacent array entries for Xbox (line 15) and Nintendo (line 17) used literal UTF-8 em-dashes (`—`, U+2014).
- **Underlying Cause:** During authoring of the PlayStation import feature (commit `c47a25e`), an em-dash was corrupted into an ASCII `?` when copying through an ASCII/Windows-1252 context. Similar character corruptions occurred in audit notes from early October.
- **Fix:** Restored the standard em-dash `—` (`\u2014`). Added automated regression assertions in `tests/ui-formatting.js`.

### 2. Missing Provider Label Formatting (GL-TXT-02)
- **Investigation:** In `src/ui/formatters.js`, `providerLabel()` defined mappings for PC and media providers as well as `xbox` and `nintendo`, but omitted `playstation`. As a result, anywhere `providerLabel('playstation')` was evaluated (such as Sync Health headers and account captions), it fell back to raw lowercase `'playstation'`.
- **Fix:** Added `playstation: 'PlayStation — PS4/PS5 Purchased Library'` to `formatters.js`. Added unit tests verifying output for `playstation`, `xbox`, `nintendo`, and unknown provider fallbacks.

### 3. Missing Console Provider URLs (GL-INT-01)
- **Investigation:** In `src/ui/sync-health.js`, the URL table omitted `xbox`, `playstation`, and `nintendo`. When rendering the Sync Health dashboard, `urls[provider]` evaluated to `undefined`, creating link anchors with `href="undefined"`.
- **Verified URLs:**
  - `playstation`: `https://library.playstation.com/recently-purchased` (matching `provider-accounts.js` and `manifest.json` match pattern)
  - `xbox`: `https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned` (matching `provider-accounts.js`)
  - `nintendo`: `https://accounts.nintendo.com/portal/vgcs` (matching the active Virtual Game Cards capture route)
- **Fix & Safety Guardrail:** Exported `PROVIDER_SYNC_URLS` and added `safeProviderUrl(provider)`. When a provider has no valid `http/https` destination or is unknown, `sync-health.js` safely renders an explanatory message (`"No web library destination configured for this provider."`) instead of generating an invalid clickable link.

### 4. Documentation Cleanups
- Repaired corrupted characters, `1?8` dash errors, and `â€”` mojibake sequences in `HB/README.md`, `Fanatical/README.md`, `HB/docs/audits/matching-explanation-ux-2026-10-08.md`, `Fanatical/docs/audits/matching-explanation-ux-2026-10-08.md`, and `GalacticLibrary/docs/audits/kindle-contents-performance.md`.
