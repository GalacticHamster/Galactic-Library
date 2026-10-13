import assert from 'node:assert/strict';
import {checkMergeDialogFixture} from './merge-dialog-fixture.js';
import {compatibleSeries,addSeriesMerge,continuityAssessment} from '../src/lib/comic-series-merges.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {comicSeriesLabel,seriesMergeTargets} from '../src/ui/comic-coverage-presentation.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
export const mergeDialogTests=[
 ['previously merged undated Swamp scopes combine with a dated continuation without throwing or losing reset/type guards',()=>{
   const f=checkMergeDialogFixture(),before=JSON.stringify(f.database);assert(!compatibleSeries(f.merged.id,f.dated.id));assert(compatibleSeries(f.merged.id,f.dated.id,true));assert(!compatibleSeries(f.merged.id,f.annual.id,true));assert.equal(continuityAssessment(f.dated,f.merged).problem,'');
   const reverse=addSeriesMerge(f.merges,f.dated.id,f.merged.id,'Target already merged',true),group=comicCoverageForLibrary(f.database,reverse).groups.find(g=>g.id===f.merged.id);assert.equal(group.covered,74);assert.equal(group.originalScopes.length,3);assert.equal(JSON.stringify(f.database),before);
   assert.throws(()=>addSeriesMerge(f.merges,f.merged.id,f.annual.id,'Wrong type',true));assert(seriesMergeTargets(f.merged,[f.merged,f.dated,f.annual]).every(g=>g.id!==f.merged.id));assert.equal(seriesMergeTargets(f.merged,[f.merged,f.dated,f.annual],'Swamp annuals')[0].id,f.annual.id);
   assert.equal(comicSeriesLabel(f.full),'My Swamp Thing — issues');assert.equal(comicSeriesLabel({...f.full,unitType:'annual'}),'My Swamp Thing — annuals');assert.equal(f.full.series,'My Swamp Thing');
 }],
 ['authoritative successive merges preserve custom names, preferences, supporting sources and backups and can be undone',async()=>{
   const f=checkMergeDialogFixture(),data={},writer=createStorageWriter({get:async defaults=>({...defaults,...data}),set:async values=>Object.assign(data,structuredClone(values))});await writer.restoreDatabase(f.database);const before=JSON.stringify(await writer.getDatabase());
   await writer.saveComicCoverageMerge(f.saga.id,f.other.id,'Saga of the Swamp Thing');const preferences=await writer.saveComicCoverageMerge(f.merged.id,f.dated.id,'My Swamp Thing',true);assert.equal(preferences.comicCoverageMerges[f.dated.id].title,'My Swamp Thing');
   await assert.rejects(()=>writer.saveComicCoverageMerge(f.dated.id,f.reset.id,'Wrong reset',true),/restarted numbering/);await assert.rejects(()=>writer.saveComicCoverageMerge(f.dated.id,f.annual.id,'Wrong type',true),/issue type/);
   const backup=createBackup(await writer.getDatabase(),await writer.getUiPreferences());await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const groups=comicCoverageForLibrary(await writer.getDatabase(),(await writer.getUiPreferences()).comicCoverageMerges).groups,merged=groups.find(g=>g.id===f.dated.id);assert.equal(merged.covered,74);assert.equal(merged.issues.find(i=>i.number==='45').copies,2);assert.equal(merged.issues.find(i=>i.number==='45').sources.length,2);
   await writer.removeComicCoverageMerge(f.dated.id);const separate=comicCoverageForLibrary(await writer.getDatabase()).groups;assert(separate.some(g=>g.id===f.saga.id)&&separate.some(g=>g.id===f.other.id)&&separate.some(g=>g.id===f.dated.id));assert.equal(JSON.stringify(await writer.getDatabase()),before);
 }]
];
