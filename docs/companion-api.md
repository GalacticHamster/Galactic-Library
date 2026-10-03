# Companion matching API

Only extensions explicitly allowed in Galactic Library's options may use the external API. Send JSON messages with `chrome.runtime.sendMessage(galacticExtensionId, request)`. API version 1 accepts games, books, audiobooks and software. `PING` tests pairing; `GET_STATUS` reports provider counts and capabilities.

`MATCH_ITEMS` accepts 1–500 requests, titles up to 500 characters and at most 20,000 explicitly enumerated contents entries per batch. The original title-only request remains supported. New fields and response fields are additive; consumers must ignore unfamiliar fields.

```json
{
  "type": "MATCH_ITEMS",
  "apiVersion": 1,
  "items": [{
    "requestId": "offer-1",
    "mediaType": "book",
    "title": "Example Omnibus",
    "authors": ["Example Author"],
    "language": "en",
    "excludeProviders": ["humble"],
    "contentsComplete": true,
    "contents": [
      {"series":"Example","run":"2020","unitType":"volume","number":"1","language":"en","completeness":"full"},
      {"series":"Example","run":"2020","unitType":"volume","number":"2","language":"en","completeness":"full"}
    ]
  }]
}
```

Optional `identifiers` accepts checksum-valid `isbn` (string or up to 50 strings), `asin`, and `workId`. ISBN-10 and ISBN-13 are compared equivalently. Optional edition, series, run, volume and issue fields are strings; authors is an array of strings. `requestId` is a string or null. Exclusions apply to results and contents evidence, before ownership is calculated.

Each result contains:

- `matches`: compatible exact game titles, validated edition identifiers, matching full book/audiobook titles, or reviewed same-edition aliases. Full book titles tolerate punctuation, ampersands, explicit volume-number presentation and trailing book-format labels. A missing ISBN or author on either side does not veto a full-title match; known contradictory identifiers, creators, editions, languages, runs or units do. Repeated purchases of the same full title do not become ambiguous solely because GL keeps separate canonical records. Known homonyms and manual edition barriers remain ambiguous until distinguishing evidence is supplied. Exact results can include unknown, subscription, borrowed or rental records; `owned` is true only for an owned or permanently claimed record.
- `possibleMatches`: related editions or reviewed same-work aliases, with the actual library title and reason. Different ISBNs or edition labels can veto exact ownership while preserving Possible. Known incompatible authors, runs or volume numbers do not become automatic candidates. Reviewed Different decisions block inferred and transitive candidates.
- `partialMatches`: permanently owned records contributing reviewed full contents. A contains relationship never means the collection itself is the same edition as the offered product.
- `coverage`: null when there is no contents request; otherwise total, owned, complete, scopeUncertain, covered, possibleCovered and missing entries. Covered entries identify contributing records and review dates. Possible coverage needs run/language confirmation and remains in missing. Excerpts and temporary access cannot supply full coverage.

All matches carry `relationship` (`same-work`, `same-edition` or `contains`), reason, confidence, a bounded bibliographic evidence object and an opaque `itemRef`. Raw provider/purchase IDs, credentials, URLs and unfiltered metadata are excluded. Numeric confidence describes a rule, not a calibrated probability; ownership and coverage fields determine the result.

Every external result passes an independent output allowlist, including nested coverage evidence. Source labels are known importer names or provider names; observation/review dates are ISO timestamps or null. `GET_STATUS` exposes only known providers, connection flags and nonnegative counts. Account details, scan state and unknown provider fields are never returned.

Companion title equality retains articles, accents, general Roman numerals, preview/sample labels and meaningful symbols. Shortened titles, missing subtitles and spelling approximations stay Possible. An owned book labeled `(plus extra content)` can cover the offered base title; owning the base alone does not establish ownership of the extras. Each request is independent: `4001 A.D.` matches `4001 A.D. TPB`, while `4001 A.D. Beyond New Japan` matches `4001 A.D.: Beyond New Japan`. The longer book may also appear as a Possible candidate for the shorter request without downgrading its exact match. These rules do not merge canonical editions, approve enrichment, or change receipt/contents review requirements.

On 2026-10-03, this correction passed 157 GL core checks, 25 FAN central integration checks, 13 HB central integration checks and the installed Firefox companion suite. A disposable Chrome profile restored the authorized 14,081-record export and sent the public Valiant Heroic Comic Collection's 40 requests through the real FAN-to-GL extension connection: 25 resolved as Owned Elsewhere, with both 4001 books matched independently. Under six concurrent library reads, the 30-second deadline also returned all 40 checks and the same 25 ownership results. The private export was not added to the repository; committed regression fixtures are synthetic.

An explicit complete contents list, with run and language, may establish full content ownership from the union of several collections. Set `contentsComplete: true` only if the list enumerates the entire offered content. Complete content ownership does not establish edition identity or ownership of extras omitted from the list. Without that flag, even full enumerated coverage remains separate from `owned`. Title-derived ranges are only requests for comparison and never create contents evidence or complete ownership automatically.

Companions should render partial coverage separately, show owned titles for Possible, and describe an empty result as not found in the synced library. Check `ok` before reading results. This API does not certify an account's complete purchase history. Current HB and Fanatical builds consume these coverage fields.

Manual Same work reviews and edition separations prevent automatic same-edition grouping, including indirect paths. Separations expose a related-work candidate without claiming the other edition is owned. If matching evidence spans multiple separated editions, the result remains Possible until distinguishing edition evidence is supplied. Different works reviews continue to suppress prohibited relationships. Undoing a separation does not remove other review decisions.

