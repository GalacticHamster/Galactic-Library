// Offline replay and metrics only. Never makes requests or alters a library.
import {readFile,writeFile} from 'node:fs/promises';
import {selectManifest,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {contentKey,proposeContentsForReview} from '../src/lib/contents.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/analyze-kindle-manifest-pilot.mjs PILOT_JSON METRICS_JSON');
const pilot=JSON.parse(await readFile(input,'utf8'));if(!pilot.finishedAt)throw Error('Pilot is not finished.');
const count=(rows,fn)=>rows.reduce((r,x)=>(r[fn(x)]=(r[fn(x)]??0)+1,r),{});
const normalize=s=>String(s??'').replace(/\s+/gu,' ').replace(/\s+Read more\s*$/iu,'').replace(/[.!]+$/u,'').trim().toLowerCase();
const replayStart=performance.now();
const rows=pilot.rows.map(row=>{
 const selection=row.manifest?selectManifest(row.manifest.blocks,row.title):{statement:row.statement,manifest:null};
 const parsed=selection.statement?manifestReviewProposal(selection,row.title):{outcome:'not-attempted',entries:[],unparsed:[]};
 const before=proposeContentsForReview(row.beforeStatement,row.title),keys=new Set(parsed.entries.map(contentKey));
 const candidates=selection.manifest?.candidates??[],winner=candidates[selection.manifest?.selected],plausible=candidates.filter(c=>c.quality!=='filtered');
 const index=selection.manifest?.selected??-1,winningPlausibleIndex=plausible.indexOf(winner);
 const usefulSecondary=(selection.manifest?.secondary??[]).filter(i=>candidates[i].entries>0);
 return {ordinal:row.ordinal,title:row.title,sourceUrl:row.sourceUrl,availability:row.availability,before:row.before,initialPilotAfter:row.after,after:{outcome:parsed.outcome,entries:parsed.entries.length,unresolved:parsed.unparsed.length},
  statement:selection.statement,candidates:candidates.map(c=>({raw:c.raw,parserInput:c.parserInput,binding:c.binding,quality:c.quality,outcome:c.outcome,entries:c.entries,unresolved:c.unresolved,position:c.position,structural:c.structural})),selected:index,
  position:winner?.position??null,positionBucket:index<0?'none':index===0?'first':index===candidates.length-1?'last':'middle',
  plausiblePositionBucket:winningPlausibleIndex<0?'none':winningPlausibleIndex===0?'first':winningPlausibleIndex===plausible.length-1?'last':'middle',
  laterThanFirst:index>0,structuralWinner:Boolean(winner?.structural),complementary:usefulSecondary.length>0,
  laterReplacedSavedEarly:index>0&&normalize(row.beforeStatement).slice(0,50)===normalize(candidates[0]?.raw).slice(0,50),
  changed:row.beforeStatement!==selection.statement||before.outcome!==parsed.outcome||before.entries.length!==parsed.entries.length,
  lostPriorUnits:before.entries.filter(e=>!keys.has(contentKey(e))),unresolved:parsed.unparsed,
  proposedSeries:[...new Set(parsed.entries.map(e=>e.series))],secondary:selection.manifest?.secondary??[],
  offlineReplayChanged:JSON.stringify(row.after)!==JSON.stringify({outcome:parsed.outcome,entries:parsed.entries.length,unresolved:parsed.unparsed.length})||row.statement!==selection.statement};
});
const replayMs=performance.now()-replayStart,stages=pilot.rows.flatMap(r=>r.remoteAttempts.flatMap(a=>a.stages));
const stats=values=>{values=values.sort((a,b)=>a-b);return {n:values.length,totalMs:values.reduce((s,v)=>s+v,0),medianMs:values[Math.floor(values.length/2)]??0,p95Ms:values[Math.min(values.length-1,Math.ceil(values.length*.95)-1)]??0,maxMs:values.at(-1)??0};};
const metrics={sourceHash:pilot.sourceHash,populationHash:pilot.populationHash,network:{planned:77,attempted:pilot.rows.length,requests:pilot.rows.reduce((s,r)=>s+r.attempts,0),successful:pilot.rows.filter(r=>!r.error).length,unavailable:pilot.rows.filter(r=>r.availability==='unavailable').length,transientFailures:pilot.rows.flatMap(r=>r.remoteAttempts).filter(a=>!a.ok&&/\b(?:429|500|502|503|504)\b|network|fetch|timed out/iu.test(a.error)).length,retries:pilot.rows.reduce((s,r)=>s+Math.max(0,r.attempts-1),0),captchaStops:pilot.rows.filter(r=>/CAPTCHA/iu.test(r.error)).length,signInStops:pilot.rows.filter(r=>/sign in/iu.test(r.error)).length,stop:pilot.stop,elapsedMs:pilot.elapsedMs,checkpointCount:pilot.checkpoints.length,checkpointPages:pilot.checkpoints.reduce((s,c)=>s+c.count,0)},
 timing:{offlineReplayMs:replayMs,pages:stats(pilot.rows.map(r=>r.pageMs)),checkpoints:stats(pilot.checkpoints.map(c=>c.ms)),stages:Object.fromEntries([...new Set(stages.map(s=>s.stage))].map(stage=>[stage,stats(stages.filter(s=>s.stage===stage).map(s=>s.ms))]))},
 before:count(rows,r=>r.before.outcome),initialPilotAfter:count(rows,r=>r.initialPilotAfter.outcome),after:count(rows,r=>r.after.outcome),
 proposals:{before:rows.reduce((s,r)=>s+r.before.entries,0),initial:rows.reduce((s,r)=>s+r.initialPilotAfter.entries,0),after:rows.reduce((s,r)=>s+r.after.entries,0)},
 unresolved:{before:rows.reduce((s,r)=>s+r.before.unresolved,0),after:rows.reduce((s,r)=>s+r.after.unresolved,0)},
 extraction:{candidateDistribution:count(rows,r=>r.candidates.length),zero:rows.filter(r=>!r.candidates.length).length,one:rows.filter(r=>r.candidates.length===1).length,multiple:rows.filter(r=>r.candidates.length>1).length,total:rows.reduce((s,r)=>s+r.candidates.length,0),positions:count(rows,r=>r.positionBucket),plausiblePositions:count(rows,r=>r.plausiblePositionBucket),laterThanFirst:rows.filter(r=>r.laterThanFirst).length,laterReplacedSavedEarly:rows.filter(r=>r.laterReplacedSavedEarly).length,structuralWinners:rows.filter(r=>r.structuralWinner).length,complementary:rows.filter(r=>r.complementary).length,meanPosition:rows.filter(r=>r.position!==null).reduce((s,r)=>s+r.position,0)/Math.max(1,rows.filter(r=>r.position!==null).length)},
 changed:rows.filter(r=>r.changed).length,withLostPriorUnits:rows.filter(r=>r.lostPriorUnits.length).map(r=>({title:r.title,before:r.before,after:r.after,lost:r.lostPriorUnits,statement:r.statement})),offlineReplayChanged:rows.filter(r=>r.offlineReplayChanged).map(r=>r.title),invariants:pilot.invariants,rows};
await writeFile(output,JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({...metrics,rows:undefined},null,2));
