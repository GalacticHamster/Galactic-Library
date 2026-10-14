# Comic Coverage browsing

Library → Comic Coverage retains its existing Series Coverage and Collection
Overlap views. All publications clears publication restrictions; Mainline runs
selects cited ongoing runs and regular issues; Needs resolution opens the
actionable queue without clearing search. Publication filters never suppress the
queue or change index admission. Its category selector separately distinguishes
actionable problems from informational access and partial-material exclusions.

Browsing state belongs to the Options session, outside reconstructed views. It
includes query/scope, publication/status filters, ordering, page sizes/pages,
resolution category/disclosure, series detail and issue grid/list position, and
overlap selection. Saves recompute data; pages clamp only when results shrink.
Contents navigation and database reconciliation reuse that state. A new Options
page starts with All publications. No dialog drafts, previews or pending writes
are persisted. Older asynchronous view generations cannot reset newer state.

The resolution selector groups authoritative dispositions into unresolved,
resolved, and excluded/informational components, including source references.
Its initial selection is the first unresolved component. Counted assignments
are inspectable but locked until Edit existing resolution is explicitly
confirmed. Reopening after a partial save uses the recalculated dispositions,
not the presence of a review, to choose the next outstanding component.

Candidate preparation yields a browser turn after immediately displaying an
indeterminate status. Selection generations discard obsolete work. Candidate
and compatible-family lists are cached only inside that unchanged dialog
snapshot, at most 20 selections each; search does not repeatedly rescan the
library. The potentially expensive compatible-family search runs only on
Find matching collections, with visible progress, rather than every target
selection. Actual preview recalculates coverage, and saving still revalidates
against committed data through the existing atomic writer. No library-wide
projection runs merely because a component or target changes.

Issue filters use structured unit types. Annuals stay separate from issues.
Specials and one-shots intentionally share a category: the current model has
special units and cited one-shots, not a universal independent one-shot flag.
An unnumbered publication keeps its actual identity; filtering creates no number.

Run classification is display-only. `publicationClass` consults the existing
cited `PUBLICATION_REFERENCES` and confirmation-only
`COVERAGE_RESOLUTION_REFERENCES`: ongoing → mainline; miniseries → limited;
one-shot → standalone. Installment facts do not establish a run type. A literal
series/recorded alias and explicit matching start year are required; a bounded
run with that same start is allowed. Every scope in a merged group must agree.
Unknown or conflicting types remain unclassified. Issue counts, title keywords,
collection lengths, ownership and user display names never establish run type.
Confirmation-only facts classify an already resolved scope, never resolve one.

To add classification coverage, extend the reviewed publication reference data
with the correct literal scope, kind and supporting citations, following
[publication resolution](publication-resolution.md). Do not add title exceptions
to the filter. Existing registry coverage is deliberately small: Mainline mode
excludes unclassified groups unless Include unclassified runs is selected.
All publications always includes them. No bibliography is acquired at runtime.

Coverage status describes GL's existing assumed range (starting number through
highest represented issue, accounting for saved transitions). Known gaps includes
partial issues needing complete coverage. No known gaps explicitly leaves the
published extent unverified; neither classification nor filtering establishes
that a published run is complete. Global index totals and filtered group counts
are labeled separately.
