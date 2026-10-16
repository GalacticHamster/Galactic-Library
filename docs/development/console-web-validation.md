# PlayStation and Nintendo web-library validation

This is **Phase A**, a separate read-only browser helper. It is not a GL importer.
It does not change GL, call its companion API, or save any purchases. Production
providers remain gated on actual signed-in results. Xbox is outside this task.

## Use your existing signed-in browser

1. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load
   unpacked**, and select the repository folder
   `scripts/research/console-web-validation`. In Firefox, open
   `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and
   open that folder's `manifest.json`. Chrome 111+ / Firefox 128+ is required.
   This loads the separate **GL Console Library Validation (read only)** helper,
   not a replacement Galactic Library extension.
2. First open/reload [PlayStation Library](https://library.playstation.com/) while
   signed in normally. Use its Purchased view, browse/scroll through the games,
   then click **Update summary** in the helper panel. Once available, click
   **Test one read-only request** to check one purchase page using the browser's
   existing session, without copying authorization headers. The test sends fixed
   JSON Accept/Content-Type headers to satisfy the demonstrated CSRF requirement;
   it does not copy a Sony client identity or authentication header. Click
   **Copy summary**. To check full observed pagination, visit every Purchased
   page rather than only the first and last pages; the one-page test does not
   fill gaps in the observation ledger.
   Helper **0.1.7** also recognizes the website's `getProfileOracle` query. Click
   **Test account lookup** once it becomes available, then copy the summary. This
   makes one separate, read-only browser-session request and reports only whether
   the expected account fields exist. It does not export their values or use an
   old hardcoded query hash. If the button remains unavailable, report that.
3. Repeat on [Nintendo Virtual Game Cards](https://accounts.nintendo.com/portal/vgcs/).
   Browse/scroll its card list before updating the summary. The current
   user-reported comparison target is **115 visible cards**, not automatically
   115 products or permanent purchases. Helper 0.1.7 also checks initial page
   data: its `bootstrap` section reports declared Nintendo GraphQL endpoints,
   aggregate card-array counts, and account-identity field names without values.
   Reload the helper and the website when upgrading the helper.
   The `accountRelations` section compares `state.user.obfuscatedId` with each
   observed card's owner/user IDs entirely inside the page. It exports only match
   counts, candidate presence, and a change flag. A mismatch is evidence that the
   identifiers may use different namespaces, not proof of borrowing or account
   failure. No Nintendo test request or credential decoding is added.
   The panel and exported `helperVersion` identify the loaded version. If the
   recognized arrays remain empty, `observerState` distinguishes replaced hooks
   from installed hooks; `resources` summarizes browser-observed Nintendo hosts
   and request kinds without paths or queries. Bootstrap `structure` reports
   only allowlisted field names, value types and key counts, never field values.
4. Return only these aggregate summaries, browser name and whether the observed
   counts correspond to the displayed view. If no panel appears, or zero requests
   are observed, report that rather than copying a HAR or authenticated requests.
5. Choose **Stop observing**, disable/remove the temporary helper, and reload the
   site after the check. Reloading discards its in-memory observations. Observation
   stops automatically after 15 minutes; already collected summaries stay in page
   memory until reload. Nothing is written to browser storage by the helper.

If clipboard access is blocked, the helper opens **Aggregate diagnostics** and
selects its text; use Ctrl+C. No password, cookie, token, account ID, raw response,
title list or screenshot of account details is required.

## What it measures

The MAIN-world observer starts at document start. It forwards original fetch/XHR
calls unchanged and observes only candidate read-only GraphQL requests. It makes
**no requests itself**. Each separate PlayStation test button explicitly makes
one read-only request, using an observed public persisted-query hash and safe
paging variables (or empty account-query variables) at the fixed PlayStation endpoint. It never copies headers,
retries, falls back to other authentication, or imports the response. The observer
ignores mutation documents, authorization headers and
cookies. Nintendo credential-variable **presence** is reported; its value is
never retained or exported. Body parsing is transient and only allowlisted
nonsecret request metadata is retained.

The test's fixed `Content-Type: application/json` follows the server's observed
CSRF rejection and [Apollo's documented GET requirements](https://www.apollographql.com/docs/apollo-server/security/cors#preventing-cross-site-request-forgery-csrf).
The browser may issue its normal CORS preflight; there is still only one requested
GraphQL purchase page, with no retry. The export includes `requestFormat` and,
on failure, an allowlisted `errorCategory` / `errorCodes`. Error bodies/messages,
identifiers and credentials are never copied into the summary. Error inspection
uses the same 2 MiB response bound and accepts both GraphQL error envelopes and
bare error arrays.

Current candidate contracts:

- PlayStation `getPurchasedGameList` and `getProfileOracle` at
  `https://web.np.playstation.com/api/graphql/v1/op`, GET/POST metadata, public
  paging/filter variables, `data.purchasedTitlesRetrieve.games` and `pageInfo`.
  Profile observation separately checks `data.oracleUserProfileRetrieve.accountId`
  and `onlineId` presence. Profile responses never become games or pagination.
