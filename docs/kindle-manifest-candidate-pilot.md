# Kindle manifest candidate discovery and exact 77-page pilot

Completed 2026-10-04/05 (America/New_York / UTC). Implementation, regression tests, one bounded network pilot, offline analysis, and commits are complete. No broader refresh was launched. The user's source export and installed extension database were not modified.

## Result

The extractor now examines bounded static description blocks, discovers semantic and structural manifest regions, assesses them with the existing contents-quality and review parser, selects a primary region, and preserves useful secondary evidence for review. It no longer commits to the first containment-looking phrase.

The exact pilot made **77 requests for 77 distinct pages; all succeeded**. Final offline assessment of those captured descriptions produced:

| Outcome | Saved evidence before refresh | Initial pilot implementation | Final implementation |
| --- | ---: | ---: | ---: |
| Full | 35 | 44 | 43 |
| Partial | 12 | 8 | 9 |
| Failed | 9 | 5 | 5 |
| Filtered | 2 | 1 | 1 |
| Uncertain | 19 | 19 | 19 |
| Total | 77 | 77 | 77 |
| Proposed units | 348 | 426 | 427 |
| Unresolved fragments | 55 | — | 42 |

Full means structurally parsed **unverified proposals**, not confirmed composition or ownership. There were 15 materially changed records and five previously empty proposal sets gained units. No before-Full record became Partial/Failed/Filtered/Uncertain. One malformed pre-existing Ex Machina unit label was replaced with its correct special label; no valid prior unit was lost.

The initial pilot and final assessment are distinguished deliberately. Pilot review exposed a mixed named-supplement label and incidental plot-reference candidates. These were corrected and all 77 captured descriptions were reassessed offline, with **zero additional network requests**. The final implementation also preserves explicit other-series labels and excerpt scope. Raw pilot results retain the original run rather than being overwritten with replay results.

## Root cause and architecture

The previous static-description reconnaissance established that the later 100 Bullets Collects sentences were already present in the first description selector's fetched HTML. Historical extraction reproduced the saved early fragments. Hydration and Read More clicking were unnecessary for those observed misses.

The old first-trigger extractor remains available as a compatibility helper, but its fragment is only a bounded acquisition preview in the current pipeline. The production adapter returns bounded description blocks. The storage worker runs candidate discovery and selection using the actual item title, then saves the selected source clause, contextual parser input, diagnostics, and existing parse state. This avoids adding page-side module imports, web-accessible resources, extension permissions, or new network messages.

The pipeline is:

1. Existing static `fetch` and `DOMParser` acquisition.
2. Deduplicated description blocks from the existing five selectors.
3. Sentence/clause windows with nearby source context.
4. Bounded candidate assessment with `assessContentsQuality` and `proposeContentsForReview`.
5. Primary selection and retained secondary evidence.
6. Existing unverified review workflow; verification remains explicit.

No general contents model, database schema, ownership rule, identity rule, ordinary title matcher, provider eligibility rule, HB behavior, or FAN behavior was changed.

## Boundaries, discovery, and context

Source limits are eight blocks, 12,000 characters per block, and 24,000 characters total. Static adapter reads are capped before normalization. The pilot's largest source block was only 2,039 characters; no pilot description hit a source limit.

Candidate windows are at most 2,000 characters, with up to 600 characters before the candidate and bounded following context. Source block indexes and candidate/context offsets are retained. Sentence boundaries avoid common abbreviations and initials; adjacent semantic clauses can be separated without discarding earlier same-sentence identity context.

Discovery accepts the existing containment families plus reprint/comprising language. It also discovers explicit numbered issues/books/volumes, finite numbered clauses, and explicit `Contents:` enumerations without requiring a containment verb. An incidental number embedded in a synopsis or bestseller claim is insufficient by itself. Supported units and context are needed; there is no special rule for the word “uncover” or for any franchise/publisher.

