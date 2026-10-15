# Xbox Collections v7 authorization experiment

Date: **2026-10-15**. Research baseline: `6341cd6`. Continues [ownership beyond cloud gaming](XBOX_OWNERSHIP_BEYOND_CLOUD.md). Research only: no production provider, extension permissions, library changes, HB or FAN changes.

## Result and next action

**User setup required; real Collections authorization has not been tested.** A standalone, dependency-free research harness is ready and tested with synthetic Microsoft responses. No GL-owned app registration or authenticated Microsoft account was available to this investigation. Neither a Collections ticket nor real entitlement rows have been obtained. This is not a finding that Microsoft denied access.

**Next action:** register a GL-controlled personal-account public client using the settings below, then run the harness. It requests only `service::collections.mp.microsoft.com::MBI_SSL`. If that permission is rejected, it stops. If a resource token is issued, it attempts one read-only `POST https://collections.mp.microsoft.com/v7.0/collections/query`. Only a successful, recognized endpoint response establishes query access; signing in or receiving an arbitrary Microsoft token does not.

The new account evidence strengthens this priority: the user reports order-history navigation reaches only approximately seven years back, leaving older Xbox 360 purchases inaccessible there. The 37-game cloud library remains unsuitable as the primary full-library source. Neither observation establishes what Collections will return.

## Registration and authorization findings

- Microsoft documents Entra registration supporting **personal Microsoft accounts**, public desktop clients, and [Authorization Code with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow). A public client must not ship a client secret. The experiment uses the personal-account `consumers` authority, not an organizational tenant or another developer's application identity.
- For this local research tool, the supported native system-browser configuration is **Mobile and desktop applications**, using a localhost redirect. Microsoft ignores the port when matching native localhost redirects, but the path must match. See [desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration) and [redirect URI restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url). This is a local Node public client, not a shipped browser-extension authentication implementation.
- The pinned [consumer Collections implementation](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Services/XboxStoreClient.cs) supplies an MSA ticket for the exact legacy Collections scope in the query's beneficiary body. Its client identity and legacy implicit authentication were **not** copied. The research harness instead uses an application ID supplied by its operator, Code + PKCE, and the observed v7 request schema.
- **Unresolved permission gate:** the reviewed Microsoft documentation does not establish that a newly registered personal-account public client can request this legacy resource through the v2 authority. Generic Code + PKCE support does not establish resource authorization. Nor was a documented Xbox-specific registration/approval recipe found for this consumer Collections grant. Publishing, cloud-gaming, and title-service credentials are not substitutes. An actual attempt is needed; approval requirements must not be invented from an error alone.
- No separate public portal permission entry for this Collections resource was established. Microsoft Graph permissions and `XboxLive.signin` do not answer this question. The tool requests the resource scope dynamically; it does not define its own similarly named scope or attempt a token exchange through another service. See Microsoft's [resource and scope model](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc).

## Exact user setup

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) in a directory where you are permitted to register an application. Choose **Entra ID → App registrations → New registration**. Microsoft's [registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) describes the directory and registration prerequisites. If you cannot create an app there, stop: that is a registration/setup limitation, not evidence about Collections permission.
2. Name it **Galactic Library Xbox Collections Research**. Select **Personal Microsoft accounts only** for supported account types. Do not select organizational accounts only. The directory used to administer the registration is distinct from the personal Xbox account consenting to the experiment.
3. Under **Authentication → Add a platform**, select **Mobile and desktop applications**. Add the custom redirect URI **`http://localhost/callback`**. Do not register it as Web or Single-page application. Do not add several localhost entries differing only by port; the harness uses a random port under the documented native localhost exception.
4. Enable **Allow public client flows** if the portal offers that switch. The actual flow here is Authorization Code + PKCE with a native redirect, not device code, ROPC, or implicit authentication. Leave implicit access-token and ID-token grants disabled. Create **no client secret or certificate**.
5. No Microsoft Graph permission is used. A default Graph permission can be removed; the harness never requests it. Do not add an API exposed by your own app to imitate the Collections scope. The single requested scope is **`service::collections.mp.microsoft.com::MBI_SSL`**. If Microsoft rejects it or requires resource-owner approval, stop and record the sanitized outcome rather than adding unrelated permissions or trying another application's ID.
6. Copy **Application (client) ID**, a public GUID, from Overview. This is the only registration identifier the tool needs. It does not need Directory ID, Object ID, passwords, secrets, cookies, codes, or tokens. Use a registration you control; the tool can validate GUID syntax but cannot independently prove registration ownership.

