import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {kindleContentsPlan,kindleContentsState,supportedKindleContentsBook,KINDLE_CONTENTS_EXTRACTOR_VERSION} from '../src/lib/kindle-contents.js';
import {proposeContentsForReview,proposeContents,contentCoverage,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
import {isConfirmedComicManga} from '../src/lib/genre-hints.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {validateEnrichment} from '../src/lib/metadata-validation.js';
import {withWorker} from './storage.js';

const url=id=>`https://www.amazon.com/dp/${id}`;
const book=(id,title='Ordinary prose',saved)=>normalizeProviderItem({provider:'kindle',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata:{detailUrl:url(id),originType:'Purchase',...(saved?{enrichment:{kindleProductComicContents:{source:'amazon-product-page',sourceUrl:url(id),statement:'',...saved}}}:{})}});
const database=(...items)=>({...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item])),canonicalItems:rebuildCanonicalItems(Object.fromEntries(items.map(item=>[item.id,item])))});
const writerFor=()=>{const stored={};return createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>Object.assign(stored,structuredClone(updates))});};
const save=(item,statement,extra={})=>({itemId:item.id,recordRef:item.recordRef,sourceUrl:item.metadata.detailUrl,statement,availability:statement?'statement-found':'no-statement',extractorVersion:2,...extra});
const component={series:'Wool Omnibus',run:'',unitType:'component',number:'Shift',language:'',completeness:'full'};

