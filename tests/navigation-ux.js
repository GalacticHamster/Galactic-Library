import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceNavigation} from '../src/ui/workspaces.js';
import {defaultUiPreferences,validateUiPreferences,workspaceTarget} from '../src/lib/ui-preferences.js';
import {validateRuntime} from '../scripts/release.mjs';
import {bookReviewCounts,receiptReviewCounts,workbenchReviewCounts} from '../src/ui/review-status.js';

export const navigationUxTests=[
 ['Review presentation counts separate decisions, failed lookups, waiting receipts and saved sources without changing evidence',()=>{
   const database={providerItems:{a:{recordRef:'a',profileId:'personal',mediaType:'book'},b:{recordRef:'b',profileId:'family',mediaType:'book'}},enrichmentReviews:{ready:{recordRefs:['a'],status:'candidates'},conflict:{recordRefs:['b'],status:'conflict'},failed:{recordRefs:['a'],status:'failed'},empty:{recordRefs:['a'],status:'no-results'},old:{recordRefs:['absent'],status:'candidates'}},ownershipProposals:{ready:{recordRefs:['a'],profileId:'personal'},wrongAccount:{recordRefs:['a'],profileId:'family'},waiting:{recordRefs:[],profileId:'personal'}}},before=JSON.stringify(database);
   assert.deepEqual(bookReviewCounts(database),{attention:2,lookups:2});assert.deepEqual(receiptReviewCounts(database),{attention:1,waiting:2});
   const retry=structuredClone(database);retry.providerItems.a.metadata={enrichment:{kindleProductComicContents:{availability:'temporary-failure'}}};assert.deepEqual(bookReviewCounts(retry),{attention:2,lookups:3});
   assert.deepEqual(workbenchReviewCounts([{category:'candidates',review:{}},{category:'conflicts',review:{}},{category:'failed',review:{}},{category:'unparsed'},{category:'undo'},{category:'missing'},{category:'conflicts'}]),{attention:2,sourceConflicts:1,lookups:1,contents:1,saved:1});assert.equal(JSON.stringify(database),before);
 }],
 ['Ownership workbench separates corrections, product identities, optional receipts and access reminders without replacing legacy controls',async()=>{
   const html=await readFile(new URL('../options.html',import.meta.url),'utf8');
   for(const id of ['ownership-corrections-heading','identity-review-heading','purchase-evidence-slot','access-reminders-slot','duplicate-review-panel','download-comixology-list'])assert(html.includes(`id="${id}"`));
   assert(html.includes('Change access'));assert(html.includes('Details &rarr; Matching and editions'));assert(!html.includes('purchase or product reviews'));
 }],
 ['Contents attention filter persists alongside legacy unreviewed and failure filters',()=>{
   for(const status of ['attention','review','failure'])assert.equal(validateUiPreferences({contents:{status}}).contents.status,status);
 }],
 ['Options has four primary destinations and keeps existing tools in reachable secondary homes',async()=>{
   const html=await readFile(new URL('../options.html',import.meta.url),'utf8');
   const primary=html.match(/<nav id="workspace-navigation"[\s\S]*?<\/nav>/u)[0];
   assert.deepEqual([...primary.matchAll(/data-workspace="([^"]+)"/gu)].map(m=>m[1]),['library','providers','contents','settings']);
   assert.match(html,/<nav id="library-navigation"/u);
   const contents=html.slice(html.indexOf('<section id="contents-workspace"'),html.indexOf('<section id="books-workspace"'));
   assert.match(contents,/contents-progress-slot/u);assert.match(contents,/series-coverage-view/u);assert.match(html,/<nav id="books-navigation"/u);assert(!html.includes('book-catalog-disclosure'));
   assert.match(contents,/Scan eligible books/u);assert(!contents.includes('comic/manga candidates'));
   const settings=html.slice(html.indexOf('<section id="settings-workspace"'));
   for(const id of ['export','import','performance-diagnostics','assume-all-owned','google-books-api-key','companion-extension-id'])assert(settings.includes(`id="${id}"`));
   assert(!settings.includes('Open signed-in Steam Store'));assert.match(settings,/Restore backup/u);
 }],
 ['Old saved views/deep links remain compatible without changing database identity',()=>{
   for(const name of ['books','reading','ownership','library','providers','contents','settings','comparisons'])assert.equal(validateUiPreferences({workspace:name}).workspace,name);
   assert.equal(workspaceTarget('#kindle'),'contents');assert.equal(workspaceTarget('#libraries'),'providers');assert.equal(workspaceTarget('#ownership-workspace'),'ownership');
   assert.equal(workspaceTarget('bad-route'),null);
 }],
 ['Navigation hides sections without recreating contents progress or initiating acquisition',()=>{
   const prior=globalThis.document,listeners={};
   const node=(workspace)=>({dataset:{workspace},hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});
   const primary=['library','providers','contents','settings'].map(node),secondary=['library','books','reading','ownership'].map(node);
   const panels=['books','reading','ownership','providers','contents','settings','comparisons'].map(w=>({...node(w),dataset:{workspacePanel:w}}));
   const nav={querySelectorAll:()=>primary,addEventListener:(k,fn)=>{listeners.primary=fn;}},sub={querySelectorAll:()=>secondary,addEventListener:(k,fn)=>{listeners.secondary=fn;}};
   const library={},enrich={},heading={},status={},progress={cursor:17,runRef:'unchanged'};
   globalThis.document={querySelector:s=>({'#workspace-navigation':nav,'#library-navigation':sub,'#workspace-status':status,'#library-section':library,'#show-enrichment-actions':enrich,'#library-heading':heading})[s],querySelectorAll:()=>panels,addEventListener(){}};
   let changed=0,reads=0;const view=defaultUiPreferences().browse;
   try{
     const ui=createWorkspaceNavigation({readView:()=>{reads++;return view;},applyView(){},save:async()=>{},changed:()=>changed++});
     ui.hydrate({...defaultUiPreferences(),workspace:'books'});assert.equal(primary[2].attrs['aria-current'],'page');assert.equal(library.hidden,true);
     ui.select('contents');assert.equal(library.hidden,true);assert.equal(sub.hidden,true);assert.equal(panels.find(p=>p.dataset.workspacePanel==='contents').hidden,false);
     ui.select('providers');ui.select('contents');assert.deepEqual(progress,{cursor:17,runRef:'unchanged'});
     ui.select('library');assert.equal(library.hidden,false);assert.equal(primary[0].attrs['aria-current'],'page');assert.equal(reads,4);assert.equal(changed,4);
     const delayed=createWorkspaceNavigation({readView:()=>view,applyView(){},save:async()=>{},changed(){}});
     delayed.select('providers');delayed.hydrate({...defaultUiPreferences(),workspace:'books'});assert.equal(delayed.workspace,'providers','Late preferences displaced user navigation.');
   }finally{globalThis.document=prior;}
 }],
 ['Runtime dependency validation resolves local navigation fragments and still rejects absent base files',async()=>{
   const paths=JSON.parse(await readFile(new URL('../scripts/runtime-files.json',import.meta.url),'utf8'));
   const files=new Map(await Promise.all(paths.map(async p=>[p,await readFile(new URL('../'+p,import.meta.url))])));
   validateRuntime(files);
   const missing=new Map(files);missing.set('popup.html',Buffer.from('<a href="absent.html#providers">Providers</a>'));
   assert.throws(()=>validateRuntime(missing),/Missing runtime dependency/u);
 }]
];
