# PlayStation and Nintendo web-library implementation gate

Date: **2026-10-15**. Continues GL `996eb87`. The current release instruction is
PlayStation first, then Nintendo; **Xbox is deferred until after 1.0**. Existing
Xbox research/harness files are preserved without further investigation.

## Current support matrix

| Source | Live user evidence | GL implementation / authenticated test |
| --- | --- | --- |
| PlayStation — PS4/PS5 web library | First capture: 60 rows / 59 product IDs, 3 terminal pages. Independent purchase GET succeeds; website profile query succeeds but independent profile query returns HTTP 400 rejecting its field | Purchase-page access demonstrated. Independent account recheck remains blocked by a different accepted GraphQL field contract; exact missing request context is unknown. **Production importer deferred.** |
| Nintendo — Switch Virtual Game Cards | 115 rows / card IDs / software IDs, terminal page. In 0.1.7 the signed-in obfuscatedId matches ownerNaId and userNaId on all 115 rows; no account change | Account-scoped website observation feeds an isolated importer through existing validated additive atomic saves. No independent API request or copied credential is needed. Live production import still requires user-side validation. |
| Xbox | Existing separate research | Deferred beyond 1.0 by user instruction; no work in this task. |

Nintendo's source/account observation gate is now satisfied. The implementation
uses the website-owned request and requires complete pagination; it does not
replay authentication. PlayStation is not registered as a production provider.

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

The live 0.1.2 Nintendo summary still reports zero candidate requests. All three
bootstrap blocks parse, but no recognized endpoint, root account field or
card/application array is found, and no bound is reached. This does not establish
that the blocks are empty: the aggregate omitted their types and shapes. Version
**0.1.3** adds allowlisted structural shapes, nested endpoint discovery, hook
replacement/call counters, and host/kind-only resource timing summaries. It does
not acquire additional pages or change any production importer. Nintendo's public
`account/js/common.js` confirms `data-json` parsing but is not authenticated
evidence about this account's current card delivery mechanism. No actual source
contract or Nintendo authorization blocker has yet been demonstrated.

The user's live 0.1.3 result confirms all hooks are installed, four XHR calls
reached them, and `data.shopGraphQLApiUrl` is present as a string. The user then
read only that URL (excluding query parameters), establishing the exact address
`https://wb.lp1.savanna.srv.nintendo.net/graphql`. The helper accepted only
`nintendo.com` hosts, so it discarded this configured endpoint and could not
observe its responses or include it in resource diagnostics. This is a confirmed
helper allowlist defect, not evidence of denied authentication or missing cards.
It does not establish that all four XHRs were card requests.

Version **0.1.4** accepts that exact HTTPS origin and `/graphql` path consistently
in request observation, bootstrap endpoint reporting, resource summaries and
isolated-world sanitization. Unrelated `nintendo.net` hosts, suffix lookalikes,
credentials in URLs, alternate ports and different paths remain rejected. Synthetic
XHR tests observe 115 cards and then an expired-session response without exporting
IDs, titles or credentials. The number is a synthetic regression control; live card
count reconciliation and the production importer gate remain open.

The live 0.1.4 result observes all four XHRs at the confirmed endpoint but marks
all operations unrecognized. The user checked only public operation names in
DevTools: `getVgcTotalsVgcs`, `getVgcsVgcs`, `getDevicesVgcs`, and
`getAllDevicesVgcs`. The helper incorrectly assumed the public reference client's
`getVgcs` operation name was the website contract. Its zero failed-request count
did not establish success: unknown operations returned before response validation.

Version **0.1.5** retains the actual website operation names in the projected
summary. `getVgcsVgcs` is the library candidate; the totals and two device queries
are auxiliary and cannot create card pages or inflate card counts, even if a
synthetic response contains card-like fields. Their HTTP/GraphQL failures remain
visible. Legacy `getVgcs` support remains. One `vgcViews` or `vgcViewsV2` envelope
can be read, never a union of both. Fixed-path response shapes expose types/counts
without values if the actual envelope differs. Synthetic fixtures cover both
envelopes; neither is claimed as an authenticated response until the live rerun.

