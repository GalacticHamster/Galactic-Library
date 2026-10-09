# Manual provider purchase sharing (protocol 1)

GL and its Humble/Fanatical companions can exchange retained **provider purchase records**, independently of bundle matching and without revisiting a storefront. This is manual handoff, not synchronization or an authoritative rescan. The canonical catalog is never used to reconstruct purchases.

## Acquisition compatibility

HB scans Humble purchase orders/details in its content importer, projects bibliographic/media and key-state leaves, aggregates local catalog rows, and retains individual purchase origins. Its serialized background writer protects account switching and completed-scan history. GL's Humble importer independently fetches the same purchase API; its native identity is `purchase:product:machine-or-position` or `purchase:entitlement:machine:key-index`. Fresh HB direct-product imports now retain the same product identity, including the original unfiltered product position.

FAN scans the authenticated paginated orders API in the page MAIN world. Only validated DTOs leave that world. It hashes order references, retains product IDs, bundles and aggregate quantities per order/bundle. GL has a separate bounded Fanatical page scanner and provider projection; it retains opaque individual occurrence references. Neither handoff invokes these scanners, acquires authentication or downloads files.

| Humble capability | HB native retained data | GL provider retained data |
| --- | --- | --- |
| Provider product IDs | Fresh direct imports; key entitlement IDs. Older direct rows may lack IDs. | Native product/entitlement ID, scoped to provider profile. |
| Purchase references | Purchase key on individual provenance; purchase summaries. | Purchase ID and purchase-scoped native item ID. |
| Bundle relationships | Source bundle on each purchase origin. | Source bundle on each provider item. |
| Account identity | Named active account and saved account archives; no proven store-account ID. | Persistent profile UUID; not proof of correspondence to an HB nickname. |
| Titles/media | Book, audiobook, game, software. | Same supported kinds. |
| Edition/bibliography | Authors, validated ISBNs and supported edition/run/unit leaves. | Provider bibliography; independently managed enrichment is preserved locally. |
| Store/file metadata | Limited allowlisted source leaves; classification derives from downloads. Signed download URLs are not retained for handoff. | Safe provider metadata; no raw order/download payload. |
| Purchase history/prices | Current purchases, summaries/prices, older retained history and account archives. | Current provider items plus local history; no Humble price model. |
| Completeness | Native full-scan markers and reminder coverage. | Native provider scope/baseline and sync health. |

| Fanatical capability | FAN native retained data | GL provider retained data |
| --- | --- | --- |
| Provider product IDs | Stable product IDs. | Same product IDs in profile namespaces. |
| Purchase references | Opaque order hash; order/bundle quantity. | Opaque order hash and individual occurrence references. |
| Bundle relationships | Primary bundle plus purchase origins with bundle ID/title/slug. | Primary bundle plus occurrence-level bundle relationships. |
| Account identity | Active nickname and saved archives; no proven store-account ID. | Persistent profile UUID; explicit association remains required. |
| Titles/media | Game, book, audiobook, software, audio, elearning, other. | Book, audiobook, game, software; unsupported types are reported/skipped. |
| Edition/bibliography | Supported author/publisher/edition/run/volume leaves and external identifiers. | Provider bibliography plus separately managed enrichment. |
| Store/file metadata | Product slug, DRM, platforms, formats and external IDs. | Corresponding supported provider leaves, not actual downloadable files. |
| Historical records | Current product catalog, purchase associations and saved archives/history. | Current provider items, separate history and source evidence. |
| Completeness | Completed full/quick scan markers and order fingerprints. | Completed native scan scope/baseline. |

## Envelope and bounded transport

The strict protocol-1 envelope contains provider, opaque source account reference/label, snapshot ID, creation timestamp, scope, completeness, limitations and records. Records contain native product identity where retained, title/media, allowlisted provider metadata, purchase date and order/bundle groups. Unknown keys, secret-bearing fields, unsafe URLs, invalid dates/IDs, duplicate identities and malformed groups reject the transfer. No cookies, session/password/auth tokens, redemption values, signed download URLs, emails or raw order bodies are exchanged. Humble purchase identifiers are retained because its native item namespace requires them; they are not account-identity proof.

