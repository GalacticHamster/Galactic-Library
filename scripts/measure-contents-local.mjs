// Offline control: real writer/validator/parser against a disposable in-memory
// copy. Never touches the source export, extension data or a provider endpoint.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBackup} from '../src/lib/storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {kindleContentsPlan} from '../src/lib/kindle-contents.js';
import {DATABASE_STORAGE_KEY} from '../src/lib/constants.js';
const [file,countText='20']=process.argv.slice(2),count=Number(countText);
if(!file||!Number.isInteger(count)||count<1||count>50)throw Error('Usage: node scripts/measure-contents-local.mjs BACKUP_JSON [1..50]');
const bytes=await readFile(file),hash=value=>createHash('sha256').update(value).digest('hex');
const db=parseBackup(JSON.parse(bytes.toString('utf8'))),perf=globalThis.GalacticContentsPerformance;
const stored={[DATABASE_STORAGE_KEY]:structuredClone(db)};
// Include structured-clone costs; this is not disk/IndexedDB timing.
const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>Object.assign(stored,structuredClone(updates))});
const collector=perf.collector();let sequence=0;
const next=kind=>perf.trace(`lookup-abcdef123456-${String(++sequence).padStart(3,'0')}`,kind);
const prepare=next('prepare'),prepareEnd=prepare.begin('queue_prepare'),workerEnd=prepare.begin('worker_total');
const current=await writer.execute('getDatabase',[],prepare),selectionEnd=prepare.begin('candidate_selection');
const plan=kindleContentsPlan(current);selectionEnd();workerEnd();prepareEnd();collector.add(prepare.finish('prepared'));
const books=plan.candidates.slice(0,count),saved=Object.values(current.providerItems).filter(item=>item.provider==='kindle'&&item.metadata.enrichment?.kindleProductComicContents?.statement).slice(0,100);
// Replay two deterministic result shapes on temporary data, never fetched pages.
for(const result of ['no-statement','statement-found'])for(const item of books){
 const t=next('network'),end=t.begin('save_message'),worker=t.begin('worker_total');t.attempts=1;
 await writer.execute('saveKindleComicContents',[[{itemId:item.id,recordRef:item.recordRef,sourceUrl:item.detailUrl,statement:result==='statement-found'?'Includes First Work and Second Work':'',availability:result,extractorVersion:2}]],t);
 worker();end();collector.add(t.finish(result));
}
if(saved.length){const t=next('reparse');t.batchSize=saved.length;const end=t.begin('request_dispatch'),worker=t.begin('worker_total');await writer.execute('reparseKindleContents',[saved.map(item=>({itemId:item.id,recordRef:item.recordRef}))],t);worker();end();collector.add(t.finish('reparsed'));}
if(hash(bytes)!==hash(await readFile(file)))throw Error('Source backup changed during the control measurement.');
console.log(JSON.stringify({measurement:'OFFLINE Node control. Replayed result saves only; no network, actual browser messaging, UI, throttle or durable storage. Runtime estimates describe only measured local cost.',sourceUnchanged:true,providerRecordCount:Object.keys(db.providerItems).length,eligibleCount:plan.eligible,samplePerResult:books.length,...collector.report()},null,2));
