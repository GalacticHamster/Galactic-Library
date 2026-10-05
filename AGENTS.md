# Repository artifacts

Follow [docs/development/artifacts-and-audits.md](docs/development/artifacts-and-audits.md).

- Keep current documentation in the user-guide, architecture or development directories.
- Preserve selected architectural investigations under docs/audits; do not add every run report there.
- Commit only minimal regression/source inputs as fixtures. Never disguise complete audit outputs or personal inventories as fixtures.
- Write generated audit JSON/Markdown, traces, logs and private cleanup inventories under ignored audit-artifacts.
- Use scripts/audit-artifacts.mjs for audit output. Do not force-add generated output.
- Verify tests and packages from a checkout without ignored artifacts. Missing private input must not trigger network acquisition.
- Publication/history cleanup is a separately authorized task; do not rewrite history during ordinary hygiene work.
