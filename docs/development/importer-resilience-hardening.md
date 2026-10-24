# Importer resilience hardening — deferred

Planning only, October 24, 2026. This is not a new 1.0 blocker or authorization
to rewrite the importers. The focused Steam repair is documented separately in
[Steam outcomes](steam-outcome-diagnostics.md); release status remains in the
[release checklist](1.0-release-checklist.md).

## Confirmed Amazon Games lessons

The B2 investigation demonstrated these failures with user screenshots, sanitized
scan reports, backup comparisons and disposable fixtures:

- External code routes use both **Claim Code** and **Copy Code**. Neither proves
  redemption or an Amazon Games entitlement. Instructions can identify another
  storefront; GL must not count that storefront's game as an Amazon purchase.
- **Undeliverable** is a real collection state, distinct from **Delivered**.
  External failed deliveries remain excluded; insufficient evidence stays
  unconfirmed. A new uncertain observation cannot by itself revoke an earlier
  supported entitlement or override the user's correction.
- Linked accordion details arrive asynchronously. A destination can be readable
  before **Collected on**. Stopping as soon as the destination appeared lost the
  date. Flattened text also failed to read dates present in their labeled fields.
  Missing dates must stay missing, not become scan dates.
- Accordion DOM IDs changed as cards were rendered again. Treating those IDs as
  durable claims inflated the Firefox import to 1,401 records: 1,400 confirmed
  observations of the same 188 titles plus one unconfirmed delivery. Chrome's
  historical 203 records already included repetitions. This was not 1,198 newly
  purchased games, nor evidence that all external codes were being imported.
- Unknown delivery labels could abort an entire import. This protected against
  unsafe replacement but made individual unfamiliar states unnecessarily costly.
  Recognized failed deliveries now have conservative handling. Arbitrary unknown
  states still require evidence; accepting every new label would be unsafe.
- A permanent claim describes acquisition provenance. Confirmed permanent access
  uses **Owned**, with claim provenance retained separately. It does not establish
  redemption at GOG, Epic, Xbox or another destination.
- Internal counts and developer terminology leaked into ordinary progress and
  success messages. Explain what was saved, uncertainty and the next action in
  normal language; keep implementation details in deliberate troubleshooting.

B2's live identity/date repair is verified in the saved Firefox export: 189
stable entries, all dated, with earlier repeated observations archived. This
planning document does not reopen that importer or change its implementation.
Owned-normalization inspection and Chrome parity retain their independent
checklist status. Rendering changes, new locales and future unknown labels are
risks to test, not additional observed defects.

## Principles for a bounded future pass

Be strict about ownership evidence and collection completeness, but tolerant of
unfamiliar presentation details where trustworthy evidence remains available.

1. Separate record-level uncertainty from collection-level failure. Missing
   optional metadata need not invalidate a positively identified entitlement.
   Unknown access must not become Owned just because a title is readable.
2. Use provider/account-scoped stable identities. A temporary DOM ID is not a
   transaction. Repeated observations are not repeated acquisitions.
3. Keep incomplete scans additive or reject them before saving; never use an
   uncertain end condition for destructive replacement. Absence alone is not a
   refund, revocation or expired access.
4. Preserve earlier positive evidence against weaker observations while honoring
   explicit contradictory access evidence and authoritative user corrections.
5. Wait for the evidence the parser actually needs, with bounded asynchronous
   readiness checks. Do not substitute increasingly long unconditional sleeps.
6. Keep ordinary messages understandable. Diagnostics should contain bounded
   structural counts and timings, excluding titles, account details, credentials,
   raw bodies and redemption codes. Any optional ID sample needs separate consent
   and clear privacy wording; do not call such a sample anonymous.

These principles require provider-specific evidence. They are not permission to
accept every unfamiliar record, invent titles or weaken snapshot validation.

## Proposed mutation tests

Start with one real failure family and a minimal synthetic fixture. Reuse the
provider parser, actual writer, persistence reload and packaged browser tests.
Assert source IDs, effective access, dates, history, catalog links and unaffected
accounts, rather than only the final success message.

| Fixture mutation | Expected result when evidence remains trustworthy | Boundary requiring conservative handling or failure |
| --- | --- | --- |
| Rename a button/status; change capitalization or punctuation | Normal import if equivalent structured evidence still identifies the action/access | Unknown access stays unconfirmed; no title-only ownership inference |
| Reorder optional fields/cards | Same identities, dates and access | Missing collection membership/continuation evidence cannot certify a full replacement |
| Delay linked details or date separately | Normal import when required evidence becomes readable within the bound | Retain undated/unconfirmed records where supported; otherwise stop safely |
| Remove artwork or optional descriptive metadata | Normal import without fake substitutes | Missing stable identity/ownership evidence requires rejection or a deliberately supported unresolved representation |
| Introduce an unfamiliar delivery classification | Conservative retained entry if identity/completeness and uncertain access can be represented | Do not promote to Owned; fail before replacement if the model cannot safely retain it |
| Change transient DOM IDs | Same stable source/evidence group | Conflicting persistent identifiers or protected reviews must not be silently reconciled |
| Repeat the same card or scan | No extra acquisition/history entry | Distinct dates, editions, accounts and destinations remain distinct |
| Omit a page, contradict a total, repeat a cursor or supply invalid IDs | Safe failure; earlier library untouched | Never certify collection completeness from readable neighbors |
| Remove access evidence after an earlier confirmed observation | Preserve positive evidence against a merely weaker observation | Explicit return/revocation evidence is a different case and must retain precedence |

Tests must distinguish three outcomes: normal success, conservative partial or
additive success with retained uncertainty, and safe failure without destructive
replacement. Not every mutation should succeed.

## Trigger, priority and acceptance

- Trigger this work when a new live provider change reproduces a failure, or
  when release validation exposes a demonstrated missing safeguard.
- Prioritize Amazon Games' asynchronous linked-details/identity family and
  Steam's ownership-versus-metadata boundary based on the observed failures.
  Review Amazon Video traversal only if new evidence justifies reopening it.
  Do not mandate a pass over all 14 providers.
- First select a small mutation matrix for the affected provider, document the
  evidence required for each outcome, and reproduce the failure before fixing it.
- Acceptance: the selected mutations pass unit and packaged Chrome/Firefox
  persistence tests; account isolation, stable IDs, manual corrections, dates,
  duplicates and full-scan safety remain intact; live confirmation is reported
  separately. No new permissions, credentials or personal fixture inventories.
- Useful diagnostics: readiness phases, bounded retry counts, evidence presence,
  unique identity counts and termination reasons. Never export raw account pages.
- Outside scope: a shared importer framework, new storage architecture, blanket
  label heuristics, fuzzy identity repair, automatic cross-browser merges,
  purchase-history crawling or a comprehensive provider rewrite.

Recommendation: retain this as a follow-up task of moderate priority. The
historical failures justify targeted mutation tests when touching those paths;
they do not establish a new release blocker after the bounded fixes pass.
