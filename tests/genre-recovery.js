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
