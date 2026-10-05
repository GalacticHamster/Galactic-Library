# Kindle/Amazon contents extraction and hydration reconnaissance

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Investigation date: October 4, 2026, America/New_York. Production baseline: `42aac53`. **Audit only:** no production code, versions, schema, storage, ownership, matching, importers, UI, retry behavior or scan lifecycle changed. No library scan, source refresh queue, fixed sleep or implementation was introduced. The completed contents-quality pass remains intact.

## Executive findings

**Both missing 100 Bullets Collects sentences were found in ordinary static HTML, inside the first description region GL already inspects.** They do not require JavaScript hydration, an embedded-data decoder, a second description endpoint or clicking Read More to make them available to the static extractor in the responses observed here.

GL nevertheless selects the first trigger, then truncates that candidate. Given the complete descriptions, the historical generation-2 extractor reproduces both saved fragments exactly. The current generation-3 extractor still misses the numbered manifest; its punctuation improvements only make Book Four's first fragment longer. **First-trigger selection is independently defective.**

The live anonymous browser showed a **Read More expander with CSS clipping**: the complete description and final Collects sentence existed from the first observed description insertion. Clicking Read More changed the control to Read less and removed clipping; it did not obtain new description text. The user's signed-in, roughly one-second automatic visibility/update observation was not reproduced and remains a separate unknown. This investigation does not dismiss that observation or assume terminal Read More is garbage.

The smallest supported next implementation is **bounded multi-candidate extraction from the existing static description blocks, assessed with the existing contextual quality/parser evidence**. Preserve source-block context and source adequacy diagnostics. A new live-DOM hydration mechanism is not needed to recover these observed control responses. Use a proposed **77-page refresh pilot**, after the fix, rather than a 3,194-page rescan. No pilot was executed.

## Evidence, environment and scope

Controls came directly from the completed backup:

