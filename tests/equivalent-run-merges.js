import assert from 'node:assert/strict';
import {checkEquivalentRunFixture,equivalentRunBooks,equivalentRunResult} from './equivalent-run-fixture.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {continuityAssessment,continuityProblem,addSeriesMerge} from '../src/lib/comic-series-merges.js';
import {seriesMergeTargets} from '../src/ui/comic-coverage-presentation.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
export const equivalentRunMergeTests=[
 ['reported Uncanny ranges combine to 281 full issues with one shared issue and separate annuals',checkEquivalentRunFixture],
 ['equivalent-run permission requires literal saved run context, not dates or overlap alone',()=>{
   const books=equivalentRunBooks(),a=books[0],b=books[1],db=coverageDatabase(a,b);
   b.title='Later collection';let result=equivalentRunResult(db);assert.match(continuityProblem(result.left,result.right),/saved publication context/);
   b.title='Later collection (Unrelated Series (1963-2011))';result=equivalentRunResult(db);assert(continuityProblem(result.left,result.right));
   b.title='Later collection (Uncanny X-Men (1963-2011))';b.metadata.series=['Uncanny X-Men (2011-2016)'];result=equivalentRunResult(db);assert(continuityProblem(result.left,result.right),'Conflicting title/metadata cannot establish equivalence');
   b.metadata.series=[];result=equivalentRunResult(db);assert.equal(continuityProblem(result.left,result.right),'');
   const generic=coverageDatabase(coverageBook('a','Collects Alpha (1950-2000) #1-20'),coverageBook('b','Collects Alpha (1970) #20-40',{title:'Later collection (Alpha (1950-2000))'})),groups=comicCoverageForLibrary(generic).groups;assert(continuityAssessment(groups[0],groups[1]).equivalent,'Rule was specific to Uncanny X-Men');
 }],
 ['reset protection persists at date boundaries and through existing combined scopes',()=>{
   const dc=coverageDatabase(coverageBook('original','Collects Detective Comics (1937-2011) #27-81'),coverageBook('reset','Collects Detective Comics (2011-2016) #1-29',{title:'Later collection (Detective Comics (1937-2011))'})),groups=comicCoverageForLibrary(dc).groups;assert.match(continuityProblem(groups[0],groups[1]),/restarted numbering/);
   const result=checkEquivalentRunFixture(),restart=result.groups.find(g=>g.run==='2011'&&g.unitType==='issue');assert(continuityProblem(result.combined,restart));
   const contradiction=coverageBook('conflict','Collects Uncanny X-Men (1981) #1',{title:'Later collection (Uncanny X-Men (1963-2011))'}),extended=equivalentRunResult(coverageDatabase(...equivalentRunBooks(),contradiction));assert(continuityProblem(extended.left,extended.right),'Early numbers in the later scope must prevent an unsafe alias');
 }],
 ['same-book observations do not become extra purchases when equivalent run labels are combined',()=>{
   const [a,b]=equivalentRunBooks(),db=coverageDatabase(a,b);db.canonicalItems={same:{id:'same',title:'Same collected edition',mediaType:'book',providerItemIds:[a.id,b.id]}};
   const result=equivalentRunResult(db),issue=result.combined.issues.find(i=>i.number==='167');assert.equal(issue.copies,1);assert.equal(result.combined.duplicates,0);assert.equal(issue.sources.length,2,'Original observations should remain inspectable');
 }],
 ['existing same-start-year merges retain bounded run context when another equivalent label is added',()=>{
   const db=coverageDatabase(...equivalentRunBooks(),coverageBook('start-only','Collects Uncanny X-Men (1963) #248-249')),{left,right}=equivalentRunResult(db),initial=comicCoverageForLibrary(db).groups.find(g=>g.run==='1963'&&g.unitType==='issue'),prior=addSeriesMerge({},initial.id,left.id,'Uncanny X-Men',true),earlier=comicCoverageForLibrary(db,prior).groups.find(g=>g.id===left.id);
   assert(continuityAssessment(earlier,right).equivalent,'A confirmed same-start member lost the bounded run context');const aliases=addSeriesMerge(prior,right.id,left.id,'Uncanny X-Men',true),combined=comicCoverageForLibrary(db,aliases).groups.find(g=>g.id===left.id);assert.equal(combined.covered,281);assert.equal(combined.duplicates,3);assert.equal(aliases[left.id].members.length,3);assert.equal(combined.issues.find(i=>i.number==='167').copies,2);
   assert.equal(seriesMergeTargets(right,[earlier,right],'Uncanny 1963 2011 issues')[0].id,left.id,'Search must retain original run labels of combined groups');
   assert(continuityProblem(combined,comicCoverageForLibrary(db).groups.find(g=>g.run==='2011'&&g.unitType==='issue')),'Merged scopes must still reject restarted numbering');
 }],
 ['authoritative equivalent merge save, reversal and backup preserve records, starts and numbering transitions',async()=>{
   const memory={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...memory}),set:async updates=>Object.assign(memory,structuredClone(updates))});await writer.restoreDatabase(coverageDatabase(...equivalentRunBooks()));
   const db=await writer.getDatabase(),before=JSON.stringify(db),{left,right}=equivalentRunResult(db);
   await writer.saveUiPreferences({comicCoverageStarts:{[left.id]:94,[right.id]:167},comicCoverageTransitions:{[left.id]:[[66,94]],[right.id]:[[243,281]]}});
   const preferences=await writer.saveComicCoverageMerge(right.id,left.id,'Uncanny X-Men',true);assert(preferences.comicCoverageMerges[left.id].continuity);
   const backup=createBackup(await writer.getDatabase(),preferences);await writer.removeComicCoverageMerge(left.id);assert.equal(comicCoverageForLibrary(await writer.getDatabase()).groups.filter(g=>g.series==='Uncanny X-Men'&&g.unitType==='issue').length,3);
   await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));const restored=await writer.getUiPreferences(),combined=comicCoverageForLibrary(await writer.getDatabase(),restored.comicCoverageMerges).groups.find(g=>g.id===left.id);assert.equal(combined.covered,281);assert.equal(combined.issues.find(i=>i.number==='167').copies,2);assert.equal(restored.comicCoverageStarts[left.id],94);assert.equal(restored.comicCoverageStarts[right.id],167);assert.deepEqual(restored.comicCoverageTransitions[left.id],[[66,94]]);assert.deepEqual(restored.comicCoverageTransitions[right.id],[[243,281]]);
   const reset=comicCoverageForLibrary(db).groups.find(g=>g.run==='2011'&&g.unitType==='issue');await assert.rejects(()=>writer.saveComicCoverageMerge(reset.id,left.id,'Unsafe',true),/restarted numbering/);assert.equal(JSON.stringify(await writer.getDatabase()),before);
   await writer.removeComicCoverageMerge(left.id);assert.deepEqual((await writer.getUiPreferences()).comicCoverageMerges,{});assert.equal(JSON.stringify(await writer.getDatabase()),before);
 }],
 ['merge suggestions prioritize same-name regular issues without hiding annuals or unrelated search results',()=>{
   const result=checkEquivalentRunFixture(),extra=comicCoverageForLibrary(coverageDatabase(coverageBook('other','Collects Alpha (2000) #1'))).groups[0],annual=result.groups.find(g=>g.unitType==='annual'),targets=seriesMergeTargets(result.left,[annual,extra,result.right,result.left]);assert.deepEqual(targets.map(g=>g.id),[result.right.id,extra.id,annual.id]);assert.equal(seriesMergeTargets(result.left,[annual,extra,result.right],'Alpha')[0].id,extra.id);assert.deepEqual(seriesMergeTargets(result.left,result.groups,'Uncanny annuals').map(g=>g.id),[annual.id]);assert.equal(seriesMergeTargets(result.left,result.groups,'Uncanny 1981 issues')[0].id,result.right.id);assert.throws(()=>addSeriesMerge({},result.left.id,annual.id,'Invalid',true));
 }]
];
