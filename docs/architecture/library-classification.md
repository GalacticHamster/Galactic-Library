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

Confirmed defects: unknown subjects were omitted from the broad vocabulary; Fiction/Nonfiction were deliberately removed whenever another category matched; character subjects such as Batman were treated as comic format without corroboration; Kindle retail categories were never captured. Sparse enrichment and strict source/type-only comic detection explain poor un-enriched coverage. The user's exact installed-data disappearance cannot be diagnosed from repository history alone; no personal database was inspected or changed. The normalization defects are reproducible with synthetic records, while raw enrichment is preserved through restore and same-media sync.

Details show Categories prominently and Source classification in a collapsed section with provider/account, original labels, confidence, inference and contradictions. None of these labels is matching or ownership evidence.
