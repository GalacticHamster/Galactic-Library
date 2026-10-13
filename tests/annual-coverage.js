import assert from 'node:assert/strict';
import {checkAnnualCoverageFixture} from './annual-coverage-fixture.js';
import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {addSeriesMerge} from '../src/lib/comic-series-merges.js';
import {createBackup,parseBackup,parseBackupPreferences} from '../src/lib/storage.js';
import {defaultUiPreferences} from '../src/lib/ui-preferences.js';
import {normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
export const annualCoverageTests=[
 ['saved X-Men annual statements resolve one original sequence and retain the separate modern annual',()=>{checkAnnualCoverageFixture();}],
 ['annual source-supported aliases generalize without equating every suffix or numbering reset',()=>{
   const anchor=coverageBook('anchor','Collects Mighty Star Rangers (1980) #50-51, Star Rangers Annual (1970) #5',{title:'Mighty Star Rangers Masterworks Vol. 1 (Mighty Star Rangers (1960-1990))'});
   const undated=coverageBook('undated','Collects Mighty Star Rangers #40-42, Star Rangers Annual #4',{title:'Mighty Star Rangers Masterworks Vol. 2 (Mighty Star Rangers (1960-1990))'});
   const modern=coverageBook('modern','Collects Star Rangers (1991) #1-2, Star Rangers Annual (1992) #1');
   const other=coverageBook('other','Collects Different Rangers (1960) #1, Rangers Annual #5');
   const reset=coverageBook('reset','Collects Mighty Star Rangers (1980) #1, Annual #1');
   let groups=comicCoverageForLibrary(coverageDatabase(anchor,undated,modern,other)).groups;
   assert.deepEqual(groups.find(g=>g.series==='Mighty Star Rangers'&&g.unitType==='annual').issues.map(i=>i.number),['4','5']);
   assert(groups.some(g=>g.series==='Star Rangers'&&g.run==='1991'&&g.unitType==='annual'));
   assert(!groups.some(g=>g.series==='Different Rangers'&&g.unitType==='annual'));
   groups=comicCoverageForLibrary(coverageDatabase(anchor,undated,modern,reset)).groups;
   assert(groups.some(g=>g.series==='Mighty Star Rangers'&&g.unitType==='annual'&&g.run==='1980'));
   assert(!groups.some(g=>g.series==='Mighty Star Rangers'&&g.unitType==='annual'&&g.run==='1960'&&g.issues.some(i=>i.number==='1')));
 }],
 ['annual date anchors coalesce same-start labels, preserve conflicts, and do not borrow unrelated parents',()=>{
   const a=coverageBook('a','Collects Alpha (1963) #18-38, Annual (1964) #2'),b=coverageBook('b','Collects Alpha #20',{title:'Alpha Vol. 2 (Alpha (1963-1998))'}),c=coverageBook('c','Collects Alpha Annual (1964) #3');
   let result=comicCoverageForLibrary(coverageDatabase(a,b,c));assert.deepEqual(result.groups.find(g=>g.unitType==='annual').issues.map(i=>i.number),['2','3']);
   const competing=coverageBook('competing','Collects Alpha (1960) #1, Annual (1964) #4');
   result=comicCoverageForLibrary(coverageDatabase(a,b,c,competing));assert(result.provisional>=1,'Contradictory dated anchors must stay unresolved');
   const ended=coverageBook('ended','Collects Alpha (1963-1963) #1, Annual (1964) #1');result=comicCoverageForLibrary(coverageDatabase(a,ended));assert(!result.groups.some(g=>g.unitType==='annual'&&g.issues.some(i=>i.number==='1')));
   const anthology=coverageBook('anthology','Collects Beta (2001) #1; Gamma Annual (1964) #3',{title:'Beta Collection (Beta (2001))'});assert(!comicCoverageForLibrary(coverageDatabase(anthology)).groups.some(g=>g.unitType==='annual'));
   const repeated=coverageBook('repeated','Collects Alpha (1963) #1; Alpha (1999) #1; Alpha Annual (1964) #1, Alpha Annual (2000) #1'),mixed=comicCoverageForLibrary(coverageDatabase(repeated));assert.equal(mixed.provisional,1);assert.equal(mixed.groups.find(g=>g.unitType==='annual').issues[0].copies,1);
   const open=coverageBook('open','Collects Beta #1, Annual #1',{title:'Beta (2018-) Vol. 1'}),older=coverageBook('older','Collects Beta (2011) #1');assert(comicCoverageForLibrary(coverageDatabase(open,older)).groups.some(g=>g.unitType==='annual'&&g.run==='2018-'));
   const unbounded=coverageBook('unbounded','Collects Beta Annual #3',{title:'Different Collection'});assert.equal(comicCoverageForLibrary(coverageDatabase(older,unbounded)).groups.find(g=>g.unitType==='annual').run,'','Undated annual must not acquire an unsupported date');
 }],
 ['annual inference respects reviews, access, repeated observations, user merges and backup restore',()=>{
   const {database,annual,separate}=checkAnnualCoverageFixture(),request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Unrelated listing',mediaType:'book',contents:[issue('7',{series:'Uncanny X-Men',run:'1963',unitType:'annual'})],contentsComplete:true}]},response=JSON.stringify(handleExternalApiRequest(database,request));
   const original=Object.values(database.providerItems).find(r=>r.providerItemId==='mw9'),copy=normalizeProviderItem({...original,recordRef:undefined,provider:'humble',providerItemId:'same-book',identifiers:{isbn13:['9781302923985']}});original.identifiers=copy.identifiers;database.providerItems[copy.id]=copy;
   let group=comicCoverageForLibrary(database).groups.find(g=>g.id===annual.id);assert.equal(group.issues.find(i=>i.number==='7').copies,1);
   copy.ownership='borrowed';assert.equal(comicCoverageForLibrary(database).groups.find(g=>g.id===annual.id).issues.find(i=>i.number==='7').copies,1);
   const merges=addSeriesMerge({},annual.id,separate.id,'User annuals',true),preferences={...defaultUiPreferences(),comicCoverageMerges:merges};
   const validated=validateDatabase(database),backup=createBackup(validated,preferences),restored=parseBackup(backup),prefs=parseBackupPreferences(backup);assert.deepEqual(prefs.comicCoverageMerges,merges);assert.deepEqual(comicCoverageForLibrary(restored,prefs.comicCoverageMerges).groups,comicCoverageForLibrary(validated,merges).groups);
   const oldLabel=JSON.stringify(['uncanny x men','1981','annual','en']),legacy=addSeriesMerge({},annual.id,oldLabel,'My Uncanny annuals',true),legacyPrefs={...defaultUiPreferences(),comicCoverageMerges:legacy,comicCoverageStarts:{[oldLabel]:3},comicCoverageTransitions:{[oldLabel]:[[12,16]]}},legacyBackup=createBackup(validated,legacyPrefs),roundTrip=parseBackupPreferences(legacyBackup),combined=comicCoverageForLibrary(parseBackup(legacyBackup),roundTrip.comicCoverageMerges).groups.find(g=>g.id===oldLabel);assert.equal(combined.covered,12);assert.equal(combined.partial,1);assert.equal(combined.series,'My Uncanny annuals');assert.deepEqual(roundTrip.comicCoverageStarts,legacyPrefs.comicCoverageStarts);assert.deepEqual(roundTrip.comicCoverageTransitions,legacyPrefs.comicCoverageTransitions);assert.equal(comicCoverageForLibrary(restored).groups.find(g=>g.id===annual.id).covered,12,'Undo must retain automatic supported annual grouping');
   database.contentReviews[original.id]=confirmed([issue('7',{series:'Original Reviewed Name',run:'1970',unitType:'annual'})]);assert(comicCoverageForLibrary(database).groups.some(g=>g.series==='Original Reviewed Name'&&g.run==='1970'));
   assert.equal(JSON.stringify(handleExternalApiRequest(restored,request)),response);
   const unresolved=libraryCoverageIndex(coverageDatabase(coverageBook('unknown','Collects Annual (1970) #1')));assert.equal(unresolved.index.size,0);
 }]
];
