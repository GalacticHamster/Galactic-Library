// Shared by Node's low-level tree fixture and real Chrome/Firefox DOMParser.
import {selectManifest,manifestReviewProposal,validateManifest} from '../src/lib/kindle-manifest.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createEmptyDatabase,normalizeProviderItem,rebuildCanonicalItems} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {ownedContentIndex,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
const assert=(test,message)=>{if(!test)throw Error(message);};
const equal=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message);
export async function checkKindleSourceCapture(fixtures,parseDocument){
 const checks=[],source=html=>globalThis.GalacticKindle.kindleDescriptionBlocks(parseDocument(`<div id="bookDescription_feature_div">${html}</div>`));
 const captured=fixtures.map(f=>{const blocks=source(f.html),s=selectManifest(blocks,f.title),p=manifestReviewProposal(s,f.title);equal(validateManifest(s.manifest),s.manifest,'Source-backed candidates do not round trip');return {...f,blocks,s,p};});
 const numbers=captured.slice(0,5).flatMap(f=>f.p.entries.map(e=>Number(e.number)));
 equal(numbers,Array.from({length:100},(_,n)=>n+1),'Static HTML must cover 100 Bullets #1–100 exactly once');
 checks.push('static five-volume HTML preserves 100 Bullets 1–100 exactly once through source/candidates/input');
 const dragon=captured.find(f=>f.auditId===1264),never=captured.find(f=>f.auditId===901),excerpt=captured.find(f=>f.auditId===21);
 assert(dragon.blocks[0].text.includes('Balanced on the Blade’s Edge\nDeathmaker\nBlood Charged'),'BR title boundaries lost');
 assert(dragon.s.statement.includes('Edge\nDeathmaker\nBlood Charged'),'Selected source must preserve title lines');
 equal([dragon.p.outcome,dragon.p.entries.length],['uncertain',0],'A visual list must not invent owned constituents or override Read more');
 assert(dragon.s.manifest.descriptionMayBeIncomplete,'Read more evidence removed');
 checks.push('Dragon Blood structural lines survive; no punctuation, names or confidence manufactured');
 assert(never.blocks[0].text.includes('Back”.\nPublished'),'Paragraph boundary lost');
 equal(never.s.statement,'including his special Neverwhere tale, “How the Marquis Got His Coat Back”.','Neverwhere selected clause must exclude neighboring paragraph');
 equal([never.p.outcome,never.p.entries.length],['failed',0],'Parser-v4 unsupported attribution must remain unresolved');
 checks.push('Neverwhere adjacent paragraphs no longer glue or contaminate its source clause');
 assert(excerpt.p.entries.length===1&&excerpt.p.entries[0].completeness==='excerpt','Excerpt scope changed');
 equal(source('<p>Collects <span>SUPER</span><em>MAN</em> #1-2.</p><p>Plot follows.</p>')[0].text,'Collects SUPERMAN #1-2.\nPlot follows.','Inline title words must stay contiguous');
 equal(source('<p>Contains <b>Wool</b>, <i>Shift</i> and Dust.</p>')[0].text,'Contains Wool, Shift and Dust.','Inline emphasis is not a delimiter');
 checks.push('inline title/emphasis fragments remain contiguous; explicit excerpt scope survives');
 equal(source('<div>Contents:<ul><li>First Work</li><li>Second Work</li></ul></div><div>Other text</div>')[0].text,'Contents:\nFirst Work\nSecond Work\nOther text','List and block boundaries lost');
 assert(source('<p>'+('X'.repeat(30000))+'</p>')[0].text.length===12000,'Block cap changed');
 assert(source('<p>'+('<span></span>'.repeat(5000))+'Too late</p>').length===0,'Traversal cap must bound empty DOM');
 checks.push('DOM lists and block boundaries are retained within existing character and traversal bounds');
 // Actual writer and backup boundary, with a pre-existing verified review.
 const items=captured.map((f,n)=>normalizeProviderItem({provider:'kindle',providerItemId:'B'+String(n+1).padStart(9,'0'),title:f.title,mediaType:'book',ownership:'owned',metadata:{detailUrl:'https://www.amazon.com/dp/B'+String(n+1).padStart(9,'0'),enrichment:{kindleProductComicContents:{source:'amazon-product-page',sourceUrl:'https://www.amazon.com/dp/B'+String(n+1).padStart(9,'0'),statement:'Original evidence',extractorVersion:2,checkedAt:'2026-10-01T00:00:00.000Z',availability:'statement-found'}}}}));
 const providerItems=Object.fromEntries(items.map(i=>[i.id,i])),values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
 await writer.restoreDatabase({...createEmptyDatabase(),providerItems,canonicalItems:rebuildCanonicalItems(providerItems)});
 await writer.saveContentReview(items[0].id,{statement:'Verified original source',entries:[{series:'Previously Verified',run:'',unitType:'issue',number:'1',language:''}]});
 const before=await writer.getDatabase(),api=db=>handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Blood Charged',mediaType:'book'},{title:items[0].title,mediaType:'book'}]});
 assert(api(before).ok,'API check must compare successful responses');
 await writer.saveKindleComicContents(items.map((i,n)=>({itemId:i.id,recordRef:i.recordRef,sourceUrl:i.metadata.detailUrl,descriptionBlocks:captured[n].blocks,availability:'statement-found',extractorVersion:5})));
 const after=await writer.getDatabase();
 equal(after.contentReviews,before.contentReviews,'Verified/reviewed contents changed');equal(after.canonicalItems,before.canonicalItems,'Canonical grouping changed');equal(api(after),api(before),'Ordinary matching changed');
 equal([...ownedContentIndex(after)].map(([key,records])=>[key,records.map(r=>r.item.id)]),[...ownedContentIndex(before)].map(([key,records])=>[key,records.map(r=>r.item.id)]),'Unverified discovery entered owned index');
 for(const item of items)equal(after.providerItems[item.id].ownership,before.providerItems[item.id].ownership,'Ownership changed');
 const restored=parseBackup(createBackup(after));equal(restored.contentReviews,after.contentReviews,'Review restore changed');
 for(const [n,item] of items.entries()){
  const saved=after.providerItems[item.id].metadata.enrichment.kindleProductComicContents;
  equal(saved.manifest.blocks,captured[n].blocks,'Writer lost source lines');equal(saved.statement,captured[n].s.statement,'Writer changed selected source');assert(saved.extractorVersion===5&&saved.parserVersion===CONTENTS_PARSER_VERSION,'Capture and parser generations conflated');
  equal(restored.providerItems[item.id].metadata.enrichment.kindleProductComicContents,saved,'Backup changed source/derived evidence');
  assert(Object.values(after.enrichmentHistory).some(h=>h.recordRef===item.recordRef&&h.previous?.statement==='Original evidence'&&h.previous.checkedAt==='2026-10-01T00:00:00.000Z'),'Historical evidence lost');
 }
 checks.push('real writer and backup retain lines/history/reviews; unverified contents never enter owned matching');
 return checks;
}
