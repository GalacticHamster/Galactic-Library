# Kindle source-capture experiment — 25 records

Completed 2026-10-05. Stable baseline: parser **4**, filter **1**, storage schema **12**, source extractor **4**. Implemented source capture **5**; parser, filtering, identity and ownership semantics remain unchanged.

## Findings

The remaining problems have several causes. This deliberately selected sample demonstrates **two actual DOM-boundary capture defects**, **two candidate discovery/windowing problems**, **two selection problems**, **four likely historical omissions**, **six cases with faithfully captured but unsupported parser input**, **three descriptions without identified contained works**, and **one source ambiguity**. Five successful/no-current-loss controls complete the 25 records. These counts describe this sample, not the prevalence among 3,194 eligible pages.

The directly justified fix preserves static DOM line/block boundaries in captured descriptions and source-backed selected statements. It prevents `Back”.Published` paragraph concatenation in Neverwhere and preserves Dragon Blood’s three separate title lines. **It does not manufacture delimiters, strip Read more, or change grammar to force proposals.** The generation-5 replay has the same 201 proposals as the generation-4 live sample; source fidelity, rather than increased proposal count, is the demonstrated improvement.

A particularly important separate problem is **King in Black Omnibus**: generation-4 discovery splits its single collected manifest into 18 windows, then selects the five-issue Namor subrange as **Full**. The original parser-v4 snippet produced 52 proposals. The complete source and 17 secondary candidates survive in storage, but the primary proposal list loses 47 units. This is a window/selection-scope problem, not missing Amazon content or source truncation. It remains documented for separate review; this task does not merge candidates or change ranking.

## Frozen population and provenance

The [complete sample ledger](kindle-source-capture-sample.md) was written and committed as `cefe368` **before any network request**. The [JSON ledger](kindle-source-capture-sample.json) contains each provider item ID/ASIN, title, extractor generation, parser version, outcome, exact saved statement and length, proposals, unresolved evidence, suspicion category, and individual selection rationale. No population substitution occurred.

The sample includes all five 100 Bullets volumes, named/count-based non-comic collections, historical short snippets, concatenated paragraphs/titles, generation-4 Read More observations, complex successful manifests, mixed annual/excerpt cases, and negative topic/bibliography controls. Seven records already have complete historical generation-4 blocks; eighteen have older statements without historical full HTML. Non-comic records remain eligible; no comic/manga gate was introduced.

Source: `galactic-library-backup-v1 (2).json`, exported `2026-10-05T00:48:15.011Z`, the latest supplied Downloads export, 14,081 provider items. The stable saved-corpus baseline is that backup plus the previously committed 77 generation-4 pilot selections and parser-v4 audit; this is not a claim that the backup itself already contains those later local derivations.

