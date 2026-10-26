# Browsing and searching your Library

Library is a catalog of your imported collection. Each result groups records for the same item or edition; several purchases and provider/account records can appear together. This grouping is for browsing only and does not merge saved records. Browse results never make new matching, ownership or contents decisions.

In **Detailed** view, results show title, known edition/volume/issue, saved series links, creator when available, media, a read-only contents preview when available, and a compact provider summary such as **Kindle (2 accounts) · Kobo**. There is no repeated Owned badge. Borrowed, subscription, rented or unconfirmed access and active ownership preferences remain visible. Covers stay inside item Details; missing artwork leaves no empty result block. **Details** opens the existing item workflow for all associated accounts, including those outside your filters.

**Compact** is the default when no view preference has been saved. Use **View > Compact** beside Sort for short, expandable rows showing the title, media type, providers and access status. Open a row to use the same purchase history, Details, selection and correction controls. Owned, subscription and unconfirmed access stay distinguishable. **View > Detailed** restores the existing cards. The view choice is remembered after reopening GL; it does not change your library or filters.

## Repeat purchases and purchase history

Identical full titles can share one library entry when the existing identity checks find no conflicting volume, run, edition, creator or identifier. Presentation differences already recognized by exact-title matching are allowed. Possible matches and explicitly separated editions stay separate. Missing information cannot bridge two known conflicting editions.

When distinct, identified purchases establish ownership more than once, the entry shows **Owned twice** or the corresponding count. Open **Purchase and access history** to see the original bundle/product title, provider, saved account, reported acquisition date and access state. These details stay collapsed until you open them. Earlier records no longer returned by a complete provider scan can appear in history, but do not add currently owned copies.

Under **More filters**, **Copies owned** defaults to **All saved items**, including unconfirmed ownership, loans, rentals and subscriptions. **Clear filters** restores this unrestricted view. Choose **Owned 1+** through **Owned 5+** to require at least that many owned acquisition groups; every selected threshold appears above the results as an active filter. Counts reflect entries matching your current search and other filters, before pagination. Counts apply to the whole item across its providers/accounts. An owned catalog entry qualifies for 1+, but catalog observations or Steam activation do not prove another purchase. The choice is remembered privately for Library and does not narrow Contents or change backups. Existing ownership preferences can include uncertain access at 1+; they cannot manufacture duplicate purchases.

Repeated free Humble claims can share one acquisition group only when their known provider/account and normalized bundle name agree, every saved native product is explicitly marked free, the complete observed product/edition sets match, and the original dates span at most 30 days. At least two distinct native products and a free-labeled bundle are required. Missing accounts or dates, conflicting contents, paid-looking products and ambiguous chains spanning more than 30 days remain separate. Grouping uses the saved bundle inventory, never comic contents overlap. An individual issue and a collected volume remain different products.

Repeated observations of the same Humble order or Fanatical purchase occurrence count once, including synchronized copies. Accounts retain their separate scope. A provider catalog record without a purchase origin appears as a library record, not an invented extra purchase; activation of a game on another provider does not prove another transaction. Consequently, purchase counts can be incomplete where the provider did not supply order information.

Purchase history shows each acquisition group once. Repeated claims show the number of claims and month/date range; **Original transactions** expands all retained dates, source identifiers and transaction references. Repeat observations of one order do not add claims. Different bundles, accounts and confirmed editions stay separate.

GL currently does not retain bundle prices or currency, so unavailable prices are omitted. No order totals or individual book prices are invented. Missing dates and purchase provenance are identified where relevant. All source records, matching results, synchronization and backups remain unchanged.

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

Provider, account, access, genre, reading, series and information conditions must qualify **one provider record**. For example, **Kindle + Family + Borrowed** cannot borrow an Owned observation from Personal or a Borrowed observation from Kobo. A consolidated entry appears once when any record qualifies. Its compact provider summary still lists every associated provider; **Matching accounts** identifies the subset. Details retains the full account list.

- **Access** uses the existing effective ownership policy, human decisions and expiry rules. Browsing does not rewrite source access.
- **Reading** applies to books/audiobooks. **No saved reading status** is separate from **Explicitly unread**; a never-tracked item is not classified as unread. Several accounts may qualify the same item for different reading filters.
- **Series** uses stored metadata or the existing title-derived series information. Clicking a result's series clears search, selects that series and its natural sort, and retains the other filters. Separate editions stay separate.
- **Missing creator or edition identifier** finds books missing an author or a known ISBN/ASIN. It is a specific catalog gap, not an overall metadata-quality score. A known native Kobo product ID alone does not assert edition completeness.
- **Saved suggestions / contents needing review** uses pending saved lookup reviews and the existing contents-review-needed status, without reparsing source. Failed/empty suggestions and accepted suggestions still retained by the existing pending store can appear.
- **Has DLC / No DLC** uses saved same-account parent/add-on links and qualifying add-on provider/account/access. Other game filters apply to the parent. It does not infer missing licenses or activation.

Unlinked DLC remains a separate list when the provider did not return its parent. It uses the same applicable record filters and search, with its own fifty-result pages; it does not create a new canonical game.

## Counts, pages and returning

Catalog count refers to consolidated library entries. The account-record count refers to records qualifying for the selected filters inside those results, not independent titles. Media counts describe that same result set. Filtering and search happen first, sorting next, and pagination using the selected page size last. Changing a filter/search/sort resets the main list to a valid first page.