## Run the experiment

Requires Node 20 or later, a local terminal, Chrome or Firefox, and network access to Microsoft's login service and Collections endpoint. Run from the Galactic Library repository:

```powershell
node scripts/research/xbox-collections-auth.mjs --client-id YOUR_OWN_APP_GUID
```

Replace the placeholder with your Application (client) ID. Open the printed **localhost** URL in either browser. Click **Sign in and test one read-only query**. Enter account credentials only on Microsoft's own sign-in pages, and consent only if the account and requested resource are correct. Do not send credentials or token-bearing captures to the developer.

The tool requests Code + S256 PKCE, a random one-use state, and `form_post` callback delivery so authorization codes are not put in the callback URL. It exchanges the code without a secret and tests the returned ticket at Collections. It does not request `offline_access`, `openid`, `profile`, or `XboxLive.signin`; it does not retain refresh or ID tokens. If Microsoft returns a scope list, the exact requested scope must be present. An opaque token is not treated as verified merely by decoding it.

After the first successful query, the local page shows aggregate statistics and whether a continuation exists. **Read the next page** explicitly requests one additional page. Continue until `source-exhausted` / `traversalComplete: true`, or a stop condition. There is no automatic bulk traversal, retry, alternative endpoint, or catalog hydration. The bound is 40 pages at a requested page size of 100. Rejection, expiry, malformed responses, continuation cycles, and the page limit stop traversal; preceding pages remain partial evidence.

**Check exact ID locally** compares an already-known product ID and optional SKU against the pages held in memory. It makes no network call, returns only counts, and never fuzzy-matches titles. Use identifiers from your own known Store/product links where available, including legacy GUIDs. This can check known 360/One purchases, never-played titles, redemptions, delisted games, DLC, editions, Gold claims, and subscription examples; it cannot discover missing identifiers from a title. An absent ID means only **not observed in pages read**, not unowned. A present row does not by itself establish permanent ownership.

Click **Close session and discard data**, or use Ctrl+C, when finished. A session also expires after 15 minutes. Re-running requires a fresh sign-in attempt; no refresh capability is saved. A Microsoft error page that never calls back is not a measured endpoint denial: report only its symbolic/numeric error code and the stage reached, then close the tool.

## Outcomes to distinguish

| Observed outcome | What it establishes / next action |
| --- | --- |
| No app registration or local harness cannot start | Setup not complete; no authorization finding. |
| `registration-or-client-configuration` | Client/account/platform settings need inspection. Does not prove the resource is unavailable. |
| `unsupported-flow` | The tested flow was rejected. Do not silently switch to implicit auth or another application's ID. |
| `resource-scope-rejected-by-tested-authority` | This exact scope/resource request was rejected by the tested authority. Preserve sanitized error name/AADSTS code; it does not prove every Microsoft registration mechanism is impossible. |
| `authorization-denied-or-cancelled` | Authorization was denied or cancelled; stop. It is not necessarily a global Microsoft policy decision. |
| `resource-scope-not-granted` | Token response explicitly lists other scopes; no query is attempted. |
| Token issued, endpoint rejects | Token issuance did not establish v7 access. Record token/query HTTP statuses and sanitized endpoint error, without the token. |
| Endpoint 200 with recognized `items` and continuation shape | Query authorization demonstrated for this app/account/request. Inspect counts and optional continuation next. |
| Transport or unrecognized response | No successful query finding; retained successful pages are partial. |
| Terminal continuation reached | This particular query was exhausted. **Not proof of complete Xbox ownership**, historical coverage, or permanent grants. |

The aggregate summary includes token/query status, pages requested and parsed, entitlement rows, distinct product IDs, distinct SKU values and product/SKU pairs, both observed product-type fields, license statuses, ownership types, and continuation state. Known enum values are counted; unexpected strings are counted as `unrecognized` rather than echoed. Raw rows, legacy IDs, SKU distinctions, and original response fields are retained only in session memory, without heuristic filtering. `ownershipEstablished` and `accountLibraryComplete` remain false. The tool does not identify platform generations or purchase mechanisms from unsupported assumptions.

Report only these aggregate results, sanitized error names/AADSTS numbers, and whether your locally checked examples were observed. Do not share the callback, authorization URL with state, token responses, cookies, screenshots of account details, or raw inventory.

## Safety and experiment limits

