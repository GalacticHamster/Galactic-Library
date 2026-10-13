import {identityKey} from './identity.js';
import {annualParentRunEligible} from './contents.js';

const calendar=run=>/^(\d{4})(?:-(\d{4})?)?$/u.exec(run??'');
const key=entry=>JSON.stringify([identityKey(entry.series),calendar(entry.run)?.[1],identityKey(entry.language)]);
const sameName=(a,b)=>identityKey(a.series)===identityKey(b.series);
const nameVariant=(a,b)=>{
  const left=identityKey(a.series),right=identityKey(b.series),short=left.length<right.length?left:right,long=left.length<right.length?right:left;
  // A source must connect these labels; suffix similarity alone is never an alias.
  return short.split(' ').length>=2&&!/^(?:comic books|comic issues|graphic novels)$/u.test(short)&&long.endsWith(' '+short);
};
export function annualHintForEntry(contents,entry){
  const matching=(contents.annualRunHints??[]).filter(hint=>sameName(hint,entry)&&hint.numbers.includes(entry.number));
  const bound=matching.filter(hint=>hint.resolvedRun&&hint.resolvedRun===entry.run),unbound=matching.filter(hint=>!hint.resolvedRun);
  const applicable=bound.length?bound:!entry.run&&unbound.length?unbound:matching;
  const unique=[...new Map(applicable.map(hint=>[JSON.stringify([hint.year,hint.resolvedRun]),hint])).values()];
  return unique.length>1?{conflict:true}:unique[0];
}

