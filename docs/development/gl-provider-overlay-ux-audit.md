# Provider overlay UX and account lifecycle audit — Phase A

October 26, 2026. **Phase A findings with approved Phase B implementation results.**
Sections A–I preserve the original audit of baseline `017de8b`; their descriptions
of defects and old presentation are historical. Phase A changed no production
behavior. The implementation status below supersedes the original pending-review
language and proposed UI descriptions. No live user libraries were used for tests.

## Post-B6 explanatory text cleanup

October 26, 2026. The shared renderer previously cloned every original provider
introduction into **How importing works** before replacing the introduction.
This caused repeated explanations, including optional help even when there was
nothing useful to add. It also appended Kindle import help after its contents
workflow. The renderer now creates optional help only for four providers, with
purpose-written additional information. Existing diagnostics and recovery text
are unchanged.

| Provider | Default description changed? | Import help retained or removed? | Reason |
| --- | --- | --- | --- |
| Steam | Yes: concise games/DLC and unidentified applications | Retained, rewritten | Adds Quick versus Full scope and retention when Steam cannot identify a title. |
| GOG | No | Removed | Recent additions, all pages and hidden games are already explained. |
| Epic Games | Yes: concise library import | Removed | Repeated import scope; session recovery and diagnostics stay in their existing locations. |
| Amazon Games | Yes: exact three-month window and unclear-delivery caveat | Removed | Recent versus all years, excluded stores/codes and uncertainty are visible once. |
| Audible | Yes: exact current/previous-year and received-gift scope | Removed | Essential recent versus all-year history and access distinctions remain visible. |
| Kindle | Yes: brief import scope and contents capability | Retained, rewritten | Adds newest-page stopping versus Full scope, before Book contents discovery. |
| Amazon Video | No | Removed | Refresh scope and uncertain completeness retention are already visible. |
| Fandango at Home | Yes: stopping at known titles and provider-count checks | Removed | Useful completeness detail is now in the default description. |
| Kobo | Yes: Archive/Audiobooks when exposed | Removed | Scope and uncertain ownership evidence are already visible. |
| Fanatical | No | Retained, rewritten | Explains page-local session-token use without repeating scan scope. |
| Humble Bundle | No | Retained, rewritten | Explains rescan after importer updates and redemption-code redaction. Pending-key checks remain visible. |
| Xbox | No; removed repetition from initial status | Removed | Both-action full-list traversal and web/lifetime limits remain visible. |
| PlayStation | No; removed repetition from initial status | Removed | Both-action traversal, supported consoles and historical limits remain visible. |
| Nintendo | No; removed repetition from initial status | Removed | Loaded, non-hidden card scope and retention remain visible. |

Kindle order is **Library import ? description ? account ? Quick/Full ? optional
import help ? Book contents discovery ? review link/mode/contents help**, with the
existing stable contents-action footer. Import help is a sibling before the
contents section; contents help remains inside it. Diagnostic tools stay in the
common tail and remain hidden by default.

The returning-account reminder is now: **Using a different account on this site?
Select Change account first.** No account admission, token invalidation, save,
acquisition, ownership or diagnostic-setting behavior changed.

Validation: complete unit **1,768 passed** and contents **485/485**. Packaged
Chrome and Firefox each passed **16 shared account/flag checks** and **123 importer
checks with diagnostics off plus 123 on**. Native installed-extension render
checks passed **56 captures per browser**, covering all 14 templates, initial,
returning and diagnostic states, narrow/short dark viewports, keyboard focus,
minimize/restore, and preference/profile rehydration after restart. New assertions
check the four-provider help inventory, collapsed defaults, exact account
reminder, Kindle section ordering and retained contents controls. Representative
Epic, Steam and Kindle captures in both browsers were visually inspected: no
clipping, redundant help or empty separators; Kindle keeps scrolling and its
footer. Captures are synthetic, include a deliberately long status and remain in
ignored `audit-artifacts/provider-overlays/`; no live provider requests or personal
libraries were used.

Additional packaged suites pass in each browser: Steam **20**, Kobo **11**,
Fandango **53**, Amazon Games **58**, Amazon Video **89**, Audible ownership
**171**. Both release archives validate **225 runtime files**; unpacked Firefox
was refreshed. Repository layout and `git diff --check` pass. No remaining
failures were observed in the final runs. During development, an unnecessary
selector change in the isolated Steam fixture failed because that fixture does
not load the shared renderer; restoring its original selector resolved it without
changing production behavior. The layout checker required subprocess permission
in this environment and passed when rerun with that permission.

Remaining limitations are unchanged: native visual fixtures use production
markup/shared controls with synthetic profile replies, not signed-in acquisition;
provider importer fixtures separately exercise those controllers. No live
provider imports, personal browser profiles, or library-data edits were used.

## Phase B implementation results

| Package | Local checkpoint | Result |
| --- | --- | --- |
| B0 | `ac74154` | Only explicit import gestures reset authority. Diagnostics/help/exports/minimize preserve context; account edits and superseded start replies invalidate it. Actual delayed Kindle/Kobo saves are covered. |
| B1 | `adbe4a3` | Shared provider heading, reserved Minimize space, viewport bounds, scrolling and focus; Kindle footer and Amazon Games CSP styling retained. |
| B2 | `0c192fc` | Compact eligible single account; explicit saved-profile selection/Add account/Cancel and Providers rename link; acknowledged-save refresh preserves newer edits. Worker eligibility and console bindings unchanged. |
| B3 | `e46d15d` | Concise provider copy with retained technical help, Quick-before-Full ordering, accurate console traversal scope and Kobo owned wording. |
| B4 | `870bdcc` | One default-off local Settings toggle hides all diagnostic controls; supported tools and explicit URL overrides remain available. Collection is unchanged. |
| B5 | `719e7df` | Kindle Library import/Book contents discovery grouping, review link and stable action footer; feature controls stay available with diagnostics off. |
| B4 correction found in B6 | `9273c8c` | Register exactly the new settings key in the existing safe-clear metadata allowlist. No library schema/migration change or validation bypass. |
| B6 | Final Phase B validation checkpoint | Common status → How importing works → diagnostics ordering; updated legacy fixtures to use actual settings visibility and precise action selectors; results below. |

