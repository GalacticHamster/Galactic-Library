# Console integration recommendations

**Xbox follow-up:** The Xbox decision/ranking and estimates below are historical. The [ownership-source investigation](XBOX_OWNERSHIP_FOLLOWUP.md) supersedes Xbox Defer with **Conditional Go for a validated partial importer**, prioritizing the consumer web Content Access service. It does not establish authenticated completeness or revise the PlayStation/Nintendo findings.

Research date: **2026-10-15**. Historical decision record based on GL `a0c199b`, schema 13, public platform documentation and inspected open-source implementations. No production integration or live-account import was implemented.

## Recommendation

**Do not commit all three to the 1.0 release.** Time-box Nintendo validation first, then PlayStation if desired. Neither has passed the required signed-in gate. Xbox should remain outside the release scope unless a current ownership source is demonstrated.

| Practical rank | Provider | Decision | Best approach | Scope / gating problem | MVP after passing gate | Polished scoped integration |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nintendo | **CONDITIONAL GO** | Read-only Virtual Game Cards portal adapter | Hidden cards, borrowing, stable product/edition identity; not complete NSO access | 4–6 developer days | 8–12 days |
| 2 | PlayStation | **CONDITIONAL GO** | Website purchased-list adapter with explicit access evidence | Plus versus permanent grants, pagination, editions and legacy completeness | 5–8 days | 10–15 days |
| 3 | Xbox | **DEFER** | Investigate Microsoft order history as partial purchase evidence | No demonstrated unrestricted, complete consumer ownership API | 4–7 days for **receipt-only** scope | 10–20 days for partial scope; complete library unbounded |

Estimates are engineering judgment for one developer familiar with GL, not measured delivery times or promises. Add **1–2 days of signed-in validation per candidate**, access to representative accounts, and time for any failed gate. A short cycle is realistic only for a narrow Nintendo importer if its gate passes. None is currently an unconditional **GO**.

