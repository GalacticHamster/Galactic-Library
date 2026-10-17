import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { strictDatabaseSerialization } from '../src/lib/validation-certificate.js';
import { handleExternalApiRequestAsync } from '../src/lib/external-api.js';

const root = path.resolve(import.meta.dirname, '..');
const workloadDir = path.join(root, 'audit-artifacts', 'batman-workload');
const baselinePath = path.join(root, 'tests', 'fixtures', 'batman-bundle-baseline.json');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function checkGitIgnored(filePath) {
  try {
    const rel = path.relative(root, filePath);
    const output = execFileSync('git', ['check-ignore', '-v', rel], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    return Boolean(output);
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Batman Workload Verification ===\n');

  if (!fs.existsSync(workloadDir)) {
    throw new Error(`CRITICAL FAILURE: Workload directory not found at ${workloadDir}. Never substitute synthetic data silently.`);
  }

  // 1. Git ignore safety verification
  const isIgnored = checkGitIgnored(path.join(workloadDir, 'test.json'));
  if (!isIgnored) {
    throw new Error(`CRITICAL SECURITY FAILURE: ${workloadDir} is NOT ignored by Git! Halting.`);
  }
  console.log(`✅ Git ignore verified: ${path.relative(root, workloadDir)} is ignored.`);

  const workloadPath = path.join(workloadDir, 'batman-bundle-workload.json');
  const pagePath = path.join(workloadDir, 'batman-bundle-page.html');
  const libraryPath = path.join(workloadDir, 'private-library.json');

  if (!fs.existsSync(workloadPath)) {
    throw new Error(`CRITICAL FAILURE: Private workload JSON missing at ${workloadPath}. Never substitute synthetic data silently.`);
  }
  if (!fs.existsSync(pagePath)) {
    throw new Error(`CRITICAL FAILURE: Captured Batman bundle page HTML missing at ${pagePath}. Never substitute synthetic data silently.`);
  }
  if (!fs.existsSync(libraryPath)) {
    throw new Error(`CRITICAL FAILURE: Private library fixture missing at ${libraryPath}. Never substitute synthetic data silently.`);
  }

  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

  const manifest = {
    format: 1,
    verifiedAt: new Date().toISOString(),
    commits: {
      galacticLibrary: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
      humbleComicLibrary: (() => {
        try {
          return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(root, '../HB'), encoding: 'utf8', windowsHide: true }).trim();
        } catch { return 'unknown'; }
      })()
    },
    files: {},
    workloadMetrics: {},
    libraryMetrics: {},
    baselineParity: {}
  };

  // 2. Verify workload JSON (request & response)
  const workloadRaw = fs.readFileSync(workloadPath);
  const workloadHash = sha256(workloadRaw);
  manifest.files.workload = {
    filename: path.basename(workloadPath),
    sizeBytes: workloadRaw.length,
    sha256: workloadHash
  };

  if (baseline?.fixtureHashes?.workload?.sha256 && baseline.fixtureHashes.workload.sha256 !== workloadHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on workload JSON. Expected ${baseline.fixtureHashes.workload.sha256}, got ${workloadHash}.`);
  }

  const data = JSON.parse(workloadRaw.toString('utf8'));
  const request = data.request || data;
  const response = data.response;

  if (request.type !== 'MATCH_ITEMS') throw new Error(`Invalid request type: ${request.type}`);
  if (request.apiVersion !== 1) throw new Error(`Invalid request apiVersion: ${request.apiVersion}`);
  if (!Array.isArray(request.items)) throw new Error('request.items is not an array');

  const itemCount = request.items.length;
  const contentsCount = request.items.reduce((acc, item) => acc + (Array.isArray(item.contents) ? item.contents.length : 0), 0);
  const mediaTypes = [...new Set(request.items.map(i => i.mediaType || i.kind || 'unknown'))];

  if (itemCount !== 31) throw new Error(`Expected 31 items from baseline, found ${itemCount}`);
  if (contentsCount !== 2) throw new Error(`Expected 2 supplied contents entries from baseline, found ${contentsCount}`);

  console.log(`✅ Request payload verified:`);
  console.log(`   - Items: ${itemCount} (Expected: 31)`);
  console.log(`   - Supplied contents entries: ${contentsCount} (Expected: 2)`);
  console.log(`   - Media types: ${mediaTypes.join(', ')}`);

  manifest.workloadMetrics.itemCount = itemCount;
  manifest.workloadMetrics.contentsCount = contentsCount;
  manifest.workloadMetrics.mediaTypes = mediaTypes;

  if (!response || !response.ok || !Array.isArray(response.results)) {
    throw new Error('Valid response with results array required in workload JSON');
  }

  const exactOnly = response.results.filter(r => (r.matches?.length > 0) && (!r.possibleMatches || r.possibleMatches.length === 0)).length;
  const bothMatchAndPossible = response.results.filter(r => (r.matches?.length > 0) && (r.possibleMatches?.length > 0)).length;
  const possibleOnly = response.results.filter(r => (!r.matches || r.matches.length === 0) && (r.possibleMatches?.length > 0)).length;
  const partial = response.results.filter(r => r.partialMatches?.length > 0).length;
  const unmatchedNew = response.results.filter(r => (!r.matches || r.matches.length === 0) && (!r.possibleMatches || r.possibleMatches.length === 0) && (!r.partialMatches || r.partialMatches.length === 0)).length;

  const totalMatches = response.results.filter(r => r.matches?.length > 0).length;
  const totalPossible = response.results.filter(r => r.possibleMatches?.length > 0).length;

  console.log(`✅ Response payload verified:`);
  console.log(`   - Results count: ${response.results.length}`);
  console.log(`   - Matches total: ${totalMatches} (${exactOnly} exact-only + ${bothMatchAndPossible} with related candidates)`);
  console.log(`   - Possible total: ${totalPossible} (${possibleOnly} possible-only + ${bothMatchAndPossible} overlapping matches)`);
  console.log(`   - Partial total: ${partial}`);
  console.log(`   - Unmatched (New): ${unmatchedNew}`);
  console.log(`   - Classified total: ${exactOnly + bothMatchAndPossible + possibleOnly + unmatchedNew} of ${response.results.length}`);

  manifest.workloadMetrics.responseResults = response.results.length;
  manifest.workloadMetrics.responseMatchesTotal = totalMatches;
  manifest.workloadMetrics.responsePossibleTotal = totalPossible;
  manifest.workloadMetrics.responsePartialTotal = partial;
  manifest.workloadMetrics.breakdown = {
    exactMatchOnly: exactOnly,
    bothMatchAndPossible: bothMatchAndPossible,
    possibleOnly: possibleOnly,
    partial: partial,
    unmatchedNew: unmatchedNew,
    total: response.results.length
  };

  // 3. Verify rendered DOM HTML
  const pageRaw = fs.readFileSync(pagePath);
  const pageHash = sha256(pageRaw);
  manifest.files.pageHtml = {
    filename: path.basename(pagePath),
    sizeBytes: pageRaw.length,
    sha256: pageHash
  };

  if (baseline?.fixtureHashes?.pageHtml?.sha256 && baseline.fixtureHashes.pageHtml.sha256 !== pageHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on page HTML. Expected ${baseline.fixtureHashes.pageHtml.sha256}, got ${pageHash}.`);
  }

  const html = pageRaw.toString('utf8');
  const hasWebpackData = html.includes('id="webpack-bundle-page-data"') || html.includes('id=\'webpack-bundle-page-data\'');
  const hasCovers = html.includes('item-image');
  console.log(`✅ Page HTML verified:`);
  console.log(`   - Size: ${(pageRaw.length / 1024).toFixed(1)} KB`);
  console.log(`   - Contains #webpack-bundle-page-data: ${hasWebpackData}`);
  console.log(`   - Contains cover item-images: ${hasCovers}`);
  manifest.workloadMetrics.hasWebpackData = hasWebpackData;
  manifest.workloadMetrics.hasCovers = hasCovers;

  // 4. Verify private library fixture and certificate consistency
  const libRaw = fs.readFileSync(libraryPath);
  const libHash = sha256(libRaw);
  manifest.files.library = {
    filename: path.basename(libraryPath),
    sizeBytes: libRaw.length,
    sha256: libHash
  };

  if (baseline?.fixtureHashes?.library?.sha256 && baseline.fixtureHashes.library.sha256 !== libHash) {
    throw new Error(`CRITICAL FAILURE: SHA-256 hash mismatch on private library fixture. Expected ${baseline.fixtureHashes.library.sha256}, got ${libHash}.`);
  }

  const libData = JSON.parse(libRaw.toString('utf8'));
  const db = libData.database || libData.local?.galacticLibraryDatabase || libData.galacticLibraryDatabase || libData;
  const cert = libData.session?.galacticLibraryValidationCertificate;
  const hasCert = Boolean(cert?.digest);
  const providerItemCount = Object.keys(db.providerItems || {}).length;
  const canonicalItemCount = Object.keys(db.canonicalItems || {}).length;

  console.log(`✅ Private library fixture verified:`);
  console.log(`   - Provider items: ${providerItemCount}`);
  console.log(`   - Canonical items: ${canonicalItemCount}`);
  console.log(`   - Session validation certificate present: ${hasCert}`);
  manifest.libraryMetrics.providerItemCount = providerItemCount;
  manifest.libraryMetrics.canonicalItemCount = canonicalItemCount;
  manifest.libraryMetrics.hasValidationCertificate = hasCert;

  if (hasCert) {
    const serialized = strictDatabaseSerialization(db);
    const computedDigest = sha256(Buffer.from(serialized, 'utf8'));
    const match = computedDigest === cert.digest;
    console.log(`   - Certificate digest verified against library data: ${match ? 'PASS (exact SHA-256 match)' : 'FAIL'}`);
    manifest.libraryMetrics.certificateConsistent = match;
    manifest.libraryMetrics.certificateDigest = cert.digest;
    if (!match) throw new Error('Validation certificate digest does not match computed library digest');
  }

  // 5. Offline matching parity against captured response
  console.log(`\n⏳ Running offline matching parity check against captured private library...`);
  const testResult = await handleExternalApiRequestAsync(db, request, {
    cacheImmutableRecords: true,
    cacheCommittedProjection: true
  });
  let identical = 0;
  for (let i = 0; i < request.items.length; i++) {
    if (JSON.stringify(testResult.results[i]) === JSON.stringify(response.results[i])) {
      identical++;
    }
  }
  console.log(`✅ Matching parity: ${identical}/${request.items.length} identical results`);
  manifest.baselineParity = {
    totalItems: request.items.length,
    identicalResults: identical,
    parityPercentage: ((identical / request.items.length) * 100).toFixed(1) + '%'
  };
  if (identical !== request.items.length) {
    throw new Error(`CRITICAL FAILURE: Parity mismatch: only ${identical}/${request.items.length} matched`);
  }

  // Write manifest
  const manifestPath = path.join(workloadDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\n📄 Manifest written to: ${path.relative(root, manifestPath)}`);
}

export async function verifyBatmanWorkload() {
  await main();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(err => {
    console.error('Verification failed:', err.message);
    process.exit(1);
  });
}
