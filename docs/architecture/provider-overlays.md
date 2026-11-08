# Shared provider overlays

All 14 ordinary provider import panels are built by
`src/providers/floating-panel.js`. Provider content scripts must not copy panel
markup or base styles. This replaces the earlier approach of constructing 14
panels and repairing their common presentation in `attach`.

The two stages deliberately preserve the existing initialization order:

```javascript
GalacticFloatingPanel.render(shadow, 'gog', {onImport: sync});
// Wire any genuinely provider-specific tools and lifecycle guards.
GalacticFloatingPanel.attach(shadow, 'gog');
```

`render` uses the module's provider definitions for display name, supported
content description, operational help and available actions. Every known
provider gets the same shell and required help. Standard actions are always
Quick update then Full rescan; Epic and Nintendo use their existing single
actions. Unknown definitions are rejected. `onImport(mode)` dispatches the
existing callback, not acquisition logic. It does not admit accounts or save
records. The returned `{panel, body, actions, status}` also supports existing
handlers that need to retain their own closures: Epic and console providers do
this. Callbacks only run on explicit action gestures.

`attach` remains the owner of account hydration/admission, scan context,
diagnostics visibility, heading, minimize/restore, focus and viewport behavior.
It rejects named panels that did not use `render`. It retains the original
provider-specific attachment timing, including Xbox route/hydration recovery.
Rendering never starts a scan or changes save authority.

## Humble and Fanatical importer ownership

Only these two provider panels call `importerOwnership` after attaching. The
worker's `provider-importer.js` probes existing authorized identities with API-1
PING and checks the provider role, readiness and importer capability. Released
1.x peers with the established role/readiness handshake remain compatible.
This read-only check neither creates a purchase relationship nor reads purchases.
Current peers additionally answer GET_IMPORTER_STATUS by checking their own live
content script in the requesting provider tab; the response contains only UI
presence. A missing/stale panel offers reload, rather than a false working UI.
Legacy 1.x peers do not advertise that page-liveness check; reload their provider
page after an installation/update. In-memory routing hints distinguish known
Humble and Fanatical custom IDs, but never establish current availability.

GL hides its duplicate host when the companion owns imports. No-receiver results
restore the standalone GL panel; uncertain/time-out results offer recovery and
never automatically acquire through GL. The choice is not persisted. Foreground
checks run every 30 seconds and on focus/visibility changes; import clicks recheck
before acquisition. Already-running GL imports finish before UI handoff. Stale
companion DOM is hidden when its extension is unavailable. No new permissions or
purchase-sync authorization are involved. Existing independent storage writers,
partial receipts, account checks and synchronization remain unchanged.

The provider launch action opens a fixed Humble/Fanatical URL, not a peer-supplied
URL or remote acquisition endpoint. The active importer starts only on a user
click. Providers retains the existing Connect and sync workflow and account tools.

## Follow-up: acquisition code sharing

UI ownership is intentionally separate from engine consolidation. GL/HB Humble
both retrieve purchase-list/detail evidence, but HB also retains richer purchase
summaries/prices and key evidence; GL projects records into its provider/profile
model. Their incremental refresh and partial receipts have different contracts.
GL/FAN both enumerate orders, validate detail/product identity and retry failures;
FAN has a stricter supported purchase projection and explicit partial receipt
sets, while GL maps to provider snapshots and scan leases. Neither an array-only
response nor a successful HTTP request establishes full coverage. Writers and
diagnostic exports are extension-specific and must not be blindly unified.

A separate pilot could extract pure Fanatical pagination/header parsing and
bounded retry decisions with the existing shared fixture matrix, mirrored at build
time using the established shared-source workflow. First prove equivalent outcomes
for counts, ranges, missing/ambiguous links, failed details and account/session
changes in both engines. Keep authentication context, account admission, ownership
projection, atomic persistence and consented sync extension-specific. Do not add a
runtime package dependency or migrate saved checkpoints merely for code reuse.

The common hierarchy is heading, short WHAT description, account controls,
import actions, ordinary status, collapsed HOW help, specialized workflows,
then enabled diagnostics. A single scroll body reserves room for keyboard focus
outlines and keeps the heading and any persistent footer accessible. Descriptions
and help belong in the shared provider registry, not duplicated in content-script
templates. Basic limitations stay visible; process details belong in help.

The small extension points accept only extension-authored markup:

- `diagnostics`: supported tools and their explanations. Providers wire their
  own tool callbacks. Shared rendering hides tools immediately; shared attachment alone controls
  default-off visibility, placement,
  the existing Settings preference and support URL overrides.
- `specialized`: Kindle's Book contents discovery group, after import help.
- `footer`: Kindle's stable contents-action controls, outside the scroll body.
- `styles`: only specialized footer layout; never another common panel style.

These are slots, not a component framework or a new configuration language.
An ordinary provider needs an identity, a definition and its importer callback.
There is no provider-controlled ordinary action ordering or optional-help flag.

Deliberate exceptions remain bounded:

- Amazon Games gathers the shared style nodes into its existing constructed
  stylesheet for restrictive page CSP. Its diagnostic slot includes the existing
  export control; no image, permission or collection changes are involved.
- Kindle supplies only its unique workflow/footer markup and footer styles.
  Existing queue, pause/resume/stop, refresh controls and progress messages remain.
  Library import does not wait for the saved Contents refresh checkpoint: it
  acknowledges the click immediately, then waits for its own account preparation
  and scan admission. Contents actions still require their saved state. An active
  library import and active contents discovery remain mutually exclusive; late
  checkpoint replies cannot enable contents controls during an import.
- Audible's opt-in read-only history checker replaces the ordinary actions/help
  within the shared body and attaches without provider account controls. It is
  a diagnostic workflow, not a second import-shell implementation.
- Fanatical, Fandango and console scripts retain their navigation, stale-operation
  and source-account guards. All scan leases and persistence stay in their
  existing layers.
- Xbox and PlayStation both traverse the supported listing for either action and
  use additive saves. Full records a complete supported-list check; it is not
  license revocation or a promise of complete lifetime ownership.

`tests/provider-overlay-structure.js` authors the shared DOM contract once and
checks provider-specific meaning separately. The shared account fixture tests
builder callbacks, required help and authority lifecycles. The native overlay
fixture reads actual provider configurations and rejects independent shell
templates. It renders collapsed/expanded, light/dark and short/narrow states in
disposable installed Chrome/Firefox extensions. Existing importer and native
controller suites separately test real callbacks, diagnostics, recovery and
save guards with synthetic sources. Visual renders do not establish live
provider compatibility. See the [inventory and validation ledger](../development/gl-provider-overlay-ux-audit.md).

`node tests/kindle-native.mjs --readiness` (also with `--firefox`) exercises
delayed Contents/account replies, duplicate gestures, account changes, runtime
and writer failures through installed disposable extensions with synthetic data.
