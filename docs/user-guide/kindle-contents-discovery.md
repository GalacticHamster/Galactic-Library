# Kindle contents discovery

Discovery, parsing, human verification and ownership are separate. Current source extraction is generation **5**, contents parsing version **5**, and filtering version **1**.

## Eligibility and priority

Every active provider record with provider `kindle`, media type `book`, and a supported URL matching `https://www.amazon.com/dp/[A-Z0-9]+` is eligible. No ownership state or comic classification is required. Unsupported URLs, personal documents, other media and other providers are excluded from this adapter.

Existing contents statements, confirmed comic/manga evidence and simple collection words prioritize the queue. Words include Omnibus, Epic Collection, Masterworks, Compendium, Complete Collection, Box Set, anthology and collection. Ordinary books remain eligible. No franchise ontology or replacement collection classifier was added. Comic/manga classification itself is unchanged.

## Scan, retry, rescan and local reparse

The signed-in Kindle panel has one **Find contents** button and a mode selector:

| Mode | Page requests | Local work |
|---|---|---|
| Scan eligible books | Never checked, legacy unknown blanks, temporary failures, empty results from extractor versions before 2, and legacy no-statement results without an extractor version | Reparse saved statements processed by an older/unknown parser |
| Retry incomplete checks | Temporary failures and legacy unknown blanks | Reparse outdated saved statements |
| Rescan previous results | All eligible books, including previously found, empty and unavailable results | Reparse outdated saved statements |
| Reparse saved text (no requests) | None | Reparse every eligible saved Kindle statement |

Legacy statements with no extractor version are handled locally during a normal scan. They are not automatically fetched again merely because versions were absent. Legacy unavailable pages wait for explicit rescan. An empty result from an extractor version before 2 can be revisited by normal scan. Later source generations and existing statements require explicit rescan for fresh page evidence; a version increment does not automatically refetch them. Parser/filter updates can reprocess saved text locally.

The derived state distinguishes never checked, temporary failure, unavailable, no statement, legacy unknown, statement found, full/partial/failed parsing and reviewed/unverified contents. A temporary failure can coexist with a previously found statement: retrying remains possible without losing the old text. A changed discovery is flagged separately from an existing reviewed statement.

Requests remain sequential, spaced by one second after each result. Transient requests retry at most twice with two/four-second delays. Each attempt has a 30-second timeout. CAPTCHA and sign-in errors stop the run and retain a safe failure category. Pause aborts an in-flight request and retains completed results. A normal scan resumes unfinished work; starting an explicit rescan again intentionally revisits all results rather than maintaining a separate rescan cursor. Closing the tab retains saved checkpoints but does not keep a background fetch running.

Progress reports checked/total, statements found, no contents found, failures/retryable, remaining pages, unavailable pages and local reparses. **No contents found** describes that lookup, not a permanent assertion that a book contains no works.

## Storage and compatibility

The existing persisted name `kindleProductComicContents` and internal request names remain intact. There is no schema-number or backup-format change. Optional `extractorVersion`, `parserVersion` and `parseOutcome` fields augment the existing statement, availability, parseStatus, source and checkedAt fields. Older backups remain readable; missing versions are interpreted conservatively. Legacy parsed/unparsed states remain accepted. Sign-in is an additional safe failure category.

The serialized worker remains the sole writer. Existing source-URL, current-record and account/reference checks remain in place. Credential-bearing source URLs are rejected. Local reparse requires a current record reference, retains the original statement and lookup date, updates parsing metadata and creates ordinary source history for undo. A failed refresh preserves previously discovered text. No refresh or reparse changes `contentReviews` or silently replaces verified entries. A changed statement returns to review; the editor offers **Use newly discovered statement** and leaves existing verification intact until the user explicitly saves.

## Extraction and proposals

Parser 5 improves explicit numbered contents: it preserves conjunctions inside series titles, prevents unit words inside titles from becoming markers, and recovers some numbered clauses followed by credits or supplemental material. Unresolved prose remains visible and keeps a proposal Partial. This is a numbered precision update; it does not add general named-story/novel parsing.

Shortened integer endpoints such as `#645-50` can now expand to `#645-650`. At least two endpoint digits and an increasing result within the same prefix are required. `#100-05` means `#100-105`; ambiguous forms such as `#99-01`, `#199-02` and `#645-5` stay unresolved for review.

After reloading the extension, **Reparse saved text (no requests)** applies these improvements to existing source. It retains captured statements and existing verified reviews. It cannot recover an uncaptured ending or establish ownership automatically.

The extractor retains bounded description blocks, preserves paragraph/list boundaries, and records multiple candidate containment statements with their source coordinates. It recognizes collecting, containing, including, comprising and reprinting phrases. A semicolon-delimited manifest can be evaluated as a whole while its child clauses remain diagnostic evidence. It selects a primary candidate rather than blindly merging every nearby mention. Static source capture cannot guarantee that a dynamically expanded description is complete: a terminal **Read more** can indicate missing/hydrating text and remains review evidence.

Independent secondary claims remain source-backed review evidence; they do not automatically add verified contents, expand coverage or establish ownership. See [contents evidence architecture](../architecture/contents-evidence.md) for candidate, manifest and book completeness boundaries.

Verified named components describe what that particular parent contains. A matching name in another collection does not prove it is the same work, and a game component cannot cover a book component. Numeric names such as **01** and **1** remain separate titles; numbered issues and volumes retain their existing numeric and cross-collection comparisons. HB/FAN cannot identify the trusted parent through the current API, so matching component names remain Possible with parent evidence rather than establishing Owned. Ordinary matching of the whole book title remains independent. Existing reviews and backups retain their contents and derive parent scope automatically.