Reseller evidence adds `purchaseEvidence` (`confirmed` or `unknown`) and `activationStatus` (`unknown` or `not-applicable`). Humble third-party keys and Fanatical games always have unknown destination activation. Where key evidence exists, `keyStatus` is `unknown`, `unrevealed`, `revealed`, `expired`, or `unavailable`, and `expiresAt` is an ISO timestamp or null. These fields never contain a key value, purchase ID, or destination account. Pending and revealed purchases may establish source purchase ownership; expired/unavailable Humble keys require review (`ownership: unknown`). A separate destination-library record can still establish Owned. Reported key expiry does not prove a previously activated license was revoked.

Records missing from a validated full scan stay in private provider history. Relevant records from the active profile appear only in Possible with unknown ownership and evidence availability set to not-observed-in-last-full-scan. Missing records never establish current Owned or contents coverage. A disappearance is not evidence of revocation. Historical account/purchase identifiers are still excluded from the response.

GET_STATUS advertises `capabilities.entitlementReminders`. Allow-listed companions can request `{type:"GET_REMINDERS",apiVersion:1,limit:100,offset:0,provider:"humble"}`; provider is optional, limit is 1-200. The response includes total, nextOffset (or null), and reminders with only opaque reminderRef/itemRef, title, provider, mediaType, kind, dueAt and severity. Kinds are activation, key-expiry, key-unavailable, access-expiry and temporary-access; severity is information, due-soon (within seven days) or attention. Dismissed/snoozed and historical reminders are omitted. No private review notes, evidence fingerprints, account labels or purchase identifiers are exposed. Pages reflect the current library; refetch from offset zero after a library update. Current HB and Fanatical builds display these reminders.


## Account-scoped companion entitlement feeds (HB-13 receiver)

GET_STATUS advertises capabilities.entitlementFeed. Allow-listed clients may publish a dated, narrow Humble reminder snapshot through four version-1 commands:

1. BEGIN_ENTITLEMENT_FEED: profileLabel (current GL Humble profile, at most 100 characters), count (0-100,000), coverage (complete or partial), sentAt (ISO date). Returns an opaque uploadToken.
2. APPEND_ENTITLEMENT_FEED: uploadToken, offset and 1-200 entries. Offsets must exactly follow accepted batches. Entries contain only itemRef (client opaque UUID), title (at most 500 characters), mediaType (game/software/book/audiobook/unknown), keyStatus (unknown/unrevealed/revealed/expired/unavailable), expiresAt (ISO or null), checkedAt (ISO), purchaseEvidence (confirmed) and activationStatus (unknown). Extra fields, secrets/provenance and duplicate references are rejected.
3. COMMIT_ENTITLEMENT_FEED: uploadToken. Returns count only after every declared entry is received and valid. GL atomically replaces that client's prior feed. If its acknowledgement is lost, the feed may already be published; check GL before retrying.
4. REMOVE_ENTITLEMENT_FEED: removes only the requesting client's published feed and staged upload.

A client must explicitly confirm that HB and GL represent the same Humble account. A matching label scopes the upload; it cannot itself authenticate the underlying account. GL checks its current Humble profile and client permission at each queued write. Uploads expire after ten minutes; later BEGIN, profile changes, clear and restore invalidate previous upload leases. At most 64 clients are accepted, with separate limits of 100,000 published entries and 100,000 staged entries. Failure retains previously published reminders. No raw purchase/entitlement identifiers, keys, URLs or prices are accepted.

Schema 11 stores companionFeeds separately from providerItems, canonical identity, ownership and reviewed contents, and accepts earlier database schemas. Each accepted entry receives an independent central localRef; the sender cannot choose a provider record's review reference. Refreshes preserve localRef when the client/profile/itemRef stays unchanged. Reminder evidence includes the dated check, so changed observations can reactivate dismissal/snooze. Feeds outside GL's current Humble profile are hidden from active reminders.

GET_REMINDERS includes these entries with source: humble-companion and reviewAvailable: false. Public entries use only central opaque references, never client IDs, profile labels, sender references or internal evidence fingerprints. These entries do not represent native library records and cannot be used to assert ownership. The GL dashboard opens the source extension through Chrome's trusted options route or Firefox's paired `OPEN_REVIEW` request, and can remove a feed. Native GL and HB reports remain visibly separate and may both appear for the same title.

GL backups preserve published feeds and reminder reviews. Private in-progress uploads and HB's salt are excluded. Revoking a client prevents new transfers but retains its previously published feed until the user removes it; clearing/uninstalling HB likewise does not remotely retract saved GL data.

## Browser identity and central review

Allow-list entries may be Chrome IDs, conservative Firefox email-style add-on IDs, or brace-wrapped Gecko UUIDs. Use the declared stable Firefox IDs, not the private per-profile `moz-extension` URL. The sender must match an allowed ID for every request, including staged feed operations.

`GET_STATUS` advertises `capabilities.centralReview: true`. `{type:"OPEN_REVIEW",apiVersion:1}` returns `{ok:true,apiVersion:1}` after GL calls its own `runtime.openOptionsPage()`. No caller URL is accepted. HB/FAN use this request on Firefox and keep a toolbar fallback for older GL builds. Chrome keeps its trusted options route.

For Firefox reminder source review, HB accepts `OPEN_REVIEW` only from its saved GL ID and validates version 1 before opening its own options. An unpaired or older HB returns no usable review acknowledgement; GL displays toolbar instructions. This action does not transfer library or reminder data.
