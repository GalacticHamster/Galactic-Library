# Provider Quick update contract

Quick update brings the selected provider account up to date. On an account
without a completed full-library baseline it runs the existing full importer;
with a usable baseline it uses the existing incremental importer. Full rescan
always requests the full importer. This choice happens before acquisition, not
as an automatic retry after authentication, network, pagination or parsing errors.

The worker admits scans through `beginProviderScan`. The acquisition-only
`providerScanMode` helper reads the selected profile's validated state. A saved
`fullSyncAt` marks completed full coverage; item count does not. A completed empty
library is a baseline. Humble and Fanatical additionally require their saved
purchase-ID / order-fingerprint arrays (empty arrays are valid). Missing/non-array checkpoints
select a full scan. State validation keeps that absence distinct from a real
empty array instead of certifying a completed empty purchase scan. Supplied
malformed identities still fail validation. Invalid persisted database data still fails the existing
integrity checks; automatic acquisition is not a database-repair mechanism.

The worker returns `forceFull` and `scanReason`, along with account-scoped state.
Existing controllers use this decision to call their normal full path. Xbox and
PlayStation also need `forceFull` to commit their complete view in the admitted
mode. Their Quick and Full actions read the same limited view. Epic and Nintendo
already expose one full-view action, so a separate Quick action is not applicable;
the generic storage writer's existing merge operations remain compatible.

The Providers page previously disabled Quick update for every missing full
baseline and for old Amazon Games history, even though the overlay could choose
full acquisition. Those launch restrictions are removed. Inactive-account,
running-scan and single-action-provider restrictions remain. Resetting import
history now explains that the next import automatically checks the full library.

## Provider acquisition inventory

All entry files below are under `src/providers/`. Except the two single-action
providers, Quick update requests incremental admission and Full rescan requests
full admission through the shared panel. Provider authentication, permissions,
source-account checks, snapshot validation and atomic saves are unchanged.

| Provider / entry file | Existing normal Quick method | Baseline and first-run behavior | Full behavior / source requirements |
|---|---|---|---|
| Steam / `steam-store-content.js` | Read owned App IDs; identify new and unresolved applications | Profile full marker + profile catalog stopping IDs; initial Quick already selected full | Existing complete owned-app path; signed-in Store access; retain unidentified access evidence |
| GOG / `gog-content.js` | Newest-first purchases until a known page | Profile full marker + catalog IDs; initial Quick already selected full | Every supported visible/hidden library page; signed-in account |
| Epic / `epic-content.js` | No separate Quick button; Sync Epic library reads supported listing each time | No incremental cursor; first Sync already full | Same supported owned listing; authenticated Epic session; retain completeness qualifications |
| Amazon Games / `amazon-games-content.js` | Recent three-month claims window | Profile full marker + successful-sync date; initial Quick already full; missing/invalid age or age over 70 days also selects full | All available calendar years; signed-in My Collection; delivery/claim distinctions unchanged |
| Audible / `audible-content.js` | Date-added library discovery until known page; current and previous calendar-year orders, returns and received gifts | Profile full marker + catalog IDs; **previously rejected initial Quick, now runs full** | Complete library and all available history years; signed-in Audible; partial history remains explicitly incomplete |
| Kindle / `kindle-content.js` | Newest pages until a known page | Profile full marker + catalog IDs; initial Quick already full | Supported library pages/categories; signed-in Manage Content; contents discovery is a separate workflow |
| Amazon Video / `amazon-video-content.js` | Recent additions until a saved group | Profile full marker + catalog IDs; initial Quick already full | Wider movie/TV collection with existing purchase-label and completion checks |
| Fandango / `fandango-at-home-content.js` | Recently Purchased View All until known titles | Profile full marker + catalog IDs; initial overlay Quick already full; missing View All grids now use the normal full reader only with both reported totals; resumable navigation retains account/mode | Full movie/TV traversal against reported counts; signed-in library |
| Kobo / `kobo-content.js` | Newest My Books until a known page | Profile full marker + catalog IDs; initial Quick already full | Archive/Audiobooks when exposed; signed-in library; ownership preference stays separate |
| Fanatical / `fanatical-content.js` | Read new completed orders; skip saved order fingerprints | Profile full marker + `knownOrderFingerprints`; initial Quick already full; **missing checkpoint now explicitly selects full** | Existing full order projection; signed-in Orders session and scripting permission |
| Humble / `humble-content.js` | Read new purchases and refresh pending key-status evidence | Profile full marker + `knownPurchaseIds`; initial Quick already full; **missing checkpoint now explicitly selects full** | Existing all-purchase importer; signed-in purchases; redemption values remain excluded |
| Nintendo / `nintendo-content.js` | No separate Quick button; Import Nintendo cards | No incremental cursor; always complete supported loaded view | Loaded non-hidden Virtual Game Cards; verified source-account fingerprint; no lifetime-history claim |
| PlayStation / `playstation-content.js` | Reads complete active PS4/PS5 Purchased view, additive save | Profile full marker; **initial Quick previously lacked the worker force-full signal, now commits full** | Same complete supported view; verified account fingerprint and authenticated purchased-list access |
| Xbox / `xbox-content.js` | Reads complete web-visible Owned view, additive save | Profile full marker; **initial Quick previously lacked the worker force-full signal, now commits full** | Same complete supported view; verified account/cache scope and readiness; no complete-console-library claim |

All providers previously rejected incremental admission when switching to a new
alternate account. After explicit account-switch confirmation, that target now
receives a full scan automatically. Identity matching is unchanged: a console
fingerprint cannot be silently rebound to another saved profile. Another
account's baseline, catalog IDs or purchase checkpoints are never reused.

## Safety and regression coverage

`tests/provider-scan-mode.js` exercises all providers' first import, completed
and empty baselines, missing baseline, account switch, explicit Full, failed
acquisition status and rejected complete fallback. It verifies actual committed
state and existing manual corrections. Missing/invalid order checkpoints have
additional tests; real worker replies verify console full-mode signaling.
Full-only provider Quick scenarios use the single full action; their lack of
incremental acquisition is intentional, not a simulated optimization.

Packaged importer fixtures click Quick first for applicable provider controllers,
then verify subsequent incremental behavior using the real writer. Dedicated
Audible fixtures verify complete first-import library/history acquisition and
recent-only established updates, including missing historical reconciliation,
partial history, evidence/date retention, subscription and expired access.
Existing account, source-fingerprint, stale-save, atomic-failure, concurrency,
provider pagination and acquisition suites remain required. The Fandango browser
fixture also verifies the pre-acquisition layout fallback, missing totals and
full-reader network failures; no failed acquisition is retried.

A failed acquisition is not retried as Full. Previously saved data/corrections
remain intact. A damaged or foreign library is not silently repaired or cleared;
use the existing backup/recovery path. Provider pages may still legitimately ask
the user to sign in, finish loading, confirm an account switch, or correct an
unreadable/incomplete listing. Those errors are not baseline failures.
