// Offline corpus comparison against audit labels. No source/export writes,
// provider requests, browser profiles, or real extension storage are used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parseBackup} from '../src/lib/storage.js';
import {proposeContentsForReview} from '../src/lib/contents.js';
import {kindleContentsPlan,contentsParseState} from '../src/lib/kindle-contents.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';

const [file]=process.argv.slice(2);
if(!file)throw Error('Usage: node scripts/measure-contents-quality.mjs BACKUP_JSON');
const bytes=await readFile(file),hash=value=>createHash('sha256').update(value).digest('hex'),sourceHash=hash(bytes);
const audit=await readFile(new URL('../docs/kindle-contents-quality-audit.md',import.meta.url),'utf8');
if(!audit.includes(sourceHash))throw Error('This export does not match the completed audit SHA-256; do not apply its ordinal labels to a different corpus.');
const labels=[...audit.split('<details>')[1].split('</details>')[0].matchAll(/^\| (\d{4}) \| .*? \| ([ABCDE]) \| (collect|contain|include|comprise|other) \| (full|partial|failed) \| (\d+) \|/gmu)]
  .map(match=>({id:Number(match[1]),category:match[2],trigger:match[3],before:match[4],beforeEntries:Number(match[5])}));
assert.equal(labels.length,1520);
const db=parseBackup(JSON.parse(bytes.toString('utf8')));
const items=Object.values(db.providerItems).filter(i=>i.provider==='kindle'&&i.metadata?.enrichment?.kindleProductComicContents?.statement?.trim()).sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
assert.equal(items.length,labels.length);
const originalFetch=globalThis.fetch;let networkCalls=0;
globalThis.fetch=()=>{networkCalls++;throw Error('Corpus reprocessing must not request network');};
const count=(rows,fn)=>Object.fromEntries([...new Set(rows.map(fn))].map(key=>[key,rows.filter(row=>fn(row)===key).length]));
const useful=row=>['A','B','C'].includes(row.category);
const start=performance.now();
const rows=items.map((item,n)=>({...labels[n],item,proposal:proposeContentsForReview(item.metadata.enrichment.kindleProductComicContents.statement,item.title)}));
const filterParseMs=performance.now()-start;
const risks=rows.filter(row=>useful(row)&&/\b(?:material from|excerpts? from|selections? from|partial)\b/iu.test(row.item.metadata.enrichment.kindleProductComicContents.statement));
const fixture=JSON.parse(await readFile(new URL('../tests/kindle-contents-quality-fixtures.json',import.meta.url),'utf8')).fixtures;
const readMoreIds=new Set(fixture.filter(row=>row.readMore28).map(row=>row.auditId));
const falseFullIds=new Set(fixture.filter(row=>row.falseFull).map(row=>row.auditId));
const knownStructural=rows.filter(row=>fixture.some(f=>f.auditId===row.id&&f.structural));
const plan=kindleContentsPlan(db);assert.equal(plan.eligible,3194);assert.equal(plan.candidates.length,0);assert.equal(plan.reprocess.length,1520);
const stored={[DATABASE_STORAGE_KEY]:structuredClone(db)};let writes=0;
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async update=>{writes++;Object.assign(stored,structuredClone(update));}});
const writeStart=performance.now(),batchSizes=[];
try{
  for(let offset=0;offset<plan.reprocess.length;offset+=100){const batch=plan.reprocess.slice(offset,offset+100);batchSizes.push(batch.length);await writer.reparseKindleContents(batch.map(i=>({itemId:i.id,recordRef:i.recordRef})));}
}finally{globalThis.fetch=originalFetch;}
const batchReprocessMs=performance.now()-writeStart,after=await writer.getDatabase();
assert.equal(writes,16);assert.equal(networkCalls,0);assert.deepEqual(after.contentReviews,db.contentReviews);assert.deepEqual(after.canonicalItems,db.canonicalItems);
assert.equal(kindleContentsPlan(after).reprocess.length,0);assert.equal(kindleContentsPlan(after).candidates.length,0);
for(const row of rows){const saved=after.providerItems[row.item.id].metadata.enrichment.kindleProductComicContents,previous=row.item.metadata.enrichment.kindleProductComicContents;
 assert.equal(saved.statement,previous.statement);assert.equal(saved.checkedAt,previous.checkedAt);assert.equal(saved.extractorVersion,previous.extractorVersion);
 assert.equal(saved.parseOutcome,row.proposal.outcome);assert.equal(after.providerItems[row.item.id].ownership,row.item.ownership);
}
assert.equal(sourceHash,hash(await readFile(file)));
console.log(JSON.stringify({sourceHash,sourceUnchanged:true,eligible:plan.eligible,networkCalls,
 before:{statements:1520,full:655,partial:215,failed:650,falseExtractions:330,uncertainAuditLabels:23,usefulStatements:1167,proposedEntries:labels.reduce((sum,row)=>sum+row.beforeEntries,0),reviewQueue:1520},
 after:{statements:rows.length,outcomes:count(rows,row=>row.proposal.outcome),quality:count(rows,row=>row.proposal.quality),proposedEntries:rows.reduce((sum,row)=>sum+row.proposal.entries.length,0),reviewQueue:enrichmentWorkbenchRows(after).filter(row=>row.id.startsWith('contents:')).length,descriptionMayBeIncomplete:rows.filter(row=>row.proposal.descriptionMayBeIncomplete).length},
 matrix:count(rows,row=>row.category+'/'+row.proposal.outcome),
 falseExtractionResults:count(rows.filter(row=>row.category==='D'),row=>row.proposal.outcome),
 legitimateRejected:rows.filter(row=>useful(row)&&row.proposal.outcome==='filtered').length,
 triggerResults:Object.fromEntries(['collect','contain','include','comprise'].map(trigger=>[trigger,{before:count(rows.filter(row=>row.trigger===trigger),row=>row.category),after:count(rows.filter(row=>row.trigger===trigger),row=>row.category+'/'+row.proposal.outcome)}])),
 originalUsefulFailures:{total:308,after:count(rows.filter(row=>useful(row)&&row.before==='failed'),row=>row.proposal.outcome),structured:rows.filter(row=>useful(row)&&row.before==='failed'&&row.proposal.entries.length).length},
 originalFalseFull:count(rows.filter(row=>falseFullIds.has(row.id)),row=>row.proposal.outcome),allAuditFalseFullRemaining:rows.filter(row=>row.category==='D'&&row.proposal.outcome==='full').length,
 knownStructural:knownStructural.map(row=>({auditId:row.id,outcome:row.proposal.outcome,entries:row.proposal.entries.length})),
 readMore28:count(rows.filter(row=>readMoreIds.has(row.id)),row=>row.proposal.outcome),
 excerpt120:{outcomes:count(risks,row=>row.proposal.outcome),proposedEntries:count(risks.flatMap(row=>row.proposal.entries),entry=>entry.completeness)},
 performance:{filterParseMs,batchReprocessMs,filterParseMsPerRecord:filterParseMs/rows.length,batchSizes,wholeDatabaseWrites:writes,measurement:'Node, structured-clone in-memory storage; includes validation/persistence copies and undo history; not browser disk/network timing.'}
},null,2));
