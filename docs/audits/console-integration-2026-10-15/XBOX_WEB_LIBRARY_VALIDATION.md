# Xbox Web Library: bounded source validation for 1.0

Date: **2026-10-15**. Revised scope: the roughly 37 web-visible games only.
The roughly 245 mobile/console titles, Collections v7, device authentication,
application registration and historical recovery remain deferred.

## What the existing website source establishes

Previously inspected first-party public assets are retained as research inputs
outside source control. In the [application systems asset](https://play.xbox.com/assets/entry.client-mg5cb0xn.js),
the service-worker manager exposes its environment as `window.__SW_MANAGER__.env`.
That environment includes the website's query client and library systems.
The code defines these account-scoped cached queries:

- `library.resolveCatalogItems({catalogId: 'owned'})`: the actual Owned view's
  resolved product identifiers after catalog filters and sorting.
- `library.assembledItems({dataSet: 'fullLibrary'})`: hydrated item/title records
  after the website's platform/installability/streamability gates.
- `contentAccess.allProductAccess()`: access data already restricted to the
  active account; `userAccessTypes` distinguishes personal from aggregate flags.
- `authentication.activeUserId` and `authentication.userInfo`: active local
  query scope and stable Xbox ID, respectively.

The website joins Content Access and catalog data before presenting its library.
Raw CAS row counts alone cannot establish the 37 visible products. Existing
history data can affect ordering/assembly but is not used as purchase evidence.
Reading the final website cache would avoid the earlier page-fetch probe's
blind spot for service-worker-owned requests. This is a source-supported route
to test, **not yet a live-validated API contract or completed importer**. The
public asset could not be re-fetched through the browser tool during this turn;
the helper detects missing or changed runtime interfaces rather than assuming
the inspected build still applies.

## Minimal read-only helper

Load [the helper folder](../../../scripts/research/xbox-web-validation/manifest.json)
as an unpacked/temporary extension, or build its ZIP with
`node scripts/research/package-xbox-web-validation.mjs`. Output stays in ignored
`audit-artifacts/console-web-validation/GL-Xbox-Web-Validation.zip`.

1. Reload Xbox's signed-in website.
2. Open **Library → Owned** and clear search/filters. Let the cards finish loading.
3. Click **Update summary**, then **Copy summary** on the helper panel.

The helper reads only known query options and existing cache entries. It never
calls `fetch`, `fetchQuery`, authorization helpers, token caches or mutating
website APIs. It adds no network/storage permissions or request interception.
No credential is read; only the noncredential Xbox-ID field of the cached
profile is tested for presence. Query-account IDs are compared locally and never
exported. Names, product IDs, account IDs, query keys, headers and profile PII
never enter the summary. The isolated-world UI reapplies a bounded allowlist.

The report distinguishes available/missing/pending cache, active-account scope,
Owned-list counts, distinct/duplicate products, title/access joins, first-party
products, personal access flag counts and visible DOM product-link counts.
DOM links are a viewport subset, not completeness evidence. Data is bounded at
50,000 rows; only one aggregate summary is retained in memory. No storage is
written and reloading resets the helper.

`state: ready` means the supported cached views can be joined consistently.
It deliberately retains `libraryComplete: false` and `ownershipVerified: false`:
live count reconciliation, source freshness, filter scope, expiry and production
account-switch/commit validation still precede any importer. An absent cache is
not an empty library or proof of an authorization failure. Unknown access flags
are not promoted to ownership; no subscription or catalog membership is treated
as a purchase.

## Validation and remaining gate

**Six focused synthetic tests** and installed read-only helper tests in **Chrome
and Firefox** pass. Synthetic data joins 37 entries, stable IDs, catalog titles
and personal access flags; missing cache, mixed accounts, duplicate identities,
missing titles, third-party sources and hostile messages remain explicit. Tests
assert zero helper network requests and no identifying summary values. This is
not evidence that a live Xbox account exposes the same environment today.

Current status: **Awaiting live source validation; no production Xbox provider**.
The user only needs to copy the helper's summary. No DevTools inspection, token
capture, account registration or Microsoft authorization experiment is required.
