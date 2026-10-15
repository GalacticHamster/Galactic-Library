# Xbox ownership beyond cloud gaming

Follow-up: [Collections authorization experiment](XBOX_COLLECTIONS_AUTH_EXPERIMENT.md) provides a standalone own-registration test and exact setup instructions. Real authorization remains pending; the user subsequently confirmed the order-history UI reaches only approximately seven years back.

Research date: **2026-10-15**, GL baseline `8c1acfb`. Third-stage follow-up to the [initial audit](XBOX_INTEGRATION_AUDIT.md) and [consumer web investigation](XBOX_OWNERSHIP_FOLLOWUP.md). Research only; no production code, permissions, library/account data, HB or FAN changes. Public implementations were inspected, not executed. No authenticated Microsoft session or GL-owned Microsoft application registration was available.

## Decision and correction to the previous recommendation

**CONDITIONAL GO for further validation of a broad, additive Xbox purchase importer using consumer Collections and order history. Do not start production integration until own-client authorization and historical coverage pass the gates below.** The cloud Library is no longer the primary candidate. No currently demonstrated browser-only route can yet be claimed to retrieve this user's hundreds of purchases, particularly non-backward-compatible 360 titles. That limitation is explicit rather than filled with activity-based ownership guesses.

The strongest broad entitlement lead remains **MSA Collections v7**. Its request is not cloud-offering- or launch-history-based. The concrete unresolved blockers are (1) obtaining the Collections audience ticket under **GL's own app identity**, (2) measuring which historical license classes that consumer query actually exposes, and (3) separating permanent grants from conditional access without catalog heuristics. Registering an app is necessary for an independent OAuth integration, but has not been shown sufficient to obtain this particular resource permission.

Order history is a complementary existing-browser-session route that does not need GL to obtain a Collections OAuth grant. If it exposes identifiable older line items, it could provide a substantial partial purchase import even if Collections authorization fails. Its actual history depth still needs the user's local check. There is no unconditional Go, and a 37-game cloud-only importer does not meet this task's objective.

## 1. What the signed-in evidence establishes

User-reported live observation: hundreds of digital purchases/redemptions across 360/One, but **37 displayed Owned games**; successful **200**, approximately **26.5 KB**, from:

`https://contentaccess.exp.xboxservices.com/all/v1?market=US&offering=CLOUDGAMING`

Some initiators were the application and `entry.worker.js`. The passive page fetch probe returned `[]`. This does **not** establish an empty endpoint response: a page hook need not see worker-owned requests or an earlier captured fetch. No further probe debugging was undertaken. More importantly, neither 37 visible cards nor 26.5 KB proves the raw response contains exactly 37 Owned products. The distinction between source scope and downstream display filtering remains open.

### Offering values found in actual public source

