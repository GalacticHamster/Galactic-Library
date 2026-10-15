# PlayStation and Nintendo web-library implementation gate

Date: **2026-10-15**. Continues GL `996eb87`. The current release instruction is
PlayStation first, then Nintendo; **Xbox is deferred until after 1.0**. Existing
Xbox research/harness files are preserved without further investigation.

## Current support matrix

| Source | Live user evidence | GL implementation / authenticated test |
| --- | --- | --- |
| PlayStation — PS4/PS5 web library | Live helper observed 60 rows / 59 product IDs across 3 terminal pages; 58 PS4 and 2 PS5 rows, all active with membership NONE | Actual website fetch and extension observation demonstrated. Independent cookie-only replay, account binding and product/title relationships remain to check. **No production importer yet.** |
| Nintendo — Switch Virtual Game Cards | User can see 115 cards; helper 0.1.1 is active but observed zero candidate requests | Initial-data and dynamic-host diagnostics added in 0.1.2; actual source remains unverified. **No production importer yet.** |
| Xbox | Existing separate research | Deferred beyond 1.0 by user instruction; no work in this task. |

Do not list either new source as an available provider until the signed-in gate
passes and its production implementation is tested. The existing provider list
and production extension package remain unchanged at this stage.

## Evidence available before the signed-in check

The [current Playnite client](https://github.com/XenorPLxx/playnite-library-psn/blob/main/Services/PSNClient.cs)
constructs purchased-list GET requests against
`https://web.np.playstation.com/api/graphql/v1/op`, operation
`getPurchasedGameList`, paging `start`/`size`, `isActive`, platform and sort
variables, and a persisted query. It reads `purchasedTitlesRetrieve.games`,
checks `pageInfo.isLast`, and advances offset/size. This is public-client source
evidence; it is not a trace of the user's current browser. Its NPSSO, mobile-client
credentials and saved-cookie machinery are not copied or used.

The [current Nintendo client](https://github.com/XenorPLxx/playnite-library-nintendo/blob/main/Services/NintendoAccountClient.cs)
reads portal `data-json`, obtains a dynamic GraphQL endpoint, and queries
`getVgcs` / `vgcViewsV2`, alias `vgcViews`, with offset/limit and total. It requests
`isHidden: false`, card/application IDs, owner/user IDs, lending fields and
base/add-on/upgrade flags. Public source also contains locale fallback work;
neither its user-agent/cookie persistence nor locale trial requests are copied.
Actual endpoint, account identity and field meanings still need the signed-in gate.

Unauthenticated visits in this task redirected both sites to login. No shared
browser tool or existing local debugging connection exposed the user's signed-in
tabs. This is a tooling/session boundary, **not a platform authorization failure**.

## Concrete gate prepared

A separate [read-only validation helper](../../development/console-web-validation.md)
is installable in Chrome and Firefox. Its observer forwards website requests
unchanged; an explicit PlayStation test button checks one purchase page without
copied authorization headers. It exposes bounded aggregate diagnostics through a strictly projected
MAIN/isolated bridge, and has no GL import, database, credentials or storage API.
It requests no new host access in the production GL extension.

The user was asked to load it in the existing browser, reload/browse PlayStation,
copy the aggregate summary, then repeat on Nintendo. No credentials, raw response,
library list, lending action or debugging capture is required. Result interpretation
must keep website execution, extension observation and independent request replay
distinct. This gate does not authorize guessed requests or unvalidated importers.

## Live result and required checks before proceeding

The user's PlayStation summary confirms successful GET `getPurchasedGameList`
requests to the expected endpoint, with `credentials: include`, `start` 0/24/48,
size 24, PS4/PS5, active-only and ACTIVE_DATE descending. Six recognized requests
(including repeat pages) produced three distinct observed pages; seven other
GraphQL operations were ignored. No failed or malformed purchase response was
reported. All 60 rows expose titleId, productId, name, platform, membership,
isActive and conceptId. There is no generic `id` field: zero distinct row IDs in
the helper is a field-domain mismatch, not missing products. The 60-to-59 relation
must not be silently deduplicated before title/platform identity is understood.

This demonstrates authorized website execution and a working page-to-extension
observation bridge. It does not prove that an independent fetch without copied
authorization headers succeeds or that the account has 60 permanent purchases.
Membership NONE and active flags are useful evidence; account identity, unavailable
grants, editions and product/title cardinality still require bounded handling.

The user's first Nintendo helper attempt exposed a slashless-route bug, not an
authentication failure: `/portal/vgcs` was rejected by the MAIN-world observer's
trailing-slash-only check. Helper **0.1.1** recognizes both URL forms with a shared
strict route classifier. Adjacent prefixes and login pages remain excluded. The
fixed version passes focused and installed Chrome/Firefox tests. The subsequent
live result reports an active observer but zero candidate requests, failures or
scopes despite 115 visible cards. That establishes neither an empty library nor
an authentication failure. The original host allowlist was narrower than the
public client's dynamically supplied Nintendo endpoint contract, and the helper
did not inspect initial page data. Either could explain the missing observations;
the actual delivery mechanism is not yet established.

Helper **0.1.2** passively recognizes Nintendo GraphQL subdomains and inspects
the portal's bounded `data-json` bootstrap blocks. Only aggregate card counts,
declared API addresses and account-field paths leave the page; credential,
account-ID and title values do not. Synthetic initial-data tests use 115 cards;
that number is not claimed as an authenticated result. PlayStation's explicit
one-page cookie-only test reuses an observed safe query, never copied headers or
client credentials. Both changes help distinguish observed website access from
an independently usable importer contract before any production implementation.

For PlayStation: current operation/request shape, pagination termination, stable
product versus title IDs, account-scope evidence, available platforms/editions and
membership/access fields. Purchased-view naming alone must not mark all rows owned.

For Nintendo: raw cards, distinct view/card IDs, distinct software IDs, totals and
pagination, observed lending/access flags, base/DLC scope, hidden scope and stable
account binding. The **115** visible cards are a comparison target, not an imported
result. Lending semantics not exercised on this account remain untested.

Only after these results permit a reliable account-scoped adapter should provider
registration, import UI, neutral records, additive atomic saves and backup tests
be implemented in GL. If access is substantially blocked, document the actual
failure and move to the other provider. No legacy-console recovery is in scope.

## Validation

Passed: **12 focused synthetic tests**, installed-helper checks for both providers
in **Chrome and Firefox**, **1,193 GL unit tests** including shared matching,
repository layout/links, and both production packaging checks. Runtime packages
remain identical to baseline (181 files each). Production importer validation
remains pending and is not implied by these tests.
