# Application operation feedback

## Inventory and implementation plan

Code inspection on October 9, 2026. Durations below describe work, not measured production timings; the user reports 11+ seconds opening Library and 5-10 seconds exporting. All persistence still belongs to the serialized background writer. UI acknowledgements do not certify persistence.

| Operation / UI entry | Worker or local path | Existing feedback / failure | Required pattern and measurement | Duplicate / navigation / cancellation |
| --- | --- | --- | --- | --- |
| Options startup and retry | `getCommittedLibraryView`; committed snapshot read/certificate/full validation; `render` | Static loading text, retry on initial rejection; text hidden before rendering; secondary work blocks completion | Initial paint before dispatch; read/render timings; distinct loading/empty/error states | Coalesce initialization; tab navigation retains result; no cancellation |
| Toolbar summary | `getDatabase`; local counts | Loading text and caught failure | Accessible loading text; committed read for read-only summary | Single invocation per page |
| Library search, filters, sorting and pagination | Browse projection and `libraryBrowseResults` | Synchronous render, 50 cards; cached projection | No spinner for small changes; measure large projection/selection work, avoid hidden dashboards | No mutation; navigation safe |
| Item details and series coverage | Local lazy details/coverage construction | Lazy but synchronous | Paint feedback before unusually large coverage computation; ordinary details immediate | No mutation; no cancellation |
| Full backup export | `getDatabase`, `createBackup`, JSON, Blob, anchor handoff | No busy state; claims downloaded without disk acknowledgement | Button and inline phases, real paint boundaries; report browser handoff only | Guard duplicate exports; navigation safe while page stays open |
| Backup file selection / validation | `file.text`, JSON, `parseBackup`, authoritative `getDatabase` | No feedback until confirmation | Reading, validation, comparison, awaiting decision; no fabricated counts | Guard active file processing; selecting never grants restore permission |
| Full restore | Confirm, reread stale-state comparison, `restoreDatabase`, `refresh` | Confirmation/stale guard; disables file input only at persistence; generic error | Persistent inline phases, mutation exclusion, persistence vs reload failure | No overlap; page closure not promised resumable; no cancellation after commit starts |
| Clear local library | Confirm, `clearDatabase`, `refresh` | Confirmation; generic error; unguarded repeated click | Critical busy state and conflict guard | Exclude competing destructive actions; no cancellation after dispatch |
| Provider Quick Update / Full Rescan | Options opens provider page; actual provider panel starts scan with writer token | Account confirmation, provider panel status/counts; sync-health dashboard | Preserve real panel counters and scan lifecycle; Options explains where update runs | Existing token/lease guards; acquisition page must remain open; supported cancellation via scan controls |
| Provider account selection, rename, reset, removal | Profile writer APIs; removal dependency preview | Confirmation/dialog and busy flag; no initial saving text | Inline saving/removal phase, paint before work; retained error | Guard dialog submit and preview; other accounts unchanged; cancellation before submit only |
| Provider connection, Google key and companion trust settings | Small writer settings operations, companion connection requests | Partial button guards, scattered status | Scoped button busy / persistent failure | Guard same settings operation; unrelated work remains available |
| Google Books batch lookup | Existing queue/run lease, batches, network search, `commitEnrichmentBatch` | Cursor/status, pause after current book, saved resume | Reuse truthful completed/total and existing pause; immediate queue preparation feedback | Existing lease; tab must remain open; pause supported |
| Kindle contents acquisition | Provider tab, existing refresh checkpoint and source save | Real found/empty/unavailable/failure counters, pause/resume | Reuse scan progress, show interruption distinctly; no second queue | Existing checkpoint/lease; no acquisition changes |
| Options scan reconciliation | Progress counts, coalesced `refresh` | Manual refresh disables button; swallowed refresh errors | Explicit refresh failure/retry; library update status | Coalesce; background scan continues on navigation |
| Book suggestion bulk apply/dismiss/undo/retry | Reviewed enrichment writer APIs | Busy flag and final status; silent while working | Shared inline progress, actual selection count only, paint before dispatch | Scoped guard; manual reviews preserved; no invented cancellation |
| Local ComicInfo/EPUB/publisher metadata | Local file parsing, queued review persistence | Status and error, variable button guards | Reading/parsing/queuing status and guard | No automatic source acceptance; no new requests |
| Contents parse/save/remove | Local parser; `saveContentReview` / removal | Draft and save errors; variable busy guards | Paint before parse; per-editor save status | Preserve draft on failure; guard submit; cancellation before save only |
| Reading state / reading order | Reading writer APIs | Busy flags in some forms; persistent status | Shared scoped saving state | Reviewed stale-state guards unchanged |
| Ownership/receipt review | Ownership writer APIs and receipt candidates | Status/errors; some busy flags | Scoped saving/applying state; actual batch count | No ownership policy change; guard repeat submission |
| Identity relationships / edition barriers / aliases / source undo | Manual decision, edition separation, alias and undo writer APIs | Errors but several unguarded callbacks | Scoped saving state and duplicate guard | Preserve matching semantics; no arbitrary cancellation |
| Diagnostics / Comixology review export | Read-only timings or local Markdown | Partial button feedback | Preparing/handoff feedback with errors | Guard duplicate downloads; not disk-complete claims |

No new provider imports are started from Options: those buttons open the provider website and explain its signed-in confirmation. There is no general archive-record or arbitrary bulk-edit workflow to invent. Network lookups and existing checkpoints already expose their own progress; retain them.

## Shared mechanism

Use a small tab-local operation controller with an ID, scope, name, start time, state, optional phase/counts and result/error. It acknowledges synchronously, guards reentrancy independently of disabled controls, and waits through a browser paint opportunity before expensive UI work. Measurable counts come only from existing queues/selections. Status remains until another action; errors never auto-dismiss. Cancellation is exposed only by workflows that already support it.

Backups retain full validation and existing writer transactions. Restoration retains the stale confirmation check and distinguishes an already committed restore from a failed post-restore view reload. Page-local conflict guards are supplemented at the actual privileged restore dispatch boundary where necessary; they do not form another persistence system.

## Planned phases

1. Inventory (this document).
2. Shared controller, accessible status and scoped controls, focused tests.
3. Initial load/refresh state and retry; navigation/coalescing tests.
4. Export lifecycle and download handoff tests.
5. Restore/clear lifecycle and critical-operation guards; synthetic data preservation tests.
6. Provider, scan, enrichment and editing integration using existing progress.
7. Identical synthetic empty/1k/5k/14k cold/warm measurements; optimize only demonstrated redundant UI work.
8. Disposable packaged Chrome/Firefox delayed-operation, failure, navigation, width and accessibility checks.
9. Normal suite, package/hygiene checks, user documentation and measured report.

Timing fixtures and run reports remain in ignored `audit-artifacts/operation-feedback/`. Neither private backups nor the recovery candidate are inputs to this task.
