# Bundle match context in the companion extensions

GL matches individual offers. MATCH_ITEMS is bounded to 500 queries and 20,000 contents units and does not identify a complete bundle. HB/FAN normally omit locally owned offers from ownership lookups, reuse cached results and add component/series queries. For a complete catalogue, they now probe exact locally owned top-level offers separately as identity context. Those responses never replace local Owned results. A message batch cannot safely stand in for the complete storefront catalogue.

The development-only [shared reconciler](../../shared/bundle-match-context.js) is embedded byte-for-byte into HB ownership.js and FAN src/shared.js. GL does not ship or execute it. It produces primary/deferred candidate IDs from explicit facts after individual matching finishes. It does not modify matches, classify ownership, consume records exclusively, score titles, persist anything, or change the companion protocol.

A weak automatic related-title suggestion is deferred only when the same opaque provider/itemRef or exact active local record object has a strong direct identity match to another distinct product of the same media in the complete resolved bundle. Direct GL same-edition identity is independent of ownership; subscription/borrowed/rental/unknown access never becomes ownership. Local strength is restricted to the existing exact classification paths. Opaque references are provider-record references, not canonical-group or account identifiers. Different references are never merged by titles.

HB requires an unambiguous equality between the embedded tier catalogue and every resolved DOM product. FAN requires an intact full public catalogue with no dropped products or incomplete/pagination flags. Any failed, unfinished or incomplete lookup disables contextual deferral. No additional page or provider requests are made. Extra identity-context items use the existing GL batched/cached API; failed probes disable deferral. Direct same-edition results anchor only their own opaque provider records.

Reviewed/manual relationships, shared authoritative identifiers, same-edition evidence, explicit editions and identity conflicts, numbered scope, contents/coverage, components, formats and history remain primary. Duplicate normalized titles/source products are not competitors. Neither a protected contents offer nor a protected format offer is an exclusive anchor. Unknown candidate bases are retained. These conservative guards intentionally leave ambiguous overlap alone.

HB/FAN keep candidate priority in WeakMaps associated with the current result objects. Default explanations, captions and tooltips omit the deferred candidates; Match details retains their cards, original evidence and the competing offer title. A Possible with only deferred suggestions remains Possible with a review note. Counts, tier plans, cost per new item, exports, saved decisions remain authoritative. GL additionally discovers cautious numbered-series suggestions as described below.

## Development and verification

With sibling HB and Fanatical checkouts, run node scripts/sync-companion-bundle-context.mjs to update the embedded engine, or --check to detect drift without writing. Run [check-companion-bundle-context.mjs](../../scripts/check-companion-bundle-context.mjs) for byte parity and exact candidate/status/explanation parity through both shipped classification paths. Individual repository unit suites require no sibling checkout or private data. GL's normal unit runner includes the pure engine tests.

Each companion provides tests/bundle-context-acceptance.mjs PRE_CHANGE_COMMIT for unchanged authoritative JSON, summary/tier checks and a synthetic 1,000-product timing control. tests/bundle-context-browser.mjs tests actual storefront initialization and badge clicks in a disposable Chrome profile; add --firefox for Firefox, or --baseline=COMMIT to compare pre-change candidate cards and summary pricing. Generated JSON/screenshots stay under ignored audit-artifacts/bundle-match-context.

## Conservative limits

No hidden canonical/account equivalence is inferred. An HB page missing a complete embedded tier list keeps independent-match behavior. Missing metadata, unrecognized reasons or edition/coverage ambiguity can leave weak candidates primary. This bounded feature prioritizes supported competing suggestions; it does not prove the other suggestion false.

## Numbered-series discovery and presentation

An unnumbered book query can discover a numbered library item when its title-derived series stem equals the complete queried title under existing presentation normalization. Known author/run/unit/unit-type conflicts and manual barriers still apply. GL returns a Possible suggestion with unconfirmed membership/completeness; it does not create a canonical relationship or contents manifest and never promotes owned/coverage through this path. The public response schema is unchanged.

Shared deterministic presentation ordering is: direct identity, contains/contents evidence, reviewed work/alias evidence, a numbered item of the complete offered series, other related evidence, then a generic unnumbered candidate for a specifically numbered offer. Existing direct/contents/manual guards remain primary. Strict trailing English/decimal/Roman book labels are display scope only. Number conflicts do not become exact identity, missing numbering does not imply Book One, and existing ISBN/language/edition warnings are retained.

Rite of Spring constituent issues remain subscription suggestions unless authoritative reviewed contents and permanent access establish coverage. Unknown collection extent never becomes inferred two-issue completeness. Generic 30 Days of Night remains an unresolved candidate for each deluxe book, accompanied by a specific missing-book/unknown-overlap warning.

## Cross-provider synthetic investigation tools

Generate a detached pre-change GL checkout, then run scripts/trace-cross-provider-collections.mjs baseline --gl-baseline=PATH. Baseline companion references are HB 64a661d and FAN 4ffc0ca; GL da773df. Run the script with after for the current production pipeline. scripts/check-cross-provider-collections.mjs compares classifications, counts and HB tiers across ten scenarios and exercises 1,000 offers in two API batches. It requires the generated synthetic baseline, never personal inventory or provider access.

scripts/cross-provider-browser.mjs uses the actual GL external API as a local synthetic backend and the shipped companion storefront adapters/styles, in disposable Chrome. Add --fanatical, --firefox or --case=deluxe-unknown. For baseline captures pass --baseline=COMPANION_COMMIT --gl-baseline=PATH. Current captures compare identical badges/counts/prices while allowing intentionally changed diagnostic request/candidate counts. Generated JSON, Markdown and screenshots live under ignored audit-artifacts/cross-provider-collections.
