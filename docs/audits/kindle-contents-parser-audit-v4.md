# Kindle contents parser audit — generation 4

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

## Final result

The bounded parser changes recover **594 net source-supported proposals**, while correcting **19 manually confirmed defective Full manifests**. Twelve of those become Partial; seven retain Full only after correcting labels, unit type, or excerpt scope. Full growth alone is not the success criterion. Every proposed unit remains unverified until explicit review.

The replay covers all 1520 statements: 97 records gain proposals, 33 lose or replace prior proposal keys, 785 units are added and 191 removed. A change to run, type, or completeness counts as removal plus addition, even when the printed number survives. No real library data or export was changed.

Parser version is **4**; extractor remains **4**, filter remains **1**, and database schema remains **12**. A parser upgrade does not mean an Amazon source refresh. Historical source metadata here is generation 1/legacy (148) and generation 2 (1,295), plus 77 captured generation-4 selections; “parser 3 baseline” must not be confused with source generation 3.

## Pre-change audit

The complete saved corpus was audited before production changes. The read-only source is the October 5 export (`galactic-library-backup-v1 (2).json`, SHA-256 `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`). The 77 committed generation-4 pilot selections replace their historical fragments for this comparison; their primary source and parser input are frozen, not rediscovered or ranked again. The remaining 1,443 statements use their original saved evidence. No Amazon requests were made.

Parser 3 baseline: **1,520 statements; 710 Full, 191 Partial, 273 Failed, 248 Filtered, 98 Uncertain; 11,510 proposed units; 1,012 unresolved fragments**. A frozen copy of parser 3 and the complete baseline comparison are committed separately. Outcomes describe unverified proposals, not ownership.

### Failure taxonomy

Overlapping grammar tags (not mutually exclusive populations):

| Family | Records | Full | Partial | Failed |
| --- | ---: | ---: | ---: | ---: |
| Run/volume before issue marker | 5 | 0 | 3 | 2 |
| Bare/contextual initial range | 95 | 6 | 16 | 73 |
| Annual/special | 222 | 138 | 53 | 31 |
| Mixed numbered/named | 202 | 36 | 129 | 37 |
| Named/non-numbered collection | 140 | 12 | 2 | 126 |
| Dated run | 392 | 298 | 85 | 9 |
| Excerpt scope | 145 | 77 | 62 | 6 |
| Miniseries/one-shot mention | 40 | 2 | 9 | 29 |
| Adjacent prose | 66 | 6 | 13 | 47 |
| Other numbered | 363 | 313 | 17 | 33 |

248 filtered and 98 uncertain statements are source/quality problems rather than numeric grammar failures. Failed named evidence often lacks delimiters or identities: a count of novels, a concatenated list, plot inclusions, and a creator's catalogue are not enough to manufacture constituents. Partial manifests also include legitimate but unidentified supplements, uncertain scope, and marketing after a clear range.

The five `vol. N #…` records fail because the parser treats the earlier volume marker as the constituent number rather than a run qualifier. The issue number remains trailing unsupported text. Bare ranges have no series unless generation-4 source context has already supplied one. A product title with an explicit series-plus-volume/book designation or unambiguous series metadata can provide bounded identity; a generic title cannot.

### Suspicious Full taxonomy

The label scan flags **51** Full records. This is a review queue, not a count of bugs. Commas in `Peter Parker, The Spectacular Spider-Man`, `Doctor Strange, Sorcerer Supreme`, `Aliens, Earth War`, and conjunctions in `Batman and Robin` are legitimate. Blanket punctuation rejection would regress them.

