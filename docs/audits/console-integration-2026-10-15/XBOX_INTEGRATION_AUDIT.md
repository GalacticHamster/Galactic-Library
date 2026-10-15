# Xbox integration feasibility

**Latest research:** [Xbox ownership beyond cloud gaming](XBOX_OWNERSHIP_BEYOND_CLOUD.md) prioritizes a GL-owned consumer Collections grant and historical purchase coverage. The observed cloud Library is insufficient for a substantial console collection; production integration remains gated on authenticated evidence.

**Superseded Xbox recommendation:** The [consumer ownership follow-up](XBOX_OWNERSHIP_FOLLOWUP.md) found the current Xbox web Content Access caller and an MSA Collections implementation. It revises Xbox to **Conditional Go for a validated partial importer**. The initial evidence, ranking and estimates below are historical.

Research date: **2026-10-15**. GL baseline: `a0c199b`, database schema 13. Research only; no account access or production changes. Public documentation and implementation inspection establish capabilities, not successful authentication against a personal library.

## Decision: DEFER before 1.0

An Xbox **purchase-history importer** may be feasible locally. A reliable, account-wide owned/access library has not been demonstrated for a normal browser extension. Do not substitute title history or the public Game Pass catalog for that library. Rank: **third**. A backend would not, by itself, grant access to restricted commerce APIs.

## Available approaches and evidence

