# Kindle contents discovery

Discovery, parsing, human verification and ownership are separate. Current source extraction is generation **5**, contents parsing version **13**, and filtering version **1**.

## Eligibility and priority

Every active provider record with provider `kindle`, media type `book`, and a supported URL matching `https://www.amazon.com/dp/[A-Z0-9]+` is eligible. No ownership state or comic classification is required. Unsupported URLs, personal documents, other media and other providers are excluded from this adapter.

Existing contents statements, confirmed comic/manga evidence and simple collection words prioritize the queue. Words include Omnibus, Epic Collection, Masterworks, Compendium, Complete Collection, Box Set, anthology and collection. Ordinary books remain eligible. No franchise ontology or replacement collection classifier was added. Comic/manga classification itself is unchanged.

## Scan, retry, refresh and local reparse

The signed-in Kindle panel has a contents mode selector. Contents actions remain disabled until the saved refresh state has loaded successfully. If an unfinished refresh exists, the panel selects refresh mode and makes **Resume refresh (saved/total)** the primary action. Ordinary scans use **Find contents**. **Start new refresh** occupies a separate button slot and asks for confirmation before creating a queue:

| Mode | Page requests | Local work |
|---|---|---|
| Scan eligible books | Never checked, legacy unknown blanks, temporary failures, empty results from extractor versions before 2, and legacy no-statement results without an extractor version | Reparse saved statements processed by an older/unknown parser |
| Retry incomplete checks | Temporary failures and legacy unknown blanks | Reparse outdated saved statements |
| Refresh all eligible books | Every currently eligible book, including successful G2/G5, failed, empty and unavailable results | Parse fresh source with the current parser; preserve the earlier source before acquisition is saved |
| Reparse saved text (no requests) | None | Reparse every eligible saved Kindle statement |

Legacy statements with no extractor version are handled locally during a normal scan. They are not automatically fetched again merely because versions were absent. Unavailable pages without a source version, or from generation 2 or later, wait for explicit refresh. Empty generation-1 checks, including unavailable outcomes, can be revisited by normal scan. A newer unavailable attempt takes precedence over an older retained generation-1 blank for this decision. Later source generations and existing statements require explicit refresh for fresh page evidence; a version increment does not automatically refetch them. Parser/filter updates can reprocess saved text locally. Refresh replaces the previous **Rescan previous results** action; there is no duplicate fifth mode.

The derived state distinguishes never checked, temporary failure, unavailable, no statement, legacy unknown, statement found, full/partial/failed parsing and reviewed/unverified contents. A temporary failure can coexist with a previously found statement: retrying remains possible without losing the old text. A changed discovery is flagged separately from an existing reviewed statement.

Requests remain sequential and start at least one second apart. The scanner waits only the remainder of that interval: a request that finishes after two seconds needs no extra one-second delay. The same gate covers retries and separate paused/resumed runs in the open page; late background-tab timers can delay a start but cannot speed it up. Transient requests retry at most twice with separate two/four-second delays. Each attempt has a 30-second timeout. CAPTCHA and sign-in errors stop the run and retain a safe failure category. Pause aborts an in-flight request and retains completed results. A normal scan resumes unfinished checks using current eligibility. Refresh has a persisted frozen queue: **Resume refresh** continues at its saved position. Closing the tab stops fetching; reopening the tab does not start network work automatically. Up to 20 unacknowledged results can repeat after a hard interruption.

To start a full source refresh safely:

1. Reload the current extension and export a Galactic Library backup. Keep that file and any frozen private audit ledger somewhere durable.
2. Open your signed-in Kindle Content & Devices library from Galactic Library. Sync the library first if books are missing; the separate **Full rescan** sync button does not refresh product-page contents.
3. Under **Contents discovery**, choose **Refresh all eligible books**. Check the eligible count in the explanation. Use **Resume refresh** to continue an unfinished queue, or click the separate **Start new refresh** button. Its confirmation explicitly states the completed/total progress that will be abandoned; cancelling preserves the queue.
4. Leave the Kindle library tab open. **Pause** saves completed work; **Resume refresh (saved/total)** continues that queue, including after reopening/restarting. Pause and Resume occupy the same fixed button slot, anchored at the bottom of the panel. Progress messages and diagnostic output scroll above the controls. CAPTCHA/sign-in blocks require resolution before Resume.
5. **Stop refresh** abandons the queue while keeping acquired evidence. Confirming **Start new refresh** creates a new queue and revisits every eligible book. A stale/incompatible queue must also be restarted.

The operation can take hours. No refresh is started by installing/reloading or changing the selector. New library additions do not change a running queue's total; removed/unsupported records are skipped safely. Completed, paused, interrupted, blocked, aborted and stale states are shown separately.

To investigate scan speed, enable **Record local timing** before starting and export after pausing. The report separates Amazon requests, one-second pacing, retries, extraction/parsing, storage, source-history work, queue checks and UI work. Refresh includes the current-record check before each fetch. Final checkpoint work is recorded separately and must be included when calculating average time per book. The report contains no book or account details; reloading clears it.

