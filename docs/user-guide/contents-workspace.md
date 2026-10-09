# Contents: discover, review and compare included works

Open **Contents** to see included works for books from every remembered account. Library and Contents share search, media, provider, saved account, genre, access, reading, series and sorting. Contents-specific status filters remain separate and clearly marked. Contents is book-only; an incompatible media filter produces an honest empty result, not a reinterpreted selection.

Pages follow the same catalog ordering as Library, with separate cards for qualifying accounts and a shared adjustable page size. The same product in two accounts keeps its own descriptions and reviews. Switching follows the current item/first visible group, and clamps the saved page when that item no longer qualifies. See [Library browsing](library-browsing.md) for exact filter and position semantics.

Results use the same rounded card treatment as Library. Each card shows its title, provider/account, included works when available, and one verification/uncertainty caption. **Inspect contents** is a compact keyboard-accessible action. Latest retrieval failures and changed descriptions remain visible; **Last contents activity** is available inside inspection instead of on every card.

Choose **Inspect contents** to review the exact account record. **Back to Library results** or **Back to Contents results** returns to the actual origin with filters, sort, item/page and scroll. **Contents collection list** opens that list explicitly. Common preferences and contents status survive Options reloads; the current tab's browser history also retains a review's return context. Copied direct links default to Contents results when no origin exists.

## What the statuses mean

| Status | Meaning |
| --- | --- |
| Contents reviewed | Human-reviewed entries are saved for this record. This does not assert that every part of the book has been enumerated. |
| Contents found · Not reviewed | The saved interpretation accounted for the selected source text. Entries remain suggestions; a parsed description does not prove complete book contents. |
| Some contents found · Not reviewed | Saved interpretation left unresolved text, or the captured description may be incomplete. |
| Contents need review | A statement exists but its interpretation is uncertain, unsuccessful, filtered, or not recorded. |
| No contents statement found | An acquisition is stored without a contents statement. This does not mean the book contains no works. |
| Not checked yet | No acquired contents source is recorded. Automated acquisition currently supports eligible Kindle books only; manual review is available for other books. |
| Couldn't retrieve description | Acquisition did not produce usable source evidence. Retry/recovery belongs on the signed-in Kindle page. |

The **Latest retrieval failed** filter also finds records that retain an older useful statement or a human review after a failed attempt. Such a failure does not discard earlier evidence or change a saved review. **Needs contents review** finds unconfirmed statements and statements that differ from the saved review. A proven whole-parent statement does not count as different merely because the saved source selected one of its child spans.

List counts refer to saved human-reviewed entries, not a guessed total number of issues in the book. Statuses use stored interpretation fields. Visible previews reuse human entries or derive suggestions from the saved bounded parser input in a 200-record snapshot cache. They do not read full source blocks, reinterpret every record or refresh a provider. Where that input is unavailable, saved description text is shown without claiming a structured result.

## Inspect and correct contents

Contents is the authoritative book contents editor; Library cards and Details provide read-only included works and an exact-account editing link. Suggestions appear as editable rows; they are not automatically confirmed. Check series/collection, series version or year, unit type, number or name, language, and full versus excerpt extent. Unresolved source material stays visible.

- Correct a row or remove a wrong suggestion before **Save reviewed contents**.
- Use **Add contents entry** for material you checked yourself.
- Under **Where this information came from**, inspect/edit the statement and source URL. **Parse statement for review** replaces draft rows with suggestions from that input.
- **Undo contents review** removes the human review while preserving captured source evidence.

These are the existing authoritative review operations. There is one saved contents review per provider record. No persistent rejection of an acquired statement exists: leaving it unconfirmed is not confirmed coverage. Saving requires at least one valid entry; undo is the supported way to remove confirmation.

If saved source evidence or a review changes during editing, your draft is retained and Save/Undo are disabled. **Reload saved contents** deliberately replaces that draft with the latest saved state. This is a reconciliation safeguard, not a new database conflict-resolution protocol. Navigation asks before discarding a dirty editor. If the record disappears, its open draft remains readable for reference and Save/Undo are blocked. Drafts are not backed up; closing/reloading uses the browser's unsaved-changes prompt.

## Details and Advanced

Default review shows included entries, uncertainty and actions. Expand:

- **Where this information came from** for the original statement, source, acquisition date and review date.
- **Book information and enrichment** for provider metadata, external work/edition information, pending lookup status, ownership/access context, and the existing Sources and undo controls. **Open book information** opens the existing Library book tools for optional lookups and suggestions; routine contents review stays here.
- **Advanced contents evidence** for manifest windows and independent captured claims. **Original description**, **Suggested included works**, review status and unresolved material come first; raw parser classifications, source coordinates and retained JSON are under **Technical details**. **Replace draft with this statement** clears unsaved rows and loads only that statement; saved reviews stay unchanged until Save. Saving it replaces the single review; claims are never automatically combined.
- **Earlier descriptions and technical history** for the current source, pinned earlier observation, latest failed attempt, source/parser versions and paged retained selections. History is read-only here; existing selection undo remains under Sources and undo.

Book lookup metadata, contents suggestions, human corrections and ownership/access evidence are distinct. Adding bibliographic information never confirms a purchase. No new external provider is enabled by this interface.

## Collection overlap and gaps

**Overlap with other reviewed collections** compares this record's saved full entries with other qualifying owned records through the existing contents coverage evaluator. It excludes this record so a collection does not report overlap with itself. Missing series version/language, excerpts, and named-component identity limitations remain visible; uncertain overlap is not promoted to confirmed ownership.

**Collection overlap and series gaps** retains the existing reviewed-series dashboard and target-range comparison. Gaps are within an observed or explicitly requested span, not a complete-series bibliography. Coverage through a collection does not create independent digital entitlements to its included issues. Unconfirmed absence is not proof that an issue is missing from every account.

## Acquisition and navigation

Only the signed-in Kindle page controls acquisition, Refresh All, Pause/Resume, account confirmation and retry. Contents displays existing progress and links to that page. Navigation and account selection never start acquisition. Profile-owned queues, cursors, leases and histories are unchanged.

Library item Details includes **Review contents**, with account-specific links when a card contains several records. Contents includes **Open this book in Library**. These links preserve the durable record reference in a local URL fragment; reloading a valid book link opens that exact record. Returning through that link restores the originating Library search, filters, sort, page and scroll position within this Options tab. Legacy workspace links remain available; game contents tools remain under Advanced in Library.

The overview reuses the loaded committed database, caches lightweight rows for that object and creates only the selected page of book/account cards. Cached bounded-input suggestions serve visible previews; full-source interpretation, editors, history and comparisons remain deferred to a requested book/panel. No extra database read populates the overview. The existing book-suggestion workbench also defers its full source interpretation until opened and visible.

See [Kindle discovery](kindle-contents-discovery.md), [book enrichment](comic-manga-enrichment.md), and the [contents identity contract](../architecture/contents-evidence.md) for the unchanged evidence rules.

## Pagination

Contents uses the same top/bottom pagination controls and **Items per page** preference as Library: 20, 50, 100 or 200 (default 50). Each Contents card represents one qualifying book/account record, so a page contains at most the selected number of cards even when several accounts share one catalog item. The header keeps catalog and account totals separate; the displayed range counts the account cards.

Changing page size starts at page one and updates both rows. Search/filter/sort also reset the page. Page navigation scrolls back to the upper results controls after rendering. The choice survives reopening but is excluded from backups. See [Library pages](library-browsing.md#pages-and-items-per-page).
