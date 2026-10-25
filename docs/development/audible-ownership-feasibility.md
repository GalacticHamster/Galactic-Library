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
