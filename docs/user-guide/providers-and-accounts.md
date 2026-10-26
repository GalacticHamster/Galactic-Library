# Providers and saved accounts

Galactic Library has four main sections: **Library, Providers, Books & Contents and
Settings**. Library combines every remembered account. Selecting an account in
Providers chooses where future updates go; it does not hide the other accounts
or change their ownership.

## Add your first library

Choose **Add a library** from an empty Library or the toolbar popup. In Providers,
expand a provider and open its website. For a first store scan, sign in, enter a recognizable **Account
nickname** on the Galactic Library panel, and confirm that it describes the
signed-in account. Choose **Sync Epic library** on Epic, **Import Nintendo cards** on Nintendo, or **Full rescan** on other providers. Keep the provider tab open until the import finishes. Return to Library
to browse the saved items. The **Add a library: import instructions** disclosure opens on a first empty library and stays collapsed by default for returning users.

A nickname is a label you choose, not a website login verified by GL. The
importer records the access the provider reports; loans and subscriptions are
not automatically permanent ownership.

For Humble and Fanatical, you can instead choose **Connect and sync** to use
saved companion purchases without a new store scan. This setup supports unnamed
default accounts and one confirmation for both verified extensions. If both
sides contain purchases, confirm they are the same store account. See
[purchase sync](purchase-sharing.md).

## Use remembered accounts

On a provider website, a single connected account eligible for reuse appears as
**Selected account for updates** with **Change account**. Use that action to choose a
saved account or **Add account**. Changing the input does not rename an account;
the panel links to GL Providers for renaming. **Cancel account change** restores
the prior selection without starting an import. With multiple saved accounts,
confirm the signed-in account as requested; switching needs explicit consent.
A new alternate account needs its first complete supported-list import (Sync Epic library on Epic; Import Nintendo cards on Nintendo; Full rescan elsewhere). Completing initial setup refreshes
the account display automatically without overwriting edits made during a save.

Provider cards show accounts, imported counts, update dates, complete-scan
coverage and recent update health. **Select for updates** restores that account's
saved import history offline, after confirmation. It does not start a scan or
require a full rescan merely because another account was selected.

On returning to a provider website, the importer remembers a single connected
saved account. Ordinary updates do not require reentering its nickname or
reconfirming the same account. GL does not verify the website login: if you sign
in to another store account, choose a different nickname and confirm switching.
Multiple saved accounts still require explicit selection and confirmation. An
update clicked while saved accounts are loading waits for that lookup.

**Name this account** names a migrated unnamed import without importing it again.
**Rename account** changes the display nickname while keeping the account's
identity, records, contents and reviews.

To add another account, sign in to it on the provider site, enter a new nickname,
explicitly confirm switching and run its first complete import. Earlier accounts
remain saved. When naming an existing unnamed import, use Providers rather than
creating a new nickname through a scan.

## Update an account

**Quick update** and **Full rescan** open instructions for the selected account
and a link to its signed-in provider page. Confirm the actual account and start
the update on that page. Opening the page, selecting an account and navigating
GL do not automatically start an import.

After an import finishes, use the same overlay to start another supported Quick
update or Full rescan. The importer returns to its required listing or resets
its traversal as needed, keeping the selected account. Fandango returns from
Movies/TV View All to My Library automatically. A reusable saved account does
not require checking a hidden confirmation box again; changing accounts still
requires confirmation. Epic uses **Sync Epic library** and Nintendo uses **Import Nintendo cards**; neither offers Quick update.

Quick update uses the selected account's saved import history and reads the
provider-specific update scope. Xbox and PlayStation check the same supported web listing as Full rescan; their quick operation is not a shorter traversal. It is unavailable until a full import exists,
while an update is running, or until an unnamed account is named. Epic uses **Sync Epic library**. Nintendo uses **Import Nintendo cards** for the loaded card list.
Amazon Games needs a full scan after more than 70 days
without an update. Fandango quick updates run from Recently Purchased View All
grids; full scans check My Library. The provider panel remains authoritative
about coverage and any additional restrictions.

Full rescan reconciles that account's complete supported listing. Missing records can
move to earlier imports. It preserves acquired contents and reviews and does
not replace another remembered account.

