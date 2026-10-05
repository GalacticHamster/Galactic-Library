import {readFile} from 'node:fs/promises';
import {checkIndependentEvidence} from './kindle-independent-evidence-fixture.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle-independent-evidence.json',import.meta.url),'utf8'));
export const independentEvidenceTests=[['independent source review preserves primary proposals, provenance, scope and source boundaries',()=>checkIndependentEvidence(fixtures)]];
