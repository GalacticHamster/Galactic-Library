# Steam metadata outcomes and private samples

Quick update reads Steam's owned-ID list and resolves metadata only for IDs not
already saved in the selected provider/account. Candidates include retries and
unsupported types; they are not necessarily new purchases or missing games.

## Acquisition and demonstrated corrections

1. Read same-origin `/dynamicstore/userdata/` with browser-managed credentials
   and no cache. The supported `rgOwnedApps` field is an array of App IDs, not
   named records. No retained raw historical response proves that other fields
   contain a reliable title/type map. Malformed owned IDs stop the attempt.
2. Canonicalize numeric/decimal-string IDs into positive uint32 decimal strings
   for owned IDs, candidates, saved-ID comparison, returned IDs and DLC parents.
   Reject fractional, zero, negative, boolean, object and out-of-range values.
   Valve defines [AppId_t as uint32 and zero as invalid](https://partner.steamgames.com/doc/api/steam_api#AppId_t).
   Existing saved records are not rewritten.
3. Query `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/` using
   `input_json`, explicit `ids:[{appid:Number(id)}]`, English/US/realm 1 context,
   and `data_request.include_basic_info:true`. Keep 100 IDs per batch and the
   existing 500 ms inter-batch delay. No new requests, permissions or login.
4. Match `response.store_items[].appid` to requested canonical IDs. For diagnostics
   only, a row without a valid `appid` may be correlated by `id` when `item_type`
   explicitly equals application type 0, `id` is a requested canonical App ID,
   and `success` is an integer greater than 1. Visibility alone is insufficient.
   This never supplies an importable `appid`, name or application type. Count
   extra and malformed rows separately. Identical interpreted duplicates
   deduplicate; conflicting title/type/parent evidence remains unresolved.
   A valid matched row plus a placeholder for the same ID, or placeholders with
   differing result/visibility evidence, become `conflictingDuplicate` in either
   row order. A valid but different `appid` is never reassigned using `id`.
   Package/bundle IDs and missing namespaces cannot establish app correlation.
5. Require explicit type 0 (game) or 4 (DLC) and a usable string name. DLC parent
   IDs are optional relationships, not a saving prerequisite. Ownership evidence
   comes from membership in the owned-ID selection, not a public metadata lookup.

Earlier fixes retain valid neighbors in malformed batches and prevent null types
from becoming games. The current ID correction is demonstrated offline: owned
ID `"0001"` and returned numeric ID `1` previously produced zero captured/one
unresolved; now they resolve once. An already-saved equivalent also stops being
retried. That does **not** establish the cause of the real 143.

A second offline edge case showed that duplicate comparison serialized malformed
name objects. A deeply nested non-string name could mark a captured neighbor
unresolved and falsely increment request failures. Compare only interpreted
fields now, and isolate unexpected parser faults per ID. Valid neighbors and
the outcome partition survive; no raw parser error enters diagnostics. This is
not evidence for the historical 143, whose trace recorded no such failures.

This is an explicit-ID lookup, not the paginated public app-list API. GL handles
all requested batches; no title-service continuation contract is established.
Fixed context, response limits, removal/delisting and regional availability are
possible investigation topics, not proven explanations. New request counts will
show omitted IDs, nameless rows, malformed/extra rows and duplicates independently.

## Exact diagnostic meanings

Version 3 acquisition outcomes partition attempted candidate IDs. Priority is
conflicting duplicates, correlated unavailability, invalid type, unsupported type, title checks, then valid
game/DLC. Thus an unsupported type without a name remains unsupported; a row
with both invalid type and invalid name is `invalidType`. Secondary name-presence
information can appear in an explicitly exported sample.

| Outcome | Meaning |
| --- | --- |
| `unavailable` | Explicit app failure placeholder safely correlates to the requested ID; no conflicting valid entry or ambiguous duplicate. Metadata is unavailable, not proof of revoked ownership. |
| `absent` | No identifiable response row: neither a matching canonical `appid` nor a safely correlated app failure. Unidentifiable/malformed rows are not assigned speculatively. Version 2 meant only no matching `appid`, and could include placeholders. |
| `missingTitle` | Supported type, but name is absent, null, empty or whitespace-only. |
| `invalidTitle` | Supported type, but name is a non-null non-string value. |
| `invalidType` | No parseable integer type, including null/empty/fractional/object values. Never implicitly a game. |
| `conflictingDuplicate` | Rows for one ID disagree on interpreted type, normalized title or parent. |
| `unsupported` | Explicit integer type other than 0/4; not a permanent-unavailability claim. |
| `games`, `dlc` | Usable supported metadata captured from owned-ID selection, before saving. |
| `http` | Non-success title-request HTTP status other than 401/403. |
| `authentication` | HTTP 401/403 access denial; does not prove an expired session. |
| `network` | Request failed before receiving a response. |
| `malformed` | Unreadable JSON or missing/non-array `response.store_items`; distinct from an empty valid array. |
| `classification` | A matching row could not be interpreted/converted, including an isolated parser fault. Not an HTTP failure. |
| `other` | Unexpected acquisition exception; no exposed raw error or invented status. |

The sanitizer accepts legacy `missing` and version-2 reports without changing
their historical meanings; new acquisition never emits `missing`. Owned-list failure is separate: `ownedListRead:false`, zero title
attempts and `firstFailure.stage:'owned-list'`, without classifying unattempted IDs.
Games + DLC = captured records. Other outcomes except unsupported sum to unique
unresolved IDs. All outcomes sum to attempted IDs, which may be fewer than
candidates after an aborted full scan. Unsupported types alone are not failures.

Request-level statistics stay separate: title/failed-request counts, actual HTTP
frequencies and at most 32 `requests` summaries. Each summary has requested,
returned-row, matched-ID/row, placeholder-row, unavailable-ID, conflicting-ID,
absent-ID, malformed-row, unexpected-row and duplicate-row counts when a valid
response exists. `matchedIdCount` counts unique matching `appid` identities,
including rows later rejected for unusable metadata or conflicts. It is not
a count of imported games. `placeholderRowCount` includes identical/conflicting
duplicates; `unavailableCount` counts only unambiguous per-ID unavailability.
`conflictingIdCount` is separate from excess-row `duplicateRowCount`. These
overlapping request measures are not another additive outcome partition.
Returned rows partition into matched rows + correlated placeholder rows +
unexpected rows + malformed rows. Placeholder rows do not inflate malformed
row counts, malformed-response outcomes, or failed requests.

`placeholderResultCodes` retains at most 32 numeric/other count buckets;
`placeholderVisibility` counts true, false and unspecified over correlated
placeholder rows (including duplicates/conflicts). Unknown numeric codes remain
unknown: in particular, result 15 is not translated into a specific error,
login failure, revocation, or permanent unavailability.
No response counts are invented on HTTP or
network failure. `requestSamplesDropped` counts omitted summaries; aggregate
outcomes still cover all attempted batches. Empty HTTP 200 arrays mean absent;
unreadable HTTP 200 bodies mean malformed.

Saving is a later independent axis: `saveState` is pending/committed/rejected/
unconfirmed. `savedCount` and `saveRejectedCount` require acknowledgement. Lost
acknowledgement never invents success or rejection. Do not add these to the
acquisition partition. A status receipt certifies status, not item observations.

## Aggregate export

1. Open the signed-in Steam Store page with its GL panel.
2. Expand **Steam diagnostics** and check **Profile the next Quick Update**.
   The status says it is armed for this tab.
3. Run **Quick update**. The control automatically unchecks at startup; wait
   for **Timing captured** even if the scan is incomplete or fails.
4. Follow **Export timing in GL Settings > Performance diagnostics**, then
   click **Export timing summary** promptly before worker restart. Check
   `steamDiagnostics.outcomeVersion:3`, outcomes and request summaries.

No console command or extension reload is required. Failed starts/cancellation
consume the request; arm again for another scan. Full rescan does not consume
it, other tabs/providers cannot consume it, and page reload discards an unused
request. Controls are disabled while a scan completes. No profiling request is
persisted or delivered asynchronously to the page, so stale messages cannot
rearm it. The existing developer console switch remains separate. See
[provider profiling](provider-performance.md) for lifecycle/delivery limits.

Detailed profiling stays page-local and off by default. Each worker timing
collector retains the latest 50 records FIFO and resets on worker restart.
Each trace has at most 512 events. The independent journal retains the latest
192 events, counts evictions, and resets on restart. Only the tiny session
lifecycle breadcrumb survives; detailed reports are not persisted. No IDs, titles, accounts, URLs, credentials,
raw bodies or arbitrary errors enter ordinary exports. The bounded worker journal
is independent of detailed profiling.

## Optional separate App-ID sample

App IDs may reveal part of a Steam library. Samples are never included in ordinary
timing exports, backups or GL storage. To opt in:

1. Expand **Steam diagnostics** in the Steam GL panel.
2. Check **Sample unresolved App IDs on the next update** after reading its
   privacy explanation. This does not enable timing profiling; use the steps above
   for aggregate timing as well.
3. Run Quick update. If comfortable sharing IDs, click **Export sampled App IDs**
   to download `GL-steam-app-id-sample.json`. No upload/additional request occurs.
4. Uncheck sampling or reload to erase page memory. A new UI attempt clears the
   old sample even if preparation fails; disabling during a request prevents late
   publication. Exporting cannot start a scan or change records.

Keep the lowest 20 numeric IDs per unresolved/unsupported category, sorted
consistently across source ordering. Do not retain supported-game/DLC samples.
Sample format 2 declares outcome version 3. Fields are only App ID, outcome,
returned-entry presence, supplied integer type if valid, and usable-name presence
where observed; unavailable samples also retain numeric `resultCode` and boolean
`visible` when supplied. Missing visibility is omitted, not invented. Request failures do not pretend
to establish whether an entry was returned. No titles, account identifiers,
headers, cookies, tokens or raw responses. Full-scan failures sample attempted
IDs only. Nothing is automatically logged to the ordinary console.

## Historical limits, fallback assessment and retries

Export 8 established 159 candidates: 143 missing usable metadata and 16 other
types, two HTTP 200 title responses, no captured games/DLC or save rejections.
Its old missing category cannot be retrospectively split. Export 9 confirms cold
certificate reuse but has no detailed provider outcomes. A new version-2 export
was required. The explicitly shared export 10 subsequently established 143
unmatched `appid` results with 143 unidentifiable rows, plus 16 unsupported types.
Six shared unresolved IDs checked directly against official public Steam
returned app placeholders (`appid:0`, empty name, result 15); none recovered via
public app-details. Two retain Community pages. The remaining 137 failure shapes
were not retained in the export, so their exact code/visibility remains unproven.
Version 3 now measures this without exporting private IDs.

| Candidate fallback | Evidence and decision |
| --- | --- |
| Current owned-ID response | Supported owned field contains IDs. No retained evidence establishes another reliable title/type map. Do not invent one. |
| Same-origin public store details/page | Six unresolved samples returned no metadata. A named legacy expansion returned its parent game's different ID, and software appeared as type game. Identity/type conflicts make blind fallback unsafe; browser CORS, rates and wider coverage remain unvalidated. No automatic fallback added. |
| `IStoreService/GetAppList` | Valve documents API-key authentication, type filters and pagination. Not a keyless drop-in or account ownership proof. Do not add authentication/partner-host permissions or crawl the whole catalog. |
| Legacy `ISteamApps/GetAppList` | Valve marks it deprecated because of scale. Public names alone do not establish type/ownership. Do not adopt as automatic fallback. |
| `IPlayerService/GetOwnedGames` | Requires API key and Steam ID; optional names/icons depend on visibility. Not the existing browser-session contract. No new account/key workflow. |

Official references: [IStoreService](https://partner.steamgames.com/doc/webapi/IStoreService#GetAppList),
[ISteamApps](https://partner.steamgames.com/doc/webapi/ISteamApps#GetAppList),
[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService#GetOwnedGames).
The export-10 follow-up used only the explicitly shared small sample against
official public Steam sources, without credentials or third-party lookups.
This implementation batch makes no additional live provider requests.

Unresolved/missing metadata remains retryable, never revoked ownership. Saved
IDs stop recurring; unsupported types remain candidates because metadata/support
can change. Future throttling would require account/ID/endpoint-context scope,
bounded expiry, version invalidation, Full rescan bypass and successful-ID removal.
That design is deferred: no blacklist or suppression of future acquisitions.

The panel separates owned-list retrieval, imported game/DLC changes, unavailable catalog metadata, IDs with no identifiable response row,
missing/invalid titles, invalid/conflicting types, unsupported types and request
failures. Unresolved entries keep the result incomplete. Valid neighbors still
save incrementally. Eligible unchanged incomplete checks preserve shared receipts,
cold certificate reuse, success baselines and ownership; no storage change.
