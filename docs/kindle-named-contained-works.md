# Kindle finite named contained works: representation-first audit

Completed 2026-10-05. Offline only; no Amazon requests, refreshes or installed-library writes.

## 1. Executive result

**Decision C: stop before parser 5.** The existing generic `component` can store a contained name, but its identity contract cannot enforce the requested collection scope. New named-work grammar would make more entries available for verification under an unsafe coverage contract. The task explicitly permits stopping at this representation gate; no production correction or new grammar was shipped.

The audit reproduced three defects relevant to that gate:

1. Different parent records with the same collection display label share verified component keys. A complete explicit contents request with matching run/language can return **Owned** for an unrelated offered collection.
2. Explicit contents coverage has no parent-media boundary. A reviewed component of an owned game can satisfy a book-contents request using the same key.
3. Numeric normalization applies to component *names*: `01` and `1` collapse even inside one collection.

These are existing coverage/representation defects, **not a finding that ordinary requests for bare titles such as Alpha currently return Owned**. Ordinary bare-title matching remains separate and passes the safety probes. Different collection labels containing Alpha also remain separate today. The missing guarantee is actual parent-record scope, rather than a collection label that often happens to be different.

All 1,520 saved statements, 137 captured/fixture observations and 1,520 historical parser-4 proposal objects retain their baseline results. King remains Partial / 52 / two unresolved. Complete requested GL/HB/FAN unit and packaged browser checks passed. No HB/FAN source changed.

Evidence:

- [Representation decision, committed before grammar](kindle-named-contained-works-decision.md).
- [Frozen inclusive evidence queue, synthetic controls and model proofs](kindle-named-contained-works-frozen.json).
- [Complete current replay objects and identity probes](kindle-named-contained-works-replay.json).
- [Private full-export writer/backup/API safety](kindle-named-contained-works-safety.json).
- [Offline representation/replay tool](../scripts/audit-named-contents-model.mjs).
- [Offline private-copy safety tool](../scripts/check-named-contents-safety.mjs).

## 2. Current contents-model audit

The authoritative entry validator is [contents.js](../src/lib/contents.js). It accepts 1–2,000 entries, returns only the following six fields, and deduplicates on `contentKey + completeness`.

| Field | Current meaning and validation | Named-work consequence |
| --- | --- | --- |
| `series` | Required text, maximum 500 characters; trailing `(YYYY)` becomes a run. | Existing named proposals put the parent **display title** here. It is not an item reference. Users can edit it freely. |
| `run` | Text, maximum 100 characters; optional. | Defaults empty for discovered named components. A year/run supplied later does not prove parent identity. |
| `unitType` | `issue`, `volume`, `annual`, `special`, `component`. | `component` distinguishes an unnumbered name from an issue, volume, annual or special. It does not distinguish novel, short story, comic story, generic component or game content. |
| `number` | Required text, maximum 80 characters. Issue/volume/annual require bounded numeric, decimal or fractional syntax. | Components store the contained **title** here; no numeric syntax is required. Long names cannot be stored intact. Numeric-looking titles are nevertheless normalized numerically when keyed. |
| `language` | Text, maximum 80 characters, lowercased; optional. | Defaults empty. Missing language prevents complete coverage, but does not prevent exact-key partial coverage. |
| `completeness` | `full` or `excerpt`; default `full`. | Extent, not identity or book-level completeness. Only full entries enter owned coverage. |

An existing Alpha proposal can be represented as:

```json
{"series":"Collection A","run":"","unitType":"component","number":"Alpha","language":"","completeness":"full"}
```

This does **not** pretend Alpha is an issue. It also cannot structurally say “novel,” identify its author/edition, or enforce which actual collection owns this assertion. Literal source can explain the type; a separate bibliographic Work entity is unnecessary.

There is no accepted per-entry parent reference, media type, source claim, qualifier list or bibliographic identifier. A probe supplied `parentItemId`, `workType`, `sourceClaim` and `qualifiers`; validation discarded them. Merely adding these fields to parser output would not persist their semantics.

