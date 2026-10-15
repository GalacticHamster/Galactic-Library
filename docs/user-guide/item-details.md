# Inspecting an item in Library

Open **Details** on a Library result. The main navigation remains **Library | Providers | Contents | Settings**. Missing artwork, authors or edition identifiers do not prevent inspection.

For result search, combined account filters, sorting and remembered browsing position, see [Library browsing](library-browsing.md).

The collapsed row shows title, media, creator and series. **Edition details and artwork** keeps the full saved overview, cover and known volume/issue, edition, language, publisher, publication and ISBN information available without repeating it throughout the default Details view. Audiobooks also show recorded narrators. Several saved values can be shown when accounts differ; they are not silently reduced to a newly inferred edition. Artwork uses the existing provider image URL, loads only when inspecting the item, and disappears if loading fails.

## Your library

Each provider/account has a separate access observation, acquisition/observation dates when saved, and reading status where applicable. For example, Kindle — Personal can be Owned while Kindle — Family is Borrowed on the same canonical item. Grouping those records does not establish ownership in every account.

Reading status is **not saved** until a reading state exists. Expand **Reading, access and downloads** to edit the exact account's existing reading, percentage, access and local-download fields. The field **Availability (self-reported)** describes whether you can use the copy; it never changes ownership. **Reading orders and progress** keeps the cross-library ordering workbench available.

For an ordinary correction, use **Change access** on the Library card, including
selected account copies for bulk changes. No dated evidence is required.

Expand **Confirm ownership with dated evidence** to record or undo an existing supported ownership decision. The original provider observation remains separate. User ownership preferences are explicitly labeled, and expiry dates remain visible. Global and provider preferences remain in Settings. **Edition relationships, purchase evidence and reminders** opens the existing workbench for those cross-library tasks.

## Contents

Each book account shows its saved contents status and readable included works, with a bounded preview and expandable full list. Reviewed and unreviewed descriptions remain distinctly labeled. These counts are not a guessed complete enumeration. A latest failed acquisition can coexist with earlier useful evidence.

**Review contents** opens that exact provider record in Contents. The detailed book contents editor exists there, rather than being duplicated in Library. **Open this book in Library** returns to the originating search, filters, sort, page and scroll position within this Options tab. Direct/reloaded links open the exact current record; if the originating filtered result no longer exists, Library falls back to locating it without filters under the selected sort.

## Book information

Expand this section when you want to improve a book. Current catalog facts stay in the overview; the section explains missing creator, ISBN, edition or language information without treating absence as a mismatch.

1. Request Google Books edition candidates, an Open Library work, an ISBN edition, or metadata from a local file/publisher page.
2. Inspect the saved suggestion and its proposed fields and source. Check the account list under **Applies to**: an ordinary lookup targets the provider records in this item.
3. Choose the result and explicitly confirm its work or edition, then **Accept suggestion**. Known edition conflicts block acceptance. **Dismiss suggestion** removes the pending result, not the provider record.
4. Use **Undo source selection** or **Sources and undo** to restore the previous selection for the indicated account. Other accounts' selections remain intact.

Lookups do not run when you navigate or open a section. Failed/empty results remain visible; existing Google Books/Open Library retries are available. File/publisher failures use their original source tools. Files stay in the browser; publisher metadata is pasted, not scraped. Google Books still uses the configured API key. No new service is enabled.

Open Library work information describes a work across editions; its aggregate ISBNs do not identify your copy. External results are suggestions until an existing authoritative operation approves them. Provider metadata, approved external sources, identity decisions, contents reviews and ownership evidence remain distinct. Bibliographic acceptance does not establish ownership or verify included works.

**Sources and undo** builds its comparison tables only when expanded and labels each account, source, approval/basis and date. **Bulk book information and review** keeps batch discovery and cross-library review available. Existing automatic batch acceptance rules and checkpointing are unchanged. An accepted suggestion may remain in the pending-review store under the existing API; dismiss it when finished if it is still listed.

## Advanced

Expand **Advanced**, then **Matching, editions and source evidence** to review the consequences and choose account copies. **Account sources and technical evidence** keeps identifiers, observations and provenance available beneath the relationship controls. The controls retain their actual semantics:

| Existing operation | Meaning |
| --- | --- |
| Same work | Records stay separate editions and contribute a Possible relationship. |
| Same edition | Groups records only when existing identity checks permit it. |
| Different works | Blocks grouping and related candidates for that relationship. |
| Separate this record into its own edition | Applies an explicit edition barrier; undo restores the prior grouping. |
| Alternate titles and aliases | Adds record-scoped Possible evidence, not confirmed ownership. |

To compare records, type a title, provider or edition into the search picker and choose one of up to 20 results. The current record and its confirmed Same Edition group are excluded. Same Work relates different editions without establishing identical products; Same Edition confirms the same specific product, subject to existing conflict checks.

When confirming Same Edition, choose which source title the library should display. You can change it later with **Preferred library display title → Save display title** in this section. Imports and synchronization preserve your choice; backups include it. All original source titles and purchase histories remain intact. If groups with previously chosen titles are combined, the most recently saved choice supplies the display title; separating records retains each choice with its source record.

Canonical identity decisions are not ownership confirmations. Contents source history and independent claims remain available through the exact record in Contents. Existing game contents tools remain under Advanced because the current Contents workspace lists books.

## Existing capabilities and routes

| Capability | Current entry point |
| --- | --- |
| Individual Google Books/Open Library lookup, local EPUB/ComicInfo/OPF or publisher metadata, ISBN edition lookup | Item Book information; shared review and writer operations. |
| Source preview, conflicts, approval, dismissal, retry and source undo | Item review / Sources and undo; also bulk Book information. |
| Bulk discovery, pause/resume/reset and cross-library suggestion queues | Library's Book information workbench; `#books` remains valid. |
| Reading states, custom orders, rename/reorder/remove and historical order entries | Item Your library and Reading orders and progress; `#reading` remains valid. |
| Duplicate decisions, local receipts, Comixology review export, key/access reminders and notification preferences | Item Advanced or retained Ownership and access workbench; `#ownership` remains valid. |
| Detailed included works, confirmations, overlap, series gaps and source history | Exact-record Contents workspace; `#contents?record=…`. |
| Direct item inspection | `#library?record=…`; durable account-specific record reference. |
| Ownership policies, external client pairing, backups and diagnostics | Settings. |

## Performance and boundaries

Library still renders fifty results per page. Opening it constructs no item editors or external searches. Overview and Your library are built for an inspected item; Book information, Advanced, inner editors and source tables build on demand. The loaded committed Options snapshot supplies each card without another database read. Duplicate candidate presentation is reused for that unchanged snapshot. Normal Library navigation does not interpret every Kindle manifest; the explicit bulk review may still process its saved cross-library contents queue.

Expanded item sections are remembered by a durable record anchor through in-tab reconciliation and regrouping, not across an Options reload. Unsaved individual reading, ownership, metadata/suggestion, alias and contents drafts are protected in the current tab. Background reconciliation retains their DOM; changed saved information blocks stale saving. Navigation asks before discarding edits, and explicit discard/reload loads the current snapshot. Saving one form does not discard another. No draft store or new transaction protocol is introduced. Browser closing/reloading relies on its unsaved-changes prompt; crashes cannot recover these drafts. Ordinary metadata lookup remains book-specific; audiobook reading and available provider metadata remain accessible. No schema, profile, matching, ownership, acquisition, history or backup semantics changed.

See [Contents](contents-workspace.md), [book enrichment](comic-manga-enrichment.md), and [ownership and reading tools](library-tools.md).
