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
| **GL-PERF-01** | GL | Shared provider scan preparation/commit | P1 | Performance | **Resolved (bounded fix)** | First batch verified live at 27–28 s versus 76.5 s. Follow-up removes final full validation/write for eligible empty quick checks using exact-base receipts; synthetic Chrome and recovery verified. Follow-up live timing remains pending. |
| **GL-PERF-02** | GL | Steam/Epic reconciliation summaries | P2 | Performance | **Resolved** | Report actual game/add-on additions/updates; distinguish retry candidates and uniquely counted unresolved IDs; retain incomplete-scan warnings. |

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


## Performance batch (2026-10-16)

The fresh Steam export (`GL-timing-export (5).json`, October 16 13:13:27 local) captures **29.717 s preparation**, a **2.778 s capture/transport gap**, and **44.040 s commit**, totaling **76.535 s** from preparation entry to commit return. It contains no Steam page trace or record count, so the gap is not claimed as network-only time. Preparation reads/validates the database and rewrites it to announce scanning; commit reads/validates twice before its final validation/save. Options snapshot validation overlaps the commit. Storage-set wall time includes snapshot publication, not just disk/native storage. These measured intervals do not indicate a fixed 30-second timer; Steam's only inter-batch pause is 500 ms. Old diagnostics cannot split executing validation work from yield suspension.

The fix generalizes the existing exact immutable-committed-value proof to provider scan reads. Every mutable scan read still reads authoritative storage; only exact equality permits validation reuse. Cold/different values validate, and the final atomic save still validates. Commit reuses its checked working database inside private reconciliation helpers. Existing-account incremental starts write only the scan lease; new accounts, switching and full scans retain their required start bookkeeping. The Providers view derives running/cancellable status from leases without changing committed records. Empty incremental input avoids the separate explicit canonical rebuild. Failure, cancellation, stale tokens, profile isolation, manual corrections, ownership revocation, metadata and add-on links remain protected.

Two synthetic runs per size (100, 1,000, 5,000, 10,000 and 20,000 records) cover first/warm quick checks, incremental changes, unchanged/changed full scans and failures. Warm quick-check totals at 10,000 records drop from **4.189 s to 1.231 s**; at 20,000, **8.748 s to 3.022 s**. Full unchanged scans at 10,000 drop from **4.372 s to 2.053 s**. Synthetic scan/network time is deliberately zero. Quick checks drop from **three DB reads/two DB writes to two reads/one write**, roughly halving serialized database bytes in the adapter. Full scans keep both required writes but eliminate one read. These fixtures omit much personal captured-source cost and do not establish the real-library post-fix duration.

Packaged Chrome with actual worker/local storage, 10,000 synthetic records and three consecutive quick checks shows mean worker preparation **2.899 s ? 0.372 s**, commit **4.130 s ? 2.260 s**. The optimized warm preparation has no validation pass or full database write; commit has one validation instead of three. This uses privileged storage-client calls, not a live provider sender; its larger database response transport is reported separately. First requests follow seeding and are not cold worker restarts. Reproduction tools and limitations are documented in [Provider pipeline profiling](../development/provider-performance.md); generated measurements/report stay ignored under `audit-artifacts/provider-performance/`.

Steam's ?159 new apps? was a candidate-ID count: owned-list IDs absent from saved GL provider/account records, including unresolved/unsupported retries. Successful records cease being candidates; no speculative blacklist/backoff was added. A demonstrated malformed-batch path collected missing IDs and then appended the whole batch on failure, double-counting unresolved IDs. A per-ID map fixes that count. The export cannot identify the exact server response or individual IDs behind the user's 302, so that particular cause remains unproven. Steam/Epic now reuse reconciliation for added/updated games and add-ons, retain totals/unresolved/unsupported/parent-link warnings, say Imported for initial imports, and label request failures incomplete. Timestamp-only changes do not count as product updates. No historical resolved-from-unresolved count is invented when previous retry history was not stored.

