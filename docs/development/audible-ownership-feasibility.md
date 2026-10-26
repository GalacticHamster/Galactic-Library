# Audible automatic ownership enrichment

Updated October 24, 2026. Implementation is complete in the working source;
actual integrated Firefox Full/Quick validation remains open under
[I3](1.0-release-checklist.md#i3--audible-automatic-ownership-enrichment).

## Evidence and scope

The frozen Firefox library has 796 Audible records, all initially ownership
unconfirmed, with no acquisition dates or ownership corrections. Favorites and
Remove controls do not establish purchase or subscription access. The earlier
816-item Chrome count included 20 wishlist records; history enrichment must not
reintroduce those as transaction-shaped books.

Read-only live history reports demonstrate exact identifier matches: the initial
last-365-days sample contains 44 books across 14 dated orders; a native switch to
2025 shows 64 books across 20 orders. Multi-book orders share dates and totals.
The user confirmed cash, credit and promotional two-for-one orders. Order totals
must never become per-book prices or repeated credit charges. The latest native
background-page test verified document navigation and year selection. Its
header-detail bound is separate from purchase-row traversal limits. The account
has no reported refunds; populated-refund behavior is not live established.

## Deliberately different update guarantees

- Full rescan reads the complete library and every available history year in
  both Your orders and Refund history. It is the historical reconciliation path.
- Quick update retains Date added incremental library discovery and checks only
  offered current and previous calendar years. Audible's observed last-365-days
  view spans both years, so the bounded two-year window avoids a year-boundary
  gap without guessing private date-filter parameters. No older-year fallback,
  periodic sweep or historical transaction-change polling occurs.
- Without an initial library baseline, Quick stops with a request to use Full
  once. It never changes modes implicitly. An established library without a
  completed all-year history check still gets a recent-only Quick update, with
  a notice that older reconciliation requires Full.
- Completion records include full/recent scope. A simple fullCheckedAt timestamp
  records a successful comprehensive check and survives later recent checks;
  this is not a transaction cursor or a scheduled-rescan system. A completed
  recent check cannot create that historical-completeness marker.

## Native traversal and honest completion

The normal existing buttons open a temporary same-origin, off-screen history
page using the browser session. Native view/year controls and real Next links
are used. No invented query parameters, credentials, private APIs or new
permissions are needed. The frame is removed after success or failure. Every
selected page must load as the expected document/view/year. Purchase dates must
agree with the selected purchase year.

Repeated pages, unsupported load-more controls, ambiguous empty tables,
authentication challenges, inaccessible frames and safety limits cannot claim
completion. Recognized empty-year wording is required. Refund and order work
have separate completion flags; a bounded fresh frame can recover the other
view after one view fails. Source errors do not become proof of no refunds.

## Reconciliation and preservation

Only exact Audible identifiers in the selected saved account can enrich existing
library audiobooks. Full enriches discovered books; Quick may also enrich saved
unconfirmed books matched in recent history. History never creates a new
bibliographic record. Independent provider observations and manual reviews remain
separate, and manual corrections stay authoritative.

Completed dated order context is required. Cash, credit, explicit zero-price and
other payment formats can qualify independently of monetary formatting. Pending,
borrowed, rental and outbound-gift wording cannot establish ownership. Explicit
gift redemption or completed promotional acquisition can qualify; these cases
are conservatively fixture-tested, not claimed live-account coverage.

Purchase facts retain calendar date and method; raw prices and order IDs are not
stored. Shared dates are associated only through supported order grouping.
Original source identities, metadata and reviews remain. Existing reliable
acquisition dates are not overwritten. Missing dates are filled from the earliest
supported purchase fact, with date-only presentation preserving the calendar day.
Repeated facts are deduplicated rather than added as acquisition events.

Confirmed returns require exact identity, explicit completed-return wording and
an actual refund/return date, not the Purchased column. Later supported
repurchases may restore ownership; same-day or uncertain chronology preserves
uncertainty. A return link merely offering an action is not a completed return.
Recent checks do not approve older uncertain facts just because recent refund
history was readable. They preserve previously saved evidence and dates.

Library failure prevents replacement. History failure still permits successful
library discovery to save atomically with existing evidence. If refunds are
unchecked, newly read purchases can supply dates but cannot establish new Owned
classifications. Safe positives from readable order pages can qualify when the
relevant refund scope completed, without claiming all orders were traversed.
No absence from history means subscription, revocation or loss of ownership.

## Validation and remaining live gate

Synthetic unit and packaged Chrome/Firefox tests cover different Full/Quick
scopes, native pages and asynchronous readiness, unavailable recent filters,
empty/repeated/challenge/lazy pages, shared orders, unfamiliar totals, refund
dates, repurchases, manual corrections, failure isolation, reload/backup and
idempotence. Existing library pagination and wishlist exclusions remain tested.

A disposable frozen-library replay with the earlier 44-book evidence sample
produces 44 enriched owned matches and dates, 752 remaining unconfirmed records,
zero repeat Full/Quick changes, and unchanged other providers, reviews, identities
and history. Original input hashes remain equal. Completion flags in this replay
are controlled test inputs, not live proof of complete refunds/history.

Next: one normal Firefox Full rescan and full-backup comparison, followed by a
separate Quick update performance/idempotence check. Actual populated refunds,
older-year pagination and unsupported site-layout changes remain explicit risks.
The optional diagnostic/private evidence preview remains troubleshooting only;
normal updates require no evidence file, second ownership action or receipt
approval. No predicted full-account ownership percentage is justified yet.

## First integrated Firefox result and follow-up

The first live integrated Full rescan retained 796 library records, captured
purchase evidence and acquisition dates for 361 audiobooks from 2022 through
2026, and confirmed zero Owned classifications because refund traversal was
incomplete. Its saved final reason was history-unreadable-entries; the summary
overwriting the earlier refund failure prevented complete diagnosis from the
backup. The 370 updated records included date/evidence and source metadata
changes, not 370 newly established purchases.

The supplied empty-refund screenshot explicitly says "Looks like you don't have
any refunds in your purchase history." The former empty-list check did not
recognize this wording and searched only within the table. The repair recognizes
this exact visible refund-only message outside the recognized table while
retaining failure for hidden, blank, loading and unrecognized lists. Purchase
and refund failures now retain separate view/year/reason and aggregate row
counts in the saved summary and backup; no source prose, IDs or order data is
added to those diagnostics. The normal completion message describes the actual
failure instead of suggesting every parser failure is a login problem.

The 2021 read-only report contains 79 rows / 77 distinct ASINs, 20 dated orders,
one conflicting order group, 15 unbound rows and two completed-return labels.
The exact conflicting values are not exported and must not be guessed. A bad
group now contributes no purchase evidence, including through a direct-row
fallback, while independently supported orders/pages/years continue through
2013. The orders scope remains incomplete if anything is unreadable; ambiguous
returns stay unconfirmed. Safe positives can contribute only after the selected
refund scope completes. Saved summaries retain the first failure per view and
the number of uncertain refund identities. Full and recent scopes are unchanged.

Revised live verification is still pending; no predicted number of Owned titles
or complete-history claim is justified by these controlled repairs.

## Refund-view isolation follow-up (October 25)

The second integrated backup retained 796 books and 485 acquisition dates,
including purchases back to 2013. Ownership remained unconfirmed because a
purchase-group conflict was incorrectly treated as failure to enumerate refunds.
The 2021 refund report identifies all 15 rows exactly. The user's screenshot and
explanation establish that Refund history displays a complete order: only two
books are marked Returned on 07-29-21; thirteen siblings say Return status: Not
eligible. A list entry in this view alone does not establish a refund.

Refund traversal now validates item statuses independently of original purchase
amount/date grouping. Explicit Not eligible siblings and available Return this
title actions are not completed returns. Actual Returned/Refunded wording can
supply a date from the status itself or a dedicated refund-date column. A short
year is resolved only if the selected purchase year and current calendar leave
one possible century, with a valid calendar day. Impossible or ambiguous dates
remain uncertain for that identity. The Purchased column is never a refund date.
Conflicting status/date evidence remains uncertain. Missing/conflicting product
identities still prevent completion of the refund scope.

Explicit completed-return rows in Your orders are not unresolved purchase rows
merely because their original purchase fields are absent. Dated item-level return
facts from orders and refunds are deduplicated; supported repurchases retain their
normal chronological comparison. Unknown return chronology continues to hold
only the affected IDs. Manual corrections, existing dates and source identities
remain authoritative. No ownership is assigned merely by membership in an order.

The 2016 screenshot/text confirms the same explicit empty-refund sentence, and
all years remain offered. Ready headers alone could precede that empty panel;
traversal now waits for entries or a recognized empty message, within the normal
timeout. Entry errors and a later traversal failure are retained separately in
a bounded summary rather than hiding the final stopping reason behind the first
unreadable order. Quick remains limited to current/previous years.

A synthetic five-column, 15-item order reproduces two inline-dated returns and
thirteen Not eligible siblings, including duplicate returned-only rows in Your
orders and empty earlier refund years. Parser-to-writer and backup tests establish
13 Owned / 2 Returned with dates preserved and zero repeated record updates.
These are regression counts, not a prediction of the live account's final totals.
Revised normal Firefox Full rescan and backup comparison remain pending.

## Third live result: status text and navigation waits

The next backup retains 796 records and 485 acquisition dates, with purchase
traversal complete and two dated refund facts saved. No ownership was confirmed
because refund traversal rejected a document at year 2015 with
history-access-not-verified. Thirteen other members of the displayed refund
order still appeared as uncertain, despite the user's Not eligible screenshot.
The user then reproduced the failure in Audible itself: only Refund history
2015 redirects to its same-origin /500 error page. Years 2016 onward and 2014
and 2013 work. This is provider failure, not an empty list or failed login.

Refund statuses now use their visible cell text rather than accessibility labels
such as Options, and recognize Not eligible wording split across inline elements
or followed by a separate Why link. This still supplies no positive ownership by
itself: purchase evidence remains required. Synthetic cases reproduce thirteen
fragmented/labeled non-refunded siblings alongside two dated returns.

A loading document at another route is not parsed as history. The bounded
navigation wait also tolerates temporary unverified documents while waiting for
the original same-origin, expected history route/view/year. A permanently
unverified destination still fails and cannot establish refund completeness.
A completed same-origin /500 page is classified as a provider error, never
parsed. That year remains unchecked; a fresh verified history frame continues
remaining offered years. Other access, identity and traversal errors still stop
the affected view. A bounded current-run list records only refund years completed
in the native Purchased-date layout, with dates matching the selected year.
Refund-date-only layouts cannot establish original purchase-year scope.

With a complete all-year orders scan, Full can confirm a purchase only if every
known purchase year for its exact ASIN was checked for refunds. Any link to the
failed year holds new confirmation; unclear item-level refund statuses also
hold that item. Explicit dated returns remain usable after complete orders
traversal even when an unrelated refund year failed. Previously saved evidence
and manual decisions remain intact. Missing optional year evidence retains the
older conservative behavior; it is never reconstructed from a backup's year list.

The checked-year list is replaced each run, not a historical cursor or merged
checkpoint. Quick cannot use partial-year permission and still checks only its
current/previous-year scope. No failed full run acquires a complete-history
baseline. No new permissions or credential handling are introduced. Normal live
verification remains pending; an Audible 2015 failure will still be reported.

Validation for this repair: 1,728 unit tests and 485 contents tests pass.
Packaged Chrome and Firefox each pass 137 ownership, 87 Audible library,
105 importer and 68 main-UI checks. Both packages validate 221 runtime files;
repository layout and diff whitespace checks pass. A read-only controlled replay
of the frozen backup preserves all 796 identities and 485 acquisition dates,
including prior purchase/refund evidence. Its assumed completed-year inputs are
not live proof and are not written back to the backup or installed library.

## Fourth live result: missing later purchase pages

The next frozen backup confirms 484 Owned and 312 unconfirmed, with all 796
identities and 485 acquisition dates preserved. One unconfirmed book has purchase
evidence linked to the failed 2015 refund year; the other 311 have no matched
purchase facts. That absence does not establish subscription or non-purchase.
The user identified a known 2023 purchase and three native purchase-history pages,
while the saved traversal recorded only one page per year.

The read-only report and screenshot expose numbered anchors inside containers
whose classes identify pagination, and a plain current-number span. The old
selector missed those containers and required aria-current for numbered links.
The absence of a recognized Next control was consequently mistaken for the end.
Traversal now recognizes this native structure, follows only supplied same-site
history links, and checks that each selected numbered page actually arrives.
Unlabelled arrows sharing numbered destinations are not separate unknown actions.
Conflicting visible current numbers, foreign targets, repeated pages and wrong
page responses keep the check incomplete. Hidden page markers are ignored.

A separate synthetic reproduction confirmed that individually dated, recognized
purchase rows without Order details links or transaction keys could be marked
read but omitted from evidence. Those direct rows now qualify on Your orders;
shared-order binding, conflicting groups, temporary access, gift and return
safeguards remain. No ownership is inferred from title similarity or library
presence. How many live books either fix recovers remains unverified.

The optional checker now reports bounded control shapes, excluding page text,
URLs, arbitrary class/field names, identifiers and handler contents. It performs
no navigation or writes. Full/import traversal skips that shape collection.
Quick retains only current/previous-year traversal; Full checks every offered
year and its native pages. The isolated 2015 refund failure remains visible.

Validation: 1,728 unit and 485 contents tests pass. Packaged Chrome and Firefox
each pass 152 ownership, 87 Audible library, 105 importer and 68 main-UI checks.
Both rebuilt ZIPs validate 221 runtime files; repository layout and diff checks
pass. All browser reconciliation fixtures use disposable synthetic libraries.