| Control | Actual Kindle URL | Expected later sentence |
| --- | --- | --- |
| 100 Bullets: Book Four | [B018YP1STO](https://www.amazon.com/dp/B018YP1STO) | `Collects 100 BULLETS #59-80.` |
| 100 Bullets: Book Five | [B01D2052NE](https://www.amazon.com/dp/B01D2052NE) | `Collects 100 BULLETS #81-100.` |

Only these two retail products were actively investigated. A fresh headless Chrome 153 profile was used, without the user's signed-in profile, GL storage or installed extensions. A diagnostic adapter copy was evaluated in that disposable page to exercise the real extraction functions. Same-origin fetches used GL's `credentials: 'include'` and `cache: 'no-store'` options, but included only anonymous browser state; their referrer/context was the product page, not the signed-in Content & Devices page. No request headers, cookies, tokens, full responses or unrelated response bodies were saved as evidence. Anonymous temporary profiles were deleted.

Evidence artifacts, all GL-specific and kept in this repo:

- [Second control run](../development/artifacts-and-audits.md#generated-output): authoritative raw/static, DOM, geometry, expansion and bounded network observations.
- [Initial control run](../development/artifacts-and-audits.md#generated-output): includes an incomplete Book Four response capture and a different initial Book Five response. Its `innerText`-based visibility flag is explicitly unsuitable for establishing visibility through clipping; use the second run's geometry instead.
- [Offline corpus and extractor probes](../development/artifacts-and-audits.md#generated-output): populations, refresh unions, historical/current extraction and existing quality/parser results.
- [Control diagnostic](../../scripts/recon-kindle-amazon.mjs) and [offline analysis](../../scripts/recon-kindle-corpus.mjs): analysis-only scripts, not release runtime files or implementation fixes.

Two web-tool opens of the control URLs failed with “Cache miss.” Browser investigation made **four product navigations and three explicit same-origin product fetches** across two runs: Book Four had two navigations and one fetch; Book Five had two navigations and two fetches. The first Book Four capture ended early because its response body was requested before streaming completed. The second diagnostic waited for the actual `Network.loadingFinished` event, not a guessed delay.

Amazon's normal product pages also automatically loaded assets, XHR/fetch responses and an embedded `read.amazon.com/sample/<control-ASIN>` document. These are recorded where relevant as origin/path/status only. The recorded request lists cover Document/XHR/Fetch responses, not a complete asset ledger. No other product was actively opened, no sample was manually navigated, and no account/library/purchase action was taken. The Read More clicks were reversible description expansion controls.

The local corpus was `galactic-library-backup-v1 (2).json` from Downloads, exported `2026-10-05T00:48:15.011Z`. SHA-256: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`. Its bytes were not modified. Audit labels came from the [committed quality audit](kindle-contents-quality-audit.md), and the [quality-pass report](kindle-contents-quality-pass.md) remains the baseline.

## 1. Current GL extraction path

| Step | Actual implementation and implications |
| --- | --- |
| Importer context | [kindle-content.js](../../src/providers/kindle-content.js), `attachKindleSync`, installs only on `/hz/mycd/`. The Amazon content scripts run at `document_idle`, normally in the extension's isolated content-script world. This is not a product-page live-DOM scan. |
| Queue preparation | `enrichComicContents` sends `GET_KINDLE_COMIC_CONTENT_CANDIDATES`. [service-worker.js](../../src/background/service-worker.js) obtains the database and calls [kindleContentsPlan](../../src/lib/kindle-contents.js). Eligible books have supported Amazon `/dp/<ID>` URLs; collection/genre hints only order them. |
| URL | `kindleItemFromOwnershipItem` builds `https://www.amazon.com/dp/<providerItemId>`. The two exact URLs above came from saved `metadata.detailUrl`. |
| Request | [fetchKindleProductComicContents](../../src/providers/kindle.js) performs browser `fetch(url, {credentials:'include', cache:'no-store', signal})`. Default method GET. No custom headers, Accept-Language or User-Agent are supplied. The browser supplies those and applicable same-origin cookies. No password/token extraction is involved in this lookup. |
| Request execution | The content-script adapter fetches from the signed-in Amazon library tab. The service worker prepares/saves records; it does not execute this product fetch. Cookies can therefore be available in production, unlike this anonymous audit. Exact historical request headers were not preserved and cannot be reconstructed. |
| Response | Await `response.text()`, then `new DOMParser().parseFromString(body,'text/html')`. The body is read to completion. The parsed document is inert: Amazon scripts do not execute and external styles/resources are not loaded by this parser. |
| Response checks | HTTP 404 becomes unavailable; other non-OK statuses throw. Selected CAPTCHA and sign-in selectors throw. HTTP 200 alone does not establish that a complete product description was received. |
| Regions, in order | `#bookDescription_feature_div`, `#productDescription`, `#featurebullets_feature_div`, `#productOverview_feature_div`, `[data-feature-name="bookDescription"]`. Each may match multiple elements. |
| Text | `element.textContent`; `compactText` collapses whitespace. Text hidden by CSS/overflow is still included. DOM paragraph boundaries are flattened. Attributes, script JSON values and escaped HTML are not deliberately decoded as alternative description sources. |
| Trigger | `explicitContentsStatement` finds the first `collect/collects/collecting/contain/contains/containing/include/includes/including/comprise/comprises` trigger and captures at most 10,000 following characters. No contextual ranking occurs here. |
| Truncation | The candidate is cut at the first accepted punctuation boundary. Abbreviation/initial exceptions and generation-3 question/exclamation handling apply. Quotation marks/flattened sentences can still make a candidate span extra prose. |
| Early return | `kindleContentsStatementFromDocument` immediately returns the first nonempty candidate from the first matching region. It does not inspect later triggers in that region, compare other elements, or evaluate quality before returning. |
| Read More | No expansion, readiness observation or special marker handling occurs in this extraction function. A Read More control can become literal `textContent`, but often lies after the candidate has already been truncated and never reaches the saved statement. |
| Chosen statement | The exact choice occurs at `const statement = explicitContentsStatement(element.textContent); if (statement) return statement;`. `fetchKindleProductComicContents` returns that string with source URL, availability and extractor generation. |
| Persistence and quality | `enrichComicContents` buffers the result, then sends `SAVE_KINDLE_COMIC_CONTENTS`. [saveKindleComicContents](../../src/background/storage-writer.js) validates and preserves source evidence and calls [contentsParseState](../../src/lib/kindle-contents.js). [assessContentsQuality](../../src/lib/contents-quality.js) therefore sees only the already selected fragment. It cannot choose a later sentence discarded upstream. |

The two controls matched both the ID selector and the data-feature selector on the same description wrapper, plus an empty overview wrapper. Those aliases are not independent description evidence. Hidden descendant markup contributes text; embedded JSON, escaped HTML stored inside scripts/attributes and alternative representations are not intentionally searched. A script descendant could incidentally contribute literal script text via `textContent`, which is different from structured decoding.

Existing request pacing/retries are unchanged: sequential requests, existing one-second between-item throttle, at most three transient attempts with the existing two-/four-second retry waits, a 30-second request abort, and existing grouped checkpoints. These pre-existing waits were inspected, not added or used as hydration fixes. A sleep after `DOMParser` would not execute Amazon scripts or expose a later live DOM.

## 2. Exact control-source findings

### Book Four

The second navigation returned HTTP 200, 1,039,111 UTF-8 bytes. Its raw HTML contained the literal final sentence, and reparsing it with DOMParser placed that text in `#bookDescription_feature_div`. The independent GL-options fetch also returned HTTP 200 and contained the sentence in that same region. Its recorded length of 1,035,395 is JavaScript string length, not a UTF-8 byte measurement.

The complete region was 739 normalized characters, including the Read More control text. It already contained the story-arc introduction, plot, final numbered manifest and control text. No matching inline-script representation was needed or found by the diagnostic's bounded expected-phrase search.

With this complete text, generation 2 chooses **exactly the historical saved story-arc fragment**, ending at “would you take it.” Generation 3 chooses a longer fragment, through “one hundred rounds of ammunition,” but still excludes the final Collects sentence. Parsing the separately isolated Collects clause with the unchanged current quality/parser yields **22 issue proposals, #59–80**, full structurally and still unverified.

### Book Five

The second navigation returned HTTP 200, 1,034,395 UTF-8 bytes, and its GL-options fetch returned HTTP 200 with 1,032,982 JavaScript characters. Both contained the final sentence in the first description region. The region was 726 normalized characters including Read More.

Both historical and current extraction choose **exactly the saved plot fragment**, `containing an untraceable gun and 100 rounds of ammunition`. Existing quality assessment filters that fragment and produces no entries. The separately isolated later Collects clause yields **20 issue proposals, #81–100**, full structurally and unverified.

In the initial run, Book Five's navigation instead returned a small 3,781-byte HTTP-200 document with none of the inspected description regions and no expected manifest. A subsequent same-origin fetch of the identical URL returned the full product description. This establishes response variation/source adequacy risk in this anonymous context, but not its cause: the small body's title/context were not captured. It cannot responsibly be labelled a particular challenge, cookie dependency or hydration endpoint. GL's observed fetch itself contained the manifest.

### Raw/static versus live comparison

| Representation | Book Four | Book Five |
| --- | --- | --- |
| Second-run raw navigation response | Exact Collects sentence present | Exact Collects sentence present |
| Parsed static HTML, first GL selector | Present | Present |
| Same-origin fetch with GL options | Present, but GL selects earlier fragment | Present, but GL selects plot fragment |
| CSS-clipped description DOM | Text present; geometric clipping observed | Text present; geometric clipping observed |
| First observed live description insertion | Complete text already present at ~1,259 ms | Complete text already present at ~770 ms |
| Explicit Read More expansion | Reveals existing sentence | Reveals existing sentence |
| Matching inline script/JSON text | No matching script found; not required | No matching script found; not required |
| Later description-data endpoint required | No evidence of one being required | No evidence of one being required |
| Historical signed-in initial response | Not preserved; unknown | Not preserved; unknown |

The inline-script negative is a limited phrase search, not proof that no encoded duplicate exists anywhere. Finding the text in ordinary inspected HTML makes such an alternative unnecessary for these controls. Successfully inspected later XHR/fetch bodies revealed the manifest in the audit's own explicit `/dp/` fetch, not a separate description endpoint. Some response bodies may be unavailable to CDP; absence of a recorded match is not proof no other representation was delivered.

## 3. Read More lifecycle

For both successful second-run pages, the observed lifecycle was:

```text
main response already contains complete description + Collects + expander control
  -> first description DOM insertion already contains that same text
  -> expander container clips the last paragraph at 280 px
  -> client layout/style updates change geometry, not description content
  -> Read More is explicitly clicked
  -> control becomes Read less; expanded class/height exposes existing text
```

The control is an Amazon `<a class="a-declarative">` inside the description. Its ancestors include `a-expander-content a-expander-partial-collapse-content` and `a-expander-collapsed-height ... a-expander-container ...`. Initially `max-height: 280px` and `overflow-y: hidden` clipped the Collects text. Later layout initialization removed that max-height property but retained a 280-pixel collapsed height and clipping. Clicking added `a-expander-content-expanded`, changed the control text to Read less, and expanded to roughly 344 pixels for Four / 364 for Five. Normalized description length stayed 739 / 726; only the control text changed.

Approximate `performance.now()` observations, relative to each navigation:

| Event | Four | Five |
| --- | ---: | ---: |
| First observed description with Collects already present | 1,259 ms | 770 ms |
| DOMContentLoaded | 2,499 ms | 1,830 ms |
| Layout mutation with same description text | 2,511 ms | 1,845 ms |
| Window load | 3,210 ms | 2,475 ms |
| Audit's deliberate expansion click | 9,545 ms | 9,446 ms |

The late click times are **audit actions**, not Amazon hydration latency. The observer resolved on geometric visibility or a seven-second maximum observation deadline. That deadline limits investigation time; it is not a sleep, readiness guarantee or proposed production delay. Both controls remained geometrically clipped during this passive window. The first probe's `innerText` presence was misleading because rendered text can still be overflow-clipped; it is excluded from visibility conclusions.

Read More here is a control label present in source markup, not part of the publisher's manifest. It marks presentation truncation in these responses. It does **not** prove missing source, nor does its absence prove complete source. Other page variants may replace or fetch text dynamically. The user's signed-in automatic update remains unverified by this anonymous run; a future signed-in observation should compare description `textContent`, text-node insertion, classes/heights and relevant response data independently.

## 4. First-trigger bug versus incomplete-source bug

**Bug class 1 is confirmed for both controls.** Supply the complete available description and GL still returns an earlier inferior candidate. The generation-2 reproduction exactly matches the saved export. That establishes sufficiency of the selection/truncation bug; it is strong evidence for the historical explanation, not proof that the original HTTP responses were identical to today's.

**Bug class 2 is not established for these GL-style control fetches.** Neither observed successful GL-options response needed hydration for the numbered manifest. The automatic signed-in transition cannot be classified from this environment. The small initial Book Five navigation demonstrates that source adequacy/response variation can be independent of candidate ranking, but was a navigation variant rather than a missing-manifest GL-style fetch.

Therefore these controls support **one necessary core fix: candidate selection**, with source adequacy evidence/diagnostics as a distinct requirement. They do not justify mandatory live-DOM navigation, expansion or fixed waiting in every lookup. A truly missing description representation would require a second source-acquisition fix; this audit has not shown that such a fix is required to recover these two manifests.

Possibility classification:

- **A, ordinary static response but wrong selection:** directly established, both controls.
- **B, alternative/hidden/embedded representation:** CSS-clipped ordinary markup established; embedded decoding or an alternate source is unnecessary here.
- **C, newly inserted manifest from hydration:** not established. First observed description text already contained it.
- **D, Read More expansion:** directly established as visibility clipping/expansion, not source-text availability.
- **E, separate later data request:** not required by observed evidence; no identified description endpoint supplied the missing sentence.
- **F, request-context variation:** different HTTP-200 responses observed for Five; exact dependency unknown. Signed-in/cookie/locale/User-Agent effects were not isolated.
- **G, combination:** A plus D explain the successful responses. F remains an independent environmental risk, with signed-in behavior unresolved.

## 5. Multi-candidate feasibility

The current static architecture can expose the complete control descriptions. Finding every bounded trigger within the available blocks would allow the existing quality/parser to compare the actual candidates. An **offline diagnostic**, not a replacement extractor, isolated each trigger from the observed complete text:

| Candidate | Existing assessment | Existing structural result |
| --- | --- | --- |
| Four: earlier story-arc/prose candidate | Plausible containment | Failed; zero identified units |
| Four/Five: gun/ammunition plot candidate | Filtered non-containment | Zero entries |
| Four: later numbered manifest | Containment | Full, 22 units |
| Five: later numbered manifest | Containment | Full, 20 units |
| `Includes Wool, Shift, and Dust` | Containment | Full, three named components |
| `Contains Epic Books 1-3` | Containment | Full, three volumes |
| Contributor Includes / delivery-feature Includes | Filtered | Zero entries |

This supports contextual/structural ranking, **not a fixed verb order**. Candidate assessment should consider work/constituent identity, numeric anchors, unit labels, supported structure, subject/collection context, meaningful residuals, excerpt scope and negative plot/feature/credit evidence. A parsed-full score alone is not enough to certify a bibliographic manifest or product-source completeness. Existing quality classification is useful but heuristic, not a universal confidence score.

Retain block boundaries, minimal surrounding context, region identity and candidate offsets when extracting; avoid flattening unrelated paragraphs before selection. Deduplicate the same wrapper reached through ID/data-feature aliases. Detect quoted title punctuation without mistaking every period/conjunction for a boundary. Bound the number/size of candidate blocks and retain the original bounded source text separately from normalized parser input.

Complementary contents sometimes must survive: the existing parser correctly represents a clause containing full SERIES #1–6 plus excerpt material from OTHER SERIES #7. It also produces the same scopes from those two independent legitimate clauses. A later implementation should preserve both pieces of evidence when they describe distinct constituents, while retaining their scope/run/language and unresolved conflict state. These are feasibility probes; no live complementary-manifest product was investigated. A complex merging system is not justified by these controls. Select a primary strong statement and preserve useful secondary evidence; combine only straightforward compatible clauses once appropriate fixtures support that behavior.

## 6. Corpus implications: what is known locally

The source backup contains **saved selections, not the original HTML or full descriptions**. Population membership identifies investigation priorities; it cannot establish that another sentence existed on any unrefreshed page.

| Population | Known locally | Unknown without refreshed source |
| --- | --- | --- |
| 330 false extractions | 249 filtered, 67 uncertain, 14 failed; none emits proposals | Whether a correct later candidate was omitted. Five proves this can happen even to a filtered fragment. |
| Remaining 81 false fragments | All remain unstructured; useful context may be missing | Whether stronger complete work evidence is available elsewhere |
| 308 originally useful failures | 73 now structured; 235 still without proposals | Missing candidate versus unsupported grammar or genuinely incomplete enumeration |
| All useful currently without proposals | 271, across all baseline outcomes | Not all are source failures; many are generic/count-only claims |
| Useful current partial proposals | 194 | Whether residuals can be resolved from a better block or remain ambiguous |
| Terminal-marker warning population | 75: 59 useful, 15 false, one audit-uncertain | Which marks only CSS presentation, which accompanies source incompleteness |
| include*/contain* | 406: 317 false, 72 useful, 17 uncertain | How often a later better candidate was omitted |
| Multiple trigger words in saved selections | 49 | Not 49 known independent manifests; some words are prose/duplicates |
| Later collect* word in a saved selection | Six; four distinct weak-lead/collect cases | Source completeness outside the saved fragment |
| No-statement | 1,059 | True lack of description candidate, omitted representation, page variant or inadequate response |
| Unavailable | 615; new lookups represent HTTP 404, legacy exact cause unknown | Whether any accessible current source exists |

The **235** means unresolved members of the original 308 useful-failure subset, not every unresolved useful record after the pass. Local analysis found all 271 current useful candidates without entries plus 194 useful partial proposals.

Terminal marker outcomes after the completed pass are 35 full, 12 partial, eight failed, 19 uncertain and one filtered. Those 35 full fragments still carry source warnings. A marker is an investigation flag, not proof they need more parsing or that a page is incomplete.

Four saved weak-lead/later-collect cases are audit #0225 (Batman: Bruce Wayne—Murderer?), #0229 (Emperor Penguin), #0516 (Fables: Storybook Love), and #1192 (Swamp Thing: Darker Genesis). Two additional later-collect matches are duplicated leading Collects wording, #0960 and #1388, not evidence requiring a source refresh. Several later clauses lack explicit series identities; selecting “issues of the original series” still cannot create a reliable series from a parent title.

### Local fixes versus source refresh

Where a later clause is **already in saved text**, a future bounded candidate-selection pass can inspect it locally. The existing quality and parser improvements already handle supported saved syntax; this task does not redesign them. Duplicate introductions and supported normalization do not warrant a new request.

Where a clause was **discarded before saving**, as in both control records, source refresh is necessary to acquire it. Local reparse cannot invent or retrieve unsaved text. Nor can it reconstruct hidden/encoded description blocks or explain past no-statement/unavailable results. Count-only claims, generic ranges and uncertain constituent identity can remain unresolved even after refreshing.

## 7. Proposed targeted refresh populations

These are offline, deduplicated proposals against the same 3,194 eligible books, not changes to eligibility and not an executed rescan:

1. **Acceptance controls: two pages.** Prove the eventual static multi-candidate implementation selects #59–80 and #81–100 with preserved evidence and no verification/ownership change.
2. **First pilot: 77 pages (2.41%).** Union of the two controls and all 75 terminal-marker records. None of the two saved control statements contains the marker, so both must be included explicitly. Marker-positive syntax-full records are retained to investigate source completeness, not to presume failure.
3. **Expanded suspect set: 642 pages (20.10%).** Deduplicated union of controls, all 75 marker records, all 330 known false selections, the 235 original useful failures still without entries, and 26 strict collection-looking negatives. This includes noise rejected by the quality pass because a wrong first fragment can hide useful later text. Do not prioritize only the remaining 81.
4. **Optional broader-negative expansion: 743 pages (23.26%).** Replace the 26 strict negatives with 127 broader collection-looking negatives if the earlier experiment proves productive.

The strict negative subset is 14 no-statement + 12 unavailable; the broader subset is 59 no-statement + 68 unavailable. Title hints are triage signals, not proof of collected contents. Repeated 404s may remain unavailable and should not be hammered. Fifteen marker records overlap known false selections, and nine overlap the original useful unresolved-failure subset; counts above account for overlap.

Four saved later-collect cases should be examined locally before any request and can serve as additional offline controls. A selected refresh queue is **not currently exposed** by GL: the current explicit Rescan mode revisits all eligible records. Implementing a selected queue would be separate authorized work, preserving existing pacing, retry and checkpoints. This audit did not call Rescan.

A full 3,194-page rescan is **not justified by this evidence**. The recovery rate of either proposed set is unknown. Begin with two controls, then the 77-page pilot; broaden only with measured candidate/source improvements.

## 8. Implementation options

Compatibility below is architectural assessment, not a new Firefox live Amazon test. Static parsing uses the current shared browser code path. Keep same-origin requests within existing authorization and do not introduce credential/header interception.

| Option | Solves / does not solve | Reliability, coupling and complexity | Permissions/context; performance/pacing; old records |
| --- | --- | --- | --- |
| **Static multi-candidate blocks + existing quality** | Directly solves both observed first-trigger misses; cannot read truly absent source | Best supported choice; moderate boundary/dedup work; Amazon selector coupling already exists | Chrome/Firefox shared path; no new privileges; same current signed-in tab context; same request count/pacing, small bounded CPU cost. Missing saved clauses require targeted refresh. |
| **Source adequacy/context diagnostics** | Distinguishes usable description from HTTP-200 missing regions; cannot certify exhaustive contents | Low/moderate; explicit product/region/representation evidence is more deterministic than timing | Same permissions/context and pacing; no forced extra request. Can classify future sources, but old HTML cannot be reconstructed. |
| **Alternative static/embedded representation** | Helps only if evidence appears there; no benefit established for these two ordinary-markup cases | Medium/high coupling to unpublished Amazon shapes; decode only identified allowlisted fields | Usually shared static browser path, no extra request if same body; bounded parsing. Refresh old missing sources after a demonstrated extractor improvement. |
| **Live DOM observation with explicit readiness signals** | Could capture actually client-inserted descriptions; candidate selection still necessary | Higher complexity/tab lifecycle/variant coupling; whole-document silence is not description completeness | Need product-page/tab workflow beyond current library fetch, possibly additional tabs/scripting permissions. Chrome/Firefox lifecycle differences require testing; signed-in context may matter. More resources and navigation; pacing implications need separate design. No evidence mandates it here. |
| **Click description expander** | Reveals visibility-clipped text; does not improve `textContent` when full text already exists | Brittle control/layout coupling; unnecessary for these static responses | Live page only, reversible UI action; may have state/race effects. Cross-browser action tests needed. Not a required extra fetch here; old saved omissions still need source reacquisition. |
| **Known later description response** | Could help if a specific endpoint provides absent data | No such required endpoint identified; high undocumented protocol coupling | Security/permissions/request semantics unresolved. Avoid intercepting arbitrary traffic/tokens. Potential extra requests/changed pacing; not recommended without new evidence. |
| **Targeted refresh after extractor fix** | Acquires omitted source and measures gains; cannot fix selection by itself | Existing queue/checkpoint model can support a selected subset; medium work | Current signed-in context and Chrome/Firefox flow can remain. Same concurrency/pacing per selected page, fewer total requests. Explicitly preserve reviewed contents and history. |

No option should treat a stronger syntax score as verified contents, infer ownership, narrow eligibility, or silently replace reviewed contents. Rejected candidates describe a fragment's meaning, not absence from the product.

## 9. Smallest evidence-backed next implementation

Retain the current static-fetch architecture. In a separate implementation task:

1. Obtain bounded description blocks from the existing response and record basic source adequacy. Inspect all plausible candidate clauses instead of returning the first trigger. Preserve paragraph/title/quote boundaries and deduplicate selector aliases.
2. Apply existing quality assessment and structural parsing to each candidate. Prefer explicit reliable constituents over plot/credit/features or unsupported prose. Preserve legitimate named Includes/Contains evidence. Do not implement a hard-coded Collects-first verb preference.
3. Select the strongest supported primary evidence with its original text and block context; retain useful secondary/uncertain candidates within bounds. Preserve complementary full/excerpt scope, and expose conflicts instead of silently merging or completing them. Minimal candidate provenance may need an optional validated metadata extension, but no ownership/identity redesign is justified.
4. Preserve source completeness uncertainty independently of parsing success. A Read More control with full static contents is not a reason to fetch again or wait. A successful status with no usable description is not proof of no contents. Absence of a marker, page load, DOMContentLoaded or a full parse cannot certify a complete bibliographic manifest.
5. Validate the two controls, re-evaluate already captured multi-candidate text locally, then run only an explicitly selected refresh pilot at existing pacing. Do not invalidate every generation-2 negative or force a full library rescan.

“Stable/complete enough” should mean adequate, non-challenge source for the expected product, a usable description representation, preserved block boundaries, and consideration of all bounded candidates in that representation. Because `response.text()` reads the response to completion and static parsing does not execute client scripts, no timer-based stability condition is needed for these responses. For a future demonstrated client-only variant, use representation-specific readiness/mutation or request-completion evidence with a bounded deadline and unresolved fallback. Neither a fixed sleep nor generic network-idle guarantees completeness.

Answers to the primary questions: missing control text is in static inspected markup; GL misses it through first-trigger selection/truncation; that selection defect is independently proven; missing/hydrated-source acquisition is not independently proven for these GL-style responses; one core fix is necessary here, with conditional source-adequacy handling kept separate; static fetch can remain; multiple bounded blocks/candidates should be retained; refreshed records should be targeted, with 77 as the first proposed pilot; a full rescan is unwarranted.

## 10. Future regression plan — not implemented here

Specify fixtures and assertions before the eventual implementation:

- **Book Four full source:** early story arcs and plot plus later #59–80. Select the 22-unit manifest; preserve useful arc evidence without letting it hide the manifest. Test both generation-2 saved fragment and observed complete description.
- **Book Five full source:** plot containing gun/ammunition plus later #81–100. Select 20 units; filtered plot cannot win because it is first.
- **Static clipped source:** manifest exists under an expander, with Read More present. Recover without clicking, executing scripts or adding requests.
- **Actual incomplete source:** early fragment/Read More but no manifest. Preserve unresolved evidence; no fabricated range and no timing-based success.
- **No marker:** one complete and one genuinely incomplete description with no Read More. Do not use absence as proof of completeness.
- **Named Includes / numbered Contains:** Wool/Shift/Dust and explicit book ranges remain viable, independent of verb order.
- **Contributor Includes, plot Contains, product-feature Includes:** filtered evidence cannot displace a legitimate later clause.
- **Multiple regions and duplicate aliases:** later stronger region considered; identical wrapper counted once.
- **Quotes/paragraph boundaries:** punctuation inside names preserved; early question/quote boundary does not prevent later candidate enumeration.
- **Complementary legitimate clauses:** full SERIES #1–6 plus material from OTHER #7, both in one block and separate blocks; excerpt never becomes full during combination. Conflicting scopes/identities remain reviewable.
- **Response adequacy:** HTTP-200 empty/non-product/interstitial-like source is distinguishable from a usable description without relying solely on status; CAPTCHA/sign-in/404 and bounded timeout behavior remain intact.
- **Conditional client-only variant:** simulate manifest insertion with a specific readiness event and no insertion before deadline. No fixed sleep and no claim of success merely because DOMContentLoaded fired.
- **Reviews/history/ownership:** refresh or candidate reselection preserves verified contents, undo/source evidence and effective ownership. Named unverified components never become ordinary owned matches; HB/FAN central matching remains unchanged.
- **Queue/performance:** selected refresh only, unchanged pacing/concurrency/checkpoints, no automatic 3,194-page repeat, and local recovery where a stronger clause was already saved.

These are future requirements, not changes to production tests or behavior in this audit.

## 11. Remaining unknowns and validation limits

The historical original HTML/headers are absent. Exact signed-in automatic expansion/hydration, locale/device variants and authentication dependencies were not reproduced. Live Amazon observation was Chrome-only, anonymous and headless; no personal profile was accessed. Geometry indicates clipping, but there is no screenshot/video verification. The initial small Book Five HTTP-200 response's cause is unknown. A phrase search is not exhaustive encoded-source discovery, and unavailable network bodies are not negative evidence. No recovery rate can be predicted for unrefreshed corpus populations.

The diagnostic scripts passed syntax checks. Offline probes reproduced the historical fragments, obtained the expected 22/20 proposals using unchanged quality/parser code and recomputed all proposed population unions. No production tests were edited or broad suite rerun for this report-only task. Git inspection confirms no tracked production files changed, and the source backup hash remains unchanged. No commit was made.

Files added: this report, the three evidence JSON files and two analysis-only `.mjs` scripts listed above. Existing `start.txt` and other user files were left alone. Stop here: implement no extractor, hydration, ranking, schema, scan or ownership change until the separate next implementation task is authorized.
