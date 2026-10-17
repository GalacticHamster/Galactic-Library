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
| **GL-PERF-03** | GL | Steam outcomes and shared unchanged-scan persistence | P1 | Performance follow-up | **Implemented; live diagnosis pending** | Isolate malformed Steam rows, reject missing application types, export opt-in aggregate outcomes, and persist eligible unchanged partial/failed checks without rewriting the catalog. Historical 159-ID causes require a new detailed trace. |
| **GL-PERF-04** | GL | Cold provider preparation | P1 | Cold-start follow-up | **Resolved; live verified** | Export 9 verifies new-worker certificate reuse, zero validations/DB writes and a 10.025 s captured GL interval versus 28.690 s. Authoritative reads and real-save checks remain. |
| **GL-STEAM-01** | GL | Unresolved Steam metadata | P1 | Steam metadata follow-up | **Placeholder diagnostics complete; wider metadata recovery deferred** | Export 10 and six explicitly shared public checks establish unavailable app placeholders in the sample. Version 3 separates correlated failures from rows with no identifiable requested ID; retains unknown result codes. Steam now offers one-scan profiling and the existing Settings export through UI. Samples remain a separate opt-in/export. No fallback, ownership inference or retry suppression added. |
| **GL-PERF-05** | GL | Cross-provider complete-snapshot persistence | P1 | Shared parity follow-up | **Shared lease-only starts implemented; completion design remains open** | All 14 providers / 26 modes checked. Eligible full scans now use zero catalog writes at admission and one validated completion save. Record/origin freshness redesign remains deferred. [Parity matrix and measurements](../architecture/provider-sync-parity.md). |

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

## Steam unresolved IDs and shared incomplete-scan follow-up (2026-10-16)

The next export, `GL-timing-export (7).json`, explains why the successful-empty optimization did not apply: the user's Steam operation was **incomplete**, with 159 candidates, 159 unresolved and no additions or updates. Its **27.683 s** consists of **3.462 s preparation, 1.828 s capture/transport and 22.392 s commit**. The commit still included 5.456 s validation and 13.584 s whole-value storage/publication. The export did not retain response statuses or per-outcome counts, so the causes of those historical 159 IDs remain unknown. They are deduplicated owned-list IDs absent from the selected account's saved records, not 159 confirmed new purchases. Successfully saved IDs stop recurring; unsupported and unresolved IDs remain candidates. The eight already-saved DLC without parents are separate: a missing parent does not prevent otherwise valid DLC from being saved.

Two importer defects are demonstrated offline against the baseline and corrected source: one malformed title row discarded valid neighbors in its batch, and null/empty application types could coerce to game type zero. Rows now classify independently, valid neighbors survive, conflicting duplicate rows stay unresolved, and missing types cannot establish ownership. A valid-game/valid-DLC/malformed-type fixture changes from zero captured and three unresolved to two captured and one unresolved. These mechanisms are proven, but neither is proven to explain the real 159. HTTP 401/403 indicate denied access, not necessarily an expired session. No unsupported-ID blacklist, speculative retry suppression or authentication change was added.

Existing opt-in profiling now exports a bounded, privacy-safe partition of attempted IDs, actual HTTP status groups, unsupported types, the first safe concrete failure, and acknowledged saved/rejected counts. No App IDs, titles, account identities, credentials, raw responses or arbitrary error strings enter these aggregates. Detailed collection remains off by default, within the existing 50-trace worker-local FIFO. See [Steam outcome diagnostics](../development/steam-outcome-diagnostics.md).

Persistence eligibility is now shared across providers: an existing active account with a full baseline, authoritative exact-base proof, current lease/token/account, supported metadata, unchanged cursor, and exact equality of every normalized incoming record field may write a small status receipt. Fresh observation/access evidence, new or switched accounts, full successful scans and cursor/catalog changes retain normal validation and saves. Kobo preserves its existing unchanged sparse representation during normalization and uses this same comparison; its persistence exception is removed. Console capture/account guards remain intact. Eligible failures and cancellations can also persist terminal health without changing the catalog.

Incomplete/failed/cancelled receipts update only current sync health. They retain the newest successful baseline even when that baseline exists only in an earlier receipt; they do not advance successful timestamps, certify ownership, infer removals or suppress retries. A committed terminal receipt consumes its attempt despite lost acknowledgement or cleanup failure. Exact-base/account guards reject stale receipts. Normal mutations flatten valid receipt metadata before validated saves, then retire receipts. Restore/clear retire receipts first; an interruption can conservatively lose check-only freshness, never fabricate ownership. This reuses the existing private receipt key and backup format without a schema, validator/certificate version, permission, API or extension-version change. Older code may ignore the newer receipt variants; flatten a backup before downgrade if check freshness matters.

