import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proposeContentsForReview,proposeContents,validateContents,ownedContentIndex} from '../src/lib/contents.js';
import {assessContentsQuality,normalizeContentsInput} from '../src/lib/contents-quality.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateEnrichment} from '../src/lib/metadata-validation.js';

const fixtures=JSON.parse(readFileSync(new URL('./kindle-contents-quality-fixtures.json',import.meta.url),'utf8')).fixtures;
const parse=statement=>proposeContentsForReview(statement,'A collection');
const byId=id=>fixtures.find(row=>row.auditId===id);
const scope=proposal=>[proposal.entries.filter(e=>e.completeness==='full').length,proposal.entries.filter(e=>e.completeness==='excerpt').length];

export const kindleContentsQualityTests=[
 ['quality rejects generalized features/topics/credits without blocking eligible non-comic work claims',()=>{
  for(const statement of ['Includes wireless delivery','Includes maps, photos, and firsthand accounts','including writers Jane Doe and John Smith','Includes information about the world','Includes 30 recipes for dinner','include 1) Customer Advocacy 2) Brand Development and 3) Management Structures']){
   const result=parse(statement);assert.equal(result.outcome,'filtered',statement);assert.equal(result.entries.length,0);
  }
  for(const statement of ['Contains Novel Cycle Books 1-4','Comprises Epic Volumes 1-3','Includes "Room", "The Room", and "A Room of One’s Own"','Includes Wool, Shift and Dust'])assert.equal(parse(statement).outcome,'full',statement);
  for(const statement of ['collects the five Wool books into a single volume','Containing all four novels of the series','including his special Neverwhere tale, “How the Marquis Got His Coat Back”'])assert.notEqual(parse(statement).quality,'filtered');
  for(const statement of ['including Chris Sprouse, Frazer Irving and Yanick Paquette','Includes Jane Doe, John Smith and Max Byrd','Includes Cloud Storage, Automatic Updates and Wireless Delivery','includes Red Right Return and Green to Go','including Naruto, Bleach and One Piece','Collects Ms','including her own','contains interviews from guitar designers'])assert.equal(proposeContentsForReview(statement,'Ordinary novel').outcome,'uncertain',statement);
 }],
 ['all seven audited semantic false-fulls cannot produce full proposals or bogus components',()=>{
  assert.equal(fixtures.filter(row=>row.falseFull).length,7);
  for(const row of fixtures.filter(row=>row.falseFull)){
   const p=proposeContentsForReview(row.statement,row.title);assert.notEqual(p.outcome,'full',String(row.auditId));assert.equal(p.entries.length,0,String(row.auditId));
  }
 }],
 ['all 16 audited structural-full cases preserve actual units/titles or become explicitly unresolved',()=>{
  const expected=new Map([[299,10],[300,10],[621,7],[1169,6],[489,6],[1360,4],[155,6],[230,7],[444,8],[445,10],[801,24],[1164,8],[1280,6],[1303,25]]);
  assert.equal(fixtures.filter(row=>row.structural).length,16);
  for(const [id,count]of expected){const row=byId(id),p=proposeContentsForReview(row.statement,row.title);assert.equal(p.entries.length,count,String(id));assert.equal(p.outcome,'full',String(id));assert.ok(p.entries.every(e=>!/^stories from|^issues |^the entire/iu.test(e.series)));}
  const hawkeye=proposeContentsForReview(byId(621).statement,byId(621).title);assert.deepEqual(hawkeye.entries.map(e=>e.number),['17','12','13','15','19','21','22']);assert.ok(hawkeye.entries.every(e=>e.series==='Hawkeye'&&e.run==='2012'&&e.unitType==='issue'));
  assert.ok(parse(byId(489).statement).entries.some(e=>e.number==='SUPERMAN, INC.'));
  assert.ok(parse(byId(1169).statement).entries.some(e=>e.unitType==='annual'&&e.number==='1'));
  for(const id of [973,1438])assert.notEqual(proposeContentsForReview(byId(id).statement,byId(id).title).outcome,'full');
 }],
 ['all 28 Read-more baseline cases retain raw evidence and become full except the independently unsupported prose-label case',()=>{
  const selected=fixtures.filter(row=>row.readMore28);assert.equal(selected.length,28);
  for(const row of selected){const before=row.statement,p=proposeContentsForReview(before,row.title);assert.equal(row.statement,before);assert.equal(p.descriptionMayBeIncomplete,true);assert.ok(!/Read more$/iu.test(p.normalizedInput));assert.equal(p.outcome,row.auditId===1208?'partial':'full',String(row.auditId));}
  assert.equal(normalizeContentsInput('Collects Comic #1-6.The next adventure'),'Collects Comic #1-6');
  assert.equal(normalizeContentsInput('Collecting Comic #1-6." Read more'),'Collecting Comic #1-6');
  assert.equal(normalizeContentsInput('Includes "Mr. Fox", "A.B. Story" and "C!"'),'Includes "Mr. Fox", "A.B. Story" and "C!"');
 }],
 ['100 Bullets hydration observations preserve earlier evidence and never synthesize later omitted issue ranges',()=>{
  const observed=[{title:'100 Bullets: Book Four',early:'including the pivotal story arcs "A Wake" and "Punch Line."',later:'Collects 100 BULLETS #59-80',count:22,first:'59'},
   {title:'100 Bullets: Book Five',early:'containing an untraceable gun and 100 rounds of ammunition',later:'Collects 100 BULLETS #81-100',count:20,first:'81'}];
  for(const item of observed){
   const early=item.early+' Read More',p=proposeContentsForReview(early,item.title);assert.equal(p.descriptionMayBeIncomplete,true);assert.equal(p.outcome,'uncertain');assert.equal(p.entries.length,0);assert.equal(p.normalizedInput,early);
   const late=proposeContentsForReview(item.later,item.title);assert.equal(late.entries.length,item.count);assert.equal(late.entries[0].number,item.first);assert.ok(late.entries.every(e=>e.series==='100 BULLETS'));
   assert.equal(late.descriptionMayBeIncomplete,false,'lack of marker is not a page-completeness guarantee');
  }
  assert.equal(parse('Collects Comic #1-3 Read More').descriptionMayBeIncomplete,true);
  assert.equal(normalizeContentsInput('Includes Wool, Shift and Dust Read More'),'Includes Wool, Shift and Dust Read More');
 }],
 ['excerpt scopes apply to qualified lists, full units before them survive, and ambiguous semicolon transitions remain unresolved',()=>{
  assert.deepEqual(scope(parse('Collects A #1-6 and material from B #7')), [6,1]);
  assert.deepEqual(scope(parse('Collects A #1-2, material from B #7, #9 and C #10')), [2,3]);
  assert.deepEqual(scope(parse('Collects A #1-2; excerpts from B #3-4; selections from C #5')), [2,3]);
  assert.deepEqual(scope(parse('Collects material from A #1-3 and B #4')), [0,4]);
  const uncertain=parse('Collects A #1-2; material from B #3; C #4; D #5');assert.deepEqual(scope(uncertain),[2,1]);assert.equal(uncertain.outcome,'partial');assert.equal(uncertain.unparsed.length,2);
  const reset=parse('Collects A #1-2; material from B #3; Collects C #4');assert.deepEqual(scope(reset),[3,1]);assert.equal(reset.outcome,'full');
  for(const [id,counts]of [[46,[18,1]],[53,[16,1]],[54,[18,2]],[56,[18,1]],[113,[24,3]],[539,[18,2]],[540,[21,2]],[839,[0,14]],[841,[0,19]],[1050,[14,1]],[1078,[14,13]],[1358,[0,18]]])assert.deepEqual(scope(parse(byId(id).statement)),counts,String(id));
  const captain=parse(byId(500).statement);assert.deepEqual(scope(captain),[13,3]);assert.ok(captain.entries.filter(e=>e.completeness==='excerpt').every(e=>e.series==='Mighty World of Marvel'));assert.ok(!captain.entries.some(e=>e.series==='Excalibur'&&Number(e.number)>11));
  const strange=parse(byId(462).statement);assert.ok(!strange.entries.some(e=>e.series==='Marvel Premiere'&&['3','4','5'].includes(e.number)&&e.completeness==='excerpt'));
  const werewolf=parse(byId(1446).statement);assert.ok(!werewolf.entries.some(e=>e.series==='Ghost Rider'&&e.number==='30'));
  const aliens=parse(byId(32).statement);assert.ok(aliens.entries.some(e=>e.series==='Aliens, Earth War'));assert.ok(!aliens.entries.some(e=>e.series==='Earth War'));
  const carnage=parse(byId(1437).statement);assert.ok(carnage.entries.some(e=>e.series==='Carnage: Black, White & Blood'));assert.ok(!carnage.entries.some(e=>e.series==='White & Blood'));
  const cloneWars=parse(byId(1083).statement);assert.ok(!cloneWars.entries.some(e=>e.series.includes('Visionaries (2005), Star Wars Tales')),'two dated works must not be merged into one series');
  const onslaught=parse(byId(1511).statement);assert.ok(onslaught.entries.some(e=>e.series==='Excalibur'&&e.number==='100'&&e.completeness==='excerpt'));assert.ok(onslaught.entries.some(e=>e.series==='Fantastic Four'&&e.number==='416'&&e.completeness==='excerpt'));assert.ok(!onslaught.entries.some(e=>e.series.startsWith('Onslaught: X-Men,')));
  assert.equal(parse(byId(839).statement).outcome,'partial','2#5 is ambiguous source syntax, not a safely identified series');
  const risks=fixtures.filter(row=>row.excerptRisk);assert.equal(risks.length,120);
  for(const row of risks){const p=proposeContentsForReview(row.statement,row.title);assert.notEqual(p.quality,'filtered');assert.ok(p.entries.every(e=>!/^material from|^excerpts? from|^selections? from/iu.test(e.series)));if(p.entries.length)assert.doesNotThrow(()=>validateContents(p.entries));if(p.outcome==='full')assert.equal(p.unparsed.length,0);}
 }],
 ['deterministic range extensions have adversarial bounds, no guessed series and no numeric named fallback',()=>{
  assert.equal(parse('Collects issues 1-16 of Harrow County').entries.length,16);
  assert.equal(parse('Collects Comic (2012) 17, 12-13, 15, 19, 21-22').entries.length,7);
  assert.equal(parse('Collects Library Books 1-4').entries.length,4);
  for(const statement of ['Collects issues #1-4','Collects issues 1-4 of the original series','Collects issues #1-12 plus the complete script for issue #3','Collects Comic #1-99999','Collects Comic #645-50','Collects Comic #-1','Collects Comic #1234567'])assert.equal(parse(statement).entries.length,0,statement);
  assert.equal(parse('Collects Comic #1-2 and bonus essays').outcome,'partial');
  assert.equal(parse('Collects Batman: Black and White #1-4').entries[0].series,'Batman: Black and White');
  assert.deepEqual(parse('Includes "Alpha and Omega", "In Red, with Pearls", and "Third Story"').entries.map(e=>e.number),['Alpha and Omega','In Red, with Pearls','Third Story']);
  assert.equal(parse('Includes "First Story", "Second Story", praised by everyone').outcome,'failed');
  assert.equal(parse('Includes stories by Jane Doe and John Smith').entries.length,0);
  assert.equal(proposeContents('Includes Wool, Shift and Dust').entries.length,0,'ordinary matching parser must not gain named discovery');
 }],
 ['generation changes re-filter saved evidence in batches with zero network, unchanged review/identity and undoable history',async()=>{
  const items=Array.from({length:6},(_,n)=>normalizeProviderItem({provider:'kindle',providerItemId:'B00000000'+n,title:n===0?'Wool Omnibus':'Collection',mediaType:'book',ownership:n===0?'borrowed':'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B00000000'+n,enrichment:{kindleProductComicContents:{source:'amazon-product-page',statement:n===0?'Includes Wool, Shift and Dust':n===1?'Includes wireless delivery':'Collects Comic #1-3 Read more',sourceUrl:'https://www.amazon.com/dp/B00000000'+n,availability:'statement-found',extractorVersion:2,parserVersion:2,parseOutcome:'failed',checkedAt:'2026-10-04T12:00:00Z'}}}}));
  const db={...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(i=>[i.id,i]))};db.canonicalItems=rebuildCanonicalItems(db.providerItems);
  let state={},writes=0;const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async update=>{writes++;Object.assign(state,structuredClone(update));}});
  await writer.restoreDatabase(db);await writer.saveContentReview(items[0].id,{entries:[{series:'Collection',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Previously verified source'});
  const before=await writer.getDatabase(),plan=kindleContentsPlan(before),requests=[{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Shift',mediaType:'book'},{title:'Comic #1-3',mediaType:'book'}]}];
  assert.equal(plan.eligible,6);assert.equal(plan.candidates.length,0);assert.equal(plan.reprocess.length,6);
  assert.equal(kindleContentsPlan(before,'rescan').candidates.length,6);const initialWrites=writes;
  const priorFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Local reprocessing must not use network');};
  try{await writer.reparseKindleContents(plan.reprocess.map(i=>({itemId:i.id,recordRef:i.recordRef})));}finally{globalThis.fetch=priorFetch;}
  assert.equal(writes-initialWrites,1);const after=await writer.getDatabase();
  assert.deepEqual(after.contentReviews,before.contentReviews);assert.deepEqual(after.canonicalItems,before.canonicalItems);assert.equal(ownedContentIndex(after).size,0);
  for(const item of items){const a=after.providerItems[item.id],b=before.providerItems[item.id];assert.equal(a.ownership,b.ownership);const x=a.metadata.enrichment.kindleProductComicContents,y=b.metadata.enrichment.kindleProductComicContents;assert.equal(x.statement,y.statement);assert.equal(x.checkedAt,y.checkedAt);assert.equal(x.extractorVersion,2);assert.ok(after.enrichmentHistory[x.selectionRef]);assert.notEqual(x.selectionRef,y.selectionRef);}
  for(const request of requests)assert.deepEqual(handleExternalApiRequest(after,request),handleExternalApiRequest(before,request));
  assert.equal(after.providerItems[items[1].id].metadata.enrichment.kindleProductComicContents.parseOutcome,'filtered');assert.equal(kindleContentsPlan(after).reprocess.length,0);
  assert.deepEqual(parseBackup(createBackup(after)).contentReviews,before.contentReviews);
  await writer.saveKindleComicContents([{itemId:items[1].id,recordRef:items[1].recordRef,sourceUrl:items[1].metadata.detailUrl,availability:'statement-found',statement:'Collects Comic #1-3.',extractorVersion:3}]);
  assert.equal((await writer.getDatabase()).providerItems[items[1].id].metadata.enrichment.kindleProductComicContents.statement,'Collects Comic #1-3.','saving must retain original extracted punctuation');
  for(const value of ['guess','owned'])assert.throws(()=>validateEnrichment('kindleProductComicContents',{quality:value}),/quality/);
 }]
];
