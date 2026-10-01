# Comic/manga enrichment

Database schema 5 retains candidate reviews and source-selection history in backups. Earlier schemas remain readable. Provider data stays intact; enrichment is separate source evidence.

Google Books automatic selection requires one unambiguous candidate, compatible identifiers and edition evidence, and a validated ISBN or matching title and author. Numbered volumes cannot automatically use another volume or an unnumbered series; substantive parenthetical numbers and qualifiers are retained. Multiple plausible results require review, even when title and author agree.

All books missing Google Books edition metadata can enter discovery, including records without authors. Searches use available series/unit and publisher evidence. Authorless discoveries require human edition confirmation. Candidate rows show title, subtitle, authors, publisher, language and ISBNs; known edition conflicts block selection. Declined candidates remain in the database for later review and survive backup/restore.

Open Library selections are work evidence. Newly confirmed work authors and publishers can improve subsequent searches. Its aggregate work ISBN list never identifies the owned edition. Legacy selections without an explicit approval remain visible but do not silently supply authoritative authors; review and apply them again to confirm.

Genre hints, work identity, edition metadata, creators and verified contents have separate completion states. A genre hint cannot exclude a book from edition enrichment. Lookup success does not prove ownership or complete collected contents.

Each source selection records its source identity/URL, retrieval date, match basis and human-approval state. The evidence table associates every stored field with that source and displays differing provider values. Undo restores the previous source selection without altering provider fields. An older selection cannot undo a newer one. Record references prevent a delayed selection from applying to another account's record with a reused provider ID.

Automated lookups checkpoint up to five outcomes with one database write and one UI refresh per batch. The same write stores progress and source selections, so a failed write does not advance the cursor. A worker-owned two-minute lease prevents competing options pages from running or resetting an active job. Heartbeats renew it while scanning; a closed page can be resumed after expiration. Clear and restore invalidate the job. Each checkpoint also checks the current record references, titles and source observation dates, and skips records changed during the lookup. Public enrichment requests are serialized, spaced by at least 1.2 seconds, and time out after 20 seconds.
