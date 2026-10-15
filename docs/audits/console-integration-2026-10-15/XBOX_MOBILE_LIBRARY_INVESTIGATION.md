# Xbox mobile app library API investigation

Date: **2026-10-15**. GL baseline `165ea2f`. Research only; no production integration, permissions, library data, HB or FAN changes. Read alongside the [consumer follow-up](XBOX_OWNERSHIP_FOLLOWUP.md), [beyond-cloud investigation](XBOX_OWNERSHIP_BEYOND_CLOUD.md), and [Collections authorization experiment](XBOX_COLLECTIONS_AUTH_EXPERIMENT.md).

## Decision

**The endpoint chain behind the official mobile app's 245-game screen was not established. No independently authorized way to reproduce that screen was demonstrated.** This is an evidence gap, not a finding that Microsoft denied GL access or that the list is only played history. It would be incorrect to identify Collections v7, legacy inventory, or Titlehub as the mobile library source without a caller trace.

**Defer a mobile-library importer. Conditional Go remains appropriate for the existing own-client Collections experiment.** It has a concrete consumer request and a safe authorization harness; the mobile lead has a stronger user-visible comparison target but no independently usable request/permission contract yet. Do not build a second login tool around guessed mobile endpoints or require new mobile debugging setup.

The most useful next result is an authenticated own-client Collections outcome, followed, if successful, by comparison with the mobile list. A native helper would not itself solve the missing resource authorization. No production Xbox integration is recommended on the strength of the 245 count alone.

## 1. Observations versus established source behavior

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| User reports **245 digitally owned games** in **Android → My library → Games**, no current Game Pass, and Xbox Live ended before Game Pass | A real, substantially broader comparison list than the observed cloud screen | Raw entitlement count, list completeness, the service used, or permanent-grant semantics for other accounts; no separate Owned-filter selection was reported |
| User confirms never-played games appear; considers one or two non-backward-compatible games likely present | A played-only importer would miss part of the comparison list | Which service supplies the extra candidates; non-backward-compatible coverage remains tentative |
| User reports **37 Owned games** on cloud web; prior observed request used `offering=CLOUDGAMING` | That tested request is explicitly cloud-offering scoped | That all Content Access offerings, native clients, or mobile lists have that scope |
| User reports approximately seven years accessible in online order history | That UI did not expose the older purchases in the user's check | A seven-year retention limit on every Microsoft purchase service |
| Existing Collections harness | Own-ID Code + PKCE, one initial v7 query, bounded explicit pagination, aggregate output are implemented and tested with mocks | Real permission issuance, endpoint success, or retrieval of any of these 245 games |

The user confirmed Android and **My library → Games**, but does not know the installed app version. Public store versions below must not be substituted for that installed version. Never-played inclusion argues against explaining the whole list as games the user has played. It does not exclude Titlehub enrichment or establish that every upstream record comes from an entitlement service.

## 2. Current Android and iOS evidence

Microsoft's [Android listing](https://play.google.com/store/apps/details?id=com.microsoft.xboxone.smartglass&hl=en) identifies package **`com.microsoft.xboxone.smartglass`**, with an October 13, 2026 update at inspection. Its [iOS listing](https://apps.apple.com/us/app/xbox/id736179781) identifies **app 736179781**, advertising **2610.1.1** at inspection. These are release-channel metadata, not inspected application binaries. Both publisher descriptions cover console remote installation, social/activity functions, purchasing and Game Pass. Neither publishes the account-library request construction or a license-response contract. Those mixed functions cannot identify the service behind one Library screen.

Microsoft's [April 2025 announcement](https://news.xbox.com/en-us/2025/04/16/xbox-april-update-buy-games-xbx-app-stream-your-own-game-console/) separately describes mobile purchasing and selected owned-game cloud streaming. It does not document a mobile ownership export API. Its [September 2025 update](https://news.xbox.com/en-us/2025/09/29/xbox-september-update-2025/) distinguishes PC aggregated libraries and cross-device play history; those features are not evidence that mobile Library equals either source.

