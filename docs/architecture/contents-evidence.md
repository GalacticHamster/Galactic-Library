# Contents evidence and identity boundaries

Identity confidence and ownership/access confidence are separate. Provider presence is not proof of a purchase. An ownership override changes effective access classification while retaining observed provenance; it does not identify an edition or contained work.

Contents discovery produces **unverified proposals**, not owned standalone titles. Local series coverage and collection comparisons use automatically inferred full issue/annual/special entries from effectively owned/claimed parents by default. Manually confirmed contents take precedence. Excerpts never establish full-unit coverage. Ordinary title matching does not index proposed or verified component names as standalone library items; the companion API retains its reviewed-only contents behavior.

## Inferred local coverage

`inferred-coverage.js` supplies an evidence index to the existing `contentCoverage` and `seriesCoverage` evaluators; it does not store a second library or change ownership. `collectionContents` reinterprets the current selected source with parser 6 and the existing manifest/source-context handoff. It never unions independent claims or reads historical attempts as current contents. Library/Contents previews use that same interpretation lazily.

Confidence and identity scope are independent: evidence is `verified` (human review), `inferred` (automatic proposal), or `direct` (an effectively owned, explicitly numbered standalone issue). Unsupported/named material, excerpts and unparsed fragments remain unresolved for comic issue coverage. Full issue keys retain literal series, run, type, normalized number and language. Missing run or language creates useful source-local provisional coverage, not definite cross-parent overlap or missing-issue suppression. Explicit conflicting runs/languages never become Possible through these tools. No run, language, alias or chapter-to-issue conversion is invented.

Fully scoped keys deduplicate across supporting parents; verified evidence wins over inferred evidence for the displayed confidence while both parent references remain. Provisional totals are source-local candidates, not distinct global issues. Their numerical holes are possible gaps only. Effective ownership, expiry and preferences are evaluated on each use; raw access provenance is retained. Read-only coverage creates neither provider observations nor separate acquisitions.

The existing `contentReviews` map also accepts an explicit `status: 'rejected'` review with an empty entry list. Ordinary accepted/corrected reviews still require valid nonempty entries. A rejection blocks all automatic suggestions for that provider record until explicit undo or a corrected review; it survives imports, local reparsing, backup and restore. No storage-schema migration is needed. A rejection does not alter captured evidence or another account's review. Older extension versions that require nonempty reviews cannot consume this new review form.

Three completeness questions are distinct:

| Layer | Question |
| --- | --- |
| Candidate parse | Did the parser account for this candidate's text? |
| Source-manifest coverage | Did it process the source-backed parent clause or only a bounded portion? |
| Book completeness | Does the source establish everything in this edition? |

**Full is local parse completeness, not universal book completeness or ownership.** A literal same-clause parent can represent structural children, preserving unresolved material and diagnostic windows. Independent semantic claims stay separate; neither adjacent location nor higher proposal count authorizes aggregation or automatic promotion. Loading one independent claim changes editor text/rows only; saving replaces the parent's single saved review.

Source generation 5 preserves captured DOM lines; parser 6/filter 1 interpret saved text independently. A parser reparse does not refresh source. Exact source-backed historical selections must survive validation even when a new parser changes ranking. Read more may signal premature/incomplete hydration or extraction; it is not universally disposable garbage. No local reparse can recover source that was never captured.

**Refresh all eligible books** acquires new source for every supported Kindle book, including previous successes. A pinned earlier source and bounded latest failed attempt remain separate from current evidence; verified reviews and ownership are unchanged. See [refresh retention and checkpoint contracts](kindle-refresh.md).

## Parser 5: bounded numbered precision

Parser 5 improves numbered labels and bounded numbered clauses. It does **not** implement broad named-work parsing. Source generation 5, filter 1, manifest interpretation 1, evidence review 1, schema 12 and API/backup formats remain unchanged.

