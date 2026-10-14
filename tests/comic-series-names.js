import assert from 'node:assert/strict';
import {comicCoverageNameKey,comicSeriesDisplayName,defaultComicSeriesName,validateComicCoverageNames} from '../src/lib/comic-series-names.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {mergeUiPreferences,defaultUiPreferences} from '../src/lib/ui-preferences.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
import {checkMergeDialogFixture} from './merge-dialog-fixture.js';
import {comicSeriesTitle,comicSeriesLabel,seriesMergeTargets} from '../src/ui/comic-coverage-presentation.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
export const comicSeriesNameTests=[
 ['custom coverage names own every qualifier except issue type, including annuals and legacy merged names',()=>{
   for(const unitType of ['issue','annual'])for(const merged of [false,true]){
     const group={id:JSON.stringify(['wonder woman','volume 2',unitType,'en']),series:'Wonder Woman',run:'volume 2',unitType,language:'en'};
     if(merged){group.members=[group.id,JSON.stringify(['wonder woman','1987-2006',unitType,'en'])];group.originalScopes=[{series:'Wonder Woman',run:'volume 2'}];}
     const title='Wonder Woman Vol 2 (1987–2006)',names={[comicCoverageNameKey(group)]:title},before=JSON.stringify(group);
     assert.equal(comicSeriesTitle(group,names),title);
     assert.equal(comicSeriesLabel(group,[group,{...group,language:'fr'}],names),title+' — '+unitType+'s');
     assert.equal(comicSeriesTitle(group,{[comicCoverageNameKey(group)]:null}),'Wonder Woman (volume 2)');
     assert.equal(JSON.stringify(group),before);
     if(merged)assert.equal(comicSeriesLabel({...group,series:title}),title+' — '+unitType+'s');
   }
   const group={id:'v3',series:'Wonder Woman',run:'volume 3',unitType:'issue'};
   assert.equal(comicSeriesLabel(group,[group],{v3:'Wonder Woman Vol 3 (2006–2011)'}),'Wonder Woman Vol 3 (2006–2011) — issues');
   assert.equal(comicSeriesTitle({...group,series:'Wonder Woman (volume 3)'}),'Wonder Woman (volume 3)');
 }],
 ['renaming preserves complete copies, duplicates, partial coverage and supporting identities',async()=>{
   const database=coverageDatabase(coverageBook('full','Collects Alpha (2001) #1 and material from Alpha (2001) #2'),coverageBook('other-full','Collects Alpha (2001) #1')),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(database);
   const before=await writer.getDatabase(),groups=comicCoverageForLibrary(before).groups,group=groups[0];assert.equal(group.covered,1);assert.equal(group.duplicates,1);assert.equal(group.partial,1);
   const prefs=await writer.saveUiPreferences({comicCoverageNames:{[group.id]:'Renamed Alpha'}});assert.equal(comicSeriesDisplayName(group,prefs.comicCoverageNames),'Renamed Alpha');assert.deepEqual(await writer.getDatabase(),before);assert.deepEqual(comicCoverageForLibrary(await writer.getDatabase()).groups,groups);
 }],
 ['independent series names validate, reset, correct typos, retain issue labels and leave coverage/source identities unchanged',()=>{
   const f=checkMergeDialogFixture(),before=JSON.stringify(f.database),groups=JSON.stringify(comicCoverageForLibrary(f.database).groups),single=f.saga.id,merged=comicCoverageNameKey(f.full);let prefs=defaultUiPreferences();
   for(const name of ['Swmap Thing','Swamp Thing','My collection']){prefs=mergeUiPreferences(prefs,{comicCoverageNames:{[single]:name}});assert.equal(comicSeriesDisplayName(f.saga,prefs.comicCoverageNames),name);}
   prefs=mergeUiPreferences(prefs,{comicCoverageNames:{[merged]:'Combined collections'}});assert.equal(comicSeriesDisplayName(f.full,prefs.comicCoverageNames),'Combined collections');assert.equal(comicSeriesLabel({...f.full,series:comicSeriesDisplayName(f.full,prefs.comicCoverageNames)}),'Combined collections — issues');
   prefs=mergeUiPreferences(prefs,{comicCoverageNames:{[single]:null,[merged]:null}});assert.equal(comicSeriesDisplayName(f.saga,prefs.comicCoverageNames),f.saga.series);assert.equal(comicSeriesDisplayName(f.full,prefs.comicCoverageNames),defaultComicSeriesName(f.full));assert.equal(defaultComicSeriesName(f.full),'Swamp Thing');
   assert.equal(comicCoverageNameKey({...f.full,members:[...f.full.members].reverse()}),merged);assert.equal(JSON.stringify(f.database),before);assert.equal(JSON.stringify(comicCoverageForLibrary(f.database).groups),groups);
   for(const names of [{bad:'Bad'},{[single]:''},{[single]:'x'.repeat(301)},{[single]:'bad\nname'}])assert.throws(()=>validateComicCoverageNames(names));
   assert.equal(seriesMergeTargets(f.dated,[f.saga],'My collection',{[single]:'My collection'})[0].id,single);
 }],
 ['rename preferences survive merges, undo and backup restore without modifying purchases or merge relationships',async()=>{
   const f=checkMergeDialogFixture(),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(f.database);const database=await writer.getDatabase(),before=JSON.stringify(database);
   await writer.saveUiPreferences({comicCoverageNames:{[f.saga.id]:'My original Saga',[f.other.id]:'My other Saga'}});
   await writer.saveComicCoverageMerge(f.saga.id,f.other.id,'Joined Saga');const mergedKey=comicCoverageNameKey(f.merged),merges=JSON.stringify((await writer.getUiPreferences()).comicCoverageMerges);
   await writer.saveUiPreferences({comicCoverageNames:{[mergedKey]:'Corrected Saga'}});assert.equal(JSON.stringify((await writer.getUiPreferences()).comicCoverageMerges),merges);assert.equal(JSON.stringify(await writer.getDatabase()),before);
   await writer.saveComicCoverageMerge(f.merged.id,f.dated.id,'Corrected Saga',true);let prefs=await writer.getUiPreferences(),groups=comicCoverageForLibrary(database,prefs.comicCoverageMerges).groups,full=groups.find(g=>g.id===f.dated.id);assert.equal(full.covered,74);assert.equal(comicSeriesDisplayName(full,prefs.comicCoverageNames),'Corrected Saga');assert.equal(prefs.comicCoverageNames[f.saga.id],'My original Saga');assert.equal(prefs.comicCoverageNames[mergedKey],'Corrected Saga');
   const fullKey=comicCoverageNameKey(full);await writer.saveUiPreferences({comicCoverageNames:{[fullKey]:'One more correction'}});const backup=createBackup(await writer.getDatabase(),await writer.getUiPreferences());await writer.saveUiPreferences({comicCoverageNames:{[fullKey]:null}});await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));prefs=await writer.getUiPreferences();assert.equal(comicSeriesDisplayName(full,prefs.comicCoverageNames),'One more correction');
   await writer.removeComicCoverageMerge(f.dated.id);prefs=await writer.getUiPreferences();groups=comicCoverageForLibrary(database,prefs.comicCoverageMerges).groups;assert.equal(comicSeriesDisplayName(groups.find(g=>g.id===f.saga.id),prefs.comicCoverageNames),'My original Saga');assert.equal(comicSeriesDisplayName(groups.find(g=>g.id===f.other.id),prefs.comicCoverageNames),'My other Saga');assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const older=createBackup(database);await writer.restoreDatabase(parseBackup(older),parseBackupPreferences(older));assert.equal((await writer.getUiPreferences()).comicCoverageNames[f.saga.id],'My original Saga');
   // Explicitly choosing a name for a new merge wins over an archived override.
   await writer.saveComicCoverageMerge(f.saga.id,f.other.id,'New merge name');prefs=await writer.getUiPreferences();assert(!Object.hasOwn(prefs.comicCoverageNames,mergedKey));assert.equal(comicSeriesDisplayName(comicCoverageForLibrary(database,prefs.comicCoverageMerges).groups.find(g=>g.id===f.other.id),prefs.comicCoverageNames),'New merge name');
 }]
];