Current exports always say **historical / partial**: they are projections of saved supported purchases, even just after a successful native scan. The contract also validates full, incremental and incomplete scopes. Every manual import remains additive regardless of scope; it never establishes an absence/deletion baseline or claims a newly validated website scan. `capturedAt` is projection creation time, not the original website observation time.

The receiver negotiates `GH_PURCHASE_CAPABILITIES`, lists `ACCOUNTS`, requests `BEGIN`, sequentially pulls `CHUNK`, validates the assembled snapshot, commits through its own writer, and sends `ACK`. Sending from the source prepares a snapshot and sends an `OFFER` that opens the receiver's Options page. Offers are **not imports**; the receiver still selects and confirms its account. There is no externally callable purchase-import operation.

Limits: 50,000 records, 32 MiB assembled UTF-8 JSON, at most 250 records / 96 KiB per chunk, two prepared source sessions, one active receiver import, 30 seconds per external request and ten-minute staging expiry. Chunk limits were exercised with 6,321-record synthetic snapshots of approximately 2.2-3.9 MB, rather than assuming one giant message is portable. Per-chunk and whole-snapshot SHA-256, index, byte/record counts, header/account/provider and version checks precede mutation. Duplicate reads are identical; swapped/corrupt/stale/incomplete chunks cannot commit.

Source sessions live only in worker memory. A single small persistent offer can point to a session; no bulk staging is stored. Source worker/browser restart invalidates old grants, which fail safely. A retry stages the retained library again. Closing an Options document does not itself cancel an already admitted worker operation. Closing/restarting a receiver before commit leaves its database intact; after its atomic commit, the data may already be imported even if the UI/ACK disappears. Retry is idempotent. ACK failure or offer-cleanup failure cannot misreport a committed import as a failed database save.

## Authorization and accounts

Existing official companion IDs and existing custom pairing/allowlists are reused. Chrome and Firefox keep their independent IDs; Firefox has separately packaged stable add-on IDs. A message's claimed provider is not authorization. Official HB can route only Humble; official FAN only Fanatical. A custom GL peer must already be allowed and have a provider role explicitly selected locally from Purchase sharing's Development disclosure. An external message cannot assign itself that role. Companions trust the configured/official GL identity only. Storefront content scripts cannot invoke the local handoff controller.

The receiver must explicitly select an existing account or name a separate account, then confirm that source and destination are the same store account. Matching nicknames never auto-link accounts. GL uses profile UUIDs and destination-state stamps. Companions use opaque references derived from the local account revision, making a changed source/destination require refreshed choices. No import silently switches an active account. Peer authorization is checked again immediately before commit. Native acquisition for that provider blocks a conflicting handoff import.

## Merge and provenance invariants

GL uses existing provider normalization, account keyspaces, canonical reconstruction and validated atomic persistence. Existing ownership/access, record references, enrichment, contents/reviews, manual identity decisions, edition barriers, other providers and histories are preserved. GL exports underlying supported owned-purchase records; display ownership overrides are never exported as evidence. Identified Humble key purchases remain transferable when expiry makes destination ownership unknown, carrying their key status so recipients preserve the purchase-versus-activation distinction.

HB matches native product IDs first. Missing-ID legacy data may use an unambiguous same purchase/title/media origin, without equating two different known native products. GL similarly permits legacy HB data only to enrich an unambiguous existing purchase/title; unmatched legacy rows are skipped rather than assigned guessed IDs. Existing purchase prices/reminders/history survive. Supported incoming purchase summaries are added without claiming complete key-reminder coverage.

FAN matches stable product IDs and merges order/bundle groups using maximum observed quantity, rather than adding the same purchase again. GL distinguishes quantities lacking native occurrence IDs with `basis: order-bundle-count` on derived aggregate slots. These are explicitly not native occurrence evidence. A later native scan replaces aggregate slots with actual occurrences for the same item/order/bundle, avoiding double counts; all-native occurrence groups retain their existing union behavior. This is an additive provenance leaf, not a backup-format version redesign. Use compatible current GL builds to retain that distinction.

