import {checkProductDetailsCapture} from './kindle-product-details-fixture.js';
// Small fixture adapter; identical assertions also run against real DOMParser.
const decode=value=>value.replace(/&nbsp;/gu,' ').replace(/&amp;/gu,'&').replace(/<[^>]*>/gu,'');
function node(html){return {textContent:decode(html),getAttribute:name=>name==='href'?/href="([^"]+)"/u.exec(html)?.[1]:null,querySelector(selector){if(selector==='th'||selector==='td'){const found=new RegExp('<'+selector+'[^>]*>([\\s\\S]*?)</'+selector+'>').exec(html);return found?node(found[1]):null;}if(selector==='a'){const found=/<a[^>]*>[\s\S]*?<\/a>/u.exec(html);return found?node(found[0]):null;}if(selector==='.a-text-bold, b, strong'||selector==='.rpi-attribute-value'){const found=/<span[^>]*>([\s\S]*?)<\/span>/u.exec(html);return found?node(found[1]):null;}return null;},querySelectorAll(selector){const tag=['li','tr','a'].includes(selector)?selector:null;return tag?[...html.matchAll(new RegExp('<'+tag+'[^>]*>[\\s\\S]*?</'+tag+'>','g'))].map(m=>node(m[0])):[];}};}
export function productDocument(html){return {querySelector:selector=>selector==='#productTitle, #ebooksProductTitle'&&/id="productTitle"/u.test(html)?node('Product'):null,querySelectorAll(selector){if(selector==='script[type="application/ld+json"]')return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)].map(m=>node(m[1]));if(selector.startsWith('#')){const id=selector.slice(1);const found=new RegExp('<(div|table)[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</\\1>').exec(html);return found?[node(found[2])]:[];}return [];}};}
export const kindleProductDetailsTests=[['Product Details fixtures cover bounded layouts, unicode, ISBN checksums, conflicts and missing/non-product pages',()=>checkProductDetailsCapture(productDocument)]];

