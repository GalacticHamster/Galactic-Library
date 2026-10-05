# Kindle contents-discovery quality audit

> Historical engineering record. Versions, counts and implementation status describe that investigation, not the current release. Generated run ledgers are local under `audit-artifacts/`; see the [artifact policy](../development/artifacts-and-audits.md).

Audit date: October 4, 2026 (America/New_York). Repository inspected at **008b529**. **Audit only:** no implementation, export, schema, ownership, identity, provider importer, HB, or FAN changes; no network requests.

## 1. Executive summary

The scan has established broad discovery coverage, not a verified inventory of contained works. All **1,520 nonempty saved Kindle statements** were classified and rerun through the existing parser in memory. The appendix contains a classification ledger for every record.

- **1,167 statements (76.78%)** were coded Strong/Likely/Mixed containment; **330 (21.71%)** false extractions; **23 (1.51%)** uncertain.
- Of **655 full parses**, **646** have a genuine containment signal, **7** are false extractions, and **2** are uncertain. This does **not** mean 646 correct structured manifests: at least **16 additional full parses have demonstrably wrong structure or series labels**. Another overlapping set of **62 full parses** is exposed to the global excerpt-scope rule.
- Of **650 failed parses**, **308 (47.38%)** contain useful containment evidence, **321 (49.38%)** are false extractions, and **21 (3.23%)** are uncertain. Parser failure cannot substitute for semantic filtering.
- Collect-family candidates have **98.47% apparent containment yield** under this coding, include-family **19.40%**, contain-family **9.86%**. Keep these verbs as investigation triggers and evaluate context before proposing contents.
- **521 genuine statements remain partial or failed.** An offline experiment removing terminal “Read more” improved **34** genuine records; **28** became syntactically full, producing **172** additional proposed entries. This measures parsing improvement, not verified correctness.
- **21 specifically identified non-comic statements** demonstrate useful prose/anthology/contained-unit targets. All currently fail. Their main blockers are grammar, lost context, or missing constituent identifiers; none is proven to fail primarily because first-class work identity fields are absent. Two long contained titles also exceed the current name limit.
- **Zero verified contents reviews** exist in this export. Discovered statements and unreviewed proposals supply no verified contents-index ownership evidence.

**Recommended next implementation:** contextual containment quality assessment; safeguards for named-list fallback and numbered labels; clause-level full/excerpt scope; narrowly bounded removal of extraction artifacts. Preserve broad eligibility and ambiguous investigation candidates. Follow with evidence-bounded numbered and quoted-title parsing. Do not begin with a schema redesign or a blanket ban on “includes.”

## 2. Corpus validation and methodology

Primary file: **galactic-library-backup-v1 (2).json**, the newest GL backup in Downloads when inspected. Size: **23,252,734 bytes**. Export timestamp: **2026-10-05T00:48:15.011Z**, or **October 4, 2026, 8:48:15.011 pm EDT**. The UTC date explains the locally October 4 export.

SHA-256: `3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e`.

Backup v1; database schema **12**. The actual backup reader accepted it in memory. The legacy property name `kindleProductComicContents` does not impose comic-only eligibility. All 1,520 saved statements use parser version **2**. There are **2,894 extractor-version-2 results** and **300 results with no recorded extractor version**.

| Metric | Count | Meaning |
| --- | --- | --- |
| All provider items | 14,081 | Context only; this audit targets Kindle |
| Kindle books | 3,322 | All Kindle mediaType=book records |
| Eligible/supported products | 3,194 | Kindle books with supported amazon.com/dp URLs |
| Unsupported Kindle book URLs | 128 | Outside this adapter’s URL shape |
| Saved Kindle lookup results | 3,194 | Every supported product has a saved outcome |
| Nonempty statements / derived statement-found | 1,520 | 152 legacy + 1,368 explicit current outcomes |
| Literal availability=statement-found | 1,368 | 152 legacy statements omit availability |
| No-statement | 1,059 | Successful lookup with no extracted candidate |
| Unavailable | 615 | Public-page lookup unavailable; see section 10 |
| Temporary/error outcomes | 0 | No saved temporary-failure outcomes |
| Never checked / legacy blank unknown | 0 | Among currently eligible products |
| Full / partial / failed | 655 / 215 / 650 | Recomputed outcomes agree with every saved outcome |
| Proposed entries | 10,332 | Computed suggestions, not verified manifests |
| Verified Kindle contents reviews | 0 | Entries in database.contentReviews for Kindle |
| Verified reviews, all providers | 0 | No reviewed contents inventory in this backup |

Computed proposals comprise **10,143 issue**, **111 annual**, **18 special**, **5 volume**, and **55 component** entries. These include proposals subsequently identified as incorrect. Proposed-entry count is not owned-work count.

### Pre-scan comparison

The October 2 backup, **galactic-library-backup-v1 (1).json**, exported **2026-10-02T21:29:06.888Z**, is comparison data only. It has the same **3,322 Kindle books**, **461 saved lookups**, **152 nonempty statements**, **148 unavailable results**, and **161 legacy blank outcomes**. Another **2,733** supported products had no lookup.