The previously fingerprinted [application systems asset](https://play.xbox.com/assets/entry.client-mg5cb0xn.js) defines public streaming offerings `xgpupcapp`, `xgpuconsole`, `xgpubeta`, `xgpu`, `xgpuweb`, `cloudgaming`, `xgpuwebf2p` and `xhomeinput`; its default is configuration-driven with `xgpuweb` fallback. Content Access uses the active public **GameStream** offering; private offerings fall back to that default. Names containing PC or console are streaming-client names, not evidence of complete PC/console ownership scopes.

The [GameStream authentication client](https://play.xbox.com/assets/gamestream-auth-service-dv9ojpfy.js) obtains allowed offerings through **POST `/v1/offerings/user`** on its configured authentication-service domain, using Xbox authentication. It also recognizes routing names such as `xhome`, `core`, `xgpuks`, `somerville` and take-home/test variants. Those routing constants are not a list of CAS scopes authorized for normal users. No offering was guessed or tried, and no developer/private offering is proposed as a workaround.

**Conclusion:** the observed CAS request is explicitly cloud-offering-scoped, and the web view applies additional streamability/catalog filters. Neither source nor account evidence establishes an all-purchases offering. This does not prove the **entire CAS service** is intrinsically cloud-only: its schema is cross-platform, and native hosts can supply raw access data through `getRawContentAccessData`. No inspected public console implementation establishes that its full library uses this same HTTP endpoint with another offering. Demote this route for complete ownership; retain it only as optional cloud-access evidence.

The [Greenlight title manager](https://github.com/unknownskl/greenlight/blob/0bf80599bf7c9c102a939ce994b5118cd7cb57ce/packages/desktop/main/helpers/titlemanager.ts) further confirms that an alternate streaming client can enumerate stream titles and hydrate Game Pass catalog metadata without enumerating the user's complete purchases. It is not a missing all-account importer.

## 2. Consumer Collections v7: broader candidate, not proven completeness

Actual inspected source: [XboxStoreClient.cs at `d38fa09`](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Services/XboxStoreClient.cs), especially `Login`, `GetEntitlementsAsync`, `GetOwnedAsync` and `ClassifyEntitlements`.

| Part | Source-verified behavior |
| --- | --- |
| Endpoint | `POST https://collections.mp.microsoft.com/v7.0/collections/query` |
| Consumer identity | `beneficiaries[].identitytype = msa`; audience-specific ticket in `identityValue`, not a publisher key |
| Query scope | Market, product kinds Game/Durable/Application/Pass; no cloud offering, installed-title or played-title restriction |
| Traversal | `maxPageSize: 100`, response continuation forwarded until exhausted or 40-page client bound |
| Retained fields | Product, SKU and product-title IDs; SKU type, ownership type, status, acquired/start/end dates and tags |
| Later filtering | Active + Full, then catalog-based classifications and PFN/title-ID matching |

This architecture **can enumerate beyond an initial page without a known-product seed list**, and can receive never-launched products if the backend exposes them. Those are source facts, not a measurement of this account. The plugin author's comments report successful direct probing and errors for wrong token placement/type. They are author-reported observations, not an authenticated reproduction here or a supported API contract.

Important source limitations:

- A 40-page/nominal 4,000-row bound is a client limit, not proof the backend cannot enumerate more. Cap/error/malformed-page results must remain partial. The existing parser can break on a null response without a traversal-specific failure; do not copy that into a complete-sync claim.
- Its typed model drops any additional transaction/order/acquisition fields the server might supply. Their absence from the model does **not** establish absence from a real v7 response. Record field names locally before deciding the production allowlist.
- Its explicit product-kind filter and downstream Active/Full filters may exclude other legitimate license forms. Do not use the final matched Playnite list to measure raw entitlement completeness. Missing catalog products and legacy identifiers must survive staging.
- Catalog purchasability, delisting, free price, shared tags and near-simultaneous grants are heuristics. They cannot prove permanent purchases. The code's “present means owned, absent means Game Pass” comment is insufficient and the negative inference is rejected for GL.

The official [v6 query reference](https://learn.microsoft.com/en-us/windows/uwp/monetize/query-for-products) documents similarly useful fields, including order/line/transaction IDs and Active/Expired/Revoked status, but uses publisher `b2b` auth and restricts products to the developer's associated apps. It is evidence of the **publisher contract**, not a promise that consumer v7 exposes every field or license. Keep the contracts separate.

### Coverage questions that still require a consumer response

| Purchase/access class | Established evidence | Unanswered for MSA v7 |
| --- | --- | --- |
| Xbox One / Series digital purchases | Unscoped-by-platform query and console title-ID output path exist | Account/platform completeness, including products with no current catalog entry |
| Never played | Enumeration does not depend on title history | Presence of specific known never-played purchases |
| Backward-compatible 360 / Original Xbox | Migrated entitlement expansion is documented in legacy inventory | Which migrated grants appear in Collections and under which IDs |
| Non-backward-compatible 360 / legacy-only products | Console redownload rights exist independently of modern catalog listings | No evidence of complete consumer v7 coverage; legacy catalog absence may be structural |
| Codes / free claims / Gold | Source stores grants, SKU/status/date fields | Distinguishing permanent 360 claims from conditional One claims and other promotions |
| DLC / bundles / editions | Durable/SKU/tag paths exist | Parent bundle visibility, child grant completeness and exact edition identity; never infer a base purchase from DLC |
| Delisted | Entitlement may remain while catalog hydration fails | Actual retained IDs and readable names; no catalog-failure-as-owned shortcut |
| Subscription/shared/trial | Active/Full and ownership-type fields are available in the model | Whether this caller gets an authoritative per-grant discriminator; a maximum end date is not enough |
| Refund / expiry | Status and dates are retained | Historical records returned under defaults versus an explicitly supported all-validity query |

Microsoft's [Game Pass documentation](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/xstore-detecting-game-pass) warns that unauthorized **publisher v9** queries can expose Game Pass access as Single/direct and normalize end dates. Do not project that behavior onto v7 without testing, but equally do not assume a same-named field there is definitive. Raw subscription catalog membership cannot disprove a separate purchase.

## 3. Authentication: separate four different questions

### A. Signing into Microsoft with GL's own registration

Microsoft documents registering a personal-account application and an OAuth → Xbox user-token → XSTS flow in [Xbox website authentication](https://learn.microsoft.com/en-us/xbox/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication?view=gdk-2604). Its website example uses a server-side secret; that must **not** be embedded in an extension. Generic [authorization code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) provides the appropriate public-client pattern where the resource supports it.

[Chrome `launchWebAuthFlow`](https://developer.chrome.com/docs/extensions/reference/api/identity) and [Firefox's equivalent](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow) can handle an external identity-provider redirect registered for the extension. Existing Microsoft login may reduce login prompts; it does not eliminate app consent or resource authorization. Google `getAuthToken` is not a Microsoft credential source.

**This general sign-in capability is established. A tested GL registration and Collections grant are not.** Redirect registration, public-client token redemption, both browsers and resource consent still need a real app-specific test.

### B. Obtaining the actual consumer Collections ticket

XboxOwnershipFilter requests legacy scope **`service::collections.mp.microsoft.com::MBI_SSL`** through Live implicit OAuth, using a legacy client ID and desktop redirect. It captures the access-token fragment in a Playnite webview. No partner secret is used in that path. This is evidence of an implemented consumer mechanism, not evidence GL may reuse that application's identity.

I found **no public provisioning documentation establishing that a newly registered GL public client may request that Collections scope**. XboxLive.signin consent issues an Xbox sign-in token, not automatically a Collections audience ticket. Renaming scopes or moving a token to another header does not establish authorization. The plugin author explicitly reports its attempted Xbox/XSTS route failed for this call; that is a reported compatibility limitation, not a universal theorem about every Collections version.

**Answer to “blocker or registration step?”** Registration is an integration step. Permission to this consumer resource is an **unresolved authorization gate**. There is no evidence to call it impossible or necessarily partner-only; there is also no evidence to say creating an Entra app alone solves it. A successful own-client consent/token/query test, or Microsoft documentation/approval of that resource for the app, resolves the gate. Generic OAuth documentation cannot resolve it.

### C. Publisher Collections IDs are not a shortcut

The documented [User Store ID flow](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/xstore-requesting-a-userstoreid-from-services) needs delegated Xbox authorization, a partner service token/certificate and a Store service ticket. The [publisher setup](https://learn.microsoft.com/en-us/windows/uwp/monetize/view-and-grant-products-from-a-service) also associates the publisher application with its products. That does not grant an independent consumer app every publisher's library. A backend or client secret does not erase the scope boundary.

### D. Transport and page sessions

Extension host permission enables a permitted cross-origin transport, not an audience token or account-wide license grant. No public authenticated browser page was found making this specific v7 MSA query on behalf of the user. Therefore the preferred existing-tab/no-stored-token pattern is **not yet established for Collections**. It is established as a practical browser pattern for order-history DOM extraction, subject to actual data availability.

If own-client auth is approved, keep short-lived credentials only in the research session, discard at its end, and return sanitized observations to GL. Do not add token persistence as an incidental research shortcut. No foreign client ID, token interception/export extension, device-auth emulation or credential copying is proposed.

## 4. Legacy inventory and Xbox 360: avoid false completeness

Microsoft's [inventory GET reference](https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/live/rest/uri/marketplace/uri-inventoryget?view=gdk-2604) describes `https://inventory.xboxlive.com/users/me/inventory`, state/availability filters, nested **`pagingInfo.continuationToken`**, and optional `expandSatisfyingEntitlements=true`. Expansion can include bundles, subscription benefits and **360 purchases migrated to One**. It is incompatible with an item-type filter in the documented request. A token can represent multiple users; correct user scoping matters. These facts support investigating legacy grants, not assuming all original 360 purchases are present.

The [Marketplace caller reference](https://learn.microsoft.com/en-us/xbox/gdk/docs/reference/live/rest/uri/marketplace/atoc-reference-marketplace?view=gdk-2604) restricts its supported caller environments to 360, Windows Phone and Xbox.com. An Xbox token working for social/profile APIs does not prove inventory access. No current successful GL-owned consumer inventory call was demonstrated. Do not spoof a supported client/device to overcome 403.

### A useful additional public implementation—and why it is not proof

Inspected **Xodus `6966ff3`** [Collections implementation](https://github.com/nocts-software/xodus/blob/6966ff3ce81d6759bf75b9b7408f2a617eca2d20/crates/xodus/src/api/xbox/collections.rs) and [authentication](https://github.com/nocts-software/xodus/blob/6966ff3ce81d6759bf75b9b7408f2a617eca2d20/crates/xodus/src/auth.rs):

- `get_user_owned_catalog_items` tries v8 `b2bLicensePreview` with an MSA ticket obtained through legacy device/user STS plumbing. It uses other client identities, then requires modern Store IDs and PC-compatible catalog products. Its fallback is Titlehub played history, later labeled owned. This does not meet GL ownership requirements.
- `get_user_collections` also contains v8 `/collections/users/me/browse`, `/collections/browse`, `purchase.mp.microsoft.com/v8.0/users/me/entitlements` and inventory fallback calls. These are source-present leads, **not verified working endpoints here**. The inventory parser looks for a top-level continuation rather than the documented nested one; it drops much license context. Nonempty results do not establish exhaustion or permanent ownership.

Do not port its fallback matrix or try all these paths against an account. It demonstrates alternative engineering attempts, not authenticated coverage of non-backward-compatible 360 games. No DRM/download/runtime portions were executed or investigated for GL integration.

**Gold distinction:** Microsoft explicitly says redeemed **360 Games with Gold** titles remain in the library regardless of subscription status; redeemed **One Gold** access depends on the relevant subscription. [Official Xbox explanation](https://news.xbox.com/en-us/2023/08/02/xbox-insiders-help-bring-the-new-game-pass-core-experience-to-life/). Never discard all Gold grants, or mark all permanent, solely from the program label. Establish the actual legacy grant/platform using evidence.

The [360 Store closure announcement](https://news.xbox.com/en-us/2023/08/17/xbox-360-store-will-close-july-2024/amp/) preserves playing/redownloading previously purchased content, while separately describing backward-compatible purchases on newer storefronts. This proves continued rights, not a public enumeration API. Original/360 non-backward-compatible products remain a distinct coverage gate, including redeemed codes and delisted titles. A console's Download History can be a local reference control; do not scrape credentials or infer purchases from its installed games.

## 5. Complementary sources and a practical combination

| Source | Useful contribution | Limitation / required validation |
| --- | --- | --- |
| Consumer MSA Collections | Best broad entitlement enumeration candidate; products/SKUs independent of cloud or launch history | Own-client scope grant, historical inclusion and permanent-versus-conditional semantics untested |
| Microsoft account order history | Successful purchase/redemption line items in the existing browser session | Oldest available records, code and Points-era gaps, product IDs, paging and refunds need local validation |
| Legacy inventory | Potential migrated/legacy entitlement supplement | Supported caller authorization and non-backward-compatible coverage not established |
| Console full library / 360 Download History | Ground-truth checks for known owned uninstalled products | Native account interface is not a browser endpoint; no supported extension-readable full-library bridge found |
| CAS cloud access | Cloud-access evidence / sanity check | Not the targeted broad purchase source; do not substitute it for the hundreds-game collection |
| Title history / installed lists | Discovery/activity enrichment | Never establishes purchase, redemption or absence of ownership |
| Store catalog / StoreLib | Product names, IDs, SKU/platform relationships | Metadata/availability does not establish the user's licenses |

Microsoft's [order-history help](https://support.microsoft.com/en-us/accounts-billing/view-your-microsoft-store-order-history) supports date/category selection and Completed/Redeemed transactions. It does not promise every legacy acquisition. The public billing-page fetch here timed out without data; this is a network observation, not evidence the signed-in page fails. No current internal billing JSON contract is asserted. Prefer the page's own traversal over guessed endpoints.

Inspected **StoreLib `3f2a98f`** [DisplayCatalogHandler](https://github.com/StoreDev/StoreLib/blob/3f2a98ffede0bf3f78321c194e884fd0aaf14c29/StoreLib/Services/DisplayCatalogHandler.cs): catalog lookup is not a whole-user library query. The official native [GetUserCollectionAsync](https://learn.microsoft.com/en-us/uwp/api/windows.services.store.storecontext.getusercollectionasync?view=winrt-28000) concerns purchases associated with the current app's add-ons, not arbitrary Xbox games. Neither removes the consumer-auth gate. XboxReplay `f2a4fad` source inspection found no independent Collections/inventory enumerator.

**Combined design after validation:** retain per-account observations for all exposed licenses; join Store products/SKUs and verified legacy alternate IDs, never titles alone. Preserve edition/platform, bundle-parent/child and acquisition distinctions. Supplement missing products with identifiable successful order items. Revocation/refund applies to the affected grant rather than erasing an independent valid purchase. Unknown grants remain saved and searchable without being counted as confirmed owned. An incomplete response never deletes earlier records or claims complete synchronization. Do not flatten two SKUs or two grants merely because their title ID matches.

## 6. Smallest safe account validation—no new passive probe

**Available now, without another diagnostic:**

1. Open Microsoft's Order history yourself, select the broadest available date/category range, and traverse beyond the first page. Locally check one old non-backward-compatible 360 purchase, one backward-compatible 360 purchase, one One purchase, a never-played purchase and a code/Gold claim if applicable. Record only yes/no inclusion, oldest year reached, approximate game count, whether additional pages exist, and whether game-specific product links and refund statuses are visible. Do not send order IDs, payment details, cookies, tokens, headers or response dumps.
2. If available, compare those examples with the console's full owned library/360 Download History. Treat this only as reference evidence, not a reason to mark every installed/played game owned.

**Collections authentication gate, requiring a GL-owned registration—not another user's credentials:**

3. Obtain an app identity controlled by the GL developer, configured for personal Microsoft accounts, a proper public-client redirect and explicit consent. Confirm the supported way to request the Collections resource scope. If no such permission can be provisioned, ask Microsoft about **this resource/audience**, rather than expanding permissions or borrowing a client ID. Creating an external app registration was not performed in this research task.
4. Once that grant is available, a separate narrowly scoped local auth/query experiment can hold the token in memory, query **only v7 Collections**, page sequentially, respect throttling and stop on authorization errors. First report booleans for consent/token/query success and page/row counts. Do not log redirect parameters or token-bearing request/error bodies. No public auth harness was added here because the resource grant is unresolved; a generic login success would not answer the question.
5. In that local experiment, test the same known product IDs across first and subsequent pages. Retain raw SKU/status/date/grant fields locally, including inactive grants. Verify older 360/One, never-played, code/Gold, delisted, DLC and subscription-only controls independently. A successful traversal is not a claim of a complete historical library. Check which fields actually distinguish grants; do not use a purchase-like verdict reconstructed from price.
6. Only if the raw v7 result has a demonstrated historical gap and legitimate inventory authorization is available, test the documented inventory route with correct user scope and pagination. No undocumented endpoint/offering sweep, client spoofing or failed-auth workaround.

Optional existing XboxOwnershipFilter reports could establish **that application's** raw Collections coverage, but its borrowed-client login does not validate GL's registration, and its final Owned filter is not ground truth. Do not apply library filtering/deletion merely to obtain research results. No installation, login or report upload is required by this investigation.

**Evidence that changes the decision:** own-client Collections token/query success plus representative historical inclusion supports implementing the adapter; successful order-history traversal of substantial older purchases supports a receipt-based partial importer independently. A denied/unprovisionable consumer grant plus absent legacy order records means **Defer broad browser ownership**, with the exact missing license source identified. A larger cloud list or successful profile sign-in alone changes neither gate.

## 7. GL integration boundaries

Reuse the existing provider registry, bounded metadata allowlist, stable account profiles, sender-bound acquisition, validated additive atomic writes, ownership resolver/user overrides and normal backup/restore. Add provider-specific license identifiers, product/SKU/platform/edition and explicit grant/access evidence only after observing their contract. Keep ephemeral auth out of backups. Preserve unknown legacy products when catalog hydration fails; do not make 12-character modern Store IDs a universal admission requirement.

Keep source-completeness, bibliographic identity, purchase occurrences and current access separate. Counts must distinguish rows, products, SKUs and confirmed acquisitions. No production schema or permission change is made here. Console/native helpers would be a separately scoped architectural choice, not an unnoticed dependency of the browser-only proposal.

## 8. What was actually validated

- Reused the fingerprinted public web source from the previous stage; additionally retrieved the linked public GameStream auth asset (13,598 bytes; SHA-256 `265963e92bc1230d67bd186fa30cdb7b6e24256b6ceaf406b8811de14a4773a2`). Inspected pinned public StoreLib, Greenlight, XboxReplay and Xodus repositories. Downloads remain ignored and no test depends on them.
- Preserved the user's signed-in 200/26.5 KB/37-card observation as user evidence; did **not** reinterpret the unobserved binary response as 37 raw products. No authenticated call, new OAuth registration, alternate offering, legacy endpoint or source-data mutation was performed.
- Added an [offline page-contract experiment](../../../scripts/research/xbox-entitlement-page-contract.mjs) with [seven synthetic tests](../../../scripts/research/xbox-entitlement-page-contract.test.mjs). It demonstrates >100-row traversal without title history, retains distinct SKUs/inactive/legacy records, follows nested inventory paging and fails partial on errors/caps/cycles. It deliberately never declares account completeness or ownership. It performs no network, auth, export or storage work.
- Validation passed from an isolated checkout without private audit inputs: **seven new page-contract tests**, **six existing probe tests**, **1,193 GL unit tests**, repository layout (**507 files / 236 local Markdown links**) and both package checks (**181 runtime files each**, package hashes unchanged). Run the new experiment with `node --test scripts/research/xbox-entitlement-page-contract.test.mjs`. Synthetic fixtures prove traversal safeguards, **not endpoint availability, real historical coverage or permanent ownership**.

The remaining uncertainty is specific: Microsoft exposes broader entitlement machinery than cloud access, but this research has not established an independently authorized browser caller covering this account's legacy library. The next useful evidence is an own-client resource grant or substantial identifiable order-history coverage—not more debugging of the old cloud probe.
