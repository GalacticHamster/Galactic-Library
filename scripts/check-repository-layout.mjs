// Developer hygiene check only. No extension storage or source acquisition.
import {execFileSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\n').filter(Boolean))];
const problems=[];
let inspected=0,links=0;
for(const file of files){
  let source;
  try{source=await readFile(resolve(root,file),'utf8');}
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  inspected++;
  if(/^(?:audit-artifacts|dist|coverage|node_modules)\//u.test(file)||/^galactic-library-backup-v.*\.json$/u.test(file))problems.push(`${file}: generated/private material must be ignored and untracked`);
  if(file.startsWith('docs/')&&file.endsWith('.json'))problems.push(`${file}: review as input fixture or move generated output to audit-artifacts`);
  if(/C:[\\/]+Users[\\/]+(?!<)[^\s"'<>]+/iu.test(source))problems.push(`${file}: personal filesystem path must be sanitized`);
  if(file.startsWith('tests/')&&/docs\/[^'"\s]+\.json/u.test(source))problems.push(`${file}: tests must not depend on generated documentation JSON`);
  if(!file.endsWith('.md'))continue;
  for(const match of source.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/gu)){
    const target=match[1].split(/\s+"/u)[0].replace(/^<|>$/gu,'');
    if(/^(?:https?:|mailto:|#)/iu.test(target))continue;
    links++;
    try{await stat(resolve(dirname(resolve(root,file)),decodeURIComponent(target.split('#')[0])));}
    catch(error){if(error.code==='ENOENT')problems.push(`${file}: missing link target ${target}`);else throw error;}
  }
}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}
else console.log(`Repository layout validated: ${inspected} files, ${links} local Markdown links; no tracked audit outputs or personal path patterns.`);