Fandango Full rescan finishes checking the movie and TV grids and requires the
number of distinct eligible titles to agree with each reported total. Hidden
page widgets are excluded; off-screen library cards remain included. Quick
update still stops at the saved newest-first baseline.

For a Fandango movie-count failure, open **My Library → GL panel → Scan
diagnostics → Check movie listing (no import)**. This opens Movies View All and
checks the rendered listing without saving library records. When finished,
choose **Export scan report**. The report contains counts and page structure,
not titles, product IDs or account details. This check does not certify that a
Full rescan is safe; do not repeat a failed Full rescan just to collect a report.

## Audible updates

**Full rescan** reads the complete Audible library and all available calendar
**Your orders**, **Refund history**, and **Gift received** years. It refreshes source metadata and reconciles
supported ownership and acquisition dates. Missing library records move to
**Earlier imports**; transaction history never creates extra audiobook records.

**Quick update** uses the existing Date added discovery and stops at a page of
already saved titles. It checks only the current and previous calendar years of
purchase, refund and received-gift history, including matches to previously unconfirmed saved
books. It intentionally does not reconcile older transactions. Use Full rescan
for older purchases, historical corrections or recovery. Both buttons perform
ownership enrichment automatically; no evidence file or separate action is needed.

Quick update requires an initial complete library import. Without one it asks
for Full rescan and stops, rather than silently performing a full import. An
older library without a completed all-year purchase-history check can still use
Quick update, with an explicit notice that historical reconciliation is missing.
There are no scheduled full-history rescans.

Redeemed gifts are Owned even when they do not appear in Your orders. GL reads
your own Gift received list, matches exact Audible identifiers, and uses the
Redeemed date as the acquisition date when no reliable date is already saved.
Gifts you sent and unredeemed gifts do not establish ownership. Sender names,
email addresses and gift codes are not saved. No separate gift-import action is
needed.

Exact Audible identifiers and the selected account determine matches. Supported
purchase dates retain their calendar day; saved reliable dates, purchase evidence
and your corrections are preserved. Shared order totals are never assigned to
individual books. A standalone **Remove** button on a library title identifies
subscription access. **Remove** together with **Unavailable** identifies expired
temporary access, without inventing an expiration date or assuming a refund.
This can happen when a title leaves the included catalog or membership access
ends. Confirmed purchases, received gifts and your corrections take precedence.
Favorites, wishlist and collection controls do not establish access rights.
Absence of Remove does not prove ownership; missing evidence stays unconfirmed.

Incomplete library discovery prevents replacement. If history alone is
inaccessible or incomplete, discovered library titles and prior evidence are
kept, with a partial-completion message. If Audible returns an error for one
historical year, Full rescan leaves that year unchecked and continues the others.
After a complete purchase-history check, purchases can be confirmed only when
all their known purchase years have been checked for refunds. Books linked to an
unchecked year remain unconfirmed unless earlier evidence or your correction
already establishes access. Readable purchase dates and explicit dated returns
can still be retained. A partial check is never reported as complete. Keep the
provider tab open until completion. Export a GL backup in Settings before
important updates; never replace a complete library with another browser's
partial backup merely to refresh one provider.

## PlayStation PS4/PS5 Purchased Library

Open **Providers → PlayStation — PS4/PS5 Purchased Library** and open its website.
Sign in and let the Purchased library finish loading. In GL's floating panel,
choose and confirm the account nickname, then select **Full rescan**. The panel
reports pages and titles read, checks the account again, and saves atomically.
After the first full import, **Quick update** checks the same supported listing
for additions and access changes. Both retain earlier saved records; absence
does not establish a refund or revoked access. User access corrections remain
authoritative.

The importer uses the website's current public query definitions and client
settings with browser-managed cookies. It never copies login tokens, stores
credentials or exports raw account IDs. An opaque hash binds the saved profile
to the signed-in account; switching accounts requires a separate confirmed GL
profile. Platform, product and title IDs remain distinct. Permanent access is
inferred only for active non-subscription Purchased entries; subscription,
trial, inactive and unrecognized licenses retain their separate access status.
Activity dates are not purchase dates. Supplied edition labels are retained.

