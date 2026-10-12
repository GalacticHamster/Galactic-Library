# Providers and saved accounts

Galactic Library has four main sections: **Library, Providers, Contents and
Settings**. Library combines every remembered account. Selecting an account in
Providers chooses where future updates go; it does not hide the other accounts
or change their ownership.

## Add your first library

Choose **Add a library** from an empty Library or the toolbar popup. In Providers,
expand a provider and open its website. Sign in, enter a recognizable **Account
nickname** on the Galactic Library panel, and confirm that it describes the
signed-in account. Start **Full rescan** for the first import, or **Sync library**
on Epic. Keep the provider tab open until the import finishes. Return to Library
to browse the saved items. The **Add a library: import instructions** disclosure opens on a first empty library and stays collapsed by default for returning users.

A nickname is a label you choose, not a website login verified by GL. The
importer records the access the provider reports; loans and subscriptions are
not automatically permanent ownership.

## Use remembered accounts

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

**Quick Update** and **Full Rescan** open instructions for the selected account
and a link to its signed-in provider page. Confirm the actual account and start
the update on that page. Opening the page, selecting an account and navigating
GL do not automatically start an import.

Quick Update uses the selected account's saved import history and reads the
provider's incremental scope. It is unavailable until a full import exists,
while an update is running, or until an unnamed account is named. Epic supports
complete imports only. Amazon Games needs a full scan after more than 70 days
without an update. Fandango quick updates run from Recently Purchased View All
grids; full scans check My Library. The provider panel remains authoritative
about coverage and any additional restrictions.

Full Rescan reconciles that account's complete inventory. Missing records can
move to earlier imports. It preserves acquired contents and reviews and does
not replace another remembered account.

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

If you know your unconfirmed books were purchased, open **Providers → Kobo →
your saved account → Advanced account recovery and removal → Ownership
preference**. Enable **Treat unconfirmed books in this Kobo account as
purchased** and save. This opt-in preference affects display and matching for
that account only; it does not rewrite source ownership or invent a receipt.
Explicit subscription, loan, rental, free, not-purchased, conflicting and
individually reviewed records are excluded. Turn it off to restore the original
access display. The preference survives imports, renaming and backup/restore.

## Recovery and removal

These operations are under **Advanced account recovery and removal**:

- **Reset import history** forgets the account's update position and coverage.
  Imported records, contents, source history and reviews remain. The next import
  requires a Full Rescan; reset does not start it.
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

Library retains All items, Book information, Reading, and Ownership and access
as secondary views. Existing filters, item details, enrichment and reviews
remain available there.

Contents contains the Kindle discovery instructions, current scan progress and
reviewed collection overlap/gaps. Acquisition, Pause/Resume and Refresh All
still run from the signed-in Kindle panel. Navigating between sections preserves
progress and never starts a refresh. Other providers' contents discovery is not
implemented by this UI phase.

Settings contains ownership preferences (global and per provider), book-service
setup, companion links, backup export/restore and performance diagnostics.
Provider accounts and import controls are in Providers. Older saved book,
reading and ownership views remain valid Library destinations.

Contents discovery, integrated review and collection comparison are described in [Contents workspace](contents-workspace.md).