Verified reviews are stored at `database.contentReviews[parentItemId]`, one review per item. Their accepted fields are entries, statement (10,000 characters), source URL, source label (100 characters), and verification timestamp. The statement validator compacts whitespace, including source newlines. Source-generation-5 manifest blocks preserve original line boundaries separately; a saved verified review is not itself a lossless copy of those boundaries or per-entry offsets.

[Storage save](../src/background/storage-writer.js) permits reviews for current **book or game** records and replaces the prior item review. [Database validation](../src/lib/models.js) and [backup/restore](../src/lib/storage.js) validate these same fields. Old reviews survive today; no migration or compatibility change was made.

## 3. Named-work identity semantics

The intended assertion is: **this source says this particular parent contains material named Alpha**. Verification can confirm that inclusion. It cannot establish global equality with every Alpha, a standalone purchase, canonical grouping, author, ISBN, edition or issue number.

Current `contentKey` is:

```text
[identityKey(series), identityKey(run), unitType, numeric-or-literal(number), identityKey(language)]
```

`identityKey` folds case, Unicode presentation and punctuation for the scope fields. The component name is ordinarily literal after text validation; it does **not** use ordinary book-title edition stripping. Thus Alpha and Alpha: Special Edition remain distinct. Alpha and alpha also remain distinct today. Numeric equivalence is the exception: `01` and `1` share a key. Parent labels Collection: A and Collection A share a key too.

The parent provider item and full review remain attached to the index's evidence value, but are absent from identity. Evidence provenance can therefore identify where an assertion came from while the lookup key still incorrectly equates assertions from different parents.

The safe future key needs an enforceable parent-record scope plus conservatively preserved named identity. The parent reference must be derived/validated against the review's owner, not trusted because an incoming component supplies an arbitrary ID. The source claim explains inclusion and attribution; it is not a global work identifier. Parent media scope must be honored too. Within one parent, deduplicate equivalent literal names without erasing edition wording or interpreting titles as numbers. Across parents, equality needs stronger separately reviewed identity evidence; shared title alone is insufficient.

### Verified behavior, traced through the actual API

| Request / condition | Observed current behavior |
| --- | --- |
| Ordinary book request `Alpha`, before and after verifying Alpha in Collection A | Identical; not Owned, no synthetic constituent title enters the ordinary index. |
| Explicit component Alpha with `series=Collection B`, when only Collection A is reviewed | No coverage. Different labels currently protect this case. |
| Explicit component Alpha with the same Collection A label but a different actual parent | Exact-key covered; one covered entry and a contains partial match. Parent identity is not checked. |
| Same request with missing run/language and `contentsComplete=true` | `complete=false`, Owned false, one partial match. Missing fields block complete promotion but do not repair identity. |
| Same request with `run=2020`, `language=en`, full extent and `contentsComplete=true` | API accepts it and returns **Owned true**, with reason “All explicitly enumerated requested contents are verified owned.” |
| Two owned parent records with identical labels and Alpha reviews | One index key with two evidence records; `seriesCoverage` reports an overlap. This is not proof of the same work. |
| Owned game parent with that verified component; explicit offered book request | API returns **Owned true**. Coverage does not check parent media type. |
| Alpha: Special Edition requested against reviewed Alpha | No exact coverage; edition wording is preserved. |
| Verified excerpt or parent with insufficient effective ownership | Excluded from owned-content index. Existing ownership policy/manual access overrides still apply unchanged. |

The reproductions use synthetic records and accepted API requests, not a claim that the motivating real bundles currently send these particular named-component requests. FAN accepts component metadata and both companions use central contents coverage; future scope cannot rely on callers never exercising an accepted contract. No HB/FAN implementation change was made.

## 4. Frozen real-evidence population

Baseline commit: `4ac1bfd`. Read before deciding: current model/validation/indexing/matcher/API, parser/filter, manifest discovery/interpretation, evidence-review helper, editor/save path, backup validation, and the independent-secondary, whole-manifest, source-capture and parser-v4 reports/tests.

