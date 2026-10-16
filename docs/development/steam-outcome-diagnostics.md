# Steam lookup outcomes

Quick update reads `/dynamicstore/userdata/` with the browser-managed session,
deduplicates `rgOwnedApps`, then selects IDs absent from saved records for the
exact provider/profile. Candidates are **not new purchases**. Unsupported and
unresolved IDs recur because neither creates a game/DLC record. Saved IDs stop
recurring. No retry blacklist/backoff is introduced.

Bounded title-service batches resolve requested IDs. Usable type-0 games/type-4
DLC can become records. Other explicitly reported types are unsupported by this
importer, not proof of permanent unavailability. Missing/unreadable metadata
remains unresolved. Missing DLC parent links do not reject otherwise valid DLC
or make saved IDs recur as candidates.

## Demonstrated corrections

The old parser threw on one malformed row, discarded valid rows in that response
and marked the whole batch unresolved. It also coerced null/empty types to game
type 0. Requested rows are now independent: valid games/DLC survive malformed
neighbors; conflicting duplicates remain unresolved; identical duplicates
deduplicate; unknown/null types cannot imply ownership. Full scans still refuse
replacement if requested IDs are unresolved. Extra unrequested/malformed rows
cannot invent requested ownership.

Missing metadata now marks acquisition Incomplete even after HTTP success.
Unsupported types alone stay separate from temporary failure. The UI distinguishes
reading owned IDs from resolving titles, never says readable records were saved
when none were, and can show the first safe concrete cause such as HTTP 400.

## Existing opt-in export

In GL's provider content-script/isolated console, run
`GalacticSync.setProfiling(true)`. Perform a quick check, then export from GL
Settings → Performance diagnostics before worker restart. Disable with
`GalacticSync.setProfiling(false)` or reload the page. No new switch, persistent
setting, additional request or individual-ID export is added.

The existing bounded provider trace includes `steamDiagnostics`:

- Owned-list success, decoded owned-ID count, candidate count and attempted IDs.
- Mutually exclusive outcomes: games, DLC, unsupported, missing metadata, HTTP
  failure, HTTP 401/403 access denial, malformed response, classification failure,
  network failure and other unresolved failure.
- Title/failed-request counts, actual HTTP frequencies, reported unsupported type
  frequencies and malformed extra-row count.
- First concrete failure stage/category and actual HTTP status when available.
- Save state: pending, committed, rejected or unconfirmed; acknowledged saved-ID
  and rejected-ID counts when known. Transport/acknowledgement failure does not
  invent confirmed saved/rejected counts.

Outcomes sum to attempted IDs, which can be less than candidates on an aborted
full scan. Games + DLC equals captured records. Other outcomes except unsupported
sum to unique unresolved IDs. Requests/statuses and malformed extra rows are
separate axes, not additional unresolved IDs. Saved/rejected counts are a later
persistence axis. A zero-record check receipt certifies status, not observations.

HTTP 401/403 indicates access denial, **not** proof of an expired session; service
authorization may be responsible. Missing statuses are not synthesized. Export
contains no raw errors/responses/URLs, account identifiers, cookies, credentials,
individual App IDs or titles. Counts are bounded; type groups cap at 32. Existing
50-trace FIFO eviction and worker-reset behavior remain. Detailed aggregation is
off by default; the bounded worker journal still shows storage/validation cost.

## What the historical 159 establishes

Export (7) and the panel establish 159 candidates, all unresolved, zero saved
additions, Incomplete and a 22.39-second validation/save. Old code reported that
status after a batch catch: HTTP/network failure, unreadable envelope, or the
malformed-row exception could each cause it. Their distribution was not retained.

The 159 cannot retrospectively be labeled games, DLC, unsupported, permanently
unavailable or one shared HTTP error. The mixed-row defect is demonstrated
offline but **not established as their cause**. A new opt-in real export is needed.
Synthetic HTTP 400/429 fixtures validate the mechanisms, not the user's actual
Steam responses. Development makes no account requests.
