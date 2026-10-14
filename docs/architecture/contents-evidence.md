# Contents evidence and identity boundaries

## Review source baselines

Saving a contents review captures a separate, bounded `sourceBaseline` from the current record in the serialized storage writer. It snapshots normalized captured description blocks when available, otherwise the captured/local contents statement, including an empty-source baseline. Authored review text, Quick Add notes and entries do not establish that baseline. Parser selection, outcomes, versions, acquisition timestamps and block ordering do not change it; substantively changed captured text does. This is an exact text snapshot, not a product identity or ownership fingerprint.

The optional field is validated and retained by ordinary backups/restores without a schema migration. Existing reviews are not rewritten. Without a baseline, comparison retains the previous statement/whole-manifest compatibility and recognizes the original source prefix before Quick Add's labelled manual additions. A genuinely different prefix still warns. Arbitrary legacy edited reviews cannot reconstruct a lost source baseline; saving the review again establishes one. Library/Contents warnings, the editor, workbench and Kindle status share the same comparison. A source change never replaces reviewed entries.

## Annual coverage context

Parser 10 retains the publication date of a contextual `Annual (year)` independently of the preceding regular-series run. Date hints bind to their corresponding proposal entries, including repeated annual numbers from different cycles; unresolved dates cannot inherit a contradictory parent run through an undated fallback. Parser inputs, captured text and confirmed reviews are not rewritten.

`coverage-annual-context.js` supplies a transient, Library-only projection. Same-name/calendar-start labels share a candidate scope; existing annual run formatting is retained when unambiguous. A later start-only label can join an earlier bounded run only when dated source contexts agree and no regular #0/#1 indicates a reset. A shorter distinctive annual title can connect to a bounded collection parent only with supporting same-row regular contents and an eligible annual date. The alias is run/language-specific, not a global series-name substitution. Undated renamed annuals require that source-supported relationship plus their own collection context. Literal dated regular constituents take precedence in mixed annual collections. Matching dated annual anchors can resolve otherwise competing regular-run labels, but contradictory anchors remain unresolved.

Coverage retains the original annual name/run/date in `annualInference` and links to the original statement and contents editor. Reviews bypass this projection; regular issue identities, acquisition counts, external matching and storage/export schemas are unchanged. Partial annual evidence stays excerpt-only. Existing manual merges, starts and transitions remain view preferences and survive backup/restore.

Identity confidence and ownership/access confidence are separate. Provider presence is not proof of a purchase. An ownership override changes effective access classification while retaining observed provenance; it does not identify an edition or contained work.

Contents discovery produces **unverified proposals**, not owned standalone titles. Local series coverage and collection comparisons use automatically inferred full issue/annual/special entries from effectively owned/claimed parents by default. Manually confirmed contents take precedence. Excerpts never establish full-unit coverage. Ordinary title matching does not index proposed or verified component names as standalone library items; the companion API retains its reviewed-only contents behavior.

## Inferred local coverage

`inferred-coverage.js` supplies an evidence index to the existing `contentCoverage` and `seriesCoverage` evaluators; it does not store a second library or change ownership. `collectionContents` reinterprets the current selected source with parser 8 and the existing manifest/source-context handoff. It never unions independent claims or reads historical attempts as current contents. Library/Contents previews use that same interpretation lazily. Contextual annual dates do not replace the parent series run. Terminal Super Special is retained as a compound title; an exact subject/source-series match also protects literal Annual/Special names. Generic typed annuals/specials retain their existing treatment.

Confidence and identity scope are independent: evidence is `verified` (human review), `inferred` (automatic proposal), or `direct` (an effectively owned, explicitly numbered standalone issue). Unsupported/named material, excerpts and unparsed fragments remain unresolved for comic issue coverage. Full issue keys retain normalized literal series, run, type, number and effective language. Comic language missing from both the entry and existing parent identity evidence defaults to English (`en`) in this projection only; an explicit `English` label also compares as `en`. Other explicit languages retain their distinctions. Reviews and captured metadata are not rewritten.

`resolveCoverageEntry` fills a missing run only from the matching literal parent series: an explicit year/range adjacent to that series before its volume/issue marker, or the parent's existing single-series run metadata. Multiple-series metadata cannot distribute one parent run to all constituents. Conflicting title/metadata series or run values cannot supply context. Explicit contained-series runs take precedence over parent context; no year range/start-year equivalence or series alias is invented.

Run-unspecified entries can share a coverage key when the selected statement, human review, standalone title, or matching parent context explicitly identifies the same literal, nongeneric series and no multiple explicit runs for that series/language are present. Conflicting parent metadata cannot establish this shared identity. The run remains blank; those entries are never merged into a known run. A target specifying a known run can receive only possible overlap from run-unspecified evidence. Other missing-run entries remain source-local and cannot hide missing requested issues. The run-conflict registry uses current selected/reviewed full entries before ownership/exclusion filtering, so exclusions do not erase contradictions. Rejected contents and independent secondary claims do not enter it.