## Successful live Nintendo reconciliation

The user's 0.1.5 aggregate export now confirms the current website contract:

- POST to the portal-declared Savanna endpoint, using XHR. All four known queries
  return HTTP 200; there are zero GraphQL failures, unknown operations, malformed
  card pages or bounds reached. Three queries are auxiliary, not card sources.
- `getVgcsVgcs` uses offset 0, limit 300, shopId 3, ACTIVATED_DATE / ASC and
  `isHidden: false`. A credential variable is present, but no value or request
  header was exported. Browser-default XHR mode is not proof of cookie-only access.
- The actual response uses `data.account.vgc.vgcViewsV2`, containing `views` and
  `offsetInfo`. One page has 115 rows, 115 distinct card/view IDs, 115 distinct
  application IDs and a reported total of 115. That exactly reconciles the user's
  visible-card baseline for the observed non-hidden scope; it is not a claim about
  every Nintendo purchase, hidden cards, other accounts or legacy platforms.
- Every row exposes id, applicationId/name, apparentPlatform, ownerNaId, userNaId,
  hidden/lending/partial-lending flags, lending expiry, inserted device ID, and
  released-application/add-on/upgrade flags. All 115 platform labels are NX;
  all owner/user pairs match, and all hidden/lending/partial-lending flags are false.
- Released base-application flags are true on 112 cards and false on 3. Released
  add-on flags are true on 13 cards and false on 102; released-upgrade flags are
  false on all 115. These are overlapping flag counts, not mutually exclusive
  product categories. The export does not retain joint counts or prove the three
  base-flag-false cards are DLC-only rather than another state such as unreleased.

The earlier absence of cards was due to helper contract assumptions: excluding
the real `.nintendo.net` endpoint, expecting the reference client's `getVgcs`
operation, and only reading its `vgcViews` response alias. No Nintendo authorization
failure or absent-card condition was demonstrated.

This passes the authenticated response-observation and visible-count check. The
helper deliberately still reports accountIsolationValidated,
ownershipSemanticsValidated and accountLibraryComplete as false: it imports no
data, proves no profile-switch behavior, and has no live lending/borrowing case.
Owner/user equality is useful access evidence, but the field relationship must
not be substituted for an independently established signed-in account identity.
No provider-specific root account ID was found by the currently checked paths.
An independent importer request and its account/save-time guards remain separate
from observing a successful website-owned request. The PlayStation one-page
cookie-only test has been requested while these production gates remain open.

## PlayStation independent-request rejection: confirmed test-format defect

The user's 0.1.5 export reports successful website GETs at offsets 0 and 48 (size
24), including repeated offset-zero requests. The observed pages contain 36 rows
and 35 distinct product IDs, all active with membership NONE. Offset 24 is absent,
so traversal is correctly `not-established`. This partial capture does not revise
the earlier 60-row/59-product result or imply that saved games disappeared.

The separate one-page test returned HTTP 400, not a recognized purchase page.
The user then supplied only its error message: it explicitly identifies potential
Cross-Site Request Forgery and requires an appropriate content type or Apollo
preflight/operation header. Therefore the test failed the server's request-format
check; it did not establish an authentication blocker. Versions through 0.1.5
sent only Accept. The response is a bare error array, not an `errors` envelope.