Packaged Chrome measurements use disposable synthetic libraries and exclude provider/network time. Worker preparation plus completion, in seconds:

| Records | Repeated incomplete before | After | Repeated failed before | After | Incomplete restart/no-proof before | After |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.175 | 0.050 | 0.245 | 0.047 | 0.306 | 0.123 |
| 5,000 | 1.327 | 0.227 | 1.509 | 0.221 | 2.136 | 0.555 |
| 10,000 | 1.807 | 0.475 | 2.070 | 0.453 | 2.517 | 1.190 |
| 20,000 | 3.627 | 0.876 | 4.110 | 0.880 | 4.616 | 2.203 |

Warm unchanged incomplete operations retain two authoritative DB reads but reduce one validation/one full DB write to **zero validations, zero DB writes and three small metadata mutations**. Failed operations previously validated twice; now they follow the same bounded receipt path. Cold/no-proof preparation still validates once. Real incremental changes retain one DB write; successful full scans retain start and commit writes. Raw operation counts, stage timings, full/change controls and the generated report remain ignored under `audit-artifacts/provider-performance/`. These synthetic results do not establish real-library latency.

Validation from disposable checkouts without private inputs: **1,304 GL tests**, **472 contents tests**, **95 packaged importer checks per browser**, **67 standard packaged UI checks per browser**, installed Firefox private-storage receipt/baseline/backup checks, and both 190-file package validators passed. The 45 focused pipeline cases cover Steam outcomes, shared provider eligibility, account isolation, changed cursors/access, partial-success baselines, stale attempts, interrupted writes, restart, backup/restore and companion ownership. HB/FAN source and data remain unchanged.

Repository layout checking still reports only the existing absolute `file:///` links in the unchanged historical ecosystem audit; new documentation links pass.

Live follow-up remains necessary: reload GL, enable the existing isolated-script profiling, run two Steam quick updates, then promptly export from Settings Performance diagnostics. Inspect aggregate outcomes/statuses and save acknowledgement separately. An unchanged incomplete result should stay incomplete, retain the previous successful time, and avoid the commit's DB write/final validation. If the corrected parser recovers real records, that run correctly uses the normal save; test a later unchanged attempt. No personal-library speed or historical HTTP diagnosis is claimed.

## Cold provider preparation follow-up (2026-10-16)

Live export 8 confirms the status-receipt fix worked: finishing took **3.357 s**, with no full validation or database write. The **28.754 s** operation instead began in a new worker and spent **24.259 s preparing**, including **15.438 s semantic validation** (10.588 s executing slices and 4.842 s around 995 yields), 2.425 s authoritative read and 2.734 s receipt digest. These nested measurements must not be added twice. Both Steam title requests returned HTTP 200: 16 candidates had explicit unsupported types and 143 lacked usable metadata. The latter combines absent rows and unusable title metadata; their underlying causes remain separate from this performance task. No Steam acquisition change is made here.

The cold provider reader had no in-memory snapshot and never consulted the existing query certificate. Shared `readDatabase(true)` now verifies that same protected session descriptor and SHA-256 of the entire authoritative value. Current schema, serialization and validator versions must match. This is an exact-value proof with protected internal provenance, not a trusted revision flag or a self-authenticating hash supplied by an import. There is no TTL; session loss/reload/update loses the optimization. Ordinary mutable reads retain semantic validation, and incoming records/final data-changing saves are never certified by old proof.

On a hit, publish a detached immutable snapshot and return the independent mutable storage result. Seed the snapshot's receipt-digest cache with the verified hash instead of hashing or issuing the same proof again. Missing, malformed, older-version, unavailable, corrupt or mismatched certificates fall back to validation/migration. Observed epoch changes during verification or fallback validation retry the authoritative read. Account switching, lease/token/tab checks, successful baselines, full-scan absence/history, ownership and real saves remain intact. No new cache system, storage key, schema, version, permission, companion API or worker keepalive is introduced.

Closed certificate fallback reasons and read/hash/snapshot stages are included in existing bounded diagnostics without values or digests. Full details and acceptance instructions are maintained in [the certificate architecture](../architecture/query-validation-certificate.md) and [provider profiling guide](../development/provider-performance.md). Generated benchmark output stays ignored under `audit-artifacts/provider-performance/`.