The evidence supporting this ranking is the inspected [Nintendo client](https://github.com/XenorPLxx/playnite-library-nintendo/blob/main/Services/NintendoAccountClient.cs), [PlayStation client](https://github.com/XenorPLxx/playnite-library-psn/blob/main/Services/PSNClient.cs), and Microsoft's [partner-only commerce reference](https://learn.microsoft.com/en-us/xbox/gdk/docs/store/commerce/service-to-service/microsoft-store-apis/xstore-v9-query-for-products?view=gdk-2604). See the independent audits for qualification and detailed source attribution:

- [Xbox](XBOX_INTEGRATION_AUDIT.md)
- [PlayStation](PLAYSTATION_INTEGRATION_AUDIT.md)
- [Nintendo](NINTENDO_INTEGRATION_AUDIT.md)

## Completeness comparison

| Capability | Xbox | PlayStation | Nintendo |
| --- | --- | --- | --- |
| Never-played purchases | Billing route candidate; full entitlement route unproven | Purchased-list candidate | Virtual-card candidate |
| Code / permanent free grants | Must test; billing alone may omit grants | Must test license classes | Must test card eligibility |
| Subscription titles versus ownership | Official partner APIs distinguish them, but GL access unestablished | Membership fields are a lead, not sufficient proof by themselves | Borrowing fields are a lead; NSO catalog outside card MVP |
| DLC and exact editions | Need product/SKU/order evidence | Title rows may not identify the purchased SKU | Application grouping is not necessarily the full product license |
| Historical bounds | Website/date coverage unverified | Transaction default is two years, not established hard retention | eShop transactions have a two-year window; cards are the better older-library candidate |
| Physical ownership | No complete browser source shown | No complete browser source shown | Not inferred from virtual cards or activity |
| Server required | Not for page import; server does not solve restricted API scope | Not inherently, if ordinary web session works | Not inherently, if ordinary portal session works |

The history distinction is supported by [Sony's selectable transaction ranges](https://www.playstation.com/en-us/support/store/check-ps-store-transaction-subscription-service/) and [Nintendo's purchase-history limit](https://en-americas-support.nintendo.com/app/answers/detail/a_id/22465/p/992/c/186). Neither a bounded transaction window nor an activity list should be labeled a complete current-access library.

## Fit with the actual GL implementation

The present architecture can accommodate additional isolated providers, but it is **not a drop-in plugin registry**:

| Existing component | Reuse | Required bounded addition |
| --- | --- | --- |
| [Provider constants](../../../src/lib/constants.js), [records](../../../src/lib/models.js) | Stable provider records, game/add-on types, access states, dates and platforms | Register provider IDs; unsupported providers currently reject |
| [Profiles](../../../src/lib/provider-profiles.js) | Immutable account namespaces, scoped operations | Verified external account binding where exposed; preserve ambiguous-account confirmation |
| [Worker](../../../src/background/service-worker.js), [writer](../../../src/background/storage-writer.js) | Trusted sender checks, scan leases, validation and atomic saves | Exact route authorization and adapter dispatch; no shared mutation bypass |
| [Metadata validation](../../../src/lib/metadata-validation.js) | Bounded fields, credential stripping, provenance | Explicit product/SKU/entitlement/expiry and source-field allowlists; arbitrary fields currently disappear |
| [Snapshots](../../../src/providers/provider-snapshot.js) | Pagination/end/count evidence | Define required sections, hidden scopes and whether the scan is partial |
| [Ownership](../../../src/lib/ownership.js) | User corrections and permanent/temporary/terminal states | Source-specific evidence interpretation and time-sensitive expiry where needed |
| [Identity](../../../src/lib/identity.js) | Existing exact/possible and edition safeguards | Acceptance tests for platform/SKU boundaries; console IDs are not automatic cross-store identity maps |
| [Backups](../../../src/lib/storage.js), manifest and packaging | Existing local persistence and Chrome/Firefox build structure | New fields must round-trip; both browsers need actual authenticated importer validation |

Two important constraints were verified locally. Generic console expiry fields are not currently registered, so adding an `expiresAt` property alone does not implement expiry. Also, platform alone is not a conflict in existing same-edition game comparison. A safe provider must not flatten editions/upgrade packages and assume the platform array will repair the lost identity. These are implementation gates, not authorization to rewrite matching during this audit.

The existing backup envelope can be reused; no second database or identity graph is justified. Adding provider enums/fields still needs compatibility tests. Old GL builds cannot be assumed to understand backups containing newly registered providers. Preserve user correction references and original access observations during resync; disappearance alone never proves return/revocation.

## Bounded next step

Validate Nintendo's ordinary signed-in portal in both browsers, without saving credentials or issuing mutations. Pass only if a multi-page sample accounts for owned, hidden, lent, borrowed and DLC-only entries, provides stable identifiers, and includes a known older never-played purchase. If any decisive access/identity distinction is unavailable, document partial scope or defer.

For PlayStation, independently validate the purchase branch; do not inherit the desktop importer's played/trophy fallback. A missing or contradictory Plus indicator stays unknown. For Xbox, first prove a purchase/entitlement source independent of title history. No amount of metadata enrichment makes a played-only list establish ownership.

After a passing gate, implement only one adapter at a time: registration and validation, account binding, full scan with proven scope, incremental behavior, correction/backup preservation, then packaged Chrome/Firefox acceptance. No raw tokens in logs/backups, no broad cookie permissions, no third-party proxy and no borrowed application client credentials. Stop on authentication or anti-bot failures.

## Validation performed and limitations

- Inspected GL provider records, metadata allowlists, profile namespaces, sender authorization, scan/snapshot guards, effective ownership, identity and backup paths. Inspected public implementation source independently for all three platforms.
- Unauthenticated PlayStation Library and Nintendo Virtual Game Cards navigation reached platform login. Microsoft billing records were not readable. No authentication bypass, purchase request, console action, personal library access or private backup inspection occurred.
- Added [a small offline architecture experiment](../../../scripts/research/console-integration-boundaries.mjs): **9 checks** for registration rejection, access states, metadata dropping, edition protection, platform behavior, supported-provider backup round-trip and incomplete-snapshot rejection. Run with `node scripts/research/console-integration-boundaries.mjs`. It uses synthetic objects and performs no network or storage operations.
- This experiment **does not retrieve console libraries**. Source inspection establishes plausible endpoints; only the documented user-side signed-in gates can establish actual session compatibility, completeness and account semantics. No current browser-extension acquisition path is claimed as tested.
- Repository documentation/layout validation passed. The normal GL unit suite passed **1,193 tests**; both Chrome and Firefox package checks validated **181 runtime files**. No signed-in console importer or packaged console UI test was possible because no console provider was implemented and no authenticated console account was available.

These reports are research deliverables, not runtime features. No production permission, matching, ownership, provider, synchronization or schema change is included. HB and FAN are untouched.