export const kindleContentsTests=[
 ['product-page adapter safely handles empty, missing, CAPTCHA, sign-in and aborted fixture requests',async()=>{
  const originalFetch=globalThis.fetch,originalParser=globalThis.DOMParser;
  let text='',status=200,calls=0;const controller=new AbortController();
  globalThis.DOMParser=class {parseFromString(value){return {querySelector:query=>value==='captcha'&&query.includes('captchacharacters')||value==='sign-in'&&query.includes('ap_email')?{}:null,querySelectorAll:selector=>selector==='#bookDescription_feature_div'?[{textContent:value}]:[]};}};
  globalThis.fetch=async (url,options)=>{calls++;assert.equal(options.credentials,'include');assert.equal(options.signal,controller.signal);if(options.signal.aborted)throw new DOMException('Aborted','AbortError');return {status,ok:status===200,text:async()=>text};};
  const run=()=>globalThis.GalacticKindle.fetchKindleProductComicContents(url('B000000001'),{signal:controller.signal});
  try{
   let result=await run();assert.equal(result.availability,'no-statement');assert.equal(result.statement,'');assert.equal(result.extractorVersion,KINDLE_CONTENTS_EXTRACTOR_VERSION);
   text='Contains Wool, Shift and Dust';result=await run();assert.equal(result.availability,'statement-found');assert.equal(result.statement,text);
   text='Contents: "Wool", "Shift", and "Dust"';result=await run();assert.equal(result.availability,'statement-found');assert.equal(result.descriptionBlocks[0].text,text);
   status=404;assert.equal((await run()).availability,'unavailable');status=503;await assert.rejects(run(),/503/);status=200;
   text='captcha';await assert.rejects(run(),/CAPTCHA/);text='sign-in';await assert.rejects(run(),/Sign in/);
   const before=calls;await assert.rejects(globalThis.GalacticKindle.fetchKindleProductComicContents('https://example.com/dp/B000000001'),/usable/);assert.equal(calls,before);
   controller.abort();await assert.rejects(run(),/Aborted/);
  }finally{globalThis.fetch=originalFetch;if(originalParser===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=originalParser;}
 }],
 ['actual worker restricts scan/reparse to the Kindle page and validates stale record references',()=>withWorker(async({importItems,dispatch,pageA})=>{
  const fixture=book('B000000001','Ordinary prose');await importItems('kindle',[{providerItemId:fixture.providerItemId,title:fixture.title,mediaType:fixture.mediaType,ownership:fixture.ownership,metadata:fixture.metadata}]);
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.amazon.com/hz/mycd/'};
  const db=await pageA.getDatabase();const item=db.providerItems[fixture.id];
  const planned=await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES'},sender);assert.equal(planned.ok,true);assert.equal(planned.eligible,1);
  const saved=await dispatch({type:'SAVE_KINDLE_COMIC_CONTENTS',entries:[save(item,'Contains Wool and Shift')]},sender);assert.equal(saved.ok,true,saved.error);
  const result=await dispatch({type:'REPARSE_KINDLE_CONTENTS',entries:[{itemId:item.id,recordRef:item.recordRef}]},sender);assert.equal(result.ok,true,result.error);
  for(const type of ['GET_KINDLE_COMIC_CONTENT_CANDIDATES','REPARSE_KINDLE_CONTENTS','SAVE_KINDLE_COMIC_CONTENTS']){
   const denied=await dispatch({type,entries:[save(item,'Contains Wool and Shift')]},{...sender,url:'https://www.humblebundle.com/home/purchases'});assert.equal(denied.ok,false);
  }
  const stale=await dispatch({type:'REPARSE_KINDLE_CONTENTS',entries:[{itemId:item.id,recordRef:'stale'}]},sender);assert.equal(stale.ok,false);
  assert.equal((await dispatch({type:'GET_KINDLE_COMIC_CONTENT_CANDIDATES',mode:'bad'},sender)).ok,false);
 })],
 ['contents eligibility admits every supported Kindle book; collection signals only order the queue',()=>{
  const items=[book('B000000001','Captain America Modern Era Epic Collection: The Winter Soldier'),book('B000000002','Wool Omnibus'),book('B000000003','An ordinary novel'),book('B000000004','Programming examples')];
  const other={...items[0],id:'humble:x',provider:'humble'};
  const invalid={...items[0],id:'kindle:bad',metadata:{detailUrl:'https://amazon.example/dp/B000000001'}};
  const wrongMedia={...items[0],id:'kindle:audio',mediaType:'audiobook'};
  const doc={...items[0],id:'kindle:doc',mediaType:'document'};
  assert.ok(items.every(supportedKindleContentsBook));assert.ok(items.every(item=>!isConfirmedComicManga(item)));
  for(const item of [other,invalid,wrongMedia,doc,{...items[0],metadata:{detailUrl:url('B000000001')+'/extra'}},{...items[0],metadata:{detailUrl:'https://user@www.amazon.com/dp/B000000001'}}])assert.equal(supportedKindleContentsBook(item),false);
  const plan=kindleContentsPlan(database(...items,other,invalid,wrongMedia,doc));assert.equal(plan.eligible,4);assert.equal(plan.candidates.length,4);
  assert.deepEqual(plan.candidates.slice(0,2).map(item=>item.id),items.slice(0,2).map(item=>item.id));
 }],
 ['legacy results distinguish retry, normal scan, explicit rescan and parser-only reprocessing',()=>{
  const items=[book('B000000001'),book('B000000002','Legacy blank',{}),book('B000000003','Failed',{availability:'temporary-failure',failureCode:'sign-in'}),book('B000000004','Unavailable',{availability:'unavailable'}),book('B000000005','Old statement',{statement:'Collects Comic #1-3'}),book('B000000006','Current empty',{availability:'no-statement',extractorVersion:2}),book('B000000007','Old extractor',{availability:'unavailable',extractorVersion:1})];
  const db=database(...items);const normal=kindleContentsPlan(db);
  assert.deepEqual(new Set(normal.candidates.map(item=>item.id)),new Set([items[0].id,items[1].id,items[2].id,items[6].id]));
  assert.deepEqual(normal.reprocess.map(item=>item.id),[items[4].id]);
  assert.equal(kindleContentsPlan(db,'retry').candidates.length,2);assert.equal(kindleContentsPlan(db,'rescan').candidates.length,7);
  assert.equal(kindleContentsPlan(db,'reparse').candidates.length,0);assert.equal(kindleContentsPlan(db,'reparse').reprocess.length,1);
  assert.equal(kindleContentsState(items[1]).fetchOutcome,'legacy-unknown');assert.equal(kindleContentsState(items[4]).parseOutcome,'full');
  assert.throws(()=>kindleContentsPlan(db,'surprise'),/Invalid/);
 }],
 ['generalized extraction keeps explicit statements and abbreviation text, without inventing chapter identities',()=>{
  const extract=globalThis.GalacticKindle.explicitContentsStatement;
  for(const prefix of ['Collects','Contains','Includes','Collecting','Containing','Including','Comprises'])assert.equal(extract(`A collection. ${prefix} Wool, Shift and Dust. More details.`),`${prefix} Wool, Shift and Dust`);
  assert.equal(extract('Collects J.M.S. Spider-Man #1-3. Also extras.'),'Collects J.M.S. Spider-Man #1-3');
  for(const name of ['Ms. Marvel','Sgt. Fury','Gen. Story','Ft. Adventure','Batman Vs. Bigby!','Haikyu!!'])assert.equal(extract(`Collects ${name} #1-3. More details.`),`Collects ${name} #1-3`);
  assert.equal(extract('Collects Comic #1-6.The next adventure.'),'Collects Comic #1-6');
  assert.equal(extract('Collects Comic #1-6 Read More'),'Collects Comic #1-6 Read More','extraction must retain the hydration marker');
  assert.equal(extract('Contains Manga Vol. One and Vol. Two. Other details.'),'Contains Manga Vol. One and Vol. Two');
  assert.equal(extract('An ordinary book about programming.'),'');
  assert.equal(proposeContentsForReview('Includes chapters One, Two and Three','Textbook').entries.length,0);
 }],
 ['numbered parsing preserves Black and White, leaves generic issues unresolved and retains excerpt scope',()=>{
  const generic=proposeContentsForReview('Collects issues #1–4','A collection');assert.equal(generic.entries.length,0);assert.equal(generic.unparsed.length,1);
  const named=proposeContentsForReview('Collects Batman: Black and White #1–4','A collection');assert.equal(named.entries.length,4);assert.ok(named.entries.every(entry=>entry.series==='Batman: Black and White'));
  assert.equal(proposeContents('Collects Comic #1–3 and Other Comic #4').entries.length,4);
  const mixed=proposeContentsForReview('Collects Hellboy in Mexico, Hellboy: The Sleeping and the Dead #1–2, Other story','Hellboy collection');
  assert.ok(mixed.entries.every(entry=>entry.series==='Hellboy: The Sleeping and the Dead'));assert.equal(mixed.unparsed.length,2);
  assert.ok(proposeContentsForReview('Contains material from Comic #1–4','A collection').entries.every(entry=>entry.completeness==='excerpt'));
  const novels=proposeContentsForReview('Includes Wool, Shift and Dust','Wool Omnibus');assert.deepEqual(novels.entries.map(entry=>entry.number),['Wool','Shift','Dust']);assert.ok(novels.entries.every(entry=>entry.unitType==='component'&&!entry.run&&!entry.language));
  assert.equal(proposeContents('Includes Wool, Shift and Dust').entries.length,0,'ordinary matcher parser must not gain named-title discovery');
  assert.equal(proposeContentsForReview('Collects Comic #1234567','Collection').entries.length,0,'unsupported numeric shapes stay available as unresolved text');
  assert.equal(proposeContentsForReview('Includes Wool and Shift','x'.repeat(501)).unparsed.length,1);
 }],
 ['full, partial and failed statements remain reviewable until the matching statement is verified',async()=>{
  const writer=writerFor();await writer.restoreDatabase(database(book('B000000001','Wool Omnibus'),book('B000000002','Comic collection'),book('B000000003','Unknown series')));
  let db=await writer.getDatabase();const items=Object.values(db.providerItems);
  await writer.saveKindleComicContents([save(items[0],'Includes Wool, Shift and Dust'),save(items[1],'Collects Comic #1-3; bonus essays'),save(items[2],'Collects issues #1-4')]);
  db=await writer.getDatabase();assert.deepEqual(Object.values(db.providerItems).map(item=>kindleContentsState(item,db).parseOutcome),['full','partial','failed']);
  const rows=enrichmentWorkbenchRows(db).filter(row=>row.category==='unparsed');assert.equal(rows.length,3);assert.ok(rows.some(row=>row.contentsState==='suggestions'));
  await writer.saveContentReview(items[0].id,{entries:[component],statement:'Includes Wool, Shift and Dust'});
  db=await writer.getDatabase();assert.equal(enrichmentWorkbenchRows(db).filter(row=>row.category==='unparsed').length,2);assert.equal(kindleContentsState(db.providerItems[items[0].id],db).reviewStatus,'verified');
  const review=structuredClone(db.contentReviews[items[0].id]);
  await writer.saveKindleComicContents([save(items[0],'Includes Wool, Shift and Dust; Another Novel')]);
  db=await writer.getDatabase();assert.deepEqual(db.contentReviews[items[0].id],review);assert.equal(enrichmentWorkbenchRows(db).filter(row=>row.category==='unparsed').length,3);assert.equal(kindleContentsState(db.providerItems[items[0].id],db).reviewChanged,true);
 }],
 ['local reparse preserves original text, fetch history, verified contents and legacy backup compatibility',async()=>{
  const writer=writerFor();const item=book('B000000001','Wool Omnibus',{statement:'Includes Wool, Shift and Dust',checkedAt:'2026-10-02T12:00:00.000Z'});
  await writer.restoreDatabase(parseBackup(createBackup(database(item))));let db=await writer.getDatabase();const current=db.providerItems[item.id];
  await writer.saveContentReview(item.id,{entries:[component],statement:'Older reviewed text'});const before=await writer.getDatabase();
  await writer.reparseKindleContents([{itemId:item.id,recordRef:current.recordRef}]);db=await writer.getDatabase();const saved=db.providerItems[item.id].metadata.enrichment.kindleProductComicContents;
  assert.equal(saved.statement,item.metadata.enrichment.kindleProductComicContents.statement);assert.equal(saved.checkedAt,'2026-10-02T12:00:00.000Z');assert.equal(saved.extractorVersion,undefined);assert.equal(saved.parserVersion,CONTENTS_PARSER_VERSION);assert.equal(saved.parseOutcome,'full');assert.deepEqual(db.contentReviews,before.contentReviews);assert.deepEqual(db.canonicalItems,before.canonicalItems);
  assert.equal(kindleContentsPlan(db).reprocess.length,0);assert.equal(kindleContentsPlan(db).candidates.length,0);
  assert.equal(parseBackup(createBackup(db)).providerItems[item.id].metadata.enrichment.kindleProductComicContents.parseOutcome,'full');
  await assert.rejects(writer.reparseKindleContents([{itemId:item.id,recordRef:'stale'}]),/no longer current/);
  await writer.saveKindleComicContents([save(current,'',{availability:'temporary-failure',failureCode:'captcha'})]);db=await writer.getDatabase();
  assert.equal(db.providerItems[item.id].metadata.enrichment.kindleProductComicContents.statement,saved.statement);assert.deepEqual(db.contentReviews,before.contentReviews);assert.equal(kindleContentsPlan(db,'retry').candidates.length,1);
  for(const field of ['parserVersion','extractorVersion'])for(const value of [0,-1,1.5,'2'])assert.throws(()=>validateEnrichment('kindleProductComicContents',{source:'amazon-product-page',[field]:value}),/version|Version|integer|number|count|positive/i);
 }],
 ['discovery preserves ownership, identity, grouping and comic classification; named proposals cannot confer companion ownership',async()=>{
  const writer=writerFor();await writer.restoreDatabase(database(book('B000000001','Wool Omnibus'),book('B000000002','An ordinary novel')));const before=await writer.getDatabase();const item=before.providerItems['kindle:B000000001'];
  const query={title:'Shift',mediaType:'book'};const request={type:'MATCH_ITEMS',apiVersion:1,items:[query]};
  await writer.saveKindleComicContents([save(item,'Includes Wool, Shift and Dust')]);const after=await writer.getDatabase();
  assert.deepEqual(Object.keys(after.providerItems),Object.keys(before.providerItems));assert.deepEqual(after.canonicalItems,before.canonicalItems);assert.deepEqual(after.ownershipReviews,before.ownershipReviews);assert.deepEqual(after.ownershipPolicy,before.ownershipPolicy);
  for(const id of Object.keys(before.providerItems)){assert.equal(after.providerItems[id].ownership,before.providerItems[id].ownership);assert.equal(after.providerItems[id].recordRef,before.providerItems[id].recordRef);assert.equal(isConfirmedComicManga(after.providerItems[id]),false);assert.equal(after.providerItems[id].metadata.originType,before.providerItems[id].metadata.originType);}
  assert.deepEqual(handleExternalApiRequest(after,request),handleExternalApiRequest(before,request));assert.equal(handleExternalApiRequest(after,request).results[0].owned,false);assert.equal(contentCoverage(after,[component]).owned,0);
  await writer.saveContentReview(item.id,{entries:[component],statement:'Includes Wool, Shift and Dust'});assert.equal(handleExternalApiRequest(await writer.getDatabase(),request).results[0].owned,false,'even verified named components do not match ordinary title requests');
 }],
 ['contents saving retains source, account/reference and input validation',async()=>{
  const writer=writerFor();await writer.restoreDatabase(database(book('B000000001')));const item=(await writer.getDatabase()).providerItems['kindle:B000000001'];
  for(const bad of [{recordRef:'stale'},{sourceUrl:'https://www.amazon.com/dp/B000000002'},{sourceUrl:'https://user@www.amazon.com/dp/B000000001'},{statement:'Arbitrary description'},{extractorVersion:KINDLE_CONTENTS_EXTRACTOR_VERSION+1},{availability:'unavailable'}])await assert.rejects(writer.saveKindleComicContents([save(item,'Contains Wool and Shift',bad)]),/Invalid/);
  assert.equal((await writer.getDatabase()).providerItems[item.id].metadata.enrichment,undefined);
  const db=await writer.getDatabase();await writer.renameProviderProfile(db.providers.kindle.activeProfileId,'account');
  await assert.rejects(writer.saveKindleComicContents([{...save(item,'Contains Wool and Shift'),recordRef:undefined}]),/Invalid/);
 }]
];