All bounded blocks are scanned before applying the assessment budget. At most 32 windows are assessed. Under overload, numbered syntax and explicit named enumerations receive capacity before ordinary semantic prose; source order resolves capacity ties. This prevents dozens of early prose clauses exhausting the budget before a later numbered manifest is examined. It is discovery capacity allocation, not a second semantic quality scorer. Combined raw-candidate/parser-input evidence is capped at 16,000 characters. Limits are deterministic and covered by pathological-input tests.

Elliptical issue claims may receive a series anchor from an explicit nearby description/title relationship or an explicit product series + numbered volume/book title. The binding basis is recorded. Fables Vol. 5 and Vol. 9 demonstrate the latter: the supplied description excerpt does not itself spell out Fables, so the product's explicit series/volume title provides review context. This is never an identity or ownership decision.

An explicit `issues #1-3 of OTHER SERIES` stays attached to OTHER SERIES. Unknown trailing prose remains unresolved. Explicit excerpt language keeps excerpt scope. Purely manual edited statements cannot reuse a captured clause's contextual normalization.

The raw source blocks and selected raw clause remain separate from normalized parser input. Normalization can supply a documented context anchor, normalize numeric dash punctuation, separate an explicitly introduced named supplement, and remove non-constituent attribution from the parsing copy. Source text is preserved for audit. Previous selected evidence remains in the existing enrichment history.

## Assessment, ranking, position, and multiple candidates

Existing contextual quality is the first gate, including negative credit/plot/feature/promotion context. The parser then supplies structure, entries, and unresolved fragments. Selection uses a lexicographic tuple:

1. Existing quality: containment, uncertain, filtered.
2. Parsed numbered units, parsed named components, or no parsed units.
3. Bounded proposed-unit count (capped at 500 for ranking).
4. Full structural parse over a partial parse with otherwise equal evidence.
5. Fewer unresolved fragments.
6. Earlier normalized source position only as a final deterministic tie break.

There is **no fixed Collects > Contains > Includes priority**, no late-sentence bonus, and no last-candidate-wins rule. Early strong evidence beats later weak prose in a permanent test. Contextual quality remains independent of ownership and identity.

This pass does not automatically join separate sentences into a verified manifest. It chooses a primary and keeps non-filtered secondary evidence that adds distinct proposed units or remains unresolved. Overlapping proposed units do not create duplicate suggestions. All candidates remain auditable in the optional metadata; a collapsed review panel exposes selected/additional evidence and contextual parser input.

The final pilot found no pair of independently useful complementary parsed manifests. Synthetic permanent tests cover complementary clauses and overlapping ranges. Book Four retains its earlier story-arc clause for review without allowing it to displace issues 59–80. Book Two's script and Book Three's sketches remain separately auditable; they do not distort their primary issue ranges.

## Versioning and refresh semantics

- Kindle extractor: **3 → 4**.
- Contents parser: **3 unchanged**; `contents.js` was not changed.
- Contents filter: **1 unchanged**; existing contextual assessment is reused.
- Database schema: **12 unchanged**; `manifest` is optional bounded enrichment metadata.

A generation change does not establish a refreshed source. Old generation-3 fragments that omitted later sentences cannot recover those sentences through local reparse. Existing source refresh, local reparse, fetch availability, parsing, and review remain separate. Normal scan does not automatically refetch every historical result because generation 4 exists. Failed refreshes preserve the previous statement and manifest; verified reviews remain unchanged.

Read More remains an incomplete-source risk flag. Removing it from an already captured numbered parsing copy does not establish completeness. Absence also does not establish completeness. There was no clicking, rendering of live product descriptions, hydration observation, or product-page readiness delay in this pass.

## Exact pilot population and acquisition

Source: `tests/fixtures/mock-backup.json`.

