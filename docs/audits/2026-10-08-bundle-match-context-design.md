# Bundle match disambiguation: architecture and design

Recorded before implementation. GL's external-api/matcher consumes independent requests (1–500 products, at most 20,000 contents units); neither message nor result identifies a complete bundle/session. HB queryGalacticLibrary and FAN galacticBatches split at those limits, deduplicate cached requests, omit locally owned products, and add series-gap/component queries. Reconciliation inside GL would depend on batch boundaries and would confuse synthetic range queries with offered products.

HB collects current DOM products and merges local/external/contents evidence independently. FAN loads a public bundle catalogue, resolves its top-level products plus recursively queried components. Both count final offered-item states, not candidates, and calculate tier/new-item value from those states. Strong local identity comes from existing exact match paths; GL exact arrays carry same-edition relationships independently of access (owned, subscription, borrowed, rental, unknown). Possible arrays carry same-work/related-title reasons, manual reviewed relationships and identifier/edition caveats. Coverage has separate contains, covered/possibleCovered/missing entries. Canonical reconstruction and saved Same work/Same edition/Different works decisions are inside GL. Public itemRef identifies a provider record, not a canonical group; no canonical/profile identifier is exposed. No cross-record title-based identity merge is safe.

## Chosen boundary

Use one shared deterministic pure reconciliation implementation, maintained in GL shared/bundle-match-context.js and byte-identically embedded in HB/FAN next to their existing shared policy/presentation code. A synchronization tool and parity tests prevent independent business-rule copies. GL runtime, API and matching engine remain unchanged. Per-storefront adapters supply existing identity strength, original record references and overlap safeguards after all individual results settle.

This is contextual candidate-priority reconciliation, not a text replacement or a reclassification. Original evidence/result objects remain untouched. A transient WeakMap associates a separate priority projection with each result for its current bundle render; it is never persisted or shared across bundles. Default cards/captions/tooltips use primary candidates. Deprioritized candidates remain under Match details, named with More closely matches another item in this bundle and the competing title. Classification, access, manual decisions, counts, tier value and price per new item remain unchanged. A Possible with only a deprioritized candidate remains Possible with a short review explanation, never New.

## Completion and conservative conditions

- HB requires a complete already-hydrated tier_display_data enumeration, valid tier_item_data for every listed product, and an exact unambiguous match to all currently resolved DOM products. No fallback fetch; missing/unhydrated/partially rendered metadata leaves independent behavior unchanged.
- FAN requires a validated complete top-level public catalogue, without malformed/dropped products or pagination/incomplete markers, and all top-level products resolved. Components/range queries are not additional offered products.
- Any pending/failed item lookup disables cross-item reconciliation for that render.
- One candidate can be deprioritized only if the very same provider/itemRef (or same local record object within the current account snapshot) has an established strong direct identity match to a different offered product of the same media. No inference between different provider/account records or opaque references.
- Only positively identified automatic related-title candidates are eligible. Ownership is not evidence of identity strength. Same-edition candidates, manual reviewed relationships, shared authoritative identifiers, edition/version/numbered-scope differences, formats, software components, contents evidence and historical/unknown candidate bases are protected.
- Duplicate/same normalized offered works, multi-format presentations and separately established matches remain intact. Strong records are not consumed or assigned exclusively. Ordering/batching cannot influence the complete-context result; incomplete context does nothing.

## Invariants and planned tests

Frozen original matches and inputs must serialize identically before/after reconciliation. Repeat/reorder/rebatch produces equivalent candidate priorities, including the Beneath the Trees original + Rite of Spring subscription example, lone Rite, no strong competitor, duplicate/PDF/EPUB, standard/deluxe, omnibus/issues, suite/components, multiple account access, manual relationships and incomplete context. Compare real shipped matcher results and summary/tier values before/after. Verify both browsers and actual synthetic storefront rendering. Benchmark representative large bundles offline; no real profiles/libraries/provider network requests.

## Known conservative limits

Provider record references cannot establish hidden canonical equivalence across records/accounts; such candidates remain unchanged. Explicit edition/format/coverage/manual evidence is preserved even if weak; this first bounded change addresses automatic related-title competition. HB pages without a complete embedded tier enumeration receive no contextual deprioritization. No protocol or persistence change is needed.
