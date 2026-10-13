import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
import {collectionContents,resolveCoverageEntry} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {naturalContentsClaims,recoveredNaturalContents} from '../src/lib/contents-quality.js';
import {manifestReviewProposal,selectManifest} from '../src/lib/kindle-manifest.js';
import {contentsStatement,proposeContentsForReview} from '../src/lib/contents.js';
import {contentsParseState} from '../src/lib/kindle-contents.js';
import {contentsSummary} from '../src/ui/contents-overview.js';
import {seriesMergeTargets} from '../src/ui/comic-coverage-presentation.js';
import {continuityProblem,addSeriesMerge,mergeCoverageGroups} from '../src/lib/comic-series-merges.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
export function recoveryBook(fixture,id='recovery',empty=false){
 const record=coverageBook(id,empty?'':fixture.text,{title:fixture.title});
 const saved=record.metadata.enrichment.kindleProductComicContents;
 saved.manifest={interpretationVersion:2,title:fixture.title,blocks:[{selector:'#description',text:fixture.text}],candidates:[],selected:-1,secondary:[],descriptionMayBeIncomplete:fixture.text.endsWith('Read more')};
 saved.availability=empty?'no-statement':'statement-found';
 saved.productDetailsEvidence={observations:[{field:'series',status:'observed',value:'Part of: '+fixture.providerSeries}]};
 return record;
}
export function checkRecoveredNatural(fixture){
 const record=recoveryBook(fixture,'natural',true),before=JSON.stringify(record),db=coverageDatabase(record),proposal=collectionContents(record,db),counts={};
 for(const entry of proposal.entries){assert(entry.completeness==='full','Natural reprints became excerpts');counts[entry.series]=(counts[entry.series]??0)+1;}
 assert(JSON.stringify(counts)===JSON.stringify(fixture.counts),'Recovered named ranges changed: '+fixture.title+' '+JSON.stringify(counts));
 for(const fragment of fixture.unresolved??[])assert(proposal.unparsed.includes(fragment),'Named Special was discarded or coerced');
 const current=selectManifest(savedBlocks(record),record.title),fresh=manifestReviewProposal({statement:current.statement,manifest:current.manifest},record.title);
 assert(JSON.stringify(fresh.entries)===JSON.stringify(proposal.entries),'New capture and saved recovery disagree');
 assert(contentsStatement(record,{recoverNatural:true})===proposal.manifestEvidence,'Editor lost raw recovered source');assert(contentsParseState(record).parseOutcome===proposal.outcome,'Status and editor disagree');const cached={...record,metadata:{...record.metadata,enrichment:{kindleProductComicContents:{...record.metadata.enrichment.kindleProductComicContents,manifest:current.manifest}}}};assert(contentsSummary(cached,db).hasStatement,'Recovered validated result still appears empty');assert(JSON.stringify(record)===before,'Recovery changed original source');
 return {record,db,proposal};
}
const savedBlocks=record=>record.metadata.enrichment.kindleProductComicContents.manifest.blocks;
export function checkDcFixture(fixtures){
 for(const c of fixtures.natural)checkRecoveredNatural(c);
 const books=fixtures.explicit.map((c,i)=>recoveryBook(c,'explicit-'+i)),db=coverageDatabase(...books),before=JSON.stringify(db),result=comicCoverageForLibrary(db);
 for(const c of fixtures.explicit){const book=books.find(book=>book.title===c.title),group=result.groups.find(g=>g.series.toLowerCase()==='detective comics'&&g.run===c.run&&g.unitType==='issue');for(const n of c.numbers)assert(group?.issues.find(i=>i.number===n)?.sources.some(source=>source.id===book.id),'Explicit provider series context failed: '+c.title+' #'+n);}
 assert(result.groups.find(g=>g.run==='2016-'&&g.unitType==='issue').issues.find(i=>i.number==='1000').partial,'Story became a full issue');
 const reviewed=coverageDatabase(books[2]);reviewed.contentReviews[books[2].id]=confirmed([issue('969',{series:'Batman - Detective Comics',run:'2016-'})]);assert(comicCoverageForLibrary(reviewed).groups[0].series==='Batman - Detective Comics','Captured metadata replaced a verified series name');
 const fifties=recoveryBook(fixtures.fifties,'fifties');db.providerItems[fifties.id]=fifties;
 const parsed=collectionContents(fifties,db).entries.filter(e=>/detective comics/iu.test(e.series));assert(JSON.stringify(parsed.map(e=>e.number))===JSON.stringify(fixtures.fifties.numbers),'Fifties extraction lost issues');
 const next=comicCoverageForLibrary(db);assert(next.unassigned.some(g=>g.series==='Detective Comics'&&g.numbers.length===14),'Unassigned Fifties evidence hidden');assert(!next.groups.some(g=>g.issues.some(i=>i.sources.some(source=>source.id===fifties.id))&&g.series==='Detective Comics'),'No original run evidence exists in this small fixture: Batman era must not invent one or select New 52');
 delete db.providerItems[fifties.id];assert(JSON.stringify(db)===before,'Projection changed source data');
}
export const dcContentsRecoveryCases=[
 ['natural reprint grammar accepts only bounded collection claims and preserves independent claims',()=>{
   for(const text of ['In these stories from the pages of Alpha #1-3, a villain recalls Omega #9.','These stories were originally published in Alpha #1-3.','This volume reprints stories originally published in Alpha #1-3.']){
     const claims=naturalContentsClaims(text);assert(claims.length===1,'Positive claim missing');assert(!claims[0].raw.includes('Omega'),'Plot escaped enumerative scope');assert(proposeContentsForReview(claims[0].raw).entries.length===3,'Explicit range missing');
   }
   for(const text of ['Batman first appeared in Detective Comics #27.','He sprang from the pages of Action Comics #1.','This guide discusses stories originally published in Alpha #1-3.','Also available: In these stories from the pages of Alpha #1-3.','These stories were originally published in Alpha Digital Chapters #1-3.','In these stories from the pages of Alpha #3-1.'])assert(!naturalContentsClaims(text).some(c=>proposeContentsForReview(c.raw).entries.length),'Historical/promotion/chapters/malformed range became coverage: '+text);
   const a={statement:'',manifest:{blocks:[{text:'In these tales from Alpha #1-3. These stories were originally published in Beta #1-3.'}]}};assert(recoveredNaturalContents(a)===null,'Independent claims were combined or guessed');
   a.statement='Collects Existing #1';assert(recoveredNaturalContents(a)===null,'Saved selection replaced by a new claim');
 }],
 ['captured product-series context resolves literal subjects only and preserves conflicting explicit runs',()=>{
   const source={title:'Alpha (2016-) Vol. 1',providerSeries:'Alpha (2016-)',text:'Collects Alpha #934-940; Beta #27-29'},record=recoveryBook(source),entries=collectionContents(record,coverageDatabase(record)).entries;
   assert(resolveCoverageEntry(entries[0],record).run==='2016-','Product run missing');assert(resolveCoverageEntry(entries.at(-1),record).run==='','Run leaked across anthology');
   assert(resolveCoverageEntry({...entries[0],run:'volume 1'},record).run==='volume 1','Explicit volume run overwritten');
   record.title='Alpha (2011) Vol. 1';assert(resolveCoverageEntry(entries[0],record).run==='','Contradictory captured/subject run guessed');
 }],
 ['merge discovery searches all runs with similar names first while reset numbering stays incompatible',()=>{
   const groups=comicCoverageForLibrary(coverageDatabase(coverageBook('old','Collects Detective Comics (1937) #27-45'),coverageBook('new52','Collects Detective Comics (2011) #1-29'),coverageBook('legacy','Collects Detective Comics (2016) #934-940'),coverageBook('unrelated','Collects Wonder Woman (1937) #1-2'))).groups;
   const old=groups.find(g=>g.run==='1937'&&g.series==='Detective Comics'),new52=groups.find(g=>g.run==='2011'),legacy=groups.find(g=>g.run==='2016'),targets=seriesMergeTargets(old,groups);
   assert(targets.slice(0,2).every(g=>g.series==='Detective Comics'),'Unrelated targets outranked exact names');assert(seriesMergeTargets(old,groups,'Detective').length===2,'Different runs hidden during search');assert(continuityProblem(old,new52),'Reset was accepted');assert(continuityProblem(new52,legacy)==='','Non-overlapping continuation reported conflict');assert(continuityProblem(old,legacy)==='','Legacy numbering rejected');
   const merge=addSeriesMerge({},old.id,legacy.id,'Detective Comics',true),combined=mergeCoverageGroups([old,legacy],merge,()=>1)[0];assert(combined.covered===26&&combined.duplicates===0,'Legacy merge manufactured duplicates');
 }]
];
