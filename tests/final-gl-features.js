import assert from 'node:assert/strict';
import {normalizeGameTitle} from '../src/lib/normalization.js';
import {identityKey} from '../src/lib/identity.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {matchItems} from '../src/lib/matcher.js';

export function memory(){const stored={},writes=[];return {stored,writes,writer:createStorageWriter({get:async defaults=>structuredClone({...defaults,...stored}),set:async updates=>{writes.push(structuredClone(updates));Object.assign(stored,structuredClone(updates));},remove:async keys=>{for(const key of keys)delete stored[key];}})};}

export const finalGlTests=[['Unicode title keys preserve Japanese voicing, Korean composition and Indic marks',()=>{
  assert.notEqual(normalizeGameTitle('ガンダム').normalizedTitle,normalizeGameTitle('カンダム').normalizedTitle);
  assert.equal(normalizeGameTitle('ガンダム').normalizedTitle,normalizeGameTitle('カ\u3099ンダム').normalizedTitle);
  assert.equal(normalizeGameTitle('한글').normalizedTitle,'한글');assert.equal(normalizeGameTitle('किताब').normalizedTitle,'किताब');assert.equal(identityKey('किताब'),'किताब');
}],['reviewed aliases survive backups, warn as Possible, retain edition guards and stay scoped to record references',async()=>{
  const {writer}=memory();await writer.mergeProviderItems('humble',[{providerItemId:'manga',title:'ガンダム Vol. 1',mediaType:'book',ownership:'owned',metadata:{authors:['Writer'],isbn:'9780140328721'}}]);
  let db=await writer.getDatabase();const record=db.providerItems['humble:manga'];db=await writer.saveTitleAliases(record.recordRef,['Gundam Vol. 1'],'Publisher translation');db=parseBackup(createBackup(db));
  const possible=matchItems(db.providerItems,[{title:'Gundam Vol. 1',mediaType:'book'}],db)[0];assert(!possible.owned&&possible.possibleMatches.some(item=>item.title===record.title));
  const owned=matchItems(db.providerItems,[{title:'Gundam Vol. 1',mediaType:'book',identifiers:{isbn:'9780140328721'}}],db)[0];assert(owned.owned);
  db=await writer.saveTitleAliases(record.recordRef,['Gundam Vol. 2']);assert.equal(matchItems(db.providerItems,[{title:'Gundam Vol. 2',mediaType:'book'}],db)[0].possibleMatches.length,0);
  await writer.clearDatabase();await writer.mergeProviderItems('humble',[{providerItemId:'manga',title:record.title,mediaType:'book'}]);await assert.rejects(writer.saveTitleAliases(record.recordRef,['Gundam']),/active library/);
}]];