- Discovery unit markers (`issue`, `volume`/`vol`, `book`) require lexical boundaries. `Guidebook #1` is an issue with the literal Guidebook title, not Guide volume 1. Explicit chapters are unsupported and remain unresolved, never ordinary print issues. Annual/special suffix handling stays unchanged; part/guide are not new unit types or markers.
- Numbering before `of` is not a completed series label. For a postposed title, commas/conjunctions stay inside the label until another numbered clause or a defined prose-tail head occurs. Generic lowercase subject heads retain the existing conservative guards; a title does not need capitalization to preserve its conjunction. Existing comma ambiguity and prose guards still apply. Descriptive `part of`, series commentary, feature and credit clauses remain unresolved. Ordinary numbered title conjunctions remain literal.
- Label guards no longer reject a title merely for `Books`, `More`, or hyphenated `He`/`She`/`They`. Markers/numeric syntax and genuine prose still prevent a label from being accepted. No franchise or publisher aliases are used.
- The exact leading wrapper `adventures from` is consumed before numbered label extraction. Longer narrative wrappers are not understood or globally stripped. A later explicit `collects` clause can be segmented from an unnumbered prelude, which remains unresolved; no manifest candidates or independent claims are combined.
- A numbered clause can retain an unresolved tail after a comma/semicolon, a sentence period, a nonnumeric en/em dash, a supported creator credit, `with bonus/additional/supplemental/extra material/content`, or a bounded `of … run` qualifier. A `from …` credit requires an explicit creator/writer/artist word within 250 characters and no numbered work in that bounded span; page/material/story attribution is excluded. Generic `from`/`of` tails, colon qualifiers, attached number/text and arbitrary narrative tails remain unresolved as whole clauses. Numeric continuations may precede sentence punctuation; qualifiers never become component proposals.
- Integer ranges remain limited to 500 entries. If a shorter endpoint is below the start, at least two endpoint digits may replace the start's suffix only if this yields a **strictly greater** endpoint within the same prefix. No rollover, single-digit guessing or decimal/fractional range expansion is added. `645-50` expands to `645-650`; `100-05` to `100-105`. `99-01`, `199-02`, `645-5` and `645-45` remain unresolved. Ordinary `proposeContents`, numeric keys and verified contents validation retain their existing semantics.

Accepted tails and unsupported material remain in `unparsed`, keeping local proposals Partial. Excerpt heading/qualifier propagation remains conservative. A Full result only means this bounded parser accounted for its input. Neither parser version nor proposal count authorizes verification or ownership.

Explicit digital chapters cannot supply a series/type to bare numeric continuations. A finite parenthetical `digital #1-12` or `digital chapters #1-12` aside is retained unresolved while its adjoining explicit print clause is parsed independently. The literal wrapper `in single magazine form as` may introduce a print clause; its own numbers are used, never converted from chapter numbers. Unsupported prose inside digital parentheses remains unresolved as before.

Captured-source handoff compares whitespace-only presentation copies with the saved selection (or its proven whole-manifest parent). UI summaries retain source characters, including Unicode ellipses; parser normalization happens afterward. This lets scan/status, workbench and editor reuse the same captured context. Substantive edits, punctuation changes and independent claims cannot borrow the untouched selection's contextual input. Reading/parsing does not alter captured evidence, histories or confirmed reviews.

Permanent synthetic controls live in `tests/contents-numbered-precision-fixture.js`, shared by unit and packaged UI checks. Frozen parser-4 snapshots remain historical controls. Offline replay tooling accepts a separately supplied source-only ledger; reference answers never become parser input. Detailed population/reference comparisons belong in ignored audit artifacts, not runtime or committed fixtures.

## Parser 6: bounded numbered wrappers and attribution

The review/discovery parser recognizes `as well as`, `together with` and `along with` as list separators after a grounded numeric clause. Quoted siblings and plural one-shots can form a new clause; named supplements never acquire guessed issue numbers. Independent collection claims remain separate source selections.

