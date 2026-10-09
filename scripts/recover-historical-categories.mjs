#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {previewGenreRecovery,createGenreRecoveryCandidate,undoGenreRecovery} from './genre-recovery.mjs';
const args=process.argv.slice(2),undo=args[0]==='--undo';if(undo)args.shift();
const [firstPath,currentPath,...flags]=args;let output=null,confirm=false,examples=false;
for(let i=0;i<flags.length;i++){if(flags[i]==='--output'&&flags[i+1])output=flags[++i];else if(flags[i]==='--confirm')confirm=true;else if(flags[i]==='--examples')examples=true;else throw Error('Unknown recovery argument.');}
if(!firstPath||!currentPath||undo&&!output||output&&!confirm||confirm&&!output)throw Error('Usage: node scripts/recover-historical-categories.mjs OLD CURRENT [--examples] [--output NEW_FILE --confirm]; undo: --undo RECOVERY_CANDIDATE CURRENT --output NEW_FILE --confirm');
if(output&&[firstPath,currentPath].some(input=>resolve(input).toLowerCase()===resolve(output).toLowerCase()))throw Error('Output must be a new file, never either input.');
const [first,current]=await Promise.all([firstPath,currentPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));
if(output){const candidate=undo?undoGenreRecovery(current,first.recoveryManifest):createGenreRecoveryCandidate(first,current).candidate;
 await writeFile(output,JSON.stringify(candidate,null,2)+'\n',{encoding:'utf8',flag:'wx'});console.log(JSON.stringify({operation:undo?'category-only-undo':'candidate-backup',output:resolve(output),summary:candidate.recoveryManifest?.summary??null,imported:false},null,2));
}else{const {patches,...report}=previewGenreRecovery(first,current,{examples});console.log(JSON.stringify(report,null,2));}
