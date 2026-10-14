# Named comic publication resolution

Named publications are interpreted after source selection, in `manifestReviewProposal`, using `comic-publications.js`. This is a local projection over captured evidence. It does not acquire source, change the selected statement, update provider records, or change companion product matching. Human-reviewed contents take precedence in `collectionContents`.

## Four separate questions

1. **Publication identity:** Which independently published comic does this literal reference identify?
2. **Enumeration:** Which actual issue numbers belong to that publication? A known name or the word “miniseries” supplies no count.
3. **Extent:** Does this collection include those complete issues? Selected stories, partial material, chapters and promotional references do not establish complete-series coverage.
4. **Access:** Is the supporting collection effectively owned? Existing coverage ownership gates still apply.

Existing contents entries suffice: numbered publications use `issue`, dated annuals use `annual`, genuinely unnumbered one-shots use `special` with `number: 'unnumbered'`. An externally documented numbered one-shot retains its actual number. Unidentified named works remain parent-scoped `component` entries or literal unresolved text. No schema migration is needed.

## Bounded bibliographic facts

`publication-reference-data.js` contains 28 reviewed reference rows, not a general comics catalogue. They describe 26 named publications/installments plus two ongoing-series runs. Six character aliases refer to specific numbers of one Villains Micro-Series; two Macro-Series aliases likewise identify installments, not complete new series. `kind`, explicit `numbers`, `complete`, publication year, publisher/context constraints, literal aliases and citations are separate fields. Complete miniseries boundaries are explicit lists, never inferred from a highest observed issue or cover/variant counts.

Facts were checked against publisher pages, transcribed title-verso bibliography, and original Grand Comics Database publication/reprint indexes. Attribution: [Grand Comics Database](https://www.comics.org/), whose site describes its data licensing as [Creative Commons Attribution-ShareAlike](https://creativecommons.org/licenses/by-sa/4.0/). Rows retain direct citations; no descriptions or cover artwork are copied. The Utrom Empire boundaries use [British National Bibliography title-verso transcription](https://obnb.uk/p16714965-utrom-empire); The Confession uses [Marvel's issue page](https://www.marvel.com/comics/issue/20777/civil_war_the_confession_1_2007_1).

This catalogue is maintained as reviewed source code: verify original publication versus collected reprint, dates, actual issue numbers versus cover variants, publisher, scoped aliases and completeness; include a direct supporting URL and a positive/negative fixture. `validatePublicationReferences` rejects duplicate IDs, missing sources, invalid years/enumerations, and unsupported completeness. Missing or contradictory facts must remain unresolved. Updating a reference never imports ownership.

## Resolution contract

- Only source-associated interpretation can use captured publisher/series context. Substantively edited drafts do not borrow it.
- Resolve literal named objects of a collection claim. Case, punctuation and `/`, `&`, `and` spelling vary; subtitles, years, sequel numbers and independent claims are not discarded.
- TMNT short names and ongoing run facts require the captured IDW Collection product-series label **and** IDW publisher. IDW alone is insufficient because it also reprints other TMNT continuities. Generic Heartland additionally requires Hellblazer context and an explicit one-shot/special label.
- Match the longest literal alias. Competing identities for the same name remain unresolved. Unrecognized prose, numeric qualifiers, partial/selected material, anthology stories and promotional mentions cannot expand a miniseries.
- A shared Micro-Series one-shot suffix may expand a grammatically enumerated list of names; each resulting name must independently resolve to a cited installment. No character name generates an identity by itself.
- Complete finite miniseries expand only to verified numbers. Missing counts preserve the recognized reference and an explanation without issue entries. Unsupported portions of a mixed statement remain unresolved.
- Seven already-derived Elseworlds components become independently identified unnumbered publications. Unrecognized components stay parent-local. Stored components/reviews are never rewritten.
- Already enumerated ongoing issues can receive a run only from literal, scoped bibliography, within its documented number bounds. Explicit runs, conflicts, reviews and existing user-merge member scopes take precedence. This does not associate an arbitrary runless standalone issue with IDW.
- Repeated references within a collection deduplicate; full and partial evidence remain distinct. Existing acquisition-aware coverage counts handle overlapping owned collections.

`publicationResolutions` / per-entry `publicationResolution` are transient explanation fields containing source fragment, reference ID/version, publication identity, enumeration status and bibliographic URLs. The contents interpretation and issue supporting-book views expose citations under **How these publications were identified**. These are not ownership evidence and are not stored as new review fields. Bibliography cannot mark an unowned book as owned.

## Limits and extension points

The separate confirmation-only choices and per-collection review workflow are documented in [Coverage disposition and reviewed resolution](coverage-resolution.md). They never participate in automatic named parsing or run assignment.

This is deliberately bounded. The existing parser continues using explicit captured ranges/counts and product context; the existing run resolver continues using local saved publication identities. The new resolver can accept another validated reference set, but does not build one automatically from title similarity, workbook values, local maximum issue numbers or unrelated collection claims. Related descriptions can corroborate a reviewed fact but are not blindly unioned into a collection. No runtime network dependency, new permissions, broad enrichment scan or silent reference acquisition is introduced.

Unknown publications, ambiguous runs, selected/miniseries subsets, unnumbered stories inside anthology issues and unsupported partial enumeration still require better evidence or an explicit user review. The frozen audit output belongs under ignored `audit-artifacts/named-publications/`; source-only tests use minimal public captures and synthetic evidence, without private library inputs.