**Official commerce APIs exist, but are not an unrestricted consumer library API.** Microsoft documents Collections `publisherQuery` as partner-service-only, requiring configured products and authentication; it accepts a predefined product list and provides continuation tokens. Its documented limit is 100 queries per user per five minutes. That limit belongs to this service, not the billing website. The response distinguishes direct/code acquisition, recurring access and conditional entitlements, with status and validity dates. These are useful semantics, but not evidence GL can call the API for arbitrary publishers. [Microsoft publisherQuery reference](https://learn.microsoft.com/en-us/xbox/gdk/docs/store/commerce/service-to-service/microsoft-store-apis/xstore-v9-query-for-products?view=gdk-2604).

The older UWP Collections API explicitly scopes products to applications associated with the developer's Azure AD client ID. A consumer OAuth login does not remove this scope. [Official UWP reference](https://learn.microsoft.com/en-us/windows/uwp/monetize/query-for-products).

Native XStore licensing is also not a browser-wide library enumeration mechanism: game-license queries concern the launching application's license. A disc-license flag there is not an inventory of the user's physical purchases. [GDK commerce overview](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/getting-started/xstore-overview?view=gdk-2604), [license-query reference](https://learn.microsoft.com/sv-se/xbox/gdk/docs/reference/system/xstore/functions/xstorequerygamelicenseasync?view=gdk-2604).

**The ordinary account website is the most defensible local research path.** Microsoft supports signed-in Order history with selectable order/date ranges, and identifies Completed/Redeemed transactions. This establishes a useful source of purchase observations; it does not establish that every historical code claim or current license is listed. Pagination, date-range limits, product IDs and refund fields need signed-in validation. [Microsoft order-history help](https://support.microsoft.com/en-us/accounts-billing/view-your-microsoft-store-order-history).

**Open-source comparison:** Playnite's inspected Xbox client authenticates through Microsoft/Xbox tokens and `GetLibraryTitles()` calls `titlehub.xboxlive.com/.../titles/titlehistory/decoration/detail`. This is activity-oriented evidence, not a purchase ledger. Its desktop authentication/token storage is not an extension implementation to copy. [XboxAccountClient.cs](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/XboxLibrary/Services/XboxAccountClient.cs). Its outer importer also considers installed games, which cannot fix the ownership distinction. [XboxLibrary.cs](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/XboxLibrary/XboxLibrary.cs).

No verified working, current account-wide entitlement endpoint suitable for GL's browser-only constraints was established in this audit. This is a finding about the inspected evidence, not proof no private endpoint exists.

## Expected information and limits

| Information | Purchase-page route | Release treatment |
| --- | --- | --- |
| Digital purchases | Supported transaction source; exact extraction untested | Import successful game line items, subject to refund/current-access reconciliation |
| Redeemed codes | Redeemed status exists; complete code coverage unproven | Include only identifiable product grants actually exposed |
| Permanent free claims | Historical completeness unknown | A free catalog listing or zero-value non-product transaction is insufficient |
| Game Pass / EA Play / conditional claims | Subscription charge is not a list of game licenses | Separate subscription evidence; never mark catalog titles permanently owned |
| DLC / editions | Potential product/SKU or order-line evidence, not validated | Preserve exact products; no inferred DLC bundle expansion |
| Acquisition dates / price | Likely useful transaction facts; must inspect fields | Preserve transaction date, distinguish order total from item price |
| Refunded / revoked content | Must validate actual status availability | Prior receipt alone cannot guarantee current ownership |
| Played / installed | Available through other techniques | Optional activity only, no ownership promotion |
| Physical discs / household sharing | No complete browser inventory demonstrated | Do not infer personal ownership |

A receipt-only adapter would be **partial purchase evidence**, not a complete current-access inventory. It must not remove older GL records when a date window, page or transaction is absent. Do not label an account fully synchronized merely because the currently visible page was read.

## GL implementation path if revisited

Reuse [profile isolation](../../../src/lib/provider-profiles.js), sender-bound scans in [the worker](../../../src/background/service-worker.js), atomic [writer operations](../../../src/background/storage-writer.js), and [snapshot validation](../../../src/providers/provider-snapshot.js). Add an Xbox provider registration, bounded metadata fields, account-page URL allowlist, provider card and an isolated extractor. No parallel database is warranted.

Use a verified Store product/SKU as product identity; an order-line key identifies an acquisition observation, not necessarily a unique edition. Xbox title IDs and Microsoft Store IDs must not be treated as interchangeable. Keep source platform and edition labels. GL currently allows same-title compatible-edition games to consolidate without a platform conflict; platform-specific SKU behavior therefore needs explicit acceptance fixtures, not an assumption that new provider IDs prevent consolidation. See [identity code](../../../src/lib/identity.js).

Existing access states support owned, claimed, subscription, borrowed, unknown, returned, revoked and expired. Console-specific expiry/evidence fields are not yet allowlisted, and generic console expiry is not implemented. A future adapter must supply validated state plus a bounded provider-specific expiry resolver where necessary; merely storing an expiry string would not enforce it. Preserve user corrections through existing record references. See [ownership](../../../src/lib/ownership.js) and [metadata validation](../../../src/lib/metadata-validation.js).

Prefer a user-opened `account.microsoft.com` billing tab and the browser's existing session. Add only that page origin initially; inspect actual additional origins before requesting any. No passwords, copied XSTS/refresh tokens, native helper, broad cookie permission or backend in the MVP. A page-context request, if needed, must return sanitized purchase rows only. Test Chrome and Firefox independently; being logged in on one origin does not prove a cross-origin request succeeds.

## Exact validation needed

With a signed-in test account, inspect one never-played digital purchase, one code redemption, a free claim, an active subscription-only game, a refunded purchase, a DLC and a deluxe edition. Navigate the oldest supported date range and every next page. Establish product/SKU and transaction identifiers, account identity, pagination end conditions, and whether refunds are distinguishable. Repeat unchanged and after switching accounts in both browsers. Record only a field schema and sanitized minimal examples, never cookies or payment details.

The unauthenticated research browser could not inspect Microsoft billing records. No account-wide retrieval was tested. Stop on authentication/anti-bot failures; do not work around access controls.

## Effort and release risk

Engineering estimates, not measured implementation times, for one developer familiar with GL:

- Validation spike: **1–2 days**, requiring a suitable signed-in account.
- Receipt-only MVP after a successful spike: **4–7 days**; polished partial importer **10–20 days**.
- Complete owned/subscription library: **no defensible bounded estimate** until an eligible source is demonstrated.

DOM drift, localized billing pages, older purchases, code-only grants and refund reconciliation dominate risk. Unknown website rate limits require sequential bounded reads, respecting 429/Retry-After and stopping on 401/403. A backend is unnecessary for a page importer and insufficient to solve authorization/completeness. Keep this outside the 1.0 critical path.
