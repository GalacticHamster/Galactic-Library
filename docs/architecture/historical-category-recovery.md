# Offline historical category recovery

The preview compares two valid GL backups without writing either input. Linkage requires a unique provider/native identifier on both sides, unchanged literal validated title and equal book/audiobook media. Duplicate IDs across profiles are ambiguous. Changed titles, missing IDs, changed media and reviewed contradictory format labels are skipped. Independent subjects can coexist; this does not attempt a general ontology conflict engine.

Only absent Google Books categories/genre hints or Open Library subjects are proposed. Existing nonempty category lists are preserved in full. A populated newer catalogue identifier conflicts with a different historical catalogue source. Newly created sparse envelopes contain source, category labels, source URL/capture dates and an explicit historical category-only matchBasis. Genre-hint confidence/candidate label may be retained as nonidentity provenance. Historical ISBN, authors, publisher, work/edition IDs, ownership, access, contents and decisions are excluded. Existing envelopes retain all their current fields.

Fingerprints cover original backup JSON with sorted object keys. Preview counts and patches are deterministic; old profile migration generates no candidate state. Report examples are opt-in to avoid printing private titles. Broad-facet counts use the same read-only classification functions as Library.

## Explicit candidate and undo

Preview (no output writes):

```powershell
node scripts/recover-historical-categories.mjs OLD_BACKUP CURRENT_BACKUP
```

Candidate creation requires a fresh normalized current export, an explicit confirmation flag, and a nonexistent output. Legacy current backups can be previewed but are refused as candidate inputs to avoid incidental migrations. Actual GL backup parsing validates inputs/output. Exact inverse-state and per-record identity comparisons ensure that only category evidence changes. Candidate provenance uses existing catalogue envelopes; its top-level recoveryManifest records exact patches and fingerprints and is not imported into browser database state.

```powershell
node scripts/recover-historical-categories.mjs OLD_BACKUP CURRENT_BACKUP --output NEW_CANDIDATE --confirm
node scripts/recover-historical-categories.mjs --undo ORIGINAL_CANDIDATE FRESH_CURRENT_BACKUP --output NEW_UNDONE_CANDIDATE --confirm
```

No command imports a backup or accesses browser storage. Output uses exclusive file creation and never overwrites inputs/existing destinations. Retain the original candidate file for its inverse manifest. Undo verifies each recovered envelope still equals the applied patch; if later activity changed it, undo refuses the whole operation. Unrelated later records/metadata remain intact. Full restoration of the pre-recovery backup is appropriate only when intentionally replacing all subsequent activity, not as ordinary recovery undo.
