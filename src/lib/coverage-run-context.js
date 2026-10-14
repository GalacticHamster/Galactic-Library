import {identityKey} from './identity.js';
import {proposeContentsForReview} from './contents.js';

const scope=e=>JSON.stringify([identityKey(e.series),e.unitType,identityKey(e.language)]);
const member=e=>JSON.stringify([identityKey(e.series),identityKey(e.run),e.unitType,identityKey(e.language)]);
const unit=e=>['issue','annual','special'].includes(e.unitType);
const numberKind=n=>/^\d+$/u.test(n)?'integer':/^\d+\.\d+$/u.test(n)?'decimal':/^\d+\/\d+$/u.test(n)?'fraction':'';
const numberValue=n=>n.includes('/')?Number(n.split('/')[0])/Number(n.split('/')[1]):Number(n);
const period=run=>{
  const match=/^(\d{4})(?:[-–—](\d{0,4}))?$/u.exec(run??'');
  return match?[Number(match[1]),match[2]===undefined?Number(match[1]):match[2]?Number(match[2]):9999]:null;
};
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const signature=e=>JSON.stringify([scope(e),e.number,e.completeness]);
function sourcePeriods(row){
  const source=row.original.metadata?.enrichment?.kindleProductComicContents;
  const labels=[row.original.title,...(row.original.metadata?.series??[]),...(source?.productDetailsEvidence?.observations??[]).filter(o=>o.field==='series'&&o.status==='observed').map(o=>o.value??o.raw??'')];
  const periods=labels.flatMap(label=>[...String(label).matchAll(/\((\d{4}(?:[-–—]\d{0,4})?)\)/gu)].map(m=>period(m[1])));
  // A historical decade in the introductory description is contextual evidence;
  // a modern reprint's release date is not its constituent comics' era.
  const intro=(source?.manifest?.blocks??[]).map(b=>b.text??'').join(' ').slice(0,600);
  for(const match of intro.matchAll(/\b(?:the|in|from|during|of)\s+(\d{3}0)s\b/giu))periods.push([Number(match[1]),Number(match[1])+9]);
  return periods.filter(Boolean);
}
function yearHints(text,series){
  const expression=new RegExp('(?:^|[^\\p{L}])'+escape(series)+'\\s*(?:\\((\\d{4})(?:[-–—]\\d{0,4})?\\)|#\\s*\\d+(?:[-–—]\\d+)?\\s*\\((\\d{4})\\))','giu');
  return [...text.matchAll(expression)].map(m=>Number(m[1]??m[2]));
}