Only the active PS4/PS5 web Purchased listing is supported, not PS3/PSP/Vita,
hidden/inactive entries, complete lifetime orders or a complete DLC inventory.
Filtered/changed pages, unreadable rows and incomplete pagination reject the
import without replacing saved records. An empty listing without a reported
zero total cannot currently certify an import. The initial production import
has been live-validated; disposable Chrome/Firefox reimport tests pass. Remove
the separate research helper to avoid overlapping diagnostic panels. Firefox
may require granting GL access to the PlayStation Library site.

## Epic session recovery

Epic offers **Sync Epic library**, a complete library check; it has no separate
Quick update. Choose the correct saved account and sync normally.

Epic can display a signed-in account while rejecting library access. If GL
suggests **My Achievements**, open it through Epic's profile menu, then select
**Sync Epic library** again. This has restored access in live testing, but its
cause is unresolved. GL does not visit account pages or retry authorization
failures automatically. Other sign-in errors use the normal Epic sign-in
instructions; a CAPTCHA is not assumed.

GL automatically keeps a small local report when the library response contains
the known authorization failure. At most **10 failure reports**, each with its
first later confirmed successful sync, are retained for **24 hours from the
failure**. Expired reports are excluded and deleted on the next diagnostic read
or update. They survive extension reloads and are separate from your library,
backups and companion synchronization. No special scan or observer is needed.

To export after a natural failure or later success, open the Epic panel's
**Scan diagnostics** and select **Export scan report**. This reuses the existing
export and includes the current tab's last scan when available. Reports contain
error categories/statuses, attempt times, coarse page categories, page-readiness
flags and save outcomes. They exclude titles, product/account identifiers,
cookies, credentials and response contents. Page categories describe where
attempts happened; GL does not monitor browsing between attempts or infer that
navigation caused recovery. A later success does not verify account continuity.

## Xbox Web Library