The user approved the layout/account direction and superseded the earlier
diagnostics proposal: **Settings → Troubleshooting → Enable provider diagnostics**
is now the common entry. Reopen/reload provider pages to apply it; changing it does
not interrupt an import. It is outside library backups and resets on Clear local
library. Existing Steam, Amazon Games and Audible support flags remain optional
overrides. Audible's specialized checker remains separate, with private purchase
evidence clearly distinguished from aggregate reports. Epic's retained local
failure/recovery history continues while controls are hidden.

### Final validation and limits

- Complete unit suite: **1,768 passed**; contents: **485/485 passed**.
- Chrome/Firefox each: **123 importer checks with diagnostics off and 123 on**,
  **68 main UI**, **16 Settings/provider UX**, **16 shared account/flag**,
  **11 Kobo**, **171 Audible ownership**, **58 Amazon Games**, **89 Amazon Video**,
  **53 Fandango**, and **20 Steam owned-source** checks.
- Both installed-browser suites: **56 captures each** of all 14 production-source
  templates and the real shared renderer: initial, returning and diagnostics
  states, 420 px light and true 320 px dark/short frames. Geometry, real Tab focus
  indicators, minimize/restore and persisted setting/profile rehydration after a
  real browser/extension restart pass. Screenshots stay in ignored
  `audit-artifacts/provider-overlays/`; representative captures were visually
  inspected. These render fixtures do not run acquisition controllers.
- Separate native packaged **Xbox, PlayStation, Nintendo and Epic** controllers
  pass in both browsers, including account guards, additive/repeat saves, source
  integrity and backup roundtrips. Epic tests collect failures while diagnostics
  are hidden, restart the browser/extension, enable the preference and export the
  retained failure plus committed recovery.
- Disposable private-backup replay: **14,309 provider records, 14 profiles and all
  22 database sections unchanged**, including reviews, acquisitions, history and
  associations; original file unchanged. Preference changes do not enter backups.
- No new permissions, provider acquisition/matching/ownership changes, real
  account imports, migrations, versions, remote operations or store-asset changes.

Observed failures are retained in the local validation ledger: early screenshot
harness target/readiness errors and legacy fixtures expecting always-visible or
absent diagnostic markup were corrected. The first complete unit run found the
new preference missing from safe-clear metadata, fixed in `9273c8c`. One Firefox
diagnostics-off importer run hit the previously observed independent-evidence UI
assertion at `tests/kindle-independent-evidence-fixture.js:43`; two subsequent
complete off-mode runs and the final on-mode run passed. This is an observed
intermittent test limitation, not proof that the failure never occurs. No matching
or contents behavior was changed to suppress it.

Live provider compatibility remains the earlier importer-stabilization evidence,
not these disposable fixtures. A manual UI smoke check after reloading the rebuilt
extension is useful: inspect a returning account, open Change account and Cancel,
toggle diagnostics in Settings and reopen a provider, and check Kindle's two task
sections. No full import is needed for that inspection. Real authenticated
14-provider browser/extension restarts are not claimed; native acquisition tests
cover the four console/Epic controllers, with synthetic source sessions only.

## A. Executive summary

All 14 provider overlays use the account controls and scan-context wrapper in
[floating-panel.js](../../src/providers/floating-panel.js). They share the same
nickname lifecycle, with important qualifications:

- A returning account skips initial confirmation only when there is exactly
  **one** saved profile, connected with a prior successful sync. Multiple saved
  accounts require confirmation again, including the currently active account.
- Completing initial setup does not immediately collapse or rehydrate the
  account controls. A subsequent page mount applies the returning-user rule.
- The switch checkbox is always displayed. Alternate names are datalist
  suggestions in an editable field, not an explicit account selector.
- Nicknames identify the user's declared association. Restoring a nickname does
  not authenticate the website account. Xbox, PlayStation and Nintendo also bind
  imports to an observed source-account fingerprint; retain that additional guard.
- A confirmed scan start can persist an empty declared profile before any items
  are saved. Cancellation preserves it without making it a successful connection.

The Fanatical initial checkbox is shared setup behavior, **not a Fanatical-only
requirement**. A screenshot showing it checked cannot establish whether this was
first setup, edited input, multiple profiles, or a still-mounted completed setup.
The user's explanation is consistent with first setup.

The highest-value changes are a compact returning-account section, consistent
provider headings/action order, shorter default explanations, and consistent
help/diagnostic placement. Preserve single-action imports, console scope limits,
Audible history differences and Kindle's independent contents workflow.

The audit also reproduced a shared defect: an unrelated enabled diagnostic
button can clear an active scan's save context. Fix this narrowly before cosmetic
changes. This rejects a save; it is not evidence of cross-account data mixing.

## Evidence and limits

Source baseline is commit `017de8b`. Sources and test references below are local
repository paths. New tests deliberately assert **current** behavior, including
undesirable behavior; they do not implement the proposal.

The current attachment contains the written request but no set of 14 screenshots.
Historical screenshots in the conversation show differing states and builds.
Consequently this is a source/automated behavior audit, not a claim of pixel or
live-account verification across all 14 current overlays. Narrow-view clipping,
theme contrast and native datalist usability need the Phase B visual pass.

