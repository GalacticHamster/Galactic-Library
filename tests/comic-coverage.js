import assert from 'node:assert/strict';
import {comicRange,comicIssuePage,comicCoverageSummary,comicSeriesKey} from '../src/lib/comic-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {validateUiPreferences,mergeUiPreferences,defaultUiPreferences} from '../src/lib/ui-preferences.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
import {comicSeriesLabel,coverageSegments,comicGridPage} from '../src/ui/comic-coverage-presentation.js';
import {proposeContents,proposeContentsForReview} from '../src/lib/contents.js';
import {addSeriesMerge,validateComicCoverageMerges,mergeCoverageGroups} from '../src/lib/comic-series-merges.js';
export const comicCoverageTests=[
 ['Super Special titles keep their distinct parent names, runs and regular issue type',()=>{
   const titles=['Amazing Spider-Man','Spider-Man','Venom','Spectacular Spider-Man','Web of Spider-Man'].map(parent=>parent+' Super Special');
   const statement='Collects '+titles.map(title=>title+' (1995) #1').join(', ')+'.';
   for(const parser of [proposeContents,proposeContentsForReview])assert.deepEqual(parser(statement).entries.map(entry=>[entry.series,entry.run,entry.unitType]),titles.map(title=>[title,'1995','issue']));
   assert.equal(proposeContentsForReview('Collects Ultimate Spider-Man Super Special #1').entries[0].series,'Ultimate Spider-Man Super Special');
   const ordinary=proposeContentsForReview('Collects Alpha (2001) #1, Annual #2, Alpha Special #3');assert.deepEqual(ordinary.entries.map(entry=>entry.unitType),['issue','annual','special']);
   for(const title of ['The Special','The Annual']){const result=proposeContentsForReview('Collects '+title+' (1995) #1',title+' (1995)',{series:[title]});assert.equal(result.entries[0].series,title);assert.equal(result.entries[0].unitType,'issue');}
   const record=coverageBook('super',statement),db=coverageDatabase(record),before=JSON.stringify(db),groups=comicCoverageForLibrary(db).groups;assert.deepEqual(groups.map(group=>group.series).sort(),titles.sort());assert(groups.every(group=>group.run==='1995'&&group.unitType==='issue'));assert.equal(JSON.stringify(db),before);
 }],
 ['contextual annual dates retain parent runs and preserve excerpts and original evidence',()=>{
   const first='Collects Amazing Spider-Man (1963) #18-38, Annual (1964) #2.';
   const second='Collects Amazing Spider-Man (1963) #1-17 and Annual #1 and material from Amazing Fantasy (1962) #15.';
   for(const parser of [proposeContentsForReview]){
     assert.deepEqual(parser(first).entries.filter(e=>e.unitType==='annual').map(e=>[e.series,e.run,e.number]),[['Amazing Spider-Man','1963','2']]);
     assert.deepEqual(parser(second).entries.filter(e=>e.unitType==='annual').map(e=>[e.series,e.run,e.number]),[['Amazing Spider-Man','1963','1']]);
   }
   const result=proposeContentsForReview(second);assert.equal(result.entries.find(e=>e.series==='Amazing Fantasy').completeness,'excerpt');assert.equal(result.entries.find(e=>e.series==='Amazing Spider-Man'&&e.unitType==='issue').completeness,'full');
   assert.equal(proposeContentsForReview('Collects Annual (1964) #2.').entries.length,0);
   assert.equal(proposeContentsForReview('Collects Alpha (2001) #1; Beta (2005) #2, Annual (2006) #3.').entries.at(-1).run,'2005');
   const db=coverageDatabase(coverageBook('one',first),coverageBook('two',second)),before=JSON.stringify(db),groups=comicCoverageForLibrary(db).groups;
   const annual=groups.find(g=>g.unitType==='annual');assert.equal(annual.run,'1963');assert.deepEqual(annual.issues.map(i=>i.number),['1','2']);assert.equal(JSON.stringify(db),before);
 }],
 ['manual coverage merges combine units and recount source purchases without mutating originals',()=>{
   const a=coverageBook('a','Collects Peter Parker, the Spectacular Spider-Man (1976) #1-3'),b=coverageBook('b','Collects Spectacular Spider-Man (1976) #3-5');
   const db=coverageDatabase(a,b),before=JSON.stringify(db),original=comicCoverageForLibrary(db).groups;
   assert.equal(original.length,2);const aliases=addSeriesMerge({},original[0].id,original[1].id,'Spectacular Spider-Man'),merged=comicCoverageForLibrary(db,aliases).groups;
   assert.equal(merged.length,1);assert.deepEqual(merged[0].issues.map(i=>i.number),['1','2','3','4','5']);assert.equal(merged[0].duplicates,1);assert.equal(merged[0].issues[2].sources.length,2);assert.equal(comicRange(merged[0]).missing,0);assert.equal(merged[0].series,'Spectacular Spider-Man');
   db.canonicalItems={same:{id:'same',title:'Same edition',mediaType:'book',providerItemIds:[a.id,b.id]}};assert.equal(comicCoverageForLibrary(db,aliases).groups[0].duplicates,0);
   db.canonicalItems=JSON.parse(before).canonicalItems;assert.equal(JSON.stringify(db),before);assert.equal(comicCoverageForLibrary(db,{}).groups.length,2);
   for(const scope of [['other','1977','issue','en'],['other','1976','annual','en'],['other','1976','issue','fr']])assert.throws(()=>addSeriesMerge({},original[0].id,JSON.stringify(scope),'Wrong'));
   assert.throws(()=>addSeriesMerge(aliases,original[0].id,original[1].id,'Again'));assert.throws(()=>validateComicCoverageMerges({bad:{members:[],title:'bad'}}));
 }],
 ['series merges unify equivalent fractional units and preserve strongest source confidence',()=>{
   const source=JSON.stringify(['old name','1976','issue','en']),target=JSON.stringify(['new name','1976','issue','en']),third=JSON.stringify(['third name','1976','issue','en']);
   const aliases=addSeriesMerge({},source,target,'New name'),record={id:'same-book'},groups=[{id:source,series:'Old name',issues:[{number:'1/2',confidence:'inferred',sources:[{id:record.id,record,confidence:'inferred'}]}]},{id:target,series:'New name',issues:[{number:'0.5',confidence:'verified',sources:[{id:record.id,record,confidence:'verified'}]}]}];
   const before=JSON.stringify(groups),result=mergeCoverageGroups(groups,aliases,records=>new Set(records.map(record=>record.id)).size);
   assert.equal(result[0].issues.length,1);assert.equal(result[0].duplicates,0);assert.equal(result[0].issues[0].confidence,'verified');assert.equal(result[0].issues[0].sources[0].confidence,'verified');assert.equal(JSON.stringify(groups),before);
   const combined=addSeriesMerge(aliases,third,source,'All names');assert.equal(Object.keys(combined).length,1);assert.deepEqual(combined[target].members,[target,source,third]);assert.throws(()=>addSeriesMerge(combined,third,target,'Again'));
 }],
 ['series merges survive queued preference edits and backup restore and can be undone',async()=>{
   const memory={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...memory}),set:async updates=>Object.assign(memory,structuredClone(updates))});
   const db=coverageDatabase(coverageBook('a'));await writer.restoreDatabase(db);const before=JSON.stringify(await writer.getDatabase());
   const source=JSON.stringify(['peter parker the spectacular spider man','1976','issue','en']),target=JSON.stringify(['spectacular spider man','1976','issue','en']);
   await writer.saveComicCoverageMerge(source,target,'Spectacular Spider-Man');await writer.saveUiPreferences({workspace:'library'});
   const backup=createBackup(await writer.getDatabase(),await writer.getUiPreferences());await writer.removeComicCoverageMerge(target);assert.deepEqual((await writer.getUiPreferences()).comicCoverageMerges,{});
   await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));assert.equal((await writer.getUiPreferences()).comicCoverageMerges[target].title,'Spectacular Spider-Man');assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const oldBackup=createBackup(db);await writer.restoreDatabase(parseBackup(oldBackup),parseBackupPreferences(oldBackup));assert.equal((await writer.getUiPreferences()).comicCoverageMerges[target].title,'Spectacular Spider-Man');
   assert.throws(()=>parseBackup({...backup,comicCoverageMerges:{[target]:{members:[target,JSON.stringify(['different','1995','issue','en'])],title:'Invalid'}}}));
   await writer.execute('removeComicCoverageMerge',[target]);assert.deepEqual((await writer.getUiPreferences()).comicCoverageMerges,{});
 }],
 ['coverage presentation keeps ranges, duplicates, special numbers and disambiguating labels',()=>{
   const group={series:'52',run:'',unitType:'issue',language:'en',issues:[{number:'0',copies:1},{number:'1/2',copies:1},{number:'3',copies:1},{number:'5',copies:2}]};
   assert.equal(comicSeriesLabel(group),'52');assert.equal(comicSeriesLabel({...group,series:'Amazing Spider-Man',run:'1963'}),'Amazing Spider-Man (1963)');
   assert.equal(comicSeriesLabel(group,[group,{...group,language:'fr'}]),'52 · en');
   assert.equal(comicSeriesLabel(group,[group,{...group,unitType:'annual'}]),'52 · issues');
   assert.deepEqual(coverageSegments(group).segments,[{first:1,last:2,status:'missing'},{first:3,last:3,status:'owned'},{first:4,last:4,status:'missing'},{first:5,last:5,status:'duplicate'}]);
   const grid=comicGridPage(group);assert.deepEqual(grid.rows.map(row=>row.number),['1','2','3','4','5']);assert.deepEqual(grid.extras.map(row=>row.number),['0','1/2']);assert.equal(grid.rows[4].copies,2);
   assert.deepEqual(comicGridPage(group,{start:3}).rows.map(row=>row.number),['3','4','5']);
 }],
 ['long coverage grids remain bounded and preserve exact range positions',()=>{
   const group={issues:[{number:'1',copies:1},{number:'169',copies:2},{number:'999999',copies:1}]};
   const grid=comicGridPage(group,{page:1});assert.equal(grid.rows.length,100);assert.equal(grid.first,101);assert.equal(grid.last,200);assert.equal(grid.rows[68].copies,2);
   assert.equal(coverageSegments(group).segments.reduce((sum,segment)=>sum+segment.last-segment.first+1,0),999999);
   assert.equal(comicGridPage(group,{page:999999}).rows.at(-1).number,'999999');
   assert.equal(validateUiPreferences({workspace:'overlap'}).workspace,'comic-coverage');
 }],
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
 ['starting-number preferences round-trip atomically in backups without changing library records',async()=>{
   const memory={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...memory}),set:async updates=>Object.assign(memory,structuredClone(updates))});
   const key=JSON.stringify(['alpha','2001','issue','en']),db=coverageDatabase(coverageBook('a'));await writer.restoreDatabase(db);const before=JSON.stringify(await writer.getDatabase());
   await writer.saveUiPreferences({comicCoverageStarts:{[key]:169}});await writer.saveUiPreferences({workspace:'library'});assert.equal((await writer.getUiPreferences()).comicCoverageStarts[key],169);assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const old=createBackup(await writer.getDatabase());assert(!JSON.stringify(old).includes('comicCoverageStarts'));
   const backup=JSON.parse(JSON.stringify(createBackup(await writer.getDatabase(),await writer.getUiPreferences())));
   await writer.saveUiPreferences({comicCoverageStarts:{[key]:null},appearance:'light'});
   await writer.restoreDatabase(parseBackup(backup),parseBackupPreferences(backup));
   assert.equal((await writer.getUiPreferences()).comicCoverageStarts[key],169);assert.equal((await writer.getUiPreferences()).appearance,'light');
   assert.equal(JSON.stringify(await writer.getDatabase()),before);
   await writer.restoreDatabase(parseBackup(old),parseBackupPreferences(old));assert.equal((await writer.getUiPreferences()).comicCoverageStarts[key],169);
   const bad={...backup,comicCoverageStarts:{bad:169}};assert.throws(()=>parseBackup(bad));await assert.rejects(()=>writer.restoreDatabase(db,{comicCoverageStarts:bad.comicCoverageStarts}));assert.equal(JSON.stringify(await writer.getDatabase()),before);
   const empty=createBackup(db,{comicCoverageStarts:{}});await writer.restoreDatabase(parseBackup(empty),parseBackupPreferences(empty));assert.deepEqual((await writer.getUiPreferences()).comicCoverageStarts,{});
 }]
];
