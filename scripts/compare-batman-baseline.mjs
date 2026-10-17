import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workloadDir = join(root, 'audit-artifacts', 'batman-workload');
const baselinePath = join(root, 'tests', 'fixtures', 'batman-bundle-baseline.json');

export function compareBatmanBaseline({ updateApprovedBaseline = false, thresholdPct = null } = {}) {
  console.log('========================================================================================');
  console.log('                 BATMAN BUNDLE REGRESSION & BASELINE COMPARISON                        ');
  console.log('========================================================================================\n');

  if (!existsSync(baselinePath)) {
    throw new Error(`CRITICAL: Baseline file missing at ${baselinePath}`);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const browserResultsPath = join(workloadDir, 'browser-replay-results.json');
  const glResultsPath = join(workloadDir, 'gl-replay-results.json');

  const hasBrowserResults = existsSync(browserResultsPath);
  const hasGlResults = existsSync(glResultsPath);

  if (!hasBrowserResults && !hasGlResults) {
    throw new Error('No replay results found. Run scripts/replay-batman-browser.mjs or scripts/replay-batman-gl.mjs first.');
  }

  const browserResults = hasBrowserResults ? JSON.parse(readFileSync(browserResultsPath, 'utf8')) : null;
  const glResults = hasGlResults ? JSON.parse(readFileSync(glResultsPath, 'utf8')) : null;

  const maxRegressionPct = thresholdPct ?? baseline.regressionPolicy?.maxAllowableRegressionPct ?? 20.0;
  let regressions = 0;
  let checksPassed = 0;

  console.log(`Configured regression threshold: +${maxRegressionPct.toFixed(1)}% above approved baseline medians.\n`);

  // Documented environment note for Test B
  console.log('ℹ️  ENVIRONMENT NOTE (Test B vs Live Website):');
  console.log('   Test B reproduces matching, messaging, and rendering in an offline browser extension context.');
  console.log('   It does NOT reproduce the live Humble website\'s approximately two seconds of network asset');
  console.log('   fetching, tracking scripts, and hydration/preparation overhead. Historical live measurements');
  console.log('   (~11.79s cold, ~4.31s warm) are retained for historical context only.\n');

  // 1. HARD FAILURE: Parity checks
  console.log('----------------------------------------------------------------------------------------');
  console.log('1. Hard Parity Verification (Zero-Tolerance Gate)');
  console.log('----------------------------------------------------------------------------------------');

  if (browserResults) {
    const reqParity = browserResults.parity?.requestItemEquality || '';
    const resParity = browserResults.parity?.responseParity || '';
    if (!reqParity.includes('100.0%')) {
      throw new Error(`CRITICAL HARD FAILURE: Request payload equality mismatch: ${reqParity}`);
    }
    if (!resParity.includes('100.0%')) {
      throw new Error(`CRITICAL HARD FAILURE: Matching response parity mismatch: ${resParity}`);
    }
    console.log(` ✅ Browser Replay Request Equality : ${reqParity}`);
    console.log(` ✅ Browser Replay Response Parity   : ${resParity}`);
    checksPassed += 2;
  }

  if (glResults) {
    const glParity = glResults.parity?.percentage || '';
    const identical = glResults.parity?.identicalResults;
    const total = glResults.parity?.totalItems;
    if (identical !== total || !glParity.includes('100.0%')) {
      throw new Error(`CRITICAL HARD FAILURE: Isolated GL replay parity mismatch: ${identical}/${total} (${glParity})`);
    }
    console.log(` ✅ GL Isolated Response Parity     : 100.0% (${identical}/${total} identical results)`);
    checksPassed++;
  }

  function evaluateMetric(testName, label, measuredStats, approvedMedian) {
    const measuredMedian = measuredStats.median;
    const diff = measuredMedian - approvedMedian;
    const pct = ((diff / approvedMedian) * 100);
    const sign = diff >= 0 ? '+' : '';
    const maxAllowed = approvedMedian * (1 + maxRegressionPct / 100);
    const isPass = measuredMedian <= maxAllowed;

    const range = (measuredStats.max - measuredStats.min).toFixed(1);
    const varianceStr = `range: ${measuredStats.min.toFixed(1)}-${measuredStats.max.toFixed(1)}ms (spread: ${range}ms), p95: ${measuredStats.p95.toFixed(1)}ms`;

    if (isPass) {
      checksPassed++;
      console.log(` ✅ [${testName}] ${label.padEnd(25)}: ${measuredMedian.toFixed(1)}ms (approved: ${approvedMedian.toFixed(1)}ms, delta: ${sign}${diff.toFixed(1)}ms / ${sign}${pct.toFixed(1)}%, limit: ${maxAllowed.toFixed(1)}ms) [PASS]`);
      console.log(`     └─ Variance: ${varianceStr}`);
    } else {
      regressions++;
      console.error(` ❌ [${testName}] ${label.padEnd(25)}: ${measuredMedian.toFixed(1)}ms (approved: ${approvedMedian.toFixed(1)}ms, delta: ${sign}${diff.toFixed(1)}ms / ${sign}${pct.toFixed(1)}%, limit: ${maxAllowed.toFixed(1)}ms) [REGRESSION]`);
      console.error(`     └─ Variance: ${varianceStr}`);
    }
  }

  // 2. Test A Comparison
  if (glResults && baseline.approvedBaselines?.testA) {
    const exp = baseline.approvedBaselines.testA;
    const c = glResults.summary.cold;
    const w = glResults.summary.warm;

    console.log('\n----------------------------------------------------------------------------------------');
    console.log('2. Test A: Isolated GL Service Worker Replay (Direct CDP)');
    console.log('----------------------------------------------------------------------------------------');
    evaluateMetric('Test A', 'Cold GL Total', c.totalMs, exp.cold.totalMs.median);
    evaluateMetric('Test A', 'Cold Matching Exec', c.matchingExecutionMs, exp.cold.matchingExecutionMs.median);
    evaluateMetric('Test A', 'Warm GL Total', w.totalMs, exp.warm.totalMs.median);
    evaluateMetric('Test A', 'Warm Matching Exec', w.matchingExecutionMs, exp.warm.matchingExecutionMs.median);
  }

  // 3. Test B Comparison
  if (browserResults && baseline.approvedBaselines?.testB) {
    const exp = baseline.approvedBaselines.testB;
    const c = browserResults.summary.cold;
    const w = browserResults.summary.warm;

    console.log('\n----------------------------------------------------------------------------------------');
    console.log('3. Test B: HB + GL Browser Integration Replay (Offline Extension Pipeline)');
    console.log('----------------------------------------------------------------------------------------');
    evaluateMetric('Test B', 'Cold Page-to-Rendered', c.pageToRenderedMs, exp.cold.pageToRenderedMs.median);
    evaluateMetric('Test B', 'Cold GL Round Trip', c.glRoundTripMs, exp.cold.glRoundTripMs.median);
    evaluateMetric('Test B', 'Cold GL Total', c.glTotalMs, exp.cold.glTotalMs.median);
    evaluateMetric('Test B', 'Cold Snapshot Read', c.snapshotReadMs, exp.cold.snapshotReadMs.median);
    evaluateMetric('Test B', 'Cold Index Build', c.matchingIndexBuildMs, exp.cold.matchingIndexBuildMs.median);
    evaluateMetric('Test B', 'Cold Matching Exec', c.matchingExecutionMs, exp.cold.matchingExecutionMs.median);

    evaluateMetric('Test B', 'Warm Page-to-Rendered', w.pageToRenderedMs, exp.warm.pageToRenderedMs.median);
    evaluateMetric('Test B', 'Warm GL Round Trip', w.glRoundTripMs, exp.warm.glRoundTripMs.median);
    evaluateMetric('Test B', 'Warm GL Total', w.glTotalMs, exp.warm.glTotalMs.median);
    evaluateMetric('Test B', 'Warm Matching Exec', w.matchingExecutionMs, exp.warm.matchingExecutionMs.median);
  }

  // 4. Historical Live Reference
  console.log('\n----------------------------------------------------------------------------------------');
  console.log('4. Historical Live Batman Bundle Context (Informational Reference Only)');
  console.log('----------------------------------------------------------------------------------------');
  const live = baseline.historicalLiveReference;
  console.log(`   Live Cold HB Timing Window : ${live.hbTimingWindow.coldPageToRenderedMs.toFixed(1)}ms (~11.79s with network/CDN & React hydration)`);
  console.log(`   Live Cold GL Total         : ${live.glServer.coldTotalMs.toFixed(1)}ms (GL worker match duration)`);
  console.log(`   Live Warm HB Timing Window : ${live.hbTimingWindow.warmPageToRenderedMs.toFixed(1)}ms (~4.31s with network/CDN & React hydration)`);
  console.log(`   Live Warm GL Total         : ${live.glServer.warmTotalMs.toFixed(1)}ms (GL worker match duration)`);

  // 5. Baseline Protection
  console.log('\n----------------------------------------------------------------------------------------');
  console.log('5. Baseline Protection Status');
  console.log('----------------------------------------------------------------------------------------');
  if (updateApprovedBaseline) {
    console.log('⚠️  AUTHORIZATION DETECTED: --update-approved-baseline flag provided.');
    console.log('Updating approved baselines in tests/fixtures/batman-bundle-baseline.json...');

    if (glResults) {
      baseline.approvedBaselines.testA = {
        name: 'Isolated GL Replay (CDP Direct)',
        description: 'Measures GL MV3 service worker matching performance directly via CDP from an authorized caller extension.',
        cold: glResults.summary.cold,
        warm: glResults.summary.warm
      };
    }
    if (browserResults) {
      baseline.approvedBaselines.testB = {
        name: 'Humble Bundle + Galactic Library Browser Integration Replay',
        description: 'Reproduces matching, messaging, and rendering in an offline browser extension context. Note: Test B does not reproduce the live Humble website\'s approximately two seconds of network asset fetching, tracking scripts, and hydration/preparation overhead.',
        cold: browserResults.summary.cold,
        warm: browserResults.summary.warm
      };
    }
    baseline.lastUpdated = new Date().toISOString();
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    console.log(`✅ Approved baseline successfully updated at: ${baselinePath}`);
  } else {
    console.log('🔒 Baseline Protection: Approved baseline fixture in tests/fixtures/batman-bundle-baseline.json is preserved (read-only).');
    console.log('   (To update approved values, explicitly pass --update-approved-baseline).');
  }

  console.log('\n========================================================================================');
  console.log(` SUMMARY: ${checksPassed} checks passed, ${regressions} regressions detected.`);
  console.log('========================================================================================\n');

  if (regressions > 0) {
    throw new Error(`Performance regression detected: ${regressions} metrics exceeded allowable regression threshold (+${maxRegressionPct}%).`);
  }

  return { checksPassed, regressions };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const update = process.argv.includes('--update-approved-baseline');
  const thresholdArg = process.argv.find(a => a.startsWith('--threshold-pct='));
  const thresholdPct = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : null;

  try {
    compareBatmanBaseline({ updateApprovedBaseline: update, thresholdPct });
  } catch (err) {
    console.error('Baseline comparison failed:', err.message);
    process.exit(1);
  }
}
