import assert from 'node:assert/strict';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {snapshotFixture} from './storage.js';
import {createBackup} from '../src/lib/storage.js';
import {previewGenreRecovery,stable} from '../scripts/genre-recovery.mjs';
export async function recoveryFixture(){
 const stored={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async values=>Object.assign(stored,structuredClone(values))});
 const items=['Eligible','Changed','Manual','Existing','Different media','Source conflict'].map((title,i)=>({providerItemId:`B00000000${i}`,title,mediaType:'book',ownership:'owned'}));
 let db=await writer.mergeProviderItems('kindle',items);
 for(const record of Object.values(db.providerItems))record.metadata.enrichment={googleBooks:{source:'google-books',volumeId:'old',title:'Historical title',authors:['Old author'],isbn:['9780306406157'],publisher:'Old publisher',language:'fr',categories:['Comics','Science fiction'],sourceUrl:'https://books.google.com/books?id=old',appliedAt:'2026-09-26T00:00:00Z'}};
 const old=createBackup(db),current=createBackup(await writer.getDatabase());const records=Object.values(current.database.providerItems);
 records[1].title='Changed title';records[2].metadata.enrichment={localMetadata:{source:'publisher',approved:true,categories:['Novels']}};records[3].metadata.enrichment={googleBooks:{source:'google-books',volumeId:'new',categories:['History']}};records[4].mediaType='game';records[5].metadata.enrichment={googleBooks:{source:'google-books',volumeId:'new',categories:[]}};
 // Revalidate fixture after intentional title/media changes.
 return {old,current:createBackup(current.database)};
}
export const genreRecoveryTests=[['Historical genre preview links unique native IDs, excludes changed/media/manual conflicts and preserves newer categories deterministically',async()=>{
 const {old,current}=await recoveryFixture(),before=stable({old,current}),preview=previewGenreRecovery(old,current);
 assert.equal(preview.summary.eligibleRecords,1);assert.equal(preview.skipped['changed-title'],1);assert.equal(preview.skipped['media-type'],1);assert.equal(preview.skipped['reviewed-classification-conflict'],1);assert.equal(preview.skipped['newer-catalogue-source'],1);assert.equal(preview.summary.existingCategoriesPreserved,1);
 assert.deepEqual(Object.keys(preview.patches[0].after).sort(),['appliedAt','categories','matchBasis','source','sourceUrl']);assert.equal(stable(previewGenreRecovery(old,current)),stable(preview));assert.equal(stable({old,current}),before);
 assert.throws(()=>previewGenreRecovery({},current));assert.throws(()=>previewGenreRecovery(old,{...current,database:null}));
}],['Historical preview rejects ambiguous identifiers across profiles and missing current/native IDs',async()=>{
 const {old,current}=await recoveryFixture();const source=Object.values(old.database.providerItems)[0];
 // Index ambiguity is exercised through valid multi-profile imports, not invalid duplicate map keys.
 const state={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...state}),set:async values=>Object.assign(state,structuredClone(values))});
 const items=[{providerItemId:source.providerItemId,title:source.title,mediaType:'book',ownership:'owned'}];await writer.replaceProviderItems('kindle',items,{profileLabel:'A'},snapshotFixture('kindle',items));const other=[{...items[0],ownership:'borrowed'}];const db=await writer.replaceProviderItems('kindle',other,{profileLabel:'B'},snapshotFixture('kindle',other));
 const result=previewGenreRecovery(old,createBackup(db));assert.equal(result.skipped['ambiguous-identifier'],1);assert(result.skipped['missing-current-record']>0);
}]];

genreRecoveryTests.push(['Preview remains deterministic on legacy backups, rejects missing native identifiers and preserves original inputs',async()=>{
 const {old,current}=await recoveryFixture();const legacy=structuredClone(current);legacy.database.schemaVersion=12;delete legacy.database.providerProfiles;delete legacy.database.unresolvedProfileState;delete legacy.database.legacyProfileNamespaces;
 for(const record of Object.values(legacy.database.providerItems))delete record.profileId;
 for(const state of Object.values(legacy.database.providers))delete state.activeProfileId;
 assert.equal(stable(previewGenreRecovery(old,legacy)),stable(previewGenreRecovery(old,legacy)));
 const corrupt=structuredClone(current);Object.values(corrupt.database.providerItems)[0].providerItemId='';assert.throws(()=>previewGenreRecovery(old,corrupt));
}]);

