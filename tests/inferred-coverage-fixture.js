import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {librarySeriesCoverage,libraryContentCoverage,collectionContents,resolveCoverageEntry} from '../src/lib/inferred-coverage.js';
import {validateContentReview,contentCoverage,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {selectManifest} from '../src/lib/kindle-manifest.js';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
export const coverageBook=(id,statement='Collects Alpha (2001) #1-3',patch={})=>normalizeProviderItem({provider:'kindle',providerItemId:id,title:'Collection '+id,mediaType:'book',ownership:'owned',metadata:{language:'en',enrichment:{kindleProductComicContents:{statement,parseInput:statement,parseOutcome:'full',parserVersion:CONTENTS_PARSER_VERSION}}},...patch});
export const coverageDatabase=(...items)=>({...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item]))});
export const issue=(number='1',patch={})=>({series:'Alpha',run:'2001',unitType:'issue',number,language:'en',completeness:'full',...patch});
export const confirmed=(entries,status)=>validateContentReview({entries,...(status?{status}:{}),statement:'Checked source',source:'manual-review',verifiedAt:'2026-10-12T12:00:00Z'});

export const inferredCoverageCases=[
 ['unreviewed full issues contribute inferred coverage without changing companion matching',()=>{
   const a=coverageBook('a'),db=coverageDatabase(a),before=JSON.stringify(db),request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Unrelated listing',mediaType:'book',contents:[issue()],contentsComplete:true}]};
   const response=JSON.stringify(handleExternalApiRequest(db,request)),result=libraryContentCoverage(db,[issue()]);
   assert(result.owned===1&&result.inferred===1&&result.verified===0,'Inferred issue missing');
   assert(librarySeriesCoverage(db).groups[0].entries.length===3,'Series coverage missing');
   assert(contentCoverage(db,[issue()]).owned===0&&JSON.stringify(handleExternalApiRequest(db,request))===response,'Companion classifications changed');
   assert(JSON.stringify(db)===before,'Coverage mutated source or ownership');
 }],
 ['verified corrections override automatic proposals and retain verified plus inferred provenance',()=>{
   const a=coverageBook('a'),b=coverageBook('b'),db=coverageDatabase(a,b);
   db.contentReviews[a.id]=confirmed([issue('2')]);
   const result=libraryContentCoverage(db,[issue('2')]);
   assert(result.verified===1&&result.inferred===0&&result.covered[0].evidence.length===2,'Verified precedence or parent provenance lost');
   const groups=librarySeriesCoverage(db).groups;
   assert(groups[0].entries.length===3&&groups[0].overlap.length===1,'Double count or correction ignored');
   delete db.providerItems[b.id];assert(libraryContentCoverage(db,[issue()]).owned===0,'Corrected-away issue came back');
 }],
 ['persistent rejection survives backup, source updates and parser changes',()=>{
   const a=coverageBook('a'),db=coverageDatabase(a);db.contentReviews[a.id]=confirmed([],'rejected');
   const restored=parseBackup(createBackup(validateDatabase(db)));
   assert(restored.contentReviews[a.id].status==='rejected','Rejection lost in backup');
   restored.providerItems[a.id].metadata.enrichment.kindleProductComicContents.parserVersion=1;
   restored.providerItems[a.id].metadata.enrichment.kindleProductComicContents.statement='Collects Alpha (2001) #1-8';
   assert(!librarySeriesCoverage(restored).groups.length,'Reparse revived rejected source');
   delete restored.contentReviews[a.id];assert(librarySeriesCoverage(restored).groups[0].entries.length===8,'Undo did not restore inferred source');
 }],
 ['explicit named series can share an unspecified run without a matching collection title',()=>{
   const a=coverageBook('a','Collects Alpha #1, 3'),b=coverageBook('b','Collects Alpha #1, 3'),db=coverageDatabase(a,b);
   const {groups}=librarySeriesCoverage(db);
   assert(groups.length===1&&!groups[0].provisional&&groups[0].overlap.length===2&&groups[0].gaps[0]==='2','Clear literal series stayed blocked by collection titles');
   const result=libraryContentCoverage(db,[issue()]);assert(!result.owned&&result.missing.length===1&&result.possibleCovered.length===1,'Provisional coverage hid missing issue');
   assert(result.possibleCovered[0].evidence.length===2,'Provisional parent evidence lost');
   a.metadata.language='';a.metadata.enrichment.kindleProductComicContents.statement='Collects Alpha (2001) #1';
   assert(libraryContentCoverage(coverageDatabase(a),[issue()]).owned===1,'Missing language did not default to English');
 }],
 ['generic runless labels remain source-local rather than grouping unrelated collections',()=>{
   const a=coverageBook('generic-a','Collects Comics #1',{title:'Comics Vol. 1'}),b=coverageBook('generic-b','Collects Comics #1',{title:'Comics Vol. 2'}),db=coverageDatabase(a,b);
   const groups=librarySeriesCoverage(db).groups;assert(groups.length===2&&groups.every(g=>g.provisional&&!g.overlap.length),'Generic label established cross-collection identity');
 }],
 ['conflicting runs, series, issue types and languages never share exact coverage',()=>{
   const db=coverageDatabase(coverageBook('a'));
   for(const patch of [{run:'2011'},{series:'Beta'},{unitType:'annual'},{language:'ja'}]){
     const result=libraryContentCoverage(db,[issue('1',patch)]);assert(!result.owned&&!result.possibleCovered.length,'Conflicting scope matched');
   }
 }],
 ['missing and explicit English deduplicate only in derived coverage; explicit non-English stays distinct',()=>{
   const a=coverageBook('default'),b=coverageBook('english'),fr=coverageBook('french');
   delete a.metadata.language;b.metadata.language='English';fr.metadata.language='fr';
   const db=coverageDatabase(a,b,fr),before=JSON.stringify(db),result=libraryContentCoverage(db,[issue('1',{language:''})]);
   assert(result.owned===1&&result.complete&&result.covered[0].evidence.length===2,'Default English missed explicit English or included French');
   const french=libraryContentCoverage(db,[issue('1',{language:'fr'})]);assert(french.owned===1&&french.covered[0].evidence.length===1,'Explicit French lost');
   const groups=librarySeriesCoverage(db).groups;assert(groups.length===2&&groups.find(g=>g.language==='en').entries.length===3,'Language identity did not deduplicate');
   assert(!libraryContentCoverage(coverageDatabase(fr),[issue()]).owned&&!libraryContentCoverage(coverageDatabase(fr),[issue()]).possibleCovered.length,'Explicit non-English fell back to English');
   assert(before===JSON.stringify(db),'Coverage rewrote source metadata');
 }],
 ['missing run uses exact parent series/year context without borrowing a different constituent run',()=>{
   const a=coverageBook('title-context','Collects Alpha #1-3',{title:'Alpha (2001) Vol. 1'}),b=coverageBook('explicit','Collects Alpha (2001) #1-3');
   const db=coverageDatabase(a,b),before=JSON.stringify(db),result=libraryContentCoverage(db,[issue()]);
   assert(result.owned===1&&result.covered[0].evidence.length===2,'Parent run did not join explicit source run');
   assert(resolveCoverageEntry(issue('1',{series:'Beta',run:''}),a).run==='','Parent Alpha supplied Beta run');
   const metadata=coverageBook('metadata','Collects Alpha #1');metadata.metadata.series=['Alpha'];metadata.metadata.run='2001';
   assert(libraryContentCoverage(coverageDatabase(metadata),[issue()]).owned===1,'Explicit metadata run ignored');
   metadata.metadata.series=['Alpha','Beta'];assert(resolveCoverageEntry(issue('1',{run:''}),metadata).run==='','Anthology run leaked to constituents');
   assert(before===JSON.stringify(db),'Context resolution altered provider evidence');
 }],
 ['explicit reviewed language overrides parent/default and comic defaults do not broaden volume identity',()=>{
   const a=coverageBook('review-language'),db=coverageDatabase(a);db.contentReviews[a.id]=confirmed([issue('1',{language:'fr'})]);
   assert(libraryContentCoverage(db,[issue('1',{language:'fr'})]).verified===1,'Explicit reviewed language overwritten');
   assert(!libraryContentCoverage(db,[issue('1',{language:''})]).owned,'French review became English through its parent');
   const volume=issue('1',{unitType:'volume',run:''});db.contentReviews[a.id]=confirmed([volume]);
   assert(!libraryContentCoverage(db,[volume]).owned&&librarySeriesCoverage(db).groups[0].provisional,'Comic default loosened reviewed volume scope');
 }],
 ['matching parent series supports run-unspecified overlap and gaps without inventing a year',()=>{
   const a=coverageBook('vol-one','Collects Alpha #1, 3',{title:'Alpha Vol. 1'}),b=coverageBook('vol-two','Collects Alpha #3-4',{title:'Alpha Vol. 2'}),db=coverageDatabase(a,b);
   const groups=librarySeriesCoverage(db).groups;
   assert(groups.length===1&&!groups[0].provisional&&groups[0].run===''&&groups[0].entries.length===3,'Strong run-unspecified series did not deduplicate');
   assert(groups[0].overlap.length===1&&groups[0].overlap[0].number==='3'&&groups[0].gaps.join()==='2','Overlap or combined known-span gap wrong');
   assert(groups[0].overlap[0].sources.length===2,'Supporting parent references lost');
   const result=libraryContentCoverage(db,[issue('3',{run:'',language:''})]);assert(result.owned===1&&result.complete&&result.inferred===1,'Run-unspecified target blocked despite strong parent series');
   const namedRun=libraryContentCoverage(db,[issue('3')]);assert(!namedRun.owned&&namedRun.possibleCovered.length===1,'An unspecified run became a known run');
 }],
 ['explicit standalone annuals and specials with missing runs retain their types when joining collections',()=>{
   const a=coverageBook('typed-collection','Collects Alpha Annual #1; Alpha Special #2',{title:'Alpha Vol. 1'}),annual=coverageBook('annual','',{title:'Alpha Annual #1'}),special=coverageBook('special','',{title:'Alpha Special #2'});
   delete annual.metadata.language;delete special.metadata.language;
   const db=coverageDatabase(a,annual,special),result=libraryContentCoverage(db,[issue('1',{run:'',unitType:'annual'}),issue('2',{run:'',unitType:'special'})]);
   assert(result.owned===2&&result.direct===2&&result.covered.every(entry=>entry.evidence.length===2),'Typed standalone context or default language lost');
   assert(!libraryContentCoverage(db,[issue('1',{run:''})]).owned,'Annual became ordinary issue');
 }],
 ['explicit conflicting runs keep weak/context-free and ambiguous runless parents separate even with exclusions',()=>{
   const a=coverageBook('a','Collects Alpha #1',{title:'Alpha Vol. 1'}),b=coverageBook('b','Collects Alpha #1',{title:'Alpha Vol. 2'}),old=coverageBook('old','Collects Alpha (1990) #1'),modern=coverageBook('modern','Collects Alpha (2001) #1');
   const db=coverageDatabase(a,b,old,modern),groups=librarySeriesCoverage(db).groups;
   assert(groups.length===4&&groups.filter(g=>g.provisional).length===2,'Known conflicting runs did not keep runless evidence separate');
   assert(!libraryContentCoverage(db,[issue('1',{run:''})]).owned,'Ambiguous runless target became definitive');
   assert(!libraryContentCoverage(db,[issue('1',{run:''})],{excludeItemIds:[old.id,modern.id]}).owned,'Exclusions erased identity conflict');
   assert(libraryContentCoverage(db,[issue()]).covered[0].evidence.length===1,'Distinct known runs merged');
   a.metadata.series=['Alpha'];a.metadata.run='1990';a.title='Alpha (2001) Vol. 1';
   assert(resolveCoverageEntry(issue('1',{run:''}),a).run==='','Conflicting parent run arbitrarily selected');
   assert(librarySeriesCoverage(coverageDatabase(a)).groups[0].provisional,'Conflicting parent context became shared identity');
 }],
 ['automatic coverage uses only the selected independent collection claim',()=>{
   const a=coverageBook('independent');
   const selected=selectManifest([{selector:'description',text:'Collects Alpha (2001) #1-3. Contains Beta (1990) #5-8.'}],a.title);
   a.metadata.enrichment.kindleProductComicContents={statement:selected.statement,manifest:selected.manifest};
   const db=coverageDatabase(a),proposal=collectionContents(a,db),series=new Set(proposal.entries.map(e=>e.series));
   assert(series.size===1,'Independent claims were unioned');
   assert(librarySeriesCoverage(db).groups.length===1,'Coverage expanded independent source');
   const excluded=libraryContentCoverage(db,[issue()],{excludeItemIds:[a.id]});assert(!excluded.owned&&!excluded.possibleCovered.length,'Excluded parent supplied coverage');
 }],
 ['chapters, excerpts and named works remain unresolved while print annuals and specials survive',()=>{
   const a=coverageBook('a','Collects Alpha (2001) #0, 1/2; Alpha Annual (2001) #1; Alpha Special (2001) #2; excerpts from Alpha (2001) #9; Digital Chapters 1-15; "Origin"'),db=coverageDatabase(a);
   const {groups,unresolved}=librarySeriesCoverage(db);
   assert(groups.reduce((n,g)=>n+g.entries.length,0)===4,'Chapters, excerpts or names became full issues');
   assert(unresolved.some(v=>v.reason==='excerpt')&&unresolved.some(v=>v.fragment?.includes('Chapters')),'Unresolved evidence discarded');
   assert(!libraryContentCoverage(db,[issue('9')]).owned,'Excerpt supplied full issue');
 }],
 ['ownership is reevaluated independently of contents confidence including preferences and expiry',()=>{
   for(const ownership of ['borrowed','subscription','unknown']){
     const a=coverageBook('a',undefined,{ownership}),db=coverageDatabase(a);
     assert(!librarySeriesCoverage(db).groups.length,'Temporary or unknown parent became owned');
     db.ownershipPolicy={providers:{kindle:true}};
     const result=libraryContentCoverage(db,[issue()]);assert(result.inferred===1&&result.covered[0].evidence[0].item.ownershipOverride.observedOwnership===ownership,'Preference provenance lost');
   }
   const a=coverageBook('a'),db=coverageDatabase(a);db.ownershipReviews[a.recordRef]={ownership:'owned',expiresAt:'2020-01-01',source:'user',confirmedAt:'2019-01-01'};
   assert(!librarySeriesCoverage(db).groups.length,'Expired access became permanent coverage');
 }],
 ['local current-generation interpretation and explicitly owned standalone issues join existing coverage',()=>{
   const a=coverageBook('a','Collecting Alpha (2001) #1-2'),direct=coverageBook('direct','',{title:'Alpha (2001) #2'}),db=coverageDatabase(a,direct);
   delete a.metadata.language;delete direct.metadata.language;
   a.metadata.enrichment.kindleProductComicContents.parserVersion=1;
   assert(collectionContents(a,db).parserVersion===CONTENTS_PARSER_VERSION,'Stale parser result reused');
   const result=libraryContentCoverage(db,[issue('2')]);assert(result.direct===1&&result.verified===0&&result.covered[0].evidence.length===2,'Direct issue ownership lost or called a contents review');
   assert(librarySeriesCoverage(db).groups[0].entries.length===2,'Same issue counted twice');
   direct.ownership='borrowed';assert(libraryContentCoverage(db,[issue('2')]).inferred===1,'Borrowed standalone provided owned evidence');
 }]
];
