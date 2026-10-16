# Galactic Library Ecosystem — 1.0 Remediation Tracking

**Audit Reference:** [GL_1_0_PRE_RELEASE_ECOSYSTEM_AUDIT.md](GL_1_0_PRE_RELEASE_ECOSYSTEM_AUDIT.md)
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
| **GL-INT-02** | GL/FAN | `src/lib/companion-response.js`, FAN `src/shared.js` | P1 | Batch 2 | **Resolved** | Audit misidentified an output provenance allowlist as a query filter. GL never excluded console records; it lost their granular source labels. Preserve those labels and fix FAN's separate response validator, which rejected console providers. See Batch 2 below. |
| **GL-UI-01** | GL | `src/importers/nintendo/*`, `providers-view.js` | P2 | Batch 2/3 | Deferred | Live card count progress streaming; decluttering disabled Quick Update. |
| **ECO-TXT-01** | All | Options action buttons & web overlays | P2 | Batch 2 | Deferred | Ecosystem-wide terminology harmonization ("Quick Update" vs "Import new purchases"). |
| **GL-UI-02** | GL | `options.html`, `sync-health.js`, `options.js` | P2 | Batch 2 | Deferred | Removing developer jargon & formatting raw JSON dumps. |
| **ECO-UI-01** | HB/FAN | `options.js` full rescan confirmation | P2 | Batch 3 | Deferred | Replacing native `window.confirm()` with styled modal dialogs. |
| **ECO-MET-01** | All | `manifest.json`, `package.json` | P2 | Release | Deferred | Version synchronization to 1.0.0 deferred to final release validation. |
| **GL-UI-03** | GL | `ui.css` provider card action buttons | P2 | Batch 2 | Deferred | Responsive flex-wrapping for viewports < 850px. |
| **ECO-INT-02** | GL/HB/FAN | Companion query validation and final classification | P2 | Batch 2 | **Resolved** | No catalog-only false Owned reproduced. Added actual GL-to-HB/FAN query/consumer coverage; fixed FAN rejection of returned/revoked/expired access states while preserving non-owned identity recognition. |

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


## Batch 2: Companion integration and ownership integrity (2026-10-16)

### Findings and corrective action

**GL-INT-02 was partly a false-positive audit finding.** The actual file is `src/lib/companion-response.js`, not `src/companion/companion-response.js`. Its `SOURCES` set sanitizes output evidence only. It never validates requests or removes matches. Before this fix, all three console providers participated in default GL queries and canonical provider exclusions; their importer source labels fell back to `nintendo`, `playstation`, or `xbox`. The bounded correction adds the three registered importer labels, with a regression checking all registered provider sources and safe fallback for arbitrary source text. Raw IDs, URLs, accounts and platform arrays remain private.

**A real consumer defect was found in FAN.** `queryGalacticItems()` accepted only the older eleven providers, rejecting an entire per-item result when any match used Nintendo, PlayStation or Xbox. This affects default lookups as well as filtered queries that retain console matches. FAN's storefront consequently had no validated result and reported an incomplete check rather than Owned elsewhere. The same validator also omitted existing `returned`, `revoked`, and `expired` states for every provider. It now accepts the existing fourteen providers and nine GL ownership states, without accepting arbitrary values or changing the resolver's ownership conditions. This is a false-negative/compatibility fix, not a relaxation of identity or ownership.

**ECO-INT-02's suspected catalog-to-Owned promotion was not reproduced.** GL can return an exact identity with unknown, temporary or former access; `result.owned` remains false. HB and FAN additionally require permanent effective access and compatible identity before displaying Owned elsewhere. No HB production change was necessary. FAN's fix lets these legitimate non-owned results reach its existing Possible classification rather than failing validation.

### Verified path and contract

