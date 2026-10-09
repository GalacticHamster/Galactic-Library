# Loading, saving and backup feedback

When Galactic Library opens, **Loading your library** remains visible until the Library has been read and rendered. An empty-library message appears only after a successful load confirms there are no records. If loading fails, use **Try loading again**. Switching workspaces during loading keeps the same pending read.

Longer actions show text describing the current work and disable their initiating controls. A compact status above the navigation keeps that feedback visible when you switch workspaces. Errors stay visible until you retry the affected action; they do not disappear on a timer. Ordinary search, filters and pagination remain available without a blocking overlay.

## Exporting a backup

In Settings, **Export Library** shows preparation, validation and browser-handoff feedback. Repeated clicks while it is preparing do not start another export. The completion message means Galactic Library handed the download to your browser. Check your browser's downloads to confirm the file was saved: Galactic Library cannot detect a cancelled save dialog or a silently blocked anchor download.

## Restoring a backup

Selecting a file shows reading and validation feedback. It does **not** replace your library. A confirmation explains that restoring replaces the entire local library, including saved accounts and reviews; it does not merge two libraries. You can export your current backup before confirming, or cancel.

If your saved library changes while you review the confirmation, Galactic Library cancels that replacement and asks you to select the file again. After confirmation, the status shows restoration and then reloading. Keep the page open until this finishes. There is no promise that an uncompleted restore will resume after page closure or worker interruption.

If the status says the backup **was restored, but the Library view could not reload**, reload the Library view rather than restoring again. If restoration completion **could not be confirmed**, reload and inspect the library before retrying. These messages distinguish a view failure after a confirmed commit from an uncertain worker response. File-read or validation failures do not start a replacement.

Clear Library and another restore cannot run concurrently with an admitted library replacement. This safeguard also applies to another open GL page. Other edits retain the existing ordered writer behavior and confirmation checks.

## Provider scans, contents and enrichment

Provider imports run in their signed-in provider page and show that panel's existing status and counts. The Options page opens those pages; it does not silently start a scan. Kindle contents and Google Books lookups retain their existing queues, real counts and Pause/Resume controls. Counts describe actual work, not a simulated percentage.

If a progress refresh fails, the last known scan counts remain visible with an error. That does not mean the scan stopped or completed. Retry the progress refresh. Switching GL workspaces does not stop a scan, but acquisition still requires the relevant provider page to remain open. Follow the scan's existing pause/resume instructions before closing it.

Contents reviews, account changes, reading updates and metadata decisions show saving/applying feedback. Failed saves retain their error and return controls to a usable state. Feedback alone never verifies contents, establishes ownership or accepts metadata.

Operation feedback is page-local. Closing the page discards it. Existing background checkpoints remain the authority for resumable scans; ordinary saves and restores do not gain a new persistent operation journal. A busy indicator acknowledges work and does not promise that the browser will finish it by a particular deadline. Spinners respect reduced-motion preferences and status text remains available to assistive technology.