Packaged Chrome, disposable native storage, worker preparation plus completion in seconds:

| Records | Warm after query seeding, after | Cold valid proof, before | Cold valid proof, after | Cold missing proof, after | Cold mismatched proof, after | Cold incomplete, after |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.054 | 0.108 | 0.062 | 0.116 | 0.123 | 0.084 |
| 5,000 | 0.272 | 0.528 | 0.281 | 0.530 | 0.600 | 0.276 |
| 10,000 | 0.538 | 1.083 | 0.537 | 1.079 | 1.326 | 0.549 |
| 20,000 | 1.098 | 2.134 | 1.093 | 2.122 | 2.371 | 1.145 |

Each cold case actually stops the disposable worker, waits for its target to disappear and asserts a new worker ID. Valid-proof preparation falls from 0.075/0.369/0.748/1.470 s to 0.038/0.173/0.314/0.648 s at these sizes. It performs zero semantic validations and reuses the verified digest; missing/mismatched controls validate once. Unchanged/incomplete operations retain two authoritative DB reads, zero DB writes and three small metadata mutations. Real additions retain one final semantic validation and DB write. At 20k, eligible preparation contains 354.8 ms native read, 205.8 ms certificate verification (including 170.5 ms strict serialization and 34.6 ms hash), and 83.5 ms snapshot clone/freeze. These nested stages must not be added twice. Network/capture is synthetic zero; privileged-client full-database transport/wakeup is reported separately. Warm means query-warmed before its first quick check, not a fully primed repeated-check benchmark. Single samples, lean synthetic records and ordinary scheduling noise cannot establish the personal-library duration.

Validation from the disposable checkout without private audit inputs: **1,317 GL tests**, **472 contents tests**, **97 packaged importer checks per browser**, **67 standard packaged UI checks per browser**, installed Firefox private-storage/recovery/backup checks, and both 190-file package validators passed. Thirteen new cold-read cases supplement existing proof, provider, receipt, companion and contents regressions. Native Firefox verifies a new independent writer against actual private IndexedDB/session proof; forced worker restart is demonstrated in Chrome. Its new test initially rejected Marionette's foreign-realm IDB objects correctly; recreating the known JSON fixture in the module realm fixed the test without weakening production serialization. Repository layout retains only the known absolute links in the unchanged historical ecosystem audit.

Live acceptance remains pending: after loading GL, run a profiled quick update to establish current proof, then allow at least 60 seconds without GL/companion activity. Run again and export promptly. Require a changed worker ID, `certificate_hit` and no `read_validation` during preparation; unchanged incomplete completion must still avoid final validation/DB persistence and retain successful times. Compare a prompt warm repeat separately. The first run after extension reload/update or browser-session loss may legitimately validate. Remaining storage acquisition/deserialization, serialization/hash, snapshots, source work and real saves are not removed; no guaranteed real-library target is claimed. HB/FAN, real libraries, backups, ownership rules and Steam acquisition remain unchanged.

## Steam unresolved-metadata investigation (2026-10-16)

Live export 9 subsequently confirms the cold-start fix: a new worker accepts the retained session certificate, performs zero semantic validations and zero DB writes, and completes the comparable GL-side interval in **10.025 s versus 28.690 s** previously. Its 5.643 s preparation includes a 2.382 s DB read, 2.263 s certificate verification and 0.970 s snapshot setup. The independent 3.242 s completion retains the status receipt. No detailed provider traces were enabled, so this export cannot subdivide the previous **143 missing / 16 unsupported** candidates. The older 28.754 s page-trace boundary includes additional sender/UI time and is not identical to the journal interval.

The new Steam instrumentation partitions missing metadata into absent requested IDs, missing/empty names, malformed names, invalid types and conflicting duplicate evidence. Supported games/DLC, unsupported types, HTTP/access-denied/network/malformed-response and other interpretation failures remain distinct. At most 32 numeric request summaries expose requested/returned/matched/absent/extra/malformed/duplicate counts without IDs or response bodies. Save acknowledgement remains a separate axis, never another additive acquisition category. Legacy trace shapes remain accepted; current acquisition declares outcome version 2.

