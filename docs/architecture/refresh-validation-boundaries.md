# Refresh validation trust boundaries

The storage writer serializes authoritative mutations. An observation checkpoint saves evidence and queue cursor together using the existing single storage operation. Query snapshots are detached, deeply frozen, validated committed values; matching/ownership outcomes and eligibility answers are not substitutes for database validation.

## Why two full passes existed

`getDatabase` treats storage as a trust boundary. `validateDatabaseAsync` is also a normalizer and repair engine, rather than a boolean validator: it constructs normalized provider records, validates source/history/reviews, allocates missing legacy references, applies older-schema defaults and the Humble key-evidence repair, and reconstructs canonical groups with stable IDs. A changed normalized result triggers the existing ordered migration write and enrichment-job queue remapping. An epoch or lease alone cannot prove the stored value was validated.

`persistDatabase` runs the same pipeline on the working database after acquisition updates. Entry validation proves a bounded source is suitable for a current Kindle record; it does not prove every updated metadata field, history record, observation coordinate, cross-record reference or global bound. The outgoing pass supplies that proof and the normalized value actually persisted. Refresh omits an extra explicit canonical rebuild before this pass.

| Pipeline work | What it establishes | Scope needed for a future trusted delta |
|---|---|---|
| Top-level schema and collection limits | Supported versions, correct map shapes and record/history/review bounds | Trust existing schema; recheck changed map sizes and global limits |
| Provider record normalization | Provider/key/title/media/ownership bounds, deterministic title/edition keys, UUID/date/platform normalization, metadata allowlists | Changed records only if unchanged records are immutable and already validated |
| Enrichment/source validation within records | Source host/type, versions, text/array bounds; recomputed source-backed manifest selection/candidates, bounds on stored parser fields and detached cache outputs | Changed enrichment/source values; existing immutable evidence may retain its prior proof |
| Provider state and ownership policy | Profile/sync-health/state types and policy shape | Unchanged for a contents-only checkpoint; validate changes in their own transactions |
| Legacy repairs | Missing persistent IDs, defaults/schema upgrade; Humble unavailable-key purchase evidence overrides stale direct-download ownership | Full trust-boundary repair; incremental mode must be disallowed for unrepaired input |
| Provider identity/reference invariants | Unique normalized provider identities and active record UUIDs; feed-reference collision checks | Existing global indexes plus delta removal/addition checks; contents-only updates cannot change IDs or ownership |
| Provider/enrichment history | Reason/profile/date/reference/kind bounds and normalized previous sources | Changed/deleted entries and total bound; legacy history must remain untouched |
| Kindle observation history | Ref/owner binding, baseline/latest-attempt type, URL, exact source coordinates, immutable evidence and undo-ref shape | Touched observations, owner dependencies and total bound |
| Decisions and edition separations | Pair shape, lengths, media compatibility and normalized keys | Affected dependencies if identity/media or relationship fields change; unchanged for contents-only transactions |
| Remaining review/state maps | Enrichment/title aliases, reading/order/reminder/ownership/proposal shapes and dates | Touched maps; their current validators do not all have identical dependency rules |
| Canonical reconstruction | Identity grouping, conflicts, manual barriers, non-addon inclusion, stable canonical IDs and membership | Reuse only if every identity/grouping input is proven unchanged; otherwise recompute connected affected groups or the whole graph |
| Verified contents reviews | Bounded normalized entries, statement/date and review IDs | Untouched in acquisition; validate user changes separately |

Schema checks and normalization are interleaved with metadata/source/history validation. Current diagnostics expose records/history/canonical/other stages; these overlap the rows above and are not independent additive timers. The pure source-calculation cache is bounded, rechecks input and never trusts caller-supplied ranks or derived fields.

## Implemented proof reuse

Only `commitKindleContentsRefresh` requests incoming proof reuse. It always reads the full current database from storage. If snapshot caching is enabled and a validated committed snapshot exists, it compares the entire read value with that snapshot using semantic JSON-data equality, including records, canonical groups, policy, decisions, reviews, histories and observations. Object insertion order does not affect equality; array order and every field/value do. No asynchronous yield occurs between comparison and detached cloning.

On equality, a structured clone of the validated snapshot is a mutable, detached starting database with exactly the freshly read authoritative content. This avoids a second normalization/source/history/canonical computation for an unchanged value. Read queries retain the immutable original. On mismatch or missing/invalidated snapshot, the original full incoming validation/repair runs. Storage notifications still invalidate snapshots; full-value comparison also catches a change whose notification has not arrived. Ordinary reads/mutations and normal/retry saves retain their previous paths. Startup/restore/import/migration and outgoing checkpoint validation remain complete.

Only successful storage settlement publishes a new validated committed view. Refresh requests publication so its next batch can reuse proof even when no Options/companion query has requested a snapshot. An invalid entry, invalid external neighbor/history/review, failed normalization or failed write leaves the durable evidence/cursor unchanged. A worker restart has no proof to reuse. Cold reads and legacy repairs retain the existing fallback. A failed optimization/publication cannot turn an acknowledged storage commit into failure; the next query validates storage normally. This retains existing external-write race behavior: the writer serializes GL mutations, but cannot make an arbitrary independent storage writer participate in its transaction. Comparison is not a new cross-writer lock or a compare-and-swap.

## Deferred incremental outgoing validation

A narrower outgoing proof is feasible, but is a separate architecture change. It should accept a private transaction type, not arbitrary mutable databases. Start from a validated immutable revision; constrain fields that the transaction may change; validate each changed record/source/history/observation; check bounds and global/dependency indexes; prove all untouched subtrees and canonical identity inputs unchanged. New evidence remains untrusted even when delivered by GL's content script. A contents-only transaction may then reuse canonical groups because acquisition source/parser fields are not title, author, identifier, edition, language, run or identity inputs.

The current implementation does not provide a general write-set/dependency proof, and normalizing a record can repair fields beyond a nominal enrichment delta. Do not skip outgoing validation or reuse canonical groups by a loose claim that contents never affect identity. Develop differential tests against the full normalizer for all outcomes, history rotation, limits, manual barriers, external edits, restore/migration, failures and restarts first. Abandon incremental mode on any missing proof/version/dependency change; take the existing full path, rejecting malformed values rather than accepting them to improve latency.

Monolithic storage still rewrites the entire database plus checkpoint. Moving records/source history to separately persisted values would require a new atomic revision/manifest, reader coherence, crash recovery, migration and backup protocol. Defer that format change until refresh stabilization; timing improvements must not trade away atomic cursor/evidence or retained history.