Discovery increased by **1,368 statements**, from **152 to 1,520: tenfold, or 900%**. New-version results reconcile as **1,368 statement-found + 1,059 no-statement + 467 unavailable = 2,894**. Retained legacy results reconcile as **152 statements + 148 unavailable = 300**. The scan fetched **2,733 previously unchecked + 161 legacy blank** products. Normal scan has no remaining fetch candidates; saved parse outcomes all agree with current local parsing.

### Method and limits

This is a complete **record-weighted, rule-assisted semantic audit**, not an Amazon-page verification exercise. Statements were sorted by title using Node’s `localeCompare`, then item ID, assigning ordinal ledger IDs 0001–1520. All were evaluated independently of parse outcome. Include/contain/comprise candidates and exceptional collect candidates received contextual coding; remaining collect candidates were classified using explicit numbered-work and mixed-content patterns. Each ledger row records class, rationale, trigger and outcome.

There are **1,480 unique statement strings** across 1,520 records. Percentages describe saved records, not 1,520 independent extractor trials. The boundary between Strong/Likely/Mixed is revisable. “Precision” below means **apparent containment yield under this audit coding**, not measured recall, confidence intervals, or proof of identity.

Only saved text and parent titles were available. Missing subjects, adjacent paragraphs, list structure and edition context prevent reliable classification in some cases; those remain uncertain or likely. No source HTML survives, so omitted-candidate recoveries cannot be counted. No network requests were made. All parsing and cleanup experiments used in-memory copies. The export was not rewritten.

Strong means explicit contained units/names; Likely means useful collection/work claims with incomplete enumeration/context; Mixed means work information plus credits, extras or differing extent; False means people/topics/features/plot/purchase advice rather than contained works; Uncertain means insufficient context. Classification concerns **meaning**, not successful syntax.

## 3. Semantic statement quality

| Class | Records | % of 1,520 |
| --- | --- | --- |
| A — Strong containment | 885 | 58.22% |
| B — Likely containment | 88 | 5.79% |
| C — Mixed containment | 194 | 12.76% |
| D — False extraction | 330 | 21.71% |
| E — Uncertain | 23 | 1.51% |
| Total | 1,520 | 100% |

Representative examples:

- **A, #0071:** Amazing Spider-Man Masterworks Vol. 9: “Collects Amazing Spider-Man (1963) #78-87.” Explicit series/run/range; currently full.
- **A, #0298:** Beatrix Potter’s Beloved Tales explicitly lists four tales; currently failed on list grammar. The parent title names a fifth tale; do not use that discrepancy to invent a complete source manifest.
- **B, #1482:** Wool Omnibus: “collects the five Wool books into a single volume.” Desirable collection claim, but no five individual titles. **It does not say Wool + Shift + Dust.**
- **B, #0901:** Neverwhere: “including his special Neverwhere tale, ‘How the Marquis Got His Coat Back’.” Potentially valuable story inclusion. Missing leading context and appended publication prose prevent automatic confirmation. Do not reject it merely for “including.”
- **C, #0046:** Great Power collects regular issues and an annual, plus “material from” another issue. These extents must differ.
- **D, #0275:** Batman: The Return of Bruce Wayne: “including Chris Sprouse, Frazer Irving and Yanick Paquette.” Credits, not contained works.
- **E, #0380:** Crystal Blue: “includes Red Right Return and Green to Go.” Could be containment or promotional bibliography; the missing subject matters.
- **E, #0895 / #1026:** “Collects Ms” / “Collects Sgt.” Abbreviation handling truncated the work names.
- **E, #0629 / #0636:** Hellboy descriptions say “collect all of Mignola’s … stories.” The lost subject may be the entire multi-volume series rather than the purchased volume.

## 4. Trigger-family precision

| Trigger | Total | A | B | C | D | E | A+B+C yield | False yield |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| collect* | 1,112 | 875 | 47 | 173 | 11 | 6 | 98.47% | 0.99% |
| contain* | 71 | 2 | 2 | 3 | 62 | 2 | 9.86% | 87.32% |
| include* | 335 | 8 | 39 | 18 | 255 | 15 | 19.40% | 76.12% |
| comprise* | 2 | 0 | 0 | 0 | 2 | 0 | 0% | 100% |
| Other | 0 | 0 | 0 | 0 | 0 | 0 | — | — |

Collect is high yield but not foolproof: “Collect all …” can be imperative purchase advice. Both comprise candidates are false, but **two records do not justify deleting that verb**.

Of 330 false extractions, **255 (77.27%)** came from include and **62 (18.79%)** from contain. Removing include would also lose **65 genuine + 15 uncertain** candidates; removing contain loses **7 genuine + 2 uncertain**. A contextual quality stage is supported far better than deleting verbs or restricting eligibility.

## 5. Semantic quality × parser outcome