Version **0.1.6** sends fixed Accept and Content-Type values of application/json,
following the error's stated requirement and [Apollo's GET CSRF documentation](https://www.apollographql.com/docs/apollo-server/security/cors#preventing-cross-site-request-forgery-csrf).
It does not copy authorization headers, Sony client identity, cookies, NPSSO or
tokens. It still requests only one observed safe persisted-query page, without
retry or alternate authentication. Bounded error inspection exports only
allowlisted error categories/codes and request-format metadata; raw server text
stays out of diagnostics.

The user's live 0.1.6 result now confirms independent success: HTTP 200,
recognized-purchase-page, 24 rows, pagesRequested 1, requestFormat
json-content-type, extraAuthorizationHeaders false. The test uses the observed
safe query and browser-managed session. This establishes the narrow independent
purchase-page access gate without copied credentials or a Sony client identity.
It does not establish full pagination or account isolation: the accompanying
website observation contains only offset zero, 24 rows / 23 product IDs, and is
correctly incomplete. The earlier complete 60-row observation remains separate.

The same export has false fetch/open hook-identity flags but a true send flag and
30 fetch / 8 XHR callback counts. Those flags do not establish why offset 24 was
missed: replacing a function can delegate through the previous observer. A
regression control demonstrates that exact false-identity/working-observation
case. No hook reinstallation, timers or website lifecycle changes are justified
from this export. The missing page remains an explicit completeness gap, with
zero ownership or import implications.

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

## Account identity checks: helper 0.1.7

The user supplied only other PlayStation operation names. These include
`getProfileOracle`, alongside subscription, cart, device and download operations.
The inspected [public client implementation](https://github.com/FriendsOfGalaxy/galaxy-integration-psn/blob/master/src/psn_client.py)
uses that operation with empty variables and reads
`data.oracleUserProfileRetrieve.accountId` / `onlineId`. This is a response-path
lead, not signed-in confirmation. The helper now observes those fields' presence
and offers one explicit **Test account lookup** using the current website's
observed public hash, fixed JSON headers and browser-managed cookies. No client
identity, old public hash, authentication headers or identifiers are copied.

The user also supplied Nintendo `state.user` field names, including `obfuscatedId`.
The helper now compares that noncredential candidate against card `ownerNaId` and
`userNaId` locally. Exports contain only per-scope match/missing counts, candidate
presence and an account-change flag. Reobserving the same page replaces its counts.
No assumption is made that these identifiers share a namespace. No token is decoded
and no Nintendo request is added. A mismatch will require a different verified
account binding; it will not be treated as evidence of borrowing.

The user returned the 0.1.7 results: Nintendo has a candidate on every page,
115 owner matches, 115 user matches, zero neither/missing matches, and no account
change. PlayStation's website profile response contains both accountId and
onlineId. The independent account check instead returns HTTP 400, with the user
supplying only this schema error: `Cannot query field "oracleUserProfileRetrieve"
on type "Query"`. The suggestion of other field names is not evidence of an
equivalent account endpoint. This differs from the earlier CSRF rejection. The
exact request-context difference is unestablished; do not guess headers, copy
authorization or treat it as proof the session is logged out. Following the
task's stopping rule, PlayStation remains gated rather than expanding research.

Synthetic tests include
matching IDs, different namespaces, owned/lent/borrowed-shaped relationships,
missing fields, account changes, GraphQL/auth errors, oversized responses and
hostile report redaction. Neither successful field presence nor a match count
alone establishes production account-switch or save-time isolation.

## Nintendo implementation and remaining acceptance check

Production code observes the verified `getVgcsVgcs` website request at document
start and parses only a bounded neutral card projection. It issues no Nintendo
API calls and never retains a request body or credential. Imports require one
contiguous, consistently scoped traversal reaching the reported total. Pending
requests, changed accounts/scopes/totals, duplicate cards, failures, unsupported
filters and stale observation versions reject the import.

An opaque SHA-256 of provider plus signed-in account ID binds the existing GL
profile and tab-bound scan lease. Save-time checks preserve that relationship;
the same source account cannot silently create a second profile under a new
nickname. The existing additive writer validates and saves the full result
atomically, retaining omitted cards, stable record refs, user access corrections
and existing metadata. Binding survives the ordinary backup validator without a
schema-version change. No ownership or matching policy was broadened.

The 115-card live source implies **112 Owned / 3 unconfirmed** under the implemented
conservative projection, not 115 established permanent game purchases. The three
false released-base flags cannot distinguish unreleased games from DLC-only
cards. Reference clients can alias those flags to names such as hasApplication;
that alias is not additional absence evidence. The 13 add-on-positive cards are
retained once each, without fabricated separately named DLC products. Lent-out
cards retain ownership when account-owner evidence supports it; borrowed cards
are not purchases. Lending expiry, when supplied, is retained separately rather
than becoming the owner's access-expiry date.

Primary files: [source projection](../../../src/providers/console-library.js),
[page capture](../../../src/providers/nintendo-capture.js),
[import panel](../../../src/providers/nintendo-content.js),
[existing writer](../../../src/background/storage-writer.js),
[profile validation](../../../src/lib/provider-profiles.js), registry/metadata,
provider UI, runtime manifest/allowlist and focused synthetic tests. A draft
PlayStation projection has no registered provider, page script or import action.

The live helper established **115 raw cards / 115 stable card IDs / 115 software
IDs**, terminal traversal and account equality. It imported **zero** purchases.
Installed production tests import 115 synthetic cards successfully in both
browsers, including actual background persistence. A real production import has
not been performed by the agent and remains a user-side acceptance check:
reload GL, reload Nintendo's portal, choose/confirm the profile and click
**Import loaded cards**. Check 115 observed/imported cards, 112 owned and 3
unconfirmed, inspect known cards, and repeat to confirm no extra records. Hidden,
legacy and non-card purchases are outside this scope. Do not lend a game solely
for testing. The research helper can be removed.

Reproduction: `node --test tests/console-library.test.mjs`, `node tests/run.js`,
`node tests/nintendo-native.mjs` (add `--firefox`), and packaged Providers UI via
`node tests/browser.js --release --ux` (add `--firefox`). All use disposable data;
localhost origin changes and test permissions exist only in the native fixture.

## First production follow-up: false filter error

The user reported a filter-reset error with no selected filters. Their redacted
request uses the same operation and pagination, `sortBy: ACTIVATED_DATE`, but
`order: DESC` instead of the earlier observed ASC. Both optional type/status
filters are absent. The first importer mistakenly required ASC and reported every
unsupported request setting as an active filter. No card import was committed
through that rejected request.

Capture now accepts ASC and DESC, binding all pages to the same ordering as well
as account/locale/shop scope. A direction change mid-traversal remains incomplete.
Empty optional filter objects are also accepted; nonempty unsupported selections
remain blocked. Failures identify the specific check using fixed, value-free
diagnostic codes rather than telling users to reset filters they did not select.
Focused tests include the exact redacted newest-first variable shape and matching
115-card results in either direction. Installed Chrome/Firefox fixtures now use
the reported newest-first request. No provider request, stored ownership,
matching rule or account guard is changed by this correction.

## Validation

Nintendo implementation: **1,210 GL tests** passed, including shared matching
parity, contents regressions and release integrity. **12 packaged Providers UI
checks per browser** passed. Installed full-runtime Chrome and Firefox tests
exercise profile confirmation, complete 115-card capture, 112 owned / 3 unknown,
repeat import, retained omission, account-switch rejection, atomic worker writes
and backup round-trip. The standalone research helper's earlier results below
remain separate from these production tests.

Helper 0.1.7: **27 focused synthetic tests** and installed-helper checks for both
providers in **Chrome and Firefox** pass, including both explicit PlayStation
requests and Nintendo's redacted account-to-card equality counts. These tests
use disposable synthetic pages, not personal accounts.

Previously passed at 0.1.6: **22 focused synthetic tests**, installed-helper checks for both providers
in **Chrome and Firefox**, **1,193 GL unit tests** including shared matching,
repository layout/links, and both production packaging checks. Runtime packages
remain identical to baseline (181 files each). Production importer validation
remains pending and is not implied by these tests.
