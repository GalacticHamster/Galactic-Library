import assert from 'node:assert/strict';
import {paginationState} from '../src/ui/pagination.js';
import {PAGE_SIZES,defaultUiPreferences,validateUiPreferences,UI_PREFERENCES_KEY} from '../src/lib/ui-preferences.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {browseDatabase,browseRecord} from './library-browse.js';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {createWorkspaceNavigation} from '../src/ui/workspaces.js';

export const paginationTests=[
 ['Page-size changes reset browsing immediately while ordinary view saves cannot overwrite the shared size',async()=>{
   const previous={document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
   const status={},nodes={'#workspace-navigation':{querySelectorAll:()=>[],addEventListener(){}},'#workspace-status':status,'#library-section':{},'#show-enrichment-actions':{},'#library-heading':{}};
   const scheduled=[],saved=[];let applied={...defaultUiPreferences().browse},renders=0;
   globalThis.document={querySelector:key=>nodes[key],querySelectorAll:()=>[],addEventListener(){}};
   globalThis.setTimeout=fn=>(scheduled.push(fn),scheduled.length);globalThis.clearTimeout=()=>{};
   try{
     const ui=createWorkspaceNavigation({readView:()=>applied,applyView:view=>applied={...view},save:async patch=>saved.push(patch),changed:()=>renders++});
     ui.hydrate({pageSize:100,browse:{page:2,anchor:'saved-record'}});assert.equal(ui.pageSize,100);assert.equal(applied.page,2);
     assert.equal(ui.setPageSize(200),true);assert.equal(ui.pageSize,200);assert.equal(applied.page,0);assert.equal(applied.anchor,'');assert.equal(renders,1);assert.deepEqual(saved,[{pageSize:200}]);
     ui.select('contents');assert.equal(ui.pageSize,200);ui.rememberView();scheduled.at(-1)();await Promise.resolve();assert(!('pageSize' in saved.at(-1)),'Stale navigation competes with explicit page-size choice');
     const count=saved.length;assert.equal(ui.setPageSize(25),false);assert.equal(saved.length,count);
   }finally{Object.assign(globalThis,previous);}
 }],
 ['Pagination supports exactly 20/50/100/200 and clamps pages/ranges without false empty pages',()=>{
   assert.deepEqual(PAGE_SIZES,[20,50,100,200]);assert.equal(defaultUiPreferences().pageSize,50);
   for(const [size,pages]of [[20,313],[50,125],[100,63],[200,32]]){
     assert.equal(paginationState(6245,0,size).pages,pages);
     const last=paginationState(6245,999,size);assert.equal(last.page,pages-1);assert.equal(last.end,6245);assert.equal(last.next,false);
   }
   assert.deepEqual([paginationState(6245,1,50).start,paginationState(6245,1,50).end],[51,100]);
   assert.equal(paginationState(6245,31,200).start,6201);
   for(const page of [-1,999,NaN]){const empty=paginationState(0,page);assert.equal(empty.pages,0);assert.equal(empty.page,0);assert.equal(empty.start,0);assert.equal(empty.end,0);assert.equal(empty.previous,false);assert.equal(empty.next,false);}
   const one=paginationState(17,88);assert.equal(one.pages,1);assert.equal(one.end,17);assert.equal(one.previous,false);assert.equal(one.next,false);
   assert.equal(paginationState(100,-1).page,0);assert.equal(paginationState(100,NaN).page,0);
 }],
 ['One private page-size preference survives writer recreation, merges settings and stays outside backup data',async()=>{
   const memory={},area={get:async defaults=>structuredClone(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,memory[key]??value]))),set:async values=>Object.assign(memory,structuredClone(values))};
   const writer=createStorageWriter(area),before=await writer.getDatabase();
   assert.equal((await writer.getUiPreferences()).pageSize,50);
   for(const size of PAGE_SIZES){await writer.saveUiPreferences({pageSize:size});assert.equal((await createStorageWriter(area).getUiPreferences()).pageSize,size);}
   await Promise.all([writer.saveUiPreferences({pageSize:100}),writer.saveUiPreferences({browse:{search:'Book'},contents:{status:'partial'}})]);
   const prefs=await createStorageWriter(area).getUiPreferences();assert.equal(prefs.pageSize,100);assert.equal(prefs.browse.search,'Book');assert.equal(prefs.contents.status,'partial');
   assert.deepEqual(Object.keys(prefs).filter(key=>/size/iu.test(key)),['pageSize']);
   assert.deepEqual(await writer.getDatabase(),before);const backup=createBackup(before);assert(!('pageSize' in backup.database));assert.deepEqual(parseBackup(backup),before);
   for(const invalid of [0,25,201,'100',null,{},Infinity]){await assert.rejects(writer.saveUiPreferences({pageSize:invalid}));memory[UI_PREFERENCES_KEY]={...prefs,pageSize:invalid};assert.equal((await writer.getUiPreferences()).pageSize,50);}
   assert.equal(validateUiPreferences({browse:{search:'Legacy'}}).pageSize,50);
 }],
 ['Contents pages account cards independently of canonical totals and anchors qualifying records at every size',()=>{
   const db=browseDatabase(Array.from({length:230},(_,n)=>browseRecord('r'+n,'Book '+String(n).padStart(3,'0'))));
   const second=browseRecord('family','Book 019',{}, {profileId:'family'});db.providerItems.family=second;db.canonicalItems.r19.providerItemIds.push('family');
   const project=createLibraryBrowseProjection(),projection=project(db),before=JSON.stringify(db);
   for(const size of PAGE_SIZES){
     const library=libraryBrowseResults(projection,{size}),contents=libraryBrowseResults(projection,{size,paginateRecords:true});assert.equal(library.total,230);assert.equal(contents.total,231);assert.equal(contents.catalogTotal,230);assert.equal(contents.rows.length,size);assert.equal(contents.rows.flatMap(r=>r.qualifying).length,size);
     const anchored=libraryBrowseResults(projection,{size,paginateRecords:true,anchor:'family'});assert(anchored.rows.some(r=>r.qualifying[0].record.id==='family'));
   }
   const scoped=libraryBrowseResults(projection,{paginateRecords:true,filters:{account:'personal'},anchor:'family',size:20,page:1});assert(scoped.rows.every(row=>row.qualifying[0].record.profileId==='personal'));assert.equal(scoped.page,1);
   assert.equal(project(db),projection);assert.equal(JSON.stringify(db),before);
 }]
];
