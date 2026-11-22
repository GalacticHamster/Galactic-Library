# Shared Fanatical acquisition engine

GL and Fanatical Library use the same Fanatical acquisition implementation.
Humble acquisition is separate and has not been consolidated.

The authoritative engine is `shared/fanatical-acquisition.js`. Its contract
validator is `shared/provider-acquisition-contract.js`; GL's projection adapter
is `src/providers/fanatical-acquisition-adapter.js`. The build tool in
`scripts/provider-engine-build.mjs` copies the engine and validator into FAN and
embeds them with the adapter into GL's self-contained MAIN-world function.
The historical `candidateFiles` API name remains for existing test callers.

Each repository has its own `scripts/provider-engine-pin.json`. Its release
builder rejects changes to its pinned generated runtime. FAN builds offline
without a GL checkout; runtime synchronization does not compare engine revisions
or require peers to upgrade together. Pins are reproducibility checks, not
publisher signatures. Review changes before updating a pin. Never relabel modified
code with an old revision.

Run `node scripts/sync-provider-engines.mjs --check` in GL to verify both
consumers' actual source and Chrome/Firefox archives. This command writes no
runtime mirrors or release ZIPs. Independent production builds and tamper checks
are covered by `tests/provider-independent-build.test.mjs` and the per-repository
pin tests. Runtime archives exclude build metadata, audit files and test inputs.

## Authority boundaries

Acquisition outcome, independently established coverage, account affinity,
unresolved/retry information and persistence are distinct. Neither a finished
acquisition nor its contract grants reconciliation authority. A bare array can
finish the supported single-response acquisition contract (`coverage.complete`)
without independently proving enumeration (`paginationEvidence: 'array-only'`).
GL withholds archival for that evidence. FAN merges it additively, rejects a
headerless replacement that omits active products, and retains an earlier
count/range/link coverage summary. Valid per-order skip evidence can still advance.
An empty listing that omits supplied saved order identities is interrupted, not
a clean empty account. FAN supplies retained purchase origins in Full and Quick;
GL's Full acquisition omits the skip checkpoint and its writer separately
withholds archival for headerless results. Unknown statuses remain
unresolved and cannot authorize archival. Explicit session or order-identity
conflicts reject the acquisition. Consumer writers retain account/lease checks,
correction and history preservation, atomic commits and purchase-sharing consent.

The FAN worker requests `allowPartial:true` and validates that versioned receipt
before its existing writer validation. Strict acquisition remains available for
engine-level callers and regression tests, but is not the worker's production
mode. Tests must not override that argument. Corrupt checkpoint strings grant no
account or skip authority; valid retained purchase origins remain account evidence.

## Item-level admission

An order is a container of purchase evidence, not the unit of storage
admission. Its ownership evidence is the authenticated order detail: the same
order ID as the listing and status COMPLETE. Those order-level facts, and an
order status other than COMPLETE, still decide the whole order; an order-ID
conflict still rejects the acquisition.

Whole-order verification runs first and is unchanged; it keeps its occurrence
identities. When it fails in partial mode, the engine admits components
instead of discarding the order:

- A detail parent is corroborated by an unused summary parent with the same
  name and, where both state one, the same parent ID. A detail parent without
  a readable name is corroborated by the validated parent ID its summary
  parent states; one without an ID by a same-named summary parent, whose ID
  then identifies it. A summary direct-item parent requires the same direct
  item. Pick-and-mix selections are corroborated by their group name, at least
  one selection per listed group.
- Promotional parents are matched last, by name or (renamed gifts) by the same
  parent ID, and are always rejected, never owned.
- No container below the order is atomic. Groups, products and nested
  containers are judged one by one: a malformed group or product leaves only
  itself unresolved. Each product needs its own validated ID and title. A
  populated summary parent also limits its direct children to the names it
  lists.
- A product that is itself a container (a non-empty `bundles` list) is walked
  to a depth of eight; its products belong to the purchased parent. Whole-order
  verification never saves such a container as a product.
- Arrays of product-like entries under any other collection name (`tiers`,
  `products`, `items` and similar) beside the collection a level is read
  from are never read as purchases, since they may be selection pools or
  unpurchased tiers, and never treated as empty: each leaves its container
  incomplete (`nestedStructure`). Whole-order verification defers such orders
  to component admission.
- Everything else is unresolved by category: `summaryStructure`,
  `parentMissing`, `unexpectedDetailItem`, `identityMismatch`,
  `parentIdentity`, `parentStructure`, `childStructure`, `childIdentity`,
  `nestedStructure`, `productMissing` and `productUnexpected`. Nothing is inferred from titles
  alone, position or counts.

A summary parent whose shape the engine does not recognize no longer withholds
the detail request for the order; readable siblings still corroborate detail
components. An unnamed summary parent cannot be corroborated and keeps the
order unresolved. A summary parent carrying a parent-level product catalog
(`games`, `products`, `items` or `tiers`) without readable bundles may
describe a selection pool rather than a purchase, so it never corroborates a
detail parent, even one with the same name and ID; an order whose only named
parents are of that kind stays unresolved at the summary and its detail is
not requested.