| Semantic class | Full | Partial | Failed | Total |
| --- | --- | --- | --- | --- |
| A — Strong | 582 | 144 | 159 | 885 |
| B — Likely | 0 | 0 | 88 | 88 |
| C — Mixed | 64 | 69 | 61 | 194 |
| D — False | 7 | 2 | 321 | 330 |
| E — Uncertain | 2 | 0 | 21 | 23 |
| Total | 655 | 215 | 650 | 1,520 |

**Full:** 582 Strong + 64 Mixed = **646 genuine containment signals (98.63%)**; 7 false (1.07%); 2 uncertain (0.31%). Strong wording does not prove that proposed entries correctly represent it. The structural counterexamples below prevent calling 646 accurate manifests.

**Failed:** 159 Strong + 88 Likely + 61 Mixed = **308 useful failures (47.38%)**; 321 false (49.38%); 21 uncertain (3.23%). Almost half need parser support; almost half need filtering/separate investigation status.

**Partial:** 213 genuine and 2 false. The **521 genuine unresolved** records are **308 failed + 213 partial**: **34.28% of all statements**, or **44.64% of genuine statements**.

Currently full means entries exist and no chunks remain unparsed; partial means entries plus leftovers; failed means no entries. None reports semantic quality, complete collection coverage, source verification, identity or ownership. UI should explicitly say “proposal” and show quality/review status separately.

## 6. False-full and misleading-full findings

### All seven semantic false-full cases

| ID | Product | Why false | Bogus components |
| --- | --- | --- | --- |
| 0275 | Batman: The Return of Bruce Wayne: Deluxe | Chris Sprouse, Frazer Irving, Yanick Paquette are contributors | 3 |
| 0327 | Brands Don’t Grow on Trees | Customer Advocacy / Brand Development / Cultural Mapping / Management Structures are instructional topics | 2 |
| 0334 | Brooklyn Travel Guide: 2-Day Foodie Tour | Carroll Gardens, Cobble Hill, Brooklyn Heights, Ft are locations/truncated prose | 4 |
| 0524 | Fables: The Wolf Among Us Vol. 2 | Travis Moore, Shawn McManus, Eric Nguyen, Steve Sadowski are contributors | 4 |
| 0761 | Justice League Vol. 5: Forever Heroes | Batman’s protege, Dick Grayson is a character description | 2 |
| 0762 | Justice League Vol. 6: Injustice League | Doug Mahnke, Jason Fabok, Ivan Reis, Scott Kolins are contributors | 4 |
| 1317 | The Mystery Series Collection (Books 1–3) | “Collect All 21 Full Length Novels and 15 Short Stories … reviews/ratings” is imperative catalogue promotion | 3 |

These generate **22 bogus component proposals**. Capitalization, short names and separators do not establish work identity or containment. A collection-looking parent title does not repair a false fragment.

The **two false partials** also produce **two bogus numbered entries**: #0203 Batman Eternal Vol. 2 extracts a reference to the current product’s volume from contributor prose; #1035 Simply Delicious Raw Recipes extracts a future Desserts volume from “collect the entire series as it’s released … to be released soon.” Neither is included-volume evidence.

### Structural errors within genuine full statements

| ID | Product | Wrong full proposal | Supported interpretation |
| --- | --- | --- | --- |
| 0299 | Before Watchmen: Comedian/Rorschach | Two literal components ending 1–6 and 1–4 | Ten numbered issues across two named series |
| 0300 | Before Watchmen: Minutemen/Silk Spectre | Two literal range components | Ten numbered issues across two series |
| 0621 | Hawkeye Vol. 4: Rio Bravo | Five names: Hawkeye (2012) 17; 12–13; 15; 19; 21–22 | Seven issues sharing series/run |
| 1169 | Action Comics Vol. 2: Bulletproof | Three names, including range and ANNUAL 1 | Issues 9–12 and 0, plus annual 1 |
| 0489 | Elseworlds: Superman Vol. 1 | SUPERMAN, INC. split into SUPERMAN and INC.; seven entries | Six works; internal comma belongs to title |
| 1360 | Thor: Ages of Thunder — Collection | Last two works merged across &; three entries | Four work mentions; contextual separator needed |
| 1438 | Vertigo Preview: 2015 | Six title/creator fragments become components | Three work mentions with creator pairs; preview extent unresolved |

**Nine other full parses contain prose inside the series label:** IDs **0155, 0230, 0444, 0445, 0801, 0973, 1164, 1280, 1303**. Labels include “stories from BATMAN,” “the entire miniseries Supergirl: Woman of Tomorrow,” and “issues Batman: Detective Comics.” These are not stable series identities.

**#0973 Promethea: 20th Anniversary Deluxe Edition Book One** is especially serious: “Collects issues #1-12 plus the complete script for issue #3” becomes **one issue numbered 3**, with the preceding prose in the series field. The arbitrary leading-label grammar finds the last compatible marker, loses the range and still reports full. Separate the unit list and script clause, or leave unresolved; do not infer the missing series from the parent title without review.