No current official Android/iOS library implementation, public request trace, or documented mobile-library SDK contract was located in the inspected sources. No authenticated mobile session, app binary analysis, certificate installation, packet interception, secret extraction, or official-client impersonation was performed. Consequently:

- There is no source-confirmed mobile endpoint, request body, platform filter, pagination loop, or ownership predicate to reproduce.
- Android and iOS using an identical backend remains unverified.
- Collections, inventory, a native Content Access path, and a composition of services remain hypotheses. A mobile screen may have several data sources; none is selected as the answer merely because its name sounds appropriate.

## 3. Actual request paths inspected

These are **source-confirmed candidate or adjacent services**, not identified callers of the current official mobile Library. Branch links were inspected on the date above; they are moving source references. Existing pinned Collections/web findings remain documented in the preceding reports.

| Source and request construction | What its response handling actually supports | Relevance to 245 games |
| --- | --- | --- |
| [Playnite `XboxAccountClient.cs`](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/XboxLibrary/Services/XboxAccountClient.cs), `GetLibraryTitles`, lines 244–283: GET `https://titlehub.xboxlive.com/users/xuid({xuid})/titles/titlehistory/decoration/detail` | Deserializes `TitleHistoryResponse.titles`; this method makes one request, without a continuation loop. Xbox user-token/XSTS setup is separate. | The method name does not make its played-title response a purchase enumeration. It cannot establish never-played ownership. Not evidence of the mobile app's source. |
| [OpenXbox Titlehub provider](https://github.com/OpenXbox/xbox-webapi-python/blob/master/xbox/webapi/api/provider/titlehub/__init__.py), `get_title_history`, lines 27–57 | Builds the same `titlehistory/decoration/{fields}` route with `maxItems`; contract version 2. Its [models](https://github.com/OpenXbox/xbox-webapi-python/blob/master/xbox/webapi/api/provider/titlehub/models.py) distinguish last-played/visibility, achievement and Game Pass decorations, device labels, title IDs and alternate identifiers. | Useful activity/identity discovery; decorations and platform fields do not confer a license. This wrapper does not demonstrate full-history traversal or mobile-library composition. |
| [OpenXbox SmartGlass provider](https://github.com/OpenXbox/xbox-webapi-python/blob/master/xbox/webapi/api/provider/smartglass/__init__.py), `get_installed_apps` and `_fetch_list`, lines 53–67 and 321–338 | GET `https://xccs.xboxlive.com/lists/installedApps`, optional `deviceId`, contract version 4 and `skillplatform: RemoteManagement`; validates an installed-package response. Separate device/storage lists exist. | Console installation inventory is not purchase history. Do not turn a console package, shared installation or remote-install capability into personal ownership. No whole-account owned-library call is established by this provider. |
| Current [python-xbox SmartGlass provider](https://github.com/tr4nt0r/python-xbox/blob/main/src/pythonxbox/api/provider/smartglass/__init__.py), `get_installed_apps`, lines 57–71 | The maintained derivative retains that installed-app request pattern. Its [client provider registration](https://github.com/tr4nt0r/python-xbox/blob/main/src/pythonxbox/api/client.py) exposes Titlehub, SmartGlass and social/catalog providers; no separate owned-library/Collections provider is registered there. | A newer OpenXbox-derived library did not supply the missing mobile caller. This is a statement about the inspected factory/providers, not proof no other implementation exists. |
| Microsoft [Inventory GET contract](https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/live/rest/uri/marketplace/uri-inventoryget?view=gdk-2604): `https://inventory.xboxlive.com/users/me/inventory` | Availability/state/product filters, account scoping and nested `pagingInfo.continuationToken`. Satisfying-entitlement expansion includes bundle/subscription benefits and migrated 360 purchases; it cannot be combined with `itemType`. [Marketplace caller restrictions](https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/live/rest/uri/marketplace/atoc-reference-marketplace?view=gdk-2604) identify supported caller environments. | A real entitlement lead, but current mobile use and GL caller permission are unproven. Migration support is not all historical 360 support. |
| Existing pinned [consumer Collections caller](https://github.com/ToMuchNeverEnuf/XboxOwnershipFilter/blob/d38fa099a9c160575c04a4be508f3d1495dc3a9a/Services/XboxStoreClient.cs), `GetEntitlementsAsync` | POST v7 query using an MSA beneficiary ticket, Game/Durable/Application/Pass filters, requested 100-row pages and continuation. GL's research harness preserves raw distinctions without the caller's ownership heuristics. | Concrete entitlement enumeration independent of title history/cloud offering, but permission and this account's coverage remain untested. No evidence it is the mobile app's service. |

Microsoft's own [Trace Analyzer API map](https://github.com/microsoft/xbox-live-trace-analyzer/blob/main/Source/XboxLiveTraceAnalyzer.APIMap.csv) distinguishes inventory, catalog, pins, achievements and other service families. It is a service-to-function map, not a trace of the current mobile Library. It does not fill the missing caller/response chain.

The prior web-app investigation also identified CAS `/all/v1`, known-product entitlement detail, and a native `getRawContentAccessData` bridge. Rechecked public-source material does **not** connect that native bridge to this Android/iOS screen. A native capability in a web application must not be recast as a discovered mobile API. The earlier cloud-scope finding and Collections harness remain unchanged.

## 4. Authentication: separate services, separate grants

**Xbox social/activity authentication:** Microsoft documents personal-account registration, MSA OAuth, Xbox user-token exchange and XSTS in [Xbox website sign-in](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication?view=gdk-2604). Its example is server-side and uses a secret; do not embed that secret flow in GL. Generic [public-client Code + PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) supplies a secretless pattern where supported, but does not grant every Xbox resource. Independently registered login and inventory authorization are different gates.

The inspected [python-xbox authentication implementation](https://github.com/tr4nt0r/python-xbox/blob/main/src/pythonxbox/authentication/manager.py) requests Xbox sign-in scopes, exchanges the MSA ticket at `user.auth.xboxlive.com/user/authenticate`, then obtains XSTS at `xsts.auth.xboxlive.com/xsts/authorize` with default relying party `http://xboxlive.com`. Its client adds the resulting authorization header. This is evidence of an Xbox API authentication implementation, not proof of licensing-resource access. Its secret/token-file examples were not run or adopted.

**Licensing/inventory:** Microsoft's [Store service authentication reference](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/xstore-authenticating-your-service?view=gdk-2604) identifies **`https://licensing.xboxlive.com`** for delegated licensing X-tokens and an endpoint-appropriate signature. It also requires publisher/product association for the documented service-to-service queries. Default social XSTS, a different spelling/protocol for a relying party, or a successful profile call is not interchangeable proof. The legacy Marketplace documentation restricts supported callers to Xbox 360, Windows Phone and Xbox.com; it does not provide a general Android/iOS or GL public-client grant. That documentation is not proof Microsoft's own modern app cannot have separate authorization.

**Consumer MSA Collections v7:** the exact requested resource remains `service::collections.mp.microsoft.com::MBI_SSL`, with the ticket in `beneficiaries[].identityValue`, not an ordinary Xbox social Authorization header. GL's [harness](../../../scripts/research/xbox-collections-auth.mjs) explicitly tests this path, not XSTS/inventory. Publisher `b2b` Collections, delegated LicensePreview and consumer `msa` v7 are distinct contracts. No changes to the existing harness are justified by this mobile observation.

**Official-client restriction is unknown.** Public [XAL mobile sign-in guidance](https://github.com/MicrosoftDocs/xbox-live-docs/blob/docs/xbox-live-docs-pr/get-started/add-signin-code/live-getting-xsapi-to-sign-in.md) concerns provisioned game integrations. Third-party [Prismarine auth documentation](https://github.com/PrismarineJS/prismarine-auth/blob/master/docs/API.md) reports that its mobile-style SISU mode does not work for custom Azure apps. Neither establishes the authentication flow of the current mobile Library. Do not borrow an official app title/client/device identity to test it. A private-client restriction needs evidence of that service's policy or an actual own-client denial, neither obtained here.

## 5. Ownership, platforms and legacy coverage

No raw response from the 245-game screen was available. Therefore owned/subscription/shared/trial/Gold flags, revocations, validity intervals, platform distribution, continuation state and catalog-dependent exclusions are **not measured**. The user's no-subscription baseline is valuable account context; it is not a reusable per-row ownership discriminator for other users.

Preserve these distinctions in any later validation:

- Played/installed lists can discover candidates, but never confirm permanent ownership. A Titlehub Game Pass decoration describes catalog metadata, not whether a user purchased that game.
- An authoritative personal entitlement is stronger evidence than a displayed tile. Preserve subscription, shared, trial, conditional Gold, revoked and unknown states separately. Do not infer purchases from price, delisting or absence from Game Pass.
- A Store product, SKU, Xbox title ID and legacy 360 content ID are different identifier domains. Do not collapse base/deluxe products, DLC or multiple platforms by title or title ID alone.
- Inventory's migrated-360 expansion does not demonstrate non-backward-compatible or never-migrated purchases. No data retrieved here establishes whether such games appear in either mobile or v7.
- Delisted identifiers must survive catalog lookup failure. Neither missing catalog metadata nor absence from a partial source establishes ownership/nonownership.

| Requested comparison metric | Actual finding in this investigation |
| --- | --- |
| Mobile visible games | **245**, user-reported; not an endpoint record count |
| Returned rows / distinct products / SKUs | Not retrieved |
| Platform distribution and Xbox 360 count | Not retrieved |
| Pagination completeness | Unknown for mobile; not tested for this account in Collections |
| Per-row ownership versus activity | Unknown for mobile; adjacent implementations distinguish the service families, not this screen |
| Never-played controls | User confirms visible never-played purchases; no API identifiers or backend rows inspected |
| Non-backward-compatible 360 controls | User considers one or two likely present; not confirmed or joined to API records |
| Delisted, code, Gold, DLC controls | Not tested; no result inferred from the aggregate count |

## 6. Smallest safe next validation

**No mobile API probe is supplied:** a credible mobile endpoint plus independent authorization has not been identified. Arbitrarily trying inventory URLs, relying parties, undocumented offerings or another application's credentials would not answer the question safely.

The available concrete experiment remains the [existing own-registration Collections test](XBOX_COLLECTIONS_AUTH_EXPERIMENT.md#exact-user-setup). Follow its registration instructions and run:

```powershell
node scripts/research/xbox-collections-auth.mjs --client-id YOUR_OWN_APP_GUID
```

It requests only the Collections scope, stops on denial, and makes one initial query if a suitable token is issued. Registration failure, rejected scope, endpoint rejection and successful query remain separate outcomes. No authorization success has occurred in this investigation.

If that query succeeds, explicitly advance its pages and compare locally with the mobile list. Report raw rows, distinct products/SKUs, continuation exhaustion, and status/type aggregates separately from the mobile 245. Do not expect equality: entitlement rows may include DLC, editions, inactive grants or benefits that the UI hides. The harness makes no account-completeness or permanent-ownership claim and does not currently derive platform counts.

Use a few known identifiers locally for a never-played purchase, old 360 purchase (including non-backward-compatible if available), One purchase, code/Gold claim, delisted product and edition/DLC. Do not substitute fuzzy titles for missing identifier joins. Subscription/shared/trial cases absent from this account remain untested. Platform/legacy distributions require returned authoritative platform fields or a separately validated identifier mapping; do not infer them from ID shape.

The simplest mobile-only checks need no tooling. Android, **My library → Games**, and never-played inclusion are now confirmed by the user. If convenient later, note the installed version and verify one specific non-backward-compatible 360 purchase locally. These checks can disprove some list-scope hypotheses; they cannot identify an endpoint or authorize GL. There is no need to repeat the already answered checks. No certificate, rooting/jailbreak, HAR, token, sensitive traffic capture or credential sharing is needed.

If Collections rejects a correctly configured own client, the next useful external question is specific: **Does Microsoft offer a delegated consumer permission for a third-party personal-library manager to enumerate console licenses comparable to the Xbox mobile Owned library, and what resource, client registration and scope authorize it?** Ask separately about legacy non-migrated 360 licenses. This is a proposed question, not a message sent to Microsoft or a known approval process.

## 7. Integration choices

| Option | Present feasibility and ability to retrieve a substantial part of 245 |
| --- | --- |
| **A: Browser extension** | Conditional for consumer Collections if own-client permission succeeds, then browser redirect/CORS/identity flows must be validated. No confirmed mobile-source route. Host permission supplies transport, not licenses or client authorization. An existing Xbox browser session is not automatically a mobile or Collections ticket. |
| **B: Local companion** | Could provide native PKCE/loopback authentication and avoid browser transport restrictions. No demonstrated entitlement permission advantage. Do not extract mobile/console token caches or add a helper merely to impersonate a first-party client. Substantial retrieval remains unmeasured. |
| **C: Complementary sources** | Best potential evidence composition: account-bound entitlement results plus separately identifiable purchases; activity/mobile observations can supplement discovery as Unknown. Order-history depth limits the older supplement. Requires stable product/SKU joins, additive imports and retained access distinctions; cannot reconstruct 245 owned items from played history alone. |
| **D: Defer** | Appropriate for a mobile-derived production importer now. The blocker is an unestablished request/permission contract, **not proven first-party exclusivity**. If own-client licensing access is denied or cannot be provisioned, record that specific result before deciding broad Xbox integration is unavailable. |

Future integration must preserve account/profile binding, product/SKU/legacy IDs, provenance and explicit user corrections, atomic additive imports, partial-result safeguards, and backup/restore. No production permission, schema, source or ownership decision changes are made here.

## 8. Validation and limitations

Reviewed current official Android/iOS metadata, public Microsoft authentication/inventory/service documentation, actual Playnite/OpenXbox/python-xbox request construction and response models, the previous pinned Collections/web investigation, and GL's existing authorization harness. No current official mobile caller implementation was recovered. Public app metadata and adjacent open-source clients are not substitutes for that implementation.

No authenticated Xbox/Microsoft request, personal library retrieval, new registration, official-app execution or mobile API compatibility test was performed. No new research code was added because there is no newly established endpoint/authentication combination to exercise. The Collections harness is unchanged.

Executed in a disposable checkout without ignored/private audit inputs:

| Check | Result |
| --- | --- |
| Existing authorization, entitlement-page-contract and passive-probe research tests (`node --test` on the three `scripts/research/xbox-*.test.mjs` files) | **24 passed**; remote responses mocked, no live Microsoft requests. |
| `node scripts/research/console-integration-boundaries.mjs` | **9 passed**; offline ownership, identity, backup and partial-import boundaries. |
| `node tests/run.js` | **1,193 passed**, including shared matching parity. |
| `node scripts/check-repository-layout.mjs` | Passed; report and documentation links validated. |
| Chrome and Firefox `package-release.mjs --check` | **181 runtime files each**, hashes unchanged from `165ea2f`. |

The final changes are this report and its audit-index entry only. No browser runtime UI test was warranted for documentation-only changes. Passing mock/offline tests does not demonstrate mobile or Collections authorization.
