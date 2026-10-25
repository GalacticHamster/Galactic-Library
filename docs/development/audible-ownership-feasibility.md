# Audible ownership enrichment: feasibility gate

Investigation checkpoint: October 24, 2026, source `879b742`. This is not an
ownership implementation or live purchase-history validation. I3 remains open.
No signed-in account pages were accessed by the development tools, library records
changed, permissions added or purchase-history traversal implemented. The user
subsequently supplied screenshots; a bounded read-only page check is now available
for the remaining identifier/layout questions, not automatic classification.

## Current evidence

Read-only validation of the latest supplied Firefox backup establishes:

| Saved evidence | Count |
| --- | ---: |
| Current Audible source records | 796 |
| Unique valid ASINs, matching saved ASIN metadata | 796 |
| Provider accounts represented | 1 |
| Raw and effective Ownership unconfirmed | 796 |
| Saved acquisition dates | 0 |
| Manual ownership corrections / purchase-evidence proposals | 0 / 0 |
| Action: Remove from favorites | 669 |
| Action: Remove | 127 |

These action labels cannot establish permanent ownership, subscription access or
refunds. There is no supported Owned assignment in the retained data; this does
not mean none of these books were purchased. The share a future ownership check
could classify cannot be estimated from this export. No account secrets or title
inventory were exported in the generated investigation summary. Original backup
bytes were checked unchanged.

This clean Firefox library has no archived Audible records. The user's reported
Chrome reconciliation of 20 wishlist records into Earlier imports is separate
live evidence, not an operation performed on this Firefox backup. I1 is not
reopened, and no cross-browser reconciliation is proposed here.

## Source and persistence findings

- [Audible extraction](../../src/providers/audible.js):
  `entriesFromLibraryDocument` reads scoped library product links, names,
  authors, narrators, series and one action label. `audibleItemIdFromUrl` derives
  ASINs from product paths. `audibleItemFromLibraryEntry` saves ASIN, clean
  product URL and library action; it produces Unknown or explicitly supported
  Subscription, never purchase-derived Owned.
- `ownershipFromLibraryAction` recognizes narrowly stated Plus-catalog access.
  Favorites, list-management and bare Remove actions remain Unknown. Listen,
  download, library membership and catalog availability alone are not ownership
  evidence. A product also being available in a subscription catalog does not
  disprove an earlier purchase of that product.
- No code reads library/title-page purchase dates, credit/cash transactions,
  refund history or hidden structured entitlement data. The retained exports
  contain no raw page bodies to establish whether additional useful fields were
  present but ignored. It would be incorrect to claim either that hidden evidence
  exists or that the website exposes none.
- [Quick update](../../src/providers/audible-content.js) uses the existing known
  ASIN baseline and skips saving already known titles; it is not a historical
  ownership refresh. Full rescan reads the library, not transactions. Neither
  should silently gain an expensive purchase-history traversal.
- [Ownership reviews](../../src/lib/ownership-review.js) and the
  [writer](../../src/background/storage-writer.js) already support account-bound
  local purchase-evidence proposals, explicit confirmation, manual corrections,
  stale-review protection and backup persistence. Applying purchase evidence
  writes a dated ownership review; it does not populate the provider record's
  acquisition date or create a transaction record.
- Existing candidate discovery can suggest title-based candidates when strong
  identifiers are absent. That is a human-review path, not authorization for
  automatic Audible assignment. Automation must require an exact existing
  provider/account/ASIN join and respect edition conflicts and user corrections.
- The current metadata allowlist has no structured Audible purchase/return
  evidence fields. Simply setting a temporary incoming record to Owned would
  not establish durable provenance or protect it against a later Unknown library
  observation. Those persistence questions must be tested before implementation.

## Public provider evidence versus account evidence

The following sources establish provider behavior, not ownership of any book in
this library:

