# Kindle independent secondary evidence: offline audit and review-only access

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Completed 2026-10-05. Stable source **5**, parser **4**, filter **1**, schema **12**, manifest interpretation **1**. No Amazon requests or source refreshes.

## 1. Executive result

The evidence supports **explicit review of independent candidates**, not automatic promotion, aggregation or new constituent grammar. Every real independent secondary in the captured population currently produces zero parser-4 entries. Useful names survive, but generic count claims, unsupported attribution, promotion, source incompleteness and uncertain overlap prevent a safe automatic interpretation.

Implemented: a separate collapsed **Other captured claims to review (N)** section inside the contents editor. Each claim shows its exact source, local result, literal qualifiers and contextual input. **Load this claim for review** loads one claim and clears unsaved editor rows. Parsing remains an explicit action. Saved verification stays intact; no automatic save or combination occurs.

All 137 captured/fixture observations and all 1,520 saved statements retain their primary selections, proposals, unresolved evidence and outcomes. King in Black remains **Partial / 52 proposals / two unresolved**, with all 18 diagnostic children. Independent review presentation exposes 29 observations in the captured set, corresponding to 16 claims across 15 latest library records.

Zero network acquisition. The original export and installed extension storage were untouched. Ownership, ordinary matching, grouping and verified contents remain unchanged.

Evidence and reproducible tools:

