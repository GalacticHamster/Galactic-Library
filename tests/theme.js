import assert from 'node:assert/strict';
import {themeCoreTests} from './theme-core-tests.mjs';
import {createAppearanceService} from '../src/background/appearance.js';
import {defaultUiPreferences,validateUiPreferences} from '../src/lib/ui-preferences.js';
export const themeTests=[...themeCoreTests,
 ['GL appearance uses only private UI preferences and never requests or mutates the database',async()=>{
   const original={appearance:'light',pageSize:200},gets=[],patches=[];
   const area={get:async query=>{gets.push(Object.keys(query));return {galacticLibraryUiPreferences:original};}};
   const runtime={id:'own',getURL:()=> 'chrome-extension://own/'};
   const service=createAppearanceService(area,{saveUiPreferences:async patch=>patches.push(patch)},runtime);
   assert.equal((await service.get()).appearance.mode,'light');assert.deepEqual(gets,[['galacticLibraryUiPreferences']]);assert.deepEqual(patches,[]);assert.deepEqual(original,{appearance:'light',pageSize:200});
   assert.equal(defaultUiPreferences().appearance,'dark');assert.equal(validateUiPreferences({appearance:'system',pageSize:100}).appearance,'system');assert.throws(()=>validateUiPreferences({appearance:'bad'}));
 }]
];
