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