Evidence labels:

- **T:** exercised in automated tests during this audit.
- **S:** confirmed in production source.
- **G:** additional coverage needed; not live-verified.
- **I:** intentional provider-specific scope or safety behavior.
- **D:** confirmed discrepancy or defect, described below.

New [browser audit](../../tests/overlay-account-audit-fixture.js) mounts the real
shared renderer for each provider against synthetic profile-message replies.
It tests the renderer boundary, not the provider importer or real worker.
New [persistence audit](../../tests/overlay-account-audit.js) separately calls the
production writer with disposable storage, reopens that storage in a new writer,
and tests both accounts using the same native item identity. Existing worker,
provider and packaged importer tests supply complementary integration coverage.
Neither remounting a renderer nor reopening a writer is an actual extension or
browser process restart. Those are explicitly listed as remaining coverage gaps.

## B. Account lifecycle

### Shared contract and persistence

| Concern | Actual behavior and evidence |
| --- | --- |
| Storage | `database.providerProfiles[profileId]` stores nickname, immutable key space, provenance and per-account state. `database.providers[provider].activeProfileId` selects the current account. `providerItems` carry profile IDs; scans are separate tab-bound leases. See [provider-profiles.js](../../src/lib/provider-profiles.js) and [storage-writer.js](../../src/background/storage-writer.js). S/T. |
| First setup | Editable nickname plus unchecked initial confirmation and switch checkbox. No scan starts with empty/whitespace-only input or without initial consent. Shared renderer trims outer whitespace; writer collapses all whitespace. S/T. |
| Creation timing | `beginProviderScan` persists a declared profile/running attempt before fetch/save, except eligible existing-account lease-only starts. Cancelled/failed initial scans can leave a named empty profile. They have no successful-sync eligibility. S/T. |
| Returning one account | Worker `GET_PROVIDER_PROFILE` returns `reuseAllowed` only for one connected profile with `lastSync`. Renderer restores nickname, hides initial checkbox, sends stable `profileId` plus `rememberedProfile`. Writer rechecks eligibility at start. S/T. |
| Returning multiple accounts | Active nickname restores, datalist includes saved names, initial checkbox stays visible. Reconfirmation is required even for the active account. Not a provider-specific exception. S/T; mismatch with the unqualified expected returning state. |
| Editing | Any `input` event clears remembered authority and unchecks/reveals initial confirmation, even if the resulting name equals the saved name. Editing is target selection/creation, **not rename**. Rename remains in GL Providers. S/T. |
| Switching | Initial declaration plus explicit switch required when target differs from active. Switching to a new profile through Quick update is rejected before the normal missing-baseline fallback; use Full rescan. Selecting an existing alternate uses its own baseline. S/T. |
| Duplicate/case handling | Existing normalized exact nickname selects that profile; duplicate rename is rejected. Case is significant: `Personal` and `personal` can be distinct for ordinary providers. Console fingerprint checks additionally prevent a second profile for the same bound source account. S/T. Do not silently change this in visual work. |
| Cancel | The overlay has no general account-switch Cancel button. Before starting, returning to the original input and leaving confirmations unchecked starts nothing. After start, dashboard cancellation preserves catalog records and may retain the declared empty profile. S/T. |
| Failure/interruption | A scan lease does not grant a different tab/profile permission to save. Previous items/reviews survive failures; cancellation/restore supersedes stale authority. Empty initial profiles can remain. S/T. |
| Reload | A new page mount rereads persisted active profile state; unsaved input and checkbox state are page-local. Successful single-account reuse survives storage reopening; literal extension reload/content-script reconnection for every provider is G. |
| Minimize | Hides panel, focuses restore button; restoring focuses Minimize. Same DOM preserves draft/checkbox state. No stored minimize preference. Full navigation recreates it expanded. S/T. |
| Quick/Full | Both use the same account admission path. No first-baseline authority is obtained simply by relabeling an action. Epic/Nintendo single actions also use it. S/T. |

Code anchors: `floating-panel.js` lines 7–38 (scan wrapper), 57–108 (controls,
editing and rehydration), 114–144 (focus/minimize); worker
`service-worker.js` lines 442–464 (profile reply/admission);
`storage-writer.js` lines 506–555 (start), 557–592 (save/binding), 645–669
(selection/rename), 742–749 (cancel), 957–963 (profile lookup/creation);
`validation.js` lines 6–12 (whitespace normalization).

### Fourteen-provider account-state matrix

“Shared” below means the entire lifecycle above, not unconditional automatic reuse.
Every row has T for renderer setup, empty rejection, single-account rehydration,
editing, alternate suggestions, switch gesture and minimize/restore, plus T for
writer normalization, interrupted setup/switch, storage reopening, duplicate-name
protection and independent records. This does not assert native restart coverage.