**Clear filters** removes search and all filters but keeps your chosen sort. Individual active-filter buttons remove only that condition. Empty results explain the active narrowing. Use **Clear filters** in Library or **Clear search and filters** in Contents. A genuinely empty imported library still uses Providers onboarding instead of claiming your filters caused it.

Opening and closing inline Details preserves the list. An exact account's **Review contents** link opens Contents; **Open this book in Library** restores the originating workspace, search, filters, sort, page and scroll in this Options tab. Exact/reloaded record links escape incompatible filters and locate the target under the selected sort. If a record is no longer current, the existing unavailable-record notice applies.

Library and Contents share one authoritative search/filter/sort/position preference in the existing private UI settings across Options reloads. Bulk Book information retains its separate maintenance view. Library-only information/DLC filters and Contents-only status filters remain separate. Dynamic account, genre and series choices hydrate after the snapshot loads. A removed choice falls back to All. These preferences are excluded from library backups and do not alter imported state. Open Details, drafts, scroll and unlinked-DLC page are not separately persisted across reloads; item/return context remains local to the tab.

## Performance and boundaries

A lightweight browse projection is built from the loaded validated Options snapshot and reused until that object changes. Search keys, known metadata, aliases, series, reading and saved review status reuse that projection; access is reevaluated at query time so expiry and ownership preferences do not become stale. Only fifty result rows and requested item editors are constructed. Dynamic facets reuse the unchanged snapshot; add-on parent lookup is indexed rather than scanning the full library for each add-on.

Retrieval makes no per-filter database read, external lookup, provider acquisition, full-source parsing or canonical matching reconstruction. Visible contents summaries use reviewed entries or a bounded cache of the saved parser input; they do not visit captured source blocks or interpret the entire library. The explicit bulk review keeps its existing behavior. Synthetic tests cover 14,081 provider records, 13,175 canonical items, multiple accounts and guarded source blocks. Their responsiveness measurements are controls, not a live benchmark of your personal library.

The existing database schema, profile identity, ownership classifier, matching rules, parser, contents coverage, acquisition, history, backup and companion API are unchanged. Contents remains responsible for reviewed included works and coverage/gap comparisons; Library does not invent a complete series bibliography.

See [item details](item-details.md), [Contents](contents-workspace.md), and [saved accounts](providers-and-accounts.md).

## Moving between Library and Contents

Search, media, provider, saved account, genre, access, reading, series and sort are shared. Contents lists books only: selecting Games does not silently become Books, and an empty Contents list explains the narrower result. Active Contents status filters say Contents only. Library's information and DLC filters retain their own meaning and remain visible when returning.

Both views order the same item groups using the same relevance and sort rules. Contents shows each qualifying account separately inside that ordering, and its page size counts those account cards. Library's page size counts consolidated library entries. Page boundaries agree for equivalent one-record populations but can differ when several accounts share an item. Switching follows the inspected record if available, otherwise the first visible catalog item or account record. The destination locates that anchor in its filtered ordering. If the anchor no longer qualifies, the saved page is clamped to the destination's range; an empty destination starts at page one. No matching item or equivalent population is invented.

Review contents remembers its actual origin. Back to Library results restores the original filters, sort, anchored page, scroll and inspected Details. Back to Contents results restores that list. Contents collection list is a separate explicit action. Browser Back/Forward uses bounded UI context stored in the current tab's history entry; reloading the same entry can restore the review's origin. A copied direct link has no invented origin and defaults to Contents results. Disappearing records are reported rather than silently replaced with another account.

## Collected works and unsaved edits

A canonical preview names the particular account supplying its contents and prefers a qualifying reviewed copy. Details shows each copy separately. Contents reviewed and Not reviewed are distinct. Consecutive numbered entries compress only within the same series, version, language, unit type and full/excerpt scope. Remaining-entry counts refer to hidden entries, not a guessed complete book total. All known included works expands a full read-only list; Review contents remains the editing action. Missing structured interpretation falls back to quoted saved description text.

In-progress item reading, ownership, alias, metadata/suggestion and contents forms are retained during background reconciliation. If their saved inputs change, stale save actions are blocked with a reload notice. Ordinary navigation asks before discarding edits. Saving one form clears that form's guard, not another form's draft. Discard edits and reload view is explicit. This is tab-local protection, not a new database transaction or a persistent draft backup. Closing/reloading relies on the browser's unsaved-changes prompt; crashes do not preserve drafts. While drafts are open, Library rebuilding is deferred, so finish or discard edits to see pending saved changes.

## Pages and items per page

Previous and Next controls appear above and below the results, with the current page and displayed range in the center. Either row controls the same page. Enabled controls are purple; gray disabled controls cannot navigate. Navigation returns you to the beginning of the results rather than the main navigation. Opening Details does not trigger this scroll.

Choose **Items per page** near the upper controls: **20, 50, 100 or 200** (default **50**). Changing it resets to page one. The choice is shared with Contents and remembered privately across reopening and browser sessions. It is a UI preference, excluded from library backups; restoring a library backup does not import another browser's page size. Clear local library also clears UI preferences.

Library counts catalog items; Contents counts individual matching book/account cards. Their totals and page boundaries can differ when several accounts have the same item. Search/filter/sort changes start at page one; disappearing results clamp the page to the last available page. Empty results do not show an invalid page or range.