Read-only input: Downloads `galactic-library-backup-v1 (2).json`, exported `2026-10-05T00:48:15.011Z`; SHA-256 `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`. The private dataset has 14,081 provider records and 1,520 saved Kindle statements. Latest **already captured** sources for 95 URLs overlay the statement corpus; nothing was fetched to fill gaps.

Captured replay: 77 pilot generation-4 observations, 25 experiment generation-4 observations, 25 generation-5 observations, and 10 existing fixtures: **137**, with 127 real observations across 95 URLs. Repeated generations are not separate books.

The audit freezes an intentionally inclusive queue of **401 saved rows** and **71 captured/fixture observations** with count/list/quote/apparatus evidence, existing components, or independent claims. These are **not 401 accepted finite named-work claims**, and were not all manually approved. Literal triggers/context, exact statements, current proposals/unresolved text, captured blocks/windows/coordinates and implementation hashes are retained. The previous complete 137-observation frozen ledger remains authoritative for excluded candidate details too.

The broad text tags are review selectors, not production classifiers. For example, “VOL. 2 stories” in contributor prose can look count-like; that row remains Filtered. No source tag authorizes parsing, promotion or ownership.

## 5. Pattern taxonomy

Counts below overlap and describe the saved review queue, not accepted works.

| Audit tag | Rows | Interpretation |
| --- | ---: | --- |
| Count plus work/type wording | 4 | Code, Dragon Blood, and two negative cases: Injustice contributor prose and Mystery Series promotional catalogue. |
| Non-hash comma/semicolon/conjunction text | 361 | Broad inclusion of plausible names and numerous false positives/unsupported volume syntax. |
| Quoted strings | 53 | Quotes preserve punctuation, but do not establish containment alone. |
| Attribution or extent (`from`) | 64 | Includes source attribution, excerpts and unrelated prose; not interchangeable meanings. |
| Mixed numbered review | 28 | Named/numeric relationships need scope and overlap review. |
| Apparatus review | 26 | Scripts, sketches, introductions, essays and related evidence; no new type inferred. |
| Promotion review | 14 | Trailing or generic marketing is unresolved evidence, not a constituent. |
| Terminal Read more | 21 | Possible premature/incomplete source extraction, not disposable garbage. |
| Preserved source lines in selected saved statement | 1 | Dragon Blood; captured full blocks elsewhere also contain lines. |

The bounded manually inspected named population includes Code/Hellboy/Dragon, all four JLA controls, Sherlock and script controls, and every **currently generated component** in the 1,520-record primary replay: **11 entries across three records** (six Elseworlds Superman, four Thor, one Hunger excerpt). The broader queue remains frozen for a future approved grammar pass.

## 6. Representation decision

**C, current model cannot safely ship the requested new named-work semantics yet.** This does not mean GL cannot ever represent them. A small coordinated extension is feasible; it was not silently implemented during a task that permits stopping at the unsafe-representation gate.

The smallest prerequisite should:

1. Keep `component` as a generic named inclusion, rather than create a universal Work database or pretend every story is an issue.
2. Enforce parent-record scope in verified indexing/coverage. Parent display titles may remain useful labels, but cannot be the identity boundary.
3. Treat component names as titles, including numeric-looking names; preserve edition/punctuation distinctions conservatively.
4. Define the external request/result contract for scoped components. Carry validated scope or explicitly decline global identity/Owned promotion when scope is unavailable. Ordinary numbered coverage must keep its existing contract.
5. Preserve old backups and reviewed entries. Legacy components need safe local interpretation and readable/editable provenance, without inventing a global work identity or destructively migrating unrelated reviews.

`unitType=work` alone is not enough: without parent scope, the same false equality survives. A parser-only parent property also fails because current validation discards it and current API serialization cannot carry it. No need to add inferred authors, ISBNs, editions or a separately owned title.

