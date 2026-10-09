# Application operation feedback

## Inventory and implementation plan

Code inspection on October 9, 2026. Durations below describe work, not measured production timings; the user reports 11+ seconds opening Library and 5-10 seconds exporting. All persistence still belongs to the serialized background writer. UI acknowledgements do not certify persistence.

| Operation / UI entry | Worker or local path | Existing feedback / failure | Required pattern and measurement | Duplicate / navigation / cancellation |
| --- | --- | --- | --- | --- |
| Options startup and retry | `getCommittedLibraryView`; committed snapshot read/certificate/full validation; `render` | Static loading text, retry on initial rejection; text hidden before rendering; secondary work blocks completion | Initial paint before dispatch; read/render timings; distinct loading/empty/error states | Coalesce initialization; tab navigation retains result; no cancellation |
| Toolbar summary | `getCommittedLibraryView`; local counts | Loading text and caught failure | Accessible loading text and paint before dispatch; committed read for read-only summary | Single invocation per page |
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

## Measured startup boundary

The synthetic 14k/13k Library control contains 3,000 G5 manifests/source baselines, 600 contents reviews and four remembered provider profiles. It measures page rendering against the real writer/validator with an in-page storage/clone transport fixture, not native extension storage or the user's production corpus. Initial results showed eager hidden Contents preparation and duplicate review before visible results. Contents sorting/filter preparation and provider-card/duplicate-review preparation now wait for their workspace. The shared Library retrieval projection remains required and is still built once per detached database view. Ownership/expiry and authoritative validation are not cached away.

Diagnostics separate `options_contents`, `options_projection`, `options_filter_controls` and `options_feedback_paint` from existing read/validation/canonical/render stages. Nested stages overlap and must not be summed as independent work. A synthetic worker shares the page thread, so its frame gaps cannot establish real background-worker/UI contention. Cold initialization includes validation; a warm same-worker view uses its existing committed snapshot. Extension reload/native transport costs require a live timing export and are not inferred from these controls.

Reproduce controls with `node tests/browser.js --operation-feedback --size=14000 --output=audit-artifacts/operation-feedback/run.json`; `--eager-ui-control` serves the pre-deferral UI at the local fixture boundary. It restores only the three measured eager work paths and does not alter production files or stored data.

## Implemented lifecycle and boundaries

`createOperation` owns tab-local start/running/settled state and restores controls in `finally`. `performAction` shares a submission guard between controls using the same form status. Two animation frames provide a paint opportunity before synchronous UI work; hidden pages do not wait for animation frames. This is scheduling, not a timed artificial delay. Optional cancellation requests an existing workflow's cancellation and settles only after acknowledgement.

The compact global summary retains active work across workspace navigation and retains a failed action even when an unrelated action succeeds. It publishes only operation text and identifiers, never database payloads. It is not a persisted operation log. Initial loading has its own panel, retry and coalescing, which remains visible through rendering; post-mutation reload waits for any pending earlier read before requesting the new view.

Export remains an authoritative queued read plus full backup validation, serialization and anchor handoff. Its final message certifies handoff only. Restore retains full validation, mandatory confirmation, a repeated authoritative stale-state comparison and the existing atomic writer. The writer rejects overlapping restore/clear requests and profile removal during replacement at admission, including requests from another page. It still orders unrelated mutations normally. A confirmed commit followed by a failed view reload is reported separately from uncertain completion.

Provider imports, Kindle refresh and Google Books batch processing retain their original acquisition controls, pacing, leases and saved checkpoints. Progress reconciliation errors retain the last known scan counts. Local actions expose phases/counts only where the underlying work actually provides them. Bounded local preview parsing and ordinary filters are immediate interactions rather than new asynchronous jobs.

Measured three paired 14k synthetic trials reduced median cold Library completion from 2,344.1 to 2,153.9 ms and warm completion from 915.4 to 614.8 ms. These compare eager secondary preparation with deferred preparation under the same new feedback lifecycle, not native production storage. The reported 11-second production startup was not reproduced. Required validation and Library projection remain; no stronger production speed claim follows from the controls.

`node scripts/benchmark-operation-paths.mjs` separately measures synthetic export/read/validation/serialization and import/restore stages without browser downloads or backup inputs. Outputs are ignored. Current user behavior is described in [loading and operation feedback](../user-guide/loading-and-operation-feedback.md).
