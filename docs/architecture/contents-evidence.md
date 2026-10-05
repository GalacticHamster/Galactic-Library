# Contents evidence and identity boundaries

Identity confidence and ownership/access confidence are separate. Provider presence is not proof of a purchase. An ownership override changes effective access classification while retaining observed provenance; it does not identify an edition or contained work.

Contents discovery produces **unverified proposals**, not owned standalone titles. Only an explicitly saved contents review can supply contents coverage, and only full entries from effectively owned/claimed parents qualify. Excerpts never establish full-unit coverage. Ordinary title matching does not index proposed or verified component names as standalone library items.

Three completeness questions are distinct:

| Layer | Question |
| --- | --- |
| Candidate parse | Did the parser account for this candidate's text? |
| Source-manifest coverage | Did it process the source-backed parent clause or only a bounded portion? |
| Book completeness | Does the source establish everything in this edition? |

**Full is local parse completeness, not universal book completeness or ownership.** A literal same-clause parent can represent structural children, preserving unresolved material and diagnostic windows. Independent semantic claims stay separate; neither adjacent location nor higher proposal count authorizes aggregation or automatic promotion. Loading one independent claim changes editor text/rows only; saving replaces the parent's single saved review.

Source generation 5 preserves captured DOM lines; parser 4/filter 1 interpret saved text independently. A parser reparse does not refresh source. Exact source-backed historical selections must survive validation even when a new parser changes ranking. Read more may signal premature/incomplete hydration or extraction; it is not universally disposable garbage. No local reparse can recover source that was never captured.

## Named components: parent-local identity

The existing entry has series, run, unit type, number/name, language and full/excerpt extent. Generic `component` holds a named containment assertion: **this particular parent contains this named component**. Shared names or collection display labels do not establish cross-parent work identity. Cross-parent equivalence requires stronger, separately reviewed identity evidence; it is not supplied by this contents contract.

The [historical named-work audit](../audits/kindle-named-contained-works.md) reproduced three defects now fixed: same-label cross-parent coverage, cross-media explicit coverage and numeric component-name collapse. The derived owned-content index keys named entries by the actual review owner (`contentReviews[parentItemId]`), its stored media type, run, literal component name and language. A collection display label is metadata, not parent identity. Canonical grouping or a reviewed same-edition alias does not substitute for the actual review owner.

`contentKey` remains a local validation/deduplication key; it is not a global named-work key. For components, `number` is a literal name after existing whitespace cleanup: `01` differs from `1`, and case, Unicode spelling, punctuation and edition wording remain distinct. Numbered issue/volume/annual/special identity retains numeric canonicalization and cross-collection coverage, including `01 == 1` and equivalent fractional numbering. Numeric component names do not generate issue-gap diagnostics. Component overlap summaries remain separated by actual parent and media.

Trusted local code can use `parentContentCoverage(database, parentItemId, entries, options)` to compare against a current stored parent. The evaluator derives media from that record and rejects a conflicting requested media type. It never borrows another parent's named entries, including when labels match. Missing, orphaned or historical-only parents supply no coverage. Full/excerpt, run/language, ownership overrides and exclusion rules still apply; missing run/language prevents complete coverage.

`contentCoverage` and external API v1 requests have **no trusted named-component parent scope**. Same-media, same-label literal names can supply `possibleCovered` diagnostic evidence, but stay in `missing` and cannot establish complete Owned through component equality. A caller's `parentItemId`, an entry's extra fields or an opaque returned `itemRef` cannot grant scope. Numbered entries in mixed requests can still supply confirmed partial coverage. Ordinary whole-title/edition matching remains independent and may establish ownership without relying on component equality.

Existing reviews and backups remain readable and editable. Scope is reconstructed from each review's actual owner; no stored-field migration, schema bump or API version change is needed. Unknown entry fields remain discarded. Already lost names cannot be reconstructed from a legacy collapsed review without its original source or a user edit. Components still never enter the ordinary globally owned-title index.

HB/FAN contents requests are unscoped. Their typed contents serializers preserve literal names, and local/central coverage merging cannot promote named equality to Owned. Their ordinary title matching and numbered contents controls are unchanged. See [the companion request contract](companion-api.md).

These changes do not add parser grammar: parser 4, source generation 5, filter 1 and manifest interpretation 1 remain unchanged. Novel/story type, source attribution and named-versus-numbered overlap must not be inferred from title equality. Original scripts/apparatus and unknown overlap remain review evidence.

See the [historical audit index](../audits/README.md) for the failure modes behind these invariants, and [matching policy](matching-policy.md) for conservative Owned and broader Possible behavior.