Resolved keys, including supported run-unspecified keys, deduplicate across supporting parents; verified evidence wins over inferred evidence for the displayed confidence while both parent references remain. Provisional totals are source-local candidates, not distinct global issues. Their numerical holes are possible gaps only. Gaps in usable groups describe the observed numerical span, not a full bibliography or a resolution of renumbering. Effective ownership, expiry and preferences are evaluated on each use; raw access provenance is retained. Read-only coverage creates neither provider observations nor separate acquisitions.

The existing `contentReviews` map also accepts an explicit `status: 'rejected'` review with an empty entry list. Ordinary accepted/corrected reviews still require valid nonempty entries. A rejection blocks all automatic suggestions for that provider record until explicit undo or a corrected review; it survives imports, local reparsing, backup and restore. No storage-schema migration is needed. A rejection does not alter captured evidence or another account's review. Older extension versions that require nonempty reviews cannot consume this new review form.

### Comic Coverage V1

Comic Coverage opts into `libraryCoverageIndex`'s excerpt evidence. Other coverage/overlap and companion consumers retain full-only evidence. `seriesCoverage` preserves full/excerpt source scope and the saved review/manifest/statement text for this view. `comicIssueEvidence` counts complete sources only, gives full coverage precedence and retains partial supporting sources. `comicRange.missing` remains the count needing complete coverage (including partial whole-number issues); `uncovered` counts gray positions only. Summaries expose complete, partial-only, duplicate and uncovered totals independently; fractional partial entries remain visible without invented missing fractional numbers. Series merges recount using the same complete-source helper.

Parser 8 separates named annual publication years from parent runs using transient `annualRunHints`; these are not a storage schema or bibliography. Same-statement regular-series evidence resolves a single compatible literal parent run. The local library projection retries unresolved hints against deduplicated explicit regular-series runs from current evidence, rejecting runs starting after or explicitly ending before the annual date and retaining ambiguous cases as provisional. It never chooses the nearest run, rewrites source, aliases different names or overrides human reviews. Each hint binds only its own clause's entries/continuations, so two dated annuals with the same number cannot overwrite one another.

`comic-series-merges.js` validates disjoint, bounded display groups keyed by the existing series/run/type/language scope. The UI worker applies them after ordinary coverage resolution, unions issue sources and recomputes copies using the existing acquisition counter. It does not alias evaluator keys, Collection Overlap or companion requests. Runs, types and languages must match exactly. Merging two existing groups flattens their members; undo removes the entire resulting group. Serialized preference operations read the current map to reject stale redundant merges. Navigation writes omit this independently edited map. Optional backup-root `comicCoverageMerges` and `comicCoverageStarts` fields restore atomically with the library; absent fields retain current preferences, explicit empty maps clear them.

Comic Coverage V1 consumes the same `librarySeriesCoverage` projection in `comic-coverage.js`, retaining resolved issue/annual/special groups and excluding provisional keys, volumes and named components. It never reparses independently or changes product/issue identity. The UI worker's coverage mode also receives existing edition barriers and provider history solely for Library's `consolidateLibraryRows` / `acquisitionHistory` counting. Copies from one consolidated product are grouped by existing acquisition provenance, not provider observation count; distinct supporting products each supply coverage. Effective ownership and reviewed contents retain their existing resolver precedence.

The missing-number layer is a view assumption: default start 1 through the largest numeric covered issue (whole numbers only). `comicRange` stores compact missing intervals and `comicIssuePage` materializes only the requested page; a six-digit issue does not create a million DOM rows or gap objects. Covered fractional/decimal/zero entries remain in the owned list. There is no inferred bibliography, fractional numbering sequence, automatic run alias or renumbering rule. Scoped start overrides use the existing UI preference writer; patches merge per key, null/1 reset a key, and navigation saves omit this independently edited map to prevent stale snapshots overwriting it. Coverage preferences are included as optional backup fields; provider records remain unchanged.

### Equivalent run labels in manual coverage merges

`continuityAssessment` replaces the former blanket numbering-envelope rejection with a bounded source-context check shared by the picker and authoritative merge-save guard. A same-name, same-type/language start-year label strictly inside an earlier bounded run may overlap when its supporting books' direct literal series context consistently links it to that earlier run. Context from an unrelated parent cannot grant equivalence, and newly inferred run guesses are not used as source proof. Later early issue numbers (#0/#1), boundary-era resets and unsupported or conflicting context retain the guard. An existing confirmed group can supply its same-name/same-start bounded member's extent to a start-only member when evaluating the next merge; different starting years cannot lend one another an extent. Other overlapping run relationships remain ambiguous rather than being automatically aliased. Non-overlapping manual continuations retain the existing behavior.