Open **Providers → Xbox — Web Library**, open its website and sign in. The link
opens the [Owned catalog](https://play.xbox.com/library?tab=fullLibrary&view=grid&catalog=owned)
directly. After installing an updated GL extension, reload the Xbox page once.
Then switching from Play History to Owned, including Back/Forward, shows the
panel without another refresh. The panel hides on other library tabs and
retains your account selection when you return to Owned.

For a tab opened from GL, GL remembers the destination for up to ten minutes.
If sign-in returns that tab to Play History, GL restores Owned once Xbox's
signed-in account data is ready. It leaves ordinary Xbox browsing alone and
does not navigate through sign-in or security challenges. If recovery does not
occur, select Owned using Xbox's interface; the panel appears there.
Navigation alone never starts an import.

Let the games finish loading. In GL's floating panel, choose/confirm the account nickname and select
**Full rescan**. After the first import, **Quick update** checks the same complete
web-visible Owned catalog for additions and changes. Neither action removes
previously saved products that disappear from this limited view.

GL reads the account-scoped data already loaded by the website. It reconstructs
the same Owned selection, checks the reported total and preview product IDs,
then checks the account and source again before the atomic save. It makes no
additional Xbox requests, reads no authentication token, and stores no raw Xbox
account ID. An opaque account hash prevents a different login from silently
reusing the saved profile. Switching store accounts requires explicit selection
and confirmation of a different saved Xbox account in GL.

Only first-party products with the signed-in account's personal Owned flag are
included. Subscription, trial, disc, aggregate/family access and played/installed
history alone cannot establish ownership. Current product IDs, supplied titles,
edition/platform metadata and access flags are retained; purchase dates, prices
and transactions are not invented. Coarse product-kind flags do not manufacture
separately named add-ons or bundle children. Existing manual access corrections
remain authoritative and survive reimport and backup/restore.

This is the current **web-visible Owned catalog**, not the complete lifetime
Xbox purchase history, all console/mobile games, a complete DLC inventory, or
other subscription catalogs. The initial production import has been
live-validated: 37 checked titles, 37 products and 37 new records. Full/quick
reimports pass disposable Chrome/Firefox tests; live quick-update acceptance
has not yet been reported. Both update buttons can be used again from the Owned
panel after a completed import. If the site
is still loading, its data is invalidated, account changes, or counts/preview IDs
disagree, GL rejects the import and retains saved items. A zero list requires an
explicit zero catalog total; GL does not interpret an absent catalog as empty.

The read-only research helper is no longer needed and can be disabled. Firefox
may require granting GL access to play.xbox.com and reloading the Library page.

## Nintendo Switch Virtual Game Cards

Open **Providers → Nintendo — Switch Virtual Game Cards**, then open Nintendo's
Virtual Game Cards page and sign in normally. Reload that page after installing
or reloading GL so it can observe the website's card-list request. Let the list
finish loading; if Nintendo loads several pages, browse all pages before import.
Enter/confirm a nickname on first use and choose **Import loaded cards**.

GL imports only a complete, non-hidden card list observed on that page. It makes
no Nintendo API requests, copies no authentication headers, and never stores a
token or raw Nintendo account/device ID. An opaque hash binds the saved GL profile
to the website account; a different account cannot silently reuse that profile.
Rename a saved account in Providers rather than creating another profile for it.

Each card keeps its software ID, source platform and available lending/released
flags. A card whose owner matches the signed-in account and whose released base
application is confirmed is Owned; a borrowed card does not become a purchase.
A false released-base flag does not establish a DLC-only product or exclude an
unreleased game. Such cards remain visible with unconfirmed access. Add-on flags
on a combined card do not create separately named DLC products. Purchase dates
and prices are not inferred from activation order.

Repeat imports keep stable records. Cards missing from a later view remain saved;
GL never infers a return or revocation from omission. An incomplete list, failed
request or detected account change prevents saving. Profiles, bindings and user
access corrections survive backup/restore.

This scope is not lifetime Nintendo purchase history: hidden cards, older systems,
and purchases not represented as Virtual Game Cards are outside it. Switch 2
platform labels are preserved when provided, but the live validation sample was
115 Switch cards. Lending/borrowing variations have synthetic tests, not live
lending validation. Chrome 111+ or the supported Firefox release is required.
In Firefox, allow GL access to the Nintendo site if the browser withholds site
permissions, then reload the page. The temporary research helper may be removed;
the production importer does not depend on it.

## Provider diagnostics

Provider troubleshooting tools are hidden by default. To show them, open
**Settings → Troubleshooting → Enable provider diagnostics**, then reopen or
reload the provider page. Changing the setting does not interrupt an active
import. It controls the tools you see, not existing local diagnostic collection
or retention (including Epic's passive failure history).

Only supported tools appear; providers without them get no empty section.
Existing support links/flags remain compatible, including Steam's
`gl-steam-diagnostics=1`, Amazon Games' `gl-date-check=1`, and Audible's
`gl-audible-ownership-check=1`. With diagnostics enabled, Audible's panel links to
its separate purchase-history checker. Aggregate reports and private Audible
purchase-evidence downloads have different privacy rules: read the warning
before sharing an export. The setting is local to this browser, excluded from
library backups, and survives browser/extension restarts. Clearing all local GL
data resets it.

## Kobo metadata and ownership

Kobo quick updates check the newest-first pages up to the first known page. The
summary distinguishes books **checked** from **new** or **updated** books; a
24-card page is not evidence of 24 changed books. Sparse observations retain
saved authors, series, genre labels and explicit access evidence. Dedicated
book-title attributes take priority over Read Now action labels.

My Books presence and a bare Kobo Plus availability badge do not prove purchase.
Explicit purchase, subscription, borrowing, rental and free-claim evidence is
kept separately. A claimed free book is not labeled as a paid purchase. When the
page provides no acquisition evidence, access remains unconfirmed.

To investigate missing ownership evidence without importing again, open Kobo's
**My Books** page, expand **Scan diagnostics** in the GL overlay, select
**Check ownership evidence (no import)**, then **Export check report**.
This checks the visible library page and, only if Kobo exposes a same-site
Purchase History or Order History link there, its first page. It does not
traverse history, open order details, change access, or save library records.
The report contains aggregate counts and structural hints, with no titles,
identifiers, dates, account details or page contents. Matching counts compare
exact identifiers with GL's active saved Kobo account; they do not verify the
website's signed-in account. A date hint is not a confirmed acquisition date.

Automatic purchase-history ownership enrichment is not implemented. Kobo's
live history layout, identifier relationships and completeness need validation
before it can safely confirm purchases. Neither an unreadable history page nor
absence from a partial page changes existing evidence. Quick update continues
to use newest-first library discovery; it does not traverse purchase history.

If you know your unconfirmed books are permanently yours, open **Providers → Kobo →
your saved account → Advanced account recovery and removal → Ownership
preference**. Enable **Treat unconfirmed books in this account as
owned** and save. This opt-in preference affects display and matching for
that account only; it does not rewrite source ownership or invent a receipt.
Explicit subscription, loan, rental, free, not-purchased, conflicting and
individually reviewed records are excluded. Turn it off to restore the original
access display. The preference survives imports, renaming and backup/restore.

## Recovery and removal

These operations are under **Advanced account recovery and removal**:

- **Reset import history** forgets the account's update position and coverage.
  Imported records, contents, source history and reviews remain. The next import
  requires a Full rescan; reset does not start it.
- **Remove saved account** permanently deletes the account's imported records
  and affected source/review state. A current dependency preview lists the
  consequences and affected jobs. Explicit confirmation is required; changes
  since the preview require a new preview. Other accounts remain saved.

Export a backup from Settings before removing evidence you may want to recover.
Removal differs from a full rescan, reset, temporarily hiding records or clearing
the whole library. If the selected account is removed, explicitly select another
account before updating.

## Other sections

### Kobo quick checks

Kobo shows a remembered single-account nickname promptly while checking the
saved account in the background. This display hint does not authorize an import;
updates wait for verification. Multiple accounts and changed selections still
require explicit confirmation.

An unchanged Quick update checks the observed cards and completes its scan
without rewriting the library or changing its last saved-import timestamp.
New or changed evidence follows the normal validated save path. The result
shows checked, new and updated counts. **Ownership preference applied** means
the preference covers raw unconfirmed Kobo evidence; explicit conflicts still
show an ownership-review warning. Source ownership is preserved.

Settings → Performance diagnostics → **Export timing summary** includes the
last 50 provider diagnostic records under `providers`, independently of Kindle
tracing. Account verification reuses validated committed library data for every
provider; scan authorization still checks current account state. Records identify
each provider's profile lookup and Kobo scan startup, fetching, comparison
and finishing. Worker records and page totals share correlation IDs; nested
stage durations must not be added twice. They are bounded in-memory diagnostics
and disappear when the worker restarts.

For an intermittent nickname delay, account diagnostics also record the
remembered-hint lookup, message round trips, and when the nickname becomes
visible versus verified. Export immediately after reproducing the delay or
completing a Quick update, before the worker idles and loses its timing buffers.

Library retains All items, Comic Coverage, Reading, and Ownership and access
as secondary views. Existing filters, item details, enrichment and reviews
remain available there.

Books & Contents groups Included contents, Book information, and Compare collections.
Included contents has Kindle discovery instructions and scan progress. Compare
collections retains explicit target ranges and manga-volume comparisons. Acquisition, Pause/Resume and Refresh All
still run from the signed-in Kindle panel. Navigating between sections preserves
progress and never starts a refresh. Other providers' contents discovery is not
implemented by this UI phase.

Settings contains ownership preferences (global and per provider), book-service
setup, companion links, backup export/restore and performance diagnostics.
Provider accounts and import controls are in Providers. Older saved book,
reading and ownership views remain valid Library destinations.

Contents discovery, integrated review and collection comparison are described in [Contents workspace](contents-workspace.md).

## Connections in provider cards

Humble Bundle and Fanatical each have one provider card containing purchase-sync
status, Connect and sync, Sync now and Disconnect. Saved accounts and store imports
are in the same card. Advanced manual sharing remains collapsed and separate
from automatic sync. Multi-account setup still requires exact choices and consent.
Account-list refreshes preserve the existing connection form and staged choices.

Providers also contains Advanced companion communication checks. These only test
communication; they do not import or synchronize. Settings retains developer pairing
and links back to the appropriate provider card.

An incomplete quick check can retain your library unchanged while recording its
current problem. Advanced update details shows that latest attempt separately
from the last successful quick check/full baseline. It does not imply ownership
was reverified. Steam's candidate App IDs include retries and unsupported types,
not just new purchases; an owned-ID list can load successfully while title lookup
remains incomplete. Retry later if the title service fails. Optional diagnostic
steps are in [Steam outcome diagnostics](../development/steam-outcome-diagnostics.md).

On Fanatical, the import panel appears only on Orders. Navigating to a bundle
removes it and shows Fanatical Library's bundle summary when that companion is
installed. Returning to Orders restores the import panel. An import already
submitted for saving can finish; a detached panel cannot start another save.