A general importer defect is demonstrated with a synthetic response: owned decimal ID `0001` and returned numeric ID `1` previously produced zero records and one unresolved result, and an already-saved equivalent could remain a candidate. A shared positive uint32 App-ID representation now aligns owned/requested/returned/known IDs and DLC parents. Invalid or lossy IDs cannot establish ownership. Existing saved IDs are not rewritten. Equivalent duplicates deduplicate; genuinely conflicting title/type/parent evidence remains unresolved. This fixture does not identify the actual historical 143 IDs.

The Steam panel now separates successful owned-list retrieval, imported changes, omitted IDs, missing/invalid names/types, unsupported catalog types and real request failures. Incomplete remains incomplete, with earlier records retained. Under **Steam diagnostics**, an optional unchecked sample control retains only the lowest 20 unresolved/unsupported IDs per category in page memory. A separate **Export sampled App IDs** click downloads a local JSON file with IDs/outcomes/type/name-presence only. The privacy explanation warns that IDs can reveal library information; no titles, credentials, accounts or raw responses are included. Samples never enter ordinary timing exports, GL storage or backups, and clear on a new attempt, disabling or reload.

No new authenticated provider requests or private-ID public lookups were made. Public Valve documentation was reviewed for fallback design: current owned-list fields provide IDs, the deprecated public app list is unsuitable as a name-only fallback, and documented Store/OwnedGames alternatives require keys or additional contracts. Same-origin public store details may be evaluated against a small explicitly shared sample, including type mapping, removed-item coverage, CORS and bounded request policy; no fallback is activated here. Current batching, source context, ownership provenance, retries, permissions and versions remain unchanged. No blacklist, storage architecture or HB/FAN changes. Full category definitions, evidence limits and next live export instructions are in [Steam diagnostics](../development/steam-outcome-diagnostics.md).

Another offline edge case exposed raw malformed-name serialization in duplicate comparison: a deeply nested non-string name left one valid item captured but reported both IDs unresolved and one failed request. Comparison now uses interpreted fields only; unexpected parser faults are isolated per ID, with no HTTP-failure claim or raw error export. The same fixture now gives one captured, one invalid-title result and zero failed requests. The historical trace had no such failures, so this is not assigned as the cause of its 143.

Validation from a disposable checkout without private inputs: **1,330 GL tests**, **472 contents tests**, **98 packaged importer checks per browser**, **67 standard packaged UI checks per browser**, installed Firefox recovery/private-storage/backup/cold-proof checks, and both 190-file package validators passed. The 71 focused pipeline cases include 28 Steam outcome/sample cases and retained shared receipt/cold-proof safeguards. Sample download, privacy explanation, default-off state, disabling/clearing, no accidental scan from export, and unchanged ownership are exercised in both packaged browsers. Missing metadata still produces an eligible status-only partial result without full persistence. Layout checking retains only the known historical absolute-link findings.

Stop at the remaining evidence boundary: reload GL and Steam, enable the existing isolated-console profiling, run Quick update and promptly export timing. The new outcome version and numeric request summaries establish omitted versus returned-but-unusable metadata. If the user chooses to share representative IDs, separately enable the panel's sample control and explicitly download the sample after that update. No specific identity, permanent classification, retry throttle or metadata fallback is inferred before this evidence arrives.

## Steam placeholder diagnostics and UI profiling follow-up (2026-10-16)

The preceding console-based instructions are superseded by the UI workflow in
[Steam diagnostics](../development/steam-outcome-diagnostics.md). Export 10
completed in 9.928 seconds with 159 candidates, 143 unmatched app IDs and 143
unidentifiable rows, 16 unsupported types and zero request failures. Six
explicitly shared unresolved IDs returned app failure placeholders in public
checks. This does not prove every remaining row's failure code or visibility.

Outcome version 3 correlates only requested canonical IDs in explicit app
failure rows without a valid appid. It separates unavailable metadata from no
identifiable response row, leaves conflicting duplicates unresolved and never
imports placeholders. Request counts distinguish matching rows, placeholder
rows, malformed/extra rows, conflicts and omissions; only per-ID outcomes form
an additive attempted-ID partition. Result-code buckets (32 maximum) retain
unknown codes without translating result 15. Visibility is counted separately.
Opt-in sample format 2 adds only result code/visibility for unavailable entries;
ordinary timing exports still contain no App IDs or titles.

