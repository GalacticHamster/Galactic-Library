# GalacticHamster appearance

Theme version 1 has one authoritative source in `shared/theme.js`, `shared/theme.css`, `shared/theme-app.css` and `shared/theme-overlays.css`. GL packages these files; HB packages identical root copies and FAN identical `src/` copies. Each extension runs independently with local assets. There is no CDN, dependency package or runtime relationship to the other repositories.

After changing these sources, run `node scripts/sync-companion-themes.mjs`, then `node scripts/sync-companion-themes.mjs --check` from GL. Optional `--hb=PATH` and `--fan=PATH` support other checkout locations. Review and commit the resulting files in all three repositories; validate their normal suites and packages. Runtime allowlists include all theme assets. A theme change does not require a library schema/version change.

## Tokens and scopes

Semantic `--gh-*` variables define the existing navy GL Dark palette and its light neutral/white interpretation, with purple primary controls. Tokens cover surfaces, text, links, borders, inputs, focus, disabled controls, feedback states, ownership labels, spacing, font and radii. Owned green, New blue, Possible orange and Partial purple retain explicit text labels and matching meaning. Filled status labels use white text and tested contrast; feedback text/soft surfaces and border colors adapt to each palette.

Extension documents use `html.gh-app` and `data-gh-theme`. Website scripts set the attribute only on extension-marked elements, including existing badge hosts. Theme tokens themselves set no ordinary host properties. `theme-app.css` is never injected into websites. `theme-overlays.css` uses explicit extension roots/badge selectors; native pricing, purchase controls and navigation are outside those scopes. GL importer shadow roots inherit tokens from their private panel hosts, with their existing positions/acquisition controls intact. Mutation handling stamps added extension elements and newly classified hosts without rewriting host styles or querying libraries.

## Settings and startup

GL stores `appearance` in the existing private `galacticLibraryUiPreferences` object. HB/FAN store the small `galacticHamsterAppearance` settings object through their existing serialized settings writer. These keys are outside library records and backup formats. Ordinary GL debounced view saves omit appearance, preserving a newer explicit theme selection.

An `onInstalled` event with reason `install` seeds System only if appearance is absent. Updates do not seed or overwrite settings. Missing/invalid appearance otherwise falls back to GL Dark or companion Light, preserving the requested legacy defaults. There is no attempt to infer installation age from an inventory read. Development reloads that do not report a fresh installation therefore retain the safe legacy fallback.

The head loads a small local bootstrap before the sheets. An extension-origin `localStorage` cache contains only the resolved small appearance preference and applies synchronously on subsequent opens. It is a display cache, not an additional authority or backup setting. Authoritative resolution reads only the private UI setting; no database acquisition, validation, index or canonical work is needed. The very first open without a cache can show the legacy palette briefly until the small preference read resolves. System uses `prefers-color-scheme` and observes changes without reload. Controls are disabled while the initial preference is unresolved.

## Following Galactic Library

Companions retain an independent Dark/Light/System choice and an optional **Follow Galactic Library appearance** checkbox. The local selector is disabled while following. The worker sends `GET_APPEARANCE` (API 1) to the existing built-in/override GL target. GL uses the established sender allowlist and operation authorization before returning just its mode; no library information is returned or database snapshot acquired.

Following checks once on page opening, when enabled, when the link changes, or when **Refresh linked appearance** is selected. It does not poll or push settings around a synchronization loop. Already-open companion pages do not automatically receive a later GL preference change; use the refresh action or reopen. A GL System choice remains System and is evaluated in the companion's browser environment. Unavailable GL retains its last mode bound to that target; a changed target discards that cache and uses the independent local choice until it connects. Identical sync results do not write storage. Disabling following restores the independent selection.

Only this extension's own pages may change its authoritative appearance. Content scripts can read appearance or refresh a previously configured following relationship. Theme messages do not accept arbitrary target IDs or URLs. No permissions or pairing mechanism were added.

Browser-owned title tooltips, native confirmation prompts and browser chrome remain platform-controlled. Application-owned panels, inspectors, dialogs, controls and status labels use the selected palette.
