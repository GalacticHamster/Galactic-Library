// Offline architecture experiment only. No network, browser APIs or persistence.
// Run: node scripts/research/console-integration-boundaries.mjs
import assert from 'node:assert/strict';
import {PROVIDERS,OWNERSHIP_STATES} from '../../src/lib/constants.js';
import {normalizeProviderItem,createEmptyDatabase} from '../../src/lib/models.js';
import {validateMetadata} from '../../src/lib/metadata-validation.js';
import {sameEditionEvidence} from '../../src/lib/identity.js';
import {effectiveOwnershipRecord} from '../../src/lib/ownership.js';
import {createBackup,parseBackup} from '../../src/lib/storage.js';
import '../../src/providers/provider-snapshot.js';
let checks=0;
const check=(description,fn)=>{fn();checks++;console.log('PASS '+description);};
const base={provider:'gog',providerItemId:'research-only',title:'Synthetic Game',mediaType:'game',ownership:'owned',metadata:{edition:'deluxe'}};
for(const provider of ['xbox','playstation','nintendo'])check(provider+' requires explicit provider registration',()=>{
 assert(!PROVIDERS.includes(provider));assert.throws(()=>normalizeProviderItem({...base,provider}),/Unsupported provider/);
});
check('existing access states represent permanent, temporary and lost access independently',()=>{
 for(const state of ['owned','claimed','subscription','borrowed','unknown','returned','revoked','expired']){
  assert(OWNERSHIP_STATES.includes(state));const item=normalizeProviderItem({...base,ownership:state});
  assert.equal(effectiveOwnershipRecord(item,{}).ownership,state);
 }
});
check('new entitlement metadata needs a reviewed allowlist; arbitrary fields are discarded',()=>{
 assert.deepEqual(validateMetadata('gog',{acquisitionType:'Single',expiresAt:'2026-12-01T00:00:00Z',ownerNaId:'synthetic',subscriptionService:'PS_PLUS'}),{});
});
check('standard and deluxe products remain different',()=>{
 assert.equal(sameEditionEvidence(base,{...base,title:'Synthetic Game Deluxe Edition',metadata:{edition:'standard'}}),'');
});
check('platform alone is not currently an edition-conflict guard',()=>{
 // This documents an existing boundary, not permission to merge console SKUs.
 assert(sameEditionEvidence({...base,platform:['PC']},{...base,platform:['Console']}));
});
check('a supported-provider control survives the existing backup path',()=>{
 const database=createEmptyDatabase(),item=normalizeProviderItem(base);database.providerItems[item.id]=item;
 const restored=parseBackup(createBackup(database));
 assert(Object.values(restored.providerItems).some(row=>row.providerItemId===base.providerItemId&&row.metadata.edition==='deluxe'));
});
check('incomplete pagination cannot certify a destructive full snapshot',()=>{
 const P=globalThis.GalacticProviderSnapshot,items=[{providerItemId:'synthetic'}];
 assert.throws(()=>P.completeProviderSnapshot('console-research',items,[{...P.completedScope('visible',1,2),complete:false}]),/incomplete/);
 assert(P.completeProviderSnapshot('console-research',items,[P.completedScope('visible',1,1)]).complete);
});
console.log(`${checks} offline boundary checks passed. No console account or acquisition method was tested.`);
