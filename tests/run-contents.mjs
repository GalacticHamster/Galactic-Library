// Offline unit selection: contents/parser/manifest and their persistence controls.
// No packaging, browser, companion, live acquisition or unrelated provider suites.
import {boundedManifestTests} from './manifest-bounded-regressions.js';
import {contentsPrecisionContextTests} from './contents-precision-context.js';
import {numberedWrapperTests} from './numbered-wrappers.js';
import {inferredCoverageTests} from './inferred-coverage.js';
import {collectionOverlapTests} from './collection-overlap.js';
import {kindleManifestTests} from './kindle-manifest.js';
import {kindleWholeManifestTests} from './kindle-whole-manifest.js';
import {kindleContentsTests} from './kindle-contents.js';
import {kindleContentsQualityTests} from './kindle-contents-quality.js';
import {contentsParserV4Tests} from './contents-parser-v4.js';
import {numberedPrecisionCases} from './contents-numbered-precision-fixture.js';
import {independentEvidenceTests} from './kindle-independent-evidence.js';
import {kindleSourceCaptureTests} from './kindle-source-capture.js';
import {parentScopedComponentCases} from './parent-scoped-components-fixture.js';
globalThis.fetch=()=>{throw Error('Live requests are forbidden in the offline contents unit suite.');};
const tests=process.argv.includes('--focused')?[...numberedWrapperTests,...contentsPrecisionContextTests,...boundedManifestTests]:[...numberedWrapperTests,...contentsPrecisionContextTests,...boundedManifestTests,...kindleManifestTests,...kindleWholeManifestTests,...kindleContentsTests,...kindleContentsQualityTests,...contentsParserV4Tests,...numberedPrecisionCases,...independentEvidenceTests,...kindleSourceCaptureTests,...parentScopedComponentCases];
let failed=0;
tests.push(...inferredCoverageTests);
tests.push(...collectionOverlapTests);
for(const [name,run]of tests){try{await run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`${tests.length-failed}/${tests.length} contents tests passed.`);
if(failed)process.exitCode=1;