## 7. Grammar design

**Design constraints recorded; no new grammar implemented.** Parser remains 4. Once the representation prerequisite is reviewed, a bounded grammar can require an explicit containment/reprint verb and a finite list, optionally with a count/type noun. It should not parse arbitrary capitalized prose, creator lists or quoted strings without containment.

Count is a consistency check, not an instruction to invent or truncate names. Exact recovered count may support the segmentation; disagreement must preserve unresolved evidence. Read more and meaningful tails prevent an unjustified Full even when some supported names can be proposed.

Current `proposeContentsForReview` first assesses quality, returns no entries for Uncertain/Filtered input, then tries numeric discovery. A named fallback accepts finite lists only if no unsupported numeric syntax remains. Existing finite quoted numeric-clause components and bounded novel excerpts are also supported. These existing paths were not rewritten.

## 8. List segmentation rules

Future rules must use quoted/semicolon/list boundaries and explicit semantic/count context, retaining raw evidence. A newline by itself is insufficient. A count can disambiguate some segmentations but cannot establish arbitrary hidden title boundaries.

Existing parser-4 characterizations, retained as audit fixtures:

| Input | Existing result | Meaning for future work |
| --- | --- | --- |
| Contains four novels: Alpha, Beta, Gamma, and Delta. | Failed, zero | Count/type prefix unsupported. |
| Contains four novels: Alpha, Beta, and Gamma. | Failed, zero | No invented fourth; parser 5 not implemented. |
| Contains “Batman, Incorporated” and “Other Work”. | Full, two literal components | Quotes preserve the internal comma. |
| Contains “The Lion, the Witch and the Wardrobe” and “Other Work”. | Full, two literal components | Quotes preserve internal comma/conjunction. |
| Contains Alpha, “Beta”, and Gamma. | Failed, zero | Mixed quote/unquote grammar unsupported. |
| Contains Something, Something and Something Else. | Full, two after duplicate-name removal | **Existing ambiguous segmentation**, not a future safety success: boundaries and duplicate meaning are not established. |
| Novels / Alpha / Beta / Gamma as bare lines | Failed, zero | Does not become a global title extractor. |

The last ambiguous Full is an additional pre-existing parser limitation to handle in a scoped grammar task. It was documented rather than hidden or patched out of scope. Ampersands and title-internal conjunctions such as Love, Death & Robots must not be treated as automatic separators. Current protection for comma INC. and repeated colon-title stems remains intact.

## 9. Source-attribution semantics

`Reprinting A, B, and C from X and Y` has two roles: A/B/C may be contained material; X/Y describe its source. Identical words on both sides do not erase those roles. Preserve the attribution clause and unresolved scope rather than adding source collections as constituents.

Current raw Hellboy evidence survives, while parser input normalizes reprinting to Collects. No new attribution grammar was added. Synthetic reprinting/quoted-attribution cases remain unresolved under parser 4. A direct reprinting string does not acquire manifest normalization unless it goes through the existing manifest path.

`Collects Series X #1-5 and stories from Annual #1` remains Full with five full Series X issues and an **excerpt** Annual entry. Full here describes the parse, not full extent of every entry. This existing numbered excerpt handling was replayed unchanged and must survive future attribution work.

## 10. Code Breakers before/after

Provider `kindle:B017Y9MBI8`, Code Breakers Complete Series: Books 1-4; `sample-5-370`. Source offsets are zero-based, end-exclusive.

Primary `[181,314)`:

```text
Containing all four novels of the series, this box set will delight fans of gritty post-apocalyptic fiction, with a cyberpunk flavor.
```

Exact independent claim `[884,1084)`:

```text
Contains four full length novels: Alpha, Beta, Gamma, and Delta with a special offer included inside (at the end of the book).
** Download today for Free for Kindle Unlimited subscribers. **
Read more
```

| Evidence | Before | After this audit |
| --- | --- | --- |
| Generic primary | Failed / 0 / 1 unresolved | Identical |
| Independent named claim | Uncertain / 0 / 1 unresolved | Identical; still loadable for review |