Steam diagnostics now exposes **Profile the next Quick Update**, with armed,
running and captured/delivery-failure feedback and a link to Settings export.
It requests one trace from the existing shared profiler, not a persisted toggle
or a cross-context command. Only that tab's Quick Update consumes it; failures
and cancellation disarm it, Full rescan leaves it armed, and page reload clears
it. Other tabs/providers and stale messages cannot enable it. Collector loss
on worker restart remains visible as a retention limitation, not a keepalive.
Settings help describes the control. No metadata fallback, retry suppression,
new permissions, versions, ownership rules or storage changes are introduced.

Validation from a disposable checkout without private audit inputs: **1,345 GL
tests**, **472 contents tests**, **102 packaged importer checks per browser**,
**67 standard packaged UI checks per browser**, installed Firefox private
storage/recovery/backup checks, and both 190-file package validators passed.
The 43 focused Steam/profiling cases include the synthetic 159-ID accounting,
namespace/conflict/unknown-code negatives, bounded redaction and independent
page contexts. Packaged UI exercises arming/cancellation, one-shot capture,
existing export, Full rescan exclusion, failures, collector replacement,
lost delivery and reload. Cold-proof and status-only incomplete receipts still
avoid semantic validation and full catalog writes where eligible. Browser
fixtures use synthetic provider responses, not a personal signed-in library;
live version-3 classification remains the next acceptance run. Layout checking
retains only known absolute links in the unchanged historical ecosystem audit.

## Cross-provider persistence audit gate (2026-10-16)

GL-PERF-05 remains open for implementation. The pre-implementation audit covers
all 14 store providers and 26 exposed store modes, plus Humble/Fanatical saved
purchase sync/manual import. An offline synthetic probe reproduces 88 baseline
writer cases and two real semantic constraints: additive console scans retain
unobserved records with older dates, and Fanatical retains unobserved purchase
origins even when their product is reobserved. A provider-wide timestamp would
falsely refresh those observations. Existing receipt overlays do not update
companion query `checkedAt`, record evidence, review guards or record images in
backups/history; merely extending the successful status predicate is unsafe.

The task's explicit freshness-model stop condition was reached before runtime
implementation. The tracked matrix proposes shared lease-only full starts,
then a versioned observation extension to the existing receipts with one
materialization/recovery contract for all readers. No new backend or schema
migration is assumed, and no Epic-only shortcut was applied. Current full scans
still perform two DB writes; most nonempty quick reobservations still perform
one. Empty eligible checks and Kobo's unchanged sparse quick updates retain
their existing zero-write paths. Unchanged purchase imports skip writes but
their ordinary writer read can still validate; this is separately documented.

Baseline verification from a disposable checkout without private inputs passed
1,345 GL tests, 472 contents tests, 102 packaged importer checks and 67 packaged
UI checks per browser, installed Firefox storage/recovery/backup/cold-proof
tests and both 190-file package validators. The probe also runs independently
without private artifacts. This does not claim the deferred 22-scenario
post-implementation matrix or 1k/5k/10k/14k/20k before/after benchmarks passed.
The layout checker retains only known historical absolute-link findings.

## Shared lease-only full starts (2026-10-17)

GL-PERF-05's first bounded improvement is implemented in shared storage, across
all 14 providers and 26 exposed modes. Existing active/bound profiles with a valid
baseline and exact committed proof announce Running through a durable lease.
Eligible full admission now makes zero catalog writes/validations, followed by
the existing one validated completion save (previously two total). First imports,
switches and binding changes retain validated starts. A full lease pins its raw
catalog base; intervening catalog edits reject the result rather than overwrite
newer data. Independent status receipts remain compatible. Record/origin dates,
absence/history, additive consoles and successful quick receipts are unchanged.

Packaged Chrome synthetic measurements at 1k/5k/10k/14k/20k verify the removed
start write in warm and truly restarted workers. At 14k, worker admission changed
from 1,953 to 462 ms warm and 2,089 to 481 ms cold; completion stayed near 2.5 s.
These are single samples with lean fixtures, not live Epic performance promises.
The [current parity contract](../architecture/provider-sync-parity.md) documents
all persistence counts, measurements, eligibility exceptions and completion limits.

The gate passed from a disposable checkout without private inputs: 1,425 unit
tests (including 80 new admission regressions), 472 contents tests, 103 importer
and 67 UI checks per packaged browser, 11 installed Firefox storage/recovery/
backup/certificate checks, both 190-file validators and the 88-case offline probe.
Layout checking retains only the 15 previously known historical absolute links.
Full completion receipt design remains open; overall synchronization parity is
not claimed. No HB/FAN, version, ownership, acquisition or schema changes.