| Provider | Initial confirmation | Saved nickname restoration | Switch confirmation | Alternate-account selection | Reload/navigation preservation | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Steam | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; full-document draft loss S; native extension reload G | Shared S/T; D1–D3 |
| GOG | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; fetch paging stays in tab S; native restart G | Shared S/T; D1–D3 |
| Epic Games | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; changing website pages remounts S; session recovery is separate I | Shared S/T; D1–D3 |
| Amazon Games | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; year/filter scanning S; native restart/draft continuity G | Shared S/T; D1–D3 |
| Audible | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; background history requests do not change declared target S; diagnostic-only mode omits import account controls I | Shared S/T; D1–D3 |
| Kindle | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; persisted contents queue separate S/T; literal extension restart all-account matrix G | Shared S/T; D1–D4 |
| Amazon Video | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; same-tab scrolling S; native restart G | Shared S/T; D1–D3 |
| Fandango at Home | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; tab-specific confirmed scan context travels My Library → grids S/existing T | Shared with intentional navigation resume I; D1–D3 |
| Kobo | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Display-only nickname hint S/existing T; authoritative profile reply still required; fetch paging S; native restart G | Shared plus hint I; D1–D4 |
| Fanatical | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | SPA route generations invalidate old work and remount controls S/existing T; unsaved input resets | Initial checkbox expected; route guard I; D1–D3 |
| Humble Bundle | Shared T | Single auto / multi explicit T | Shared T | Editable datalist T | Rehydrate T; fetch purchase details S; full navigation draft loss S | Shared S/T; D1–D3 |
| Xbox — Web Library | Shared T | Single auto / multi explicit T | Shared + source binding T | Datalist; duplicate source binding rejected T | Same host reused through SPA/hydration S/existing T; route generation blocks stale completion | Shared + identity guard I; D1–D3 |
| PlayStation — PS4/PS5 Purchased Library | Shared T | Single auto / multi explicit T | Shared + source binding T | Datalist; duplicate source binding rejected T | New document rehydrates S/T; capture version and source rechecked before save S/existing T; native restart G | Shared + identity guard I; D1–D3 |
| Nintendo — Switch Virtual Game Cards | Shared T | Single auto / multi explicit T | Shared + source binding T | Datalist; duplicate source binding rejected T | Loaded-list capture version/source rechecked before save S/existing T; new document rehydrates; native restart G | Shared + loaded-list guard I; D1–D3 |

The fingerprint checks are not GL signing the user into those services. They
associate the observed source session with the declared GL target and reject
changes. For ordinary providers a user can still declare the wrong nickname for
a website login; the UI must explain that limitation without implying detection.

### Coverage boundaries for the requested scenarios

- First setup, confirmation, same-name editing, blank/whitespace, saved return,
  multiple-name selection, cancelled unconfirmed switch and page remount: new
  browser boundary tests, all 14.
- Actual interrupted starts/switches, normalizing repeated spaces, case handling,
  duplicate rename, reopened storage, A → B → A, same native product scoped to
  two accounts, no catalog writes on rejected switches: new writer tests, all 14.
- Existing [provider profile tests](../../tests/provider-profiles.js) cover
  immutable provenance, reviews/history, stale leases, failed storage writes,
  profile baselines, backup/restore and real worker target scoping. Existing
  console import tests cover source binding and sender/tab/save guards.
- Existing [importer fixture](../../tests/importers-fixture.js) tests actual
  ordinary-provider content scripts and both modes/single Epic action against
  synthetic acquisition results; its profile boundary is simplified. It is not
  proof of the complete returning-account lifecycle for every provider.
- G: literal browser/extension process restart for the full 14-provider matrix;
  native datalist keyboard selection; account drafts across all provider SPA
  transitions; every provider's live auth/empty-library layout; narrow viewport
  measurements. Phase B must add targeted cases, not relabel mocks as live proof.

## C. Fourteen-provider UI and capability inventory

Production content scripts are in [src/providers](../../src/providers). Each row
names its actual file. All attach shared account/minimize controls. Ordinary
headers are bold text in a paragraph; console headers are `h3` elements.
Ordinary actions generally use 8×10 px button padding, 14 px type, 14 px panel
padding/radius 8; console panels use 16 px padding/radius 10, 7×12 px buttons.