- No file writes, GL database calls, production imports, credential persistence, or token-bearing logs. HTTPS requests go only to the fixed token and query endpoints, with redirects rejected and a 20-second per-request timeout. Local UI actions require exact localhost host/origin and a random nonce; the OAuth callback instead requires its one-use random state. Request/response sizes and traversal are bounded. Failures expose only allowlisted codes and up to five numeric AADSTS codes.
- The server binds IPv4 loopback only. Browser pages disable caching and referrers, reject framing, and contain no external assets or scripts. Raw provider rows and credentials are cleared on close; JavaScript reference clearing is not cryptographic memory erasure. The browser/Microsoft may maintain ordinary sign-in cookies or history independently. Closing this tool does not sign the user out of Microsoft.
- The tool implements the small documented protocol directly, without MSAL or a backend. It is an authorization research harness, not a production authentication library or provider. Tests substitute all remote Microsoft responses; they do not certify real permissions, consent, redirect acceptance, or endpoint schema.
- The query's market is `US` and requested types are `Game`, `Durable`, `Application`, and `Pass`, matching the inspected consumer request. No claim is made about excluded product classes, region-specific differences, license fields not returned, or older Xbox licenses. Retain those as empirical coverage gates.

## Chrome/Firefox and future integration gates

This experiment uses either browser as a system browser with a **local Node callback**. It does not need extension permissions or modify installed extensions. Real Microsoft authentication in either browser remains untested pending registration.

For a future extension-only implementation, use each browser's supported identity flow and the **actual** `identity.getRedirectURL()` result for stable released extension identities. [Chrome `launchWebAuthFlow`](https://developer.chrome.com/docs/extensions/reference/api/identity) and [Firefox `launchWebAuthFlow`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow) return the final redirect URL. They do not deliver a native form-post body, so this harness's callback mode cannot be copied unchanged. Validate code + PKCE with the extension redirect, registration platform, token endpoint CORS, and no URL logging separately; see [Firefox redirect URL guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/getRedirectURL). Node success would not prove either extension flow works. No localhost helper or backend is proposed as a hidden production dependency.

Only after real authorization and representative enumeration succeed should an isolated provider design address:

- Stable consenting account/profile binding. This experiment deliberately requests no profile scopes and provides no verified account identifier; do not infer a GL account from a nickname or another provider.
- Product/SKU and legacy identifiers without catalog dependence; explicit permanent, conditional, expired, revoked and unknown grants without purchasability/Game Pass heuristics.
- Additive imports, continuation checkpoints, incomplete-query indicators, and no ownership loss inferred from absence.
- Existing GL ownership overrides, immutable source provenance, account isolation, atomic importer validation, and backup/restore.
- Minimal justified host/identity permissions and browser-specific redirect/refresh behavior. No production permission set is committed by this experiment.

**Recommendation: Conditional Go for this own-registration experiment; Defer the production Xbox provider.** Scope acceptance, authenticated query access, historical 360 usefulness, license semantics, account binding, and extension-only authentication are still gates. There is no confirmed approval denial and no basis to promise completeness or 1.0 inclusion.

## Validation actually executed

The research tests use disposable localhost servers and synthetic remote responses: no Microsoft login, live Collections request, personal inventory, or installed library is used. They cover own-ID input, PKCE and scope boundaries, single-query behavior, sanitized error outcomes, denial, replay and cross-origin rejection, explicit pagination, exact local checks, continuation cycles and partial failures, close/late-response cleanup, and aggregate-only reporting.

Executed in a disposable checkout without ignored/private audit inputs:

| Check | Result |
| --- | --- |
| `node --test scripts/research/xbox-collections-auth.test.mjs scripts/research/xbox-entitlement-page-contract.test.mjs scripts/research/xbox-library-passive-probe.test.mjs` | **24 passed**, including 11 new authorization-harness tests. Remote calls are mocked. |
| `node tests/run.js` | **1,193 passed**, including shared matching parity. |
| `node scripts/check-repository-layout.mjs` | Passed: 510 tracked files, 239 local Markdown links. |
| `node scripts/package-release.mjs --check` | Passed: 181 runtime files; package hash identical to baseline. |
| `node scripts/package-release.mjs --firefox --check` | Passed: 181 runtime files; package hash identical to baseline. |

No real Microsoft registration, consent, token, Collections request, Chrome/Firefox authenticated flow, or account-library completeness test was executed. Those results must be added only after the user completes the registration and runs the experiment. No credentials or raw inventory should be committed with them.
