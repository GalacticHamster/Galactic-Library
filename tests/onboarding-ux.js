import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {onboardingState} from '../src/ui/onboarding.js';
import {createEmptyDatabase,validateDatabase,normalizeProviderItem} from '../src/lib/models.js';
export const onboardingUxTests=[
 ['Empty first-run onboarding is separate from loading, filters and existing unnamed imports',()=>{
   assert.equal(onboardingState(null).empty,false);
   const empty=createEmptyDatabase();assert.equal(onboardingState(empty).firstRun,true);
   empty.schemaVersion=12;const i=normalizeProviderItem({provider:'kindle',providerItemId:'B000000001',title:'Example',mediaType:'book'});empty.providerItems[i.id]=i;empty.providers.kindle={fullSyncAt:'2026-10-01'};
   const migrated=validateDatabase(empty),state=onboardingState(migrated);assert.equal(state.firstRun,false);assert.equal(state.empty,false);assert.equal(state.unnamed,1);
   migrated.providerItems={};const importedEmpty=onboardingState(migrated);assert.equal(importedEmpty.empty,true);assert.equal(importedEmpty.firstRun,false);
 }],
 ['First-import and migrated-account instructions use existing confirmation controls and link to correct destinations',async()=>{
   const html=await readFile(new URL('../options.html',import.meta.url),'utf8'),panel=await readFile(new URL('../src/providers/floating-panel.js',import.meta.url),'utf8'),popup=await readFile(new URL('../popup.html',import.meta.url),'utf8');
   assert.match(html,/id="empty-library"/u);assert.match(html,/data-go-workspace="providers">Add a library/u);
   assert.match(html,/confirm the signed-in account/u);assert.match(html,/Sync library on Epic/u);assert.match(html,/id="unnamed-accounts-help"/u);
   for(const key of ['data-profile-label','data-profile-confirm','data-profile-switch'])assert(panel.includes(key));
   assert.match(panel,/Account nickname/u);assert.match(panel,/does not sign you in or verify your login/u);assert.match(popup,/options.html#providers/u);
 }]
];
