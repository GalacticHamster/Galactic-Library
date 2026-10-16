# Xbox Web Library: bounded source validation for 1.0

Date: **2026-10-15**. Updated **2026-10-16**, helper **0.1.2**. Revised scope: the roughly 37 web-visible games only.
The roughly 245 mobile/console titles, Collections v7, device authentication,
application registration and historical recovery remain deferred.

## What the existing website source establishes

Previously inspected first-party public assets are retained as research inputs
outside source control. In the [application systems asset](https://play.xbox.com/assets/entry.client-mg5cb0xn.js),
the service-worker manager exposes its environment as `window.__SW_MANAGER__.env`.
That environment includes the website's query client and library systems.
The code defines these cached queries:

- `library.resolveCatalogItems({catalogId: 'owned'})`: the actual Owned view's
  resolved product identifiers after catalog filters and sorting.
- `library.assembledItems({dataSet: 'fullLibrary'})`: hydrated item/title records
  after the website's platform/installability/streamability gates.
- `contentAccess.allProductAccess()`: access data already restricted to the
  active account; `userAccessTypes` distinguishes personal from aggregate flags.
- `authentication.activeUserId` and `authentication.userInfo`: active local
  query scope and stable Xbox ID, respectively.

Account-scoped reads use each generator's **`getUserQuery(activeUserId)`**,
not `getActiveUserQuery()`. The latter addresses a temporary `['user', 'active',
...]` proxy, with immediate garbage collection; it is not an account identity.
The underlying `['user', actualAccountId, ...]` query can remain populated after
its proxy disappears. Exact keys are obtained from the website's generator,
not reconstructed by the helper.

`library.resolveCatalogs()` supplies catalog totals and a few preview entries.
The website can preload this overview without loading
`resolveCatalogItems({catalogId: 'owned'})`. Preview entries are **never**
substituted for a complete Owned list.

The website joins Content Access and catalog data before presenting its library.
Raw CAS row counts alone cannot establish the 37 visible products. Existing
history data can affect ordering/assembly but is not used as purchase evidence.
Reading the final website cache would avoid the earlier page-fetch probe's
blind spot for service-worker-owned requests. Cache availability is now
**live-validated**, while the reconstructed selection and importer remain
unvalidated on the live account. The
public asset could not be re-fetched through the browser tool during this turn;
the helper detects missing or changed runtime interfaces rather than assuming
the inspected build still applies.

## Minimal read-only helper

Load [the helper folder](../../../scripts/research/xbox-web-validation/manifest.json)
as an unpacked/temporary extension, or build its ZIP with
`node scripts/research/package-xbox-web-validation.mjs`. Output stays in ignored
`audit-artifacts/console-web-validation/GL-Xbox-Web-Validation.zip`.

1. Reload Xbox's signed-in website.
2. Open **Library** and clear search/filters. Let the cards finish loading. A separate Owned detail view is no longer required.
3. Click **Update summary**, then **Copy summary** on the helper panel.

The helper reads only known query options and existing cache entries. It never
calls `fetch`, `fetchQuery`, authorization helpers, token caches or mutating
website APIs. It adds no network/storage permissions or request interception.
No credential is read; only the noncredential Xbox-ID field of the cached
profile is tested for presence. Query-account IDs are compared locally and never
exported. Names, product IDs, account IDs, query keys, headers and profile PII
never enter the summary. The isolated-world UI reapplies a bounded allowlist.

The report identifies whether selection came from the cached Owned detail view
or a reconstructed catalog (`selectionSource`). It also reports whether the
reconstruction agrees with the catalog (`selectionReconciled`) and its candidate
count (`reconstructedOwnedRows`). It distinguishes available/missing/pending cache, account versus alias
key scope, account-key agreement, active-account stability, a fixed waiting
reason, optional Owned catalog total/preview counts,
Owned-list counts, distinct/duplicate products, title/access joins, first-party
products, personal access flag counts and visible DOM product-link counts.
Assembled-library and access counts remain visible when the Owned list is
absent. Optional catalog-overview absence does not invalidate an otherwise
complete join. DOM links are a viewport subset, not completeness evidence. Data is bounded at
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

**Twelve focused synthetic tests** and installed read-only helper tests in **Chrome
and Firefox** pass. Synthetic data joins 37 entries, stable IDs, catalog titles
and personal access flags; missing cache, mixed accounts, duplicate identities,
missing titles, third-party sources and hostile messages remain explicit. Tests
model separate active aliases and account backing queries, including a collected
Owned alias, an unloaded full list with overview previews, incorrect account
keys and an account switch during inspection. They assert zero helper network
requests and no identifying summary values. Synthetic counts do not establish
that reconstruction selects the same 37 products on the live account.

Current status: **Awaiting live source validation; no production Xbox provider**.
The user only needs to copy the updated helper's summary. No DevTools inspection, token
capture, account registration or Microsoft authorization experiment is required.

## Live 0.1.0 report and diagnostic correction

The user's report found the manager, cached profile, assembled library and
access queries, while the Owned query was absent and `accountScopesMatch` was
false. The first-party query factory proves that the old helper incorrectly
compared the fixed proxy key segment `active` with the actual local account ID.
That false warning is a **helper bug**, not evidence of a signed-in account
mismatch. The same proxy lookup could miss an existing account-specific Owned
query. The report alone does not establish whether the actual Owned backing
query was populated or the website had loaded only a catalog overview.

Helper 0.1.1 fixes the key selection, retains the before/after account check,
and reports overview, assembled and access counts independently. It still
makes no network requests or imports and exports no identifying values.
A new live summary is required to establish the actual web-owned count and
join; the synthetic 37-row tests do not establish that live result.

## Live 0.1.1 report: catalog available, detail view unloaded

The next live report confirmed a stable account and matching actual-account
keys for every query. It exposed **40 assembled records, 264 access products,
37 Owned catalog entries and 14 preview rows**. All backing queries except the
Owned detail list succeeded and were idle. There is no demonstrated account or
authorization failure. The old `flags: {}` came from returning before inspecting
individual products; it does not establish absent personal ownership flags.

The missing detail query is consistent with the website loading its catalog
overview without opening a particular catalog. In the inspected first-party
source, `GBe` builds catalog descriptors from the assembled full library and
personal access map. Its default `KK` filter removes entries with
`basicProductInfo.bundleChildren.length > 0`. `oq`/`nq` then select the Owned
catalog by **first-party provider (`grts-catalog-provider`) and
`userAccessTypes.has(1)`**. That map is scoped to the active account. Aggregate
access, history, installations, subscriptions, disc and trial flags do not
substitute for personal Owned. The 264 access products are therefore not the
37-game web selection and are not imported as a lifetime library.

Helper 0.1.2 can reconstruct that precise selection when the detail query is
absent. It requires idle successful account, profile, assembled, access and
catalog queries, matching account keys, an unchanged active account, an exact
catalog total, unique selected IDs and unique preview IDs all belonging to the
selection. A nonempty catalog requires nonempty previews. Normal title/access
join and ID checks still apply. Preview cards remain checks, never the source
of the full selection. Disagreements report their candidate count and a fixed
reason; they do not become a ready result. A valid zero total is handled without
inventing products. Existing resolved-detail behavior is unchanged.

Tests reproduce the reported **40/264/37/14 shape synthetically**, including a
bundle container, subscription-only record, third-party record and access-only
products. They also reject count disagreements, equal-count wrong preview IDs,
duplicates, aggregate-only ownership and unsettled source queries. Installed
Chrome and Firefox checks exercise reconstruction through the actual MAIN to
isolated-world bridge and missing-catalog feedback with zero helper requests.

**Still awaiting:** a live 0.1.2 summary confirming the 37 reconstructed products,
title joins and personal access flags. No production Xbox provider or import has
been enabled, and no personal GL data has changed. Completing this gate needs
no DevTools, different website view, tokens or new authorization experiment.