| Stage | Verified behavior |
| --- | --- |
| Nintendo capture | Account/owner relation and released-application evidence distinguish owned, borrowed and unknown. Source is `nintendo-virtual-game-cards`. |
| PlayStation capture | Active non-membership purchases can be owned; membership access is subscription; trials/uncertain access remain unknown. Source is `playstation-web-purchased-library`. Platform/product identifiers remain distinct in saved provider observations. |
| Xbox capture | The account-scoped reconciled Owned catalog requires personal ownership flag 1; subscription/access-only caches are refused. Source is `xbox-web-library`. Synthetic unknown/access cases test older/restored observations or user corrections, not a newly accepted import path. |
| Normalization and storage | `normalizeProviderItem()` validates provider/access state and preserves source metadata. Account namespaces keep observations separate; canonical identity membership does not transfer ownership. |
| GL API | Synchronous and asynchronous `MATCH_ITEMS` use effective ownership, existing identity/conflict rules and the same bounded response projection. Current records from all saved accounts participate; account names/IDs are not exported. |
| Filtering | API v1 supports per-item `excludeProviders` using canonical provider IDs. Exclusions apply before matching/ownership/contents, across accounts. Importer labels and unknown strings exclude nothing. Malformed exclusion arrays are rejected. |
| Unsupported inclusion filters | No `sources` inclusion filter exists. Unknown additive request fields are ignored under the existing protocol; a caller must not interpret one as a successful filter. Neither HB nor FAN sends it. Their actual requests exclude `humble` and `fanatical`, respectively. |
| Consumer outcomes | Confirmed compatible console records become HB `elsewhere` / FAN `owned-elsewhere`. Unknown, subscription, borrowed, returned, revoked and expired exact identities stay Possible. Edition/software-year conflicts stay Possible; reviewed incomplete contents stay Partial. |
| Mixed sources | An unknown Xbox observation plus owned Steam evidence can establish Owned. Excluding Xbox retains Steam ownership; excluding Steam leaves an exact unknown Xbox identity without ownership. |
| Manual corrections | An account-bound Nintendo correction to Owned survives a subsequent ambiguous full import, a failed scan, and backup/restore. Original observed ownership remains unknown. |
| Catalog and wishlist | A canonical-only identity without provider observations cannot establish Owned. GL has no persisted `wishlist` ownership state and rejects it; HB/FAN wishlists are separate from purchase inputs. Installed FAN checks verify that an actual wishlist-only title remains New. |

### Tests and demonstrated failure

- GL adds **32** regression cases in `tests/console-companion.js`, integrated into `tests/run.js` and independently runnable with `node tests/console-companion.test.mjs`. These feed shipped Nintendo/PlayStation/Xbox capture projections through normalization and the real GL API, then use HB's actual query/render merge path and FAN's request builder, response validator and resolver. Both adjacent companion checkouts were present in this run. Like existing parity tests, consumer checks are conditional on adjacent checkouts being available; GL-only distribution does not gain a runtime dependency on them.
- The initial 30-case fixture run against original code failed **27 cases**: three source-label assertions and the FAN consumer cases. The final 32 cases pass. The additional cases protect source-registry consistency/redaction and reviewed Partial coverage.
- FAN adds **34** tests in `tests/console-companion.test.mjs`: provider/access combinations including negative access on an older provider, fail-closed malformed values, and actual adjacent-GL response validation/classification. Wire fixtures deliberately also accept the older canonical-provider source fallback.
- Full regression results: **GL 1,259/1,259**, **HB 539/539**, **FAN 579/579**. GL and FAN suites and both Chrome/Firefox package checks passed from disposable checkouts without ignored/private inputs.
- Packaged Chrome (`FAN tests/runtime-check.mjs --central`) and packaged Firefox (`GL tests/firefox.mjs --companions`) passed with disposable profiles. New checks exercise real cross-extension messages, the GL worker, console source projection, FAN's validator/resolver, unknown/subscription/returned access, wishlist-only data and provider exclusion. HB's final storefront merge is exercised by the synthetic shipped-code harness; native tests verify its actual message response. Existing authorization/revocation, software, Partial, manual-policy and backup checks also passed.
- Firefox's existing HB connection UI test raced initial Options rendering, which overwrote its result. The runner now waits for the initial ready message before clicking and includes the actual status on failure. No HB production behavior changed.
- Repository layout checking still reports pre-existing absolute `file:///` links in the unchanged historical ecosystem audit. Its original content is preserved as requested; this ledger's own audit link is now relative.

### Compatibility, limits and manual acceptance

No importer, scan UI, authorization, identity rule, ownership policy, schema, synchronization protocol, manifest or version changed. Older HB remains compatible. Older GL's provider-label fallback remains accepted by FAN; older FAN must be updated to consume console matches reliably. Existing explicit user ownership assumptions remain policy decisions, separate from raw access evidence.

API v1 has no platform discriminator or console-license compatibility guarantee: title identity/Owned elsewhere is not proof of a PC entitlement. This pre-existing limitation was documented, not silently replaced with a new platform policy. Saved console platform/product distinctions and existing edition/version safeguards remain intact. No real account access or live storefront validation was performed in this batch.

Optional final real-world acceptance: load the updated GL and FAN; refresh one known owned console title and one unknown/subscription title in each paired companion. Expect Owned elsewhere for the compatible owned title and Possible for uncertain/temporary access. Confirm a wishlist-only title remains New. No new scan or library edits are required. Provider filtering and negative access are covered synthetically without modifying personal data.

**Final status:** GL-INT-02 and ECO-INT-02 resolved within this batch. Other ledger findings remain deferred. No Nintendo UX or visual-consistency work was started.

Implementation commits: GL `b4d755a`; FAN `37fe2f1`. HB remains unchanged at `ce835c0`. The ledger update is committed separately.
