// Read-only minimal source inputs. No generated output or private backup is
// needed for captured regression controls. Corpus audits request private input.
import {readFile} from 'node:fs/promises';
import {loadCorpus,hash} from './contents-parser-corpus.mjs';
import {validateManifest} from '../src/lib/kindle-manifest.js';
export async function baselineManifest(){
 const source=await readFile(new URL('../tests/fixtures/kindle/kindle-manifest-before-whole.snapshot.txt',import.meta.url),'utf8');
 const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,path)=>`from '${new URL('../src/lib/'+path,import.meta.url).href}'`);
 return {module:await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64')),hash:hash(source)};
}
export async function capturedManifestEvidence(){
 const input=JSON.parse(await readFile(new URL('../tests/fixtures/kindle/captured-manifest-inputs.json',import.meta.url),'utf8'));
 const observations=[],savedByUrl=new Map();
 for(const row of input.captures){
  const manifest=validateManifest({title:row.title,blocks:row.blocks,candidates:row.selectedSource?[row.selectedSource]:[],selected:row.selectedSource?0:-1},row.title);
  const saved={statement:row.selectedSource?.raw??'',extractorVersion:row.sourceGeneration,manifest};
  observations.push({...row,saved});
  if(row.id.startsWith('pilot-4-')||row.sourceGeneration===5)savedByUrl.set(row.url,saved);
 }
 const fixtures=JSON.parse(await readFile(new URL('../tests/fixtures/kindle/kindle-manifest-fixtures.json',import.meta.url),'utf8'));
 for(const [index,f] of fixtures.entries())observations.push({id:'fixture-'+index,title:f.title,url:null,sourceGeneration:'fixture',blocks:[{selector:'#fixture',text:f.text}]});
 return {observations,savedByUrl};
}
export async function wholeManifestEvidence(backup){return {corpus:await loadCorpus(backup),...await capturedManifestEvidence()};}
