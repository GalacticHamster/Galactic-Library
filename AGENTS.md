# Repository artifacts

Follow [docs/development/artifacts-and-audits.md](docs/development/artifacts-and-audits.md).

- Keep current documentation in the user-guide, architecture or development directories.
- Preserve selected architectural investigations under docs/audits; do not add every run report there.
- Commit only minimal regression/source inputs as fixtures. Never disguise complete audit outputs or personal inventories as fixtures.
- Write generated audit JSON/Markdown, traces, logs and private cleanup inventories under ignored audit-artifacts.
- Use scripts/audit-artifacts.mjs for audit output. Do not force-add generated output.
- Verify tests and packages from a checkout without ignored artifacts. Missing private input must not trigger network acquisition.
- Publication/history cleanup is a separately authorized task; do not rewrite history during ordinary hygiene work.

## Plain-language UI standard

Write every user-facing explanation for someone who understands the extension's purpose but not its implementation. Lead with the outcome, why it matters, whether data changed, and the next action. Use ordinary language; keep internal terms and raw counters in optional Technical details or exported reports. Distinguish titles, purchases and saved records; different totals do not prove missing purchases, and timestamp changes do not prove improved information. Describe read-only checks, offers, confirmed imports and store scans accurately. Explain errors with their impact and an actionable next step; never invent certainty.

Before committing changed UI text, check first-time comprehension, jargon, misleading claims, the next action, and zero/large/partial-failure cases. Failures are UX defects. Apply this review to GL, HB and FAN consistently.
