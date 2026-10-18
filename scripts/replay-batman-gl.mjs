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

export async function runGlReplay({ coldRuns = 5, warmRuns = 10 } = {}) {
  console.log('=== Galactic Library Isolated Replay Harness (Test A) ===\n');

  if (!checkGitIgnored(workloadDir)) {
    throw new Error(`CRITICAL: Workload directory ${workloadDir} is not ignored by Git!`);
  }

  const baselinePath = join(root, 'tests', 'fixtures', 'batman-bundle-baseline.json');
  const workloadPath = join(workloadDir, 'batman-bundle-workload.json');
  const libraryPath = join(workloadDir, 'private-library.json');

  if (!existsSync(baselinePath)) {
    throw new Error(`CRITICAL: Baseline metadata fixture missing at ${baselinePath}`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  if (!existsSync(workloadPath)) {
    throw new Error(`CRITICAL FAILURE: Private workload fixture missing at ${workloadPath}. Never substitute synthetic data silently.`);
  }
  if (!existsSync(libraryPath)) {
    throw new Error(`CRITICAL FAILURE: Private library fixture missing at ${libraryPath}. Never substitute synthetic data silently.`);
  }

  const workloadRaw = readFileSync(workloadPath);
  const workloadHash = crypto.createHash('sha256').update(workloadRaw).digest('hex');
  if (baseline.fixtureHashes?.workload?.sha256 && baseline.fixtureHashes.workload.sha256 !== workloadHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on workload JSON. Expected ${baseline.fixtureHashes.workload.sha256}, got ${workloadHash}. Never substitute synthetic data silently.`);
  }

  const privateLibRaw = readFileSync(libraryPath, 'utf8');
  const libraryHash = crypto.createHash('sha256').update(Buffer.from(privateLibRaw, 'utf8')).digest('hex');
  if (baseline.fixtureHashes?.library?.sha256 && baseline.fixtureHashes.library.sha256 !== libraryHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on private library fixture. Expected ${baseline.fixtureHashes.library.sha256}, got ${libraryHash}. Never substitute synthetic data silently.`);
  }

  const workload = JSON.parse(workloadRaw.toString('utf8'));

  const temporary = await mkdtemp(join(tmpdir(), 'gl-batman-replay-'));
  let child;

  try {
    console.log('1. Packaging GL release...');
    const stage = join(temporary, 'gl-extension');
    const release = await createRelease(root);
    for (const [name, data] of readRuntimeZip(release.zip)) {
      const file = join(stage, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    }

    // Embed private library fixture in unpacked extension folder for direct in-browser fetch
    await writeFile(join(stage, 'private-library-fixture.json'), privateLibRaw, 'utf8');

    // Create companion caller extension
    const callerStage = join(temporary, 'caller-extension');
    await mkdir(callerStage, { recursive: true });
    await writeFile(join(callerStage, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'Batman Replay Companion Caller',
      version: '1.0.0',
      background: { service_worker: 'background.js' }
    }, null, 2), 'utf8');
    await writeFile(join(callerStage, 'background.js'), '/* caller */', 'utf8');
    await writeFile(join(callerStage, 'caller.html'), '<!doctype html><html><body>caller</body></html>', 'utf8');

    console.log('2. Launching headless Chrome via CDP pipe...');
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
    const glExt = await driver.send('Extensions.loadUnpacked', { path: stage });
    const callerExt = await driver.send('Extensions.loadUnpacked', { path: callerStage });
    console.log(`   - GL Extension ID:     ${glExt.id}`);
    console.log(`   - Caller Extension ID: ${callerExt.id}`);

    // Attach to GL Options to seed storage
    console.log('3. Seeding GL native storage...');
    const glPage = await driver.send('Target.createTarget', { url: `chrome-extension://${glExt.id}/options.html` });
    const { sessionId: glSession } = await driver.send('Target.attachToTarget', { targetId: glPage.targetId, flatten: true });
    await driver.send('Runtime.enable', {}, glSession);

    const evaluateGl = async script => {
      const r = await driver.send('Runtime.evaluate', {
        expression: '(async()=>{' + script + '})()',
        awaitPromise: true,
        returnByValue: true
      }, glSession);
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const ready = await evaluateGl(`return typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local) && Boolean(chrome?.runtime?.getURL);`);
        if (ready) break;
      } catch { }
      await new Promise(d => setTimeout(d, 100));
    }

    const populated = await evaluateGl(`
      const resp = await fetch(chrome.runtime.getURL('private-library-fixture.json'));
      const fixture = await resp.json();
      
      const allowed = new Set(fixture.local.galacticLibraryAllowedExternalClientIds || []);
      allowed.add('${callerExt.id}');
      fixture.local.galacticLibraryAllowedExternalClientIds = Array.from(allowed);

      delete fixture.local.galacticLibraryObservationHead;

      await chrome.storage.local.set(fixture.local);
      await chrome.storage.session.set(fixture.session);
      return {
        providerItems: Object.keys(fixture.local.galacticLibraryDatabase?.providerItems || {}).length,
        hasCert: Boolean(fixture.session.galacticLibraryValidationCertificate?.digest)
      };
    `);
    console.log(`   - Populated ${populated.providerItems} provider items, certificate present: ${populated.hasCert}`);

    await driver.send('Target.closeTarget', { targetId: glPage.targetId });

    // Open caller page
    const callerTarget = await driver.send('Target.createTarget', { url: `chrome-extension://${callerExt.id}/caller.html` });
    const { sessionId: callerSession } = await driver.send('Target.attachToTarget', { targetId: callerTarget.targetId, flatten: true });
    await driver.send('Runtime.enable', {}, callerSession);

    const evaluateCaller = async script => {
      const r = await driver.send('Runtime.evaluate', {
        expression: '(async()=>{' + script + '})()',
        awaitPromise: true,
        returnByValue: true
      }, callerSession);
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const ready = await evaluateCaller(`return typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.sendMessage);`);
        if (ready) break;
      } catch { }
      await new Promise(d => setTimeout(d, 100));
    }

    const sendMatchRequest = async (lookupId) => {
      return await evaluateCaller(`
        const glId = '${glExt.id}';
        const payload = ${JSON.stringify(workload.request)};
        const start = performance.now();
        const res = await chrome.runtime.sendMessage(glId, {
          ...payload,
          diagnosticLookupId: '${lookupId}',
          diagnosticSentEpochMs: Date.now()
        });
        const roundTripMs = performance.now() - start;
        return { roundTripMs, res };
      `);
    };

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

    // 4. Parity check on initial execution
    console.log('\n4. Verifying output parity against baseline capture...');
    const initialRun = await sendMatchRequest('lookup-000000000000-001');
    if (!initialRun.res?.ok) {
      throw new Error(`Initial match request failed: ${initialRun.res?.error || 'Unknown error'}`);
    }

    const actualResults = initialRun.res.results;
    const expectedResults = workload.response.results;

    assert.equal(actualResults.length, expectedResults.length, `Result count mismatch: expected ${expectedResults.length}, got ${actualResults.length}`);
    let parityMatches = 0;
    for (let i = 0; i < expectedResults.length; i++) {
      if (JSON.stringify(actualResults[i]) === JSON.stringify(expectedResults[i])) {
        parityMatches++;
      } else {
        console.error(`Mismatch at item ${i + 1} (${workload.request.items[i].title}):`);
        console.error('Expected:', JSON.stringify(expectedResults[i], null, 2));
        console.error('Actual:  ', JSON.stringify(actualResults[i], null, 2));
      }
    }

    assert.equal(parityMatches, expectedResults.length, `Parity check failed: only ${parityMatches}/${expectedResults.length} matched`);
    console.log(`✅ 100.0% Output Parity Verified: ${parityMatches}/${expectedResults.length} identical results`);

    // 5. Benchmark Execution
    const coldResults = [];
    const warmResults = [];

    console.log(`\n5. Executing ${coldRuns} COLD replay runs (explicit worker termination)...`);
    for (let i = 1; i <= coldRuns; i++) {
      await stopGlServiceWorker();
      const lookupId = `lookup-c01d00000000-${String(i).padStart(3, '0')}`;
      const outcome = await sendMatchRequest(lookupId);
      if (!outcome.res?.ok) throw new Error(`Cold run ${i} failed: ${outcome.res?.error}`);

      const perf = outcome.res.performance;
      const events = perf?.events || [];
      const entry = {
        iteration: i,
        workerId: perf?.worker,
        roundTripMs: outcome.roundTripMs,
        totalMs: perf?.totalMs ?? 0,
        snapshotReadMs: extractStageDuration(events, 'snapshot_read'),
        certSerializeMs: extractStageDuration(events, 'certificate_serialize'),
        certHashMs: extractStageDuration(events, 'certificate_hash'),
        snapshotCertMs: extractStageDuration(events, 'snapshot_certificate'),
        querySnapshotMs: extractStageDuration(events, 'query_snapshot'),
        matchingIndexBuildMs: extractStageDuration(events, 'matching_index_build'),
        matchingExecutionMs: extractStageDuration(events, 'matching_execution')
      };
      coldResults.push(entry);
      console.log(`   [Cold ${i}/${coldRuns}] Total: ${entry.totalMs.toFixed(1)}ms | Worker: ${entry.workerId} | Read: ${entry.snapshotReadMs.toFixed(1)}ms | Cert: ${entry.snapshotCertMs.toFixed(1)}ms | Index: ${entry.matchingIndexBuildMs.toFixed(1)}ms | Match: ${entry.matchingExecutionMs.toFixed(1)}ms`);
    }

    console.log(`\n6. Executing ${warmRuns} WARM replay runs (active worker reuse)...`);
    for (let i = 1; i <= warmRuns; i++) {
      const lookupId = `lookup-7a7000000000-${String(i).padStart(3, '0')}`;
      const outcome = await sendMatchRequest(lookupId);
      if (!outcome.res?.ok) throw new Error(`Warm run ${i} failed: ${outcome.res?.error}`);

      const perf = outcome.res.performance;
      const events = perf?.events || [];
      const entry = {
        iteration: i,
        workerId: perf?.worker,
        roundTripMs: outcome.roundTripMs,
        totalMs: perf?.totalMs ?? 0,
        matchingExecutionMs: extractStageDuration(events, 'matching_execution'),
        executionCpuMs: perf?.work?.execution?.cpuMs ?? 0,
        executionWaitMs: perf?.work?.execution?.waitMs ?? 0,
        executionYields: perf?.work?.execution?.yields ?? 0
      };
      warmResults.push(entry);
      console.log(`   [Warm ${i}/${warmRuns}] Total: ${entry.totalMs.toFixed(1)}ms | Match: ${entry.matchingExecutionMs.toFixed(1)}ms | CPU: ${entry.executionCpuMs.toFixed(1)}ms | Yields: ${entry.executionYields}`);
    }

    // Compute metrics
    const coldTotalStats = computeStats(coldResults.map(r => r.totalMs));
    const coldReadStats = computeStats(coldResults.map(r => r.snapshotReadMs));
    const coldCertStats = computeStats(coldResults.map(r => r.snapshotCertMs));
    const coldIndexStats = computeStats(coldResults.map(r => r.matchingIndexBuildMs));
    const coldExecStats = computeStats(coldResults.map(r => r.matchingExecutionMs));

    const warmTotalStats = computeStats(warmResults.map(r => r.totalMs));
    const warmExecStats = computeStats(warmResults.map(r => r.matchingExecutionMs));
    const warmCpuStats = computeStats(warmResults.map(r => r.executionCpuMs));
    const warmWaitStats = computeStats(warmResults.map(r => r.executionWaitMs));
    const warmYieldStats = computeStats(warmResults.map(r => r.executionYields));

    const report = {
      format: 1,
      generatedAt: new Date().toISOString(),
      commits: {
        galacticLibrary: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
      },
      parity: {
        totalItems: expectedResults.length,
        identicalResults: parityMatches,
        percentage: '100.0%'
      },
      summary: {
        cold: {
          runs: coldRuns,
          totalMs: coldTotalStats,
          snapshotReadMs: coldReadStats,
          snapshotCertMs: coldCertStats,
          matchingIndexBuildMs: coldIndexStats,
          matchingExecutionMs: coldExecStats
        },
        warm: {
          runs: warmRuns,
          totalMs: warmTotalStats,
          matchingExecutionMs: warmExecStats,
          executionCpuMs: warmCpuStats,
          executionWaitMs: warmWaitStats,
          executionYields: warmYieldStats
        }
      },
      runs: {
        cold: coldResults,
        warm: warmResults
      }
    };

    const outputPath = join(workloadDir, 'gl-replay-results.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\n📄 Machine-readable results saved to: audit-artifacts/batman-workload/gl-replay-results.json`);

    console.log('\n========================================================================================');
    console.log('                          GL REPLAY SUMMARY (BATMAN WORKLOAD)                          ');
    console.log('========================================================================================');
    console.log(` Output Parity:      100.0% (${parityMatches}/${expectedResults.length} identical results)`);
    if (coldRuns > 0) {
      console.log(` Cold Total:         ${coldTotalStats.median.toFixed(1)}ms median (${coldTotalStats.min.toFixed(1)} - ${coldTotalStats.max.toFixed(1)}ms, p95: ${coldTotalStats.p95.toFixed(1)}ms)`);
      console.log(`   - snapshot_read:    ${coldReadStats.median.toFixed(1)}ms`);
      console.log(`   - cert_verify:      ${coldCertStats.median.toFixed(1)}ms`);
      console.log(`   - index_build:      ${coldIndexStats.median.toFixed(1)}ms`);
      console.log(`   - matching_exec:    ${coldExecStats.median.toFixed(1)}ms`);
    }
    console.log(` Warm Total:         ${warmTotalStats.median.toFixed(1)}ms median (${warmTotalStats.min.toFixed(1)} - ${warmTotalStats.max.toFixed(1)}ms, p95: ${warmTotalStats.p95.toFixed(1)}ms)`);
    console.log(`   - matching_exec:    ${warmExecStats.median.toFixed(1)}ms (CPU: ${warmCpuStats.median.toFixed(1)}ms, yields: ${warmYieldStats.median.toFixed(0)}, wait: ${warmWaitStats.median.toFixed(1)}ms)`);
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
  const warmOnly = process.argv.includes('--warm-only');
  const coldRuns = warmOnly ? 0 : 5;
  const warmRuns = 10;
  runGlReplay({ coldRuns, warmRuns }).catch(err => {
    console.error('GL Replay Harness failed:', err);
    process.exit(1);
  });
}