import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {identityEvidence} from '../src/lib/identity.js';
import {matchItems} from '../src/lib/matcher.js';
import {validateProductDetailsEvidence,mergeProductDetailsEvidence} from '../src/lib/kindle-product-details.js';
import {productDetailsFixtures} from './kindle-product-details-fixture.js';
const capture=()=>globalThis.GalacticKindle.kindleProductDetails(productDocument(productDetailsFixtures[0].html),'https://www.amazon.com/dp/B08KHXKTKQ');
kindleProductDetailsTests.push(['Product Details observations retain omitted/unchanged fields and original capture dates, reject unsafe shapes',()=>{
 const first=mergeProductDetailsEvidence(null,capture(),capture().sourceUrl,'2026-10-08T00:00:00Z');
 assert.equal(mergeProductDetailsEvidence(first,capture(),first.sourceUrl,'2026-10-09T00:00:00Z'),first);
 const partial={...capture(),observations:capture().observations.filter(o=>o.field==='language').map(o=>({...o,value:'French',raw:'French'}))};
 const next=mergeProductDetailsEvidence(first,partial,first.sourceUrl,'2026-10-09T00:00:00Z');assert.equal(next.observations.find(o=>o.field==='publisher').capturedAt,first.capturedAt);assert.equal(next.observations.find(o=>o.field==='language').value,'French');
 assert.throws(()=>mergeProductDetailsEvidence(first,capture(),'https://www.amazon.com/dp/B000000001','2026-10-09T00:00:00Z'));
 assert.throws(()=>validateProductDetailsEvidence({...capture(),observations:Array(41).fill(capture().observations[0])}));
 assert.throws(()=>validateProductDetailsEvidence({...capture(),observations:[{...capture().observations.find(o=>o.field==='isbn13'),value:'9781646680451'}]}));
}],['Atomic Product Details persistence, retry/history/backup/restore preserve exact identity, matching, access and unrelated state',async()=>{
 const stored={};let fail=false;const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async values=>{if(fail)throw Error('synthetic failed write');Object.assign(stored,structuredClone(values));}});
 let db=await writer.mergeProviderItems('kindle',[{providerItemId:'B08KHXKTKQ',title:'Something Is Killing the Children Vol. 2',mediaType:'book',ownership:'owned',metadata:{asin:'B08KHXKTKQ',publisher:'Existing publisher',isbn:'9780306406157',detailUrl:capture().sourceUrl}},{providerItemId:'B000000001',title:'Untouched',mediaType:'book',ownership:'borrowed'}]);
 const record=Object.values(db.providerItems).find(o=>o.providerItemId==='B08KHXKTKQ'),unrelated=Object.values(db.providerItems).find(o=>o.providerItemId==='B000000001');
 const entry={itemId:record.id,recordRef:record.recordRef,sourceUrl:capture().sourceUrl,descriptionBlocks:[],availability:'no-statement',extractorVersion:5};
 await writer.saveKindleComicContents([entry]);db=await writer.getDatabase();const original=structuredClone(db),query=[{title:record.title,mediaType:'book'}];
 await writer.saveKindleComicContents([{...entry,productDetailsEvidence:capture()}]);db=await writer.getDatabase();const evidence=db.providerItems[record.id].metadata.enrichment.kindleProductComicContents.productDetailsEvidence;
 assert.deepEqual(identityEvidence(db.providerItems[record.id]),identityEvidence(original.providerItems[record.id]));assert.deepEqual(matchItems(db.providerItems,query),matchItems(original.providerItems,query));
 for(const key of Object.keys(original).filter(k=>!['providerItems','enrichmentHistory','kindleContentsObservations'].includes(k)))assert.deepEqual(db[key],original[key],key);
 assert.deepEqual(db.providerItems[unrelated.id],original.providerItems[unrelated.id]);assert.equal(db.providerItems[record.id].ownership,'owned');assert.deepEqual(db.providerItems[record.id].metadata.isbn,original.providerItems[record.id].metadata.isbn);
 for(let i=0;i<4;i++)await writer.saveKindleComicContents([{...entry,productDetailsEvidence:capture()}]);
 db=await writer.getDatabase();assert.deepEqual(db.providerItems[record.id].metadata.enrichment.kindleProductComicContents.productDetailsEvidence,evidence);assert.equal(Object.keys(db.enrichmentHistory).length,1);
 await writer.saveKindleComicContents([entry]);assert.deepEqual((await writer.getDatabase()).providerItems[record.id].metadata.enrichment.kindleProductComicContents.productDetailsEvidence,evidence);
 await writer.saveKindleComicContents([{...entry,descriptionBlocks:undefined,availability:'unavailable',statement:''}]);assert.deepEqual((await writer.getDatabase()).providerItems[record.id].metadata.enrichment.kindleProductComicContents.productDetailsEvidence,evidence);
 await assert.rejects(writer.saveKindleComicContents([{...entry,descriptionBlocks:undefined,availability:'unavailable',statement:'',productDetailsEvidence:capture()}]),/successfully retrieved/);
 await writer.restoreDatabase(parseBackup(createBackup(await writer.getDatabase())));assert.deepEqual((await writer.getDatabase()).providerItems[record.id].metadata.enrichment.kindleProductComicContents.productDetailsEvidence,evidence);
 const before=structuredClone(stored);fail=true;await assert.rejects(writer.saveKindleComicContents([{...entry,productDetailsEvidence:capture()}]),/synthetic/);assert.deepEqual(stored,before);fail=false;await writer.saveKindleComicContents([entry]);
}]);

kindleProductDetailsTests.push(['Existing acquisition captures Product Details from one response without pacing/version changes',async()=>{
 const previous={fetch:globalThis.fetch,DOMParser:globalThis.DOMParser,location:globalThis.location};let calls=0;
 try{globalThis.fetch=async()=>{calls++;return {ok:true,status:200,text:async()=>productDetailsFixtures[0].html};};globalThis.DOMParser=class{parseFromString(html){return productDocument(html);}};globalThis.location={origin:'https://www.amazon.com'};
 const result=await globalThis.GalacticKindle.fetchKindleProductComicContents(capture().sourceUrl);assert.equal(calls,1);assert.deepEqual(result.productDetailsEvidence,capture());assert.equal(result.extractorVersion,5);assert.equal(result.availability,'no-statement');
 }finally{Object.assign(globalThis,previous);}
}]);

import {productDetailsView} from '../src/ui/product-details.js';
kindleProductDetailsTests.push(['Product Details presentation labels conflicts, edition ISBN uncertainty, omits matching saved facts and leaves inputs unchanged',()=>{
 const record={provider:'kindle',providerItemId:'B08KHXKTKQ',mediaType:'book',title:'Example',metadata:{publisher:'BOOM! Studios',isbn:'9780306406157',enrichment:{kindleProductComicContents:{productDetailsEvidence:capture()}}}};const before=JSON.stringify(record),view=productDetailsView(record);
 assert(!view.facts.some(f=>f.field==='publisher'));assert(view.facts.find(f=>f.field==='isbn13').conflict);assert.equal(JSON.stringify(record),before);assert.equal(productDetailsView({...record,provider:'kobo'}),null);
}]);
