# Stored metadata validation

Imports, enrichment writes, database reads, backup creation and backup restore use the same central validators. Backup format remains version 1; database schema 5 preserves separate provider history and edition separations and accepts schema 1/2/3/4 backups. Unknown fields are removed rather than copied recursively. A malformed supported field rejects the whole import, enrichment batch or restore before persistence. Identity and scope fields are rejected when oversized, never silently shortened into another identity.

Provider pages can submit their provider's records and sync state through sender-checked worker messages. They cannot attach approved enrichment, persistent record references or observation dates. The worker sets the evidence source and observation date, assigns new opaque references, and preserves existing references and enrichment on resync. Only dedicated enrichment/review operations or validated backup restore can supply enrichment. Existing checksum-invalid ISBN strings remain bounded source evidence for diagnostics; matching still ignores them.

Common metadata fields are authors, contributors with name/role, series, ISBN/ASIN/work IDs, publisher, language, edition, issue/volume/unit type, run/year, publication date, format, contents statements and source URLs. Additional fields are explicitly scoped:

| Provider | Additional metadata |
|---|---|
| Steam / Epic | Parent provider item ID |
| GOG | None |
| Amazon Games | Delivery label |
| Audible | Narrators, library action |
| Kindle | Collections, origin/content type, item status, library category |
| Amazon Video | Entity type, library view, ownership evidence |
| Fandango at Home | Card type |
| Kobo | Library section, validated ownership basis; library presence alone cannot establish ownership |
| Fanatical | Bundle ID/title/slug, product slug, DRM, formats, Steam App ID |
| Humble | Purchase ID, bundle label, entitlement type, key type, allowlisted key status and validated ISO expiry; no redemption values |

Supported nested enrichment is limited to Open Library work metadata, Google Books edition metadata, Google Books genre hints and Kindle product-page contents. Each has its own field allowlist. Arbitrary nested objects, raw responses, credentials, download links and unsupported enrichment adapters are discarded.

Principal bounds:

- Titles and provider item IDs: 500 characters. General bibliographic text: 500; language: 80; run: 100; issue/volume: 80; ISBN: 32.
- Creator/series/category/format lists: 50 entries; platforms: 30 entries. Contributor entries retain only bounded names and roles.
- Source URLs: 2,048 characters; HTTP(S), no embedded credentials, query or fragment. Provider detail URLs must use that provider's host. Enrichment URLs must use the catalog host; Google Books retains only the public volume `id` query parameter. Invalid URLs are discarded; invalid contents-review URLs reject the review.
- Original contents statements: 10,000 characters. Reviewed contents: 1–2,000 typed entries, with bounded scope and numeric/fractional issue/volume/annual numbers.
- Projected metadata: 100,000 characters per record. Imports: at most 50,000 records per operation; databases: at most 500,000 records; saved relationships: at most 100,000. Duplicate provider identities or opaque references reject a backup.
- Sync state keeps only supported counts, flags, dates, source/status labels, bounded account/profile labels and provider-specific purchase IDs or order fingerprints. Saved snapshot sections have bounded identifiers, validated counts/end conditions and required sections.
- Dates validate ISO calendar/time values before normalization. Legacy timestamps without an offset retain the browser's existing local-time interpretation when converted to an ISO timestamp with a timezone.
- Fandango's temporary state keeps only the scan phase/mode, expected counts, same-provider URLs, validated movie/TV records and known item IDs, scoped to its browser tab.

Existing storage is sanitized and persisted on its first read if it differs from the validated schema. Unchanged reads do not rewrite the database. Historical backup files are not edited. Supported fields and saved review/enrichment evidence round-trip through backups; unsupported fields are intentionally excluded. `npm test` exercises privacy projections, malformed data, atomic failures, injection attempts, migration and authorization. Browser checks cover the options page and all importer panels with synthetic data.
