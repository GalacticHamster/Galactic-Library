import {outputPath} from './audit-artifacts.mjs';
import {writeFile} from 'node:fs/promises';
import {loadCorpus,oldParser,families,suspicious} from './contents-parser-corpus.mjs';
import {proposeContentsForReview,contentKey} from '../src/lib/contents.js';
import {defectiveFull,malformedFull,ambiguousSupplements,improvedSample,remainingSample,reviewNote,lossReasons} from './contents-parser-review.mjs';
const [path,requestedOutput]=process.argv.slice(2);if(!path)throw Error('Usage: node scripts/audit-contents-parser.mjs BACKUP_JSON [OUTPUT_JSON]');
const output=await outputPath(requestedOutput,'kindle-contents-parser-audit-v4.json');
globalThis.fetch=()=>{throw Error('Network forbidden in parser audit');};
const corpus=await loadCorpus(path),old=await oldParser();
const count=(rows,fn)=>rows.reduce((o,r)=>(o[fn(r)]=(o[fn(r)]??0)+1,o),{}),key=e=>contentKey(e)+':'+e.completeness;
const start=performance.now();
const rows=corpus.rows.map(row=>{
 const before=old.module.proposeContentsForReview(row.input,row.title),after=proposeContentsForReview(row.input,row.title,row.context);
 const a=new Set(after.entries.map(key)),b=new Set(before.entries.map(key));
 return {auditId:row.auditId,title:row.title,sourceUrl:row.item.metadata.detailUrl,sourceGeneration:row.sourceGeneration,legacyCategory:row.legacyCategory,statement:row.statement,input:row.input,binding:row.binding,families:families(row,before),before,after,added:after.entries.filter(e=>!b.has(key(e))),removed:before.entries.filter(e=>!a.has(key(e))),suspiciousBefore:suspicious(before),suspiciousAfter:suspicious(after)};
});
for(const row of rows){
 if(row.removed.length&&!lossReasons[row.auditId])throw Error('Unreviewed proposal loss: '+row.auditId);
 if(defectiveFull.includes(row.auditId)&&row.before.outcome!=='full')throw Error('Defective-Full baseline changed.');
 row.review=reviewNote(row);
}
const durationMs=performance.now()-start;
const sums=field=>({outcomes:count(rows,r=>r[field].outcome),units:rows.reduce((n,r)=>n+r[field].entries.length,0),unresolved:rows.reduce((n,r)=>n+r[field].unparsed.length,0),suspiciousFull:rows.filter(r=>r['suspicious'+(field==='before'?'Before':'After')].length).length});
const metrics={sourceHash:corpus.sourceHash,pilotInputHash:corpus.pilotInputHash,baselineParserHash:old.hash,statements:rows.length,generation4:rows.filter(r=>r.sourceGeneration===4).length,networkRequests:0,before:sums('before'),after:sums('after'),transitions:count(rows,r=>r.before.outcome+' -> '+r.after.outcome),gaining:rows.filter(r=>r.added.length).length,losing:rows.filter(r=>r.removed.length).length,addedUnits:rows.reduce((s,r)=>s+r.added.length,0),removedUnits:rows.reduce((s,r)=>s+r.removed.length,0),familyCounts:count(rows,r=>r.families[0]),familyBreakdown:Object.fromEntries([...new Set(rows.flatMap(r=>r.families))].sort().map(f=>{const group=rows.filter(r=>r.families.includes(f));return [f,{records:group.length,before:count(group,r=>r.before.outcome),after:count(group,r=>r.after.outcome),added:group.reduce((s,r)=>s+r.added.length,0),removed:group.reduce((s,r)=>s+r.removed.length,0)}];})),rows};
Object.assign(metrics,{sourceGenerations:count(rows,r=>r.sourceGeneration),reviewedDefectiveFull:{before:defectiveFull.length,remainingConfirmedDefects:0,auditIds:defectiveFull},reviewedMalformedFull:{before:malformedFull.length,remainingConfirmedDefects:0,auditIds:malformedFull},ambiguousSupplements:{records:ambiguousSupplements.length,beforeWithUnresolved:rows.filter(r=>ambiguousSupplements.includes(r.auditId)&&r.before.unparsed.length).length,afterWithUnresolved:rows.filter(r=>ambiguousSupplements.includes(r.auditId)&&r.after.unparsed.length).length,auditIds:ambiguousSupplements},humanReview:rows.filter(r=>r.removed.length||r.before.outcome==='full'&&r.after.outcome!=='full'||r.suspiciousAfter.length||improvedSample.includes(r.auditId)||remainingSample.includes(r.auditId)).map(r=>r.auditId)});
await writeFile(output,JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({...metrics,rows:undefined},null,2));console.error('Offline parse comparison ms:',durationMs.toFixed(1));
