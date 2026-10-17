import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRelease, readRuntimeZip } from './release.mjs';
import { chromePipe } from '../tests/native-protocol.mjs';

const root = resolve(import.meta.dirname, '..');
const hbRoot = resolve(root, '..', 'HB');
const workloadDir = join(root, 'audit-artifacts', 'batman-workload');

function checkGitIgnored(filePath) {
  try {
    const rel = join('audit-artifacts', 'batman-workload', 'test.json');
    const output = execFileSync('git', ['check-ignore', '-v', rel], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    return Boolean(output);
  } catch {
    return false;
  }
}

function computeStats(values) {
  if (!values.length) return { median: 0, min: 0, max: 0, p95: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return { median, min, max, p95, avg };
}

function extractStageDuration(events, stageName) {
  const match = events?.find(e => e.stage === stageName);
  return match ? match.durationMs : 0;
}

function hasStage(events, stageName) {
  return Boolean(events?.some(e => e.stage === stageName));
}

export async function runBrowserReplay({ coldRuns = 5, warmRuns = 10 } = {}) {
  console.log('=== Humble Bundle + Galactic Library Browser Replay Harness (Test B) ===\n');

  if (!checkGitIgnored(workloadDir)) {
    throw new Error(`CRITICAL: Workload directory ${workloadDir} is not ignored by Git!`);
  }

  const baselinePath = join(root, 'tests', 'fixtures', 'batman-bundle-baseline.json');
  const workloadPath = join(workloadDir, 'batman-bundle-workload.json');
  const pageHtmlPath = join(workloadDir, 'batman-bundle-page.html');
  const libraryPath = join(workloadDir, 'private-library.json');

  if (!existsSync(baselinePath)) {
    throw new Error(`CRITICAL: Baseline metadata fixture missing at ${baselinePath}`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  if (!existsSync(workloadPath)) {
    throw new Error(`CRITICAL FAILURE: Private workload fixture missing at ${workloadPath}. Never substitute synthetic data silently.`);
  }
  if (!existsSync(pageHtmlPath)) {
    throw new Error(`CRITICAL FAILURE: Captured Batman bundle page HTML missing at ${pageHtmlPath}. Never substitute synthetic data silently.`);
  }
  if (!existsSync(libraryPath)) {
    throw new Error(`CRITICAL FAILURE: Private library fixture missing at ${libraryPath}. Never substitute synthetic data silently.`);
  }

  const workloadRaw = readFileSync(workloadPath);
  const workloadHash = crypto.createHash('sha256').update(workloadRaw).digest('hex');
  if (baseline.fixtureHashes?.workload?.sha256 && baseline.fixtureHashes.workload.sha256 !== workloadHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on workload JSON. Expected ${baseline.fixtureHashes.workload.sha256}, got ${workloadHash}. Never substitute synthetic data silently.`);
  }

  const pageHtmlRaw = readFileSync(pageHtmlPath);
  const pageHtmlHash = crypto.createHash('sha256').update(pageHtmlRaw).digest('hex');
  if (baseline.fixtureHashes?.pageHtml?.sha256 && baseline.fixtureHashes.pageHtml.sha256 !== pageHtmlHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on page HTML. Expected ${baseline.fixtureHashes.pageHtml.sha256}, got ${pageHtmlHash}. Never substitute synthetic data silently.`);
  }

  const privateLibRaw = readFileSync(libraryPath, 'utf8');
  const libraryHash = crypto.createHash('sha256').update(Buffer.from(privateLibRaw, 'utf8')).digest('hex');
  if (baseline.fixtureHashes?.library?.sha256 && baseline.fixtureHashes.library.sha256 !== libraryHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on private library fixture. Expected ${baseline.fixtureHashes.library.sha256}, got ${libraryHash}. Never substitute synthetic data silently.`);
  }

  const workload = JSON.parse(workloadRaw.toString('utf8'));
  const capturedHtml = pageHtmlRaw.toString('utf8');

  const temporary = await mkdtemp(join(tmpdir(), 'hb-gl-batman-replay-'));
  let child;

  try {
    console.log('1. Packaging Galactic Library release...');
    const glStage = join(temporary, 'gl-extension');
    const glRelease = await createRelease(root);
    for (const [name, data] of readRuntimeZip(glRelease.zip)) {
      const file = join(glStage, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    }
    // Embed private library fixture in unpacked GL extension for in-browser fetch
    await writeFile(join(glStage, 'private-library-fixture.json'), privateLibRaw, 'utf8');

    console.log('2. Staging Humble Comic Library extension with captured Batman page...');
    const hbStage = join(temporary, 'hb-extension');
    const hbFiles = [
      'manifest.json', 'shared.js', 'background.js', 'entitlement-share.js',
      'collection-mappings.js', 'ownership.js', 'content.js', 'content.css',
      'options.html', 'options.js', 'popup.html', 'popup.js', 'ui.css',
      'purchase-snapshot.js', 'purchase-transfer.js', 'purchase-sync.js',
      'purchase-sync-ui.js', 'purchase-adapters.js', 'purchase-handoff-ui.js',
      'theme.js', 'theme.css', 'theme-app.css', 'theme-overlays.css',
      'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'
    ];
    for (const f of hbFiles) {
      const srcFile = join(hbRoot, f);
      if (existsSync(srcFile)) {
        const content = await readFile(srcFile);
        await mkdir(dirname(join(hbStage, f)), { recursive: true });
        await writeFile(join(hbStage, f), content);
      }
    }

    // Telemetry hook script (CSP compliant via external script in extension page)
    const hookContent = `
      window.__hclRuns = [];
      let currentRun = null;
      const pageLoadStart = performance.now();
      const _origSend = chrome.runtime.sendMessage;

      chrome.runtime.sendMessage = function(...args) {
        const payload = args.length >= 2 ? args[1] : args[0];
        if (payload?.type === 'MATCH_ITEMS') {
          currentRun = {
            pageStartMs: pageLoadStart,
            sendStartMs: performance.now(),
            preparationMs: payload.diagnosticHb?.preparationMs ?? (performance.now() - pageLoadStart),
            localStorageMs: payload.diagnosticHb?.localStorageMs ?? 0,
            req: JSON.parse(JSON.stringify(payload))
          };
        }
        const p = _origSend.apply(this, args);
        if (payload?.type === 'MATCH_ITEMS') {
          p.then(r => {
            if (currentRun) {
              currentRun.sendEndMs = performance.now();
              currentRun.glRoundTripMs = currentRun.sendEndMs - currentRun.sendStartMs;
              currentRun.res = JSON.parse(JSON.stringify(r));
            }
          });
        }
        if (payload?.type === 'MATCH_ITEMS_DIAGNOSTIC_RENDER') {
          if (currentRun) {
            currentRun.renderEndMs = performance.now();
            currentRun.postResponseMs = payload.diagnosticHb?.postResponseMs ?? (currentRun.renderEndMs - currentRun.sendEndMs);
            currentRun.pageToRenderedMs = payload.diagnosticHb?.pageToRenderedMs ?? (currentRun.renderEndMs - currentRun.pageStartMs);
            currentRun.renderOutcome = payload.diagnosticHb?.renderOutcome ?? 'rendered';
            window.__hclRuns.push(currentRun);
            currentRun = null;
          }
        }
        return p;
      };
    `;
    await writeFile(join(hbStage, 'telemetry-hook.js'), hookContent, 'utf8');

    // Prepare Batman bundle page HTML with HB stylesheets and scripts
    let testHtml = capturedHtml.replace('<head>', `<head>
  <link rel="stylesheet" href="/theme.css">
  <link rel="stylesheet" href="/content.css">
  <link rel="stylesheet" href="/theme-overlays.css">`);

    const scriptsToInject = `
  <script src="/telemetry-hook.js"></script>
  <script src="/theme.js"></script>
  <script src="/shared.js"></script>
  <script src="/collection-mappings.js"></script>
  <script src="/ownership.js"></script>
  <script src="/content.js"></script>
</body>`;

    testHtml = testHtml.replace('</body>', scriptsToInject);
    await mkdir(join(hbStage, 'books'), { recursive: true });
    await writeFile(join(hbStage, 'books', 'batman-bundle.html'), testHtml, 'utf8');

    console.log('3. Launching headless Chrome via CDP pipe...');
    const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    child = spawn(
      chromePath,
      [
        '--headless=new',
        '--no-first-run',
        '--disable-background-networking',
        '--user-data-dir=' + join(temporary, 'profile'),
        '--remote-debugging-pipe',
        '--enable-unsafe-extension-debugging',
        'about:blank'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] }
    );

    const driver = chromePipe(child, { timeoutMs: 120000 });
    const glExt = await driver.send('Extensions.loadUnpacked', { path: glStage });
    const hbExt = await driver.send('Extensions.loadUnpacked', { path: hbStage });
    console.log(`   - GL Extension ID: ${glExt.id}`);
    console.log(`   - HB Extension ID: ${hbExt.id}`);

    // Seed GL storage
    console.log('4. Seeding GL native storage...');
    const glPage = await driver.send('Target.createTarget', { url: `chrome-extension://${glExt.id}/options.html` });
    const { sessionId: glSession } = await driver.send('Target.attachToTarget', { targetId: glPage.targetId, flatten: true });
    await driver.send('Runtime.enable', {}, glSession);

    for (let attempt = 0; attempt < 50; attempt++) {
      const ready = await driver.send('Runtime.evaluate', {
        expression: 'Boolean(chrome?.storage?.local && chrome?.runtime?.getURL)',
        returnByValue: true
      }, glSession);
      if (ready.result.value) break;
      await new Promise(d => setTimeout(d, 100));
    }

    const populated = await driver.send('Runtime.evaluate', {
      expression: `(async () => {
        const resp = await fetch(chrome.runtime.getURL('private-library-fixture.json'));
        const fixture = await resp.json();
        
        const allowed = new Set(fixture.local.galacticLibraryAllowedExternalClientIds || []);
        allowed.add('${hbExt.id}');
        fixture.local.galacticLibraryAllowedExternalClientIds = Array.from(allowed);

        delete fixture.local.galacticLibraryObservationHead;

        await chrome.storage.local.set(fixture.local);
        await chrome.storage.session.set(fixture.session);
        return {
          providerItems: Object.keys(fixture.local.galacticLibraryDatabase?.providerItems || {}).length,
          hasCert: Boolean(fixture.session.galacticLibraryValidationCertificate?.digest)
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    }, glSession);
    console.log(`   - Populated ${populated.result.value.providerItems} provider items, certificate present: ${populated.result.value.hasCert}`);
    await driver.send('Target.closeTarget', { targetId: glPage.targetId });

    // Seed HB storage: set galacticLibraryExtensionId = glExt.id
    console.log('5. Configuring HB extension storage with GL Extension ID...');
    const hbOptions = await driver.send('Target.createTarget', { url: `chrome-extension://${hbExt.id}/options.html` });
    const { sessionId: hbOptSession } = await driver.send('Target.attachToTarget', { targetId: hbOptions.targetId, flatten: true });
    await driver.send('Runtime.enable', {}, hbOptSession);

    for (let attempt = 0; attempt < 50; attempt++) {
      const ready = await driver.send('Runtime.evaluate', {
        expression: 'Boolean(chrome?.storage?.local)',
        returnByValue: true
      }, hbOptSession);
      if (ready.result.value) break;
      await new Promise(d => setTimeout(d, 100));
    }

    await driver.send('Runtime.evaluate', {
      expression: `chrome.storage.local.set({ galacticLibraryExtensionId: '${glExt.id}' })`,
      awaitPromise: true,
      returnByValue: true
    }, hbOptSession);
    await driver.send('Target.closeTarget', { targetId: hbOptions.targetId });

    const stopGlServiceWorker = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const all = await driver.send('Target.getTargets');
        const sws = all.targetInfos.filter(t => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${glExt.id}/`));
        if (sws.length === 0) {
          return;
        }
        for (const sw of sws) {
          try {
            await driver.send('Target.closeTarget', { targetId: sw.targetId });
          } catch { }
        }
        await new Promise(d => setTimeout(d, 100));
      }
      throw new Error('Service worker failed to stop');
    };

    const runBrowserIteration = async ({ isCold }) => {
      if (isCold) {
        await stopGlServiceWorker();
      }
      const testUrl = `chrome-extension://${hbExt.id}/books/batman-bundle.html`;
      const pageTarget = await driver.send('Target.createTarget', { url: testUrl });
      const { sessionId: pageSession } = await driver.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
      await driver.send('Runtime.enable', {}, pageSession);

      let runData = null;
      for (let attempt = 0; attempt < 300; attempt++) {
        const check = await driver.send('Runtime.evaluate', {
          expression: `(() => {
            const summary = document.querySelector('#hcl-summary');
            const badges = document.querySelectorAll('.hcl-status-button, .hcl-match-badge');
            const run = window.__hclRuns?.[0];
            return {
              hasSummary: Boolean(summary),
              summaryText: summary?.textContent || '',
              badgeCount: badges.length,
              run
            };
          })()`,
          returnByValue: true
        }, pageSession);

        const val = check.result.value;
        if (val.hasSummary && val.badgeCount === 31 && val.run) {
          runData = val.run;
          runData.summaryText = val.summaryText;
          runData.badgeCount = val.badgeCount;
          break;
        }
        await new Promise(d => setTimeout(d, 100));
      }

      await driver.send('Target.closeTarget', { targetId: pageTarget.targetId });

      if (!runData) {
        throw new Error(`Browser replay iteration timed out waiting for matching and rendering`);
      }
      return runData;
    };

    // 6. Strict Parity and Payload Equality Verification
    console.log('\n6. Verifying request payload equality and response parity...');
    const initialRun = await runBrowserIteration({ isCold: true });
    
    // Request payload equality
    const actualReq = initialRun.req;
    assert.equal(actualReq.type, workload.request.type, 'Request type mismatch');
    assert.equal(actualReq.apiVersion, workload.request.apiVersion, 'ApiVersion mismatch');
    assert.equal(actualReq.items.length, workload.request.items.length, 'Item count mismatch');

    let reqMismatches = 0;
    for (let i = 0; i < workload.request.items.length; i++) {
      const exp = workload.request.items[i];
      const act = actualReq.items[i];
      if (JSON.stringify(exp) !== JSON.stringify(act)) {
        reqMismatches++;
        console.error(`Request item mismatch at index ${i}:`, { exp, act });
      }
    }
    assert.equal(reqMismatches, 0, `Request payload items mismatch: ${reqMismatches} differences`);
    console.log(`✅ 100.0% Exact Request Payload Equality: 31/31 items identical`);

    // Response results parity
    const actualResults = initialRun.res.results;
    const expectedResults = workload.response.results;
    assert.equal(actualResults.length, expectedResults.length, 'Response result count mismatch');

    let resMismatches = 0;
    for (let i = 0; i < expectedResults.length; i++) {
      const exp = expectedResults[i];
      const act = actualResults[i];
      if (JSON.stringify(exp) !== JSON.stringify(act)) {
        resMismatches++;
        console.error(`Response result mismatch at index ${i}:`, { exp, act });
      }
    }
    assert.equal(resMismatches, 0, `Response result parity mismatch: ${resMismatches} differences`);
    console.log(`✅ 100.0% Exact Response Result Parity: 31/31 results identical`);

    // 7. Benchmark Executions
    const coldResults = [];
    const warmResults = [];

    console.log(`\n7. Executing ${coldRuns} COLD browser replay runs (explicit worker termination)...`);
    let lastColdWorkerId = null;
    for (let i = 1; i <= coldRuns; i++) {
      const run = await runBrowserIteration({ isCold: true });
      const perf = run.res?.performance;
      const events = perf?.events || [];
      const workerId = perf?.worker;

      // Verify cold run properties
      assert.notEqual(workerId, lastColdWorkerId, `Cold run ${i} must have spawned a new worker ID`);
      lastColdWorkerId = workerId;

      const snapshotReadMs = extractStageDuration(events, 'snapshot_read');
      const snapshotCertMs = extractStageDuration(events, 'snapshot_certificate');
      const matchingIndexBuildMs = extractStageDuration(events, 'matching_index_build');
      const matchingExecutionMs = extractStageDuration(events, 'matching_execution');

      assert(snapshotReadMs > 0, `Cold run ${i} must have executed snapshot_read`);
      assert(matchingIndexBuildMs > 0, `Cold run ${i} must have rebuilt matching index`);
      assert(!hasStage(events, 'snapshot_hit'), `Cold run ${i} must not hit snapshot cache`);
      assert(!hasStage(events, 'matching_index_hit'), `Cold run ${i} must not hit matching index cache`);

      const entry = {
        iteration: i,
        workerId,
        pageToRenderedMs: run.pageToRenderedMs,
        preparationMs: run.preparationMs,
        glRoundTripMs: run.glRoundTripMs,
        postResponseMs: run.postResponseMs,
        glTotalMs: perf?.totalMs ?? 0,
        snapshotReadMs,
        snapshotCertMs,
        matchingIndexBuildMs,
        matchingExecutionMs
      };
      coldResults.push(entry);
      console.log(`   [Cold ${i}/${coldRuns}] PageToRendered: ${entry.pageToRenderedMs.toFixed(1)}ms | Prep: ${entry.preparationMs.toFixed(1)}ms | GL RoundTrip: ${entry.glRoundTripMs.toFixed(1)}ms | PostResp: ${entry.postResponseMs.toFixed(1)}ms | GL Total: ${entry.glTotalMs.toFixed(1)}ms`);
    }

    console.log(`\n8. Executing ${warmRuns} WARM browser replay runs (active worker reuse)...`);
    let warmWorkerId = null;
    for (let i = 1; i <= warmRuns; i++) {
      const run = await runBrowserIteration({ isCold: false });
      const perf = run.res?.performance;
      const events = perf?.events || [];
      const workerId = perf?.worker;

      // Verify warm run properties
      if (!warmWorkerId) {
        warmWorkerId = workerId;
      } else {
        assert.equal(workerId, warmWorkerId, `Warm run ${i} must reuse the same worker ID`);
      }

      const snapshotReadMs = extractStageDuration(events, 'snapshot_read');
      const matchingIndexBuildMs = extractStageDuration(events, 'matching_index_build');
      const matchingExecutionMs = extractStageDuration(events, 'matching_execution');

      assert.equal(snapshotReadMs, 0, `Warm run ${i} must not execute snapshot_read`);
      assert.equal(matchingIndexBuildMs, 0, `Warm run ${i} must not rebuild matching index`);
      assert(hasStage(events, 'snapshot_hit'), `Warm run ${i} must hit snapshot cache`);
      assert(hasStage(events, 'matching_index_hit'), `Warm run ${i} must hit matching index cache`);

      const entry = {
        iteration: i,
        workerId,
        pageToRenderedMs: run.pageToRenderedMs,
        preparationMs: run.preparationMs,
        glRoundTripMs: run.glRoundTripMs,
        postResponseMs: run.postResponseMs,
        glTotalMs: perf?.totalMs ?? 0,
        matchingExecutionMs
      };
      warmResults.push(entry);
      console.log(`   [Warm ${i}/${warmRuns}] PageToRendered: ${entry.pageToRenderedMs.toFixed(1)}ms | Prep: ${entry.preparationMs.toFixed(1)}ms | GL RoundTrip: ${entry.glRoundTripMs.toFixed(1)}ms | PostResp: ${entry.postResponseMs.toFixed(1)}ms | GL Total: ${entry.glTotalMs.toFixed(1)}ms`);
    }

    // Compute summary metrics
    const report = {
      format: 1,
      generatedAt: new Date().toISOString(),
      commits: {
        galacticLibrary: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
        humbleComicLibrary: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: hbRoot, encoding: 'utf8', windowsHide: true }).trim()
      },
      parity: {
        requestItemCount: workload.request.items.length,
        requestItemEquality: '100.0% (31/31 identical items)',
        responseResultCount: expectedResults.length,
        responseParity: '100.0% (31/31 identical results)'
      },
      summary: {
        cold: {
          runs: coldRuns,
          pageToRenderedMs: computeStats(coldResults.map(r => r.pageToRenderedMs)),
          preparationMs: computeStats(coldResults.map(r => r.preparationMs)),
          glRoundTripMs: computeStats(coldResults.map(r => r.glRoundTripMs)),
          postResponseMs: computeStats(coldResults.map(r => r.postResponseMs)),
          glTotalMs: computeStats(coldResults.map(r => r.glTotalMs)),
          snapshotReadMs: computeStats(coldResults.map(r => r.snapshotReadMs)),
          snapshotCertMs: computeStats(coldResults.map(r => r.snapshotCertMs)),
          matchingIndexBuildMs: computeStats(coldResults.map(r => r.matchingIndexBuildMs)),
          matchingExecutionMs: computeStats(coldResults.map(r => r.matchingExecutionMs))
        },
        warm: {
          runs: warmRuns,
          pageToRenderedMs: computeStats(warmResults.map(r => r.pageToRenderedMs)),
          preparationMs: computeStats(warmResults.map(r => r.preparationMs)),
          glRoundTripMs: computeStats(warmResults.map(r => r.glRoundTripMs)),
          postResponseMs: computeStats(warmResults.map(r => r.postResponseMs)),
          glTotalMs: computeStats(warmResults.map(r => r.glTotalMs)),
          matchingExecutionMs: computeStats(warmResults.map(r => r.matchingExecutionMs))
        }
      },
      runs: {
        cold: coldResults,
        warm: warmResults
      }
    };

    const outputPath = join(workloadDir, 'browser-replay-results.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\n📄 Machine-readable results saved to: audit-artifacts/batman-workload/browser-replay-results.json`);

    const c = report.summary.cold;
    const w = report.summary.warm;

    console.log('\n========================================================================================');
    console.log('              HB + GL BROWSER INTEGRATION REPLAY SUMMARY (BATMAN WORKLOAD)              ');
    console.log('========================================================================================');
    console.log(` Parity:             100.0% Request Equality & 100.0% Response Parity (31/31)`);
    console.log(` Cold PageToRendered: ${c.pageToRenderedMs.median.toFixed(1)}ms median (${c.pageToRenderedMs.min.toFixed(1)} - ${c.pageToRenderedMs.max.toFixed(1)}ms, p95: ${c.pageToRenderedMs.p95.toFixed(1)}ms)`);
    console.log(`   - preparation:      ${c.preparationMs.median.toFixed(1)}ms`);
    console.log(`   - glRoundTrip:      ${c.glRoundTripMs.median.toFixed(1)}ms`);
    console.log(`       · snapshot_read:  ${c.snapshotReadMs.median.toFixed(1)}ms`);
    console.log(`       · cert_verify:    ${c.snapshotCertMs.median.toFixed(1)}ms`);
    console.log(`       · index_build:    ${c.matchingIndexBuildMs.median.toFixed(1)}ms`);
    console.log(`       · matching_exec:  ${c.matchingExecutionMs.median.toFixed(1)}ms`);
    console.log(`   - postResponseMs:   ${c.postResponseMs.median.toFixed(1)}ms`);
    console.log(` Warm PageToRendered: ${w.pageToRenderedMs.median.toFixed(1)}ms median (${w.pageToRenderedMs.min.toFixed(1)} - ${w.pageToRenderedMs.max.toFixed(1)}ms, p95: ${w.pageToRenderedMs.p95.toFixed(1)}ms)`);
    console.log(`   - preparation:      ${w.preparationMs.median.toFixed(1)}ms`);
    console.log(`   - glRoundTrip:      ${w.glRoundTripMs.median.toFixed(1)}ms`);
    console.log(`       · matching_exec:  ${w.matchingExecutionMs.median.toFixed(1)}ms (snapshot & index reused)`);
    console.log(`   - postResponseMs:   ${w.postResponseMs.median.toFixed(1)}ms`);
    console.log('========================================================================================\n');

    return report;

  } finally {
    if (child && child.exitCode === null) child.kill();
    if (resolve(temporary).startsWith(resolve(tmpdir()) + sep)) {
      await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runBrowserReplay().catch(err => {
    console.error('Browser Replay Harness failed:', err);
    process.exit(1);
  });
}
