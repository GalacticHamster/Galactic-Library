# Release packaging (GL-18)

For patch release candidates, keep published ZIPs and their reports unchanged.
Use the existing `createRelease` builder with a separate, new versioned output
directory (the default package command writes to `dist`). For example, from the
repository root:

```javascript
import {createRelease} from './scripts/release.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
const output = 'candidate-output/1.0.1'; // choose a new, untracked staging path
await mkdir(output, {recursive: true});
for (const target of ['chrome', 'firefox']) {
  const release = await createRelease(undefined, undefined, target);
  await writeFile(`${output}/GalacticLibrary-${release.report.version}${target === 'firefox' ? '-firefox' : ''}.zip`, release.zip, {flag: 'wx'});
}
```

Firefox output is an unsigned ZIP, not a signed production XPI. Keep the exact
source commit, source archive, build environment and hashes with the candidates.
GL/FAN builders normalize runtime text line endings; HB's PowerShell builder
preserves checkout bytes, so retain those bytes in its corresponding-source
archive when reproducing a candidate. No protocol/schema version changes are
needed for a package patch increment.

Run with Node 20 or newer; no npm dependencies are required:

```powershell
npm test
npm run package
npm run test:browser:release
npm run test:importers:release
```

`scripts/runtime-files.json` is the explicit, reviewed distribution allowlist. Add new runtime modules/assets to it when adding a feature. The builder never discovers files by recursively copying the repository. Only the manifest, options/popup pages and listed runtime scripts/styles/icon enter the ZIP. Backups, exports, personal notes, audit reports, docs, tests, build scripts, package metadata and Git files are excluded.

Outputs are `dist/GalacticLibrary-<manifest version>.zip`, its `.sha256` checksum and `dist/release-files.json` with each runtime file's size/hash. `dist/` is ignored by Git. `npm run check:package` validates without writing artifacts. The ZIP is an unpacked-extension distribution, not a signed CRX or a store upload. Extract it into a dedicated folder and select that folder with Chrome's Load unpacked control.

Packages use sorted paths, stored ZIP entries, fixed DOS-epoch timestamps and LF-normalized text. Identical runtime content yields identical ZIP bytes despite checkout line endings, file modification times, build time or machine paths. The report contains relative runtime paths only. Missing manifest resources, static/dynamic module imports, page assets and literal runtime URLs fail validation. Nonliteral dynamic imports require an explicit validator update. Directory junctions/symlinks cannot take an allowlisted file outside the project. File and archive bounds reject excessive inputs.

Core release tests verify deterministic content, exclusions, dependency failures, corrupt ZIP rejection, JavaScript syntax and escaping directory junctions. Chrome and Firefox fixtures in `--release` mode read production resources exclusively from the validated ZIP; developer fixtures and synthetic provider data remain outside it. This exercises the real options UI and all eleven provider panels with mocked extension storage/messages and synthetic HTTP responses, in a fresh temporary browser profile. It catches missing packaged dependencies without exposing personal accounts.

These are runtime UI/importer checks, not a signed-in provider scan, an installed-extension permission-prompt test or proof of OS notification delivery. Desktop reminder permission/revocation/dedup/failure behavior is separately tested with API stubs. Use the built ZIP for a manual installed-extension smoke check before distributing a release. Keep the manifest and `package.json` versions aligned when intentionally making a new version.

Firefox: `npm run package:firefox` creates the separate `-firefox.zip`, checksum and `release-files-firefox.json`. Only its manifest changes: stable Gecko ID, module background scripts and Firefox release metadata. Shared runtime assets remain identical. `npm run test:browser:firefox` and `npm run test:importers:firefox` read resources from that exact validated archive. `npm run test:firefox` checks actual installed private storage/background APIs, and `npm run test:firefox:companions` adds all three extensions and MAIN-world purchase injection. See [Firefox](../user-guide/firefox.md).
