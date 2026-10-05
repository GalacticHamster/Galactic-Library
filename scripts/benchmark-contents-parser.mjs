import {writeFile} from 'node:fs/promises';
import {loadCorpus,oldParser} from './contents-parser-corpus.mjs';
import {proposeContentsForReview} from '../src/lib/contents.js';
const [path,output]=process.argv.slice(2);if(!path||!output)throw Error('Usage: node scripts/benchmark-contents-parser.mjs BACKUP_JSON OUTPUT_JSON');
globalThis.fetch=()=>{throw Error('Network forbidden');};
const corpus=await loadCorpus(path),old=await oldParser(),runs={parser3:[],parser4:[]};
function run(version){const start=performance.now();for(const r of corpus.rows)version===3?old.module.proposeContentsForReview(r.input,r.title):proposeContentsForReview(r.input,r.title,r.context);return performance.now()-start;}
run(3);run(4);
for(let n=0;n<10;n++)for(const version of n%2?[4,3]:[3,4])runs['parser'+version].push(run(version));
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {passes:values.length,minMs:sorted[0],medianMs:(sorted[4]+sorted[5])/2,maxMs:sorted.at(-1),medianPerStatementMs:(sorted[4]+sorted[5])/2/corpus.rows.length};};
const result={statements:corpus.rows.length,networkRequests:0,parser3:stats(runs.parser3),parser4:stats(runs.parser4)};
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
