# Bundle match context in the companion extensions

GL matches individual offers. MATCH_ITEMS is bounded to 500 queries and 20,000 contents units and does not identify a complete bundle. HB/FAN omit locally owned offers, reuse cached results and add component/series queries. A message batch cannot safely stand in for the complete storefront catalogue.

The development-only [shared reconciler](../../shared/bundle-match-context.js) is embedded byte-for-byte into HB ownership.js and FAN src/shared.js. GL does not ship or execute it. It produces primary/deferred candidate IDs from explicit facts after individual matching finishes. It does not modify matches, classify ownership, consume records exclusively, score titles, persist anything, or change the companion protocol.

A weak automatic related-title suggestion is deferred only when the same opaque provider/itemRef or exact active local record object has a strong direct identity match to another distinct product of the same media in the complete resolved bundle. Direct GL same-edition identity is independent of ownership; subscription/borrowed/rental/unknown access never becomes ownership. Local strength is restricted to the existing exact classification paths. Opaque references are provider-record references, not canonical-group or account identifiers. Different references are never merged by titles.

HB requires an unambiguous equality between the embedded tier catalogue and every resolved DOM product. FAN requires an intact full public catalogue with no dropped products or incomplete/pagination flags. Any failed, unfinished or incomplete lookup disables contextual deferral. No additional page or provider requests are made.

Reviewed/manual relationships, shared authoritative identifiers, same-edition evidence, explicit editions and identity conflicts, numbered scope, contents/coverage, components, formats and history remain primary. Duplicate normalized titles/source products are not competitors. Neither a protected contents offer nor a protected format offer is an exclusive anchor. Unknown candidate bases are retained. These conservative guards intentionally leave ambiguous overlap alone.

HB/FAN keep candidate priority in WeakMaps associated with the current result objects. Default explanations, captions and tooltips omit the deferred candidates; Match details retains their cards, original evidence and the competing offer title. A Possible with only deferred suggestions remains Possible with a review note. Counts, tier plans, cost per new item, exports, saved decisions and GL matching stay authoritative and unchanged.

## Development and verification

With sibling HB and Fanatical checkouts, run node scripts/sync-companion-bundle-context.mjs to update the embedded engine, or --check to detect drift without writing. Run [check-companion-bundle-context.mjs](../../scripts/check-companion-bundle-context.mjs) for byte parity and exact candidate/status/explanation parity through both shipped classification paths. Individual repository unit suites require no sibling checkout or private data. GL's normal unit runner includes the pure engine tests.

Each companion provides tests/bundle-context-acceptance.mjs PRE_CHANGE_COMMIT for unchanged authoritative JSON, summary/tier checks and a synthetic 1,000-product timing control. tests/bundle-context-browser.mjs tests actual storefront initialization and badge clicks in a disposable Chrome profile; add --firefox for Firefox, or --baseline=COMMIT to compare pre-change candidate cards and summary pricing. Generated JSON/screenshots stay under ignored audit-artifacts/bundle-match-context.

## Conservative limits

No hidden canonical/account equivalence is inferred. An HB page missing a complete embedded tier list keeps independent-match behavior. Missing metadata, unrecognized reasons or edition/coverage ambiguity can leave weak candidates primary. This bounded feature prioritizes supported competing suggestions; it does not prove the other suggestion false.
