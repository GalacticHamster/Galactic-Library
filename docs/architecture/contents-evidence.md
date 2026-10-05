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

## Named components: current limitation

The existing entry has series, run, unit type, number/name, language and full/excerpt extent. Generic `component` can hold a name without pretending it is an issue, but its current key uses a collection **label**, not an enforceable parent reference. Verification confirms an inclusion assertion; it does not establish global identity.

The [named-work representation audit](../audits/kindle-named-contained-works.md) demonstrated same-label cross-parent coverage, cross-media explicit coverage and numeric-looking component names collapsing (`01`/`1`). Populating run/language and marking an explicit request complete can allow a false Owned result through that coverage path. Different collection labels and ordinary bare-title requests remain separate. **These defects remain unresolved; this document does not claim parent-scoped identity or parser 5 was implemented.**

A future minimal correction must enforce parent-local named identity, preserve literal edition/title distinctions and compatible old reviews/backups, and define scope across the companion coverage API. Shared names in unrelated collections do not prove the same canonical work. Novel/story type, source attribution and named-versus-numbered overlap must not be inferred from title equality. Original scripts/apparatus and unknown overlap remain review evidence.

See the [historical audit index](../audits/README.md) for the failure modes behind these invariants, and [matching policy](matching-policy.md) for conservative Owned and broader Possible behavior.
