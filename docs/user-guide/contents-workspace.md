# Contents: discover, review and compare included works

Open **Contents** to find books, collections, graphic novels and omnibuses from every remembered account. Use the title/account search, contents status and provider filters. The list shows fifty account-specific records per page. The same product in two accounts stays separate.

Choose **Inspect contents** to review that record without leaving Contents. **Back to collections** restores the search, filters, page and scroll position for this open Options tab. These Contents filters are not currently saved across an Options reload.

## What the statuses mean

| Status | Meaning |
| --- | --- |
| Reviewed contents | Human-reviewed entries are saved for this record. This does not assert that every part of the book has been enumerated. |
| Contents identified — not reviewed | The saved interpretation accounted for the selected source text. Entries remain suggestions; a parsed description does not prove complete book contents. |
| Contents partially identified | Saved interpretation left unresolved text, or the captured description may be incomplete. |
| Contents need review | A statement exists but its interpretation is uncertain, unsuccessful, filtered, or not recorded. |
| No usable contents in captured source | An acquisition is stored without a contents statement. This does not mean the book contains no works. |
| Acquisition not attempted | No acquired contents source is recorded. Automated acquisition currently supports eligible Kindle books only; manual review is available for other books. |
| Source failed or unavailable | Acquisition did not produce usable source evidence. Retry/recovery belongs on the signed-in Kindle page. |

The **Latest source failed or unavailable** filter also finds records that retain an older useful statement or a human review after a failed attempt. Such a failure does not discard earlier evidence or change a saved review. **Needs human review** finds unconfirmed statements and statements that differ from the saved review. A proven whole-parent statement does not count as different merely because the saved source selected one of its child spans.

List counts refer to saved human-reviewed entries, not a guessed total number of issues in the book. Exact proposed counts are computed only when opening a record. Statuses use stored interpretation fields; browsing does not reparse or refresh your library.

## Inspect and correct contents

Contents is the authoritative book contents editor; Library item details provide a summary and exact-account link. Suggestions appear as editable rows; they are not automatically confirmed. Check series/collection, series version or year, unit type, number or name, language, and full versus excerpt extent. Unresolved source material stays visible.

- Correct a row or remove a wrong suggestion before **Save verified contents**.
- Use **Add contents entry** for material you checked yourself.
- Under **Source evidence and interpretation**, inspect/edit the statement and source URL. **Parse statement for review** replaces draft rows with suggestions from that input.
- **Undo contents confirmation** removes the human review while preserving captured source evidence.

These are the existing authoritative review operations. There is one saved contents review per provider record. No persistent rejection of an acquired statement exists: leaving it unconfirmed is not confirmed coverage. Saving requires at least one valid entry; undo is the supported way to remove confirmation.

If saved source evidence or a review changes during editing, your draft is retained and Save/Undo are disabled. **Reload saved contents** deliberately replaces that draft with the latest saved state. This is a reconciliation safeguard, not a new database conflict-resolution protocol.

## Details and Advanced

Default review shows included entries, uncertainty and actions. Expand:

- **Source evidence and interpretation** for the original statement, source, acquisition date and review date.
- **Book information and enrichment** for provider metadata, external work/edition information, pending lookup status, ownership/access context, and the existing Sources and undo controls. **Open book information** opens the existing Library book tools for optional lookups and suggestions; routine contents review stays here.
- **Advanced contents evidence** for manifest windows and independent captured claims. Loading an independent claim changes the draft only. Saving it replaces the single review; claims are never automatically combined.
- **Advanced source history and recovery** for the current source, pinned earlier observation, latest failed attempt, source/parser versions and paged retained selections. History is read-only here; existing selection undo remains under Sources and undo.

Book lookup metadata, contents suggestions, human corrections and ownership/access evidence are distinct. Adding bibliographic information never confirms a purchase. No new external provider is enabled by this interface.

## Collection overlap and gaps

**Overlap with other reviewed collections** compares this record's saved full entries with other qualifying owned records through the existing contents coverage evaluator. It excludes this record so a collection does not report overlap with itself. Missing series version/language, excerpts, and named-component identity limitations remain visible; uncertain overlap is not promoted to confirmed ownership.

**Collection overlap and series gaps** retains the existing reviewed-series dashboard and target-range comparison. Gaps are within an observed or explicitly requested span, not a complete-series bibliography. Coverage through a collection does not create independent digital entitlements to its included issues. Unconfirmed absence is not proof that an issue is missing from every account.

## Acquisition and navigation

Only the signed-in Kindle page controls acquisition, Refresh All, Pause/Resume, account confirmation and retry. Contents displays existing progress and links to that page. Navigation and account selection never start acquisition. Profile-owned queues, cursors, leases and histories are unchanged.

Library item Details includes **Review contents**, with account-specific links when a card contains several records. Contents includes **Open this book in Library**. These links preserve the durable record reference in a local URL fragment; reloading a valid book link opens that exact record. Returning through that link restores the originating Library search, filters, sort, page and scroll position within this Options tab. Legacy workspace links remain available; game contents tools remain under Advanced in Library.

The overview reuses the loaded committed database, caches lightweight rows for that object and creates only fifty list cards. Source parsing, editors, history and comparisons are deferred to the requested book/panel. No extra database read populates the overview. The existing book-suggestion workbench also defers its full source interpretation until opened and visible.

See [Kindle discovery](kindle-contents-discovery.md), [book enrichment](comic-manga-enrichment.md), and the [contents identity contract](../architecture/contents-evidence.md) for the unchanged evidence rules.