If every component resolves, the order is verified with the same occurrence
identities as whole-order verification. Otherwise the order stays in
`unresolved` and `retry`, never in `orderFingerprints`, so neither consumer
checkpoints it and Quick reads it again. If at least one product was
admitted, its fingerprint is also listed in `partialOrderFingerprints` (a
subset of the unresolved, non-deferred orders), and only those orders, besides
verified ones, may appear as a product's purchase identity. Their occurrences
carry `basis: 'order-bundle-count'` with position-based references. GL's
origin merge replaces such provisional slots with native occurrences when the
order later resolves, so recovery neither duplicates nor drops a purchase;
FAN keys origins by order and bundle and keeps the larger quantity. FAN's
private order navigation also covers partly resolved orders, whose detail
carried the same validated order ID.

Each partly resolved order also has a recovery scope in `componentScopes`:
its unresolved count and, by product ID, each purchased parent still
incomplete with its admitted and unresolved counts. Fully verified parents
are implied. FAN keeps scopes in `fanaticalComponentScopes` and GL in its
Fanatical `syncState.componentScopes`; both replace an order's scope when it
is read again, drop it when the order is verified, and keep no scope outside
the retry set. FAN resets scopes on restore and account changes; the
unresolved order is never checkpointed, so the next scan rebuilds them.

A verified order whose contents were all excluded (a promotional gift)
contributes no product and no longer invalidates the other orders of a
receipt.

A `parent-missing` product mismatch also reports, as optional fields,
`summaryPromotionalParents` (order-list parents that are themselves
promotional) and `promotionalParentHasId`. Without them, a gift listed under
another name without an ID and a purchase the detail omits produce identical
counts.

`coverage.compatibility.components`, present only when item-level admission
ran, reports bounded counts: fully, partly and entirely unresolved orders,
orders resolved through components, admitted product occurrences, unresolved
and rejected components, unrecognized structures, purchased parents that
are fully, partly or not verified, products admitted from partly verified
parents and unresolved components by category. Detail shapes of unrecognized parents use `bundleShapes`. FAN
reports also state the purchases saved in part and their product records,
including how many an earlier scan had already saved.

Strict acquisition (`allowPartial:false`) remains whole-order. It is reached
only by engine-level regression tests; FAN's worker and GL's generated
callable always request partial acquisition. The `project` operation used by
FAN's test projector reads details without reconciliation and is not a
runtime path.

A product's admission depends on its own evidence plus its purchased parent's.
The remaining dependencies are evidence, not structure:

- Membership: a product is purchased only through a parent the order list
  corroborates. A parent the summary does not list, lists with another ID,
  lists as a different direct item, or describes with a product catalog,
  establishes no purchase, so its products stay unresolved.
- Identity: a purchase origin is keyed by order and parent ID, which keeps
  separate purchases of the same product distinct. When neither the detail
  nor the summary states a validated parent ID (`parentIdentity`), an
  invented key would later count the same purchase twice, so its products stay
  unresolved until an ID is available.
- Order-level facts (order ID, COMPLETE status, session and account checks)
  decide the whole order or acquisition.

## Regression structure

The FAN worker VM bridge resolves actual module exports and fails on unsupported
imports or missing dependencies. Its integration gate must reject removed,
unresolved, no-op and bypassed validators, not merely accept a scan that never
started. Installed tests separately exercise actual serialized code and storage
in disposable Chrome and Firefox profiles.

The frozen pre-adoption acquisition fixtures preserve historical differential
assertions. They are not production dependencies or current policy. The separate
adopted-contract matrix tests exact current GL/FAN behavior, including intentional
consumer differences: FAN may retain an unresolved-only attempt while GL refuses
an empty interrupted projection. Neither creates ownership evidence from it.

For an isolated complete-worker test, run
`node tests/provider-complete-worker-build.mjs`, set `FAN_WORKER_TEST_OVERLAY` to
the generated source directory, and run FAN's suite with
`--loader ../GalacticLibrary/tests/provider-complete-worker-loader.mjs`.
After adoption the ordinary FAN suite exercises the guarded worker without a
loader. Production browser tests should omit `--candidate`; the runtime campaign
supports `--production`. Mixed-version campaigns require explicit legacy package
paths and never select a personal installed extension.

No schema, purchase-sync protocol, permissions, automatic-pairing policy or
provider parser compatibility expansion is part of this adoption.

`tests/fanatical-component-admission.test.mjs` holds the item-level
admission matrix for the canonical engine, the FAN mirror and the GL callable,
including FAN-to-GL sharing of a partly resolved order. The GL writer path is
covered in `tests/fanatical-coverage.js`; FAN's worker and storage path in
FAN's `tests/import-safety.test.mjs` and its installed-extension check
`tests/import-progress-native.mjs`.