Confirmed defect families include neighboring named works absorbed into numeric labels (actual Hellboy 1954, Spider-Man/Wolverine, Civil War, Thanos, X-Men), narrative/credit prefixes absorbed into series (Batman Road to No Man's Land, Dead Boy Detectives, Kamandi), scope prefixes overstated (Batman Gaiman stories, Deadman backups), unnamed Special absorbed into the next series (Star Wars Droids), and annual years invented as issue numbers (TMNT/Thunderbolts). Ex Machina's named supplement plus Special is a permanent guard even where the generation-4 selection has already corrected it. Existing source uncertainty must remain visible when grammar cannot separate titles safely.

## Rules implemented

1. Explicit series + `vol./volume N` + `#…` is an issue range with an explicit `volume N` run qualifier. Parenthesized run qualifiers are also supported; discontinuous continuations preserve that run.
2. A bare initial hash/issue range can bind to one explicit product-series metadata value or an exact series-plus-volume/book product title. Multiple series, conflicting labels/runs, generic collection titles, and edition/creator/marketing prefixes are refused. No partial-word or catalogue inference is used. An explicit `of OTHER SERIES` is never overwritten.
3. The binding basis and input are retained as `parseBinding` and `parseInput`. The original statement, source URL, checked date, and extractor generation remain unchanged. The review editor explains contextual input on demand. Editing the saved statement does not reuse captured manifest normalization or automatic product-title binding.
4. Bounded segmentation handles numeric ampersands, serial `, and`, typed unnumbered supplements, and repeated colon-title stems. Named supplements remain unresolved unless a finite quote or supported name enumeration identifies them. Miniseries references never imply unstated issue counts.
5. Ambiguous neighboring comma labels and contributor/possessive conjunction labels stay unresolved. Literal appositions, protected comma/ampersand titles, and a complete label explicitly corroborated in the product title remain supported. The first ambiguous comma label is guarded too; the rule does not depend on a preceding issue.
6. Explicit date ranges move into discovery run fields. A trailing dated Special retains its special type. `the Annual #N` can inherit the explicit current series. Unprefixed annual/special/calendar years are not invented numeric unit identities; explicit `Annual #2000` remains a number.
7. `stories from`, backups, short stories, selected material, and `pages from` preserve excerpt scope. Attribution in a bounded `X’s run on SERIES` clause is not part of the series identity. Ambiguous scope after a semicolon still stays unresolved until explicitly reset.
8. Explicit named non-comic contents remain supported. The real Kresley Cole next-novel excerpt becomes a named **excerpt**, not the complete novel. Named counts, concatenated names, topics, and author catalogues remain unresolved.

## Source-selection compatibility

Discovery and ranking algorithms were not changed. A regression fixture proves improved parsing can change a candidate winner: `First Series vol. 1 #1-5` becomes stronger than a previously selected `Other Series #1-2` clause. Previously, backup validation would rerank it and silently change selected-source metadata. The small compatibility fix keeps an exact source-backed window, matching block, offsets, and raw text, while recomputing bounded inputs/ranks. Forged inputs and non-source selections remain rejected/ignored. Fresh acquisition still uses the existing selection algorithm. None of the frozen 77 pilot selections changed under current ranking, but the permanent upgrade fixture demonstrates the preservation requirement.

## Rules deliberately not implemented

No Amazon requests, refreshes, sleeps, hydration waits, pacing/retry/checkpoint changes, discovery redesign, comic gates, franchise rules, external catalogue lookups, or schema redesign were introduced. Ambiguous supplements are not automatically attached to a franchise or assigned #1. Edition words are not silently removed to guess a series. Concatenated novel names receive no invented delimiters. Negative issue numbers and dated newspaper-strip intervals remain unsupported. Plot/marketing text is not discarded merely to obtain Full.

Terminal `Read more` still signals possible incomplete capture. Parser-only normalization does not recover an omitted later Collects sentence, and a Full parse describes the saved candidate rather than promising complete product-page coverage.

## Complete offline matrix

| Metric | Parser 3 | Parser 4 |
| --- | --- | --- |
| full | 710 | 765 |
| partial | 191 | 191 |
| failed | 273 | 218 |
| filtered | 248 | 248 |
| uncertain | 98 | 98 |
| Proposed units | 11510 | 12104 |
| Unresolved fragments | 1012 | 933 |
| Full label-scan flags (review queue) | 51 | 43 |

| Transition | Records |
| --- | --- |
| failed -> failed | 217 |
| failed -> full | 47 |
| failed -> partial | 9 |
| filtered -> filtered | 248 |
| full -> failed | 0 |
| full -> full | 698 |
| full -> partial | 12 |
| partial -> failed | 1 |
| partial -> full | 20 |
| partial -> partial | 170 |
| uncertain -> uncertain | 98 |

Records gaining exact proposal keys: **97**. Records losing exact keys: **33**. Added: **785**; removed: **191**. The JSON contains every exact added/removed entry and every old/new proposal, including run, type, language and completeness.

Overlapping family results (Full / Partial / Failed). Filtered and Uncertain families are shown separately; rows must not be summed:

| Family | Records | Before F/P/Fa | After F/P/Fa | Added / removed |
| --- | --- | --- | --- | --- |
| adjacent-prose | 66 | 6 / 13 / 47 | 6 / 13 / 47 | 37 / 23 |
| annual-special | 222 | 138 / 53 / 31 | 147 / 53 / 22 | 164 / 48 |
| bare-context | 95 | 6 / 16 / 73 | 51 / 13 / 31 | 352 / 6 |
| dated-run | 392 | 298 / 85 / 9 | 297 / 90 / 5 | 99 / 49 |
| excerpt-scope | 145 | 77 / 62 / 6 | 80 / 62 / 3 | 178 / 86 |
| mixed-numbered-named | 202 | 36 / 129 / 37 | 30 / 139 / 33 | 192 / 113 |
| named-collection | 140 | 12 / 2 / 126 | 13 / 2 / 125 | 1 / 1 |
| named-mini-oneshot | 40 | 2 / 9 / 29 | 1 / 11 / 28 | 11 / 3 |
| non-containment | 248 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 |
| other-numbered | 363 | 313 / 17 / 33 | 319 / 15 / 29 | 68 / 16 |
| run-volume | 5 | 0 / 3 / 2 | 3 / 2 / 0 | 81 / 0 |
| uncertain-source | 98 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 |

## Safety and suspicious Full review

The 51 → 43 label-scan flags are not defect counts. All remaining 43 flagged Full results are included below: genuine conjunctions, comma appositions, literal Special Series titles, and long explicit Star Wars/Sandman titles. Nineteen manually confirmed defective baseline Full manifests were corrected; **zero of those confirmed defects remains**. Fifteen involved malformed labels; the other four were dated Special type or annual/special-year identities. This is a bounded source/grammar audit, not external bibliographic verification of every proposal.

The eleven curated mixed-supplement cases had unresolved evidence in 4 cases before and 11 after. Increased visibility is intentional: an ambiguous named work is safer as unresolved evidence than concealed inside a fabricated numeric label.

The actual storage writer reparsed **1520 statements in 16 local writes**, using a private copy containing 14081 provider records and the 77 captured source overlays. The export has no verified contents; a pre-existing synthetic review was added only to the isolated copy so review preservation was tested meaningfully.

| Check | Result |
| --- | --- |
| Amazon/network requests | 0 |
| Verified review changes | 0 |
| Ownership/ordinary item identity changes | 0 |
| Canonical grouping / decisions changes | 0 |
| Statement / URL / checkedAt / extractor / manifest source changes | 0 |
| Ordinary parser comparisons | 1,520 identical |
| Companion API comparisons | 24 identical before/after |
| Reviewed coverage evidence | Identical |
| Backup round trip | Preserves sources, parse input/basis and verified review |

Reparse changes parser status, enrichment audit history/selection references, and the existing record update timestamp. These expected audit changes are distinct from acquisition dates, source refresh, identity, and ownership. All unverified proposals remain outside ordinary owned-title indexing. Explicit other-series and excerpt preservation are asserted by permanent regressions, the prior 120 excerpt-risk fixtures, and individual review of every removed key.

Two complete final replays produced byte-identical JSON, SHA-256 **b1fbe09d3360062a9bdef421bc81d877c353a2b246d1021a3cb9ca46bfb5bee8**. Runtime timing and random storage-history IDs are excluded from the deterministic comparison artifact.

## Permanent regressions and validation

48 real saved-source fixtures plus 9 focused grammar/integration tests cover the requested Knightfall, Ex Machina, actual Hellboy, Earth 2, Swamp Thing, named non-comic excerpt, secondary-series, annual/special, discontinuity, excerpt and false-Full families. Knightfall 2 has all **27** explicit units. Ex Machina has nine primary issues plus Special #3 and explicit unresolved Inside the Machine. Hellboy preserves two Black Sun issues and the entire ambiguous neighboring claim. Negative controls cover generic/conflicting anchors, first comma labels, concatenated novel names, unsupported counts, creator lists, calendar years, parts, and source-selection forgery.

| Suite | Passed |
| --- | --- |
| GL complete regression suite | 383 |
| Packaged Chrome review/options UI | 49 |
| Packaged Chrome importer lifecycle | 29 |
| Packaged Firefox review/options UI | 49 |
| Packaged Firefox importer lifecycle | 29 |
| HB matching regressions | 210 |
| FAN matching regressions | 209 |

## Performance

Ten alternating warmed passes over all 1,520 statements: parser 3 median **98.05 ms**, parser 4 **112.61 ms** (0.0741 ms per statement). The roughly 14.56 ms added per complete corpus is small relative to acquisition/storage work; no performance optimization or networking changes were needed. Cold combined old/new comparison was about 370 ms. The full isolated writer/backup/24-query checks took 53 to 61 seconds, including cloning and 16 existing persistence operations; that is not pure parsing time.

## Remaining limitations and next bounded source experiment

Vengeance of Bane, Inside the Machine, Curse of the Crimson Corsair, unnamed Specials, miniseries and year-based annuals are structured only when existing grammar supplies a finite explicit identity; otherwise they remain evidence. Some clear ranges adjacent to narrative introductions or multiple named works are intentionally not salvaged independently when segmentation remains ambiguous. Non-comic sources with explicit delimiters work; Dragon Blood concatenation, Wool’s unnumbered count, Neverwhere plus neighboring prose, and investment topics remain unresolved. Context-derived labels must still be reviewed; a series-plus-book product title is source support, not an edition/contents verification.

After reloading GL, choose Reparse saved text in the Kindle panel?s Contents discovery menu to apply parser 4 locally. No refresh is required for these grammar changes. For a future extractor/source-quality experiment, recommend at most 20–30 records with demonstrable missing or concatenated source text, including incomplete-description evidence and non-comic named works. Establish a concrete capture/serialization improvement first; repeating unchanged acquisition is not a remedy for unresolved grammar. Do not treat the broad 642-candidate or 3,194-page populations as the next experiment. No next population was selected or fetched here.

## Changed files and commits

- Production: `src/lib/contents.js`, `kindle-contents.js`, `kindle-manifest.js`, `metadata-validation.js`, `enrichment-workbench.js`, and `src/ui/contents-editor.js`.
- Tests: `tests/contents-parser-v4.js`, `tests/run.js`, frozen parser-3 snapshot and real parser-4 corpus fixtures in `tests/fixtures/`.
- Offline tools: corpus loader, comparison, review annotations, writer safety check, benchmark and this report renderer in `scripts/`.
- Artifacts: this report, complete baseline-v3/comparison-v4 JSON, safety-v4 and performance-v4 JSON (historically in `docs/`; now local under `audit-artifacts/kindle/`). No HB/FAN changes; unrelated `start.txt` was left alone.
- `eb3574a`: pre-change corpus audit and frozen parser-3 baseline.
- `c7cb155`: bounded grammar, source-selection preservation, context provenance, and permanent regressions.
- `bb8818b`: additional generic-volume/omnibus negative controls; corpus results remain identical.
- Final audit/artifact commit: identified by `git log --follow -- docs/audits/kindle-contents-parser-audit-v4.md` (the commit contains this document, so its own hash is not embedded).

Reproduce offline:

```powershell
node scripts/audit-contents-parser.mjs '<path-to-backup>' audit-artifacts/kindle/kindle-contents-parser-audit-v4.json
node scripts/check-contents-parser-safety.mjs '<path-to-backup>' audit-artifacts/kindle/kindle-contents-parser-safety-v4.json
node scripts/benchmark-contents-parser.mjs '<path-to-backup>' audit-artifacts/kindle/kindle-contents-parser-performance-v4.json
node scripts/render-contents-parser-audit.mjs
```

## Archived per-record review

The generated item-level review appendix is retained locally under ignored audit artifacts. Permanent parser regressions preserve the minimal bug evidence.