import {createGenreRecoveryCandidate,undoGenreRecovery} from '../scripts/genre-recovery.mjs';
import {parseBackup} from '../src/lib/storage.js';
import {matchItems} from '../src/lib/matcher.js';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
genreRecoveryTests.push(['Candidate recovery validates exact state/identity/matching, is idempotent and undo preserves later unrelated activity but refuses stale categories',async()=>{
 const {old,current}=await recoveryFixture(),before=stable({old,current}),{candidate,preview}=createGenreRecoveryCandidate(old,current),db=parseBackup(candidate);
 assert.equal(preview.patches.length,1);assert.equal(stable({old,current}),before);
 const query=Object.values(current.database.providerItems).map(record=>({title:record.title,mediaType:record.mediaType}));assert.deepEqual(matchItems(db.providerItems,query,db),matchItems(current.database.providerItems,query,current.database));
 for(const key of Object.keys(current.database).filter(key=>key!=='providerItems'))assert.deepEqual(db[key],current.database[key],key);
 assert.equal(createGenreRecoveryCandidate(old,candidate).preview.patches.length,0);
 assert.equal(stable(undoGenreRecovery(candidate,candidate.recoveryManifest).database),stable(current.database));
 const later=structuredClone(candidate);Object.values(later.database.providerItems)[0].metadata.publisher='Newly saved publisher';const undone=undoGenreRecovery(later,candidate.recoveryManifest);assert.equal(Object.values(undone.database.providerItems)[0].metadata.publisher,'Newly saved publisher');
 const stale=structuredClone(candidate);stale.database.providerItems[preview.patches[0].itemId].metadata.enrichment.googleBooks.categories=['History'];assert.throws(()=>undoGenreRecovery(stale,candidate.recoveryManifest),/changed since/);
 const forged=structuredClone(candidate.recoveryManifest);forged.patches[0].before={isbn:['9780306406157']};assert.throws(()=>undoGenreRecovery(candidate,forged));
 const legacy=structuredClone(current);legacy.database.schemaVersion=12;assert.throws(()=>createGenreRecoveryCandidate(old,legacy),/fresh normalized/);
}],['Recovery CLI requires confirmation, exclusive new output and leaves inputs intact; candidate and inverse validate',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'gl-category-recovery-'));try{const {old,current}=await recoveryFixture(),oldPath=join(directory,'old.json'),currentPath=join(directory,'current.json'),output=join(directory,'candidate.json'),undo=join(directory,'undo.json');writeFileSync(oldPath,JSON.stringify(old));writeFileSync(currentPath,JSON.stringify(current));const before=[readFileSync(oldPath,'utf8'),readFileSync(currentPath,'utf8')];
 const run=args=>execFileSync(process.execPath,['scripts/recover-historical-categories.mjs',...args],{windowsHide:true,stdio:'pipe'});
 assert.throws(()=>run([oldPath,currentPath,'--output',output]));assert.throws(()=>run([oldPath,currentPath,'--output',currentPath,'--confirm']));run([oldPath,currentPath,'--output',output,'--confirm']);assert.throws(()=>run([oldPath,currentPath,'--output',output,'--confirm']));const saved=JSON.parse(readFileSync(output));parseBackup(saved);
 run(['--undo',output,output,'--output',undo,'--confirm']);assert.deepEqual(parseBackup(JSON.parse(readFileSync(undo))),current.database);assert.deepEqual([readFileSync(oldPath,'utf8'),readFileSync(currentPath,'utf8')],before);
 }finally{rmSync(directory,{recursive:true});}
}]);

genreRecoveryTests.push(['Recovery retains hint/work source provenance without historic identity and preserves human/source history exactly',async()=>{
 const {old,current}=await recoveryFixture(),source=Object.values(old.database.providerItems)[0],target=Object.values(current.database.providerItems)[0],now='2026-10-08T00:00:00.000Z';
 source.metadata.enrichment.googleBooksGenreHint={source:'google-books',confidence:'author-and-title-stem',candidateVolumeId:'hint',candidateTitle:'Historical candidate',categories:['History'],sourceUrl:'https://books.google.com/books?id=hint'};
 source.metadata.enrichment.openLibrary={source:'open-library',workKey:'/works/OL1W',title:'Old work',authors:['Old author'],isbn:['9780306406157'],subjects:['Computers'],sourceUrl:'https://openlibrary.org/works/OL1W'};
 current.database.contentReviews[target.id]={entries:[{series:'Example',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'}],statement:'Collects Example #1',source:'manual-review',sourceUrl:'',verifiedAt:now};
 current.database.ownershipReviews[target.recordRef]={ownership:'owned',source:'manual-confirmation',reviewRef:crypto.randomUUID(),note:'Synthetic receipt',evidenceDate:now,confirmedAt:now,expiresAt:null,sourceUrl:''};
 current.database.readingStates[target.recordRef]={revisionRef:crypto.randomUUID(),status:'reading',progress:25,downloaded:false,access:'accessible',accessCheckedAt:now,updatedAt:now};
 const history=crypto.randomUUID();current.database.enrichmentHistory[history]={recordRef:target.recordRef,kind:'googleBooks',selectionRef:history,previous:null,changedAt:now};
 const second=Object.values(current.database.providerItems)[3],pair=[target.id,second.id].sort();current.database.manualMatchDecisions[pair.join('\0')]={itemIds:pair,decision:'same-work',updatedAt:now};
 const checked=createBackup(current.database),{candidate}=createGenreRecoveryCandidate(createBackup(old.database),checked),record=candidate.database.providerItems[target.id];
 assert(!record.metadata.enrichment.openLibrary.workKey);assert(!record.metadata.enrichment.openLibrary.authors);assert.equal(record.metadata.enrichment.googleBooksGenreHint.candidateVolumeId,'hint');assert.equal(record.metadata.enrichment.openLibrary.sourceUrl,'https://openlibrary.org/works/OL1W');
 for(const key of Object.keys(checked.database).filter(k=>k!=='providerItems'))assert.deepEqual(candidate.database[key],checked.database[key],key);
}]);