Progress reports checked/total, statements found, contents not extracted, failures/retryable, remaining pages, unavailable pages and local reparses. **Contents not extracted** describes that lookup, not a permanent assertion that a book contains no works.

## Storage and compatibility

The existing persisted name `kindleProductComicContents` and internal request names remain intact. There is no schema-number or backup-format change. Optional `extractorVersion`, `parserVersion` and `parseOutcome` fields augment the existing statement, availability, parseStatus, source and checkedAt fields. Older backups remain readable; missing versions are interpreted conservatively. Legacy parsed/unparsed states remain accepted. Sign-in is an additional safe failure category.

The serialized worker remains the sole writer. Existing source-URL, current-record and account/reference checks remain in place. Credential-bearing source URLs are rejected. Local reparse requires a current record reference, retains the original statement and lookup date, and updates parsing metadata. No refresh or reparse changes `contentReviews` or silently replaces verified entries. A changed statement returns to review; the editor offers **Use newly discovered statement** and leaves existing verification intact until the user explicitly saves.

Normal use and local reparse use the newest trustworthy current observation. Successful capture, including a legitimate no-statement result, becomes current. Temporary failure, CAPTCHA, sign-in and unavailable results preserve the existing current observation and store the latest attempt separately. Retry still sees temporary failures even when older useful text remains available.

Actual acquisition lazily pins the earlier source with its timestamp, generation, parser metadata and bounded evidence in an optional backup-preserved history store. Repeated refreshes keep that baseline, current source, at most one latest failed/unavailable attempt and one new undo selection; they do not append an unlimited log. Existing legacy undo entries are retained. Books never processed gain no history. Backup restore preserves observations but discards the old running refresh checkpoint. See [refresh architecture](../architecture/kindle-refresh.md) for exact retention and offline export behavior.

## Extraction and proposals

An ordinary collected volume saying “collects stories from” its own series can contribute complete issues as inferred coverage. Explicit excerpts, selected pages, backup features and anthology-story context retain partial coverage. Human-reviewed contents take precedence. A fully parsed statement can still describe partial issues: parsing success and complete-issue coverage are separate.

Promotional introductions such as “Find out in these tales from” use the same subject and context checks. A separately named crossover or host issue remains partial unless its own clause establishes complete contents; it does not inherit full coverage from the collection’s main series.

Complete miniseries statements such as “collects all six issues” can supply #1–6 when the product identifies the complete series. A trade volume’s issue count alone does not establish a #1 start. Explicit ranges can inherit an unambiguous series context; subtitles, sequels, explicit runs and unsupported supplements stay distinct. Clear ranges with an unresolved series remain visible for review and do not establish ownership.

Year-named annuals and Free Comic Book Day publications retain their year separately from issue numbering. When the description supplies no number, the editor uses **unnumbered** rather than inventing #1 or treating the year as an issue number. Specials stay distinct from regular issues. These suggestions use the existing contents, access and review rules; subscription books do not become owned because parsing succeeds.

Parser 5 improves explicit numbered contents: it preserves conjunctions inside series titles, prevents unit words inside titles from becoming markers, and recovers some numbered clauses followed by credits or supplemental material. Unresolved prose remains visible and keeps a proposal Partial. This is a numbered precision update; it does not add general named-story/novel parsing.

Shortened integer endpoints such as `#645-50` can now expand to `#645-650`. At least two endpoint digits and an increasing result within the same prefix are required. `#100-05` means `#100-105`; ambiguous forms such as `#99-01`, `#199-02` and `#645-5` stay unresolved for review.

After reloading the extension, **Reparse saved text (no requests)** applies these improvements to existing source. It retains captured statements and existing verified reviews. It cannot recover an uncaptured ending or establish ownership automatically.

The extractor retains bounded description blocks, preserves paragraph/list boundaries, and records multiple candidate containment statements with their source coordinates. It recognizes collecting, containing, including, comprising and reprinting phrases. A semicolon-delimited manifest can be evaluated as a whole while its child clauses remain diagnostic evidence. It selects a primary candidate rather than blindly merging every nearby mention. Static source capture cannot guarantee that a dynamically expanded description is complete: a terminal **Read more** can indicate missing/hydrating text and remains review evidence.

Independent secondary claims remain source-backed review evidence; they do not automatically add verified contents, expand coverage or establish ownership. See [contents evidence architecture](../architecture/contents-evidence.md) for candidate, manifest and book completeness boundaries.

Verified named components describe what that particular parent contains. A matching name in another collection does not prove it is the same work, and a game component cannot cover a book component. Numeric names such as **01** and **1** remain separate titles; numbered issues and volumes retain their existing numeric and cross-collection comparisons. HB/FAN cannot identify the trusted parent through the current API, so matching component names remain Possible with parent evidence rather than establishing Owned. Ordinary matching of the whole book title remains independent. Existing reviews and backups retain their contents and derive parent scope automatically.
