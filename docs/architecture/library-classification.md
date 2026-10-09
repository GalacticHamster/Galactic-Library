# Library classification

Classification is a deterministic read-only provider-record projection. It is separate from media type, edition identity, access, series and reviewed contents. The canonical Library row combines categories for presentation, while provider/account/access/category filters still have to qualify the same provider record. Facets come from the full committed Library projection, before search and pagination. A snapshot reuses its projection.

## Evidence and authority

Original Google Books categories, related-work genre hints, Open Library subjects and approved local metadata categories remain in enrichment. Provider content type/format and Kindle origin are considered separately. Reviewed non-comic categories suppress lower-priority comic inference and label the contradiction rather than deleting the source. Explicit independent subjects coexist, including Fiction and Nonfiction when another category is present. Conflicting catalogue classifications are retained and explained in Item Details.

Humble's `sourceBundle` and Fanatical's `bundleTitle` can support comics, programming-book and science-fiction/fantasy-book classifications. Only book records qualify for bundle format inference; prose, art, reference and film-guide evidence blocks comic inference. Marketing descriptions and item categories not retained by the import contract cannot be recovered from bundle names. No companion vocabulary or API change is required: GL owns the browsing vocabulary.

Recognizable comic-series names require issue/annual/one-shot/omnibus/collected-edition or volume evidence. Publisher names require structural evidence, with exact publisher/imprint matching. A series name alone is an uncertain suggestion, not a filter. A prose novel, art book or reference work does not acquire comic format merely through its franchise or publisher. These browsing rules do not expand the older strict contents-scan priority predicate.

## Broad vocabulary

Existing filter values are preserved: Comics & Graphic Novels; Science Fiction & Fantasy; History; Mystery & Thriller; Romance; Horror; Biography & Memoir; Business & Finance; Technology & Computing; Cooking & Food; Health & Fitness; Religion & Spirituality; Children & Young Adult; Arts & Photography; Fiction & Literature; Nonfiction. Additional mappings support Science, Education & Reference, Philosophy, Travel, Sports & Recreation, Law and Poetry.

Examples: Computers → Technology & Computing; Science fiction → Science Fiction & Fantasy; Mystery, Thriller & Suspense → Mystery & Thriller; Comics, Manga & Graphic Novels → Comics & Graphic Novels. The existing combined science-fiction/fantasy value remains compatible with saved filters. Original unmapped subjects remain visible under Source classification, not discarded or promoted into hundreds of filter values. Classification does not guess Horror or Superhero from a series name.

## Diagnosis and history

`c9c107b` introduced the broad rules and populated the selector from all provider records. The browsing projection (`4f95f23`, `70061fb`) and current implementation still project the same enrichment fields from all records. There is no code-evidenced change replacing the selector with a single Comics-only value, nor evidence here that migration deleted stored genres. Supplying retained Computers and Science-fiction enrichment produces their filters before and after the UI refactor.

Confirmed defects: unknown subjects were omitted from the broad vocabulary; Fiction/Nonfiction were deliberately removed whenever another category matched; character subjects such as Batman were treated as comic format without corroboration; Kindle retail categories were never captured. Sparse enrichment and strict source/type-only comic detection explain poor un-enriched coverage. Read-only comparison of saved exports found catalogue enrichment absent in later snapshots and recoverable in an older snapshot; offline validation of the older enrichment preserves it. The exact intervening deletion/reset/replacement operation cannot be established from repository history or the surviving exports. No live library was inspected or changed. The normalization defects are reproducible with synthetic records, while raw enrichment is preserved through restore and same-media sync.

Details show Categories prominently and Source classification in a collapsed section with provider/account, original labels, confidence, inference and contradictions. None of these labels is matching or ownership evidence.

## Kindle product categories

Normal successful product-description acquisitions now capture recognised product breadcrumb containers from the same HTML response. Each path contains its selector and ordered `{label, nodeId}` nodes; Amazon node IDs remain provider-specific. The optional `categoryPaths` and `categoriesCheckedAt` fields extend the existing validated `kindleProductComicContents` enrichment envelope, without a new table, schema version or migration. They are bounded to eight paths, twelve nodes per path, 200-character labels and 20-digit IDs. Existing source URL, ASIN/provider record, source kind and extractor version supply acquisition provenance.

Only product breadcrumb containers qualify. Category links must be Amazon browse/search links; external, malformed and product-recommendation links reject the path. Paths are not reordered or guessed. A Kindle eBooks anchor identifies the broad category; a partial path starting at eBooks can qualify, while missing/reversed roots stay inspectable without creating a filter. Deep categories, all original labels and IDs remain source evidence. Multiple valid paths can yield multiple broad categories.

Capture rides the existing authorized scan and existing atomic save. No additional requests, permissions, pacing, parser/extractor version or queue changes are introduced. A later missing breadcrumb does not erase earlier paths; their own capture timestamp remains unchanged. Unavailable/failed acquisition retains earlier current evidence under the existing history rules. Backup, restore, immutable baseline and selection undo carry the optional source fields through the existing validators.

Old contents observations retain description blocks and selected-source coordinates, not full HTML or breadcrumb containers. Neither those descriptions nor Kindle library `collections`/`libraryCategory` are retail classification paths. There is no reliable local historical recovery and no automatic backfill. Future normal scans collect paths when the server response contains them; missing or client-hydrated-only paths remain unknown. No hydration wait or extra fetch was added. Product-page bibliographic fields were not ingested into authoritative identity in this task; existing library/import metadata and approved catalogue fields remain the sources for authors, publisher, date, language, edition and series.

## Recovering missing historical genres

When current enrichment/history has no catalogue categories, there is nothing for a browsing projection to restore. Compare saved backups read-only before fetching again. Preserve the older backup: its original source categories can be recovery evidence. A future recovery should preview unique provider-native-ID links with unchanged media/title, omit changed/ambiguous links, copy only classification fields with original source provenance, preserve current and manual classifications, and verify identity/matching/access/canonical/contents invariants. Do not restore an entire older database over current progress or silently substitute classification hints for bibliographic evidence. Recovery is an explicit, bounded operation, separate from this deterministic display projection.