Together these are **16 distinct demonstrably malformed full proposals (2.44% of full)**. This is a lower bound, not a correctness certification of the others.

### Global excerpt-scope bug

**120 genuine statements (7.89% of all statements)** contain the parser’s global markers “material from,” “excerpt(s) from,” “selection(s) from,” or “partial.” They have **62 full, 54 partial, 4 failed** outcomes. All **2,225 currently proposed entries** in these records are labelled excerpt.

For #0046, “Collects Amazing Spider-Man (1963) #1-17 and Annual #1 and material from Amazing Fantasy (1962) #15,” all **19** entries become excerpt. The first 18 are claimed as collected issues/annual; only Amazing Fantasy #15 is explicitly partial. Similar errors occur in #0053 Spider-Man No More and #0054 The Goblin Lives.

This conservative downgrade is inaccurate for representation and coverage. **120 counts rule exposure, not 120 proven mixed-scope errors.** The 62 full records need scope inspection despite no leftovers. The union of those 62 and the 16 structural counterexamples is **78 distinct full records**; these are overlapping findings, not additional semantic classes.

The two uncertain fulls, #0380 Crystal Blue and #1030 Shonen Jump Manga Starter Pack, also need context/extent review. Listing Naruto, Bleach and One Piece does not establish complete editions or volumes.

### Ownership safeguards

Only `database.contentReviews` entries under effectively owned/claimed parents, with full extent, enter the reviewed contents index. Run/language scope still matters. Discovery proposals do not become ordinary title matches. With **zero reviews**, these bad proposals contribute **zero verified contents-index ownership evidence**. They still mislead review and quality indicators and should be corrected before users approve them.

## 7. Genuine parser-failure families

Counts below cover **521 genuine partial/failed statements**. Families overlap and are **not additive**. They measure relevant text shapes, not guaranteed recoveries. “Named/described” and “count/complete-collection” are screening families.

| Pattern family | Affected | Failed | Partial | % of 521 |
| --- | --- | --- | --- | --- |
| Multiple numbered markers/segments | 192 | 23 | 169 | 36.85% |
| Generic issues / series after range | 135 | 114 | 21 | 25.91% |
| Annual/special/one-shot/named graphic work | 116 | 43 | 73 | 22.26% |
| Named/described works beyond plain ranges | 114 | 56 | 58 | 21.88% |
| Bare-number continuation/list | 89 | 23 | 66 | 17.08% |
| Excerpt/story-from scope | 83 | 11 | 72 | 15.93% |
| Credits/extras attached to work list | 65 | 51 | 14 | 12.48% |
| Terminal Read more UI text | 59 | 42 | 17 | 11.32% |
| Cardinal/ordinal/count/complete-collection wording | 38 | 34 | 4 | 7.29% |
| Numeric list without #, excluding calendar-year false hit | 25 | 25 | 0 | 4.80% |
| Negative/fractional/decimal/abbreviated issue notation | 13 | 2 | 11 | 2.50% |
| Numeric sentence glued to capitalized prose | 7 | 7 | 0 | 1.34% |

### High-impact grammar

**Explicit numbered clauses and continuation lists:** “Batman #25-27, 29-33” needs inherited series/run and number markers. Multiple series, annuals and one-shots need tokenization distinguishing a new series from inherited context. The **192** repeated-marker records are not necessarily 192 distinct multi-series collections; **89** show continuation/list patterns. Deterministic support is comparatively safe with explicit anchors. Never split every “and”: it may belong to a title.

**Generic units versus explicit post-range series:** **135** records match this family. Harrow County Omnibus Vols. 1 and 2 explicitly say “issues 1-16 of Harrow County” and “issues 17-32 of Harrow County.” Animal Man says “issues 1-6 of Animal Man, part of the DC Comics--The New 52 event.” Parse the explicit series and leave commentary separate. “Collects issues #1-5” or “issues 108-113 of the original series” lacks the series name and must stay unresolved without review. The entire 135 is not a safe-automation estimate.

**Annuals, specials and named one-shots:** **116** records match. Absolute Power combines numbered issues with Ground Zero; TMNT: The Last Ronin—Lost Years combines issues and a Lost Day Special. The current numeric parser does not integrate named works reliably. Preserve named residuals and explicit unit types; do not invent numbers or equate specials with regular issues. Annual inheritance needs an explicit series/run anchor.

**Named lists:** **114** have named/described work language, including comic arcs as well as prose stories; not 114 non-comic books. Beatrix Potter’s list fails on an Oxford comma: splitting leaves lowercase “and …” and fallback rejects everything. Shifting Shadows has adjacent quoted titles, internal “and,” a title containing a comma, and praise. Andersen mixes named tales and commentary. Use bounded quote-aware lists and preserved DOM boundaries; do not split every comma/conjunction or mistake creator names for works.

**Scope and credits:** **83** unresolved statements contain excerpt/story-from wording and **65** credits/extras. Explicit full issues should not become excerpts because of a later partial clause. “Stories from” may itself indicate partial material; preserve uncertainty rather than automatically make it full. Mixed credits should remain separate metadata/residuals.