Detailed Steam/Epic phase profiling is page-local opt-in (`GalacticSync.setProfiling(true)` in the extension's isolated console), off by default, and joins the existing bounded Settings export. It measures dispatch/profile preparation, capture, commit, next-frame UI completion, read/normalized/written counts and validation slice execution versus cooperative wait. No per-item logging, credential/account/title capture, extra provider requests or persistent diagnostics setting was added. Permissions, host patterns and extension versions are unchanged; the manifest only injects the already existing timing helper on Steam/Epic. Optional summary fields remain backward compatible, with the validation-certificate algorithm tag invalidated appropriately.

One whole-database save remains for successful-scan metadata and observations with the current atomic format. Removing it, splitting persistence or eliminating cold source-heavy validation requires separate design review. No checkpoint/persistence architecture rewrite or Nintendo-specific UX work was attempted. Live manual acceptance is two unchanged Steam quick updates and two Epic syncs, then an immediate detailed export, with Options-open/closed conditions stated. HB/FAN source and data remain unchanged.


Validation: **1,268/1,268 GL tests**, **472/472 contents tests**, and **91 packaged importer/UI checks in each of Chrome and Firefox**, plus both package validators. Focused tests cover lease-only starts/status/cancellation, no-change read/write counts, exact-proof invalidation, full/incremental changes, stale/failed scans, account scope, ownership corrections/revocation, add-ons, unique Steam retries and private timing output. Source/test/package checks used disposable checkouts without ignored/private inputs; the native Chrome benchmark used disposable extension profiles. HB/FAN were not changed or rescanned. Repository hygiene still flags only the previously documented absolute links in the unchanged historical audit.

Functional implementation: `0e03ecc`. Benchmark tools, the profiling guide and this performance ledger are committed separately. Live personal-library speed acceptance remains pending; synthetic browser improvements must not be advertised as the user's measured post-fix result.

## Empty quick-update persistence follow-up (2026-10-16)

Live acceptance of the previous batch is now established: `GL-timing-export (6).json` shows Steam quick updates at **28.232 s and 27.338 s**, versus 76.534 s previously. The latter contains 3.571 s preparation, 1.422 s capture/transport, and 22.345 s commit. One read (~2.2 s), final validation (~5.3 s) and full-value storage/snapshot/certificate work (~13.7 s) remain in commit. These are wall times; storage-set is not physical disk time.

The follow-up implements the bounded design in [Empty provider checks](../architecture/empty-provider-checks.md). An existing active Steam/Epic profile with a full baseline, an empty successful incremental result and no coverage limitation can persist only check bookkeeping. A closed patch carries last successful check/quick time, source/mode, cleared error and zero-difference successful sync health. It cannot patch catalog entries, observations, ownership or counts. The receipt is anchored to the strict SHA-256 digest of the exact validated database and immutable account ID. Incoming records, account switches/new accounts, full scans and incomplete scans retain their original full validation and save. Epic's normal full-list import and Kobo's observation-carrying shortcut are unchanged.

Three small writes per complete empty operation (lease, receipt, cleanup; approximately 1.2 KB serialized in the synthetic adapter) replace a lease plus whole-library save. Both authoritative database reads remain. Warm empty checks perform **zero final validations, zero database writes, zero database bytes written**, and retain the identical committed catalog/index base. First/cold receipt creation may serialize/hash; a restart without reusable proof still validates once during preparation. This is not a general skip-validation switch.

Packaged Chrome with actual worker/local storage, disposable synthetic profiles, source/network time excluded:

| Records | Repeated warm worker before | After | Restart/no proof before | After |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.202 s | 0.046 s | 0.279 s | 0.118 s |
| 5,000 | 0.976 s | 0.243 s | 1.186 s | 0.717 s |
| 10,000 | 1.784 s | 0.429 s | 2.575 s | 1.300 s |
| 20,000 | 3.850 s | 0.975 s | 4.567 s | 2.343 s |

Warm values average the second and third checks. First receipt results, client transport, full/change/incomplete/failure paths, serialized bytes and adapter matrices are retained in ignored `audit-artifacts/provider-performance/empty-check-report.md` and raw outputs. Ordinary record/full saves show no demonstrated systematic speed improvement and retain their expected write counts. Late 20k incomplete/failure samples overlapped other local validation work; do not infer a save regression from those single wall-time samples. The final base-change guard is independently regression-tested. No personal-library follow-up speed is claimed.

Receipt acknowledgement precedes independent lease cleanup. A crash after receipt commit still establishes completion and rejects replay, failure and cancellation; a missing receipt does not certify success. Mismatched/malformed receipts cannot override data. Ordinary saves flatten valid metadata first, then retire receipts only after the database commit; failed retirement leaves a harmless mismatched anchor. Restore/clear retire receipts before replacement to prevent revival on identical-old-backup restore. A crash in that last interval may conservatively lose check-only freshness, retaining the catalog. No atomicity across independent writes is assumed.

Authoritative reads, Options/Providers and profile lookups project valid receipts; ordinary backup export flattens them into the unchanged database/backup format. Companion queries keep their original catalog identity, ownership and observation evidence. One bounded private storage key is added, using protected Chrome storage or Firefox's existing private IndexedDB; no schema migration, permissions, manifest versions, companion protocol or ownership/matching changes. Older GL ignores the key and may show older check freshness; flatten a backup before downgrade if that matters. Raw provider records, manual corrections and HB/FAN are untouched.

Validation from disposable source copies without private inputs: **1,277 GL tests**, **472 contents tests**, **92 packaged importer checks per browser**, **67 standard packaged UI checks per browser**, installed Firefox private-storage/receipt/backup checks, and both 190-file package validators. Eighteen focused pipeline cases include torn acknowledgement/cleanup, failed post-save retirement, interrupted restore, stale bases/leases, multiple accounts/providers, source/access changes, full-scan omissions, manual corrections, immutable query reuse and backup round-trips. A Firefox UI fixture timing race passed when rerun alone. Repository layout still flags only existing absolute links in the unchanged historical ecosystem audit.

Manual acceptance: reload updated GL, run two unchanged Steam quick checks, and export timing promptly. Confirm fresh Providers success time, zero additions/updates and no database storage-set/final validation during the empty commit. First-run cold validation/hash and retained authoritative reads remain expected; network, UI rendering and actual observation saves are separate costs. Further record-level persistence or retry-policy changes remain deferred.
