// Development only: each runtime carries a reviewed local copy, never a CDN.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
const hb=resolve(process.argv.find(arg=>arg.startsWith('--hb='))?.slice(5)??resolve(root,'../HB'));
const fan=resolve(process.argv.find(arg=>arg.startsWith('--fan='))?.slice(6)??resolve(root,'../Fanatical'));
for(const name of ['theme.js','theme.css','theme-app.css','theme-overlays.css']){
  const source=await readFile(resolve(root,'shared',name));
  for(const target of [resolve(hb,name),resolve(fan,'src',name)]){
    if(check){if(!source.equals(await readFile(target)))throw Error('Theme mirror differs: '+target);}
    else await writeFile(target,source);
  }
}
console.log(check?'Theme v1 mirrors agree.':'Theme v1 mirrored into HB and FAN.');