// Build once from explicit/directly resolved evidence, including inaccessible
// records for contradictions. Newly inferred runs never seed this catalogue.
// This is a read projection: neither parser proposals nor saved sources change.
export function inferCoverageRuns(rows,{resolveEntry,hasConflict,excludedScopes=[]}={}){
  const catalogue=new Map(),bridges=new Map(),excluded=new Set(excludedScopes);
  for(const row of rows){
    if(row.contents.review)continue;
    const sourceRuns=new Map(),contexts=new Map();
    for(const entry of row.entries)if(entry.run){const key=scope(entry),runs=sourceRuns.get(key)??new Set();runs.add(identityKey(entry.run));sourceRuns.set(key,runs);}
    for(const entry of row.entries){
      if(entry.unitType!=='issue'||!entry.run)continue;
      // A publication-volume/year alias needs an unambiguous same-series source
      // context. Never learn it from the collected book's volume number or from
      // a multi-era anthology's parent label.
      if(sourceRuns.get(scope(entry))?.size!==1)continue;
      if(!/^\d{4}$|^volume \d+$/u.test(entry.run))continue;
      if(!contexts.has(scope(entry)))contexts.set(scope(entry),resolveEntry({...entry,run:''},row.original,true));
      const contextual=contexts.get(scope(entry));
      const target=period(contextual.run),original=period(entry.run);
      if(!target||contextual.run===entry.run)continue;
      if(original&&(original[0]!==target[0]||!/^\d{4}$/u.test(entry.run)))continue;
      if(!original&&!/^volume \d+$/u.test(entry.run))continue;
      const key=JSON.stringify([scope(entry),identityKey(entry.run)]),runs=bridges.get(key)??new Set();runs.add(contextual.run);bridges.set(key,runs);
    }
  }
  const alias=entry=>{
    const targets=bridges.get(JSON.stringify([scope(entry),identityKey(entry.run)]));
    return targets?.size===1?[...targets][0]:'';
  };
  for(const row of rows)if(!row.contents.review)row.entries=row.entries.map(entry=>{
    const run=alias(entry);
    return run&&!excluded.has(member(entry))?{...entry,run,runInference:{run,sourceRun:entry.run,reason:'Saved same-series context establishes this publication-run alias'}}:entry;
  });
  for(const row of rows)for(const entry of [...row.entries,...row.standalone]){
    if(!unit(entry)||!entry.run)continue;
    const bridge=bridges.get(JSON.stringify([scope(entry),identityKey(entry.run)]));
    const run=bridge?.size===1?[...bridge][0]:entry.run,key=scope(entry),runs=catalogue.get(key)??new Map();
    const candidate=runs.get(identityKey(run))??{run,period:period(run),numbers:new Map()};
    const kind=numberKind(entry.number),numbers=candidate.numbers.get(kind)??[];numbers.push(numberValue(entry.number));candidate.numbers.set(kind,numbers);
    runs.set(identityKey(run),candidate);catalogue.set(key,runs);
  }
  for(const runs of catalogue.values())for(const candidate of runs.values())for(const [kind,numbers]of candidate.numbers)candidate.numbers.set(kind,{min:Math.min(...numbers),max:Math.max(...numbers)});
  for(const row of rows){
    if(row.contents.review||!['explicit-statement','explicit-clause','natural-reprint'].includes(row.contents.parseBinding)&&!row.contents.contextualEvidence?.length||!row.entries.some(e=>unit(e)&&!e.run))continue;
    const text=row.contents.parseInput||row.contents.manifestEvidence||'',periods=sourcePeriods(row),clauseRuns=new Map(),unsafeClauses=new Set();
    // Semicolons delimit claims. Associate explicit same-series run context only
    // with entries in that clause, rather than carrying it across the manifest.
    const clauses=text.includes(';')?text.split(';').map(text=>({text,entries:proposeContentsForReview(/^\s*collect(?:s|ing)?\b/iu.test(text)?text:'Collects '+text).entries.map(entry=>resolveEntry(entry,row.original))})):[];
    for(const clause of clauses)for(const entry of clause.entries.filter(e=>!e.run)){
      const runs=new Set(clause.entries.filter(e=>scope(e)===scope(entry)&&e.run).map(e=>identityKey(e.run)));
      if(!runs.size)runs.add('');
      if(new Set(yearHints(clause.text,entry.series)).size>1)unsafeClauses.add(signature(entry));
      const key=signature(entry),previous=clauseRuns.get(key);clauseRuns.set(key,previous?new Set([...previous,...runs]):runs);
    }
    row.entries=row.entries.map(entry=>{
      if(!unit(entry)||entry.unitType==='annual'||entry.run||excluded.has(member(entry))||hasConflict(entry,row.original))return entry;
      const publicationYear=Number(/^\d{4}/u.exec(row.original.metadata?.publicationDate??'')?.[0])||null;
      const candidates=[...(catalogue.get(scope(entry))?.values()??[])].filter(c=>c.numbers.has(numberKind(entry.number))&&(!publicationYear||!c.period||c.period[0]<=publicationYear));
      if(!candidates.length)return entry;
      const hints=yearHints(text,entry.series),mixed=new Set(hints).size>1;
      const local=clauseRuns.get(signature(entry))??new Set(row.entries.filter(e=>scope(e)===scope(entry)&&e.run).map(e=>identityKey(e.run)));
      let chosen,reason;
      if((clauseRuns.has(signature(entry))?!unsafeClauses.has(signature(entry)):!mixed)&&local.size===1){chosen=candidates.find(c=>local.has(identityKey(c.run)));reason='Other issues in this contents clause identify the run';}
      if(entry.runContextConflict&&!chosen)return entry;
      if(!chosen){
        // Test the complete same-series numbering cohort, not each issue in
        // isolation. A later #1-3 run cannot explain a runless #1-13 collection.
        const cohort=row.entries.filter(e=>scope(e)===scope(entry)&&!e.run&&numberKind(e.number)===numberKind(entry.number));
        const inside=candidates.filter(c=>{const range=c.numbers.get(numberKind(entry.number));return cohort.every(e=>numberValue(e.number)>=range.min&&numberValue(e.number)<=range.max);});
        // All contextual periods must support the same candidate. Contradictory
        // source/title eras cannot be overridden by a convenient number range.
        const preferences=!mixed?periods.map(([a,b])=>{
          const scores=candidates.filter(c=>c.period).map(c=>({c,score:Math.max(0,Math.min(b,c.period[1])-Math.max(a,c.period[0])+1)}));
          const max=Math.max(0,...scores.map(s=>s.score)),best=scores.filter(s=>s.score===max&&max>=(b-a+1)/2);return best.length===1?best[0].c:null;
        }):[];
        const contextual=preferences.length&&preferences.every(c=>c&&c===preferences[0])?preferences[0]:null;
        // An observed minimum is not a run's first published issue. Historical
        // context can identify lower numbers not yet represented in that run,
        // even if a later reset also contains them. A competing high-numbered
        // envelope remains a contradiction rather than being copied backward.
        if(contextual&&(!inside.some(c=>c.period)||inside.includes(contextual)||cohort.every(e=>numberValue(e.number)<=contextual.numbers.get(numberKind(entry.number)).max))){chosen=contextual;reason='The collection era agrees with saved evidence for this series';}
        else if(inside.length===1&&!periods.length){chosen=inside[0];reason='Only one saved run supports this issue range';}
        else if(inside.length===1&&mixed){chosen=inside[0];reason='Only one saved run supports this range; explicit eras stay separate';}
      }
      return chosen?{...entry,run:chosen.run,...(entry.runContextConflict?{runContextConflict:false}:{}),runInference:{run:chosen.run,reason}}:entry;
    });
  }
}