// Local, transient annual coverage projection. Never rewrites parser input,
// reviews, regular issues, imported records or companion product identity.
export function resolveAnnualCoverage(rows,{parentSeries}){
  const regular=rows.flatMap(row=>[...row.entries,...row.standalone]).filter(entry=>entry.unitType==='issue'&&calendar(entry.run));
  const catalog=new Map(),links=new Map();
  const annualFormats=new Map();
  for(const row of rows)for(const entry of row.entries)if(entry.unitType==='annual'&&calendar(entry.run)){const formats=annualFormats.get(key(entry))??new Set();formats.add(entry.run);annualFormats.set(key(entry),formats);}
  const remember=entry=>{const id=key(entry),formats=annualFormats.get(id),start=calendar(entry.run)[1],run=formats?.size===1?[...formats][0]:start;if(!catalog.has(id))catalog.set(id,{series:entry.series,run,language:entry.language});return id;};
  for(const entry of regular)remember(entry);
  const link=(a,b)=>{const id=remember(a),target=remember(b);if(id===target)return;const targets=links.get(id)??new Set();targets.add(target);links.set(id,targets);};
  const contexts=new Map(rows.map(row=>[row,parentSeries(row.original).filter(part=>calendar(part.run))]));
  const regularRows=new Map();
  for(const row of rows)for(const id of new Set(row.entries.filter(entry=>entry.unitType==='issue'&&calendar(entry.run)).map(key))){const observed=regularRows.get(id)??[];observed.push(row);regularRows.set(id,observed);}
  // Source-confirmed later labels inside a bounded parent run are not resets.
  // Every dated source context must agree, and any early numbering vetoes it.
  for(const [id,value]of catalog){
    const observed=regularRows.get(id)??[];
    const parts=observed.flatMap(row=>contexts.get(row).filter(part=>sameName(part,value)));
    const early=parts.filter(part=>{const date=calendar(part.run);return date[2]&&Number(date[1])<Number(value.run)&&Number(date[2])>Number(value.run);});
    if(!early.length||parts.some(part=>calendar(part.run)[1]!==calendar(early[0].run)[1]))continue;
    if(regular.some(entry=>key(entry)===id&&Number(entry.number)<=1))continue;
    link(value,{...early[0],language:value.language});
  }
  const root=id=>{const seen=new Set();while(links.has(id)){if(seen.has(id)||links.get(id).size!==1)return null;seen.add(id);id=[...links.get(id)][0];}return id;};
  const ownRegular=row=>row.entries.filter(entry=>entry.unitType==='issue'&&calendar(entry.run));
  const hintFor=(row,entry)=>entry.annualHint??annualHintForEntry(row.contents,entry);
  // A dated annual's shorter title can be connected to the collection's
  // explicitly bounded parent, with a matching regular constituent as support.
  // Keep this alias run-specific: another same-name annual cycle is unaffected.
  for(const row of rows){
    if(row.contents.review)continue;
    for(const entry of row.entries.filter(entry=>entry.unitType==='annual')){
      const hint=hintFor(row,entry);
      if(!hint||hint.conflict)continue;
      const literal=ownRegular(row).filter(part=>sameName(part,entry)&&annualParentRunEligible(part.run,hint.year));
      if(literal.length)continue;
      const parents=contexts.get(row).filter(part=>nameVariant(part,entry)&&annualParentRunEligible(part.run,hint.year)&&ownRegular(row).some(regular=>sameName(regular,part)));
      const targets=new Set(parents.map(part=>root(remember({...part,language:entry.language}))));
      if(targets.size!==1||targets.has(null))continue;
      const target=catalog.get([...targets][0]);
      link({...entry,run:target.run},target);
    }
  }
  const candidates=(parts,year)=>[...new Set(parts.filter(part=>{const id=root(key(part)),target=catalog.get(id);return !year||annualParentRunEligible(id!==key(part)&&target?target.run:part.run,year);}).map(part=>root(key(part))).filter(Boolean))];
  const datedAnchors=new Map();
  for(const row of rows)if(!row.contents.review)for(const hint of row.contents.annualRunHints??[]){
    const language=row.entries.find(entry=>entry.unitType==='annual'&&sameName(entry,hint)&&hint.numbers.includes(entry.number))?.language;
    const targets=candidates(ownRegular(row).filter(part=>sameName(part,hint)&&part.language===language),hint.year);
    if(targets.length!==1)continue;
    const id=JSON.stringify([identityKey(hint.series),hint.year,language]),anchors=datedAnchors.get(id)??new Set();anchors.add(targets[0]);datedAnchors.set(id,anchors);
  }
  for(const row of rows){
    if(row.contents.review)continue;
    const own=ownRegular(row);
    row.entries=row.entries.map(entry=>{
      if(entry.unitType!=='annual')return entry;
      const hint=hintFor(row,entry),year=hint?.year;
      if(hint?.conflict)return {...entry,run:''};
      if(entry.run&&!calendar(entry.run))return entry;
      // A literal, explicitly dated regular constituent takes precedence over
      // collection-title context, notably when two annual cycles occur together.
      let targets=candidates(own.filter(part=>sameName(part,entry)),year);
      if(year&&!targets.length){const anchors=datedAnchors.get(JSON.stringify([identityKey(entry.series),year,entry.language]));if(anchors?.size===1)targets=[...anchors];}
      const literalOwn=own.filter(part=>sameName(part,entry));
      if(year&&literalOwn.length&&!candidates(literalOwn,year).length)return {...entry,run:''};
      if(!targets.length&&calendar(entry.run)&&(!year||annualParentRunEligible(entry.run,year))){
        const id=root(key(entry));if(id&&catalog.has(id))targets=[id];
      }
      if(!targets.length){
        const parents=contexts.get(row).filter(part=>sameName(part,entry)||nameVariant(part,entry));
        const supported=parents.filter(part=>(!year||annualParentRunEligible(part.run,year))&&own.some(regular=>sameName(regular,part))&&(sameName(part,entry)||root(key({...entry,run:part.run}))===root(key({...part,language:entry.language}))));
        targets=candidates(supported.map(part=>({...part,language:entry.language})),year);
      }
      if(!targets.length&&year)targets=candidates([...regular,...[...catalog].filter(([id])=>links.has(id)).map(([,part])=>part)].filter(part=>sameName(part,entry)&&part.language===entry.language),year);
      if(targets.length!==1)return entry;
      const target=catalog.get(targets[0]);if(!target)return entry;
      if(sameName(entry,target)&&entry.run===target.run)return entry;
      return {...entry,series:target.series,run:target.run,annualInference:{series:entry.series,run:entry.run,...(year?{year}:{}),reason:'Saved collection and regular-series context'}};
    });
  }
}
