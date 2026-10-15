# Xbox ownership: consumer web-source follow-up

**Updated direction:** The user's signed-in test showed 37 visible Owned games from a `CLOUDGAMING` request despite hundreds of purchases. The [beyond-cloud investigation](XBOX_OWNERSHIP_BEYOND_CLOUD.md) supersedes the CAS-first recommendation below, prioritizing consumer Collections authorization and legacy/order-history coverage. The unobserved raw response must not be equated with those 37 cards.

Research date: **2026-10-15**. GL baseline `0eb8b6d`. This supersedes the Xbox **Defer** recommendation in the [initial audit](XBOX_INTEGRATION_AUDIT.md). Research only: no production provider, permissions, saved accounts or libraries changed. No signed-in Microsoft account was accessed. No third-party application code was executed.

## Decision: CONDITIONAL GO for a useful partial importer

The first audit stopped too early at publisher APIs and played-title history. Microsoft's current web application contains a separate **consumer Content Access service** with explicit access categories. XboxOwnershipFilter also implements a **consumer MSA Collections query**, distinct from the publisher-only interface. These are concrete leads for purchases that have never been played.

Prioritize an authenticated, page-local Content Access validation, followed by an additive partial import if its Owned semantics hold. Supplement with identifiable order-history purchases. Do not promise an entire historical Xbox collection yet: delisted/legacy completeness, permanent-grant semantics and a legitimate extension authentication handoff remain unverified. A partial importer is worthwhile; missing products must remain unknown rather than be deleted or labeled subscription-only.

**Evidence levels:** “source-verified” below means the inspected public implementation actually contains the call/field. It does not mean an authenticated request succeeded. The only endpoint behavior exercised here was an unauthenticated CORS preflight.

## 1. Where the current web Library gets its lists