| Provider / source | Current heading; width | Actions and real scope | Diagnostics / specialized content |
| --- | --- | --- | --- |
| Steam — `steam-store-content.js:7–18` | Galactic Library; max 340 px | Quick then Full. Quick checks new IDs and unresolved information; Full checks owned app inventory. Unavailable information retains earlier titles. | Steam diagnostics gated by `gl-steam-diagnostics=1`: one-shot timing and opt-in unresolved App ID sample. ID export has explicit privacy warning; timing link opens Settings. |
| GOG — `gog-content.js:7–43` | Galactic Library; max 340 px | Quick then Full. Purchase-date ordering, known-page stopping; Full reads visible and hidden scopes. | No local diagnostic section. Error/dashboard sync-health evidence remains. |
| Epic — `epic-content.js:7–25` | Galactic Library; max 340 px | Sync Epic library only; complete supported game/add-on listing. No incremental action. | Scan diagnostics: last scan and bounded passive session-failure/recovery history; Performance diagnostics: one-shot timing. Export remains available after failures. Keep manual session-recovery guidance. |
| Amazon Games — `amazon-games-content.js:8–20,27–43,80–94` | Galactic Library; max 360 px, viewport-bounded/scrolling via constructed stylesheet | Quick then Full. Recent three-month claims versus all exposed calendar years; Quick escalates if no baseline or last sync older than 70 days. Only Amazon Games deliveries; other-store deliveries/key claims excluded. | Export scan report appears after scan success/failure when available. Acquisition-date check is hidden unless `gl-date-check=1`. Constructed stylesheet is required for site CSP compatibility. |
| Audible — `audible-content.js:7–15,128–171` | Galactic Library; max 340 px | Quick then Full. Incremental library plus current/previous-year history; Full entire library/all offered history years. Partial history preserves discoveries/evidence and explains unchecked years. | Separate URL-enabled ownership checker on purchase/gift/refund pages: read-only page checks, aggregate export, private purchase preview/export, automatic-access probe. Not the normal import flow; preserve while investigating limitations. |
| Kindle — `kindle-content.js:7–15` | Galactic Library; max 350 px | Quick then Full. Newest known-page stopping versus complete supported Kindle snapshot. | Contents selection, Find contents/Resume/Pause/Start new refresh/Stop, saved-text recheck, help, and contents timing export. Viewport-bounded scrolling body with stable contents-action footer. Contents source proposals are not ownership decisions. |
| Amazon Video — `amazon-video-content.js:4–17,48–78` | Galactic Library; max 350 px | Quick then Full. Recent groups versus collection/purchase-label reconciliation. Full has confirmed/inferred completeness outcomes; earlier saved items retained for inferred completion. | Scan diagnostics markup exists but `SHOW_SCAN_DIAGNOSTICS=false`: listing and purchase-label checks/export are absent from normal UI. Any screenshot showing them is a different diagnostic build/state. |
| Fandango at Home — `fandango-at-home-content.js:7–18,174–221` | Galactic Library; max 350 px | Quick then Full. Recently Purchased grids until known titles versus reported Movies/TV scope counts. Restart explicitly returns to My Library; confirmed context resumes grid navigation. | Scan diagnostics: read-only movie listing/export. Diagnostics navigate too, but diagnostic state carries no import authority. |
| Kobo — `kobo-content.js:7–20,27–67,70–104` | Galactic Library; max 350 px | Quick then Full. Newest-first known-page stop versus My Books and exposed Archive/Audiobooks. Sparse observations retain richer saved evidence. | Scan diagnostics: visible ownership evidence plus one same-site linked history page, aggregate export. Account ownership preference lives in GL Providers, not overlay; “purchased” is inaccurate for redeemed books. |
| Fanatical — `fanatical-content.js:5–57` | Galactic Library; max 355 px | Quick then Full. Completed orders not previously checked versus complete completed-order snapshot; order fingerprints drive skipping. | No local diagnostics section. Default paragraph explains session-token handling in detail. Route controller remounts on Orders navigation and rejects stale continuations. |
| Humble Bundle — `humble-content.js:7–45` | Galactic Library; max 350 px | Quick then Full. New purchases plus existing key-status refresh requests versus complete supported purchase snapshot. | No local diagnostics section. Default copy includes parser/redaction mechanics; Quick description omits known purchases intentionally refreshed for key status. |
| Xbox — `xbox-content.js:12–18,34–63,85–110` | Galactic Library · Xbox — Web Library; min(410 px,95vw) | Full then Quick. **Both inspect the full web-visible Owned catalog**; Quick is additive save behavior, not a faster traversal. Both retain earlier saved items. | No local diagnostic section in production overlay. Owned-route recovery, SPA host reattachment and generation guards are specialized behavior. |
| PlayStation — `playstation-content.js:5–9,27–49` | Galactic Library · PlayStation; min(410 px,95vw) | Full then Quick. Both prepare the complete active PS4/PS5 Purchased listing; no historical/incremental source cursor. Scope excludes older consoles/lifetime history. | No local diagnostic section. Read-only native-session bridge, paging, account/capture verification. |
| Nintendo — `nintendo-content.js:5–22,39–57` | Galactic Library · Nintendo; min(410 px,95vw) | Import Nintendo cards only. Imports complete loaded non-hidden Virtual Game Card scope, retaining prior cards. Does not scan lifetime purchases. | Passive loaded/total status and explicit scroll-to-load guidance; no extra local diagnostic section. Account/card-version guards; no inferred purchase dates. |

Provider display order was checked against
[provider-accounts.js](../../src/ui/provider-accounts.js), `PROVIDER_SITES`.
GL's own Providers page may describe Epic/Nintendo launches as Full Rescan while
the overlay uses provider-specific single-action labels; align explanation, not
capabilities. No artificial second action is warranted.

### Presentation and status observations

- Shared code provides theme tokens, hover/pressed/disabled styling and visible
  keyboard focus, but no shared shell/layout renderer. Every provider owns its
  header, prose, primary buttons and progress/error assembly.
- Most hosts are fixed bottom/right 18 px, max-width 340–360 px; console hosts
  use 16 px offsets and 410 px/95vw. Kindle and Amazon Games explicitly bound
  height and provide internal scrolling; most others do not. Long account/help
  or failure text can exceed a short viewport. This is a source-confirmed risk,
  not a measured all-provider clipping failure.
- Shared Minimize is absolutely positioned top-right without a universal
  reserved heading slot. The ordinary short heading usually fits; console `h3`
  wrapping and future provider names require visual checks.
- Most ordinary status nodes have `role=status` and a pulsing literal `*` while
  busy; consoles use `aria-busy` and text but no matching spinner. No fabricated
  percentage appears. Some operations have no fresh text while waiting for the
  shared account reply. Long Audible failures append a potentially large list.
- Errors are frequently `Provider import failed: ${error.message}`. Some sources
  sanitize/map errors; a generic mapper cannot promise rollback when acquisition
  and persistence outcomes differ. Keep provider-specific partial-save truth.
- Controls are native buttons/labels/inputs; shared focus handling is useful.
  Theme tokens exist, but this audit does not certify every contrast ratio or
  native datalist keyboard behavior. Read/scan status and account status are
  separate live regions; avoid duplicating announcements in Phase B.

## D. Confirmed discrepancies and defects

### D1 — returning lifecycle has conditions the simplified expectation omits

`service-worker.js:457–464` only permits one connected profile with `lastSync`.
`floating-panel.js:94–103` hides confirmation only for that result. Reproduce:
save two accounts, remount overlay; the active nickname restores but initial
confirmation remains. New all-provider browser tests confirm this. This is a
conservative safeguard, not account corruption. A collapsed returning view must
not broaden `reuseAllowed` or hide required consent for multi-profile accounts.

### D2 — initial setup and selection UI do not transition after a successful save

