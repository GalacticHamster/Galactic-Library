# Companion matching API

Only extensions explicitly allowed in Galactic Library's options may use the external API. Send JSON messages with `chrome.runtime.sendMessage(galacticExtensionId, request)`. API version 1 accepts games, books and audiobooks. `PING` tests pairing; `GET_STATUS` reports provider counts and capabilities.

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

- `matches`: compatible exact game titles, validated edition identifiers, compatible book title-and-author evidence, or reviewed same-edition aliases. Title-only books/audiobooks stay Possible; a matching title or identifier spanning distinct canonical editions remains ambiguous until the request supplies distinguishing evidence. Exact results can include unknown, subscription, borrowed or rental records; `owned` is true only for an owned or permanently claimed record.
- `possibleMatches`: related editions or reviewed same-work aliases, with the actual library title and reason. Different ISBNs or edition labels can veto exact ownership while preserving Possible. Known incompatible authors, runs or volume numbers do not become automatic candidates. Reviewed Different decisions block inferred and transitive candidates.
- `partialMatches`: permanently owned records contributing reviewed full contents. A contains relationship never means the collection itself is the same edition as the offered product.
- `coverage`: null when there is no contents request; otherwise total, owned, complete, scopeUncertain, covered, possibleCovered and missing entries. Covered entries identify contributing records and review dates. Possible coverage needs run/language confirmation and remains in missing. Excerpts and temporary access cannot supply full coverage.

All matches carry `relationship` (`same-work`, `same-edition` or `contains`), reason, confidence, a bounded bibliographic evidence object and an opaque `itemRef`. Raw provider/purchase IDs, credentials, URLs and unfiltered metadata are excluded. Numeric confidence describes a rule, not a calibrated probability; ownership and coverage fields determine the result.

Every external result passes an independent output allowlist, including nested coverage evidence. Source labels are known importer names or provider names; observation/review dates are ISO timestamps or null. `GET_STATUS` exposes only known providers, connection flags and nonnegative counts. Account details, scan state and unknown provider fields are never returned.

An explicit complete contents list, with run and language, may establish full content ownership from the union of several collections. Set `contentsComplete: true` only if the list enumerates the entire offered content. Complete content ownership does not establish edition identity or ownership of extras omitted from the list. Without that flag, even full enumerated coverage remains separate from `owned`. Title-derived ranges are only requests for comparison and never create contents evidence or complete ownership automatically.

Companions should render partial coverage separately, show owned titles for Possible, and describe an empty result as not found in the synced library. Check `ok` before reading results. This API does not certify an account's complete purchase history. Companion storefront changes to consume the new coverage fields are separate work.

Manual Same work reviews and edition separations prevent automatic same-edition grouping, including indirect paths. Separations expose a related-work candidate without claiming the other edition is owned. If matching evidence spans multiple separated editions, the result remains Possible until distinguishing edition evidence is supplied. Different works reviews continue to suppress prohibited relationships. Undoing a separation does not remove other review decisions.