Missing incoming fields do not erase known fields. Normalized repeat comparisons ignore JSON property order. No-change imports do not save the database again. Incoming omitted records never remove current records. Whole transfers are validated before the receiver's existing serialized atomic writer is called; failed validation/storage does not damage either library.

## Historical limitations

- Old HB direct rows without native product identity can only enrich an existing unambiguous GL purchase; a separate fresh HB scan is required to add those unmatched products. Manually entered rows lacking purchase identity are excluded.
- GL does not have Humble purchase prices, full raw orders, signed links or every Fanatical product type. Existing destination prices/file metadata are preserved; missing source facts are never fabricated.
- Older FAN origins without opaque order references cannot provide order-level associations; available product/primary-bundle information still transfers, with a limitation notice.
- Source selection includes current purchase records in a saved account, including inactive saved accounts. Removed-record histories, matching decisions, enrichment/source-history documents, wishlists and settings are not portable purchase data and are not copied. Destination versions of them remain intact.
- HB's normal bibliographic storage does not model every GL provider metadata field (for example publisher/file-format leaves). The handoff provides its supported native purchase library, not a raw GL backup. GL enrichment is not copied into companion evidence.
- Handoff does not certify a new native full-scan/key-reminder baseline. A later native quick import can still request full acquisition when its own baseline/metadata upgrade requires one.

## Development and tests

Authoritative runtime assets live in `shared/purchase-{snapshot,transfer,adapters,handoff-ui}.js`. Run `node scripts/sync-companion-purchases.mjs` to mirror them to HB's root and FAN's `src`, or `--check` to verify exact bytes. Theme assets continue through `sync-companion-themes.mjs`. All assets appear in explicit Chrome/Firefox runtime allowlists.

Run GL's normal `npm test`, `node --test tests/purchase-handoff.test.mjs`, companion normal suites and package checks. `node scripts/check-purchase-handoff-browser.mjs` and `--firefox` use packaged extensions, local synthetic 6,321-record libraries and disposable profiles. They verify both directions, repeats, associations, exact matching equivalence, source database digests, native trust/version errors and missing peers. Shared tests cover corruption/reordering, stale grants/restarts, account/permission changes, concurrent capacity/receiver admissions, scope/absence semantics and real writer failures. `check-themes-browser.mjs` checks Light card colors and existing System/following/persistence behavior in both browsers. No private backup or signed-in storefront is needed.

## Pairing and lazy account discovery repair

Outbound GL purchase peers resolve only among the existing effective allowlist. A reverse PING to a physical extension ID verifies its provider role; purchase capability is negotiated separately. Published browser identities remain immutable. Explicit development IDs must already be allowed. Multiple responding custom builds require explicit selection; remembered role bindings are reused and reauthorization happens before commit. Concurrent role-binding writes are serialized so two connection checks cannot overwrite each other. An already allowed incoming custom peer can initialize its role through that same reverse PING; claimed payload IDs are never used.

The direction-specific shared controller reads local/remote choices independently once its disclosure opens. Read failures have separate visible statuses and bounded timeouts. Selection/theme/disclosure reopening does not trigger another database read. Manual refresh clears confirmation and reloads revision-bound choices. Empty and incomplete accounts remain visible; transferable eligibility and missing-native-ID limitations are distinct. Changed source/destination revisions remain guarded by the existing account/stamp checks.

Sending now requires a confirmed, bounded destination intent. OFFER stores that intent beside the validated manifest and opens Options. It never writes purchase records. The receiver suggests the destination but still requires its own review/confirmation and imports through the existing validated atomic writer. Older offers without destination intents remain reviewable. No external mutation endpoint was added.

GL destination profile stamps use existing strict, sorted database serialization. Native storage and cold certified snapshots may reorder object properties; equivalent key order is not an account change. Every actual profile fact remains in the digest, so stale/renamed/updated destinations still require fresh choices and confirmation.