Inspected public assets linked by [play.xbox.com/library](https://play.xbox.com/library): [Library route](https://play.xbox.com/assets/LibraryRoute-drgzsn5p.js), [Library page](https://play.xbox.com/assets/LibraryPage-j4j11fb0.js), [application systems](https://play.xbox.com/assets/entry.client-mg5cb0xn.js), and [Content Access SDK/decoder](https://play.xbox.com/assets/service-sdk-adaptors-hlovo3lp.js). These are moving deployments; the fingerprints below identify this inspection.

The Library route preloads catalog and access adaptors. `contentAccess → allContentAccess → services.contentAccess` uses the web service when a native host bridge is unavailable. The service makes:

`GET https://contentaccess.exp.xboxservices.com/all/v1?market={market}&offering={offering}`

This is a binary Protocol Buffers response, decoded as `ContentAccessAllV1Response`, not GraphQL or an HTML purchase list. Source fields include:

| Structure | Information exposed by the client schema |
| --- | --- |
| `productsByProductId` | Microsoft product IDs; static product kind and supported-platform flags |
| Per-product `accessByUserId` | Separate user access and aggregate access flags; aggregate acquisition/start/end dates |
| `passesByPuid` | Pass status and dates; renewal/indirect-customer fields |
| `revokedProductsByProductId` | Per-user revoked-access flags and revocation dates |

The schema includes games, durables, applications and bundles, and PC/Gen8/Gen9 platform bits. It does **not** expose purchase transaction rows or SKU-level acquisition history in this decoded response. Exact-edition expansion is therefore a separate catalog/evidence task.

### Owned is a filtered view, not a full-account export

The application's `resolveCatalogs` / `resolveCatalogItems` split access types into Owned, Game Pass, EA Play and other categories. Owned requires a first-party provider plus the **user** Owned flag. Game Pass and EA Play use their own access flags. Games with Gold is separate. Aggregate access must not be substituted for personal ownership.

Important incompleteness: `allProductAccess` keeps game products, the ordinary-browser union excludes non-streamable entries, catalog hydration can exclude missing products, and assembly applies platform/playability gating. Consequently, scraping only displayed Owned tiles loses information already present upstream. The client request has no visible continuation loop; a single binary response is **not proof** that the service returns every historical purchase. The request is market/offering-specific. These findings come from the application systems asset above.

| Question | What is established / still unknown |
| --- | --- |
| Console versus PC/cloud | Schema supports console and PC; the rendered browser list is playability-filtered. Actual raw account scope must be measured. |
| Never played | Access enumeration is separate from title-history enrichment; no played-title predicate is needed to obtain raw access. Actual never-played inclusion needs a signed-in control. |
| Older/delisted purchases | No source-level date cutoff found in this call. Backend retention, legacy migration and catalog failures remain untested. Retain identified raw entries even if catalog lookup fails. |
| Pagination | CAS client requests one response; UI uses a virtual grid. Neither reaching the last visible tile nor a successful response establishes historical completeness. |
| DLC/editions | Raw schema has durable/bundle kinds; visible game list discards those kinds. Product IDs help; no proof every DLC or purchased edition is returned. Do not flatten to Xbox title ID. |
| Permanent ownership | Explicit Owned is stronger than activity. It is still a service access assertion, not a receipt or proven irrevocable purchase. Check Gold, shared access, trials and disc-derived grants before mapping it to GL owned/claimed. |

### Authentication and browser restrictions

The SDK uses the site's authenticated fetch/token-provider mechanism. The application obtains an Xbox token for the request URI and supplies its authentication header; existing Microsoft cookies **alone** are not the endpoint's authorization mechanism. The web client requests no signature for this service. Authentication lifecycle remains Microsoft's responsibility in the preferred page-local design.

An unauthenticated **OPTIONS** request, using the inspected origin and requested headers, returned **204**, allowing `https://play.xbox.com`, GET, and `authorization, calling-app-name, calling-app-version, ms-cv`. This verifies first-party web CORS support, not authenticated access or extension-origin support. No token/cookie was sent.

GL should observe a bounded, sanitized result inside the user-opened page, not extract its token cache or impersonate a Microsoft client. Extension service-worker host permission can enable cross-origin transport, but does not supply endpoint authorization; content scripts also face origin restrictions. [Chrome's network model](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). Chrome and Firefox page bridges need separate validation. Package any decoder locally; do not load remote executable SDK code into the extension.

## 2. XboxOwnershipFilter: actual implementation and its limits

Inspected revision **`d38fa099a9c160575c04a4be508f3d1495dc3a9a`**, not just its README. Relevant [XboxStoreClient.cs](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Services/XboxStoreClient.cs) locations:

- Lines 40–45 / login methods: public client ID `0000000048093EE3`, Live desktop redirect, implicit access-token login with scope `service::collections.mp.microsoft.com::MBI_SSL`. The embedded Playnite webview intercepts the token fragment. This is not a desktop-secret exchange, but neither is it an approved GL OAuth registration.
- `GetEntitlementsAsync` (389–473): POST `https://collections.mp.microsoft.com/v7.0/collections/query`, MSA beneficiary ticket **inside JSON**, 100 items/page and continuation tokens; 40-page safety cap flags incomplete results.
- `ResolveCatalogAsync`: GET `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=...&market=...&languages=en-US&fieldsTemplate=details`, batches of 20. Maps Store products to PFNs/title IDs.

The consumer query filters game/durable/application/Pass kinds, then the candidate step requires Active + Full. No separate validity-date check was found there. Do not import its “purchases only” comment as an independently established service guarantee.

The [wire-model definitions](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Services/XboxStoreClient.cs#L1385) retain product/SKU/title IDs, ownership type, status, tags and acquired/start/end dates. They do not retain transaction IDs or an explicit purchase-versus-subscription acquisition field. `ownershipType` is reported, not used as a reliable shared-versus-personal purchase discriminator. Thus its result alone cannot validate those distinctions for GL.

### Ownership verdicts are partly heuristics

`ClassifyEntitlements` (562–835) calls a held SKU Purchased when the catalog says it is purchasable. Missing catalog facts or an unknown held SKU also pass that predicate. A product with no purchasable SKU is counted as delisted/owned. Bundle grants use acquisition dates within five minutes, sometimes with shared tags—not verified equal transaction IDs. Optional add-on inference broadens the result further. These are useful filtering choices for Playnite, **not confirmed-purchase evidence**.

The output [OwnershipSet](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Models/OwnershipSet.cs) matches PFNs/console title IDs against existing Playnite entries. It is not a complete library-import implementation, nor proof of edition identity. Entitlement enumeration itself is independent of launch history and could discover never-played products if returned. Older/code/DLC coverage remains backend-dependent. Its [README](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter) explicitly offers assumed-delisted and optional grant categories; the claim that everything unmatched is Game Pass is unsuitable for GL.

**Browser verdict:** HTTP request construction is portable; login is not portable merely by copying the client ID. A normal signed-in tab does not automatically possess an MSA ticket for Collections. Establish a legitimate supported GL auth flow or a first-party page route before using this service. Do not store refresh tokens or ask the user to copy access tokens. Prefer CAS because its actual browser caller has now been located.

## 3. Other approaches and endpoints

| Source / verified implementation | Endpoint or source location | Assessment |
| --- | --- | --- |
| Current Xbox web entitlement detail | `POST https://emerald.xboxservices.com/xboxcomfd/entitlements/bulk?locale=...&getRecurrenceInfo=...` | Application asset's `fetchBulkEntitlements`: requires supplied ProductIds, Xbox auth; schema includes trial, satisfying-product, recurrence and end-date fields plus continuation token. Detail/enrichment, not unknown-product enumeration. Caller clamps page size to 50; a token alone does not prove this caller exhausts it. |
| Microsoft personal order history | `https://account.microsoft.com/billing/orders/` | Existing signed-in page with date ranges and Completed/Redeemed states. Strong identifiable transaction evidence; subscription charges aren't game purchases. Authenticated data endpoint, stable line-item IDs, refund fields and historical limits not inspected here. [Official help](https://support.microsoft.com/en-us/accounts-billing/view-your-microsoft-store-order-history). |
| Legacy Xbox inventory | `GET https://inventory.xboxlive.com/users/me/inventory` | Official docs describe continuation, availability/state, and optional satisfying-entitlement expansion including migrated 360 purchases. Auth/user-hash scope matters; docs restrict supported caller environments. Not proven callable by GL today. Possible legacy supplement, not the first implementation choice. [Endpoint](https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/live/rest/uri/marketplace/uri-inventoryget?view=gdk-2604), [caller restrictions](https://learn.microsoft.com/en-us/xbox/gdk/docs/reference/live/rest/uri/marketplace/atoc-reference-marketplace?view=gdk-2604). |
| Playnite standard Xbox importer | [XboxAccountClient.GetLibraryTitles](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/XboxLibrary/Services/XboxAccountClient.cs) | Titlehub history plus installed discovery remains insufficient for ownership. Useful title-ID enrichment only. |
| OpenXbox web API | Revision `672f34f256f18640d387147867950234fc2e140f`, [Titlehub provider](https://github.com/OpenXbox/xbox-webapi-python/blob/672f34f256f18640d387147867950234fc2e140f/xbox/webapi/api/provider/titlehub/__init__.py) | Actual provider calls `titlehub.xboxlive.com/users/xuid(...)/titles/titlehistory/decoration/...`. Inspected provider tree has no Collections/CAS ownership enumerator. OAuth/Xbox token plumbing isn't evidence of purchase discovery. |
| Better xCloud | Revision `f8397043f6d2148d2345d508902a38c69cf1ee20`, [network hooks](https://github.com/redphx/better-xcloud/blob/f8397043f6d2148d2345d508902a38c69cf1ee20/src/utils/network.ts) | Actual browser fetch interception supports page-context feasibility. Its `catalog.gamepass.com/sigls/` lists describe catalog/cloud availability, not personal purchases; do not turn BYOG eligibility into ownership. |
| GOG Galaxy Xbox integrations / library-export extensions | Public-source search did not establish an additional current consumer ownership enumerator | The presumed FriendsOfGalaxy Xbox repository URL returned 404. No stronger reproducible ownership route found in this branch of the search. Not proof none exists; no completeness claims based on a Galaxy method named “owned.” |
| Official StoreServices / Collections publisher APIs | [Microsoft library](https://github.com/microsoft/Microsoft-Store-Services), [v9 publisherQuery](https://learn.microsoft.com/en-us/xbox/gdk/docs/store/commerce/service-to-service/microsoft-store-apis/xstore-v9-query-for-products?view=gdk-2604) | Publisher/product-scoped backend contracts; not a consumer all-library entitlement grant. Distinct from the discovered MSA v7 caller and CAS. |

Microsoft explicitly warns that **unauthorized publisher queries can report Game Pass-derived access as Single/direct ownership**, and that subscription end dates can be normalized. This warning concerns **v9 publisherQuery**; it does not prove v7 MSA or CAS behaves identically. It does prove that reusing field names/maximum end dates as universal ownership proof is unsafe. [Game Pass response semantics](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/xstore-detecting-game-pass?view=gdk-2604).

## 4. Combining sources without inventing ownership

Recommended future evidence handling, not implemented policy:

1. Keep account-bound observations per source. Join only verified Store product/SKU or documented catalog alternate IDs. Title IDs/PFNs can relate products, but must not collapse deluxe/base editions or DLC. Title similarity is not a purchase join.
2. CAS Owned provides a candidate owned/claimed observation, subject to the signed-in gate below. Preserve subscription, Gold/conditional, disc/shared, trial and revocation observations separately. Inspect **personal** flags; do not union other users or aggregate access into a personal grant.
3. A completed identifiable purchase/redemption can supplement missing CAS entries. Preserve its date and source; reconcile explicit refund/revocation against the affected acquisition. Do not turn an old receipt into a guarantee of present access. Keep independent valid purchases intact.
4. Catalog metadata enriches identities; price, purchasability, delisting, five-minute coincidence and add-on ownership do not establish a purchase. Subscription catalog membership also does not establish that the user lacks a separate purchase.
5. Played/installed observations remain activity/unknown unless separately supported. Absent from any partial list means **not observed**, never “not owned,” “Game Pass,” or delete.

Expose scope honestly: “Imported purchases/access observed on Xbox web” with unavailable-product counts and scan bounds. Even a fully traversed CAS response is a complete *source response*, not a proven complete Microsoft account. Keep additive synchronization and existing GL user corrections.

## 5. Minimal safe signed-in validation

No Microsoft session was available to this investigation. The following is the next gate, not a request for secrets or an assertion that it already passed.

1. In your normal browser, sign into `play.xbox.com` yourself. Open Library → Full library → Owned and compare locally with a few purchases you know: never launched, older console, delisted if available, PC-only, code redemption, DLC and a deluxe edition. Also check a subscription-only game, trial, Gold claim and shared/disc-only title where applicable. Missing test categories stay explicitly untested.
2. For a metadata-only check, open DevTools Network, filter `contentaccess`, reload, and report only whether `/all/v1` succeeds, its status and approximate response size. Do not copy headers, bodies, tokens, cookies or HAR files. Network GETs here are made by the website, not GL.
3. Optional aggregate inspection: open the Xbox **home page**, paste the locally reviewed [passive probe](../../../scripts/research/xbox-library-passive-probe.js) into a DevTools Snippet, run it, then call `GLXboxOwnershipProbe.install()`. Navigate to Library **using the site's links**, then call `GLXboxOwnershipProbe.report()`. It watches only the exact CAS GET that the site itself makes, clones its response, and emits anonymous per-user counts of raw flags/platforms/product kinds. It never initiates a request or reads credentials. Use `stop()` afterward; reloading removes it. Do not paste unfamiliar code blindly or bypass a browser safety prompt.
4. An empty report means the hook saw no matching fetch: it may have been installed after a cache fill, the app may have captured fetch earlier, or deployment may have changed. It is not an empty library or auth failure. A decoding limitation is also not an ownership finding. The probe doesn't observe XHR/native bridge traffic.
5. Compare visible Owned count with raw Owned-flag game counts. Multiple anonymous user slots require account-scope investigation, not summing. Aggregates alone cannot establish which historical titles were included; use the local UI controls/order history for known examples. If non-visible raw products need validation, build a separately authorized local diagnostic that checks known public product IDs, without exporting the inventory.
6. On `account.microsoft.com/billing/orders/`, inspect the known examples and oldest available date windows locally. Note whether product links expose Store IDs and statuses distinguish refunds. Return only yes/no/schema findings, not order IDs, payment details or account data. Do not guess an internal order endpoint.
7. Before production: verify the packaged page bridge, account switching, repeated enumeration/idempotency, partial failures and Chrome/Firefox independently. Stop on 401/403/challenges; no authentication workaround.

The probe retains at most **20 aggregate responses**, bounds each read at **8 MiB**, uses a bounded partial protobuf reader, exports no titles/product IDs/account IDs or query values, and writes no storage. Its anonymous slots are per response and cannot identify an account across calls. It does not validate dates, map unknown access bits, decide permanent ownership, prove full enumeration or distinguish all revocation causes. Failed/truncated schema inspection stops at diagnostic failure. This is a research tool, not production provider code.

## 6. Smallest useful GL implementation after validation

Use the existing provider path: Xbox registry/metadata allowlist → exact-origin provider-page adapter → explicit stable profile binding → sanitized access observations → validated additive atomic imports. See [initial GL integration boundaries](XBOX_INTEGRATION_AUDIT.md#gl-implementation-path-if-revisited). Retain product IDs even when catalog hydration fails, with unknown title/access details visibly incomplete. Add order-history observations separately only after stable product linkage is demonstrated.

Begin with validated personally Owned/claimed products plus separately labeled known temporary/unknown access. Do not require a title to have been played. Do not require complete historical coverage to ship a useful partial adapter. Conversely, do not label unknown/raw entitlement heuristics Owned to fill gaps. SKU-level acquisitions, bundle expansion and legacy supplements are deferred until supported, not silently inferred.

Release gates still open: authenticated CAS payload/Owned semantics; historical/never-played controls; account identity and source freshness; exact product/edition granularity; legitimate page-local acquisition without credential export; packaged browser bridge reliability. The v7 route remains a secondary investigation if CAS omits substantial purchases. A backend is neither required for page-local extraction nor a solution to restricted API authorization.

## 7. Reproducibility and validation record

Public downloads and source clones were read-only and remain ignored under `audit-artifacts/xbox-ownership-followup/`. They are not fixtures or test dependencies. Asset fingerprints:

| Public asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `entry.client-mg5cb0xn.js` | 4,035,191 | `175b123e0be0bfb4a491e3f97825c09c2150fb311e67ba1ba19cbe02e28a92d0` |
| `service-sdk-adaptors-hlovo3lp.js` | 78,012 | `f192f27503df260d75ce36036ab218790ae1ddb1d9f35d9499cce47ab6c24ed2` |
| `LibraryRoute-drgzsn5p.js` | 1,435 | `74fe678ae3036d245089837128672052e0a96566ff0ee2cc6b930bb3c5897038` |
| `LibraryPage-j4j11fb0.js` | 122,737 | `bfa7c80bb2b7b254322f857e6b30ed37da13fcfb45713d743b51b69ec1af355a` |

Run `node --test scripts/research/xbox-library-passive-probe.test.mjs` without any downloads or account input. Six synthetic tests cover independent access classes, combined access, account separation, aggregate-versus-personal flags, durable/bundle/platform fields, revocation coexistence, repeated map observations, unknown fields, malformed/oversized data and the passive hook's promise/argument/privacy boundaries. These prove bounded diagnostic behavior, **not real-account ownership correctness**.

Validation passed from an isolated checkout with no private audit inputs: **6 research tests**, **1,193 ordinary GL unit tests**, repository layout (**504 files / 228 local Markdown links**) and Chrome/Firefox package checks (**181 runtime files each**). No live-account browser/import test, production importer or authenticated completeness test is claimed. HB/FAN are unchanged. No delivery-time estimates are offered.
