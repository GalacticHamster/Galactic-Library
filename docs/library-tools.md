# Remaining Galactic Library features

## Unicode and alternate titles (GL-17)

Comparison keys preserve Unicode letters, combining marks, Japanese voicing and composed Korean. Latin accent simplification remains available without deleting script-specific marks. Stored original titles are unchanged.

Expand **Alternate titles and aliases** on a library card to add translations/transliterations and their source or explanation. These dated, record-scoped aliases generate Possible candidates only. Edition identifiers or reviewed edition relationships remain necessary for stronger claims. Known conflicting creators, runs and unit numbers still prevent unrelated aliases from supplying candidates. Aliases cannot attach to another account's record when a provider reuses its native ID. Database schema 7 preserves aliases and accepts schemas 1–6.

## Software (GL-12)

Software is a separate central media type, filter and count. Humble explicitly typed software products and software-bundle keys retain that classification even if a PDF booklet is included. OS/platform delivery alone does not infer software. Fanatical software/assets now survive the validated order projection. Use a full rescan to correct legacy game classifications; incompatible edition/content reviews are cleared when a record's media type changes, while its persistent reference stays stable.

The version 1 companion API advertises `software` in `GET_STATUS.capabilities.mediaTypes` and accepts software match requests. Software and games never match across types. Clients should check the advertised capability before enabling software requests. Exact product titles with compatible edition evidence can establish software ownership; different packages remain Possible.

## Purchase occurrences (GL-13)

Fanatical keeps one catalog product with multiple purchase occurrences. Each occurrence retains its bundle, purchase date and last observation, using opaque order/occurrence hashes instead of raw order IDs. The inspector lists every captured origin. Quick updates and same-profile full scans merge occurrences without overwriting earlier purchase evidence or double-counting an already seen occurrence. The acquisition date is the earliest known purchase. Missing origin evidence does not establish refund or revocation. Switching profiles archives the old provenance and never merges it into the new account.

A full rescan is needed to recover historical origins that older versions discarded. Stored metadata bounds still apply: at most 500 occurrences and 100 KB metadata per product; an over-limit import fails rather than truncating its provenance. Origin details stay out of companion responses and remain in local backups.
