import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectManifest,manifestReviewProposal,validateManifest,MANIFEST_LIMITS} from '../src/lib/kindle-manifest.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {contentCoverage,proposeContents} from '../src/lib/contents.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
const fixtures=JSON.parse(await readFile(new URL('./kindle-manifest-fixtures.json',import.meta.url),'utf8'));
const select=(text,title='Example Collection')=>selectManifest([{selector:'#bookDescription_feature_div',text}],title);
const proposal=s=>manifestReviewProposal(s,s.manifest.title);
export const kindleManifestTests=[
 ...fixtures.map(f=>['manifest regression: '+f.title,()=>{
   const s=select(f.text,f.title),p=proposal(s);
   assert.deepEqual(p.entries.map(e=>e.number),f.numbers);assert.ok(p.entries.every(e=>e.series.toLowerCase()===f.series.toLowerCase()));
   for(const word of f.unresolved??[])assert.ok(p.unparsed.join(' ').includes(word),word);
   assert.ok(s.manifest.candidates.length);assert.deepEqual(validateManifest(s.manifest),s.manifest);
 }]),
 ['100 Bullets five-volume family covers 1–100 exactly once',()=>{
   const numbers=fixtures.slice(0,5).flatMap(f=>proposal(select(f.text,f.title)).entries.map(e=>Number(e.number)));
   assert.deepEqual(numbers,Array.from({length:100},(_,n)=>n+1));
 }],
 ['later manifest outranks false prose, weaker real arcs and multiple misleading triggers',()=>{
   for(const lead of ['containing an untraceable gun.','Including the story arcs "Wake" and "Punch Line".','Includes writers Jane Doe and John Smith. containing proof of the deed. including murder.']){
     const s=select(lead+' Collects SERIES #1-6.');assert.equal(proposal(s).entries.length,6);assert.ok(s.manifest.selected>0);
   }
 }],
 ['position does not displace strong early structural evidence with weak late prose',()=>{
   const s=select('Contains SERIES #1-6. Includes the story arcs "A Wake" and "Punch Line".');
   assert.equal(s.manifest.selected,0);assert.equal(proposal(s).entries.length,6);
 }],
 ['Include/Contain/Reprint survive, credits/plot/events/non-bibliographic Collects do not propose titles',()=>{
   for(const text of ['Includes SERIES #1-3','Contains SERIES #1-3','Reprints SERIES #1-3'])assert.equal(proposal(select(text)).entries.length,3);
   for(const text of ['Includes writers Jane Doe and John Smith','containing an untraceable gun and 100 rounds of ammunition','including the birth of children','collects severed heads'])assert.equal(proposal(select(text)).entries.length,0,text);
 }],
 ['complementary clauses remain inspectable; overlaps do not duplicate proposals',()=>{
   const s=select('Collects SERIES #1-6. Includes OTHER SERIES #7.');assert.equal(proposal(s).entries.length,6);assert.equal(s.manifest.secondary.length,1);
   const overlap=select('Collects SERIES #1-6. Contains SERIES #1-3.');assert.equal(proposal(overlap).entries.length,6);assert.deepEqual(overlap.manifest.secondary,[]);
 }],
 ['structural issue and named non-comic manifests need no traditional verb',()=>{
   const s=select('SERIES #1-6.');assert.equal(proposal(s).entries.length,6);assert.equal(s.manifest.candidates[0].structural,true);
   assert.equal(proposal(select('Contents: "Wool", "Shift", and "Dust"','Wool Omnibus')).entries.length,3);
   assert.equal(proposal(select('Contains Epic Books 1-3','Epic Omnibus')).entries.length,3);
 }],
 ['Read More flags incomplete-source risk but absence does not assert completeness',()=>{
   for(const suffix of ['',' Read more']){
     const s=select('Collects SERIES #1-6.'+suffix);assert.equal(proposal(s).entries.length,6);
     assert.equal(proposal(s).descriptionMayBeIncomplete,Boolean(suffix));assert.equal(Object.hasOwn(s.manifest,'complete'),false);
   }
 }],
 ['context binding preserves explicit other-series labels, excerpt scope and negative source context',()=>{
   const explicit=proposal(select('Collects issues #1-3 of OTHER SERIES.','Fables Vol. 5'));
   assert.ok(explicit.entries.every(e=>e.series==='OTHER SERIES'));assert.equal(explicit.entries.length,3);
   const excerpt=proposal(select('SERIES Collection. Material from issues #1-3.','SERIES Collection'));
   assert.equal(excerpt.entries.length,3);assert.ok(excerpt.entries.every(e=>e.completeness==='excerpt'));
   assert.equal(proposal(select('SERIES Collection. Also available: issues #1-3.','SERIES Collection')).entries.length,0);
 }],
 ['pilot regression: mixed named supplement cannot become a greedy issue label',()=>{
   const s=select('Collects issues #21-29, Ex Machina: Inside the Machine, and Ex Machina Special #3 Read more','Ex Machina: Book Three'),p=proposal(s);
   assert.equal(p.outcome,'partial');assert.equal(p.entries.length,10);assert.equal(p.entries.at(-1).series,'Ex Machina');assert.equal(p.entries.at(-1).unitType,'special');assert.ok(p.unparsed.join(' ').includes('Inside the Machine'));
 }],
 ['pilot regression: incidental plot references and bestseller numbers are not structural manifests',()=>{
   for(const text of ['Following the events of Infinite Frontier #0 and The Joker War, The Joker gets targeted as the most wanted man in the world!','#1 NEW YORK TIMES Bestseller!','Everything since Batman Incorporated #1 has been leading to this!'])assert.equal(select(text).manifest.candidates.length,0,text);
   const s=select('Following the events of Infinite Frontier #0 and The Joker War, The Joker gets targeted as the most wanted man in the world! Collects THE JOKER #1-6.');assert.deepEqual(s.manifest.secondary,[]);assert.equal(proposal(s).entries.length,6);
 }],
 ['candidate/source bounds are deterministic and reject oversized imported evidence',()=>{
   const text=Array.from({length:100},(_,n)=>`Collects SERIES #${n+1}.`).join(' ');
   const a=select(text);assert.ok(a.manifest.candidates.length<=MANIFEST_LIMITS.candidates);assert.deepEqual(select(text),a);
   const later=select(Array.from({length:80},(_,n)=>`Includes wireless delivery option ${n}.`).join(' ')+' Contains SERIES #1-6.');assert.equal(proposal(later).entries.length,6);
   assert.throws(()=>select('x'.repeat(MANIFEST_LIMITS.block+1)),/bounds/);
   assert.throws(()=>validateManifest({title:'x',blocks:Array.from({length:9},()=>({selector:'x',text:'x'}))}),/blocks/);
 }],
 ['worker save, restore, reparse and failed refresh preserve reviews and ownership boundaries',async()=>{
   const item=normalizeProviderItem({provider:'kindle',providerItemId:'B000000001',title:'Fables Vol. 5',ownership:'borrowed',mediaType:'book',metadata:{detailUrl:'https://www.amazon.com/dp/B000000001'}});
   const db=createEmptyDatabase();db.providerItems[item.id]=item;db.canonicalItems=rebuildCanonicalItems(db.providerItems);
   const stored={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>Object.assign(stored,structuredClone(updates))});
   await writer.restoreDatabase(db);await writer.saveContentReview(item.id,{statement:'Manual prior review',entries:[{series:'Prior',unitType:'issue',number:'1'}]});
   const before=await writer.getDatabase(),entry={itemId:item.id,recordRef:item.recordRef,sourceUrl:item.metadata.detailUrl,statement:'',availability:'no-statement',extractorVersion:4,descriptionBlocks:[{selector:'#bookDescription_feature_div',text:fixtures[5].text}]};
   await writer.saveKindleComicContents([entry]);const after=await writer.getDatabase(),saved=after.providerItems[item.id].metadata.enrichment.kindleProductComicContents;
   assert.equal(saved.parseOutcome,'full');assert.equal(proposal(saved).entries.length,7);assert.deepEqual(after.contentReviews,before.contentReviews);assert.deepEqual(after.canonicalItems,before.canonicalItems);assert.equal(after.providerItems[item.id].ownership,'borrowed');assert.equal(contentCoverage(after,[{series:'Fables',unitType:'issue',number:'22'}]).owned,0);
   const restored=parseBackup(createBackup(after));assert.deepEqual(restored.providerItems[item.id].metadata.enrichment.kindleProductComicContents.manifest,saved.manifest);
   await writer.reparseKindleContents([{itemId:item.id,recordRef:item.recordRef}]);assert.deepEqual((await writer.getDatabase()).contentReviews,before.contentReviews);
   await writer.saveKindleComicContents([{...entry,descriptionBlocks:undefined,statement:'',availability:'temporary-failure',failureCode:'network'}]);assert.deepEqual((await writer.getDatabase()).providerItems[item.id].metadata.enrichment.kindleProductComicContents.manifest,saved.manifest);
   assert.equal(kindleContentsPlan(after).candidates.length,0);assert.equal(proposeContents('Collects issues 22 and 28-33').entries.length,0);
   assert.equal(manifestReviewProposal(saved,item.title,'Collects issues #1-3').entries.length,0);
 }]
];