**No-hash numeric syntax:** Screening found 26 unresolved records; #0105 Autobiography of a Yogi has calendar years 1946–1951, leaving **25 relevant numbered-unit candidates**, some still generic and overlapping the 135 group. Moon Knight Epic Collection: Bad Moon Rising explicitly names several series/run years plus issue numbers. Recognize this grammar, not arbitrary numeric ranges.

**Special notation:** **13** unresolved records match negative/fractional/decimal/abbreviated shapes. Standalone decimal/fraction validation already exists. Abbreviated range ends such as #645-50 and negative issues need deliberate rules; do not interpret descending ranges as ordinary ranges or split fractions into integers. Negative issue numbers also conflict with current validation, so parser-only expansion would be insufficient.

### Low-cost artifact repairs measured offline

Terminal **“Read more”** occurs in **75 statements (4.93%)**; **59** are genuine unresolved cases. Removing only that terminal UI phrase from an in-memory parsing copy yields:

| Before → after | Records |
| --- | --- |
| Failed → full | 22 |
| Failed → partial | 6 |
| Failed → failed | 14 |
| Partial → full | 6 |
| Partial → partial | 11 |

Thus **34 improve (2.24% of all statements)**, **28 become full (1.84%)**, with **172 extra proposed entries**. The other 25 remain unresolved. Retain original text for provenance. An improved outcome still needs semantic/structural checks and review.

**Glued boundaries:** **7 genuine failed statements** join a numeric clause to sentence punctuation and capitalized narrative: Miles Morales Vol. 3 has “#11-15.Ultimatum …”; Ultimate Spider-Man Vol. 1 has “#1-6.The most surprising …”. A broader punctuation screen hits 21 records but includes initials/abbreviations, so is not 21 safe fixes. Preserve DOM paragraph boundaries. Locally remove narrative only with an unambiguous numeric clause/boundary.

**Truncated abbreviations/titles:** #0895 Ms. Marvel, #1026 Sgt. Fury, #0213 Batman Vs. Bigby!, and #0334 Brooklyn/Ft. illustrate premature boundaries. Existing exceptions include Mr/Mrs/Dr/St but not these forms. Parsing cannot recover unsaved words: improve extraction and later rescan selected records. Splitting every period/exclamation mark is unsafe.

## 8. False-extraction patterns and architecture

| Exclusive audit family | Records | % of 330 |
| --- | --- | --- |
| Instructional topics/product features/other non-work prose | 98 | 29.70% |
| Plot, subject matter or warning | 94 | 28.48% |
| Recipes/ingredients/cookbook features | 31 | 9.39% |
| Author/publisher catalogue promotion | 25 | 7.58% |
| Art/images/maps/design extras | 24 | 7.27% |
| Contributor/person list | 21 | 6.36% |
| Kindle/device delivery feature | 14 | 4.24% |
| Front/back matter, edition or bonus features | 12 | 3.64% |
| Awards/praise/imperative marketing | 6 | 1.82% |
| Travel/places/plans | 5 | 1.52% |
| Total | 330 | 100% |

Bins use dominant-cause coding, not perfectly disjoint linguistic concepts. They do not mean maps, forewords, recipes or interviews can never be meaningful units. A specifically identified contained work/unit differs from generic “includes maps/photos” or a list of subjects.

Contextual assessment should recognize:

- **Containment:** product/edition as subject, work/unit type, bounded named/numbered constituents and explicit excerpts.
- **Credits:** artist/author role language and person lists. Preserve real works in mixed credits, rather than rejecting the whole sentence.
- **Features/topics:** wireless delivery, information about, techniques, itinerary locations, generic visual extras and warnings. Keep ambiguous named chapters/stories for investigation.
- **Promotion:** future volumes, other books available, reviews, imperative “collect the series.” A collection-looking title is insufficient.
- **Unknown context:** isolated names with missing subject/extent. Preserve uncertainty, not fabricated containment or absence.

The architecture should remain:

```text
all eligible Kindle books
  → bounded candidate extraction, including multiple candidates
  → contextual containment quality assessment
  → supported parsing, with unresolved evidence retained
  → unverified structured contents
  → optional explicit verification/review
```

### Multiple candidates

