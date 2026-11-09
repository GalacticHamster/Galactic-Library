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
acquisition nor its contract grants reconciliation authority. A bare array may
finish successfully while coverage remains unverified. Unknown statuses remain
unresolved and cannot authorize archival. Explicit session or order-identity
conflicts reject the acquisition. Consumer writers retain account/lease checks,
correction and history preservation, atomic commits and purchase-sharing consent.

The FAN worker requests `allowPartial:true` and validates that versioned receipt
before its existing writer validation. Strict acquisition remains available for
engine-level callers and regression tests, but is not the worker's production
mode. Tests must not override that argument. Corrupt checkpoint strings grant no
account or skip authority; valid retained purchase origins remain account evidence.

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
