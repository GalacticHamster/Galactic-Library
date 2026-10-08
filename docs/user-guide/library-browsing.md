# Browsing and searching your Library

Library is a catalog of your imported collection. Each result is an existing canonical item; several provider/account records can appear together. Browse results never make new matching, ownership or contents decisions.

Results show title, known edition/volume/issue, saved series links, creator when available, media and a compact provider summary such as **Kindle (2 accounts) · Kobo**. There is no repeated Owned badge. Borrowed, subscription, rented or unconfirmed access and active ownership preferences remain visible. Covers stay inside item Details; missing artwork leaves no empty result block. **Details** opens the existing item workflow for all associated accounts, including those outside your filters.

## Search

Search available titles, alternate titles/aliases, authors and contributor names, audiobook narrators, series, issue/volume, edition, ISBN/ASIN/Steam or provider identifiers, work identifiers, publisher, language, broad genres and provider/account nicknames. Only already-saved information is used. Unapproved pending suggestions are not a second search catalog. Separately stored Google genre hints remain genre evidence, not approved edition metadata.

Search is case-insensitive, normalizes Unicode compatibility characters, punctuation and spacing, and uses substring retrieval rather than fuzzy matching. Search words combine: every word must occur in one qualifying record's searchable information, with the group's canonical title also available. An account word alone cannot turn an unrelated title into a match for additional words. Hyphenated and compact numeric ISBNs can find the same saved identifier. The original titles and identity policy are unchanged.

Results rank by:

1. Equal full stored/canonical title after retrieval normalization.
2. Full query prefix of a title.
3. All query words within one title.
4. Alias or compact numeric identifier match.
5. Other stored-field matches.

The selected sort orders results within an equal relevance level. Clearing the search applies the sort to the whole filtered set. Linked DLC title searches can retrieve their existing parent game; the relationship must belong to the same provider/account. Retrieval relevance is not a matching confidence or proof of ownership. Short numeric or word substrings can return broader results; narrow them with more words or a filter.

## Sort

| Sort | Stored information and fallback |
| --- | --- |
| Title A–Z / Z–A | Existing natural title comparison; stable canonical ID breaks exact ties. |
| Date added / acquired | Latest reported `acquiredAt` among records qualifying for your filters; newest first. This is not an inferred original purchase date or first-import timestamp. |
| Last record update | Latest provider-record `updatedAt` among qualifying records; newest first. It is not necessarily a purchase, reading edit or contents-review date. |
| Creator / author | Alphabetically first known creator among qualifying records; absent creators last. |
| Series and issue / volume | First saved series tuple among qualifying records, then series version/run, unit kind and natural unit order. `2` precedes `10`. Missing series/unit information uses deterministic title/ID fallback; games/video receive no invented comic numbering. |

Missing dates sort after known dates. Date and creator ties use Title A–Z and stable ID. Multiple accounts with different values stay visible inside Details; sorting does not select a new authoritative edition or entitlement.

## Filters and account scope

Media, Provider and Saved account are in the primary row. **More filters** contains Genre, Access, Reading, Series, Book information and Game DLC. Active filters remain visible as removable buttons even when More filters is collapsed.

Provider, account, access, genre, reading, series and information conditions must qualify **one provider record**. For example, **Kindle + Family + Borrowed** cannot borrow an Owned observation from Personal or a Borrowed observation from Kobo. A canonical item appears once when any record qualifies. Its compact provider summary still lists every associated provider; **Accounts qualifying for filters** identifies the subset. Details retains the full account list.

- **Access** uses the existing effective ownership policy, human decisions and expiry rules. Browsing does not rewrite source access.
- **Reading** applies to books/audiobooks. **No saved reading status** is separate from **Explicitly unread**; a never-tracked item is not classified as unread. Several accounts may qualify the same item for different reading filters.
- **Series** uses stored metadata or the existing title-derived series information. Clicking a result's series clears search, selects that series and its natural sort, and retains the other filters. Separate editions stay separate.
- **Missing creator or edition identifier** finds books missing an author or a known ISBN/ASIN. It is a specific catalog gap, not an overall metadata-quality score. A known native Kobo product ID alone does not assert edition completeness.
- **Saved suggestions / contents needing review** uses pending saved lookup reviews and the existing contents-review-needed status, without reparsing source. Failed/empty suggestions and accepted suggestions still retained by the existing pending store can appear.
- **Has DLC / No DLC** uses saved same-account parent/add-on links and qualifying add-on provider/account/access. Other game filters apply to the parent. It does not infer missing licenses or activation.

Unlinked DLC remains a separate list when the provider did not return its parent. It uses the same applicable record filters and search, with its own fifty-result pages; it does not create a new canonical game.

## Counts, pages and returning

Catalog count refers to canonical results. The account-record count refers to records qualifying for the selected filters inside those results, not independent titles. Media counts describe that same result set. Filtering and search happen first, sorting next, and fifty-result pagination last. Changing a filter/search/sort resets the main list to a valid first page.

**Clear filters** removes search and all filters but keeps your chosen sort. Individual active-filter buttons remove only that condition. Empty results explain the active narrowing and offer **Clear search and filters**. A genuinely empty imported library still uses Providers onboarding instead of claiming your filters caused it.

Opening and closing inline Details preserves the list. An exact account's **Review contents** link opens Contents; **Open this book in Library** restores the originating workspace, search, filters, sort, page and scroll in this Options tab. Exact/reloaded record links escape incompatible filters and locate the target under the selected sort. If a record is no longer current, the existing unavailable-record notice applies.

Library and bulk Book information retain separate search/filter/sort/page preferences in the existing private UI settings across Options reloads. Dynamic account, genre and series choices hydrate after the snapshot loads. A removed choice falls back to All. These preferences are excluded from library backups and do not alter imported state. Open Details, drafts, scroll and unlinked-DLC page are not separately persisted across reloads; item/return context remains local to the tab.

## Performance and boundaries

A lightweight browse projection is built from the loaded validated Options snapshot and reused until that object changes. Search keys, known metadata, aliases, series, reading and saved review status reuse that projection; access is reevaluated at query time so expiry and ownership preferences do not become stale. Only fifty result rows and requested item editors are constructed. Dynamic facets reuse the unchanged snapshot; add-on parent lookup is indexed rather than scanning the full library for each add-on.

Browsing makes no per-filter database read, external lookup, provider acquisition, source parsing or canonical matching reconstruction. The explicit bulk review keeps its existing behavior. Synthetic tests cover 14,081 provider records, 13,175 canonical items, multiple accounts and guarded source blocks. Their responsiveness measurements are controls, not a live benchmark of your personal library.

The existing database schema, profile identity, ownership classifier, matching rules, parser, contents coverage, acquisition, history, backup and companion API are unchanged. Contents remains responsible for reviewed included works and coverage/gap comparisons; Library does not invent a complete series bibliography.

See [item details](item-details.md), [Contents](contents-workspace.md), and [saved accounts](providers-and-accounts.md).