Within an explicit collection claim, bounded adventures/exploits/team-up headings, `the entire series`, quoted story attribution and series/run attribution can expose an explicitly named numbered payload. Wrapper text stays unresolved. Story/segment/tale attribution supplies excerpt proposals, not ownership of full issues. Numbered annuals/specials retain their types; bare annuals reuse only the existing prior-series context. A possessive creator credit is removed only when the product title independently provides the same literal series and creators in a `by` credit. Publisher prefixes and series aliases are not guessed.

Source prose stating that stories `are collected here in` the subject volume cannot turn that volume into a contained product. Recommendations, scripts, obvious plot subjects and creator predicates remain unresolved. Existing chapter, numeric-range, run, language and named-component safeguards still apply. Ordinary product matching and reviewed coverage are unchanged.

Parser generation 6 makes the existing local reparse planner recognize older derived results even when their outcome remains Partial and their input text is unchanged. This is not a new source capture: extractor 5, manifest interpretation 2, filter 1 and storage formats remain unchanged. Local interpretation retains original captured text, acquisition history and confirmed reviews.

Public source-span regressions for all 35 audited cases and four adjacent controls live in `tests/fixtures/kindle/numbered-wrappers.json`; private corpus comparisons remain under ignored audit artifacts.

## Named components: parent-local identity

The existing entry has series, run, unit type, number/name, language and full/excerpt extent. Generic `component` holds a named containment assertion: **this particular parent contains this named component**. Shared names or collection display labels do not establish cross-parent work identity. Cross-parent equivalence requires stronger, separately reviewed identity evidence; it is not supplied by this contents contract.

The [historical named-work audit](../audits/kindle-named-contained-works.md) reproduced three defects now fixed: same-label cross-parent coverage, cross-media explicit coverage and numeric component-name collapse. The derived owned-content index keys named entries by the actual review owner (`contentReviews[parentItemId]`), its stored media type, run, literal component name and language. A collection display label is metadata, not parent identity. Canonical grouping or a reviewed same-edition alias does not substitute for the actual review owner.

`contentKey` remains a local validation/deduplication key; it is not a global named-work key. For components, `number` is a literal name after existing whitespace cleanup: `01` differs from `1`, and case, Unicode spelling, punctuation and edition wording remain distinct. Numbered issue/volume/annual/special identity retains numeric canonicalization and cross-collection coverage, including `01 == 1` and equivalent fractional numbering. Numeric component names do not generate issue-gap diagnostics. Component overlap summaries remain separated by actual parent and media.

Trusted local code can use `parentContentCoverage(database, parentItemId, entries, options)` to compare against a current stored parent. The evaluator derives media from that record and rejects a conflicting requested media type. It never borrows another parent's named entries, including when labels match. Missing, orphaned or historical-only parents supply no coverage. Full/excerpt, run/language, ownership overrides and exclusion rules still apply; missing run/language prevents complete coverage.

`contentCoverage` and external API v1 requests have **no trusted named-component parent scope**. Same-media, same-label literal names can supply `possibleCovered` diagnostic evidence, but stay in `missing` and cannot establish complete Owned through component equality. A caller's `parentItemId`, an entry's extra fields or an opaque returned `itemRef` cannot grant scope. Numbered entries in mixed requests can still supply confirmed partial coverage. Ordinary whole-title/edition matching remains independent and may establish ownership without relying on component equality.

Existing reviews and backups remain readable and editable. Scope is reconstructed from each review's actual owner; no stored-field migration, schema bump or API version change is needed. Unknown entry fields remain discarded. Already lost names cannot be reconstructed from a legacy collapsed review without its original source or a user edit. Components still never enter the ordinary globally owned-title index.

HB/FAN contents requests are unscoped. Their typed contents serializers preserve literal names, and local/central coverage merging cannot promote named equality to Owned. Their ordinary title matching and numbered contents controls are unchanged. See [the companion request contract](companion-api.md).

Parent-local identity does not depend on the parser upgrade. Novel/story type, source attribution and named-versus-numbered overlap must not be inferred from title equality. Original scripts/apparatus and unknown overlap remain review evidence.

See the [historical audit index](../audits/README.md) for the failure modes behind these invariants, and [matching policy](matching-policy.md) for conservative Owned and broader Possible behavior.