- Backup SHA-256: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`.
- Frozen ordered URL population SHA-256: `beff30d5a18625262ba3342cec9f98e2b620ec3768f4e094c291de7b669eea8f`.
- [Analysis JSON](kindle-source-capture-analysis.json) records evidence hashes, primary classifications, exact comparisons and all 25 row assessments.

Existing parser-v4, quality-pass and manifest-pilot reports, acquisition/retry/scan code, candidate assessment, storage/validation paths and current tests/fixtures were read before implementation.

## Network accounting and privacy

**Exactly 25 Amazon HTTP requests**, for the 25 frozen product URLs. All returned HTTP 200. **Zero retries, redirects, failures, CAPTCHA/sign-in responses, blocked requests, or extra product/resource requests.** Capture ran from `2026-10-05T11:43:52.110Z` to `2026-10-05T11:45:09.690Z` (77.58 seconds). CDP interception counted the actual allowed requests, including any redirect had one occurred; no request went outside the frozen product paths.

The experiment used the production static-fetch adapter in disposable anonymous Chrome. A locally fulfilled synthetic Amazon-origin document enabled the existing same-origin fetch without real storefront navigation. Amazon page scripts, hydration, images, clicks, and signed-in profiles were not loaded. A fetch diagnostic cloned the same response for inspection; it did not make a second request. This inspection adds local parsing/transfer work, so its timings are not a production performance benchmark.

The actual production retry helper was compiled unchanged: sequential pages; one-second wait between pages; three attempts maximum for existing transient errors; existing 2/4-second retry waits; existing 30-second timeout and CAPTCHA/sign-in stop behavior. The existing checkpoint buffer durably saved private-copy results in batches of 20 and 5. The harness includes interruption/checkpoint and explicitly guarded resume support; no resume was required. Existing packaged importer tests separately exercised real pause, flush, resume, retry and CAPTCHA behavior.

No full product responses, cookies, headers, authentication, account details, private receipts, signed-in storage or unrelated Amazon page contents were persisted. Artifacts contain only bounded sanitized description regions, public product IDs/URLs, contents candidates, derived proposals, timing/status metadata and exact enrichment evidence. Sanitized fragments contain semantic tags and text; attributes, links, images, scripts and forms are removed. A reproduction check recovered the original generation-4 block text **exactly for all 25 records** from those fragments. Offline replay blocked HTTP/HTTPS; all other analysis and safety scripts prohibited network access.

## Stage definitions and evidence

| Stage | Observed evidence / artifact |
| --- | --- |
| A — acquired response | HTTP status, response URL and character count; sanitized relevant-region markup from that same static response in [live capture](kindle-source-capture-live.json). Full HTML is deliberately not persisted. |
| B — relevant description regions | Literal `textContent`, sanitized structural HTML and untruncated-region flags for the five production selectors; empty overview whitespace is separately visible. |
| C — gen-4 candidate discovery | Exact bounded blocks and candidate windows, offsets, binding, quality, counts and rank vectors. |
| D — selection | Selected index plus secondary candidate indexes. No candidate merging occurs. |
| E — actual serialized evidence | Exact statement, manifest, source/version/timestamps and derived fields from the real private-copy writer; gen-4 in live JSON, gen-5 in [safety JSON](kindle-source-capture-safety.json). |
| F — normalized parser input | Exact candidate/parser input, binding and quality; the source statement remains distinct. |
| G — parser v4 | Exact outcome, unverified entries and unresolved fragments. Existing grammar and quality gates remain unchanged. |

The raw-response diagnosis is intentionally limited to relevant description regions, not a stored copy of the entire page. No omission was demonstrated *between the acquired markup and the five selected description regions*. Other selectors, embedded data, signed-in variants and other resources were not exhaustively examined. Zero observed region loss is not a universal completeness guarantee.

## Primary limiting stages

Each record has one primary category, chosen at the earliest demonstrated useful-evidence limitation relative to its historical baseline/current decision. Secondary causes are described explicitly below and in the record trace; they are **not counted twice**. Historical and current failures are distinguished because a fresh capture can resolve a historical failure.

| Failure / limiting stage | Count | Records / interpretation |
| --- | ---: | --- |
| Source lacks explicit contained-work evidence | 3 | Wool: unnamed five-book count; Investing: topics; Midwich: author bibliography, not contents. Limited to observed descriptions. |
| Old source likely incomplete | 4 | 100 Bullets One/Two/Three and TMNT IDW Eleven: later useful manifests now exist; historical full responses unavailable. |
| Relevant-region extraction loss | 0 | None demonstrated within inspected relevant markup; see scope limits. |
| Candidate-discovery/windowing loss | 2 | Sherlock: untriggered named list ignored. King in Black: whole manifest split into subwindows. |
| Ranking/selection loss | 2 | Code Breakers and Hellboy omnibus retain richer later clauses as secondary but choose earlier generic claims. |
| Serialization/boundary loss | 2 | Dragon Blood BR boundaries; Neverwhere adjacent P boundaries. Proven on the same static HTML; capture fixes implemented. |
| Normalization loss | 0 | No additional primary category. Dragon Blood still loses structural line meaning in the parser copy; this co-occurring limitation is described below. |
| Adequate input; parser-v4 limitation | 6 | Knightfall One, Ex Machina Three, TMNT IDW Thirteen, Dead Boy Detectives, Star Wars Newspaper One, TMNT Opening Moves. Faithful input still has unsupported named/attribution/annual/date grammar. |
| Source changed since original capture | 0 | No confirmed drift. Eighteen old full responses unavailable; not a proof of stability. |
| Ambiguous | 1 | Hellboy 1954: literal comma sequence does not uniquely resolve title attribution/extent; no hidden DOM delimiter. |
| Control: no demonstrated current limiting stage | 5 | 100 Bullets Four/Five, Hunger excerpt, Knightfall Two, Road to No Man’s Land Two. Last control improves through existing generation-4 selection. |
| **Total** | **25** | Mutually exclusive primary classifications. |

The six parser cases mean that usable evidence reaches parser v4 intact, not that every unnumbered supplement has sufficient identity to auto-verify. All interpretations still require review. Clean source plus ambiguous identity is not proof of a parser bug; Hellboy 1954 is classified separately for that reason.

**Explicit overlaps:** Dragon Blood also encounters unchanged Read more uncertainty and counted-novel grammar; Neverwhere has unsupported attribution after its boundary is repaired. Code Breakers and Hellboy omnibus also have unsupported later named-collection grammar, affecting ranking. TMNT Eleven improves after refresh but still leaves nine ongoing-series issues unresolved. King in Black’s windowing then interacts with ranking’s preference for a Full subrange. These explain limits of the primary-category counts.

## Per-record comparison

The [complete 25-record trace](kindle-source-capture-records.md) contains the old/live/gen-5 comparison table and individual A–G records: raw-region lengths, block/candidate statistics, selected index, secondary counts, exact old and serialized statements, normalized input, proposals, unresolved evidence, causal assessment and drift qualification. It includes every frozen record; no success-only subset is reported.

| Representative record | Old parser-v4 result | Fresh static gen-4 result | Generation-5 capture result |
| --- | --- | --- | --- |
| 100 Bullets One / Two / Three | Filtered, 0 each | Full, 19 / 17 / 22 | Same issue coverage; DOM boundaries retained. |
| Dragon Blood | Uncertain, 0 | Uncertain, 0; three titles flattened | Uncertain, 0; three source lines preserved. |
| Neverwhere | Failed, 0; glued next paragraph | Failed, 0; same paragraph contamination | Failed, 0; selected tale clause excludes next paragraph; unresolved fragments 2 → 1. |
| Code Breakers | Failed, 0 | Failed, 0; later named clause retained secondary | Same decision; boundaries retained. |
| Sherlock collection | Filtered, 0 | Filtered, 0; eight named works exist outside candidate recognition | Source list retained; discovery limitation remains. |
| TMNT IDW Eleven | Failed, 0 | Partial, 7 | Same proposals and unresolved attribution. |
| King in Black | Partial, 52 | Full, **5**, plus 17 secondary candidates | Same scoped decision; **not whole-book completeness**. |
| Road to No Man’s Land Two | Partial, 12 | Full, 15 | Same 15; existing gen-4 selection does the improvement. |

Old primary proposals total **180**; fresh generation-4 totals **201**; generation-5 totals **201**. Gains: 58 across three historical 100 Bullets records, 7 TMNT Eleven units, 3 Road units. Loss: **47 primary units from King in Black**. The net +21 is not a success metric and must not conceal that loss. No generation-5 record gains or loses proposal units compared with the same static gen-4 capture.

## Block, candidate and drift statistics

Each page yielded one nonempty description block; all 25 also contained an empty overview region. Thus 50 diagnostic regions, 25 production blocks, **57 candidates**, **25 secondary candidates** total. Candidate count median 1, maximum 18 (King in Black). Gen-4 block lengths: minimum 325, median 857, maximum 3,639 characters. No 12,000-character block, 24,000-character total, 8-block, 32-candidate, 2,000-character window or 16,000-character candidate-evidence cap caused the observed defects. Diagnostic region caps were not reached.

**All 25 old saved statements remain present in the current flattened description.** All **seven** records with preceding complete generation-4 blocks match those blocks byte-for-byte: Bullets Four/Five, Dragon Blood, Knightfall One/Two, Ex Machina Three, Hellboy 1954. These provide evidence of stable relevant text across captures, including a proven persistent Dragon Blood boundary loss. The other eighteen have no saved historical full response, so richer current descriptions must not be presented as proof of historical capture loss; the four historical omissions are qualified as likely.

All **25 static descriptions contain Read more**. That marker is neither reliable proof of omitted static contents nor something safe to discard globally. These static responses already expose the later 100 Bullets statements and the Dragon Blood titles. This task adds no sleeps/hydration/network changes and preserves the incomplete-description flag and existing parser treatment. Signed-in/hydrated equivalence remains untested.

## Exact boundary mechanism and bounded implementation

Before: `element.textContent` omits `<br>` nodes and places adjacent paragraphs together. Global whitespace compaction subsequently removes literal source line breaks. For Neverwhere, `</p><p>` becomes `Back”.Published`; sentence discovery cannot see the missing whitespace. For Dragon Blood, `<br>` plus whitespace becomes one joined sequence of three title names. Inline spans/emphasis are different: breaking them would damage words such as `SUPER` + `MAN`.

Implemented in `410c197`:

- `src/providers/kindle.js`: bounded static text-node traversal retains explicit BR, paragraph, list, heading and block boundaries as newlines; inline text remains contiguous. Character budgets remain 12k per retained block/24k total, with finite 4,000-node/64-level traversal guards. Non-description scripts/forms/control content is excluded. Source generation is now **5**.
- `src/lib/kindle-manifest.js`: validation retains canonical source lines instead of flattening them. Candidate recognition/rank logic is unchanged; existing sentence recognition can now see actual paragraph boundaries.
- `src/lib/metadata-validation.js`: after validating a recomputed source-backed manifest/window, generation-5 selected source clauses preserve exact newlines through writer/backup validation. Parser input remains compact. Legacy and free/edited text retain existing validation.

No new schema fields or storage redesign; parser **4**, filter **1**, schema **12** remain. Acquisition still uses the same static fetch. The existing extractorVersion is the source-capture generation field; no separate network-acquisition revision was needed. Old saved statements reparsed locally remain old-generation evidence. This change schedules **no automatic source refresh**.

A storage regression initially revealed that the ordinary text validator would flatten the newly selected clause. Its source-backed validation correction is included in this commit; without it the selected raw clause and saved statement could differ and bypass contextual manifest parsing. Permanent tests now cover that exact storage boundary.

Dragon Blood’s saved statement and blocks now preserve the three lines. The unchanged parser copy still collapses whitespace and retains the terminal Read more marker, producing Uncertain rather than a guessed title list. Visual lines may be wrapping rather than constituent separators; converting them universally into commas/semicolons would be speculative. Neverwhere’s cleaner clause is still Failed because parser v4 does not interpret that attribution form. Neither is silently labeled Full.

## Permanent regressions and safety

Shared low-level sanitized-HTML fixtures run through region extraction → blocks → candidate discovery → selected source → real writer → normalization → parser → backup. Real DOMParser executes the same checks in both packaged Chrome and Firefox; Node also exercises a minimal fixture tree. They assert paragraph/BR/list boundaries, inline word/emphasis continuity, character/traversal caps, unchanged excerpt scope, preserved source history, verified-review retention and exclusion from ordinary owned indexing.

The five static 100 Bullets fragments produce **1–19, 20–36, 37–58, 59–80, 81–100** exactly once, no gaps/overlaps. All prior manifest/parser-v4 families remain, including Knightfall, Ex Machina, Hellboy, Earth 2, Swamp Thing, secondary series, annual/special, excerpts, non-comic and false-Full cases. The existing capture fixture now references the current exported extractor constant; historical gen-4 restore/parser fixtures remain historical. No existing assertions were weakened.

The [full private-copy safety check](kindle-source-capture-safety.json) used all **14,081** provider records and only the 25 frozen captured fragments, with zero network requests. A pre-existing synthetic verified review made review/index preservation non-vacuous because the export has no verified contents. Results:

| Safety check | Result |
| --- | --- |
| Provider ownership / ordinary identity metadata | Unchanged for all records. |
| Canonical grouping, manual decisions, edition separations, ownership reviews | Unchanged. |
| Verified/reviewed contents, including synthetic prior verification | Unchanged through capture and backup restore. |
| Ordinary matching | 29 successful external API comparisons identical. |
| Unverified contents in ordinary owned-title index | Zero changes; index identical. |
| Existing source/history outside sample | Unchanged. All existing history entries preserved. |
| Sample’s previous exact source/date/generation/manifest | All 25 retained in enrichment history. |
| Fresh gen-5 selected source and blocks | Exact through actual writer and backup round trip. |
| Original Downloads export / installed extension storage | Export hash unchanged; installed storage never accessed. |
| Stable saved parser-v4 corpus | All **1,520** complete proposal objects exactly match preceding audit. |
| HB/FAN | No files modified; existing unrelated untracked files left alone. |

## Complete validation

| Suite | Passed |
| --- | ---: |
| GL complete `npm test` (including source capture + release/security checks) | **384** |
| Packaged Chrome UI | **49** |
| Packaged Chrome importer lifecycle + real DOM capture | **35** |
| Packaged Firefox UI | **49** |
| Packaged Firefox importer lifecycle + real DOM capture | **35** |
| HB matching/coverage/policy/revision/collection/audiobook/parity | **210** |
| FAN matching/coverage/policy/revision/edition/parity | **209** |
| Full unchanged saved parser-v4 replay | **1,520** |
| Actual full-export safety API comparisons | **29** |

Offline DOM replay also reproduced gen-4 blocks exactly for all 25 fragments before evaluating generation 5. No further Amazon request was needed for implementation, regression testing or safety validation.

## Files and commits

- `cefe368` — freeze sample ledger and offline selection tool before requests.
- `9346164` — bounded capture driver and sanitized live evidence.
- `410c197` — source-generation-5 boundary preservation, storage correction, offline replay/safety tools and artifacts, shared low-level/Chrome/Firefox regressions.
- Final report commit — this report, per-record trace, reviewed analysis JSON and offline analyzer (recorded in git history).

Production: `src/providers/kindle.js`, `src/lib/kindle-manifest.js`, `src/lib/metadata-validation.js`.

Tests: `tests/fixtures/kindle-source-capture.json`, `tests/kindle-source-capture-fixture.js`, `tests/kindle-source-capture.js`, `tests/kindle-manifest.js`, `tests/importers-fixture.js`, `tests/run.js`.

Tooling: `scripts/freeze-kindle-source-sample.mjs`, `scripts/capture-kindle-source-sample.mjs`, `scripts/replay-kindle-source-sample.mjs`, `scripts/check-kindle-source-safety.mjs`, `scripts/analyze-kindle-source-sample.mjs`. Reports/evidence: the `docs/kindle-source-capture-*` files linked above. Capture is an explicit one-run experiment; it refuses accidental output overwrites and checks the frozen population/source generation. Do not interpret its presence as authorization for further requests.

The unrelated GL `start.txt` and pre-existing FAN untracked reconnaissance files remain untouched. No HB/FAN commits were made.

## Remaining unknowns and recommendation

This is a purposive sample, so it cannot estimate whole-library source-loss frequency. Eighteen historical full responses are unavailable. Full page text outside relevant selectors, signed-in variants, later hydrated text and extremely large/deep descriptions remain untested. Current caps are deliberate limits rather than evidence of completeness. Source capture preserves literal text/structure, not verified constituent identity.

**Next: review the candidate/window and completeness findings offline, starting with King in Black.** Test a bounded same-clause whole-manifest candidate against its structural subwindows, and distinguish selected-clause Full from complete-book contents. Sherlock’s untriggered named lists and Code Breakers/Hellboy’s secondary candidates need their own reviewed discovery/selection experiment. The now-preserved Dragon Blood/Neverwhere evidence can be assessed offline without another source request; do not weaken Read more or identity safeguards simply to obtain proposals. Parser grammar work should be separately scoped only after that review.

**Stopped after the frozen 25-page experiment and directly justified capture fix. No second sample, 642-record refresh, 3,194-page library rescan, or parser v5 was started. Wait for review before broader refresh or parser/discovery work.**