- [Audible purchase/refund history](https://help.audible.com/s/article/view-your-transaction-history?language=en_US)
  documents ordinary signed-in navigation through Account/Membership details,
  purchase-history views and a time-frame selector. Refunds have a separate view
  and order details. It does not establish the oldest accessible year, page
  limits, complete coverage, ASIN exposure or payment-field markup for this user.
- [Purchased versus included titles](https://help.audible.com/s/article/title-in-library-is-locked?language=en_US)
  distinguishes cash/credit purchases from membership-dependent catalog titles
  and Standard monthly selections. A credit used for a completed title purchase
  is different from a membership listening selection. GL's Owned category does
  not promise irrevocable access or immunity from provider availability changes.
- [Buying an audiobook](https://help.audible.com/s/article/buy-an-audiobook?language=en_US)
  includes credit-card/coupon purchases and explicitly purchased zero-price
  titles. A free permanent acquisition needs completed acquisition evidence;
  the word free, a price or a promotional offer alone is insufficient.
- [Credits](https://help.audible.com/s/article/learn-about-credits)
  include promotional credits. Expiry of an unused credit or membership is not
  the expiry of a completed purchase. Actual representation of those purchases
  in this user's history remains unverified.
- [Returning a title](https://help.audible.com/s/article/return-a-title?language=en_US)
  documents the return workflow and some linked Kindle/Audible refunds. A Return
  action is an available operation, not evidence a return happened. A current
  ownership check must distinguish a completed refund from an older purchase
  and handle an identifiable later repurchase conservatively.
- [Gift redemption](https://help.audible.com/s/article/redeem-a-gift?language=en_US)
  distinguishes a redeemed title from gifted membership credits. Neither receipt
  of an offer/code nor purchasing a gift for someone else proves this account
  owns its audiobook. Coverage of received gifts in purchase history is unknown.

No unsupported private API, credentials, cookie copying or provider-history crawl
is justified by these help pages. Existing Audible host access covers ordinary
same-site pages, but authenticated access, account scope and response contracts
still need validation. No additional permission has been requested.

## User-supplied purchase-page evidence

The user confirms both cash and credit purchases appear. Screenshots show
**Your orders**, date presets for 90/180/365 days and individual years 2013–2026,
plus Title, Purchased, Total and Options columns. Visible rows include purchase
dates, credit totals and cash totals. Order details and Return this title actions
are visible. No personal screenshot or transaction inventory is committed.

This establishes that both acquisition methods and dates appear in the normal
account UI. A year being offered does not establish every purchase in that year
is accessible. A Return action does not establish a completed refund. Screenshots
cannot establish underlying ASINs, account binding or pagination completeness.

**First live read-only report:** The current Your orders page for the last 365
days exposed 44 distinct row ASINs, all matching the 796-item saved Audible
profile, with no within-row identifier conflicts. It recognized 14 date fields,
10 credit totals and four cash totals; 30 totals were unrecognized by the original
one-book/one-date diagnostic. This confirms the live identifier join for this
sample, not a purchase count or a forecast of ownership across all 796 books.
No library data changed.

The user explains that multi-item orders share a single date and order total,
including a 22-book cash order and a two-book one-credit promotion. The original
checker incorrectly expected each book to repeat those order-level fields.
This is a diagnostic interpretation limitation, not evidence that the child
books are subscription items or that their purchase information is absent.
Actual personal transaction dates/amounts are not retained in this document or
committed fixtures. Live grouped-order association is the next bounded check.

## Ten feasibility questions

| Question | Finding at this gate |
| --- | --- |
| Can the library distinguish purchases from subscription access? | Some explicit subscription wording is supported, but the 796 saved action labels do not distinguish purchases. Hidden/title-detail evidence remains unobserved. |
| Does purchase history provide reliable permanent-acquisition evidence? | The visible Your orders rows are promising positive acquisition evidence. Exact item binding and reversals still need validation. |
| Can history match library ASINs? | Yes for the observed page: 44 unique ASINs match 44 existing library items without within-row conflicts. Other years/editions and account equivalence remain to be checked. |
| Are credit purchases included? | Yes: user confirmation and the Total column show credit purchases, with exact ASIN matches on the first page. Shared child-row association and reversals remain unverified. |
| Are cash purchases included? | Yes: user confirmation and the Total column show cash purchases, with exact ASIN matches on the first page. Shared child-row association and reversals remain unverified. |
| Are promotional acquisitions represented? | Several distinct mechanisms exist; account-history inclusion and permanent-acquisition evidence remain unknown. |
| Can returns/refunds be identified? | A refund-history view is documented. Exact item binding, chronology and actual status fields remain unknown. |
| Is historical coverage complete? | Unproven. Years 2013–2026 are offered; actual coverage, pagination, migrations, gifts and Amazon purchases remain to be checked. |
| What percentage can be classified? | No defensible forecast. The library backup alone establishes no purchases; the history sample does not support a forecast for all 796 books. |
| What remains uncertain? | History structure/access, account binding, ASIN joins, dates, reversals, older formats, gifts and promotions. |

## Decision and next evidence

**Stop before ownership implementation.** This is an account-evidence gate, not a
conclusion that Audible ownership detection is impossible. Path A cannot yet be
claimed. Path B (positive-evidence enrichment with incomplete historical coverage)
is the smallest candidate if exact joins and completed transactions are verified.
Use Path C review-only handling where an identifier is absent or conflicts; do
not silently use loose title matching. Path D applies only if investigation shows
no sufficiently reliable source, not merely because account pages are unavailable
to the development environment.

Initial user check, with no rescan or library writes:

1. Open Audible → Account/Membership details → Purchase history → Your orders.
2. Report whether known cash and credit purchases appear and which year/date
   options are offered. Check a known older purchase if convenient.
3. Determine whether each sample title has a normal audiobook product link.
   If links are needed for the next step, use only product URLs with query
   parameters removed, never account/order-detail URLs, payment data or codes.
4. Where available, inspect one known temporary catalog title and one completed
   refund to distinguish acquisition from present access. Do not perform a return
   or purchase to produce test evidence.

The first two checks above are supported by the screenshots; the first live
report also establishes the ASIN join for its 44-book sample. For the remaining
shared-order association check, open the signed-in
[read-only purchase-page check](https://www.audible.com/account/purchase-history?gl-audible-ownership-check=1)
after reloading the updated extension. Click **Check this page (no import)**, then
**Export check report**. There is no need to rescan the 796-title library or open
order details. This diagnostic has no normal release-panel entry point.

The format-2 checker reads at most 100 rendered rows with explicitly recognized columns.
It counts product-link/explicit-row ASIN presence, exact matches against the
currently selected saved Audible profile, date/payment-format presence and
action/status wording. It does not assign ownership, click orders/returns, change
filters, fetch provider pages or certify complete history. The raw existing
`GET_PROVIDER_SYNC_STATE` read is used with `beginScan:false`; the import wrapper
that starts a scan lease is deliberately bypassed. Account equivalence remains
unverified even if identifiers match. If library comparison fails, structural
counts remain exportable without exposing the raw error.

The export has bounded counts, recognized view/year-filter labels and fixed header
labels with ancestor tag/count shapes only. It
omits titles, individual purchase dates, prices, ASIN values, order IDs, account
details, credentials and raw bodies. Recommendations outside a recognized table
are not purchase-row matches. Unexpected layouts return an unrecognized-structure
report rather than guessed order mappings. The function returns diagnostic
counters only, not importable records. The subsequent live format-2 report
validated shared-order recognition for the displayed sample: all 44 distinct
book ASINs matched saved items and dated order evidence, with 30 using shared
evidence and none unbound. Fourteen orders comprised five single-book orders,
seven two-book orders, one three-book order and one 22-book order. Nine groups
used explicit order keys; five used direct rows. No conflicting groups were
reported. One unreadable row layout did not leave any book rows unbound; its
purpose cannot be established from this sanitized report. This is a sample of
the last 365 days, not verification of the full library or refund history.

**Grouped orders:** Dates, cash totals and credit totals describe the order, not
necessarily each individual book. The checker preserves logical columns across
explicit HTML row/column spans. It reports proposed grouping through explicit
same-site order keys/links or a declared row group with one supported shared
date/payment pair. It also supports the user-confirmed Your orders presentation:
a valid date/payment row with an actual Order details link followed by contiguous
book rows with both shared fields blank. Only that recognized view/table and
uninterrupted row group qualify. New headers, unknown intervening rows, invalid
or conflicting nonempty fields, separate row groups and other history views do
not inherit the prior order. A generic blank cell is never sufficient evidence.

The report distinguishes candidate order counts, unique book identifiers,
shared-evidence rows and still-unbound rows. Exact order keys exist only in
temporary page memory to compare grouping; only allowlisted attribute/parameter
names and aggregate counts are exported. No price is allocated to individual
books, and a two-book one-credit deal does not imply two credits were spent.
Repeated rows for the same ASIN do not become multiple distinct books.
These are grouping diagnostics, not automatic ownership or refund decisions.
Per-book returns, current access and manual corrections still require their own
handling before any ownership write. No history requests or provider actions
are performed.

**History navigation and refund check (format 3):** The opt-in checker now
reports visible Next/Previous controls, disabled states, numbered pagination
controls and a small allowlist of same-page navigation parameter names. It
exports no destination URLs or parameter values, follows no links and does not
change filters. Absence of Next does not prove historical completeness.

Select **Refund history** in Audible's View menu, wait for the page to load,
then use **Check this page (no import)** and **Export check report**. The report
looks for allowlisted table headers, exact per-row ASINs and explicit completed
refund wording in Status/Options cells. Return actions, pending wording,
conflicting ASINs and unfamiliar columns do not establish completed refunds.
Unknown headers are counted without exporting their text. An empty or unfamiliar
refund page does not prove that no refunds exist. This is structural feasibility
inspection, not a validated refund parser or ownership importer.

Also inspect **Your orders** with a specific prior year selected (2025 is a useful
initial sample) and export a separate report after it loads. If Next is present,
check the next page separately. These samples establish live navigation and
refund layouts before any automatic traversal is implemented. No full library
rescan, return action, transaction screenshot or private order export is needed.
The extension cannot inspect an authenticated account page from the development
checkout; these sanitized reports supply that missing live evidence.

The live format-3 Refund history sample showed the usual Title/Purchased/Total/
Options headers but zero book rows, zero product ASINs and no navigation controls
for the last 365 days. This is consistent with the user's statement that they
have no refunds. It does not validate populated refund rows or all-year history;
no return should be performed just to obtain a fixture. The older-year order
and pagination samples remain outstanding.

Audible drops extra URL parameters when changing history filters. Opening the
opt-in URL now remembers check mode on purchase-history pages in the same tab
for up to two hours. Only an expiry timestamp is stored in site session storage;
no account or transaction information is stored there. **End check** clears it
and removes the opt-in URL parameter while retaining Audible's other filters.
The normal library page is unaffected. If browser settings block session storage,
the explicit URL flag still works but cannot persist across filter navigation.

Future implementation must first prove persistence on disposable data: exact
account/ASIN assignment, cash/credit/free/gift semantics where observed, explicit
returns/repurchases, incomplete history, different narrations, authoritative
manual corrections, dates, unchanged repeated enrichment, Full/Quick survival,
wishlist exclusion and unrelated-provider preservation. Absence from history
must never become Subscription or revoke a purchase. No supported percentage,
automatic implementation or live enrichment has been claimed at this checkpoint.

## Existing regression baseline

- `node tests/run.js`: 1,713 passing tests, including existing Audible rescan
  preservation and a real-worker check that feasibility reads create no scan lease
  or library/storage mutation and reject foreign origins.
- `node tests/browser.js --release --audible`, with and without `--firefox`:
  77 packaged checks in each browser for existing library extraction, boundaries,
  access labels, persistence and messages.
- `node tests/browser.js --release --audible-ownership`, with and without
  `--firefox`: 60 focused packaged checks cover the actual read-only panel,
  sanitized download, bounds, identifier conflicts, hidden/recommendation rows,
  date/payment recognition, grouped bulk/credit orders, spans, group boundaries,
  conflicts, navigation, refund-specific layouts, explicit versus pending/refund
  actions, tab-local opt-in/expiry/end behavior and read failures without imports
  or network requests. Multi-book
  examples use synthetic transactions rather than the user's order data.
- These do not establish live ownership enrichment. No automatic classification
  implementation is appropriate until the account-evidence contract is demonstrated.

Private aggregate baseline output is under ignored `audit-artifacts/`; it is not
a committed fixture. No original backup or installed library was modified.
