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
blind spot for service-worker-owned requests. Cache availability, reconstructed
selection and the initial production save are now **live-validated**. The
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

Current status: **Working; initial production import live-confirmed by the user**.
The research helper can now be disabled; production imports do not depend on it.
No DevTools inspection, token capture, account registration or Microsoft
authorization experiment is required.

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

**Historical gate (now satisfied):** a live 0.1.2 summary confirming the 37 reconstructed products,
title joins and personal access flags. No production Xbox provider or import has
been enabled, and no personal GL data has changed. Completing this gate needs
no DevTools, different website view, tokens or new authorization experiment.

## Live 0.1.2 reconciliation and production integration

The user confirmed **ready**, matching/stable account, **37 distinct products,
37 joined titles, 37 personal Owned flags, zero duplicates/unsupported IDs or
missing titles**, and agreement with the 37-item catalog and its 14 preview IDs.
The 40 assembled and 264 access counts remained distinct. DOM product-link
counts were zero; reconciliation uses the account-bound website catalog, not
visible DOM anchors or a claim to independent screen scraping. The helper's
`libraryComplete: false` and `ownershipVerified: false` are conservative fixed
research fields, not contradictory evidence about the now-successful join.
They never establish complete lifetime ownership or transaction verification.

The [production projection](../../../src/providers/xbox-library.js) uses the
same validated first-party/personal-Owned/non-container rule. It requires the
website's exact account-specific queries to succeed and be idle/not invalidated,
checks catalog total and all preview IDs, validates stable product IDs and
bounded titles/access/platform sets, and preserves supplied metadata. No
resolved-detail query or independent Xbox request is required. Catalog counts
are not fixed at 37. Empty imports require an explicit zero descriptor.

The [MAIN bridge](../../../src/providers/xbox-capture.js) hashes the stable Xbox
ID with a provider prefix for the existing GL account binding. Raw account IDs,
profile PII and the complete access map do not leave MAIN. Preparation is checked
again after hashing, expires after two minutes, and is re-read/compared before
saving. The digest includes projected products, access/platform/edition metadata,
preview identities and query update markers. Loading, failures, invalidation,
account changes and changed preparations reject before import. Unrecognized
website exceptions produce a generic message without exporting their contents.

The [panel](../../../src/providers/xbox-content.js) supplies Full rescan and
Quick update, immediate stage feedback, account consent and truthful committed
counts. The existing writer requires the matching Library origin/path, tab,
scan lease, account hash, supported complete snapshot and per-product personal
Owned evidence. Both modes use additive atomic merging, retain omitted records,
and preserve user corrections. No matching, synchronization protocol, contents,
HB/FAN data or schema version changed. Only play.xbox.com/library content-script
scope was added; there are no additional Xbox API hosts or permissions.

Product IDs remain independent. The account-scoped personal Owned flag supports
source-derived Owned, not proof of price, purchase date or transaction. Other
access flags and supported platform codes are preserved. The source's coarse
Durable/App/Game/Bundle kinds remain metadata rather than guessed DLC parent or
bundle-child records. Expiry/revocation is not inferred from disappearance.
This reads current page cache; users reload Xbox Library before an update.
Stale successful cache without an observable account/invalidation change cannot
be independently reauthenticated without an additional website request, which
this integration deliberately does not make.

Validation uses the shared synthetic 40/264/37/14 fixture, never a personal
account or backup. Focused console tests cover source mismatches, flags, account
isolation, leases, preserved corrections, omissions, zero totals and backup
round-trips. Installed Chrome/Firefox packages commit 37 products through the
real worker, repeat full/quick imports, retain the omitted 37th product after a
36-product scan, reject incomplete/switched sources, and restore backups. Their
page fixture records zero source requests. Existing PlayStation/Nintendo native
checks and packaged Providers navigation also remain passing.

Completed checks: **1,225 full GL unit/matching tests, 472 contents tests,
32 focused console tests, 12 packaged Providers UI checks per browser**, installed
Xbox/PlayStation/Nintendo import tests in both Chrome and Firefox, repository
links/layout, and both 189-file release packages. All used disposable data and
an artifact-free checkout; ignored output was not required as test input.

## Live production acceptance and direct Owned link

The user completed the production Full rescan and confirmed:

> Saved 37 checked titles · 37 products · 37 new · 0 access changes.
> Complete web-visible Owned catalog; earlier saved items retained.

This confirms the real GL save, not just research-helper selection. Xbox is
**Working** for the limited web-visible Owned catalog. Full/quick repeat imports,
account switching and retention remain disposable-test results; live quick
updates have not yet been reported. No agent modified the personal library.

The user also identified that the generic Library landing page needs several
clicks before the relevant data loads. Provider opening and account-update
links now use [the full-library Owned grid](https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned) directly. This changes navigation only; source checks, import scope,
account consent and saving behavior are unchanged. Packaged Providers UI checks
assert the actual rendered link retains all three required query parameters.
