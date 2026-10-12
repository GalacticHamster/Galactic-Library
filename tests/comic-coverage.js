import assert from 'node:assert/strict';
import {comicRange,comicIssuePage,comicCoverageSummary,comicSeriesKey} from '../src/lib/comic-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {validateUiPreferences,mergeUiPreferences,defaultUiPreferences} from '../src/lib/ui-preferences.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
export const comicCoverageTests=[
 ['Comic Coverage assumes #1 through highest covered integer and retains #0 and fractions',()=>{
   const db=coverageDatabase(coverageBook('one','Collects Alpha (2001) #0, 1/2, 3, 5'));
   const result=comicCoverageForLibrary(db),group=result.groups[0],range=comicRange(group);
   assert.equal(group.issues.length,4);assert.equal(range.missing,3);assert.deepEqual(comicIssuePage(group,{filter:'missing'}).rows.map(row=>row.number),['1','2','4']);
   assert.equal(comicIssuePage(group).rows[0].number,'0');assert.equal(comicIssuePage(group).rows[1].number,'1/2');
 }],
 ['series start override removes pre-run gaps but preserves covered issues below the override',()=>{
   const group=comicCoverageForLibrary(coverageDatabase(coverageBook('doctor','Collects Doctor Strange (1968) #169, 171'))).groups[0];
   assert.equal(comicRange(group).missing,169);assert.equal(comicRange(group,169).missing,1);assert.equal(comicRange(group,172).missing,0);
   assert.equal(comicIssuePage(group,{start:172}).total,2);assert.deepEqual(comicIssuePage(group,{start:169,filter:'missing'}).rows.map(row=>row.number),['170']);
 }],
 ['overlapping books contribute duplicate issue coverage and preserve supporting sources',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #1-3'),b=coverageBook('b','Collects Alpha (2001) #3-5'),db=coverageDatabase(a,b),before=JSON.stringify(db),group=comicCoverageForLibrary(db).groups[0];
   assert.equal(group.issues.length,5);assert.equal(group.duplicates,1);const duplicate=comicIssuePage(group,{filter:'duplicates'}).rows[0];assert.equal(duplicate.number,'3');assert.equal(duplicate.copies,2);assert.equal(duplicate.sources.length,2);assert.equal(JSON.stringify(db),before);
 }],
 ['repeated observations of one canonical purchase do not inflate duplicates; separate orders do',()=>{
   const a=coverageBook('a'),b=coverageBook('b'),db=coverageDatabase(a,b);db.canonicalItems={same:{id:'same',title:'Same edition',providerItemIds:[a.id,b.id]}};
   assert.equal(comicCoverageForLibrary(db).groups[0].duplicates,0);
   const h1=coverageBook('order1',undefined,{provider:'humble'}),h2=coverageBook('order2',undefined,{provider:'humble'}),humble=coverageDatabase(h1,h2);
   h1.metadata.purchaseId='one';h2.metadata.purchaseId='two';humble.contentReviews[h1.id]=confirmed([issue()]);humble.contentReviews[h2.id]=confirmed([issue()]);
   humble.canonicalItems={same:{id:'same',title:'Same edition',providerItemIds:[h1.id,h2.id]}};
   assert.equal(comicCoverageForLibrary(humble).groups[0].issues[0].copies,2);
   h2.metadata.purchaseId='one';assert.equal(comicCoverageForLibrary(humble).groups[0].duplicates,0);
   h2.title=h1.title;humble.canonicalItems={first:{id:'first',title:h1.title,mediaType:'book',providerItemIds:[h1.id]},second:{id:'second',title:h2.title,mediaType:'book',providerItemIds:[h2.id]}};
   assert.equal(comicCoverageForLibrary(humble).groups[0].duplicates,0,'Existing Library consolidation must also suppress duplicate observations across old canonical IDs');
   h2.metadata.purchaseId='two';assert.equal(comicCoverageForLibrary(humble).groups[0].issues[0].copies,2);
 }],
 ['runs, issue types and explicit languages remain separate; provisional identities do not imply coverage',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #1; Alpha Annual (2001) #1'),old=coverageBook('old','Collects Alpha (1990) #1'),unknown=coverageBook('unknown','Collects Alpha #1'),fr=coverageBook('fr');fr.metadata.language='fr';
   const result=comicCoverageForLibrary(coverageDatabase(a,old,unknown,fr));assert.equal(result.groups.length,4);assert.equal(result.provisional,1);assert(result.groups.every(group=>!group.duplicates));
   assert.equal(new Set(result.groups.map(comicSeriesKey)).size,4);
 }],
 ['reviews, rejection, ownership policy and direct standalone coverage retain existing behavior',()=>{
   const a=coverageBook('a'),direct=coverageBook('standalone','',{title:'Alpha (2001) #4'}),db=coverageDatabase(a,direct);db.contentReviews[a.id]=confirmed([issue()]);
   let group=comicCoverageForLibrary(db).groups[0];assert.equal(group.issues[0].confidence,'verified');assert.equal(group.issues[1].confidence,'direct');
   db.contentReviews[a.id]=confirmed([],'rejected');assert.equal(comicCoverageForLibrary(db).groups[0].issues.length,1);
   direct.ownership='subscription';assert.equal(comicCoverageForLibrary(db).groups.length,0);db.ownershipPolicy={providers:{kindle:true}};assert.equal(comicCoverageForLibrary(db).groups.length,1);
 }],
 ['chapters, excerpts, named works and collected volumes are not full comic issue coverage',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #1; excerpts from Alpha (2001) #9; Digital Chapters 1-15; "Origin"'),db=coverageDatabase(a);
   assert.equal(comicCoverageSummary(comicCoverageForLibrary(db).groups).covered,1);
   db.contentReviews[a.id]=confirmed([issue('1',{unitType:'volume'})]);assert.equal(comicCoverageForLibrary(db).groups.length,0);
 }],
 ['large missing ranges are counted compactly and paginated without materializing all numbers',()=>{
   const group={issues:[{number:'999999',copies:1}],duplicates:0};const range=comicRange(group);assert.equal(range.missing,999998);assert.deepEqual(range.missingRanges,[[1,999998]]);
   const last=comicIssuePage(group,{filter:'missing',page:19999,size:50});assert.equal(last.rows.at(-1).number,'999998');assert.equal(last.rows.length,48);
   assert.equal(comicRange({issues:[{number:'1/2',copies:1}]}).missing,0);assert.throws(()=>comicRange(group,-1));
   assert.equal(comicRange({issues:[{number:'3.1',copies:1}]}).missing,3);
 }],
 ['scoped starting preferences merge safely, reset independently, and survive ordinary navigation patches',()=>{
   const key=JSON.stringify(['doctor strange','1968','issue','en']),other=JSON.stringify(['doctor strange','1974','issue','en']);
   const one=mergeUiPreferences(defaultUiPreferences(),{workspace:'comic-coverage',comicCoverageStarts:{[key]:169}}),two=mergeUiPreferences(one,{comicCoverageStarts:{[other]:1},workspace:'library'});
   assert.equal(two.comicCoverageStarts[key],169);assert.equal(mergeUiPreferences(two,{comicCoverageStarts:{[key]:null}}).comicCoverageStarts[key],undefined);
   assert.throws(()=>validateUiPreferences({comicCoverageStarts:{[key]:1.5}}));assert.throws(()=>validateUiPreferences({comicCoverageStarts:{bad:169}}));
 }],
 ['starting-number preferences persist separately from database and backups',async()=>{
   const memory={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...memory}),set:async updates=>Object.assign(memory,structuredClone(updates))});
   const key=JSON.stringify(['alpha','2001','issue','en']),db=coverageDatabase(coverageBook('a'));await writer.restoreDatabase(db);const before=JSON.stringify(await writer.getDatabase());
   await writer.saveUiPreferences({comicCoverageStarts:{[key]:169}});await writer.saveUiPreferences({workspace:'library'});assert.equal((await writer.getUiPreferences()).comicCoverageStarts[key],169);assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const backup=createBackup(await writer.getDatabase());assert(!JSON.stringify(backup).includes('comicCoverageStarts'));assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup))).providerItems,(await writer.getDatabase()).providerItems);
 }]
];
