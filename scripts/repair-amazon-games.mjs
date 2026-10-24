#!/usr/bin/env node
// Read-only by default. Never writes either input or an installed extension.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseBackup} from '../src/lib/storage.js';
import {validateDatabase} from '../src/lib/models.js';
import {reconcileAmazonGames} from '../src/lib/amazon-games-reconciliation.js';
const [input,...args]=process.argv.slice(2);let output,confirm=false;
for(let i=0;i<args.length;i++){if(args[i]==='--output')output=args[++i];else if(args[i]==='--confirm')confirm=true;else throw Error('Unknown repair argument.');}
if(!input||Boolean(output)!==confirm)throw Error('Usage: node scripts/repair-amazon-games.mjs BACKUP [--output NEW_FILE --confirm]');
if(output&&resolve(output).toLowerCase()===resolve(input).toLowerCase())throw Error('Output must not overwrite the input backup.');
const original=JSON.parse(await readFile(input,'utf8')),database=parseBackup(original),before=structuredClone(database),reports=[];
for(const profile of Object.values(database.providerProfiles))if(profile.provider==='amazon-games')reports.push(await reconcileAmazonGames(database,profile.profileId));
const repaired=validateDatabase(database);
const retainedRefs=new Set([...Object.values(repaired.providerItems),...Object.values(repaired.providerHistory).map(entry=>entry.item)].map(row=>row.recordRef));
if(Object.values(before.providerItems).some(row=>!retainedRefs.has(row.recordRef)))throw Error('Repair lost an original reference; no output written.');
const candidate={...original,database:repaired};
const second=structuredClone(repaired),secondReports=[];
for(const profile of Object.values(second.providerProfiles))if(profile.provider==='amazon-games')secondReports.push(await reconcileAmazonGames(second,profile.profileId));
if(JSON.stringify(validateDatabase(second))!==JSON.stringify(repaired))throw Error('Repair did not converge; no output written.');
const summary={reports,secondPassChanges:secondReports.reduce((sum,entry)=>sum+entry.archivedObservations+entry.rekeyedRecords,0),
  manualCorrectionsChanged:JSON.stringify(before.ownershipReviews)!==JSON.stringify(repaired.ownershipReviews),
  otherReviewsChanged:['contentReviews','enrichmentReviews','manualMatchDecisions','editionSeparations','readingStates','titleAliases'].some(key=>JSON.stringify(before[key])!==JSON.stringify(repaired[key])),
  nonAmazonRecordsChanged:Object.values(before.providerItems).filter(row=>row.provider!=='amazon-games'&&JSON.stringify(row)!==JSON.stringify(repaired.providerItems[row.id])).length,
  datesRecovered:Object.values(repaired.providerItems).filter(row=>row.provider==='amazon-games'&&row.acquiredAt).length-Object.values(before.providerItems).filter(row=>row.provider==='amazon-games'&&row.acquiredAt).length,
  canonicalIdentitiesChanged:Object.keys(before.canonicalItems).filter(key=>!repaired.canonicalItems[key]).length,
  originalObservationsRetained:Object.keys(repaired.providerHistory).length-Object.keys(before.providerHistory).length,
  imported:false};
if(summary.manualCorrectionsChanged||summary.otherReviewsChanged||summary.nonAmazonRecordsChanged||summary.canonicalIdentitiesChanged)throw Error('Repair changed protected library data; no output written.');
if(output)await writeFile(output,JSON.stringify(candidate,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify(summary,null,2));