- Nintendo `getVgcsVgcs` (current website) and `getVgcs` (inspected client) at a Nintendo HTTPS subdomain's GraphQL
  path, including the exact portal-declared endpoint
  `https://wb.lp1.savanna.srv.nintendo.net/graphql`, with
  `data.account.vgc.vgcViews.views` and `offsetInfo`. The signed-in user confirmed
  that endpoint from `shopGraphQLApiUrl`. Versions through 0.1.3 incorrectly
  excluded it because it is not under `nintendo.com`. Version 0.1.4 recognizes
  that exact Savanna origin/path without allowing arbitrary `nintendo.net` hosts.
  `getVgcTotalsVgcs`, `getDevicesVgcs` and `getAllDevicesVgcs` are reported
  separately as auxiliary queries and never supply card rows or pagination totals.
  The helper recognizes either `vgcViews` or `vgcViewsV2` as one list; it rejects
  responses containing both instead of combining independent lists. The current
  website's `vgcViewsV2` response shape has been validated by the 115-card result. Bounded
  `responseShape` diagnostics expose only fixed paths, field types and key counts
  if the response differs, so raw response contents are unnecessary.

It reports request method/endpoint/recognized operation, paging and scope, raw
rows per observed page, distinct response IDs, distinct product/application IDs,
field presence, bounded platform/flag histograms and owner/user equality counts.
Identifier values, titles, raw source text and session credentials never leave
the page. The isolated-world panel re-projects messages through another strict
allowlist before displaying/copying them. It has no privileged API or write path.

Counts keep card/view IDs, software IDs and PS response IDs in separate domains.
Repeated pages replace earlier observations of the same offset/scope. Different
filters remain separate scopes and must not be added together as distinct games.
`terminal-range-observed` means only contiguous observed rows reached that scope's
terminal page/total. It is not an account-completeness or authorization verdict.

Account checks are diagnostic evidence, not production account authorization.
The Nintendo candidate has not yet been shown to share the card-ID namespace;
the PlayStation account test has not yet been exercised on the signed-in site.
Reload before switching
accounts. A page can interfere with MAIN-world instrumentation, and aggregate
reports are diagnostic evidence, not authority to import or classify purchases.

## Limits and interpretation

- Observation validates the page-to-extension handoff, **not independent
  extension-issued authenticated requests**. Only a successful explicit PlayStation
  test demonstrates one independent cookie-only page fetch in that browser session.
  Its separate account test establishes account-query access only when successful;
  it does not exercise production save-time or account-switch guards.
  Zero observations can mean caching, a captured original fetch, an unsupported
  Request/batched GraphQL shape, a worker-owned request, changed operation/host,
  or failed injection. It does not mean an empty library or an authentication denial.
- Nintendo bootstrap inspection is bounded to the portal's `data`, `state` and
  `meta` JSON blocks, 2 MiB per block and 2,000 visited nodes. Only arrays with
  card and application identifiers are counted; their values are never exported.
  Bootstrap arrays do not establish pagination or account-wide completeness.
  Structural summaries are limited to 12 distinct object shapes per block;
  arbitrary property names are omitted. Resource summaries inspect at most
  1,000 timing entries and retain at most 30 Nintendo-host/request-kind groups.
  Neither source makes a network request. An installed hook is not proof that
  all requests pass through it; cached functions, frames and workers may differ.
  Conversely, a false hook-identity flag does not prove observation stopped:
  a website wrapper can still delegate through the observer. Missing pages remain
  incomplete regardless of the hook flags; the helper never fights/reinstalls hooks.
- Only string fetch bodies and ordinary XHR bodies are parsed. Unknown operations
  are counted without exporting their text. Non-JSON/oversized recognized responses
  are reported as malformed, without their error bodies.
- Limits: 20 request contracts, 64 pages, 20,000 page rows, 1,000 rows/page and
  2 MiB/response. Bound failures remain explicitly incomplete.
- Hidden/lent/borrowed/PS Plus semantics are not inferred. `isHidden: false` in
  a query proves the requested scope, not that hidden cards do not exist. No
  lending action or mutation is performed. Missing entries never imply lost ownership.
- An absent product ID is not replaced with a title ID. Unsupported stable account,
  edition, base/DLC or ownership evidence must be resolved before production import.

## Reproduce and package

```powershell
node --test scripts/research/console-web-validation.test.mjs
node scripts/research/console-web-validation-native.mjs
node scripts/research/console-web-validation-native.mjs --firefox
node scripts/research/package-console-web-validation.mjs
```

The ZIP is generated under ignored `audit-artifacts/console-web-validation/` using
the existing ZIP writer. No audit response or inventory is packaged. Native tests
install the actual helper scripts in disposable Chrome/Firefox profiles, with
only the origin classifier/match patterns adapted to synthetic localhost pages.
Provider fetches are mocked. Those tests prove installed script worlds, the UI,
pagination diagnostics, redaction, the explicit one-page test and Stop; they do not
prove Sony/Nintendo access. Native tests also count 115 synthetic bootstrap cards
without exposing their IDs; bootstrap privacy and bounds have focused unit tests.