`floating-panel.js:19,22–24` records scan context but never reruns profile hydration
after save. Reproduce: enter first nickname/confirmation, complete a scan, remain
on the page. Confirmation remains checked/visible and status may still request
confirmation. Reload with one successful account hides it. Source plus renderer
tests confirm the missing transition; real save behavior is separately covered.
Phase B should refresh only the account presentation after acknowledged success,
using the established worker eligibility reply and protecting edits made in flight.

### D3 — switching/normalization behavior is poorly exposed

`floating-panel.js:57–68` always shows both switches and a freeform nickname.
`storage-writer.js:508–527` normalizes whitespace, compares case sensitively and
requires Full for a new alternate account. Thus editing `Personal` to `personal`
with switch consent can create another ordinary-provider profile; it does not
rename the existing one. Tests reproduce the distinction and console exception.
This is a usability hazard, not a request to change case/identity semantics.
An interrupted new-account switch can also leave a second empty declared profile.
Because automatic reuse counts all saved profiles, later visits then require
explicit confirmation even if only the original account has a successful import.
Recommend explicit “Use saved account” versus “Add account,” plus a Providers
rename link. Explain why a new account requires Full rescan before rejecting it.

### D4 — unrelated buttons can discard an active save context

`floating-panel.js:70` capture listener clears `session.context`/`session.resume`
for **every** non-minimize button. The wrapper then refuses `IMPORT_PROVIDER_ITEMS`
without a context/token (`:22–24`). Reproduce in the isolated renderer: begin a
scan, click an enabled Export diagnostic button, try to finish; save rejects with
“Start a fresh confirmed profile scan.” All 14 shared mounts reproduce it.
Real exposure depends on enabled controls: Kindle timing export and Kobo's export
of an earlier report are examples not included in their import busy-button sets
(`kindle-content.js:14–22,39–42`; `kobo-content.js:17–18,27–29,96–102`).
This audit proves the shared-handler mechanism, not a live user failure.
Fix only context invalidation/event classification, with delayed actual-provider
save regressions. Do not weaken token/tab/profile checks or suppress the error.

### D5 — confirmed presentation discrepancies

Xbox/PlayStation reverse common action order. Eleven overlays omit provider name
in the heading. GOG/Kindle/Humble/Fanatical say “baseline,” “snapshot,” parser or
session mechanics in default text. Kobo's preference says “purchased” when a user
may permanently own externally redeemed books. These are presentation issues.
Xbox/PlayStation “Quick” is not source-incremental: make that limitation explicit;
do not promise performance savings without changing acquisition semantics.

### Not established as defects

No cross-account record mixing was found in the tested declared-profile flows.
No claim is made that restored nicknames detect an ordinary-provider website
account switch. No all-provider live empty/authentication correctness or native
extension-reload result is inferred from synthetic tests. Different supported
scopes, single-action providers and Kindle contents controls are intentional.

## E. Proposed common overlay structure

Retain the current appearance and shared controller. Add a small shared shell
helper/style layer to `floating-panel.js` (or a tightly scoped companion module
if needed), not a new importer framework. Providers continue supplying their own
actions, progress, diagnostics and specialized content.

```text
Galactic Library · Provider                         Minimize
Short scope sentence and any essential limitation

[Account section appropriate to state]

Quick update     Full rescan        [or the single real action]
Current progress/result and the next useful action

Kindle only: Book contents discovery [distinct task section]
How importing works                 [collapsed]
Scan diagnostics                    [collapsed, when tools exist]
Performance diagnostics             [collapsed, when tools exist]
```

First setup:

```text
Choose an account nickname [Personal                    ]
[ ] I checked that this is the account signed in on this website.
This nickname is your label. GL does not sign you in.
```

Returning single eligible account:

```text
Selected GL account: Personal        Change account
If you signed into another website account, change this selection first.
```

Returning multiple accounts: show the selected name compactly **with** “Confirm
account” or an open required confirmation area; do not imply one-click eligibility.

Changing accounts:

```text
Use saved account [Personal / Family]    or Add account
Nickname [only when adding]
[ ] I checked which website account is signed in.
[ ] Switch this import to the selected GL account. Earlier records stay saved.
Use Full rescan to start a new account.     Cancel
```

Cancel before admission restores the prior selection and starts no operation.
Cancel after a scan starts is not invented as a visual-only action: existing
dashboard cancellation and source stop/pause semantics stay distinct. Change
account is not Rename; offer a link to GL Providers for renaming/recovery.

Two-action importers use Quick then Full consistently. Epic keeps Sync Epic
library; Nintendo keeps Import Nintendo cards. Xbox/PlayStation retain both
buttons for Phase B, with an explicit explanation that both inspect their entire
supported web list. Deciding to merge those actions is a separate approval item.

Kindle keeps library import above a visibly separate **Book contents discovery**
section. Preserve its mode selector, stable primary action slot, sticky action
footer, persisted refresh queue, explicit destructive-queue confirmation, pause,
resume, stop, saved-text-only recheck and review destination. Do not hide its main
task inside technical help or create a second contents editor.

## F. Proposed default wording by provider

These are proposed replacements, **not shipped copy**. Additional exact mechanics
from inventory C move into How importing works. Keep limits in the default view.

