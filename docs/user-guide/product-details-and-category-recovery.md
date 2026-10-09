# Amazon Product Details and historical category recovery

## Product Details

Open a Kindle book's Item Details to inspect **Product details** when evidence has been captured. The summary shows page-provided facts that are not already identical saved edition facts. **Amazon source evidence and technical details** opens raw labels, source selectors, capture dates, ASIN and links. Competing values remain visible rather than choosing one silently.

Amazon page ISBNs have an **unverified edition relationship**. Even a correct checksum can describe a print edition instead of your Kindle copy. Product-page observations do not change the saved title, ISBN, publisher, series, edition, ownership, matching or contents reviews.

Details are collected from the same response during future user-initiated Kindle contents acquisitions. Existing scans cannot gain fields that were never captured; no automatic rescan occurs. Missing fields on a later page retain earlier observations and their dates. A failed page cannot replace successful details. Unsupported localized labels/dates may remain absent or unparsed.

## Offline category recovery

This developer tool requires a repository checkout and Node. It compares an old and a fresh current GL backup offline; it never imports into browser storage or contacts providers. It recovers only missing category labels and source provenance. Historical authors, ISBNs, publisher, work/edition identity, access and contents are excluded.

From the repository directory, preview without writing:

```powershell
node scripts/recover-historical-categories.mjs OLD_BACKUP CURRENT_BACKUP
```

Review eligible/skipped/conflict counts and expected genre facets. `--examples` additionally prints a small sample of titles; omit it for aggregate-only output. Literal unchanged titles and unique native IDs are required. Existing categories remain intact. Changed titles, duplicate account identifiers, changed media and reviewed format conflicts need separate review.

Create a new candidate only after deciding to recover. The current export must already be normalized by the current GL version; older backups can be previewed but cannot silently migrate through recovery.

```powershell
node scripts/recover-historical-categories.mjs OLD_BACKUP CURRENT_BACKUP --output NEW_CANDIDATE --confirm
```

Output must not exist. Keep both inputs and the original candidate: its recoveryManifest records the exact additions and inverse patch. The tool validates with GL's actual parser and proves unrelated state/identity unchanged.

Importing a candidate through GL is still an explicit **full backup restoration**. Produce it from a fresh export immediately before restoration. If library activity occurred after that export, export again and regenerate; an older candidate cannot preserve later activity that it never contained. The normal restore confirmation remains required. Nothing is automatically imported.

For later category-only undo, use the original candidate's manifest and a fresh current export:

```powershell
node scripts/recover-historical-categories.mjs --undo ORIGINAL_CANDIDATE FRESH_CURRENT_BACKUP --output NEW_UNDONE_CANDIDATE --confirm
```

Undo preserves unrelated later activity and refuses any recovered envelope that has changed since recovery. It does not roll back the whole library or overwrite newer evidence. Review stale targets separately if undo is refused.

See [recovery invariants](../architecture/historical-category-recovery.md), [Product Details evidence](../architecture/kindle-product-details.md) and [catalogue integrity boundaries](../architecture/catalogue-data-integrity.md).
