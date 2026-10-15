# Historical engineering investigations

These selected records explain architectural turning points. Their versions, counts, implementation status and recommendations are historical. Use [current architecture](../architecture/contents-evidence.md) and [user documentation](../README.md) for current contracts. Generated ledgers/appendices are local, not required to read these reports.

- [Generalized qualifier matching](qualifier-matching-2026-10-03.md): preserve purchasing warnings across edition/revision wording while separating identity from access.
- [Console provider feasibility](console-integration-2026-10-15/CONSOLE_INTEGRATION_RECOMMENDATIONS.md): independent Xbox, PlayStation and Nintendo ownership-source audits, validation gates and pre-1.0 recommendations.
- [Contents quality audit](kindle-contents-quality-audit.md) and [quality implementation](kindle-contents-quality-pass.md): topic/credit false positives and excerpt scope.
- [Performance instrumentation](kindle-contents-performance.md) and [bounded persistence fix](kindle-contents-performance-fix-2026-10-04.md): whole-database costs, checkpoint bounds and lightweight progress.
- [Amazon extraction reconnaissance](kindle-amazon-extraction-reconnaissance.md): first-trigger selection versus incomplete hydration.
- [Manifest candidate pilot](kindle-manifest-candidate-pilot.md): bounded multi-candidate source discovery and ranking.
- [Parser 4](kindle-contents-parser-audit-v4.md): conservative grammar and source-selection compatibility.
- [Source boundary capture](kindle-source-capture-experiment.md): preserve DOM boundaries without inventing separators or adding hydration waits.
- [Whole-manifest completeness](kindle-whole-manifest-completeness.md): King in Black parent/child fragmentation.
- [Independent secondary review](kindle-independent-secondary-evidence.md): review access without aggregation or automatic promotion.
- [Named-work representation gate](kindle-named-contained-works.md): parent-local identity requirement and existing verified-coverage defects; parser 5 was not implemented.

Per-run traces, complete private-derived item inventories and redundant pre-edit decision notes remain only in ignored local artifacts. Minimal regression evidence remains in `tests/fixtures/kindle/`. Retaining this archive is a deliberate selection of reasoning, not a policy to keep every future audit.
