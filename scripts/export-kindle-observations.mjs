// Offline only. Requires a caller-supplied private backup; never acquires data.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {outputPath} from './audit-artifacts.mjs';
import {parseBackup} from '../src/lib/storage.js';
import {contentsObservation} from '../src/lib/kindle-contents-observations.js';
import {proposeContentsForReview,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
const [input,output]=process.argv.slice(2);
if(!input)throw Error('Usage: node scripts/export-kindle-observations.mjs PRIVATE_BACKUP [audit-artifacts/kindle/observations.json]. No network acquisition.');
globalThis.fetch=()=>{throw Error('Network forbidden in offline export.');};
const bytes=await readFile(input),db=parseBackup(JSON.parse(bytes.toString('utf8')));
const records=new Map([...Object.values(db.providerHistory).map(row=>row.item),...Object.values(db.providerItems)].filter(item=>item.provider==='kindle').map(item=>[item.recordRef,item]));
// Retain orphaned baselines as audit evidence; they confer no application identity.
const refs=new Set([...records.keys(),...Object.keys(db.kindleContentsObservations??{})]);
const rows=[...refs].map(recordRef=>{
 const item=records.get(recordRef),history=db.kindleContentsObservations?.[recordRef],current=item?contentsObservation(item,item.metadata.enrichment?.kindleProductComicContents):null;
 const replay=observation=>observation?.statement?proposeContentsForReview(observation.parseInput||observation.evidence?.selected?.parserInput||observation.statement,observation.titleContext,{allowTitleBinding:true,series:observation.seriesContext}):null;
 return {recordRef,providerItemId:history?.providerItemId??item.id,baseline:history?.baseline??null,current,latestAttempt:history?.latestAttempt??null,
  // Explicitly a NEW local parse of each saved input, not its original result.
  offlineReplay:{parserVersion:CONTENTS_PARSER_VERSION,baseline:replay(history?.baseline),current:replay(current)}};
});
const result={format:1,sourceBackupSha256:createHash('sha256').update(bytes).digest('hex'),networkRequests:0,
 note:'Private source comparison export. Historical metadata remains attached to its source. Offline replay is a new parser interpretation, not the historical proposal. Legacy enrichmentHistory remains in the original backup.',rows};
await writeFile(await outputPath(output,'observations.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({records:rows.length,pinnedBaselines:rows.filter(row=>row.baseline).length,networkRequests:0}));