The user still confirms continuing numbering; this only permits a reversible coverage preference, never a product/source/ownership merge. Existing original-scope provenance, acquisition-based copy counting, saved merge schema, backup fields, starts and transitions are unchanged. Picker ordering prioritizes the same issue type before name similarity and searches name/run/type/language so annuals remain discoverable without crowding regular issues.

### Contextual run projection

`coverage-run-context.js` adds transient run assignments after parsing and direct parent-series resolution, before the shared local coverage index. Its catalogue is built once from explicit/direct current evidence (including inaccessible records for contradictions), separated by literal series, issue type and language. Inferences never seed further inferences. A uniquely supported numeric-run/calendar-run bridge can extend a candidate's observed envelope without rewriting the explicit numeric run. Number styles remain separate; an integer envelope cannot identify decimal/fractional issues.

Only explicitly named collection statements participate. Same-series clause evidence takes priority; semicolon boundaries and mixed explicit years prevent blanket propagation. Historical decades and dated collection series labels rank existing candidate runs by temporal support, requiring at least half the contextual period to agree; reprint release dates only reject runs beginning after publication. A unique numbering envelope must support the whole runless same-series/number-style cohort. This is locally supported inference, not an authoritative bibliography or official run extent. Annuals stay with the existing date-aware resolver.

Derived entries and supporting sources carry `runInference` with a reason; stored proposals, sources, reviews and provider items remain unchanged. Reviewed rows are not inferred, and member scopes of saved user merges are excluded from new inference in Comic Coverage and merge-save validation. Ownership gates and acquisition-based counting still run after identity resolution. Companion requests retain the reviewed-only index.

### Collection-pair browsing

Library's **Collection Overlap** workspace uses `collection-overlap.js` to invert the existing resolved comic coverage keys into collection pairs. It compares only parents sharing a key, never every possible pair of books. Existing canonical IDs group observations of the same product and prevent self-pairs; contents never create product identities. Standalone issues do not create collection pairs. Each pair retains all eligible supporting records, deduplicates shared keys and marks an issue verified only if both sides have verified evidence. Provisional keys cannot create pairs. A missing-run versus known-run relation is excluded from definite unique lists, including relevant provisional evidence on the other side.

The UI builds this projection lazily in `collection-overlap-worker.js` from current books, canonical labels/membership, content reviews and ownership context. It sends no history, queue or synchronization maps. The worker uses the existing coverage resolver and has no storage or network API. The bounded list and detail presentation reuse the existing pagination and record-link/navigation helpers. Returning to an unchanged Options database view reuses the built pair list; reconciliation with a new database view builds a fresh projection only when this workspace is active. This display does not change companion matching or verified ownership coverage.

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

## Current discovery interpretation (parser 15 / manifest 4)

Named miniseries and one-shots can additionally use the bounded, cited [publication resolver](publication-resolution.md). Its bibliographic facts remain separate from captured inclusion statements and ownership; source selection and human reviews remain authoritative.

Captured description blocks and historical selected windows remain source
evidence. A projection may replace an **explicitly automatic** empty proposal
(`approved: false`, `matchBasis: source-evidence`) with one uniquely enumerable
claim from the same block. Competing enumerable claims, different source blocks,
human-approved/unspecified selections and substantively edited drafts do not use
this fallback. The displaced statement remains reviewable. Reviewed entries
always take precedence; this does not write selections, source history or reviews.

Bounded natural collection claims can recover a previously empty selection.
An explicit same-title issue doubling as the collected volume is eligible;
an incidental issue in promotional prose is not. A same-sentence feature prelude
explicitly connected to the selected claim may supply partial host references.
Independent claims are not unioned. Duplicate references to one issue in a
collection remain one identity, not another acquisition.

Parsing copies recognize labelled `to` ranges, issue ordinals, bounded attribution
and promotional tails, explicitly postposed series names, and safely anchored
complete miniseries/saga counts. Explicit years and hosts retain precedence.
Named works in a bounded mixed enumeration use parent-scoped components, never
invented issue numbers. Other unnamed or unsupported publications remain literal
unresolved evidence. A complete story does not establish a complete host issue;
story wording is retained while its issue remains partial. Source descriptions,
manual reviews, access restrictions and ordinary companion matching are unchanged.

The following named-component contract applies to both old and new proposals.

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

## Local coverage run aliases

Comic Coverage can resolve a source's publication-volume label (for example,
`Series Vol. 2 #1`) to a calendar run when the same collection independently
identifies one matching series/run. The collected book's own volume number is
never an alias seed. Multiple explicit runs in an anthology cannot seed aliases;
conflicting alias targets stay separate. A source-supported start-year label can
likewise join its same-start bounded run. These are transient coverage projections,
with the original run retained in inference evidence. Reviews and user-merged
member scopes retain their identities; imported records and companion matching
are unchanged. Explicitly mixed eras block parent-run inheritance unless the
individual contents clause supplies its own unambiguous context.
