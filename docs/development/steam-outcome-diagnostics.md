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
4. Match `response.store_items[].appid` to requested canonical IDs. Count extra
   and malformed rows separately. Identical interpreted duplicates deduplicate;
   conflicting title/type/parent evidence remains unresolved. Do not guess that
   an alternative field such as a package ID identifies the requested app.
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

Version 2 acquisition outcomes partition attempted candidate IDs. Priority is
conflicting duplicates, invalid type, unsupported type, title checks, then valid
game/DLC. Thus an unsupported type without a name remains unsupported; a row
with both invalid type and invalid name is `invalidType`. Secondary name-presence
information can appear in an explicitly exported sample.

| Outcome | Meaning |
| --- | --- |
| `absent` | No response row has this requested canonical ID in `appid`. Malformed/extra rows are not silently assigned to it. |
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

The sanitizer accepts legacy `missing` from old trace shapes; new acquisition
never emits it. Owned-list failure is separate: `ownedListRead:false`, zero title
attempts and `firstFailure.stage:'owned-list'`, without classifying unattempted IDs.
Games + DLC = captured records. Other outcomes except unsupported sum to unique
unresolved IDs. All outcomes sum to attempted IDs, which may be fewer than
candidates after an aborted full scan. Unsupported types alone are not failures.

Request-level statistics stay separate: title/failed-request counts, actual HTTP
frequencies and at most 32 `requests` summaries. Each summary has requested,
returned-row, matched-ID, absent, malformed-row, unexpected-row and duplicate-row
counts when a valid response exists. No response counts are invented on HTTP or
network failure. `requestSamplesDropped` counts omitted summaries; aggregate
outcomes still cover all attempted batches. Empty HTTP 200 arrays mean absent;
unreadable HTTP 200 bodies mean malformed.

Saving is a later independent axis: `saveState` is pending/committed/rejected/
unconfirmed. `savedCount` and `saveRejectedCount` require acknowledgement. Lost
acknowledgement never invents success or rejection. Do not add these to the
acquisition partition. A status receipt certifies status, not item observations.

## Aggregate export

1. Reload updated GL and the signed-in Steam Store page with its GL panel.
2. Select GL's content-script/isolated console in developer tools and run
   `GalacticSync.setProfiling(true)`.
3. Run Quick update, then promptly export from GL Settings → Performance
   diagnostics before worker restart. Check `steamDiagnostics.outcomeVersion:2`,
   outcomes and request summaries.
4. Disable with `GalacticSync.setProfiling(false)` or reload the page.

Detailed profiling stays page-local and off by default. Existing 50-trace FIFO
and worker-reset behavior remain. No IDs, titles, accounts, URLs, credentials,
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
Fields are only App ID, outcome, returned-entry presence, supplied integer type
if valid, and usable-name presence where observed. Request failures do not pretend
to establish whether an entry was returned. No titles, account identifiers,
headers, cookies, tokens or raw responses. Full-scan failures sample attempted
IDs only. Nothing is automatically logged to the ordinary console.

## Historical limits, fallback assessment and retries

Export 8 established 159 candidates: 143 missing usable metadata and 16 other
types, two HTTP 200 title responses, no captured games/DLC or save rejections.
Its old missing category cannot be retrospectively split. Export 9 confirms cold
certificate reuse but has no detailed provider outcomes. A new version-2 export
is required. Actual identities require a separately and explicitly shared sample;
none have been guessed or submitted to outside services during development.

| Candidate fallback | Evidence and decision |
| --- | --- |
| Current owned-ID response | Supported owned field contains IDs. No retained evidence establishes another reliable title/type map. Do not invent one. |
| Same-origin public store details/page | Existing Store permission, but response/type contract, delisted coverage and browser CORS require validation. Potentially one request per missing ID; no rate or coverage guarantee established. First compare a small shared sample directly with official Steam, then propose a bounded optional fallback. No automatic fallback added. |
| `IStoreService/GetAppList` | Valve documents API-key authentication, type filters and pagination. Not a keyless drop-in or account ownership proof. Do not add authentication/partner-host permissions or crawl the whole catalog. |
| Legacy `ISteamApps/GetAppList` | Valve marks it deprecated because of scale. Public names alone do not establish type/ownership. Do not adopt as automatic fallback. |
| `IPlayerService/GetOwnedGames` | Requires API key and Steam ID; optional names/icons depend on visibility. Not the existing browser-session contract. No new account/key workflow. |

Official references: [IStoreService](https://partner.steamgames.com/doc/webapi/IStoreService#GetAppList),
[ISteamApps](https://partner.steamgames.com/doc/webapi/ISteamApps#GetAppList),
[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService#GetOwnedGames).
Only public documentation was consulted; no private IDs or authenticated provider
requests were used. Public comparison of actual unresolved IDs awaits the sample.

Unresolved/missing metadata remains retryable, never revoked ownership. Saved
IDs stop recurring; unsupported types remain candidates because metadata/support
can change. Future throttling would require account/ID/endpoint-context scope,
bounded expiry, version invalidation, Full rescan bypass and successful-ID removal.
That design is deferred: no blacklist or suppression of future acquisitions.

The panel separates owned-list retrieval, imported game/DLC changes, omitted IDs,
missing/invalid titles, invalid/conflicting types, unsupported types and request
failures. Unresolved entries keep the result incomplete. Valid neighbors still
save incrementally. Eligible unchanged incomplete checks preserve shared receipts,
cold certificate reuse, success baselines and ownership; no storage change.
