// Offline sources only. No acquisition or installed storage access.
import {readFile} from 'node:fs/promises';
import {wholeManifestEvidence} from './whole-manifest-evidence.mjs';
import {hash} from './contents-parser-corpus.mjs';
export {wholeManifestEvidence};
// Manual source review, audit-only. IDs identify frozen observations, never
// feed production discovery/selection, and are deliberately not semantic rules.
export function secondarySemanticReview(row,c){
 if(c.relation==='same-manifest-child')return {category:'A',meaning:'Same-manifest diagnostic child',rationale:'Exact interpretation-v1 parent range. Units duplicate the primary; do not treat as an independent claim.'};
 const id=row.id;
 if(['pilot-4-2','sample-4-3','sample-5-3','fixture-3'].includes(id))return {category:'D',meaning:'Alternative description / arc names',rationale:'Book describes its pivotal arcs, then its collected numbered range. No source mapping establishes extra units. Candidate also includes synopsis; names remain review evidence.'};
 if(['sample-4-254','sample-5-254'].includes(id))return {category:'D',meaning:'Generic alternative storyline description',rationale:'Promotional description of the same volume precedes explicit Reprinting in the same sentence. No additional finite constituent identity; do not aggregate.'};
 if(['sample-4-6','sample-5-6','fixture-1'].includes(id)&&c.index===3)return {category:'C',meaning:'Original-script supplement',rationale:'Original script for The Mimic from issue #20 is distinct supplemental material, not another normal full issue/work. Parser cannot represent script scope.'};
 if(id==='pilot-4-35')return {category:'C',meaning:'Sketchbook apparatus with review prose',rationale:'Artist sketchbook material plus award/review text; not identified full-work contents. Do not use praise or artist names as constituents.'};
 if(['sample-4-370','sample-5-370'].includes(id))return {category:'E',meaning:'Specific named claim versus generic count',rationale:'Contains four full length novels explicitly names Alpha, Beta, Gamma and Delta, but promotion remains attached. Read more yields Uncertain; parser 4 does not isolate safe names.'};
 if(['sample-4-629','sample-5-629'].includes(id))return {category:'E',meaning:'Specific volume claim versus wider series claim',rationale:'This volume reprints named material; primary describes four omnibus volumes plus two short-story volumes. Mixed names, quoted punctuation and from attribution remain unsupported; do not invent constituents.'};
 if(['sample-4-1228','sample-5-1228'].includes(id))return {category:'E',meaning:'Generic formats versus specific numbered claim',rationale:'One-shots, crossovers and event series name formats, not new finite constituent identities. More specific numbered claim is already primary.'};
 if(['pilot-4-42','pilot-4-43','pilot-4-44','pilot-4-45'].includes(id))return {category:'G',meaning:'Legitimate named tales; additional-versus-alternative unknown',rationale:'Distinct includes trigger names classic tales. No excerpt/script/bonus qualifier. They may be story names within primary numbered material; captured source does not map them or prove additional units. Read more and prose prevent parser-4 proposals.'};
 return {category:'F',meaning:'Unrelated prose / contributor / wider product / topic',rationale:id==='pilot-4-13'?'Robin synopsis references another product volume, not contents.':id==='pilot-4-32'?'Variant-cover gallery contributor names; works in parentheses are credits.':id==='pilot-4-52'?'Technical features/protocols, not contained works.':'Five-volume all-100-issues series scope is not this individual volume; do not extend its local issue range.'};
}
export async function independentBaseline(){
 const source=await readFile(new URL('../tests/fixtures/kindle/kindle-manifest-before-independent.snapshot.txt',import.meta.url),'utf8');
 const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
 return {module:await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64')),hash:hash(source)};
}
// The exact existing source sentence scanner, used for audit coordinates only.
export function sentenceRanges(text){
 const out=[];let start=0;
 for(const m of text.matchAll(/[.!?](?=\s+[A-Z“"]|Read more\b)|(?<=\d)[.!?](?=[A-Z])/gu)){
  const before=text.slice(start,m.index);
  if(m[0]==='.'&&(/\b(?:vols?|no|nos|ed|pt|pts|mr|mrs|ms|dr|st|vs)$/iu.test(before)||/\b(?:[A-Z]\.)*[A-Z]$/u.test(before)))continue;
  out.push({start,end:m.index+1});start=m.index+1;
 }if(start<text.length)out.push({start,end:text.length});return out;
}
