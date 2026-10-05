# Kindle contents-quality implementation pass

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Completed October 4, 2026 (America/New_York), against the corpus and classifications in [the committed quality audit](kindle-contents-quality-audit.md), baseline commit `092bce4`. This is a focused discovery-quality change. Existing ownership, identity, canonical grouping, ordinary matching, HB/FAN integration, database schema and discovery eligibility remain unchanged.

## Results

The new contextual filter rejects **249 of 330 known false extractions (75.45%)**, with **zero audit-labelled Strong/Likely/Mixed statements rejected**. The remaining false candidates produce no components: 67 are uncertain and 14 fail structural parsing. All seven known semantic false-full results and all 16 structural-full counterexamples are corrected. Of the original 308 useful failures, **73 (23.70%) now produce structured proposals**: 51 full and 22 partial.

These are measurements against the audit's rule-assisted, record-weighted labels, not independently verified Amazon manifests. A full parse means the saved statement was structurally accounted for; it does not establish that the entire product description was captured or that the contents are verified. The user's subsequent **100 Bullets hydration observation** materially changes how terminal `Read More` should be interpreted; see the dedicated section below.

The source backup was read locally, never modified, and no Amazon requests were made. The complete machine-readable measurement is [kindle-contents-quality-pass-results.json](../development/artifacts-and-audits.md#generated-output).

## Source and reproduction

- Input: `galactic-library-backup-v1 (2).json`, the completed export in Downloads; 23,252,734 bytes.
- Export time: `2026-10-05T00:48:15.011Z` (October 4, 8:48:15 pm EDT).
- SHA-256 before and after: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`.
- Database schema: 12; 14,081 provider records, including 3,322 Kindle books and 3,194 eligible product pages.
- Completed lookup corpus: 1,520 nonempty statements, 1,059 no-statement results, 615 unavailable results; zero temporary failures. Those lookup counts do not change.
- Verified contents reviews in this backup: zero. Synthetic tests separately exercise preservation of existing verified reviews.

Run from GalacticLibrary, supplying the same backup:

```powershell
node scripts/measure-contents-quality.mjs '<path-to-backup>'
```

The script obtains labels from the committed audit ledger, checks the source hash, processes all 1,520 statements, and exercises the actual storage writer against an in-memory clone in batches of 100. It asserts unchanged source evidence, lookup dates/generation, ownership, canonical data and reviews, zero requests, 16 database writes and no remaining stale local parses. Its output contains aggregate statistics and audit ordinals, not account IDs or purchase metadata. The regression fixture file contains 201 unique public-description examples, including every known false-full, structural-full, Read-more target and excerpt-risk statement.

## Root causes and implementation

The old discovery parser treated a syntactically separable list as possible component names without first deciding whether it described works. Creator names, topics, locations and plot fragments could therefore become full contents proposals. Its greedy numbered grammar could capture the final number while absorbing earlier ranges or prose into the series name. It also applied a single global excerpt flag to every component when any later clause said “material from.”

The new pipeline is:

```text
all eligible Kindle books
  -> existing bounded product-page candidate extraction
  -> contextual assessment of saved text
  -> bounded discovery-only numbered/named grammar
  -> unverified proposals plus unresolved evidence
  -> explicit user review, if desired
```

[contents-quality.js](../../src/lib/contents-quality.js) adds a small, versioned assessment stage. Numbered units, work terminology, collection claims and bounded named enumerations provide positive evidence. Feature/topic/credit/plot/promotion contexts provide negative evidence. Missing subjects, incomplete fragments, isolated person-like lists and ambiguous inclusion prose remain uncertain. Rules apply to context and syntax; they do not depend on a franchise or specific product title. Words such as `includes`, `contains` and `comprises` remain supported. A collection-looking parent title alone cannot establish containment.

The audit's false families motivating the filter were: instructional/features/other non-work prose (98), plot/warnings (94), recipe/ingredient features (31), catalogue promotion (25), art/maps/design extras (24), contributor lists (21), delivery features (14), front/back/bonus matter (12), awards/marketing (6), and travel/places (5). These describe dominant contexts, not a prohibition on individually identified maps, introductions or stories ever being contained units.

[contents.js](../../src/lib/contents.js) applies the improved grammar only through `proposeContentsForReview`. The ordinary `proposeContents` query/matching grammar and reviewed contents ownership index are unchanged. Unverified names never become ordinary owned titles.

### Cleanup and source preservation

The saved statement is retained. The parser uses a separate normalized copy, exposed by the proposal response and never substituted for source evidence. Storage no longer strips additional terminal punctuation from a supplied statement. Whitespace normalization remains the existing storage convention; this is not archival preservation of original HTML.

Deterministic local normalization handles a repeated leading `Collects`, an orphan quote after a numeric endpoint, and numeric sentence boundaries glued to capitalized narrative, such as `#1-6.The next adventure`. It preserves abbreviations and punctuation inside named titles. New extraction recognizes the demonstrated Ms./Sgt./Gen./Ft. abbreviations and avoids blindly splitting titles at `!` or `?`. These repairs cannot recover words already missing from saved fragments.

Terminal `Read More` is removed **only from a parsing copy with captured explicit numbered-unit evidence**. Every terminal marker also produces `descriptionMayBeIncomplete: true`, regardless of whether that fragment can be parsed. A non-numbered fragment with the marker remains uncertain and retains the marker in its parsing input. There is no blanket removal of the phrase from descriptions, no sleep, no readiness wait, no extra fetch and no concurrency change.

### 100 Bullets: incomplete descriptions are a separate extractor problem

The user observed that Book Four/Five initially display a description ending in `Read More`, then roughly one second later update to include final `Collects 100 BULLETS #59-80` / `#81-100` sentences. This is evidence of potential premature extraction from an incompletely hydrated or expanded description. The update timing and page behavior are user observations, not newly reproduced browser measurements in this task.

The corpus actually saved earlier fragments:

- Book Four (#0003): `including the pivotal story arcs "A Wake" and "Punch Line."` followed by narrative.
- Book Five (#0002): `containing an untraceable gun and 100 rounds of ammunition`.

Those saved fragments **do not retain a Read-more marker**. Its absence therefore cannot prove source completeness; first-sentence extraction may itself omit the marker and later contents. Local filtering can classify a saved fragment but cannot recover a Collects sentence that was never saved. Book Four's useful but incomplete named-story evidence remains unresolved; filtering Book Five's plot fragment does not mean the product lacks collected issues.

Permanent regressions preserve both early fragments with the observed terminal marker, requiring uncertain results, unchanged text and zero fabricated issues. Independently supplied later Collects sentences produce 22 and 20 issue proposals respectively. They are separate test inputs, never replacements inferred from the early text. Numbered marker cases retain the incomplete-description warning even when syntactically full.

The current adapter fetches HTML and parses it without executing Amazon's page scripts. Waiting inside that static document would not reproduce browser hydration. The next extractor task needs to investigate actual source readiness, expansion, DOM updates and whether later text exists in the fetched response; compare captured candidates with the signed-in product page. Preserve bounded source/context evidence and consider multiple candidate clauses. No timing or network workaround is introduced here.

### Extent and continuation correctness

Full issues before an excerpt qualifier retain full extent. `material from`, `excerpts from`, `selections from` and `stories from` qualify the following list and its numeric continuations. A heading that explicitly collects material qualifies its whole list. A semicolon after a partial-material list can be ambiguous; unsupported transitions stay unresolved until a new explicit qualifier or Collects clause establishes scope. The parser never resolves that ambiguity by promoting entries to full.

This pass also found and fixed two related problems while checking the 120-risk corpus:

- An unresolved component must clear the inherited series/run. Otherwise later numbers could be assigned to an earlier work: Doctor Strange material became Marvel Premiere entries; Moon Knight #30 became Ghost Rider #30.
- A qualifier must start a new clause even after an unsupported named work. Captain Britain's Excalibur list previously could inherit numbers belonging to material from Mighty World of Marvel. The Onslaught example had the same problem with Excalibur and Fantastic Four material.

Commas/conjunctions inside a series label are preserved before a numbered anchor. Repeated title stems can establish a new item, maintaining the existing mixed Hellboy regression. Ambiguous merged lists with several commas or multiple dated works are left unresolved. Examples include `Aliens, Earth War`, `Carnage: Black, White & Blood` and `Peter Parker, the Spectacular Spider-Man`. The malformed `Bizarre Adventures 2#5` is deliberately unresolved rather than silently treated as a confidently identified series.

### Bounded parser extensions and audit motivation

The audit families below overlap; their counts are exposures, not promised recoveries.

| Audit family | Count among 521 genuine unresolved statements | Implemented safe subset |
| --- | ---: | --- |
| Multiple numeric segments | 192 | Independent anchored ranges; unsupported prose remains residual |
| Generic units / series after range | 135 | Explicit `issues 1-16 of Harrow County`; generic “original series” stays unresolved |
| Annual/special/one-shot/named work | 116 | Explicit numbered annual/special types, preserving run and series; unnamed one-shots stay residual |
| Named/described components | 114 | Bounded quoted/plain lists, Oxford comma, preserved internal punctuation |
| Bare continuations | 89 | Numeric continuation only with an intact prior anchor |
| Excerpt/story scope | 83 | Clause/list extent, conservative ambiguous transitions |
| Terminal Read-more | 59 | Captured numbered-fragment normalization with source-incomplete flag |
| No-hash numeric patterns | 25 | Explicit series plus numbers; no guessing a generic series |
| Glued numeric/narrative boundaries | 7 | Deterministic numeric sentence split, preserving original text |

Quoted title lists retain internal commas and “and.” Plain named lists have bounded component length/count. `SUPERMAN, INC.` remains a single name. An ampersand splits repeated explicit title stems, without a franchise-specific rule. Creator/praise prose, unsupported numbered syntax and unclear enumeration do not become names just because a few capitalized words exist.

Descending/abbreviated/negative ranges remain unsupported; existing decimal/fraction validation remains. Range expansion is bounded to 500 units and aggregate proposals to 2,000 entries. Unsupported meaningful commentary and components keep the outcome partial or failed.

## Outcome meanings and UI

| Outcome | Meaning |
| --- | --- |
| Full | Saved candidate structurally accounted for, with no known meaningful unsupported remainder |
| Partial | Reliable proposals plus meaningful unresolved information or scope |
| Failed | Plausible containment, but no reliable structured proposals |
| Filtered | Candidate describes non-containment in its saved context; original evidence retained |
| Uncertain | Insufficient context to establish containment safely |

These meanings are separate from page availability, source completeness, verification, identity and ownership. Even full proposals require review. A failed/no-statement/unavailable result never establishes absence or entitlement loss.

The contents editor explains quality, unresolved text and possible incomplete Amazon descriptions. The workbench omits obvious filtered noise from the ordinary proposal queue, while retaining source evidence and undo history. Review conflicts and incomplete-description warnings remain visible. The after queue of 1,272 is 1,520 minus 249 filtered candidates plus one filtered candidate retained because of its incomplete-description flag. This is a queue measurement for this backup, not a universal count formula when existing reviews differ.

## Before/after corpus matrix

| Measurement | Before | After |
| --- | ---: | ---: |
| Eligible books / saved nonempty statements | 3,194 / 1,520 | 3,194 / 1,520 |
| Useful statements, audit A/B/C | 1,167 | 1,167 retained |
| Filtered non-containment | Not represented | 249 |
| Uncertain outcome | Not represented | 98 |
| Full | 655 | 702 |
| Partial | 215 | 194 |
| Failed | 650 | 277 |
| Proposed entries, unverified | 10,332 | 11,431 |
| Contents proposal review queue | 1,520 | 1,272 |
| Terminal-marker source warnings | Not represented | 75 |

Audit classes are fixed throughout; new uncertainty is a processing outcome, not relabelling the baseline.

| Audit class | Total | Before full / partial / failed | After full | Partial | Failed | Filtered | Uncertain |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| A: Strong | 885 | 582 / 144 / 159 | 635 | 124 | 126 | 0 | 0 |
| B: Likely | 88 | 0 / 0 / 88 | 0 | 0 | 81 | 0 | 7 |
| C: Mixed | 194 | 64 / 69 / 61 | 67 | 70 | 52 | 0 | 5 |
| D: False | 330 | 7 / 2 / 321 | 0 | 0 | 14 | 249 | 67 |
| E: Uncertain | 23 | 2 / 0 / 21 | 0 | 0 | 4 | 0 | 19 |
| Total | 1,520 | 655 / 215 / 650 | 702 | 194 | 277 | 249 | 98 |

### Trigger-family results

| Family | All statements | Useful A/B/C | Known false | False filtered | False uncertain | False failed | Useful incorrectly filtered | All full / partial / failed / filtered / uncertain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| collect* | 1,112 | 1,095 | 11 | 10 | 1 | 0 | 0 | 697 / 193 / 208 / 10 / 4 |
| contain* | 71 | 7 | 62 | 57 | 3 | 2 | 0 | 2 / 0 / 7 / 57 / 5 |
| include* | 335 | 65 | 255 | 180 | 63 | 12 | 0 | 3 / 1 / 62 / 180 / 89 |
| comprise* | 2 | 0 | 2 | 2 | 0 | 0 | 0 | 0 / 0 / 0 / 2 / 0 |

No false or uncertain audit-class record emits entries. All 896 structured records belong to A/C. This is record-level agreement with the audit labels, not proof that every emitted component or collection manifest is correct.

Filter rejection precision is 249/249 (100%) on the audit labels, and known-noise rejection recall is 249/330 (75.45%). Useful retention is 1,167/1,167 (100%). Explicit containment classification recall is 1,155/1,167 (98.97%); 12 useful records remain uncertain rather than discarded. Excluding the 23 ambiguous E labels, containment-classification precision is 1,155/(1,155+14), or 98.80%. These are corpus estimates, not expected accuracy on arbitrary future descriptions.

The 308 original useful failures now divide into 51 full, 22 partial, 224 failed and 11 uncertain. Preserving 235 unresolved useful candidates is intentional: a count-only omnibus claim, unlabelled range or incomplete story list cannot be safely completed from a parent title.

### Known incorrect-full regressions

The seven false-full audit IDs are #0275, #0327, #0333, #0452, #0476, #0762 and #1317. They now produce zero entries: three filtered and four uncertain. **Zero known semantic false-fulls remain.**

| Structural audit IDs | Result |
| --- | --- |
| #0299 / #0300 | Correct 10-entry lists each, preserving their actual series |
| #0621 | Seven Hawkeye (2012) issues: 17, 12, 13, 15, 19, 21, 22 |
| #1169 / #0230 | Correct six/seven units, including explicit annual |
| #0489 / #1360 | Six/four named components, preserving title punctuation and separators |
| #0155 / #0444 / #0445 / #0801 / #1280 / #1303 | Six/eight/ten/24/six/25 entries, with correct explicit excerpt extent |
| #1164 | Eight Supergirl: Woman of Tomorrow units |
| #0973 | Failed, zero entries: generic issues plus script cannot be greedily reduced to one issue |
| #1438 | Uncertain, zero entries: credits plus preview do not establish a supported manifest |

All 16 are permanent fixtures with expected results; **zero known structurally incorrect full results remain in this set**. This does not certify every new full result against a live page.

### Read-more and the 120 excerpt-risk cases

Of the original 28 syntactic Read-more targets, **27 now parse full and one remains partial**. #1208 has an independently unsupported prose label, `Plus these inspirational issues ...`; the old full result depended on accepting prose as a series. Keeping that remainder is the correct exception. Every marker remains source evidence and carries the incomplete-description flag; no count here proves complete hydration.

All 120 excerpt-risk statements are retained as fixtures and reprocessed. **66 are structurally accounted for, 53 are partial and one is failed**, with 1,999 full-unit proposals and 469 excerpt proposals. Originally the old global flag labelled all 2,225 proposed units excerpt. Explicit full ranges now survive later material qualifiers; forward qualified lists retain excerpt scope. The remaining 54 statements are not advertised as complete: unsupported named material, ambiguous semicolon scope or malformed text is preserved unresolved. Tests check all 120 for valid proposal shape and retained uncertainty, with explicit expected extent/namespace assertions for the demonstrated pattern families, including the additional continuation/comma bugs above. This establishes supported saved-text scope behavior, not full-manifest correctness for all 120 products.

## Versioning, persistence and user workflow

Extractor and parser generation advance to 3; contextual filter generation is 1. Optional quality/reason/incomplete-description/filter-version metadata and filtered/uncertain outcome values are validated without migrating database schema 12. Old backups remain readable by this version. Older binaries may not accept the newly added outcome values; use an updated GL build when restoring a new export.

Saved statements are locally re-filtered/reparsed when stale. Existing generation-2 no-statement/unavailable results are not automatically refetched just because generation 3 exists. Legacy pre-generation-2 empty behavior, normal scan/retry/rescan and explicit rescan remain supported. Generation reflects extraction repairs, not a claim that an old saved statement was refetched.

Local reprocessing preserves original statement, source URL, original extraction generation/check date, lookup evidence and refresh/undo history. Reviewed contents, canonical grouping and ownership remain intact. New derived quality is recorded through the existing enrichment-history path; it does not silently replace a user's review or verification.

After reloading GL, open the Kindle importer and choose **Reparse saved text (no requests)** under Contents discovery, then **Find contents**. Existing stale statements are processed locally in batches. No repeat of the 3,194-page scan is needed for these parsing/filtering improvements. Recovering later omitted Collects text will need a separately investigated extractor and selected page refresh; local reparse cannot recover missing source text.

## Tests and performance

Final validation:

- `npm test`: **304 passed**, including eight aggregate quality tests over 201 corpus fixtures plus adversarial/synthetic cases.
- `npm run test:browser:release`: **49 packaged Chrome-target checks passed**.
- `npm run test:browser:firefox`: **49 packaged Firefox-target checks passed**.
- HB's existing matcher, central coverage, matching policy, revision, collection identity, audiobook companion and advanced parity tests: **210 passed**.
- FAN's existing matcher, central coverage, matching policy, revision, edition and advanced parity tests: **209 passed**.

The packaged fixtures exercise actual packaged code/UI, including incomplete-description warnings and review-only proposals. They do not reproduce Amazon's live hydration. The companion tests exercise unchanged ordinary matching and central coverage. No HB or FAN source was modified.

Quality fixtures cover every specified known-error set, named/non-comic positives, contributor/topic/feature negatives, unsafe ranges, quoted punctuation, incomplete hydration observations, mixed/multiple excerpt scopes, broad eligibility, zero-request batched reparse, unchanged external API ownership responses, verified reviews and backup/history preservation. Existing test coverage additionally exercises writer atomicity, stale references, undo and prior performance safeguards.

Offline measurement, Node 20 on this machine:

| Stage | Measured time |
| --- | ---: |
| Filter and parse all 1,520 saved statements | 138.70 ms |
| Filter and parse per statement | 0.091 ms |
| Actual writer local reprocess, including validation/clones/history | 16.79 seconds |
| Whole-database writes | 16: fifteen batches of 100, one of 20 |
| Amazon requests | 0 |

This uses structured-clone in-memory persistence. It is not browser disk/network timing and should not be read as an installed-extension latency guarantee. Filtering/parsing is cheap relative to existing whole-database validation/copy/history work. There are no new per-record whole-database writes. Network scan checkpoints, request pacing, pauses, concurrency and performance instrumentation are unchanged.

## Remaining limits and next work

1. **Investigate incomplete descriptions first.** Preserve the 100 Bullets early/later examples, distinguish dynamic hydration from static fetched HTML and expansion, and gather bounded candidate/context evidence before choosing readiness or selection rules. Do not assume a terminal marker is garbage, or that absence of the marker establishes completeness. Prefer explicit later contents clauses when actually captured; do not fabricate them or introduce arbitrary sleeps.
2. Improve bounded multi-candidate/list-block extraction so an early plot/credit/include phrase cannot hide a later Collects clause. Saved text alone cannot measure how many omitted candidates exist. A targeted refresh of known problem pages should precede any larger rescan.
3. Address safely separable named works mixed with numeric units, flattened DOM lists, count-only claims, long named components and creator/commentary separation. Wool's “five books” does not provide five identities; neither a parent title nor a franchise can fill them in automatically.
4. Design unusual issue numbering and richer contained-work relations separately. Negative numbers, abbreviated ranges, unnumbered specials, dates, ordinal words and unsupported chapter identities need deliberate representation and review rules.
5. If further false extraction reduction is needed, assess the remaining 81 known false fragments alongside the 12 useful uncertain records. Do not obtain better-looking precision by discarding ambiguous useful candidates or narrowing eligibility.

This pass improves saved-evidence quality and proposals. It neither verifies a manifest nor changes ownership evidence, and it intentionally leaves unsupported cases visible for review.