Human source assessment: four literal novel names, Alpha/Beta/Gamma/Delta, under explicit containment and count four. They are justified as **parent-local named evidence**, not global work identities. The special offer and subscriber promotion are not constituents. Count/list boundaries and the tail can be handled by generalized future rules; no title/ASIN rule is justified. A future Partial with four scoped proposals and retained promotion/incompleteness is plausible, **not an implemented result**. Terminal Read more remains evidence of possible incomplete capture.

## 11. Hellboy before/after

Provider `kindle:B07BJKXP63`, Hellboy Omnibus Volume 1: Seed of Destruction; `sample-5-629`.

The first paragraph's candidate `[712,826)` says `collect all of Mignola's award-winning Hellboy stories in chronological order for a definitive reading experience.` Its full context concerns four omnibus volumes plus two Complete Short Stories volumes, rather than just this item.

Exact later candidate `[895,1066)`:

```text
reprinting Seed of Destruction, Wake the Devil, and "Wolves of St August," "The Chained Coffin," and "Almost Colossus," from The Chained Coffin and The Right Hand of Doom.
```

Both primary and later candidate remain **Failed / 0 / 1 unresolved**. Neither is promoted. The later paragraph explicitly concerns this 368-page volume and supports five candidate names: Seed of Destruction, Wake the Devil, Wolves of St August, The Chained Coffin, Almost Colossus.

`from The Chained Coffin and The Right Hand of Doom` remains source attribution, not two extra components. The Chained Coffin's repeated occurrence has distinct semantic roles. Quotes contain list punctuation; a future grammar must distinguish punctuation from name content conservatively and retain ambiguity about which material came from which source. It must not use external Hellboy bibliography. Five reviewable scoped proposals with unresolved attribution may be justified after scope exists; no such result is claimed here.

## 12. Dragon Blood result

`sample-5-1264`, The Dragon Blood Collection, Books 1-3. Exact selected source `[729,857)`:

```text
includes three full-length novels of action, magic, and romance:
Balanced on the Blade’s Edge
Deathmaker
Blood Charged
Read more
```

Before/after **Uncertain / 0 / 1 unresolved**. The surrounding explicit three-novel inclusion and colon give stronger support than visual lines alone: the three following retained lines plausibly identify the novels. Action, magic and romance describe subject matter, not three works. Future segmentation should use this entire structure and count, preserve the apostrophe, and retain Read more uncertainty. Current compact parser input loses the line separators' structural role; source generation 5 still preserves the literal lines. No newline-to-title rule or cleanup was added.

## 13. JLA overlap result

All four captured JLA controls remain unchanged. Vol. 1's primary is Full / 12; volumes 2–4's attribution-heavy primaries remain Failed / 0. The separate classic-tales candidates remain Uncertain / 0.

Vol. 1 names Doom of the Star Diamond, The Slave Ship of Space, and Starro the Conqueror! after a primary collecting Brave and the Bold #28–30, Justice League of America #1–8 and Mystery in Space #75. The other three volumes have their own exact named tales in the frozen source. These are legitimate named containment claims, not demonstrated bonus material. The source does not map the names to numbered issues or prove they add content.

Therefore: **no named additions, unions, external mappings, auto-deduplication or primary downgrades**. A future parser needs an overlap-risk escape hatch based on captured context, not a JLA name/ASIN rule. Preserving a name as review evidence does not establish an additional unit.

## 14. Apparatus controls

100 Bullets Book Two's original script for The Mimic from issue #20 remains zero-entry unresolved evidence; it does not become an ordinary full work or issue. Sketchbook/cover-gallery/essay/introductory apparatus likewise receives no new proposals or type. Quoted script names alone are not sufficient.

Sherlock remains **Filtered / 0**, with its eight named works preserved in captured blocks but outside current discovery. This is a structural-discovery control, not an invitation to parse the entire description or manufacture candidates. No apparatus or Sherlock work was implemented.

## 15. Full 1,520-record replay

| Metric | Before | After |
| --- | ---: | ---: |
| Parser | 4 | 4 |
| Records | 1,520 | 1,520 |
| Primary proposals | 12,172 | 12,172 |
| Unresolved fragments | 928 | 928 |
| Full | 769 | 769 |
| Partial | 191 | 191 |
| Failed | 217 | 217 |
| Filtered | 245 | 245 |
| Uncertain | 98 | 98 |
| Changed records / new named records | 0 | 0 |
| Exact additions / removals | 0 | 0 |
| Independent promotion / aggregation | 0 | 0 |

137 captured observations likewise retain **1,114 proposals / 84 unresolved**, Full 69, Partial 26, Failed 18, Filtered 3, Uncertain 21. All current source selections match the prior JSON-frozen ledger. Both complete replay passes compare full proposal, source and derived review objects, not just counts.

Historical parser-4 comparison independently matches **all 1,520 complete objects** in the earlier v4 report. Its 12,104-proposal baseline predates the later 95-source overlays and King parent fix; it is not a loss relative to today's 12,172 baseline.

Named proposals added by count/list/attribution grammar: zero, because grammar was not implemented. No implemented count invariant successes/mismatches or parser-5 suppression totals are claimed. All frozen positive/negative/control evidence remains available for that future pass.

## 16. Changed-record manual review

There are **zero changed real proposal records**. Thus no changed-record queue or undocumented loss exists. The motivating claims, four JLA cases, Sherlock/apparatus, all current primary components and the four broad count-tagged rows were inspected in their actual retained context. The full 401-row queue is an inclusive frozen search result, not a manual approval of every statement.

Every current component in the saved primary replay:

| Record | Exact supported names / scope | Result retained |
| --- | --- | --- |
| Elseworlds: Superman Vol. 1 (DC Elseworlds), audit 489 | SUPERMAN: SPEEDING BULLETS; SUPERMAN: KAL; SUPERMAN: DISTANT FIRES; SUPERMAN: A NATION DIVIDED; SUPERMAN, INC.; SUPERMAN: WAR OF THE WORLDS | Full / six. Literal finite inclusion list; INC. comma protection retained. |
| Thor: Ages of Thunder - Collection, audit 1360 | Thor: Ages of Thunder; Thor: Reign of Blood; Thor: Man of War; Thor God-Sized Special | Full / four. Explicit collection list; repeated Thor stem makes the final ampersand boundary supported by existing grammar. |
| A Hunger Like No Other, audit 21 | No Rest for the Wicked | Full / one **excerpt**, under the exact next-romance-novel excerpt statement. Not full-work coverage. |

Code/Dragon counts have actual names in captured evidence; Injustice's count-like match is contributor/narrative prose; Mystery Series's “Collect All 21 Full Length Novels and 15 Short Stories…” promotes a catalogue and reviews without enumerating works. Both negatives stay Filtered. These show why count words alone cannot select safe finite lists.

## 17. Suspicious-generated-name audit

New generated names: **zero**. All 11 existing primary components above were manually inspected. None includes Read more, marketing tails, attribution-source additions, contributor names, generic topics, apparatus names, JLA overlap names or a parent-title duplicate; no long/punctuation-imbalanced names were observed in this small existing component population. No broader bibliographic verification is implied.

Permanent audit characterizations additionally expose an existing ambiguous unquoted list, duplicate removal and numeric-name collision. These are **findings**, not accepted output for a future grammar. No count/list invariant exists in parser 4, so a zero mismatch-finding count must not be misrepresented as evidence of a working count validator. Count mismatch, type/and prefixes, comma/conjunction ambiguity and attribution tails remain explicit future checks.

## 18. Matching/ownership safety

The private writer check restored **14,081 records**, overlaid only existing captured sources, and reparsed all **1,520 statements in 16 local batches**. A pre-existing synthetic verified review makes review preservation meaningful; the real export has no verified contents. Installed extension storage was not accessed.

| Check | Result |
| --- | --- |
| Amazon/source acquisition | 0 requests |
| Original export SHA | Unchanged |
| Verified reviews and owned-content index | Unchanged |
| Ownership states/reviews | Unchanged |
| Ordinary identity metadata | Unchanged apart from expected reparse audit/update fields |
| Canonical grouping, manual decisions, edition separations | Unchanged |
| Ordinary external API probes | 29 successful before/after comparisons, identical |
| Selected source, URLs/dates/generation/manifest | Exact |
| Existing source history | Preserved |
| Backup/restore | All 1,520 enrichment sources and prior review preserved |
| Independent derived review evidence | Identical |

Unverified saved discoveries and editor proposals do not enter ordinary owned-title matching, coverage or canonical grouping; only explicitly saved reviews enter owned-content indexing. Verified bare component names still do not enter ordinary title matching. The **explicit verified coverage** failures in section 3 are separate synthetic counterexamples to the requested new identity contract. Passing unchanged-baseline safety tests does not mean that contract is safe.

The same unsafe explicit-complete API result survives backup/restore: this is not a transient parser/UI artifact. Missing run/language, ownership gating and edition-name separation are helpful existing restrictions, but do not establish parent scope.

## 19. Versioning

Source **5**, parser **4**, filter **1**, schema **12**, manifest interpretation **1**, evidence review **1 derived UI view**, external API **1** remain unchanged. No parser 5, new reparse flag, source refresh or scan plan was added. There is **no new benefit from local reparse in this audit**; the existing reparse machinery was exercised only in a private test copy.

Once a reviewed representation prerequisite and grammar are implemented, parser-only changes can use local saved evidence with zero Amazon requests. That future work must separately decide any scope/API compatibility version; parser version alone cannot version a new identity contract.

## 20. Tests

| Suite | Result this run |
| --- | ---: |
| GL complete unit suite | 387 passed |
| GL packaged Chrome UI | 49 passed |
| GL packaged Firefox UI | 49 passed |
| GL Chrome importer / real DOM | 45 passed |
| GL Firefox importer / real DOM | 45 passed |
| HB complete unit suite | 314 passed |
| HB Chrome / Firefox browser fixtures | 86 each |
| FAN complete unit suite | 363 passed |
| FAN packaged Chrome / Firefox default scenarios | 10 each |
| Historical parser-4 complete-object comparison | 1,520 unchanged |
| Current saved/captured replay, twice | 1,520 + 137, identical complete objects |
| Private full-export reparse/backup/ordinary API probes | All preservation assertions passed |
| Named representation counterexamples | Reproduced, intentionally unsafe; not labeled as passing scope invariants |

No existing tests were weakened. No new parser-5 acceptance tests were added after the representation stop. The frozen synthetic cases are permanent **audit characterizations**, not production tests endorsing unsafe behavior. Existing captured and parser-v4 regressions continue to cover Code/Hellboy/Dragon source, JLA, scripts, Sherlock, King 52/2 with 18 children, Bullets #1–100 once, Knightfall, Ex Machina, TMNT, Earth 2 and Swamp Thing. The new tool covers explicit count/mismatch, protected punctuation, ambiguous unquoted punctuation, mixed quotes, attribution, promotion, Read more, bare structural lines and cross-parent duplicate identity. A future parser implementation still needs the requested A–R acceptance matrix, with safe expected results rather than these old outcomes.

Browser checks use isolated profiles and local synthetic fixture servers. Node audit tools install throwing fetch guards. Local test HTTP traffic is not Amazon/source acquisition. Native test-process permission was required and automatically approved; no signed-in store session was used.

Reproduce from GL:

```powershell
node scripts/audit-named-contents-model.mjs 'tests/fixtures/mock-backup.json'
node scripts/check-named-contents-safety.mjs 'tests/fixtures/mock-backup.json'
npm test
npm run test:browser:release
npm run test:browser:firefox
npm run test:importers:release
npm run test:importers:firefox
```

Audit scripts rewrite their own named-work JSON artifacts only. Production files, user export and installed storage remain untouched. HB/FAN complete `*.test.mjs` suites and their Chrome/Firefox browser scripts were run in their respective repositories.

## 21. Performance

Current audit run: first complete saved/captured replay plus historical assertions **679.30 ms**; second **377.75 ms**. Seven warm complete 1,520-statement parser-only passes: median **108.71 ms**, approximately 0.072 ms per statement. These are local measurements, not Amazon scan timings or a guarantee for every device.

Private full-export writer/backup/API check: **62.60 seconds**, including cloning/validation/history and 16 persistence batches under concurrent browser validation. It is not a pure-parser benchmark. Parser-5 impact is **not applicable** because no parser implementation changed. Existing source/candidate limits and bounded processing remain unchanged; no external lookups or fuzzy matching were introduced.

## 22. Files changed

Audit tooling only:

- `scripts/audit-named-contents-model.mjs`: inclusive evidence freeze, complete deterministic replay, historical comparison, synthetic model/coverage/API counterexamples, parser characterization and current performance.
- `scripts/check-named-contents-safety.mjs`: existing full private-copy writer/backup/API checks, reporting to a separate named-work artifact without overwriting prior audit results.

Documentation/evidence:

- This report and `docs/kindle-named-contained-works-decision.md`.
- `docs/kindle-named-contained-works-frozen.json`.
- `docs/kindle-named-contained-works-replay.json`.
- `docs/kindle-named-contained-works-safety.json`.

No production code, schema, runtime packaging, tests, source acquisition, ordinary matching, grouping, ownership, HB or FAN changes. Unrelated GL `start.txt` and FAN reconnaissance files remain untouched. Test logs are in the shared `D:\projects\logs` directory; GL-specific documentation and scripts are inside GL.

## 23. Commits

- `9147c8a` — Audit named contents representation and freeze unsafe scope evidence; decision and full offline baseline committed before any possible grammar change.
- `d0d3aa0` — add the cross-media counterexample and unchanged-baseline private safety results/tool.
- Final report commit — this 25-section report and validation conclusions, recorded in git history.

No HB/FAN commit was made.

## 24. Remaining limitations

This deliberately stops at representation. It does not solve the verified coverage findings, count-prefixed grammar, mixed attribution, overlap, apparatus or structural discovery. Parser 4's finite-name fallback also accepts some ambiguous unquoted lists; the synthetic characterization records that limitation rather than claiming it is safe.

The inclusive queue is not an exhaustive semantic census of every real named work. Most corpus rows have only a saved selected statement; missing page descriptions cannot be reconstructed. Full remains local parse completeness, not a guarantee of complete book contents. Read more may reflect incomplete hydration/capture and was preserved. One review per parent still means explicit save replaces that review; no multi-claim aggregation was added.

The demonstrated false Owned results require explicit complete contents requests plus reviewed full entries and populated scope fields. They do not show a real Code/Hellboy/FAN bundle taking that path today. They do prove the current accepted coverage contract fails the proposed parent-local semantics, even with verification and backup validation.

## 25. Recommendation for next work

Review and implement **enforceable parent scope for named components** first, with compatible legacy reviews/backup/API behavior, literal numeric-name preservation and cross-media safeguards. This is a small contents-contract task, not an ordinary matching redesign or universal Work catalogue.

After that prerequisite, return to the frozen Code/Hellboy/Dragon evidence for bounded count/list/attribution grammar. Keep independent claims separate, preserve promotion/Read more and attribution, leave JLA overlap unresolved, and keep Sherlock/apparatus out of scope. Only then increment parser 4 to 5 and run the full requested acceptance/replay/manual-name-audit matrix.

**Stopped under the request's unsafe-representation condition. No parser 5, Amazon requests, refresh/population scan, automatic secondary promotion, new discovery experiment or subsequent feature work was started. Await review.**
