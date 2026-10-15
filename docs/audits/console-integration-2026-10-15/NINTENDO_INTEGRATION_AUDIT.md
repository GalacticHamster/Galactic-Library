# Nintendo integration feasibility

Research date: **2026-10-15**. GL baseline: `a0c199b`, schema 13. Public source inspection and unauthenticated navigation only; no Nintendo account credentials, library or production state were accessed.

## Decision: CONDITIONAL GO

**Best first candidate**, for a deliberately scoped Switch / Switch 2 digital-library importer using the Nintendo Account **Virtual Game Cards** portal. This is more promising than treating a two-year transaction history as the full library. First require a signed-in validation of hidden cards, lending, product identity and pagination. Nintendo Switch Online catalog enumeration is not part of this proposed MVP.

## Official and implementation evidence

Nintendo documents purchased digital games and DLC as virtual game cards, with family lending. Its support distinguishes physical packages and subscription-exclusive content from virtual cards. A card loaded on a shared console does not establish that every console user owns it. [Virtual Game Card Guide](https://en-americas-support.nintendo.com/app/answers/detail/a_id/67891/), [Nintendo explanation of cards, physical copies and subscription content](https://support.nintendo.com/jp/switch2/play/digital/vgc/about/index.html).

The website can manage virtual cards; Nintendo also notes limitations for demos and some subscription-exclusive games. [Official Virtual Game Cards page](https://www.nintendo.com/au/hardware/virtual-game-cards/). The unauthenticated portal `https://accounts.nintendo.com/portal/vgcs/` redirected to Nintendo login during this research. This is an authentication boundary, not a successful library test. [Portal](https://accounts.nintendo.com/portal/vgcs/).

The inspected Playnite Nintendo client reads the portal's `data-json` blocks, then calls its supplied GraphQL endpoint with a transient ID token and client header. `getVgcs` uses offset/total pagination with a 300-row request batch. Its query fixes `isHidden: false` and requests owner/user, lending/expiry, application, add-on and upgrade flags. Those fields are evidence of a possible implementation path; their full account semantics still require validation. Do not copy desktop cookie persistence into GL. [NintendoAccountClient.cs](https://github.com/XenorPLxx/playnite-library-nintendo/blob/main/Services/NintendoAccountClient.cs).

The outer plugin maps application IDs and titles, can exclude add-on-only entries, recognizes NX/OUNCE platforms, and deduplicates by application ID. GL should not assume those choices preserve all edition/DLC identities. [NintendoLibrary.cs](https://github.com/XenorPLxx/playnite-library-nintendo/blob/main/NintendoLibrary.cs). Its manifest records migration to Virtual Game Cards and Switch 2 support; this is materially newer than transaction-only approaches. [Release manifest](https://github.com/XenorPLxx/playnite-library-nintendo/blob/main/manifest.yaml).

The public [Nintendo Developer Portal](https://developer.nintendo.com/) concerns game development. No documented, public third-party consumer account-library API was established here. The proposed portal route remains an undocumented website integration.

## Data completeness and access interpretation

| Data | Expected route / limitation | GL treatment |
| --- | --- | --- |
| Purchased digital Switch / Switch 2 games | Virtual cards are a strong candidate | Owned only after confirming card ownership, not mere visibility |
| Redeemed game codes | Validate a known redeemed title in the card list | Preserve the actual product; do not require a payment receipt |
| Free permanent claims | Validate whether these appear as cards | Explicit permanent grants may be claimed; catalog availability is insufficient |
| Borrowed / lent cards | Ownership and lending evidence must be interpreted together | Borrower access is borrowed, not owned; lending one's own purchase need not erase ownership |
| NSO / Expansion Pack | Virtual cards are not the complete subscription catalog | Exclude unsupported catalog expansion from MVP; represent supported subscription evidence separately |
| DLC-only / upgrades / editions | Card/application grouping may not identify each purchased SKU | Retain uncertainty; do not grant a base game from DLC-only evidence |
| Acquisition date / price | Optional transaction corroboration | Card activation/sort order is not automatically the purchase date |
| Hidden / older / delisted purchases | Must test all applicable card scopes and a known old purchase | No completeness claim from the visible-card page alone |
| Physical cartridges / played games | No personal physical inventory demonstrated | Do not infer ownership from play history, points, installation or shared access |

Nintendo's online transaction history covers **up to two years**; account/child-account histories are separate. It is useful supplementary evidence but an unsuitable sole source for a full older digital library. The main Nintendo store's shipping/order page is not a substitute for eShop entitlement evidence. [Purchase-history support](https://en-americas-support.nintendo.com/app/answers/detail/a_id/22465/p/992/c/186), [store order page](https://www.nintendo.com/us/orders/).

Proposed conservative rules are **design recommendations, not proven field meanings**: confirm the signed-in account and compare ownership evidence with that account; keep incoming family loans temporary; preserve a lender's permanent purchase when explicitly supported; treat unknown owner/status combinations as unknown. Never equate an application grouping, a DLC flag or a membership badge with a full-game license. A source may omit revoked cards, so disappearance alone cannot establish a refund.

## Integration into GL

Use the existing [provider/profile model](../../../src/lib/provider-profiles.js), [scan authorization](../../../src/background/service-worker.js), [atomic writer](../../../src/background/storage-writer.js), [snapshot validator](../../../src/providers/provider-snapshot.js), ownership corrections and normal backup format. This is an adapter plus bounded registration work, not a second library system.

Add provider enumeration, the account-portal route, UI configuration and reviewed metadata fields. Retain a stable card/product observation identifier only after verifying stability across reloads; keep application identifiers separate. Register platform/edition distinctions, source status and any explicit acquisition/expiry fields. GL already has top-level `platform`, `acquiredAt`, `game` / `game-addon` and the required ownership states. It does not yet accept arbitrary Nintendo metadata or enforce generic console expiry. [Record normalization](../../../src/lib/models.js), [metadata allowlists](../../../src/lib/metadata-validation.js), [effective ownership](../../../src/lib/ownership.js).

Do not discard distinct card/SKU records just because a desktop plugin deduplicates them. GL's existing matching is not console-ID-aware and platform alone is not an edition conflict. Test Switch versus Switch 2 editions, upgrade-only purchases and base/DLC pairs before enabling automatic imports. Preserve existing matching semantics and original source titles. [Identity code](../../../src/lib/identity.js).

A signed-in account fingerprint, when verifiable, should bind to GL's immutable profile identity, not its nickname. Multiple Nintendo users on a console or family membership must not combine their libraries. Preserve account selection/confirmation when identity is ambiguous; do not infer identity from a display name.

## Local execution and permissions

Prefer a user-opened account-portal tab and browser-managed authentication. A narrowly scoped page-context query may consume the portal's existing session information in memory and return only sanitized records. It must never export/store the ID token, session cookies, device IDs or raw portal state. No account password, copied cookie, backend or native helper is required by the proposed design, but browser compatibility remains unverified.

Start with `https://accounts.nintendo.com/portal/vgcs/*`; identify and allowlist the actual GraphQL origin before adding any cross-origin host permission. Never make GL a proxy for arbitrary endpoint URLs read from a page. Retain only fields needed for library/access evidence. Do not reproduce the plugin's user-agent/cookie-storage machinery as a workaround for authentication or anti-bot challenges.

Read-only GraphQL POSTs must be explicitly selected; never execute load/eject/lend/redeem mutations. Server rate limits were not established. The inspected client batch size is not a published rate allowance. Use sequential pagination, count/offset checks, bounded retries and explicit failure status. Test Chrome and Firefox sessions, CORS and privacy settings separately.

## Required validation before implementation approval

1. Open the portal normally while signed in; verify both a never-played purchase and a purchase older than two years.
2. Check a redeemed code, a permanent free claim, a DLC-only purchase, a Switch 2 upgrade and an unavailable/delisted title where available.
3. Compare visible and hidden cards and verify end-of-pagination totals on a multi-page account. An unsupported hidden scope means a partial scan, never permission to prune omitted records.
4. Inspect owned, lent-out and borrowed examples; verify account/owner semantics and expiry without collecting the token.
5. Repeat after reload and account switching in Chrome and Firefox. Confirm stable observation IDs and unchanged repeat results.
6. Preserve a local sanitized field schema and minimal synthetic fixtures, not raw network archives or portal state.

No signed-in account was available; **none of these acquisition tests has been passed**. The offline architecture experiment does not replace them.

## Effort and 1.0 recommendation

Estimates for one developer familiar with GL: gate **1–2 days**, purchase-focused MVP after a successful gate **4–6 days**, polished scoped integration **8–12 days**. These estimates exclude full NSO catalog modeling, legacy 3DS/Wii U histories, complete transaction recovery and a new edition/identity system. Unresolved SKU or borrowing semantics can expand the effort substantially.

Authorize a time-boxed validation first. Include before 1.0 only if that validation promptly demonstrates reliable ownership and clearly bounded coverage. Otherwise defer; a mostly complete-looking list with borrowed or DLC-only games marked owned would be a worse outcome than shipping fewer providers.