| Provider | Proposed concise default copy |
| --- | --- |
| Steam | Import your Steam games and DLC. Quick update checks new or unidentified applications; Full rescan checks the library again. Saved titles stay when Steam cannot identify them. |
| GOG | Import your GOG games, including hidden games. Quick update checks recent additions; Full rescan checks every available page. |
| Epic Games | Import the games and add-ons Epic reports as owned by the signed-in account. Sync checks the supported library each time. |
| Amazon Games | Import games delivered to your Amazon Games library. Games delivered to other stores and code claims are excluded. Quick update checks recent claims; Full rescan checks all available years. Older or first-time imports may require a Full rescan. |
| Audible | Import your Audible audiobooks and available ownership evidence. Quick update checks new titles and recent purchase, return and gift history. Full rescan checks the library and all available history years. Subscription, expired and unconfirmed access remain distinct. |
| Kindle | Import your Kindle library. Quick update checks recent additions; Full rescan checks the supported library again. Use Book contents discovery below to find included works for review. |
| Amazon Video | Import your Amazon Video movies and TV titles. Quick update checks recent additions; Full rescan refreshes the collection and purchase information. Earlier saved titles stay when Amazon cannot confirm a complete listing. |
| Fandango at Home | Import your Fandango movies and TV shows. Quick update checks recent purchases; Full rescan checks the whole available collection. |
| Kobo | Import your Kobo books and audiobooks. Quick update checks recent additions; Full rescan checks all available library sections. Library presence alone does not confirm ownership. |
| Fanatical | Import supported products from completed Fanatical orders. Quick update checks new completed orders; Full rescan checks all completed orders again. |
| Humble Bundle | Import supported books, audiobooks and game entitlements from Humble purchases. Quick update checks new purchases and pending key information; Full rescan checks all supported purchases again. |
| Xbox — Web Library | Import the web-visible Xbox Owned catalog. Both actions check this entire list; Quick update adds changes. This is not your complete console or lifetime purchase history. Earlier saved items stay. |
| PlayStation — PS4/PS5 Purchased Library | Import the active PS4/PS5 Purchased web library. Both actions check the supported list; Quick update saves additions and changes. Older consoles and lifetime purchase history are outside this scope. Earlier saved items stay. |
| Nintendo — Switch Virtual Game Cards | Import the non-hidden Switch Virtual Game Cards loaded on this page. Load all cards before importing. Other Nintendo purchase history is not included; earlier saved cards stay. |

Kobo preference: **“Treat unconfirmed books in this account as owned.”** Help:
“Use this only if you know these books are permanently yours. Kobo has not
confirmed their ownership. This changes display and ownership checks for this GL
account, preserves source evidence, and can be turned off. Explicit access
evidence and individual corrections keep their existing precedence.” Do not claim
that Kobo sold externally redeemed books or invent acquisition dates.

## G. Diagnostics and message recommendations

Keep troubleshooting collapsed in a consistent lower slot, with a visible export
link in an error only when that export actually exists. Do not add empty sections
or manufacture equivalent diagnostics for providers without them.

- Keep Epic's passive failure/recovery export and manual session workaround. Its
  bounded history is useful after page/extension restarts; page-local scan output
  and memory-only timing have different lifetimes. Explain those separately.
- Retain Kindle timing and contents workflow help; do not put contents actions
  under diagnostics. Keep queue interruption/restart guidance contextual.
- Retain Fandango listing checks and Kobo evidence diagnostics. They are read-only
  actions, not import-start gestures and must not consume/reset scan context.
- Keep Amazon Games failure export; its date check and Steam's ID sampling have
  explicit support flags/privacy expectations. Propose a visible Help entry to
  the existing support mode rather than requiring DevTools. Whether to expose
  them normally is an approval decision, not an automatic cleanup.
- Amazon Video diagnostic markup is disabled in current production. Decide its
  future support entry explicitly; do not promise an unavailable export.
- Audible's URL-gated ownership checker has useful read-only tools but also a
  **private purchase evidence download**. Never label every diagnostic export
  anonymous or title-free. Keep its private preview/download warning and separate
  it from aggregate reports. Evaluate retiring completed probes only after
  confirming no unresolved investigation depends on them.

Proposed common messages (provider-specific quantities remain truthful):

| State | Proposed pattern |
| --- | --- |
| Ready | “Ready to update [selected GL account].” Only after account loading/eligibility; otherwise request setup/confirmation. |
| Admission | “Checking your saved account…” |
| Navigation | “Opening [required provider view] to start the update…” |
| Website readiness | “Waiting for [provider] to finish loading. [Specific next step if needed].” |
| Progress | “Checking [provider]… [actual pages/titles checked].” Indeterminate activity when no measurable total. |
| Saving | “Saving the checked titles…” |
| Complete | “[Operation] complete. [new/updated counts when available]. [current saved total].” Do not call observations new purchases. |
| Partial save | “Library saved; [specific history/scope] could not be checked. Earlier evidence was kept. [next action].” |
| Acquisition failed before save | “Could not finish the check. Your saved library was not replaced. [specific sign-in/retry instruction].” Only when this outcome is established. |
| Save acknowledgement uncertain | “GL could not confirm whether the save finished. Reopen GL to check before retrying.” Do not assert rollback. |
| Account mismatch/stale save | “The selected account or library changed. Choose the account and start a new check.” Keep console-specific identity details where useful. |
| Empty | Distinguish confirmed empty supported scope from login, missing DOM, partial traversal and zero new titles. Never convert a failure to an empty success. |
| Interrupted | “The check stopped. [saved discoveries/progress, if any]. [Resume or start again, as actually supported].” |

## H. Phase B work packages and regression gates

