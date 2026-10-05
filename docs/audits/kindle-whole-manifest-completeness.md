# Kindle whole-manifest completeness: offline investigation and fix

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Date: 2026-10-05. Scope: interpretation of already captured source only.

## 1. Executive result

King in Black now produces **Partial, 52 proposals, and two unresolved source fragments**, rather than **Full, five Namor proposals**. A complete source-backed parent represents its explicit Collects sentence; all 18 original child windows remain available as diagnostic evidence. Parser 4 processes the literal parent once. Independent secondary clauses are not merged.

The complete 1,520-record replay changes only this book. The captured-block replay changes its generation-4 and generation-5 observations, with every other control unchanged. Ownership, ordinary matching, canonical grouping, manual decisions and verified contents remain unchanged. **Zero Amazon requests, zero refreshes, and zero user-library writes** occurred. Safety testing used a private in-memory copy of the export.

Source generation **5**, parser **4**, filter **1**, and storage schema **12** remain stable. Optional manifest interpretation version **1** identifies the new derived interpretation separately from source capture.

Evidence:

- [Frozen before trace](../development/artifacts-and-audits.md#generated-output): original block, sentence, all windows/ranks and historical/parser-4 proposals.
- [Complete replay ledger](../development/artifacts-and-audits.md#generated-output): 137 captured/fixture observations, 1,520 corpus comparisons, source selections and all proposal additions/removals.
- [Suspicious Full evidence](../development/artifacts-and-audits.md#generated-output): every audited non-filtered secondary of a previously Full primary.
- [Full-export safety results](../development/artifacts-and-audits.md#generated-output).

## 2. Exact King in Black root cause

The captured `#bookDescription_feature_div` block already contains the complete manifest. Its initial collection sentence occupies source offsets **[0, 738)**, ending after `And King In Black Handbook.` A newline then introduces synopsis prose. Existing sentence handling preserves `vs.` and `S.W.O.R.D.` inside the sentence.

Discovery starts a semantic candidate at `Collects`. It also starts structural candidates after semicolons when the following text looks like a capitalized numbered label, numbered issues, or a Contents heading. Each window ends at the next start. This yields one initial window and 17 subsequent windows. The unnumbered one-shot list creates no separate structural start and remains in the initial window; the unnumbered Handbook remains in the final window.

All 18 windows are complementary pieces of this one explicit source sentence. Their source ranges do not overlap, and their numbered constituent keys contain no duplicates. The old implementation treated them as competing standalone candidates, without a parent relationship.

The unchanged ranking tuple is `[quality, numbered-or-named, proposal-count, local-Full, -unresolved-count]`, followed by an early source-position tie break. Namor receives `[2, 2, 5, 1, 0]`. The initial five-unit window receives `[2, 2, 5, 0, -1]`, so its unresolved one-shot list makes it lose. Symbiote Spider-Man also receives `[2, 2, 5, 1, 0]` but occurs later. Namor therefore wins.

`proposeContentsForReview` in `src/lib/contents.js` assigns Full when quality is containment, entries exist, and there is no unparsed text. That is locally correct for Namor #1-5. It previously had no information about unprocessed siblings. The error was representation/selection, not source loss or parser grammar.

## 3. Candidate/window trace before the change

Offsets are zero-based, end-exclusive coordinates into the retained block. Raw strings are trimmed at existing delimiter boundaries; exact strings, contextual offsets, bindings and ranks are in the before JSON. Every window is in block 0, with explicit-clause binding. Window 0 starts at the semantic Collects trigger; windows 1-17 start at structural semicolon boundaries.

| Index | Source range | Evidence | Local outcome | Units / unresolved |
| --- | --- | --- | --- | --- |
| 0 | 0-195 | Collects King In Black #1-5; Immortal Hulk ... Ghost Rider | Partial | 5 / 1 |
| 1 | 195-235 | King In Black: Gwenom vs. Carnage #1-3 | Full | 3 / 0 |
| 2 | 235-262 | King In Black: Namor #1-5 **(selected)** | Full | 5 / 0 |
| 3 | 262-307 | King In Black: Planet Of The Symbiotes #1-3 | Full | 3 / 0 |
| 4 | 307-352 | King In Black: Return Of The Valkyries #1-4 | Full | 4 / 0 |
| 5 | 352-386 | King In Black: Thunderbolts #1-3 | Full | 3 / 0 |
| 6 | 386-427 | Symbiote Spider-Man: King In Black #1-5 | Full | 5 / 0 |
| 7 | 427-450 | Black Cat (2020) #1-3 | Full | 3 / 0 |
| 8 | 450-475 | Daredevil (2019) #26-27 | Full | 2 / 0 |
| 9 | 475-496 | Deadpool (2019) #10 | Full | 1 / 0 |
| 10 | 496-526 | Fantastic Four (2018) #29-30 | Full | 2 / 0 |
| 11 | 526-562 | Guardians Of The Galaxy (2020) #10 | Full | 1 / 0 |
| 12 | 562-593 | Miles Morales: Spider-Man #23 | Full | 1 / 0 |
| 13 | 593-617 | S.W.O.R.D. (2020) #2-4 | Full | 3 / 0 |
| 14 | 617-648 | Savage Avengers (2019) #17-19 | Full | 3 / 0 |
| 15 | 648-674 | Spider-Woman (2020) #7-8 | Full | 2 / 0 |
| 16 | 674-690 | The Union #1-2 | Full | 2 / 0 |
| 17 | 690-738 | Venom (2018) #31-34; And King In Black Handbook. | Partial | 4 / 1 |

The other 17 candidates remained secondary evidence, but only the selected Namor input reached the primary proposal. Parsing the whole retained sentence with unchanged parser 4 already recovered 52 units and the two unresolved fragments. Source block, collection trigger, common sentence boundary, exact offsets and literal separators establish the parent relationship offline.

## 4. Definition of a same-clause whole manifest

A parent requires an existing explicit collection trigger in one retained source block and sentence, with structural semicolon children before the next independent collection trigger. Its first segment must yield existing parser-4 containment evidence with a supported numbered unit.

Every continuation must have a bibliographic shape: a capitalized/digit/quoted start or an explicit material/excerpt/selection/stories-from qualifier. Numbered continuations must end in a finite supported number/range rather than continuing into narrative. Intervening semantic verbs, synopsis, promotion, contributor/credit language and narrative context reject the relationship. Unnumbered supplements can remain literal unresolved evidence.

The parent is an exact contiguous source range. Membership requires the same block and compatible offsets within that range. Merely appearing later in a description is insufficient. Another containment verb establishes a separate claim; paragraph/sentence boundaries also prevent linking. This task does not infer parent relationships from arbitrary prose lists, title conventions, ASINs, publishers, or proposal counts.

## 5. Representation chosen and alternatives rejected

**Chosen: A, a source-backed parent plus diagnostic children.** Candidates gain derived `manifestRange` coordinates. A parent additionally has `whole` and `truncated`. Existing raw child text, offsets, local outcomes, parser inputs and bindings remain available. Ordering remains deterministic by block/start/end.

A retained parent's children do not compete against it as complete manifests. Existing rank weights still choose between independent source claims. Parents receive capacity priority ahead of their diagnostic windows within the unchanged bounded candidate budget; this prevents abundant child windows from displacing the parent before selection.

Parser 4 runs once over the literal parent, retaining semicolons and scope transitions. There is no parent-plus-child proposal union, invented punctuation, independent clause concatenation, or ordinary-title matching change. Existing contents identity validation handles equivalent units; scope distinctions remain significant.

**B, concatenating linked windows**, would require reconstructing omitted delimiters and intervening unresolved material. The source already provides the exact contiguous text, so reconstruction adds risk without benefit.

**C, parsing children and unioning entries**, risks resetting excerpt scope at each child and losing unresolved parent material. It also makes duplicate handling and completeness depend on aggregation rules. Children are retained for diagnosis, but do not independently add entries to the primary result.

The existing limits remain: eight blocks, 24,000 total source characters, 12,000 per block, 32 candidates, 2,000 per candidate and 16,000 candidate evidence characters. An oversized parent stops at a retained semicolon within the window limit when possible. Its remaining captured source is unresolved evidence; a locally Full bounded portion becomes an overall Partial proposal. A linked child whose parent was omitted by a budget also cannot establish Full.

## 6. Completeness semantics and versioning

Three different questions remain separate:

| Layer | Meaning |
| --- | --- |
| Candidate parse completeness | Did parser 4 account for the selected candidate's text? Children retain their own local outcomes. |
| Source-manifest coverage | Was the proven parent collection clause used, or only a bounded portion? Derived `manifestCoverage` reports `whole-clause` or `bounded` when a parent is used. |
| Book-level completeness | Does the available evidence establish everything contained in the book? Discovery does **not** establish this. |

| Outcome | Meaning at the proposal layer |
| --- | --- |
| Full | Containment evidence yielded entries with no unresolved text in the interpreted claim. It is not proof of complete book contents, verified identity or ownership. |
| Partial | Entries were recovered, but meaningful text remains unresolved, or a proven parent has an unprocessed captured remainder. |
| Failed | Containment evidence produced no safely structured entries. |
| Filtered | The quality gate classified the input as non-contents evidence. |
| Uncertain | Evidence did not pass the containment-confidence gate; structure/names are not forced. |

The review UI states these limits, displays the literal parent used for proposals, and labels candidate outcomes as **local parse** results. A legacy saved child can expose **Use whole source manifest** without replacing existing verified review text. Loading/parsing a parent only creates suggestions; saving verification remains a separate user action. Editing the text prevents reuse of unrelated saved parent context.

Optional `manifest.interpretationVersion = 1` records source interpretation separately. Validation recomputes relationships and parser inputs from retained blocks, including older manifests, and ignores forged derived fields. Exact older selected source windows remain the historical selection. Local proposal derivation uses their proven parent; local reparse is requested when derived parser input differs, even if parser/filter generations or outcome did not change.

No source/extractor, parser, filter or schema increment was made. Source generation remains 5, parser 4, filter 1, schema 12. The new field is optional and derived; it does not repurpose an existing version or schedule a refresh.

## 7. King in Black before/after

| Evidence path | Selected/interpreted evidence | Outcome | Proposals | Unresolved |
| --- | --- | --- | --- | --- |
| Historical parser-4 statement | Entire Collects statement | Partial | 52 | 2 |
| Existing generation-4/5 candidate selection | Namor #1-5; 17 other windows secondary | Full | 5 | 0 in selected window |
| New fresh discovery | Whole Collects sentence, offsets 0-738; all 18 children secondary | Partial | 52 | 2 |
| Existing saved child, locally reinterpreted | Stored Namor selection preserved; source-backed whole parent used for proposals | Partial | 52 | 2 |

The new candidate list contains 19 candidates: one parent and the original 18 windows. All original child raw strings and offsets remain exact. The parent covers the entire collection sentence, not the synopsis or terminal Read more.

Unresolved source evidence is preserved:

1. `King In Black: Immortal Hulk, Iron Man/Doctor Doom, Black Knight, Marauders, Black Panther, Captain America, Wiccan And Hulkling, Spider-Man, Scream And Ghost Rider`
2. `And King In Black Handbook.`

Parser 4 does not safely structure these named one-shots/supplements in this context. No issue #1, named constituent identity or external bibliographic fact was invented. All 52 supported numbered constituents are suggestions. Zero duplicates were removed from this manifest because its supported units are already distinct. The production implementation contains no required count of 52; that count is an observed result and a permanent regression expectation for this exact captured evidence.

Partial accurately describes full coverage of the captured collection clause with unresolved constituents. Terminal Read more remains a separate source-incompleteness warning; this fix does not claim hydration or complete-book coverage.

## 8. Control-record results

All non-King captured proposal entries, unresolved evidence, outcomes and selected statements are identical before/after. Generation-5 blocks remain exact, including newlines and inline boundaries.

| Control | Result before and after | Scope check |
| --- | --- | --- |
| 100 Bullets Books 1-5 | Full: 19, 17, 22, 22, 20 units | Exactly #1-19, #20-36, #37-58, #59-80, #81-100: #1-100 once, no gaps/overlaps. |
| Road to No Man's Land Vol. 2 | Full, 15 | Explicit Reprinting manifest selected; earlier promotional collects clause remains separate. |
| Code Breakers Books 1-4 | Failed, 0; one unresolved fragment | Generic count prose remains primary; richer named clause stays secondary. No ranking/parser fix added. |
| Hellboy Omnibus Vol. 1 | Failed, 0; one unresolved fragment | Named later evidence remains secondary. |
| A Hunger Like No Other | Full, one proposal | The proposal is an **excerpt**, not full-work ownership. |
| Knightfall Vol. 1 | Partial, 23; one unresolved fragment | Vengeance of Bane remains unresolved. |
| Knightfall Vol. 2 | Full, 27 | Existing scope/entries unchanged; no implication of complete-book proof. |
| TMNT IDW Vol. 11 | Partial, 7; one unresolved fragment | Ongoing-series #76-84 attribution remains unresolved. |
| TMNT IDW Vol. 13 | Failed, 0; two unresolved fragments | No parser-v5 grammar introduced. |
| Dragon Blood generation 5 | Uncertain, 0; one unresolved fragment | Preserved DOM/list boundaries remain exact. Named-list grammar deferred. |
| Neverwhere generation 5 | Failed, 0; one unresolved fragment | Preserved paragraph boundary remains exact. Attribution grammar deferred. |
| Investing / Midwich | Failed, 0 each | Enumerated topics and prose mentions create no whole parent. |

General fixtures additionally reject separate semantic claims, plot after a semicolon, contributor text, promotional praise and numbered fragments followed by narrative. Explicit excerpt scope is retained. After partial-material scope, an ambiguous following segment remains unresolved rather than silently becoming full.

## 9. Full 1,520-statement offline replay

Source: `galactic-library-backup-v1 (2).json` from Downloads, exported `2026-10-05T00:48:15.011Z`. SHA-256: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`.

The export has 14,081 provider records, 3,322 Kindle records, 3,194 eligible Kindle records and 1,520 nonempty saved statements. The existing corpus loader retains the frozen historical/pilot evidence. This comparison additionally overlays the latest already captured blocks for **95 distinct URLs**, including the 25 generation-5 experiment records. The other 1,425 records use existing statement evidence; no missing source was fetched or invented.

| Metric | Latest captured baseline | New interpretation |
| --- | --- | --- |
| Records | 1,520 | 1,520 |
| Proposals | 12,125 | 12,172 |
| Unresolved fragments | 926 | 928 |
| Full | 770 | 769 |
| Partial | 190 | 191 |
| Failed | 217 | 217 |
| Filtered | 245 | 245 |
| Uncertain | 98 | 98 |

One record changed: King in Black, Full -> Partial, five -> 52 proposals, zero -> two unresolved fragments. Additions: **47**. Removals: **0**. Partial -> Full: **0**. All other 1,519 outcomes/entry lists/unresolved lists are unchanged. The one changed record was inspected completely against the source and historical proposal.

The older parser-v4 audit reported 12,104 proposals and 933 unresolved fragments. Its baseline preceded the later source-capture evidence, so it is not the current 12,125/926 comparison. All **1,520 complete historical parser-4 proposal objects** were independently asserted identical to that older frozen audit. This confirms the parser itself has not changed.

Captured-block replay covers **137 observations**: 77 pilot generation-4 records, 25 experiment generation-4 records, 25 generation-5 replays and 10 existing manifest fixtures. There are 127 real capture observations for 95 distinct URLs; repetitions deliberately test generations rather than count unique library changes.

| Captured/fixture metric | Before | After |
| --- | --- | --- |
| Proposals | 1,020 | 1,114 |
| Unresolved fragments | 80 | 84 |
| Full | 71 | 69 |
| Partial | 24 | 26 |
| Failed / Filtered / Uncertain | 18 / 3 / 21 | 18 / 3 / 21 |

Two observations change: the same King book at generations 4 and 5. Additions total 94, removals zero. Each detects one parent with 18 diagnostic children. Thus there is **one unique affected book**, not two. Equivalent child duplicates in captured parents: **0**. The generalized overlap fixture checks removal of three genuinely equivalent repeated Alpha units under existing contents identity rules.

There are **29 same-block independent secondary observations deliberately not combined**. Parent interpretation is not an automatic union of secondary evidence. The complete captured replay ran twice; all selection/proposal/comparison objects were deeply identical, not merely their counts.

## 10. Suspicious-Full / secondary-candidate audit

The audit includes every non-filtered secondary candidate of a previously Full primary in the 137-observation replay. Full blocks and candidate offsets were inspected, including every changed record. The [detailed table](../development/artifacts-and-audits.md#generated-output) contains **52 secondary observations across eight distinct titles**; repeated captures/fixtures are intentional.

| Classification | Observations | Interpretation |
| --- | --- | --- |
| Likely same-manifest fragmentation | 34 | King: 17 secondary windows in each of two source generations. Fixed by the proven parent. |
| Supplemental/excerpt evidence | 8 | Bullets arc names and original script; JLA named classic tales in a separate includes claim. Retained, not automatically combined. |
| Unrelated prose | 10 | Five-volume Bullets promotion; Batman/Robin synopsis; Gideon cover-gallery contributor list; Road storyline promotion. |
| Legitimate alternative candidate | 0 | No remaining audited observation required this classification. |
| Ambiguous | 0 | No remaining audited observation after manual source inspection. |

The JLA material is potentially useful supplemental evidence, but its distinct semantic trigger does not establish the same parent relationship used here. Its interpretation remains a separate follow-up. The audit found no second demonstrated numbered same-clause fragmentation case in the captured set. That does not establish its absence from uncaptured source.

## 11. Safety results

The actual storage writer restored a private copy of all **14,081 records**, overlaid only captured source evidence, and locally reparsed the 1,520 statements in 16 batches. The original Downloads export hash stayed unchanged. A synthetic pre-existing verified King review ensured review preservation was tested non-vacuously.

Assertions found zero changes to ownership, ordinary metadata except expected update timestamps, canonical grouping, manual match decisions, edition separations, ownership reviews, verified contents reviews or owned-content indexing. All **29 successful ordinary external-API comparisons** remained identical, including probes for unverified discovered constituent titles.

Source/source URL, stored selected statement, checked-at timestamp, extractor generation and normalized manifest evidence remained exact through reparse. Existing enrichment-history entries and prior selected source were preserved. All reparsed source enrichment survived backup/restore exactly, including generation-5 boundaries. The old stored Namor selection remains source history while derived parse input/outcome use the parent and become Partial.

No unverified contents enter ordinary owned-title matching. Discovery/reparse does not verify a review or grant ownership. Borrowed-record behavior is covered by the permanent regression. HB and FAN source/commits were unchanged. Their unrelated pre-existing untracked files were not touched.

## 12. Permanent regressions and tests

All completed checks passed:

| Suite | Result |
| --- | --- |
| GL complete unit suite | 386 passed |
| GL packaged Chrome UI | 49 passed |
| GL packaged Firefox UI | 49 passed |
| GL packaged Chrome importer / real DOM | 41 passed |
| GL packaged Firefox importer / real DOM | 41 passed |
| HB complete `*.test.mjs` unit suite | 314 passed |
| FAN complete `*.test.mjs` unit suite | 363 passed |
| HB Chrome / Firefox browser fixtures | 86 passed each |
| FAN packaged Chrome / Firefox browser fixtures | 10 existing scenarios passed each |
| Installed Firefox GL/HB/FAN background, importer and companion suite | All checks passed; temporary add-ons and local synthetic data |
| Captured deterministic replay | 137 observations, two identical passes |
| Historical parser-v4 replay | 1,520 complete objects unchanged |
| Private full-export storage safety | All assertions passed |

Shared Node/Chrome/Firefox tests cover the exact King parent and children, generalized long semicolon manifests, equivalent-unit deduplication, material/excerpt scope, independent clauses, promotional/narrative/contributor rejection, caps, forged derived metadata, legacy restore/local reparse, source/history/review/ownership/index/backup safety, and the actual review UI. All prior captured controls retain their source and outcomes. Existing five-volume Bullets and generation-5 DOM-boundary regressions remain enabled.

The final Chrome importer fixture was rerun after the last UI wording adjustment. Initial attempts to run complete companion unit suites under the restricted process sandbox encountered `spawn EPERM`; rerunning with subprocess permission passed. No assertion or regression was weakened.

Reproduce offline from the GL repository:

```powershell
node scripts/audit-whole-manifests.mjs '<path-to-backup>'
node scripts/check-whole-manifest-safety.mjs '<path-to-backup>'
npm test
npm run test:browser:release
npm run test:browser:firefox
npm run test:importers:release
npm run test:importers:firefox
```

The audit/safety scripts install a throwing fetch guard and never invoke acquisition. Browser checks use local fixture servers and isolated profiles, not signed-in storefront sessions.

## 13. Performance

Seven warm runs over all 137 observations measured selection plus proposal derivation: old median **37.39 ms**, new median **40.96 ms**, approximately **3.58 ms / 9.6%** additional computation over the entire captured workload. These are local measurements, not network/extraction timings or whole-library performance guarantees.

The first complete comparison replay took 414.08 ms; the second took 129.74 ms. Those measurements include old/new comparisons and construction of the detailed trace and are affected by warm-up. They are not interchangeable with the warm algorithm-only medians.

Actual writer reparse of the 1,520 private records took **37.16 seconds**, including validation, cloning, storage/history operations and repeated batches. No network was involved. Existing source/candidate caps remain unchanged.

## 14. Files changed

Production:

- `src/lib/kindle-manifest.js`: bounded source-parent discovery, derived relationships/version, family-aware selection, literal whole-parent proposals and incomplete remainder handling.
- `src/lib/kindle-contents.js`: recognize local interpretation changes through derived parse input.
- `src/ui/contents-editor.js`: expose whole evidence and explain local completeness without changing verification.

Tests:

- `tests/fixtures/kindle/kindle-manifest-before-whole.snapshot.txt`: frozen original candidate module.
- `tests/fixtures/kindle/kindle-whole-manifest.json`: captured King source and old selection.
- `tests/kindle-whole-manifest-fixture.js`: shared Node/browser regressions.
- `tests/kindle-whole-manifest.js`, `tests/run.js`, `tests/importers-fixture.js`: unit/control and real-browser integration.

Tooling and reports:

- `scripts/whole-manifest-evidence.mjs`: existing captured evidence loader and frozen baseline importer.
- `scripts/audit-whole-manifests.mjs`: complete deterministic replay, suspicious audit and bounded computational benchmark.
- `scripts/check-whole-manifest-safety.mjs`: actual writer/API/index/backup safety on a private export copy.
- This report and `audit-artifacts/kindle/kindle-whole-manifest-{before,audit,safety}.json`, `audit-artifacts/kindle/kindle-whole-manifest-suspicious.md`.

Source capture, parser grammar, filter grammar, ordinary matching, models and providers are unchanged. The baseline snapshot hash is `7ccf8c0c214027f6fc4666c16b7f9a98bac3c12bfbe91ae3314e5e28fb84a147`.

## 15. Commits

- `a10e580` — Freeze offline whole-manifest baseline and King in Black window trace.
- `6f7009f` — Preserve whole source manifests above diagnostic child windows; permanent Node/Chrome/Firefox regressions and review UI.
- Final report/audit commit — this report, deterministic full replay and safety tools/results; recorded in git history.

No HB or FAN commit was made. Unrelated GL `start.txt` remains untouched.

## 16. Remaining limitations

This is deliberately a same-sentence, source-backed, explicit numbered-head manifest fix. It does not generalize arbitrary named lists or newline-only collection headings. Conservative prose rejection can decline a real collection relationship; that is safer than silently combining narrative with contents. All source evidence remains available for review.

Source/window budgets remain finite. A processed bounded parent cannot claim Full, but evidence not captured at all cannot be reconstructed. Terminal Read more still signals potentially incomplete hydration/extraction; it is not merely discarded garbage. There were no new sleeps, requests, retries or hydration changes.

Full still does not certify all book contents. Independent supplementary claims are preserved separately and may merit review even when the selected manifest parses Full. This task prevents proven same-parent siblings from disappearing behind a tiny Full child; it does not invent a universal book-completeness flag.

Named one-shots, King Handbook, Code Breakers/Hellboy named clauses, Sherlock structural discovery, Dragon Blood lists, Neverwhere attribution and TMNT unsupported grammar remain unresolved where they were unresolved before. No parser v5, new eligibility gate or external identity inference was introduced.

## 17. Recommendation and stop

Review this bounded result first. Existing saved King source can be processed with **local Reparse saved text**; it needs no Amazon refresh. Inspect the whole-manifest proposal and its two unresolved fragments before any verified save.

Next work should be a separately scoped offline discovery/selection review for useful independent named secondary evidence (Code Breakers/Hellboy/JLA), or the previously deferred Sherlock structural-list discovery. Keep that separate from parser grammar and book-completeness claims; use already captured source to establish the failure before designing a broader change.

**Stopped after investigation, bounded implementation, permanent regressions, complete offline replay, safety checks, report and commits. No Amazon request, library refresh/population scan, parser v5, named-work grammar project or additional network experiment was started. Await review.**
