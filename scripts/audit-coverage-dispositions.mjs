// Read-only offline audit. A private backup must be supplied explicitly.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import assert from 'node:assert/strict';
import {parseBackup,createBackup} from '../src/lib/storage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {resolutionCandidates,compatibleResolutionCollections,coverageResolutionRequest,applyCoverageResolutions} from '../src/lib/coverage-resolution.js';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
globalThis.fetch=()=>{throw Error('This audit is offline.');};
const path=requireBackup(process.argv[2]),out=await outputPath(process.argv[3]??'audit-artifacts/coverage-resolution/audit.json'),bytes=await readFile(path),hash=value=>createHash('sha256').update(value).digest('hex'),backup=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,'')),db=parseBackup(backup),initial=hash(JSON.stringify(db)),merges=backup.comicCoverageMerges??{},before=comicCoverageForLibrary(db,merges);
const metrics=p=>{
 const obs=p.dispositions.flatMap(r=>r.observations).filter(o=>o.parsed),contents=obs.filter(o=>o.origin==='contents'),eligible=obs.filter(o=>o.accessEligible),reasons={},references={};
 for(const o of obs)for(const r of o.reasons)reasons[r.code]=(reasons[r.code]??0)+1;
 for(const row of p.dispositions)for(const r of row.references)if(r.actionable)references[r.code]=(references[r.code]??0)+1;
 return {parsed:obs.length,contentsParsed:contents.length,standaloneParsed:obs.length-contents.length,countedFullObservations:obs.filter(o=>o.countedFull).length,countedPartialObservations:obs.filter(o=>o.countedPartial).length,partialObservations:obs.filter(o=>o.extent==='excerpt').length,eligibleProvisional:eligible.filter(o=>o.provisional).length,allProvisional:obs.filter(o=>o.provisional).length,excludedByAccess:obs.filter(o=>!o.accessEligible).length,missingOrAmbiguousRun:obs.filter(o=>o.reasons.some(r=>r.code.startsWith('run-')||r.code==='annual-run-unresolved')).length,actionableCollections:p.dispositions.filter(r=>r.summary.actionable>0).length,zeroCountedWithParsed:p.dispositions.filter(r=>r.summary.parsed&&!r.summary.full&&!r.summary.partial).length,mixedCountedUnresolved:p.dispositions.filter(r=>(r.summary.full||r.summary.partial)&&r.summary.actionable>0).length,covered:p.groups.reduce((n,g)=>n+g.covered,0),partialOnly:p.groups.reduce((n,g)=>n+g.partial,0),duplicates:p.groups.reduce((n,g)=>n+g.duplicates,0),excludedBooks:p.excluded.length,reasons,referenceReasons:references};
};
const targets=before.dispositions.filter(r=>/Teenage Mutant Ninja Turtles: (?:The Ultimate B&W Collection Vol. [123]|Urban Legends Vol. [12])$/u.test(r.title)),cases=[];
for(const row of targets){
 const ids=row.observations.filter(o=>o.origin==='contents'&&o.parsed).map(o=>o.id),choices=resolutionCandidates(row,before.dispositions,db,ids),choice=choices.find(c=>c.suggested);assert(choice,'No supported run choice: '+row.title);
 const request=coverageResolutionRequest(row,ids,choice,db),next=applyCoverageResolutions(db,{confirmed:true,mergeStamp:JSON.stringify(merges),targets:[request]},{merges}).database,after=comicCoverageForLibrary(next,merges),fixed=after.dispositions.find(r=>r.recordRef===row.recordRef);
 const restored=parseBackup(createBackup(next)),reimported={...restored,providerItems:{...restored.providerItems,[row.id]:{...restored.providerItems[row.id],metadata:structuredClone(db.providerItems[row.id].metadata)}}},again=comicCoverageForLibrary(reimported,merges).dispositions.find(r=>r.recordRef===row.recordRef);assert.equal(again.summary.full,fixed.summary.full);
 cases.push({title:row.title,recordRef:row.recordRef,before:row.summary,blockingReasons:[...new Set(row.observations.flatMap(o=>o.reasons.map(r=>r.code)))],source:row.statement,choices,selected:choice,after:fixed.summary,persistedAfterRestoreAndReimport:true,related:compatibleResolutionCollections(row,ids,choice,before.dispositions,db).map(c=>c.collection.title)});
}
// Two explicitly confirmed batches. Do not propagate from one to the other.
let simulated=db;
for(const family of ['Ultimate B&W','Urban Legends']){
 const p=comicCoverageForLibrary(simulated,merges),row=p.dispositions.find(r=>targets.some(t=>t.recordRef===r.recordRef)&&r.title.includes(family)),ids=row.observations.filter(o=>o.parsed).map(o=>o.id),target=resolutionCandidates(row,p.dispositions,simulated,ids).find(c=>c.suggested),related=compatibleResolutionCollections(row,ids,target,p.dispositions,simulated),requests=[coverageResolutionRequest(row,ids,target,simulated),...related.map(c=>coverageResolutionRequest(c.collection,c.ids,c.target,simulated))];
 simulated=applyCoverageResolutions(simulated,{confirmed:true,mergeStamp:JSON.stringify(merges),targets:requests},{merges}).database;
}
const simulatedProjection=comicCoverageForLibrary(simulated,merges);
const changed=before.dispositions.flatMap(row=>{const next=simulatedProjection.dispositions.find(r=>r.recordRef===row.recordRef);return row.observations.flatMap(o=>{const n=next?.observations.find(v=>v.id===o.id);return n&&(n.countedFull!==o.countedFull||n.provisional!==o.provisional||n.resolved.run!==o.resolved.run)?[{title:row.title,observation:o.id,before:o,after:n}]:[];});});
const raphaelRow=simulatedProjection.dispositions.find(r=>r.title.endsWith('Ultimate B&W Collection Vol. 1')),referenceId=raphaelRow.references.findIndex(r=>r.fragment.includes('Raphael')),raphaelIds=['reference:'+referenceId],raphaelChoice=resolutionCandidates(raphaelRow,simulatedProjection.dispositions,simulated,raphaelIds).find(c=>c.suggested),raphaelResult=applyCoverageResolutions(simulated,{confirmed:true,mergeStamp:JSON.stringify(merges),targets:[coverageResolutionRequest(raphaelRow,raphaelIds,raphaelChoice,simulated)]},{merges}).database;
assert.equal(hash(JSON.stringify(db)),initial);assert.equal(hash(await readFile(path)),hash(bytes));assert.deepEqual(simulated.providerItems,db.providerItems);assert.deepEqual(simulated.ownershipReviews,db.ownershipReviews);assert.equal(Object.keys(simulated.contentReviews).length,Object.keys(db.contentReviews).length+5);
const data={input:{filename:basename(path),modified:(await stat(path)).mtime.toISOString(),sha256:hash(bytes),providerRecords:Object.keys(db.providerItems).length},before:metrics(before),simulatedAfter:metrics(simulatedProjection),simulatedWithRaphael:metrics(comicCoverageForLibrary(raphaelResult,merges)),cases,changedObservations:changed.length,changed,protectedStateUnchanged:true,dispositions:before.dispositions};await writeFile(out,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({...data,dispositions:undefined,changed:undefined,cases:cases.map(c=>({title:c.title,before:c.before,after:c.after}))},null,2));
