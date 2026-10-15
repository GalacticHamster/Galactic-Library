# PlayStation integration feasibility

Research date: **2026-10-15**. GL baseline: `a0c199b`, schema 13. Research only. Public code was inspected; the developer environment had no authenticated PlayStation account for library retrieval.

## Decision: CONDITIONAL GO

The web purchased-game list is a credible local integration candidate. Approval to implement should depend on a short signed-in test of purchase-versus-PS-Plus semantics, pagination and edition identity. Rank: **second**. Do not promise a complete historical library or subscription catalog from the current evidence.

## Evidence and approach

Sony documents online transaction history with selectable date ranges; the initial view defaults to **two years**, which is not a documented two-year retention ceiling. Its service list can include undownloaded content such as season passes and currency. [Sony transaction/service-list help](https://www.playstation.com/en-us/support/store/check-ps-store-transaction-subscription-service/).

The user-facing library route `https://library.playstation.com/recently-purchased` redirected this audit's unauthenticated browser to Sony sign-in. This confirms a login boundary, not library API success. [Library entry point](https://library.playstation.com/recently-purchased).

The inspected Playnite PSN client calls the undocumented web GraphQL operation `getPurchasedGameList` on `web.np.playstation.com/api/graphql/v1/op`. Its current code requests pages of 100, reads `purchasedTitlesRetrieve.games`, stops at `pageInfo.isLast`, and checks advancing offsets. It uses a persisted-query hash. These are implementation observations, not a documented Sony API contract or guaranteed server page limit. Its desktop NPSSO/mobile authentication machinery is not necessary proof of a web-tab-only flow. [PSNClient.cs](https://github.com/XenorPLxx/playnite-library-psn/blob/main/Services/PSNClient.cs).

Crucially, the outer importer combines account titles with mobile played games, web played games and trophies. GL must use the purchase/entitlement branch independently. [PSNLibrary.cs](https://github.com/XenorPLxx/playnite-library-psn/blob/main/PSNLibrary.cs). The account-title parser retains a title ID and examines membership/subscription-service fields; those are useful leads for distinguishing subscription content. [ParserGames.cs](https://github.com/XenorPLxx/playnite-library-psn/blob/main/Services/ParserGames.cs), [subscription tagging](https://github.com/XenorPLxx/playnite-library-psn/blob/main/Services/ParserSubscription.cs).

An older Galaxy implementation explicitly used `subscriptionService: NONE` and a different purchased-query hash. Treat that as historical evidence of filtering, not a current recipe. Do not copy that hash or assume the old filter still has identical meaning. [Galaxy PSN client](https://github.com/FriendsOfGalaxy/galaxy-integration-psn/blob/master/src/psn_client.py).

No public supported consumer API granting GL complete owned-game enumeration was found. The [PlayStation Partners portal](https://partners.playstation.net/) is not evidence that GL has such permission. Keep the proposed integration explicitly website-based and unsupported by a stable public API.

## Information quality

| Information | Best-supported path | Remaining uncertainty |
| --- | --- | --- |
| Purchased digital games, including never played | Purchased list, supplemented by transaction details | Actual account completeness and current license state need testing |
| Code redemptions / permanent free claims | Potentially present in library or transactions | Test actual redeemed/free products; zero price alone is not permanent ownership |
| PS Plus claimed monthly titles | Membership/subscription indicators | Distinguish subscription-dependent claims from outright purchases |
| Extra/Premium access | Separate current-entitlement evidence required | Purchased list is not the entire available catalog |
| DLC / season passes / editions | Transactions, service/product identifiers | Title-level rows may collapse edition or add-on distinctions |
| Dates / purchase amounts | Transaction evidence | ACTIVE_DATE sorting is not proof of purchase date |
| PS3 / Vita / older content | Needs platform-specific validation | A platform filter in sample code does not establish full historical support |
| Played / trophies / installation / physical discs | Activity or device information only | Never ownership evidence |

Sony states that free monthly subscription games become unavailable after PS Plus expires, while discounted purchases are retained. Therefore membership, discount use and ownership must not be conflated. [PS Plus cancellation behavior](https://www.playstation.com/en-gb/support/subscriptions/cancel-playstation-plus/). Catalog availability can also change; subscription status alone does not prove a particular title remains available. [PS Plus usage terms](https://www.playstation.com/en-us/legal/ps-plus-usage-terms/).

Proposed mapping after live verification: explicit permanent purchase/code/free grant → owned/claimed; explicit subscription license → subscription; confirmed expiry/revocation/refund → corresponding unavailable state; insufficient or contradictory evidence → unknown. Never derive permanence from the operation's name alone, from PS Plus membership alone, or from trophies.

## GL fit and scope

Reuse the existing profile-scoped provider records, worker scan leases, atomic merge path, user ownership reviews and backup format. Required additions are provider enumeration, trusted library origins, provider UI/configuration, bounded evidence/identifier fields, and a local adapter. Relevant code: [models](../../../src/lib/models.js), [profiles](../../../src/lib/provider-profiles.js), [worker authorization](../../../src/background/service-worker.js), [metadata](../../../src/lib/metadata-validation.js), [writer](../../../src/background/storage-writer.js).

Retain title/content/product identifiers separately if exposed, plus platform and edition. A PS title ID is not automatically a SKU or a license occurrence; a concept grouping is not automatically an edition. Preserve explicit DLC as `game-addon` only when supported. Parent links need a provider allowlist extension. Do not manufacture included DLC from edition wording.

The core supports the required access states but not an arbitrary new provider's expiry fields/resolver. New console IDs also are not cross-store identifier mappings. Existing game title/edition matching remains in force, and platform alone currently does not prevent canonical consolidation. Validate base/deluxe, PS4/PS5 bundles and same-title PC/console products before enabling automatic integration. This audit changes none of those rules. [Identity behavior](../../../src/lib/identity.js), [effective access](../../../src/lib/ownership.js).

For accounts, prefer a stable signed-in account identifier when actually exposed and verified; bind it to GL's immutable profile ID. Never infer account equivalence from an online nickname. Explicitly confirm ambiguous profile changes. Current metadata/profile validators will require bounded registration for any new identity fingerprint; arbitrary response fields are discarded.

## Authentication, permissions and maintenance

Start with the user's normal web login and a read-only library-tab adapter. If calls must originate in the page context, project only sanitized rows back to GL. Validate `library.playstation.com` and `web.np.playstation.com` origins individually. Request only demonstrated necessary hosts; do not request all Sony domains or inspect login forms.

No server is inherently necessary. However, the current desktop plugin's credential/token flow must not be copied into GL: no user-pasted NPSSO, copied mobile client authentication, stored refresh credentials or third-party proxy in the proposed short-cycle implementation. If the normal site session is insufficient, stop the spike and reconsider scope.

Undocumented hashes, locale-dependent transaction pages, session expiry and evolving membership fields are significant maintenance risks. No documented public rate limit was established for this web endpoint; the source's batch size is not a rate guarantee. Read sequentially, bound retries, stop on authentication failures and respect backoff. Chrome/Firefox cookie/CORS behavior requires real tests; desktop Playnite working is not evidence of extension compatibility.

## Required signed-in gate and effort

Test a never-played purchase; a redeemed code; a permanently free claim; an active and expired PS Plus claim; an outright purchase also available on Plus; a refund; DLC; two editions; and an older title. Traverse more than one page to the validated end, compare totals with the website, and test account switching and both browsers. Confirm which IDs, membership and status fields distinguish these cases. Return a sanitized schema, not a raw HAR containing authentication.

The unauthenticated login redirect and source inspection passed as reconnaissance. **No authenticated retrieval, historical completeness or expiry classification was verified.**

Estimates for one GL developer, conditional on a passing gate: validation **1–2 days**, purchase-focused MVP **5–8 days**, polished integration **10–15 days**. Complete Plus-catalog coverage and legacy-platform completeness are additional scope, not included promises. It is a plausible follow-up; include before 1.0 only if the gate passes promptly and this bounded purchase scope is acceptable.
