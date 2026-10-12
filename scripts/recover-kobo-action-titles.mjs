import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {outputPath} from './audit-artifacts.mjs';

// Offline, corroborated recovery only. Neither input nor extension storage is
// ever written. Matching UUID, profile and immutable reference are mandatory.
export function recoverKoboActionTitles(current,reference){
  const database=structuredClone(current),changes=[];
  for(const record of Object.values(database.providerItems)){
    if(record.provider!=='kobo'||!/^read\s+now\s*:/iu.test(record.title))continue;
    const prior=reference.providerItems[record.id];
    if(!prior||prior.provider!=='kobo'||prior.profileId!==record.profileId||prior.recordRef!==record.recordRef
      ||prior.providerItemId!==record.providerItemId||record.title.replace(/^read\s+now\s*:\s*/iu,'')!==prior.title)continue;
    const metadata={...record.metadata},restored=[];
    for(const key of ['authors','series','genres','isbn','isbns','publisher','language']){
      const value=prior.metadata[key];
      if(value&&(Array.isArray(value)?value.length: true)&&(!metadata[key]||Array.isArray(metadata[key])&&!metadata[key].length)){
        metadata[key]=structuredClone(value);restored.push(key);
      }
    }
    database.providerItems[record.id]=normalizeProviderItem({...record,title:prior.title,metadata},record.updatedAt,{profileKeySpace:database.providerProfiles[record.profileId].keySpace});
    changes.push({id:record.id,recordRef:record.recordRef,before:record.title,after:prior.title,restoredMetadata:restored});
  }
  return {database:validateDatabase(database),changes};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(value=>{const i=value.indexOf('=');return i<0?[value,true]:[value.slice(0,i),value.slice(i+1)];}));
  if(!args['--current']||!args['--reference'])throw Error('Supply --current=backup.json and --reference=older-backup.json. Optional --candidate=relative-path writes a new candidate under audit-artifacts.');
  const current=parseBackup(JSON.parse(await readFile(args['--current'],'utf8'))),reference=parseBackup(JSON.parse(await readFile(args['--reference'],'utf8')));
  const result=recoverKoboActionTitles(current,reference);
  const unchanged=Object.values(current.providerItems).filter(record=>!result.changes.some(change=>change.id===record.id));
  if(unchanged.some(record=>JSON.stringify(record)!==JSON.stringify(result.database.providerItems[record.id])))throw Error('Recovery changed an unrelated source record.');
  const summary={providerRecords:Object.keys(result.database.providerItems).length,koboRecords:Object.values(result.database.providerItems).filter(r=>r.provider==='kobo').length,recoveredTitles:result.changes.length,unrelatedRecordsVerifiedUnchanged:unchanged.length,restoredMetadataFields:result.changes.reduce((n,c)=>n+c.restoredMetadata.length,0)};
  if(args['--candidate']){const path=await outputPath(args['--candidate']);await writeFile(path,JSON.stringify(createBackup(result.database),null,2)+'\n');summary.candidate=path;}
  if(args['--report'])await writeFile(await outputPath(args['--report']),JSON.stringify({...summary,changes:result.changes},null,2)+'\n');
  console.log(JSON.stringify(summary));
}