| Package | Files/components | Preserve | Acceptance and required tests | Dependency |
| --- | --- | --- | --- | --- |
| B0: isolate import gestures | `floating-panel.js`; shared audit and actual Kindle/Kobo fixtures | Token, tab, account, navigation and save guards | Diagnostic exports/minimize/help cannot clear active scan context; an explicit new import still starts fresh; delayed save plus export passes in packaged Chrome/Firefox; stale account changes still reject | None; fix D4 first |
| B1: shell and typography | Small shared shell/style helper; all 14 `*-content.js`; manifest/runtime allowlist only if a new module is necessary | Actual actions, hooks and scope | Provider-aware heading with reserved Minimize slot; viewport-bounded scrolling; long names/errors fit 320/420 px and short-height views; focus order and theme contrast checked; same production imports/snapshots before/after | B0 |
| B2: account presentation | Shared account renderer, Providers contextual link; worker/writer unchanged | Existing `reuseAllowed`, nickname normalization/case, console fingerprints, explicit switching | First setup explicit; one eligible account compact; multiple accounts still request consent; success refresh cannot overwrite an in-flight edit; selection/creation/rename distinguished; cancel-before-start writes nothing; A→B→A and duplicate/case/blank tests; no loss of reviews | B0; independent of B1 |
| B3: provider copy/actions | Fourteen content scripts; Kobo preference copy in `providers-view.js`; guides | Algorithms, baselines, actual action count and Full/Quick differences | Quick then Full where both exist; Epic/Nintendo single actions retained; Xbox/PS traversal scope explicit; Humble known-key refresh described; no claims of verified login, new purchases or complete history without evidence | B1; user approves wording |
| B4: help/diagnostics slots | Provider content scripts; shared shell slots; support documentation | All exports, privacy distinctions, flags, Epic passive history; no DevTools dependency | Tools reachable after actual failures; read-only tools cause no scan admission/catalog writes; private Audible export stays explicitly private; lifetime of page/worker/durable diagnostics clear; no hidden needed support action | B0/B1; approval on flag exposure |
| B5: Kindle task grouping | `kindle-content.js`, contents controls helper and fixture | Frozen queues, pause/resume/stop, draft/evidence and explicit restart confirmation | Clear Library import versus Book contents discovery sections; stable action locations on delayed loads; keyboard/short viewport; minimize and navigation preserve promised queue semantics | B1/B4 |
| B6: final lifecycle/compatibility gate | Existing packaged harness, provider-specific fixtures and native restart tests; guides/checklist | Account records, source identities, manual reviews, ownership, snapshots and importer protocols | Full unit/contents; packaged Chrome/Firefox shared audit + importers + provider-specific suites; literal extension restart; route/login recovery; no duplicate starts; compare disposable backup preservation; all exceptions documented | B0–B5 |

Do not fold production identity/persistence changes into these packages. If the
design requires relaxing multi-account consent or case sensitivity, stop and
propose a separate behavior task. Likewise adding a general Cancel import action
would require provider-specific acquisition/persistence semantics, not just a button.

### Phase B test execution and data preservation

1. Use existing disposable browser harness and storage adapters. Never install
   into the personal Chrome/Firefox profile or import into real provider accounts.
2. Keep baseline shared audit cases, then add provider-specific delayed-load/save
   tests where source lifecycles differ: Fanatical routes, Fandango navigation
   context, Xbox host reattachment, PS source capture, Nintendo loaded-list state,
   Audible partial history, Kindle checkpoint/draft controls, Kobo hints/exports.
3. Run ordinary Quick/Full and single-action paths with both first-time and saved
   accounts. Verify exact admitted target/profileId, source fingerprint when
   applicable, one commit, no false complete empty scope and no cross-account rows.
4. Explicitly test actual extension reload, page reload, leave/return, failure
   retry and hydration after start; model mock rehydration separately. Test keyboard
   datalist/selector, focus restoration, long errors, 320/420 px and short viewports,
   themes and reduced motion. Use screenshots from those disposable fixtures.
5. Replay a disposable backup copy; compare provider identities, acquisitions,
   reviews, source evidence, history and other-provider sections. Never rewrite
   originals or migrate data during a visual milestone.

## I. Open decisions for approval

1. Approve compact account display only for existing single-profile eligibility,
   retaining explicit multi-profile confirmation, or request a separate lifecycle
   change? Recommended: preserve current authority rules.
2. Approve Quick then Full for Xbox/PlayStation with explicit full-list wording?
   Recommended for Phase B; do not merge actions or promise faster acquisition.
3. Approve provider-aware short headings plus a separate console scope sentence,
   instead of squeezing the full Providers display label into every heading?
4. Which currently gated diagnostics should normal users reach through Help?
   Keep sensitive ID/private evidence exports clearly distinguished.
5. Approve replacing Kobo “purchased” with “owned,” and the copy table above?
6. Approve a shared viewport-bounded shell while retaining Kindle's action footer
   and Amazon Games' CSP-compatible constructed stylesheet?

## Validation ledger

All runs use disposable fixtures/storage; no live provider imports were performed.

- `node tests/browser.js --release --overlay-audit`: 15 checks, Chrome pass.
- Same with `--firefox`: 15 checks, Firefox pass.
- New writer audit: 14 provider cases pass; included in the full unit runner.
- `node tests/run.js`: 1,767 tests pass, including the 14 new writer cases.
- `node tests/run-contents.mjs`: 485/485 pass.
- `node tests/browser.js --release --importers`, with and without `--firefox`:
  122 checks pass per browser.
- `node scripts/check-repository-layout.mjs` and `git diff --check`: pass.
- `node scripts/package-release.mjs --check`, with and without `--firefox`:
  225 runtime files validate in each existing package, with unchanged hashes.
- Remaining gaps are explicitly marked G above, especially actual per-provider
  process restart and complete visual/accessibility verification. Phase A does
  not certify those by source inspection.

Production files and release artifacts require no changes for this audit. Only
this document, the checklist and isolated test/harness additions are intended for
the Phase A local commit. The approved Phase B results now appear at the top.
