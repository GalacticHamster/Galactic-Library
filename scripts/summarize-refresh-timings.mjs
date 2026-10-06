import {readFile,writeFile} from 'node:fs/promises';
import {outputPath} from './audit-artifacts.mjs';
const rows=[];
for(const file of process.argv.slice(2)){
 const report=JSON.parse(await readFile(file,'utf8'));const records=report.records??[];
 const saves=records.filter(x=>x.events?.some(e=>e.stage==='persist_validation'));
 const stages={};for(const row of saves)for(const e of row.events)if(['read_validation','persist_validation','canonical_rebuild','storage_write','storage_read','migration_compare','writer_queue'].includes(e.stage))(stages[e.stage]??=[]).push(e.durationMs);
 rows.push({input:file.split(/[\\/]/).slice(-2).join('/'),first:records[0]?.id,last:records.at(-1)?.id,start:records[0]?.startEpochMs,saveDurations:saves.map(row=>({id:row.id,stages:Object.fromEntries(row.events.filter(e=>['read_validation','persist_validation','canonical_rebuild','storage_write','storage_read','migration_compare','writer_queue'].includes(e.stage)).map(e=>[e.stage,e.durationMs]))})),stages,options:report.optionsStatsMs});
}
console.log(JSON.stringify(rows,null,2));await writeFile(await outputPath('audit-artifacts/checkpoint-query-performance/live-timings.json'),JSON.stringify(rows,null,2));