The extractor selects the first trigger in the first matching selected element. A feature/credit prelude can hide precise contents later. At least **two saved fragments (#0229, #1192)** already contain later collect clauses after include leads. Omitted candidates elsewhere cannot be counted without HTML.

Future extraction should inspect bounded paragraph/list blocks, preserve a small ordered candidate set and short surrounding context, and prefer explicit work evidence over credits/topics. Preserve ambiguity and a selection reason; do not store whole HTML. Locally filtering 330 false statements cannot recover previously omitted sentences. Rejected candidates must not become “no contained works.”

## 9. Non-comic and generalized containment

A specifically inspected subset has **21 useful non-comic statements: 2 A, 11 B, 8 C; all 21 failed**. This is an identified lower-bound subset, not a guarantee that no additional non-comic record exists among broad pattern groups. It includes partial/ancillary units, not just complete novels. No game collection was identified in this Kindle-book corpus; game identity support cannot be validated here.

| IDs | Example / useful relation | Primary blocker |
| --- | --- | --- |
| 1482 | Wool Omnibus: five Wool books | Count claim; individual titles absent |
| 0370 | Code Breakers: all four novels | Collection claim without constituent names |
| 1309 | The Jungle Book: every original Mowgli story | Names not enumerated |
| 1264 | Dragon Blood Books 1–3: Balanced on the Blade’s Edge, Deathmaker, Blood Charged | Flattened adjacent names, prose and Read more |
| 0298 | Beatrix Potter: four named tales | Oxford comma; parent-title/source-list discrepancy |
| 1028 | Shifting Shadows: named stories | Adjacent quotes, internal punctuation and praise |
| 0614 | Andersen: named fairy tales | Quoted names mixed with commentary |
| 0901 | Neverwhere: How the Marquis Got His Coat Back | Missing context, glued publication prose |
| 0326, 1443, 1451 | Bradbury Stories / Welcome to the Monkey House / Wild Cards | Anthology/story claims without clean manifests |
| 0722 | Java 8 Preview Sampler: chapters from five named books | Excerpts, flattened titles/creators, long title |
| 1325 | The Power of Patience: sample chapter of a named sequel | Excerpt plus guide, long title |
| 0021 | A Hunger Like No Other: excerpt from No Rest for the Wicked | Partial work mixed with prose |
| 0105 | Autobiography of a Yogi: last chapter/eulogy/afterword | Ancillary units, credits and dates |
| 0578 | Great Expectations: earlier ending as addendum | Alternate ending mixed with apparatus |
| 1247 | The Amazing Monarch: poems plus quotations | Mixed, individually unnamed units |
| 1297 | The Heartmost Desire: manifesto/autobiography | Described units rather than named works |
| 1385 | Twelve Years a Slave: explicit included main work | Single named work with other prose |
| 0679 | Infinite Stars: Vorkosigan adventure and other described stories | Work claims mixed with author context; titles not named |
| 0697 | Investing Essentials (Collection): primers on investing topics | Collection claim, but constituent names versus topics remain unclear |

Chapters, eulogies, excerpts and alternate endings are useful targets, but never imply complete source-book ownership. Wool’s five books must not be expanded into an unrelated Silo trilogy manifest.

### Model-primary failures versus parsing failures

**Zero demonstrated current failures are primarily due to missing creator/identifier/type/edition/identity fields.** Existing component entries can represent a named work under a parent. The 21 records fail before safe entries are produced because of grammar, context or missing names. This does not mean the current model is ideal.

There are **two concrete long-title exposures** to the component-name limit: component names occupy an **80-character number field**.

- **Mastering JavaFX 8 Controls: Create Custom JavaFX 8 Controls for Cross-Platform Applications** — **92 characters**, in Java 8 Preview Sampler.
- **Unchain Your Heart - 95 Clever Ways to Be Absolutely Irresistible and Ignite Passion in Your Relationship** — **105 characters**, in The Power of Patience.

Both currently fail earlier, so they are real representation limits, not two proven model-primary failures. Wool, Code Breakers and The Jungle Book also show aggregate claims that cannot be enumerated without inventing identities; raw statements already retain those claims.

### Future representation justified by this corpus

Current entries have series/run/unitType/number/language/full-or-excerpt. Named fallback stores **parent title as series and contained name as number**, with blank run/language. It cannot robustly attach contained title, creator roles, ISBN/typed identifier, media/work type, edition or stable work identity. The same story in differently titled anthologies does not naturally share identity; do not bypass that limit with broad ordinary-title joins.

Long subtitles, internal commas, creators, and source-work names in samplers are real needs. Count-only claims need retained unresolved/summary evidence, not invented ordinal identities.

First-class contained works are justified as **future architecture**. Minimum useful fields would separate optional contained title from number, permit sufficient bounded title length, and optionally attach work type, role-qualified creators, typed identifiers, edition and relation evidence/extent. Add stable identity only with support/review, preserve provenance and verification state, and never silently turn unverified components into ordinary owned-title matches. No schema redesign is proposed for the first patch.

## 10. Unavailable and no-statement analysis

### Persisted meanings

Current **unavailable** is saved on **HTTP 404** from the requested public product URL: no page to inspect there at that lookup. It does not prove deletion of the book, entitlement loss, absence of contents or lack of ownership. Legacy unavailable entries lack exact HTTP status provenance; their historical cause cannot be established from this backup alone.

**No-statement** means a successful response passed sign-in/CAPTCHA checks but yielded no trigger candidate in selected DOM regions. It does not establish absence. Different layouts, hidden/differently worded text or missing descriptions can produce it. No original HTML or status history is available here.

### Legacy/new and entitlement origin

- **148 legacy unavailable:** 146 Comixology and 2 ComicsUnlimited; extractor version missing.
- **467 new unavailable:** 413 Purchase, 46 KindleDictionary, 7 KindleUserGuide, 1 Sample; version 2.
- All **1,059 no-statement results** are version 2.

| Origin | Unavailable | No-statement |
| --- | --- | --- |
| Purchase | 413 | 903 |
| Prime | 0 | 12 |
| KindleDictionary | 46 | 3 |
| KindleUserGuide | 7 | 0 |
| Comixology | 146 | 93 |
| ComicsUnlimited | 2 | 45 |
| Sample | 1 | 3 |
| Total | 615 | 1,059 |

Legacy retail-page availability and entitlement origin differ sharply from the new scan. Dictionaries have 46 unavailable and 3 no-statement among 50 origin lookups; guides have 7 unavailable among 7. They are lower-priority public-page contents retries, without removing them from eligibility.

### Collection-looking negatives

Strict title triage flags omnibus/compendium/box-set/anthology/complete-collection/multi-book-range/epic-collection/masterworks. Broader triage adds plain collection/collected/trilogy/tales/short stories. These are **title hints, not confirmed containment**.

| Outcome | Total | Strict flags | Broader including strict | Not strict-flagged |
| --- | --- | --- | --- | --- |
| Unavailable | 615 | 12 | 68 | 603 |
| No-statement | 1,059 | 14 | 59 | 1,045 |
| Total | 1,674 | 26 | 127 | 1,648 |

All 12 strict unavailable flags are **new scan results**; zero legacy unavailable entries have strict flags. “Not flagged” does not mean a confirmed standalone title.

Strict unavailable examples: Scott Nicholson Library Vols. 1 and 3 (Boxed Set); Shift Omnibus (Shift 1–3); Sand Omnibus; A Taste of Tomorrow (11 books); Queen Series Boxset; Complete Collection of H. P. Lovecraft; two Master of Kung Fu Epic Collections; three Conan Epic Collections.

Strict no-statement examples: Fifth Avenue Series Boxed Set; Alice in Deadland Trilogy; Post-Human Omnibus; Dirk Gently Box Set; Hack/Slash Omnibus Vol. 1; Complete Novels of H. G. Wells; Complete Token Series Books 1–5; Enchanting Inquiries Collection 1; Pebble Cove Books 1–3; anthologies/samplers and other collection-looking titles. Dirk Gently’s title explicitly names both novels; title evidence should initiate review, not fabricate a page-derived manifest.

A selected future retry of **26 strict negatives (0.81% of eligible products; 1.55% of negative results)** is a better first experiment than a full 3,194-page rescan. Expand to **127 broader negatives (3.98% of eligible)** if productive. No responsible recovery rate can be predicted from saved outcomes; 404s may persist and no-statement may accurately describe the page.

Current **Retry incomplete** does not revisit current no-statement/unavailable results; **Rescan** does. No retry-incomplete candidates remain. A bounded selected subset would require explicit queue/UI support; it is not an existing targeted option. Preserve evidence and origin when refreshing. After extraction repair, also consider known truncated candidates and high-value reviewed legacy cases. Age alone is insufficient reason to auto-rescan all 148 legacy unavailable pages.

## 11. Prioritized recommendations

Counts indicate affected/exposed records, not promised recovery. Percentages use 1,520 statements unless stated otherwise. Families overlap.

| Priority / improvement | Corpus impact | Risk / complexity | Layer |
| --- | --- | --- | --- |
| P0: contextual containment quality separate from syntax | 330 false (21.71%); 23 uncertain (1.51%); 7 semantic false-full (0.46%) | Medium complexity; blanket filters risk false rejection, so retain ambiguity/mixed evidence | Candidate selection, derived quality, UI |
| P0: guard named fallback against credits/topics/range fragments; preserve title punctuation | 7 false-full and 7 additional structural full cases (0.46% each) | Medium; require work context, bounded list/quote structure; do not invent names | Parsing, review |
| P0: guard numbered series labels and greedy last-marker parses | 9 malformed full cases (0.59%), including Promethea | Medium; reject prose labels, retain unresolved clauses, never guess series | Parsing |
| P0: extent by clause | 120 exposed (7.89%); 62 full (4.08%); 2,225 proposed entries | Medium; accidental excerpt-to-full promotion has higher consequence, require explicit extent | Parsing, review |
| P1: terminal Read more cleanup in parsing copy | 75 occurrences (4.93%); 59 genuine unresolved; 34 improve (2.24%) | Low complexity/lexical risk; outcome gains still need quality checks | Normalization, future extraction |
| P1: explicit continuation/multi-segment grammar | 192 repeated-marker records (12.63%); 89 continuation (5.86%); 116 special-unit patterns (7.63%) | Medium/high; anchored series/run makes deterministic support safer | Parsing |
| P1: explicitly named post-range series | 135 pattern hits (8.88%); safe subset not measured | Medium; leave “original series”/generic claims unresolved | Parsing |
| P1: multiple bounded source candidates/context | At least 2 saved later-clause cases (0.13%); omitted total unknown | Medium; select work evidence, preserve uncertainty, avoid bulk refetch | Extraction |
| P1: boundary/abbreviation artifacts | 7 numeric glued-boundary failures (0.46%); Ms/Sgt/Bigby/Ft examples | Low/medium; initials/title punctuation must survive; truncations need refetch | Extraction, bounded normalization |
| P2: quoted named works, separate creators, retained count claims | 114 named/described (7.50%); 38 count patterns (2.50%); 21 identified non-comic failures (1.38%) | Medium/high; ambiguous titles and excerpt scope require review | Parsing, review UI |
| P2: selected negative rescan and outcome explanations | 26 strict / 127 broader title flags among 1,674 negatives | Medium; recovery unknown, no automatic ownership/absence conclusions | Queue/UI, lookup |
| P2: unusual number grammar and validation | 13 unresolved matches (0.86%) | Medium; deliberately handle abbreviation/negative numbers, avoid calendar years | Parsing, validation |
| P3: first-class contained-work relation fields | 21 identified non-comic cases; 2 long-title exposures (0.13%); 0 proven model-primary failures | High; identity/ownership risks require separate design and review | Representation, reviewed identity |

## 12. Smallest next implementation

Start with a **quality and parser-correctness patch**:

1. Derive containment quality separately from full/partial/failed. Recognize work/unit evidence, credit/topic/promotion contexts and uncertainty. Keep broad eligibility and original statements; do not delete false candidates or infer absence.
2. Guard named fallback and numbered labels using the false-full/structural cases. Unsupported numbered syntax must not become literal component names. Preserve ambiguous title punctuation/context as unresolved.
3. Assign extent by clause. Explicit collected issues and later material-from clauses must remain distinct; ambiguous stories-from cannot silently become full.
4. Remove terminal Read more only in the parsing copy; handle clearly glued numeric/narrative boundaries conservatively. Retain raw evidence.
5. Explain candidate, containment signal, parse result and verified contents separately in review UI. A full parse is not complete verified contents.

Then improve bounded multi-candidate/list-block extraction without starting an automatic bulk scan. This needs future source evidence to measure recovery. Add explicit series-after-range/continuation and quoted non-comic parsing in a second measured increment. Defer first-class work identity/schema changes until parsing clarifies the available relations and identifiers.

Acceptance evidence should cover all seven semantic false-fulls, 16 structural cases, mixed full/excerpt examples, the 59 genuine Read-more cases, Beatrix/Shifting Shadows/Neverwhere/Wool, ambiguous Crystal Blue/manga lists and negative lookup meanings. Confirm ordinary comic ranges still work, eligibility stays broad and no discovery becomes owned-title evidence. Report syntax gains alongside semantic quality.

**Invariants:** ownership stays separate from identity and discovery; extraction/parsing remain unverified; failed/unavailable/no-statement never prove absence; non-comic collections stay eligible; unverified components never silently become ordinary owned-title matches; HB/FAN behavior must not broaden because a candidate was extracted.

## Source references inspected

- [Kindle page extraction and lookup outcomes](../../src/providers/kindle.js): first-trigger selection, abbreviation handling, selectors and HTTP/no-statement outcomes.
- [Contents parsing, validation and review-only index](../../src/lib/contents.js): fallback, name bounds, extent and ownedContentIndex.
- [Eligibility, saved states and scan planning](../../src/lib/kindle-contents.js): broad book eligibility, legacy results and retry/rescan selection.
- [Contents review editor](../../src/ui/contents-editor.js): proposals and explicit verified review.
- [Backup reader](../../src/lib/storage.js) and [bounded validation](../../src/lib/validation.js).

## Appendix A. Count definitions and reproduction notes

Strict collection-title triage, case insensitive and Unicode-aware:

```regex
\b(?:omnibus|compendium|box(?:ed)?[ -]?set|antholog(?:y|ies)|complete\s+(?:collection|series|novels|works|stories)|books?\s*(?:\d+\s*[-–—&]\s*\d+|one\s+and\s+two)|(?:story|stories|novel|tale|trilogy)\s+collection|epic collection|masterworks)\b
```

Broader triage adds whole-word collection, collected, trilogy, tales and short stories. The 25 no-hash candidates exclude calendar years in #0105. The seven glued boundaries specifically require a digit immediately before punctuation followed by a capital letter; broader initial/abbreviation hits were excluded.

Semantic coding is independent of stored outcome, with explicit contextual exceptions for credit/plot/future-purchase/incomplete-scope fragments. Each final coding is reviewable in the ledger. The figures are operational audit classifications, not a ground-truth catalogue. Ledger IDs are ordinal references, not stable provider IDs; use title/text if sorting changes. Saved statement excerpts below came from the supplied export, not new page requests.

## Archived item-level ledgers

The complete private-derived classification inventory and negative-title list are retained only in ignored local artifacts. Minimal title-free manual annotations and regression cases are committed as fixtures.
