import assert from 'node:assert/strict';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {effectiveOwnershipRecord,validateOwnershipPolicy} from '../src/lib/ownership.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
import {contentCoverage} from '../src/lib/contents.js';
import {libraryReminders} from '../src/lib/reminders.js';
import {readingEvidence} from '../src/lib/reading.js';
import {PROVIDERS,OWNERSHIP_STATES} from '../src/lib/constants.js';

const record=(provider='kindle',ownership='unknown',extra={})=>normalizeProviderItem({provider,
  providerItemId:'policy-example',title:'Example Book',mediaType:'book',ownership,...extra});
const database=(items,ownershipPolicy)=>({...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item])),
  ...(ownershipPolicy?{ownershipPolicy}:{})});
const query=(db,offer={title:'Example Book',mediaType:'book'})=>handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[offer]}).results[0];
const writerFixture=()=>{
  const values={};
  const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),
    set:async updates=>Object.assign(values,structuredClone(updates)),remove:async keys=>{for(const key of keys)delete values[key];}});
  return {writer,values};
};

export const ownershipPolicyTests=[
  ['ownership overrides default off and schema 11 backups migrate without changing observations',()=>{
    const item=record();const old=database([item]);old.schemaVersion=11;delete old.ownershipPolicy;
    const migrated=validateDatabase(old);
    assert.deepEqual(migrated.ownershipPolicy,{allOwned:false,providers:{}});
    assert.equal(migrated.schemaVersion,12);
    assert.equal(query(migrated).owned,false);
    assert.deepEqual(migrated.providerItems[item.id],item);
  }],
  ['global override covers every provider, media type and ownership state without mutating records',()=>{
    for(const provider of PROVIDERS)for(const ownership of OWNERSHIP_STATES){
      const item=record(provider,ownership);const before=structuredClone(item);
      const db=database([item],{allOwned:true,providers:{}});
      const effective=effectiveOwnershipRecord(item,db);
      assert.equal(effective.ownership,'owned');assert.equal(effective.ownershipOverride.observedOwnership,item.ownership);
      assert.equal(query(db).owned,true);assert.deepEqual(item,before);
    }
    for(const mediaType of ['game','software','audiobook','book','movie','tv','game-addon']){
      const item=record('humble','unknown',{mediaType});
      assert.equal(effectiveOwnershipRecord(item,database([item],{allOwned:true,providers:{}})).ownership,'owned');
    }
  }],
  ['provider override is scoped and global choice takes precedence without erasing provider choices',()=>{
    const kindle=record(),audible=record('audible','subscription',{mediaType:'audiobook'});
    const db=database([kindle,audible],{allOwned:false,providers:{kindle:true}});
    assert.equal(query(db).owned,true);
    assert.equal(query(db,{title:audible.title,mediaType:'audiobook'}).owned,false);
    db.ownershipPolicy.allOwned=true;
    assert.equal(query(db,{title:audible.title,mediaType:'audiobook'}).owned,true);
    db.ownershipPolicy.allOwned=false;
    assert.equal(query(db).owned,true);
    assert.equal(query(db,{title:audible.title,mediaType:'audiobook'}).owned,false);
  }],
  ['override bypasses expired keys and conflicting ownership reviews but retains the original evidence',()=>{
    const item=record('humble','owned',{mediaType:'game',metadata:{entitlement:'third-party-key',keyStatus:'expired',expiresAt:'2020-01-01'}});
    const db=database([item],{allOwned:true,providers:{}});
    db.ownershipReviews[item.recordRef]={ownership:'rental',confirmedAt:'2025-01-01',expiresAt:'2025-02-01',source:'checked-source'};
    const before=structuredClone(db);const result=query(db,{title:item.title,mediaType:'game'});
    assert.equal(result.owned,true);assert.equal(result.matches[0].ownership,'owned');
    assert.equal(result.matches[0].evidence.keyStatus,'expired');
    assert.equal(result.matches[0].evidence.ownershipBasis,'user-assumed-owned');
    assert.deepEqual(db,before);
    db.ownershipPolicy.allOwned=false;
    assert.equal(effectiveOwnershipRecord(item,db).ownership,'unknown');
    assert.equal(query(db,{title:item.title,mediaType:'game'}).owned,false);
  }],
  ['override cannot turn a different edition or a shortened title into exact ownership',()=>{
    const item=record('kindle','subscription',{title:'4001 A.D.: Beyond New Japan',metadata:{isbn:'9780306406157'}});
    const db=database([item],{allOwned:true,providers:{}});
    const partialTitle=query(db,{title:'4001 A.D.',mediaType:'book'});
    assert.equal(partialTitle.owned,false);assert.ok(partialTitle.possibleMatches.length);
    const differentIsbn=query(db,{title:item.title,mediaType:'book',identifiers:{isbn:'9780140328721'}});
    assert.equal(differentIsbn.owned,false);assert.ok(differentIsbn.possibleMatches.length);
    assert.equal(query(db,{title:item.title,mediaType:'book'}).owned,true);
  }],
  ['reviewed contents and reading use the override while public provenance survives repeated evaluation',()=>{
    const item=record('kindle','subscription',{title:'Example Collection'});
    const db=database([item],{allOwned:true,providers:{}});
    const unit={series:'Example Series',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'};
    db.contentReviews[item.id]={entries:[unit],statement:'Collects Example Series #1'};
    assert.equal(contentCoverage(db,[unit]).owned,1);
    assert.equal(readingEvidence(item,db).ownership,'owned');
    const result=query(db,{title:'Example Series (2020) #1',mediaType:'book',contents:[unit],contentsComplete:true});
    assert.equal(result.owned,true);
    assert.equal(result.matches[0].evidence.observedOwnership,'subscription');
    const effective=effectiveOwnershipRecord(item,db);
    assert.equal(effectiveOwnershipRecord(effective,db).ownershipOverride.observedOwnership,'subscription');
    db.ownershipPolicy.allOwned=false;
    assert.equal(effectiveOwnershipRecord(effective,db).ownership,'subscription');
    assert.equal(contentCoverage(db,[unit]).owned,0);
    assert.equal(readingEvidence(item,db).ownership,'subscription');
  }],
  ['ownership display override preserves source access reminders and archived profile boundaries',()=>{
    const item=record('audible','subscription',{mediaType:'audiobook',metadata:{expiresAt:'2030-01-01'}});
    const db=database([item]);const reminders=libraryReminders(db);
    db.ownershipPolicy.allOwned=true;
    assert.deepEqual(libraryReminders(db),reminders);
    const archived=record('kindle','owned');
    db.providerHistory[archived.recordRef]={item:archived,profileLabel:'other-account',reason:'profile-switch'};
    assert.equal(query(db).owned,false);
  }],
  ['queued ownership preference patches and imports retain every choice without changing provider observations',async()=>{
    const {writer}=writerFixture();
    await writer.mergeProviderItems('kindle',[{providerItemId:'one',title:'One',mediaType:'book',ownership:'subscription'}]);
    const before=(await writer.getDatabase()).providerItems;
    await Promise.all([writer.saveOwnershipPolicy({providers:{kindle:true}}),writer.saveOwnershipPolicy({providers:{audible:true}}),
      writer.saveOwnershipPolicy({allOwned:true}),writer.mergeProviderItems('humble',[{providerItemId:'two',title:'Two',mediaType:'book',ownership:'unknown'}])]);
    const saved=await writer.getDatabase();
    assert.deepEqual(saved.ownershipPolicy,{allOwned:true,providers:{kindle:true,audible:true}});
    assert.deepEqual(saved.providerItems['kindle:one'],before['kindle:one']);
    assert.equal(saved.providerItems['humble:two'].ownership,'unknown');
    await writer.saveOwnershipPolicy({allOwned:false,providers:{kindle:false}});
    assert.deepEqual((await writer.getDatabase()).ownershipPolicy,{allOwned:false,providers:{audible:true}});
  }],
  ['ownership preference backup restore and clear are reversible and preserve original media provenance',async()=>{
    const {writer}=writerFixture();
    await writer.mergeProviderItems('kindle',[{providerItemId:'one',title:'One',mediaType:'book',ownership:'borrowed',metadata:{authors:['Writer']}}]);
    await writer.saveOwnershipPolicy({allOwned:true,providers:{kindle:true}});
    const backup=createBackup(await writer.getDatabase());
    assert.equal(backup.database.providerItems['kindle:one'].ownership,'borrowed');
    await writer.clearDatabase();assert.deepEqual((await writer.getDatabase()).ownershipPolicy,{allOwned:false,providers:{}});
    const restored=await writer.restoreDatabase(parseBackup(backup));
    assert.deepEqual(restored.ownershipPolicy,backup.database.ownershipPolicy);
    assert.deepEqual(restored.providerItems,backup.database.providerItems);
    await writer.saveOwnershipPolicy({allOwned:false,providers:{kindle:false}});
    assert.equal((await writer.getDatabase()).providerItems['kindle:one'].ownership,'borrowed');
  }],
  ['invalid ownership settings cannot partially write or enter a restored database',async()=>{
    const {writer,values}=writerFixture();await writer.saveOwnershipPolicy({providers:{kindle:true}});
    const before=structuredClone(values);
    for(const invalid of [undefined,null,[],true,{allOwned:'true'},{providers:null},{providers:[]},{providers:{kindle:1}},{providers:{unknown:true}},{credential:'private'}]){
      await assert.rejects(writer.saveOwnershipPolicy(invalid));assert.deepEqual(values,before);
      if(invalid!==undefined)assert.throws(()=>validateOwnershipPolicy(invalid));
    }
    const invalid=await writer.getDatabase();invalid.ownershipPolicy={allOwned:'true'};
    await assert.rejects(writer.restoreDatabase(invalid));assert.deepEqual(values,before);
  }],
  ['only the saved preference controls companion ownership; request flags cannot enable it',()=>{
    const item=record('kindle','rental');const db=database([item]);
    const request={type:'MATCH_ITEMS',apiVersion:1,ownershipPolicy:{allOwned:true},items:[{title:item.title,mediaType:'book',allOwned:true}]};
    assert.equal(handleExternalApiRequest(db,request).results[0].owned,false);
    db.ownershipPolicy={allOwned:false,providers:{kindle:true}};
    const result=handleExternalApiRequest(db,request).results[0];
    assert.equal(result.owned,true);assert.equal(result.matches[0].evidence.observedOwnership,'rental');
    assert.equal(result.matches[0].evidence.ownershipBasis,'user-assumed-owned');
    assert.ok(!JSON.stringify(result).includes('ownershipPolicy'));
  }]
];
