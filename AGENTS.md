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

## Automatic purchase sync

Automatic local sharing defaults on under the versioned opt-out model. Legacy disabled/disconnected states are not explicit opt-outs. Preserve any new-model explicit opt-out across startup, reconnect and library restore. Trusted companion discovery never establishes provider-account equivalence: preserve stable account mappings, reverse-verified setup tickets and save-time permission guards. When there is exactly one provider account on each side, pair them automatically even when populated. Reuse verified mappings for multiple accounts; genuinely ambiguous or conflicting relationships require a decision. Single-account assignment is product policy, not proof of a provider login. Sync committed data additively and idempotently, keeping manual offers separate. Shared runtime/UI are authored in GalacticLibrary/shared and mirrored with its sync-companion-purchases script. Validate synthetic data in disposable browser profiles; never use an installed personal library as a test destination.

## Git identity hook

Install the version-controlled identity guard with `git config --local core.hooksPath .githooks`.
See [.githooks/README.md](.githooks/README.md) for installation, effective-identity checks and tests.

## Testing workflow

Rules:
- During development, run focused tests for the files and behaviors changed.
- Add integration runs when a change touches shared synchronization, account isolation, storage preservation or cross-extension behavior.
- Reserve the full Chrome+Firefox release battery for final release validation, significant architectural changes, or a focused failure that suggests a broader regression. Never rerun it automatically after each fix.
- Before starting any suite expected to take more than 15 minutes, state why it is needed and ask the owner.
- Never skip, delete or weaken tests to save time. Speed-ups must keep coverage.
- Focused passes are not release validation. Release gates remain unchanged.

Typical runtimes on the development machine:
- Development: `npm test` and `node --test tests/*.test.mjs` (about 1 min together), or a single test file.
- Integration: `node scripts/check-purchase-handoff-browser.mjs --native | --native-upgrade | --collision` (under 1 min each, add `--firefox`). Add `--automatic` (about 4 min) and the default manual-handoff mode (about 5-8 min) only when automatic sync or the manual handoff changes. Shared purchase files: `node scripts/sync-companion-purchases.mjs --check`.
- Release: all cross-extension modes in Chrome and Firefox plus the unit suites (about 25 min).
