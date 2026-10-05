// Development-tool paths only. Never imported by the extension runtime.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
export const artifactRoot=fileURLToPath(new URL('../audit-artifacts/kindle/',import.meta.url));
export const artifactUrl=name=>new URL(name,new URL('../audit-artifacts/kindle/',import.meta.url));
export async function outputPath(requested,name){
 const path=requested instanceof URL?fileURLToPath(requested):resolve(requested??fileURLToPath(artifactUrl(name)));
 const relation=relative(resolve(artifactRoot,'..'),path);
 if(!relation||relation.startsWith('..')||isAbsolute(relation))throw Error('Audit output must stay under the ignored audit-artifacts directory.');
 await mkdir(dirname(path),{recursive:true});return path;
}
export async function writeArtifact(name,data){return writeFile(await outputPath(undefined,name),data);}
export async function readArtifact(name){
 try{return await readFile(artifactUrl(name),'utf8');}
 catch(error){if(error.code==='ENOENT')throw Error(`Missing local audit artifact ${name}. Generate the prerequisite run or restore its private archive under audit-artifacts/kindle; generated results are intentionally not committed. This tool does not acquire source automatically.`);throw error;}
}
export function requireBackup(path){if(!path)throw Error('A private BACKUP_JSON path is required. Usage: node scripts/<audit-tool>.mjs <path-to-backup> [audit-artifacts/kindle/output.json]. Backups are intentionally not committed.');return path;}
