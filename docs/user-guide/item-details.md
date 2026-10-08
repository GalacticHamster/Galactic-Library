# Inspecting an item in Library

Open **Details** on a Library result. The main navigation remains **Library | Providers | Contents | Settings**. Missing artwork, authors or edition identifiers do not prevent inspection.

The overview shows the saved title, media type, available creator and cover, and known series, volume/issue, edition, language, publisher, publication and ISBN information. Audiobooks also show recorded narrators. Several saved values can be shown when accounts differ; they are not silently reduced to a newly inferred edition. Artwork uses the existing provider image URL, loads only when inspecting the item, and disappears if loading fails.

## Your library

Each provider/account has a separate access observation, acquisition/observation dates when saved, and reading status where applicable. For example, Kindle — Personal can be Owned while Kindle — Family is Borrowed on the same canonical item. Grouping those records does not establish ownership in every account.

Reading status is **not saved** until a reading state exists. Expand **Reading, access and downloads** to edit the exact account's existing reading, percentage, access and local-download fields. These self-reports never confirm ownership. **Reading orders and progress** keeps the cross-library ordering workbench available.

Expand **Confirm ownership with dated evidence** to record or undo an existing supported ownership decision. The original provider observation remains separate. User ownership preferences are explicitly labeled, and expiry dates remain visible. Global and provider preferences remain in Settings. **Ownership duplicates, purchase evidence and reminders** opens the existing workbench for those cross-library tasks.

## Contents

Each book account shows its saved contents status and number of human-reviewed entries, if any. These counts are not a guessed complete enumeration. A latest failed acquisition can coexist with earlier useful evidence.

**Review contents** opens that exact provider record in Contents. The detailed book contents editor exists there, rather than being duplicated in Library. **Open this book in Library** returns to the originating search, filters, page and scroll position within this Options tab. Direct/reloaded links open the exact current record; if the originating filtered result no longer exists, Library falls back to locating it without filters.

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

Expand **Advanced**, then **Matching, editions and source evidence** to inspect identifiers, observations, provenance, relationships and edition separation. The controls retain their actual semantics:

| Existing operation | Meaning |
| --- | --- |
| Same work | Records stay separate editions and contribute a Possible relationship. |
| Same edition | Groups records only when existing identity checks permit it. |
| Different works | Blocks grouping and related candidates for that relationship. |
| Separate this record into its own edition | Applies an explicit edition barrier; undo restores the prior grouping. |
| Alternate titles and aliases | Adds record-scoped Possible evidence, not confirmed ownership. |

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

Expanded item sections are remembered by a durable record anchor through in-tab reconciliation and regrouping, not across an Options reload. Unsaved individual enrichment/reading/ownership form drafts can be lost on reconciliation, as before; this phase adds no transaction or draft store. The Contents draft guard remains in place. Ordinary metadata lookup remains book-specific; audiobook reading and available provider metadata remain accessible. No schema, profile, matching, ownership, acquisition, history or backup semantics changed.

See [Contents](contents-workspace.md), [book enrichment](comic-manga-enrichment.md), and [ownership and reading tools](library-tools.md).
