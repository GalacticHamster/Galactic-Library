// Candidate archives exist only inside disposable test storage, never dist.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';import {spawn} from 'node:child_process';
import {createRelease,runtimeZip} from '../scripts/release.mjs';
import {createRelease as fanRelease,readRuntimeZip as readFanZip,runtimeZip as fanZip} from '../../Fanatical/scripts/release.mjs';
import {readRuntimeZip} from '../scripts/release.mjs';
import {candidateFiles,verifyCandidateBundle,candidateSidecar} from './provider-candidate-build.mjs';
const firefox=process.argv.includes('--firefox'),target=firefox?'firefox':'chrome',root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/u,'$1'));
const directory=await mkdtemp(join(tmpdir(),'gl-candidate-runtime-'));
const production=process.argv.includes('--production');
try{
 const env={...process.env,...(firefox?{MOZ_REMOTE_ALLOW_SYSTEM_ACCESS:'1'}:{})};
 for(const [consumer,builder]of [['GL',createRelease],['FAN',fanRelease]]){
   let release=await builder(undefined,undefined,target);
   const legacy=process.argv.includes('--legacy-peer')&&consumer==='FAN'||process.argv.includes('--legacy-central')&&consumer==='GL';
   if(production&&legacy){const path=process.env[consumer+'_LEGACY_RUNTIME_PACKAGE'];if(!path)throw Error('Explicit legacy runtime package required for '+consumer);release={files:(consumer==='FAN'?readFanZip:readRuntimeZip)(await readFile(path))};}
   const files=production||legacy?new Map(release.files):await candidateFiles(consumer,release.files);
   const candidate=!legacy&&!production;
   const archive=(consumer==='FAN'?fanZip:runtimeZip)(files);
   const extracted=(consumer==='FAN'?readFanZip:readRuntimeZip)(archive);
   if(candidate){const sidecar=candidateSidecar(files);verifyCandidateBundle(consumer,extracted,sidecar.pin,sidecar);await writeFile(join(directory,consumer+'-build-sidecar.json'),JSON.stringify(sidecar,null,2));}
   const path=join(directory,consumer+'.zip');await writeFile(path,archive);env[consumer+'_RUNTIME_PACKAGE']=path;
 }
 env.FAN_GL_RUNTIME_PACKAGE=env.GL_RUNTIME_PACKAGE;
 const command=firefox?['tests/firefox.mjs','--companions']:['tests/runtime-check.mjs','--central'];
 const child=spawn(process.execPath,command,{cwd:firefox?root:resolve(root,'../Fanatical'),env,stdio:'inherit',windowsHide:true});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)process.exitCode=code??1;
}finally{const path=resolve(directory);if(!path.startsWith(resolve(tmpdir())+sep)||!path.includes('gl-candidate-runtime-'))throw Error('Unsafe candidate cleanup.');await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
