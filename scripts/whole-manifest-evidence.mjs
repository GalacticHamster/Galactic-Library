// Read-only frozen inputs. Never fetches Amazon or touches installed storage.
import {readFile} from 'node:fs/promises';
import {loadCorpus,hash} from './contents-parser-corpus.mjs';
const read=async name=>JSON.parse(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'));
export async function baselineManifest(){
 const source=await readFile(new URL('../tests/fixtures/kindle-manifest-before-whole.snapshot.txt',import.meta.url),'utf8');
 const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
 return {module:await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64')),hash:hash(source)};
}
export async function wholeManifestEvidence(backup){
 const corpus=await loadCorpus(backup),pilot=await read('kindle-manifest-pilot-results.json'),metrics=await read('kindle-manifest-pilot-metrics.json'),live=await read('kindle-source-capture-live.json'),replay=await read('kindle-source-capture-replay.json'),safety=await read('kindle-source-capture-safety.json');
 const observations=[],savedByUrl=new Map();
 for(const p of pilot.rows){const m=metrics.rows.find(m=>m.sourceUrl===p.sourceUrl);const saved={statement:m.statement,extractorVersion:4,manifest:{...p.manifest,candidates:m.candidates,selected:m.selected,secondary:m.secondary}};
  savedByUrl.set(p.sourceUrl,saved);observations.push({id:'pilot-4-'+p.ordinal,title:p.title,url:p.sourceUrl,sourceGeneration:4,blocks:p.manifest.blocks,saved});
 }
 for(const r of live.rows)observations.push({id:'sample-4-'+r.auditId,title:r.title,url:r.sourceUrl,sourceGeneration:4,blocks:r.acquired.descriptionBlocks,saved:r.serialized});
 for(const r of replay.rows){const l=live.rows.find(l=>l.auditId===r.auditId),saved=safety.rows.find(s=>s.auditId===r.auditId).serialized;savedByUrl.set(l.sourceUrl,saved);observations.push({id:'sample-5-'+r.auditId,title:r.title,url:l.sourceUrl,sourceGeneration:5,blocks:r.generation5Blocks,saved});}
 const fixtures=await readFile(new URL('../tests/kindle-manifest-fixtures.json',import.meta.url),'utf8');
 for(const [index,f] of JSON.parse(fixtures).entries())observations.push({id:'fixture-'+index,title:f.title,url:null,sourceGeneration:'fixture',blocks:[{selector:'#fixture',text:f.text}]});
 return {corpus,observations,savedByUrl};
}