- Export timestamp: `2026-10-05T00:48:15.011Z`.
- Source SHA-256: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`.
- Eligible supported Kindle books: 3,194.
- Pilot definition recovered from the prior reconnaissance: **75 nonempty saved statements ending in terminal Read more, union 100 Bullets Books Four/Five, deduplicated by product URL = 77**.
- Sorted URL population SHA-256: `d926c5ee2671ede27fa4cf2931da35cb34c21312855c0a555eba5d2dbdec2abd`.

No alternative population was substituted. No full Kindle rescan was run. Controls were fetched once as members of this union, not as extra preliminary requests.

The harness used an anonymous disposable Chrome context solely to execute the production static-fetch adapter and `DOMParser`. A synthetic same-origin document was fulfilled locally; no real product page was navigated, rendered, observed, or clicked. No signed-in user profile or installed extension storage was opened. The exact production retry helper was compiled for the driver; requests retained `credentials: include`, `cache: no-store`, a 30-second timeout, three transient attempts, 2/4-second retry waits, sequential execution, and the existing one-second inter-page delay. Only the 77 allowlisted product URLs could be fetched. A local clone used the real storage writer and checkpoint buffer; checkpoints contained 20, 20, 20, and 17 results. Interruption aborts the active request and preserves completed buffered work. The pilot was not interrupted.

This verifies anonymous static responses for the exact population, **not signed-in response equivalence**. Source variants remain a limitation. Existing browser fixture checks cover actual scan controls, Pause, checkpoint failures, retries, and resume separately.

| Network/lifecycle metric | Result |
| --- | ---: |
| Distinct pages attempted / requested population | 77 / 77 |
| Actual product requests | 77 |
| Successful fetches | 77 |
| Unavailable | 0 |
| Transient failed attempts / retries | 0 / 0 |
| CAPTCHA / sign-in stops | 0 / 0 |
| Elapsed time | 238.86 seconds |
| Checkpoints / durable pages in local clone | 4 / 77 |
| Extra requests for final offline assessment | 0 |

## Candidate and position findings

Final discovery: zero-candidate descriptions **0**; one candidate **65**; multiple candidates **12**. Distribution: 65 × 1, 9 × 2, 3 × 3 = **92 candidates**.

- Winner first: **70**, including 65 single-candidate descriptions.
- Winner middle: **1**.
- Winner last, with multiple candidates: **6**.
- A later candidate beats the first discovered candidate: **7**.
- Among quality-qualified candidates, first wins 73, last wins 3; one description has only filtered evidence.
- Five later selections replace identifiable previously saved early evidence; three recover numbered units from previously empty early evidence: Books Four/Five and Detective Comics: Emperor Penguin. The other two change unresolved technical prose rather than recovering works.
- Structural-only winning candidates in this live pilot: **0**. That is a population finding, not an absence of support: structural-only TMNT and non-comic Contents fixtures pass.
- Independently useful complementary parsed candidates in the final pilot: **0**. Secondary unresolved evidence is retained separately.

Mean winning position is **0.812** of the description. Records with numbered proposals: 52, mean position **0.878**, first 47 / last 5. Records without proposals: 25, mean **0.674**, first 23 / middle 1 / last 1. These are analysis groups based on proposal structure, not new eligibility or comic-classification rules.

This supports the observation that useful manifests often occur late in these descriptions. It does **not** support giving late candidates a large ranking weight: most pages have only one manifest-like candidate, and this population was deliberately selected for historical extraction risk. The final algorithm keeps position as a weak early tie break.

## Permanent real-world regression results

| Fixture | Final proposed primary contents | Additional evidence / limitation |
| --- | --- | --- |
| 100 Bullets Book One | #1–19, 19 issues | Plot objects/murder cannot preempt the range |
| Book Two | #20–36, 17 issues | Earlier same-sentence 100 BULLETS anchor; script retained separately |
| Book Three | #37–58, 22 issues | Earlier same-sentence anchor; sketches retained separately |
| Book Four | #59–80, 22 issues | Live pilot; earlier story arcs remain secondary review evidence |
| Book Five | #81–100, 20 issues | Live pilot; gun/ammunition phrase rejected as primary |
| Fables Vol. 5 | #22 and #28–33, 7 issues | Narrative birth clause does not preempt discontinuous manifest |
| Fables Vol. 9 | #52–59, 8 issues | Explicit product-series/volume context; attribution remains source evidence |
| TMNT IDW Collection Vol. 14 | #101–112, 12 issues; Partial | 2020 Annual and Jennika three-issue mini-series remain unresolved review evidence |
| TMNT Urban Legends Vol. 2 | #14–26, 13 issues | Explicit neighboring Urban Legends anchor; no invented run identifier |
| TMNT Ultimate B&W Collection Vol. 2 | #8–11, 4 issues; Partial | Michaelangelo, Leonardo, Donatello one-shots remain unresolved; no containment verb needed |

The five 100 Bullets ranges cover #1–100 **exactly once**, with no gaps or overlaps. There are no production franchise/range special cases. Book One/Two/Three and the Fables/TMNT cases were deterministic fixtures, not extra pilot requests. Book Four/Five use prior observed complete static descriptions plus their pilot responses. Fables Vol. 9 uses the supplied ending excerpt. Urban Legends uses the supplied final clause with a clearly labeled synthetic neighboring anchor: the full actual product description was not supplied or fetched in this 77-page population, so this does not establish its real Volume 3/run representation.

The current parser/model cannot safely assign a numeric issue to the year-named annual, infer a run and complete Jennika issue identifiers from this sentence alone, or automatically integrate these named one-shots into mixed numbered manifests. They remain visible rather than being discarded or fabricated.

## Improvements, regressions, and remaining limitations

Representative improvements beyond the controls:

- Detective Comics: Emperor Penguin: zero proposals → six, later explicit manifest recovered.
- Catwoman Vol. 2: zero → six through explicit product/series context.
- Ex Machina Book Two: zero → nine through contextual interpretation.
- Animal Man Vol. 2: one → seven, preserving the explicitly named annual.
- Ex Machina Book Three: one malformed special → nine regular issues plus correctly labeled Special #3, with Inside the Machine unresolved.
- Trinity Vol. 3: five → six, retaining Annual #1.

There are **no observed new ownership/matching regressions**, no valid previous units lost, and no verified reviews altered. No proposal became an ordinary owned-library title. The initial pilot's Ex Machina false-Full label and Joker incidental plot candidate were caught, fixed, and permanently tested. The malformed Ex Machina label appears in the automated lost-key list deliberately: its disappearance is a correction, not lost contents.

Remaining limitations requiring attention:

1. **A pre-existing ambiguous comma-label parse remains** in Hellboy and the B.P.R.D.: 1954. The parser can group “The Unreasoning Beast, Ghost Moon” into a numeric series label and call the result Full, even though the unnumbered story warrants review. This occurs before and after this pass, is not an ownership change, and should be addressed in a focused parser/supplement pass before broad complex-manifest refresh.
2. **Bare unlabeled numbers** such as Earth 2's “Collects #1-6” and Swamp Thing's “Collects #0, 8-11…” remain unresolved where this pass lacks sufficiently explicit unit/series binding.
3. **Run/volume syntax and mixed prose** remain unresolved in Knightfall and several Silver Age collections. HTML text nodes can also concatenate credits and contents; no destructive broad cleanup was added.
4. **Non-comic named prose collections** remain eligible. Dragon Blood's three novel names are captured but not reliably separated in the static text; no invented delimiters or constituent identities were introduced.
5. **Read More technical prose** remains Uncertain where there is no explicit captured numbered claim. The 19 uncertain records were not forced into title suggestions.
6. **Source adequacy is unknown outside observed responses.** Anonymous/signed-in variants, missing static descriptions, changed pages, and genuinely omitted content still need separate investigation. No absent marker or generation number establishes completeness.
7. **Candidate/source caps are intentionally finite.** Extremely large/ambiguous descriptions can exceed the retained evidence budget; the full unbounded page is not a promise of this extractor.

## Timing and verification

Median complete page attempt: **2,004.5 ms**, p95 **2,347.2 ms**, maximum **2,983.4 ms**. Median header fetch: **312.9 ms**; response body: **1,661.4 ms**; DOM parse: **14.3 ms**; page checks: **0.4 ms**; adapter extraction: **0.1 ms**. Median local checkpoint: **1,408.7 ms**, total checkpoint time **5,446.7 ms**. The final 77-record offline replay took approximately **178 ms** in the measurement run. Network/body transfer dominated; concurrency/pacing was not changed.

Passed checks:

| Suite | Pass count |
| --- | ---: |
| Galactic Library complete suite | 326 |
| Packaged Chrome review/options UI | 49 |
| Packaged Chrome importer lifecycle | 29 |
| Packaged Firefox review/options UI | 49 |
| Packaged Firefox importer lifecycle | 29 |
| HB matching/coverage regression suites | 210 |
| FAN matching/coverage regression suites | 209 |

The 22 new focused manifest tests cover the ten named fixtures; exact 100-issue family coverage; early false/weaker/multiple triggers; discontinuous ranges; mixed annual/mini-series/one-shot evidence; final-issue claims; no-trigger structural discovery; Include/Contain/Reprint; credits/plot/events/non-bibliographic Collects; early strong/late weak; complements/overlaps; Read More present/absent; other-series/excerpt preservation; reviews/restore/failure/local-reparse; no ordinary coverage leakage; non-comic contents; and deterministic/pathological bounds. Existing all-Kindle eligibility and lifecycle tests continue to pass. A stale browser-fixture parser-generation assertion was corrected to use the current exported constant, and its fetch fixture now sends actual bounded source blocks to the worker.

## Files and commits

Implementation files: `src/providers/kindle.js`, new `src/lib/kindle-manifest.js`, `src/lib/kindle-contents.js`, `src/lib/metadata-validation.js`, `src/background/storage-writer.js`, `src/ui/contents-editor.js`, and `scripts/runtime-files.json`.

Test files: new `tests/kindle-manifest.js`, new `tests/kindle-manifest-fixtures.json`, `tests/kindle-contents.js`, `tests/importers-fixture.js`, and `tests/run.js`.

Pilot tooling/evidence: [pilot driver](../scripts/pilot-kindle-manifests.mjs), [offline analyzer](../scripts/analyze-kindle-manifest-pilot.mjs), [raw initial pilot results](kindle-manifest-pilot-results.json), and [final offline metrics and record-level assessment](kindle-manifest-pilot-metrics.json).

Commits:

- `9012d8a` — record the preceding static-description reconnaissance and evidence.
- `e035176` — bounded candidate discovery, worker assessment, storage/review integration, and fixtures.
- `f0c474d` — context/other-series/excerpt safeguards, mixed supplements, incidental structural-reference rejection, and budget robustness.
- `6d63ff0` — exact pilot driver, offline analyzer, raw results, and final assessment data.

This report is committed separately. The preceding reconnaissance files/scripts are GL-specific and remain inside this repository. No HB/FAN files changed. The unrelated local `start.txt` remains untouched.

## Recommendation

**The evidence justifies a further narrow, staged source refresh, not an automatic whole-library rescan.** Begin with historical extractor <4 records whose selected evidence is a demonstrably weak early plot/credit/feature clause or an unverified failed/uncertain collection claim. Keep the existing sequencing, stop rules, checkpoints, and explicit-review boundary. Generation alone is not a sufficient refresh selector.

The preceding audit's 330 false containment fragments, 235 useful originally failed statements still without proposals after the quality pass, and 26 strict collection-like negative results form an explainable review pool; the previously defined union with the controls/marker cases is 642 records. **642 is a candidate review pool, not a recommended immediate network run.** Deduplicate it, separate already refreshed controls/77 pilot members, distinguish local parser-only opportunities from omitted-source cases, and subdivide it by prior outcome and source characteristics before choosing another bounded sample. Do not apply comic classification or provider ownership as an eligibility gate.

Before a broad refresh of complex mixed manifests, fix the ambiguous comma-label/supplement false-Full behavior and clarify bare-number/run syntax in a focused parser pass. Preserve incomplete evidence rather than forcing a Full result. For omitted-source cases, local reparse of an old fragment is insufficient; an explicitly authorized source refresh is necessary. For generation-4 records whose bounded source blocks are already captured, later parser improvements can be evaluated offline first.

The immediate next step should be review of this report and the remaining ambiguous-parser cases, followed by a separately chosen bounded refresh population if approved. **No broader refresh has been launched.**
