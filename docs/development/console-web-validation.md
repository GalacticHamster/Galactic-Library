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
   existing session, without copying authorization headers. Click **Copy summary**.
3. Repeat on [Nintendo Virtual Game Cards](https://accounts.nintendo.com/portal/vgcs/).
   Browse/scroll its card list before updating the summary. The current
   user-reported comparison target is **115 visible cards**, not automatically
   115 products or permanent purchases. Helper 0.1.2 also checks initial page
   data: its `bootstrap` section reports declared Nintendo GraphQL endpoints,
   aggregate card-array counts, and account-identity field names without values.
   Reload the helper and the website when upgrading the helper.
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
**no requests itself**. The separate PlayStation test button explicitly makes
one read-only request, using an observed public persisted-query hash and safe
paging variables at the fixed PlayStation endpoint. It never copies headers,
retries, falls back to other authentication, or imports the response. The observer
ignores mutation documents, authorization headers and
cookies. Nintendo credential-variable **presence** is reported; its value is
never retained or exported. Body parsing is transient and only allowlisted
nonsecret request metadata is retained.

Current candidate contracts:

- PlayStation `getPurchasedGameList` at
  `https://web.np.playstation.com/api/graphql/v1/op`, GET/POST metadata, public
  paging/filter variables, `data.purchasedTitlesRetrieve.games` and `pageInfo`.
- Nintendo `getVgcs` at a Nintendo HTTPS subdomain's GraphQL
  path, with `data.account.vgc.vgcViews.views` and `offsetInfo`. The passive
  observer does not assume a particular API hostname. These paths and
  shapes are based on inspected client code, **not yet authenticated observations**.

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

No account binding or ownership rule has been validated. Reload before switching
accounts. A page can interfere with MAIN-world instrumentation, and aggregate
reports are diagnostic evidence, not authority to import or classify purchases.

## Limits and interpretation

- Observation validates the page-to-extension handoff, **not independent
  extension-issued authenticated requests**. Only a successful explicit PlayStation
  test demonstrates one independent cookie-only page fetch in that browser session.
  Zero observations can mean caching, a captured original fetch, an unsupported
  Request/batched GraphQL shape, a worker-owned request, changed operation/host,
  or failed injection. It does not mean an empty library or an authentication denial.
- Nintendo bootstrap inspection is bounded to the portal's `data`, `state` and
  `meta` JSON blocks, 2 MiB per block and 2,000 visited nodes. Only arrays with
  card and application identifiers are counted; their values are never exported.
  Bootstrap arrays do not establish pagination or account-wide completeness.
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