- [Frozen population and exact primary/secondary traces](../development/artifacts-and-audits.md#generated-output).
- [Decision committed before production changes](../development/artifacts-and-audits.md#generated-output).
- [Deterministic captured/corpus replay](../development/artifacts-and-audits.md#generated-output).
- [Private full-export safety results](../development/artifacts-and-audits.md#generated-output).
- [Frozen baseline loader](../../scripts/independent-secondary-evidence.mjs), [freeze tool](../../scripts/freeze-independent-secondary.mjs), [replay tool](../../scripts/audit-independent-secondary.mjs), [safety tool](../../scripts/check-independent-secondary-safety.mjs).

## 2. Frozen secondary-evidence population

Starting point: commit `ef325e2`, after the completed whole-manifest pass. The baseline candidate module was frozen before production edits; SHA-256 `2431fe8921460dca72f25022465abc7258519c0e9ae9859bf33d4895261d9346`.

Source export: Downloads `galactic-library-backup-v1 (2).json`, exported `2026-10-05T00:48:15.011Z`, SHA-256 `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`. It has 14,081 provider items, 3,322 Kindle items, 3,194 eligible Kindle records and 1,520 nonempty saved statements. Only already captured descriptions were overlaid, as in the previous task.

The population contains 77 pilot generation-4 observations, 25 experiment generation-4 observations, 25 generation-5 observations and 10 existing manifest fixtures: **137 observations**, with 127 real captures representing 95 distinct URLs. Repeated generations/fixtures test source fidelity and are not unique book counts.

Current interpretation-v1 discovery produces **65 non-filtered nonselected candidates**, all already retained as secondary, in **28 observations across 16 real titles**. Thirty-six are King in Black's diagnostic children: 18 in each of two generations. The remaining **29 independent observations** occur in 26 observations across 15 titles.

The previous 52-observation suspicious audit considered only **previously Full primaries**, before the parent fix. This broader audit includes Failed, Partial and Uncertain primaries too. Its 65 observations are not unexplained growth or lost evidence: the parent now retains the formerly selected Namor window as a child, and this audit includes useful/non-useful secondaries from the other outcome groups.

For every non-filtered secondary, the frozen JSON records title/provider ID, source generation, exact block, primary and secondary raw strings, indexes/offsets, source sentence/paragraph coordinates, context, trigger, quality/rank/local outcome, complete entries and unparsed text, qualifiers, parent relationship, retained status, additional/duplicate keys, scope conflicts and manual classification/rationale. All current nonselected candidates were examined, including any that might have been omitted from the retained-secondary list; none of these 65 was omitted.

The whole retained block is authoritative context. A candidate can span several captured paragraphs when the existing sentence scanner does not split punctuation adjacent to quotes/formatting. Those boundaries are documented, not altered here.

## 3. Semantic classification taxonomy

Classifications are manual audit data. They are **not production heuristics** or new ownership/quality gates.

| Category | Observations | Finding |
| --- | ---: | --- |
| A: same-manifest child | 36 | King children, already represented by interpretation 1. All supported child units duplicate the parent. |
| B: proven additional independent constituents | 0 | No real independent candidate yields a safely structured additional unit under parser 4. |
| C: supplement/apparatus | 4 | Three repeated Bullets script observations; one Hellboy Crooked Man sketchbook claim mixed with review prose. |
| D: alternative/generic description | 6 | Four Bullets arc-name observations; two Road promotional storyline descriptions. No extra unit mapping established. |
| E: generic versus specific claim | 6 | Code Breakers, Hellboy omnibus and TMNT 11, each at generations 4 and 5. |
| F: unrelated/credit/topic/wider-product scope | 9 | Robin synopsis, Gideon contributor list, Arduino features, repeated five-volume Bullets all-100-issues claims. |
| G: legitimate named tales, overlap unresolved | 4 | JLA volumes 1-4. Named contents evidence exists, but addition versus alternative description is unknown. |
| H: undiscovered structural evidence | Separate control | Sherlock at generations 4 and 5; not counted as secondary candidates. |

All **29 independent candidates have zero parsed entries**, so there are zero parsed additional keys, duplicate keys or conflicting scope keys in this independent set. That does not mean names have no value or no overlap: parser failure prevents a structured identity comparison. King children collectively repeat 52 parent units per generation; they are excluded from independent review and never unioned again.

## 4. Code Breakers trace

Provider **`kindle:B017Y9MBI8`**, title **Code Breakers Complete Series: Books 1-4**, observation IDs `sample-4-370` and `sample-5-370`.

The generic claim is:

> Containing all four novels of the series, this box set will delight fans of gritty post-apocalyptic fiction, with a cyberpunk flavor.

The later claim is:

> Contains four full length novels: Alpha, Beta, Gamma, and Delta with a special offer included inside (at the end of the book).

The retained candidate additionally includes the subsequent Kindle Unlimited promotion and terminal Read more. Generation 5 preserves those separate source lines; existing discovery still retains one candidate across them. No cleanup, new sentence grammar or Read more removal was introduced.

| Stage | Primary | Independent secondary |
| --- | --- | --- |
| Source offsets, gen 5 | 181-314 | 884-1084 |
| Trigger | Containing | Contains |
| Quality | containment | uncertain |
| Rank | `[2,0,0,0,-1]` | `[1,0,0,0,-1]` |
| Local outcome | Failed | Uncertain |
| Entries / unresolved | 0 / 1 | 0 / 1 |
| Relationship | First paragraph | Later paragraph and attached promotion lines; different semantic claim |

Discovery **retains** the named claim. Quality marks it uncertain because terminal Read more survives on non-numbered evidence. The generic claim wins on the first rank element; neither has parser-supported units. Selection, quality, grammar and identity must therefore be assessed separately.

Alpha/Beta/Gamma/Delta are literal names under an explicit four-novel claim, useful for manual review in this collection. They do not by themselves establish globally unique work identities, editions or ordinary ownership. Parser 4 does not separate the count/type prefix and trailing special-offer prose into safe constituent names. Promoting this claim would not recover proposals and would override the existing uncertainty gate.

Both claims remain visible; the later one is now directly loadable. It still yields Uncertain and zero entries when parsed unchanged. The one unresolved fragment preserves the complete later candidate body, including unsupported prose.

## 5. Hellboy omnibus trace

Provider **`kindle:B07BJKXP63`**, observations `sample-4-629` / `sample-5-629`.

The primary's full source context describes **four omnibus volumes plus two Complete Short Stories volumes**, which together collect all stories. Its candidate begins:

> collect all of Mignola's award-winning Hellboy stories in chronological order for a definitive reading experience.

The later paragraph explicitly concerns **this 368-page volume** and says:

> reprinting Seed of Destruction, Wake the Devil, and "Wolves of St August," "The Chained Coffin," and "Almost Colossus," from The Chained Coffin and The Right Hand of Doom.

| Stage | Primary | Independent secondary |
| --- | --- | --- |
| Source offsets, both generations | 712-826 | 895-1066 |
| Trigger | collect | reprinting |
| Quality | containment | containment |
| Rank | `[2,0,0,0,-1]` | `[2,0,0,0,-1]` |
| Local outcome | Failed | Failed |
| Entries / unresolved | 0 / 1 | 0 / 1 |
| Generation-5 paragraph | 616-826 | 827-1066 |

Equal ranks leave the early source-position tie break to choose the wider series claim. The later candidate is **semantically more specific to this volume**, but specificity is not a parser-supported rank dimension. This is a primary-selection limitation interacting with grammar and source attribution, not source loss.

Parser input normalizes reprinting to Collects while preserving the original raw source. Mixed quoted/unquoted names, commas inside closing quotes, and `from` attribution remain unsupported. The source names material and the collections it came from, but does not make every source-collection title another constituent. No external bibliography or invented one-shot issue number was used.

Automatic later/specific/named promotion would choose another Failed claim and would require an additional semantic scorer to handle wider-series versus volume context generally. That broader rule is not justified here. The later volume-specific claim is now directly reviewable, without discarding the first claim or changing stored selection.

## 6. JLA traces and scope

The four captured JLA cases each have a numbered collection claim followed by a **distinct includes trigger** in the same source sentence. There is no interpretation-v1 parent connecting them; independent semantic claims must not become structural children just because they share a sentence.

| Volume / provider | Primary offsets / rank / outcome | Named-claim offsets / rank / outcome |
| --- | --- | --- |
| 1 / `B01AORO2H0` | 550-651 / `[2,2,12,1,0]` / Full, 12 | 651-769 / `[1,0,0,0,-1]` / Uncertain, 0 |
| 2 / `B01MCXTG9B` | 572-654 / `[2,0,0,0,-1]` / Failed, 0 | 654-798 / `[1,0,0,0,-1]` / Uncertain, 0 |
| 3 / `B06XXRCN34` | 576-660 / `[2,0,0,0,-1]` / Failed, 0 | 660-781 / `[1,0,0,0,-1]` / Uncertain, 0 |
| 4 / `B07F1DYZ4J` | 728-812 / `[2,0,0,0,-1]` / Failed, 0 | 812-936 / `[1,0,0,0,-1]` / Uncertain, 0 |

Volume 1 explicitly collects Brave and the Bold #28-30, JLA #1-8 and Mystery in Space #75. Its named claim lists **Doom of the Star Diamond**, **The Slave Ship of Space**, and **Starro the Conqueror!**. Volumes 2-4 name their own three classic tales; all exact strings are in the frozen JSON and permanent fixtures.

Volumes 2-4 retain `the fame/famed super-team's exploits from ...` before their explicit series/ranges. Parser 4 refuses that prefix as a normal numeric series label. The named claims remain uncertain because Read more survives on non-numbered evidence; prefixed `classic tales`/punctuation is also unsupported named-list input. Rank quality therefore leaves the numbered-looking claims primary even when they fail to structure entries.

The literal context says **classic tales**, with **no excerpt, original-script, bonus or supplemental qualifier**. This is legitimate named-story containment evidence. However, the source does not map story names to issue identities or establish whether they add material beyond the stated ranges. They could be alternative story names for numbered material. The earlier suspicious audit's supplemental/excerpt bucket was provisional; this inspection refines it to **G, legitimate named tales with unknown overlap**, not proven bonus material.

The UI preserves these claims separately. Full on JLA 1 remains a local parse of its numbered primary, not a dismissal of the other claim. No automatic component proposals, deduplication against unmapped issue titles, or Full -> Partial downgrade occurs merely because includes appears.

## 7. Sherlock control

`sample-4-1027` / `sample-5-1027`, **Sherlock Holmes: The Ultimate Collection (Illustrated)**, remains Filtered with zero entries. Discovery finds only the illustrations/covers/Sherlockiana inclusion, rank `[0,0,0,0,-1]`. There is no non-filtered secondary candidate.

Generation 5 preserves headings and separate author-attributed lines for A Study in Scarlet, The Sign of the Four, The Hound of the Baskervilles, The Valley of Fear, The Adventures of Sherlock Holmes, The Memoirs of Sherlock Holmes, The Return of Sherlock Holmes and His Last Bow. The preceding `you will find` sentence also names them. They are outside current semantic/structural candidate recognition.

This is **H, out-of-scope structural discovery evidence**. Independent-secondary review cannot expose something discovery did not recognize as a candidate. No find-title engine or list-heading rule was introduced; exact source boundaries remain intact.

## 8. Primary-selection analysis

The existing tuple remains `[quality, numbered-or-named, bounded-unit-count, local-Full, -unresolved]`, with earlier position as the final tie break. No weights, trigger priority or source-position preference changed.

Code Breakers demonstrates quality uncertainty outranking semantic specificity. Hellboy demonstrates an equal-rank early generic/wider-series claim beating a volume-specific but unparseable clause. JLA 1 has an appropriate strong numbered primary plus a useful independent named claim; JLA 2-4 additionally have unsupported primary attribution.

Elsewhere, parsed numbered primary units correctly dominate failed/unresolved promotion or apparatus. Bullets' arc names do not prove extra units; the original script has different scope. Road's promotional storyline clause is not a second set of contents. TMNT 11's one-shots/crossovers/event-series phrase names generic formats, not additional finite units. Robin synopsis, Gideon gallery credits and Arduino protocols demonstrate that **non-filtered does not mean semantically legitimate contents**.

Choosing a secondary instead would hide/replace the initial claim in the primary presentation without resolving parser support. No real captured independent pair currently supports combining parsed entries. These cases justify visibility and explicit review, not a uniform new ranking rule.

## 9. Representation alternatives considered

| Option | Decision |
| --- | --- |
| A: better primary selection | Not implemented. Hellboy is more volume-specific, but a generalized dominance rule must handle wider-series context, uncertainty and unsupported identity. Counts/ranks alone do not establish it. |
| B: primary plus independent evidence set | Existing retained candidates already preserve source. Used as the basis for a derived review view, without creating a verified semantic evidence set. |
| C: proposals from multiple claims | Not implemented. No real independent parsed additions demonstrate safety. Aggregation would need explicit per-entry provenance, overlap and unsupported supplement semantics. |
| D: review-only secondary evidence | **Implemented.** Separate candidates and explicit claim loading/parsing, with uncertainty and provenance intact. |
| E: no production change | Valid for automatic selection/aggregation; a bounded UI access change is justified by multiple captured useful cases. |

## 10. Implemented rule and versioning

The helper validates/recomputes the bounded manifest from source, retains the existing exact selected window, and returns independently retained candidates for review. It excludes structural children of any proven parent and the effective parent of a legacy selected child. Unselected independent parents, if present in future supported source, remain distinct claims with their existing bounded-parent outcome semantics.

No candidate is promoted or semantically endorsed by this rule. The section says candidates may be contents, supplements, credits or unrelated prose. Filtered candidates stay in diagnostics rather than becoming review claims. Existing retained non-filtered uncertainty remains available.

**Evidence review interpretation version 1** is a separate exported derived-view constant, not a persisted enrichment field. Manifest interpretation version 1 continues to mean same-clause parent handling. Source 5, parser 4, filter 1 and schema 12 are unchanged. No local reparse flag or source refresh is scheduled for a presentation-only change.

## 11. Scope and provenance behavior

Each derived claim retains candidate index, block/start/end, literal raw text, parser input, binding, quality, local proposal/outcome and literal qualifiers. UI sections retain these coordinates in source data attributes, show raw text and contextual input, and use the existing source URL when loading a claim. They never concatenate text into a fake manifest.

Qualifiers such as excerpt from, material from and original script are displayed literally; they do not convert unsupported scope into components. Real scripts/sketchbooks remain zero-entry review evidence. A generalized fixture with `Collects Alpha #1-4. Also includes an excerpt from Beta.` remains four primary units plus a separate unresolved excerpt claim. Existing parser-supported novel-attribution syntax produces one excerpt **only when the user explicitly loads and parses that individual claim**.

Loading clears editor rows to prevent old verified entries being paired accidentally with a new source statement. It does not modify the saved review. No automatic save, verified append, or union occurs. Editing the loaded source discards its captured input/context and uses the existing manual parsing path. Text rendering uses textContent; source URL cleanup retains the existing credential-free origin/path behavior.

## 12. Completeness behavior

Candidate parse completeness, captured-parent coverage and book completeness remain separate. Primary Full is still local; an independent claim's unresolved text stays separate from primary unparsed text. The visible section count and explanation say Full has not accounted for those other candidates.

No universal complete-book flag, automatic secondary-based Partial, or trigger-count downgrade was introduced. Uncertain overlap or a contributor mention is not sufficient to alter the primary outcome. The review user can inspect the claims without losing the accurately parsed primary.

King's same-parent children are excluded from the independent section in fresh and legacy-selected-child cases. Its parent still processes literal source once and returns Partial / 52 / two unresolved. This task leaves that implementation completely unchanged.

## 13. Captured-fixture replay

Two complete passes deeply compare all selections and derived review objects. The baseline/current production manifest selections are identical, including block text, candidate fields, ordering, offsets, parent relationships and selected/secondary indexes. Comparison to the JSON-frozen ledger accounts only for JSON's normalization of negative zero in the rank tuple; direct in-memory baseline/current comparison remains strict.

| Metric | Before | After |
| --- | ---: | ---: |
| Observations | 137 | 137 |
| Primary proposals | 1,114 | 1,114 |
| Primary unresolved fragments | 84 | 84 |
| Full / Partial / Failed | 69 / 26 / 18 | 69 / 26 / 18 |
| Filtered / Uncertain | 3 / 21 | 3 / 21 |
| Primary changes / promotions | 0 | 0 |
| Additions / removals / duplicate additions | 0 | 0 |
| Full -> Partial / Partial -> Full / Failed -> Partial-or-Full | 0 / 0 / 0 | 0 / 0 / 0 |
| Newly retained source claims | 0 | 0 |
| Independently accessible review claims | Existing diagnostics | 29 across 26 observations |
| Automatic secondary proposals | 0 | 0 |

All controls are unchanged: Bullets #1-100 exactly once; Road 15 Full; Hunger one excerpt; Knightfall 1 Partial 23 / Knightfall 2 Full 27; TMNT 11 Partial 7 / TMNT 13 Failed 0; Investing/Midwich Failed 0; Dragon Blood Uncertain 0 / Neverwhere Failed 0 with exact generation-5 boundaries; Sherlock Filtered 0. Nothing was made green merely to grow counts.

## 14. Complete 1,520-record replay

This is the same post-whole-manifest baseline, with latest already captured blocks for 95 URLs and statement-only evidence for the other 1,425 records. No source was acquired to fill missing descriptions.

| Metric | Before and after |
| --- | ---: |
| Records | 1,520 |
| Primary proposals | 12,172 |
| Primary unresolved fragments | 928 |
| Full / Partial / Failed | 769 / 191 / 217 |
| Filtered / Uncertain | 245 / 98 |
| Records / primaries / proposals / unresolved lists changed | 0 |
| Promotions / secondary automatic contributions | 0 |
| Added / removed / duplicate proposals | 0 |
| Outcome transitions | All unchanged |
| Independent review claims / affected UI records | 16 / 15 |

The older parser-v4 report's 12,104 proposals precede subsequent captured source overlays and the King fix. All **1,520 complete historical parser-4 proposal objects** independently match that earlier audit. Grammar/filter semantics did not change.

The 16 library claims were already stored; this feature changes their access, not persistence. Their parsed entries remain zero. Marketing, wider-series claims and contributor/topic candidates generate no proposals and no outcome downgrade; they remain explicitly unendorsed review evidence/diagnostics.

## 15. Changed-record manual review

There are **zero changed real primary interpretations**, so no hidden change queue was selected. Every one of the 29 independent captured observations was manually inspected in its full retained source context; all 36 King children were checked against the proven parent and original window trace. The frozen taxonomy gives a rationale for every secondary, including repetition across generations.

The 15 latest library records with new UI access were inspected: Bullets Two/Three/Four, Batman and Robin Pearl, Gideon Falls 1, Hellboy Crooked Man, JLA 1-4, Programming Arduino, Code Breakers, Hellboy omnibus 1, TMNT 11, and Road 2. None gains constituent proposals or changes its primary status. Exact Code/Hellboy/JLA UI behavior runs against captured source in both browsers.

## 16. Safety results

Private in-memory restore/reparse used all **14,081 records**, the 95 captured source overlays and all **1,520 statements**, in 16 writer batches. It never accessed installed storage or wrote the export. A pre-existing synthetic verified King review made review preservation non-vacuous.

Zero changes: ownership; ordinary identity metadata except expected update timestamps; canonical grouping; manual decisions; edition separations; ownership reviews; verified/reviewed contents; owned-content indexing; derived independent evidence; source/source URL/selected statement/check date/extractor generation/normalized manifest.

All **29 successful ordinary external-API comparisons** were identical, including constituent probes. Existing history entries and previous selected source remain preserved. Generation-5 evidence and reviews survive backup/restore. Stored historical Namor selection remains source history; King derives Partial through its unchanged parent. Unverified discoveries and manually parsed suggestions stay excluded from ordinary owned-title indexing.

The original export SHA remained exact. HB and FAN source/commits stayed unchanged; unrelated GL `start.txt` and FAN reconnaissance files were left untouched.

## 17. Permanent regressions and tests

| Suite | Passed |
| --- | ---: |
| GL complete unit suite | 387 |
| Packaged Chrome UI | 49 |
| Packaged Firefox UI | 49 |
| Packaged Chrome importer / real DOM review | 45 |
| Packaged Firefox importer / real DOM review | 45 |
| HB complete unit suite | 314 |
| FAN complete unit suite | 363 |
| HB Chrome / Firefox browser fixtures | 86 each |
| FAN packaged Chrome / Firefox default browser scenarios | 10 each |
| Installed Firefox GL/HB/FAN background, pairing and importers | 48 checks passed with temporary add-ons |
| Captured deterministic replay | 137, twice identical |
| Historical parser-v4 replay | 1,520 complete objects unchanged |
| Full-export private safety | All assertions passed |

New shared Node/browser regressions use 23 captured control records plus a legacy King manifest. They verify exact source provenance, unchanged primary outcomes, no child/parent reinterpretation as independent claims, named uncertainty, unsupported scripts/prose, scope, deterministic validation and forged-input rejection. Actual UI tests load Code Breakers, Hellboy and JLA while retaining prior saved verification. General fixtures verify independent numbered claims, unsupported excerpts, parser-supported excerpts, filtered contributors and edited-text context discard. Existing Bullets, source boundaries, matching/security and whole-manifest regressions remain enabled.

The complete GL suite needed subprocess permission for its existing packaging checks. It passed with that permission; existing regressions were not weakened. Browser tests use local synthetic fixtures/isolated profiles. No signed-in Amazon session or product page was used.

Reproduction from the GL repository:

```powershell
node scripts/audit-independent-secondary.mjs '<path-to-backup>'
node scripts/check-independent-secondary-safety.mjs '<path-to-backup>'
npm test
npm run test:browser:release
npm run test:browser:firefox
npm run test:importers:release
npm run test:importers:firefox
```

The audit/safety scripts install a throwing fetch guard. The frozen tool imports the frozen baseline, not current selection logic; no production acquisition path is invoked.

## 18. Performance

Seven warm runs over all 137 observations: selection plus primary proposal median **41.89 ms**; adding the validated independent review view **71.39 ms**. Added computation is about **29.50 ms over the complete captured workload**, approximately 0.22 ms per observation on this machine. This reflects deliberate source revalidation and individual claim parsing, not changes to scan/network behavior.

The review view runs lazily when the contents editor is first opened, not for every library row render. Candidate/source budgets are unchanged. The separate subsection remains collapsed initially.

First full comparison/trace construction took 416.76 ms, second 128.91 ms; these include comparisons, object construction and warm-up. Actual private writer/backup/history reparse took **38.94 seconds**. These are different workloads, not page-acquisition timings or whole-library guarantees.

## 19. Files changed

Production: `src/lib/kindle-evidence-review.js` (separate bounded derived review view), `src/ui/contents-editor.js` (claim visibility/loading), `scripts/runtime-files.json` (package the new module).

Tests: `tests/fixtures/kindle/kindle-manifest-before-independent.snapshot.txt`, `tests/fixtures/kindle/kindle-independent-evidence.json`, `tests/kindle-independent-evidence-fixture.js`, `tests/kindle-independent-evidence.js`, `tests/run.js`, `tests/importers-fixture.js`.

Audit/safety: `scripts/independent-secondary-evidence.mjs`, `scripts/freeze-independent-secondary.mjs`, `scripts/audit-independent-secondary.mjs`, `scripts/check-independent-secondary-safety.mjs`; this report, decision MD, and frozen/replay/safety JSON artifacts.

No changes to `kindle-manifest.js`, `contents.js`, `contents-quality.js`, Kindle provider/capture/network code, enrichment validation, storage writer, eligibility, models, ownership, ordinary matching, canonical grouping, HB or FAN.

## 20. Commits

- `8277abb` — Freeze independent secondary evidence and review-only decision **before production changes**.
- `189c80a` — Expose independent contents claims for explicit review without aggregation; package the helper and add Node/Chrome/Firefox regressions.
- Final report/audit commit — deterministic replay, full-export safety tools/results and this report, recorded in git history.

## 21. Remaining limitations

No semantic guarantee is attached to a non-filtered candidate. The review section intentionally warns about possible credits, topics and promotion. The audit taxonomy cannot safely become a production classifier by title, ASIN or hand-picked source IDs.

One saved verified contents review per provider item remains the current model. Loading and later verifying another claim **replaces that item's review**, rather than merging verified claims with per-entry source records. The UI explicitly explains this before claim loading. The new loading action preserves saved verification until an explicit save; automatic multi-source verified review would require a separately designed provenance model. Do not assume this UI is a multi-claim aggregation feature.

Count-prefixed named lists, mixed quoted/unquoted attribution, script/apparatus scope and ambiguous named-versus-numbered overlap remain unresolved. Terminal Read more retains source-incompleteness meaning. No broad cleanup, quote stripping, boundary rewrite, new grammar or external catalogue lookup was performed.

Previously uncaptured or over-budget source cannot be reconstructed. Older source with no retained manifest cannot gain independent evidence through this review view. Full still does not certify complete book contents. Sherlock discovery, Dragon Blood parsing, Neverwhere attribution and general named-work grammar remain deferred.

## 22. Recommendation and stop

Review the new access with Code Breakers, Hellboy omnibus and JLA first. Their useful names are now directly inspectable/loadable without rerunning Amazon capture or changing ownership. Keep unsupported text unresolved until a user verifies it.

Next, choose a separate offline grammar/representation task: finite count-prefixed named containment and mixed source attribution are the clearest named-work cases, while original scripts need an explicit scope model. Establish which identities and source attribution can safely be represented before adding proposals. Sherlock is a distinct structural-discovery task and should remain separately scoped.

**Stopped after frozen audit, bounded review-only implementation, permanent regressions, deterministic replay, safety/testing, report and commits. No Amazon requests, refresh/population scans, parser v5, general named-work project, source-capture change or whole-manifest redesign was started. Await review.**
