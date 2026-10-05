// Read-only corpus loader. The 77 committed source selections are frozen;
// parser development must not rediscover/re-rank Amazon candidates.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {requireBackup} from './audit-artifacts.mjs';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function oldParser(){
 const source=await readFile(new URL('../tests/fixtures/kindle/contents-parser-v3.snapshot.txt',import.meta.url),'utf8');
 const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
 return {module:await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64')),hash:hash(source)};
}
export async function loadCorpus(path){
 const bytes=await readFile(requireBackup(path)),sourceHash=hash(bytes);
 if(sourceHash!=='3e7c70701e6577858266365b1b0011e5c2a3dba257018acec92cc7af8b16ae4e')throw Error('Source does not match the audited complete corpus.');
 const db=JSON.parse(bytes).database,items=Object.values(db.providerItems).filter(i=>i.provider==='kindle'&&i.metadata?.enrichment?.kindleProductComicContents?.statement?.trim()).sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 const annotations=await corpusReviewLabels();
 const labels=annotations.labels.map(({auditId,legacyCategory})=>({auditId,legacyCategory}));
 const pilotBytes=await readFile(new URL('../tests/fixtures/kindle/pilot-selection-inputs.json',import.meta.url),'utf8'),pilot=JSON.parse(pilotBytes),byUrl=new Map(pilot.selections.map(r=>[r.sourceUrl,r]));
 if(items.length!==1520||labels.length!==1520||byUrl.size!==77)throw Error('Corpus/pilot population changed.');
 return {db,sourceHash,pilotInputHash:hash(pilotBytes),rows:items.map((item,n)=>{
  const selected=byUrl.get(item.metadata.detailUrl),statement=selected?.statement??item.metadata.enrichment.kindleProductComicContents.statement;
  return {...labels[n],item,title:item.title,statement,input:selected?.parserInput??statement,sourceGeneration:selected?4:item.metadata.enrichment.kindleProductComicContents.extractorVersion??1,binding:selected?.binding??'original-statement',context:{allowTitleBinding:true,series:item.metadata.series??[]}};
 })};
}
export async function corpusReviewLabels(){return JSON.parse(await readFile(new URL('../tests/fixtures/kindle/corpus-review-labels.json',import.meta.url),'utf8'));}
export async function historicalParser4(corpus){
 const source=await readFile(new URL('../tests/fixtures/kindle/contents-parser-v4.snapshot.txt',import.meta.url),'utf8');
 const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
 const parser=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));
 return {rows:corpus.rows.map(row=>({auditId:row.auditId,after:parser.proposeContentsForReview(row.input,row.title,row.context)}))};
}
export function families(row,proposal){
 const text=row.input,tags=[];
 if(proposal.quality==='filtered')return ['non-containment'];
 if(proposal.quality==='uncertain')return ['uncertain-source'];
 if(/\bvol(?:ume)?\.?\s*\d+\s*#/iu.test(text))tags.push('run-volume');
 if(/^\s*(?:collects?|contains?|includes?)\s+(?:issues?\s*)?#\d/iu.test(text))tags.push('bare-context');
 if(/\b(?:material|excerpts?|selections?|selected|stories?)\s+from\b/iu.test(text))tags.push('excerpt-scope');
 if(/\b(?:annual|special)\b/iu.test(text))tags.push('annual-special');
 if(/[,;]|\band\b/iu.test(text)&&/#\d/iu.test(text)&&/[A-Z][^#]{3,60}(?:[,;]|$)/u.test(text))tags.push('mixed-numbered-named');
 if(!/#\d|\bissues?\s*\d/iu.test(text))tags.push('named-collection');
 if(/\(\d{4}(?:-\d{4})?\)/u.test(text))tags.push('dated-run');
 if(/\b(?:miniseries|mini.series|one.shots?|micro.series)\b/iu.test(text))tags.push('named-mini-oneshot');
 if(/\b(?:by|written|penciled|creators?|script|foreword|bonus)\b/iu.test(text))tags.push('adjacent-prose');
 return tags.length?tags:['other-numbered'];
}
export function suspicious(proposal){
 if(proposal.outcome!=='full')return [];
 const tags=new Set();
 for(const e of proposal.entries.filter(e=>e.unitType!=='component')){
  if(e.series.length>70||e.series.split(/\s+/u).length>10)tags.add('long-label');
  if(/,/u.test(e.series)&&!/,\s*INC\.?$/iu.test(e.series))tags.add('comma-label');
  if(/\band\b/iu.test(e.series))tags.add('conjunction-label');
  if(/\b(?:issue|vol|volume|annual|special|script|written|artist|writer|contains?|including|collects?)\b/iu.test(e.series))tags.add('unit-prose-in-label');
 }
 return [...tags].sort();
}
