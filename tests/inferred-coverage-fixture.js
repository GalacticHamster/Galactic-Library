import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {librarySeriesCoverage,libraryContentCoverage,collectionContents} from '../src/lib/inferred-coverage.js';
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
 ['missing run or language stays useful but source-local and cannot hide missing issues',()=>{
   const a=coverageBook('a','Collects Alpha #1, 3'),b=coverageBook('b','Collects Alpha #1, 3'),db=coverageDatabase(a,b);
   const {groups}=librarySeriesCoverage(db);
   assert(groups.length===2&&groups.every(g=>g.provisional&&!g.overlap.length&&!g.gaps.length&&g.possibleGaps[0]==='2'),'Unknown runs were merged or definitive gaps invented');
   const result=libraryContentCoverage(db,[issue()]);assert(!result.owned&&result.missing.length===1&&result.possibleCovered.length===1,'Provisional coverage hid missing issue');
   assert(result.possibleCovered[0].evidence.length===2,'Provisional parent evidence lost');
   a.metadata.language='';a.metadata.enrichment.kindleProductComicContents.statement='Collects Alpha (2001) #1';
   assert(libraryContentCoverage(coverageDatabase(a),[issue()]).owned===0,'Missing language became definitive');
 }],
 ['conflicting runs, series, issue types and languages never share exact coverage',()=>{
   const db=coverageDatabase(coverageBook('a'));
   for(const patch of [{run:'2011'},{series:'Beta'},{unitType:'annual'},{language:'ja'}]){
     const result=libraryContentCoverage(db,[issue('1',patch)]);assert(!result.owned&&!result.possibleCovered.length,'Conflicting scope matched');
   }
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
   a.metadata.enrichment.kindleProductComicContents.parserVersion=1;
   assert(collectionContents(a,db).parserVersion===CONTENTS_PARSER_VERSION,'Stale parser result reused');
   const result=libraryContentCoverage(db,[issue('2')]);assert(result.direct===1&&result.verified===0&&result.covered[0].evidence.length===2,'Direct issue ownership lost or called a contents review');
   assert(librarySeriesCoverage(db).groups[0].entries.length===2,'Same issue counted twice');
   direct.ownership='borrowed';assert(libraryContentCoverage(db,[issue('2')]).inferred===1,'Borrowed standalone provided owned evidence');
 }]
];
