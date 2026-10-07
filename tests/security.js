import assert from 'node:assert/strict';
import { normalizeProviderItem, createEmptyDatabase } from '../src/lib/models.js';
import { isExtensionId, handleExternalApiRequest } from '../src/lib/external-api.js';
import { withWorker, snapshotFixture } from './storage.js';
import { PROVIDERS } from '../src/lib/constants.js';
import { restrictStorageAccess } from '../src/background/storage-access.js';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { validateDatabase } from '../src/lib/models.js';
import { validateMetadata } from '../src/lib/metadata-validation.js';
import { validateContentReview } from '../src/lib/contents.js';
import { validateFandangoState } from '../src/background/import-state.js';
import { DATABASE_STORAGE_KEY } from '../src/lib/constants.js';

export const securityTests = [
  ['Humble quick state refreshes unresolved and due key purchases without revealing foreign records', () => withWorker(async({dispatch,pageA})=>{
    await pageA.mergeProviderItems('humble',[
      {providerItemId:'pending',title:'Pending',mediaType:'game',ownership:'owned',metadata:{purchaseId:'pending-order',entitlement:'third-party-key',keyStatus:'unrevealed'}},
      {providerItemId:'revealed',title:'Revealed',mediaType:'game',ownership:'owned',metadata:{purchaseId:'revealed-order',entitlement:'third-party-key',keyStatus:'revealed'}},
      {providerItemId:'due',title:'Due',mediaType:'game',ownership:'owned',metadata:{purchaseId:'due-order',entitlement:'third-party-key',keyStatus:'revealed',expiresAt:'2000-01-01'}}
    ]);
    const state=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'humble'},{id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.humblebundle.com/home/purchases',tab:{id:1}});
    assert.deepEqual(state.syncState.refreshPurchaseIds.sort(),['due-order','pending-order']);
  })],
  ['companion output strips private fields from exact, possible, partial and contents evidence', () => {
    const database = createEmptyDatabase();
    const item = normalizeProviderItem({provider:'humble', providerItemId:'private-purchase-id', title:'Comic Collection', mediaType:'book', ownership:'owned', metadata:{authors:['Author'], source:'secret-token', purchaseId:'secret-purchase', detailUrl:'https://example.test/private', token:'secret-token'}});
    // Bypass storage validation to exercise the independent API output boundary.
    item.observedAt = 'secret-date';
    item.privateField = 'secret-record'; database.providerItems[item.id] = item;
    database.providers.humble = {connected:true, itemCount:Infinity, bookCount:1, syncState:{token:'secret-token'}};
    database.providers['secret-provider'] = {connected:true};
    const entry = {series:'Comic', run:'2020', unitType:'issue', number:'1', language:'en', completeness:'full'};
    database.contentReviews[item.id] = {entries:[entry], verifiedAt:'secret-review', sourceUrl:'https://example.test/private', statement:'secret-statement'};
    const response = handleExternalApiRequest(database, {type:'MATCH_ITEMS', apiVersion:1, items:[
      {requestId:'exact', title:item.title, mediaType:'book', authors:['Author'], contents:[entry]},
      {requestId:'possible', title:'Comic Collection, 2nd Edition', mediaType:'book', authors:['Author']}
    ]});
    assert.equal(response.ok,true); assert.equal(response.results[0].owned,true);
    assert.equal(response.results[0].coverage.covered.length,1); assert.equal(response.results[1].possibleMatches.length,1);
    const serialized=JSON.stringify(response);
    for(const secret of ['private-purchase-id','secret-purchase','secret-token','secret-date','secret-record','secret-review','secret-statement','https://example.test/private']) assert.ok(!serialized.includes(secret),secret);
    const match=response.results[0].matches[0]; assert.equal(match.itemRef,item.recordRef); assert.equal(match.evidence.source,'humble'); assert.equal(match.evidence.checkedAt,null);
    assert.equal(response.results[0].coverage.covered[0].evidence[0].verifiedAt,null);
    const status=handleExternalApiRequest(database,{type:'GET_STATUS'});
    assert.deepEqual(Object.keys(status.providers),['humble']); assert.equal(status.providers.humble.gameCount,0);
  }],
  ['storage protection gates queued library access and fails closed', async () => {
    let release; const accessGate=new Promise(resolve=>{release=resolve;});
    await withWorker(async({memory,pageA,accessLevels})=>{
      const read=pageA.getDatabase(); await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(memory.getCount,0); assert.deepEqual(accessLevels,[['local','TRUSTED_CONTEXTS'],['session','TRUSTED_CONTEXTS']]);
      release(); await read; assert.equal(memory.getCount,1);
    },{accessGate});
    await withWorker(async({memory,pageA})=>{await assert.rejects(pageA.getDatabase(),/storage protection failed/u);assert.equal(memory.getCount,0);},{accessError:new Error('storage protection failed')});
    await assert.rejects(restrictStorageAccess({local:{},session:{}}),/cannot protect library storage/u);
  }],
  ['all eleven providers keep full and quick import messages working with protected storage', () => withWorker(async({dispatch,pageA})=>{
    const sites={steam:'https://store.steampowered.com/',gog:'https://www.gog.com/account',epic:'https://store.epicgames.com/', 'amazon-games':'https://gaming.amazon.com/my-collection',audible:'https://www.audible.com/library',kindle:'https://www.amazon.com/hz/mycd/', 'amazon-video':'https://www.amazon.com/gp/video/library', 'fandango-at-home':'https://athome.fandango.com/content/browse/mylibrary',kobo:'https://www.kobo.com/library',fanatical:'https://www.fanatical.com/en/orders',humble:'https://www.humblebundle.com/home/purchases'};
    const id='abcdefghijklmnopabcdefghijklmnop';
    for(const provider of PROVIDERS){
      const sender={id,url:sites[provider],tab:{id:1}};
      const item={providerItemId:'test-1',title:`Fixture ${provider}`,mediaType:provider==='kindle'?'book':provider==='fandango-at-home'?'movie':'game',ownership:'owned'};
      let response=await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider,items:[item],snapshot:snapshotFixture(provider,[item])},sender);
      assert.equal(response.ok,true,`${provider}: ${response.error}`);
      response=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider},sender);assert.equal(response.ok,true,provider);assert.equal(response.hasFullBaseline,true,provider);
      response=await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider,mode:'incremental',items:[{...item,title:`Updated ${provider}`}]},sender);
      // Epic deliberately has only a full scan UI.
      if(provider!=='epic')assert.equal(response.ok,true,`${provider}: ${response.error}`);
      const wrong=await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider,mode:'incremental',items:[item]}, {...sender,id:'other-extension'}); assert.equal(wrong.ok,false,provider);
    }
    assert.equal(Object.keys((await pageA.getDatabase()).providers).length,11);
    const denied=await dispatch({type:'MATCH_ITEMS',items:[{title:'Fixture steam'}]},{id,url:sites.steam});assert.equal(denied.ok,false);
    const sender={id,url:sites['fandango-at-home'],tab:{id:3}};
    assert.equal((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'set',state:{phase:'start',mode:'full'}},sender)).ok,true);
    assert.deepEqual((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'get'},sender)).state,{phase:'start',mode:'full'});
    assert.equal((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'get'},{...sender,tab:{id:4}})).state,null);
    await dispatch({type:'FANDANGO_IMPORT_STATE',action:'clear'},sender);
    assert.equal((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'get'},sender)).state,null);
  })],
  ['actual external listener checks allowlisting and never leaks storage errors', () => withWorker(async({pageA,dispatchExternal,memory})=>{
    const id='ponmlkjihgfedcbaponmlkjihgfedcba';
    assert.equal((await dispatchExternal({type:'PING'},{id})).ok,false);
    await pageA.addAllowedExternalClientId(id);
    assert.equal((await dispatchExternal({type:'PING'},{id})).ok,true);
    memory.values[DATABASE_STORAGE_KEY]={schemaVersion:'secret-schema'};
    const response=await dispatchExternal({type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Book'}]},{id});
    assert.equal(response.ok,false);assert.ok(!JSON.stringify(response).includes('secret-schema'));
  })],
  ['central provider allowlists preserve useful metadata and remove secrets and foreign fields', () => {
    const value=JSON.parse('{"authors":["著者"],"contributors":[{"name":"Artist","role":"illustrator","token":"secret"}],"volume":2,"language":"ja","purchaseId":"secret-purchase","bundleTitle":"Bundle","token":"secret","nested":{"download":"secret"},"__proto__":{"polluted":true},"detailUrl":"https://www.amazon.com/dp/B000000001?token=secret#secret","imageUrl":"javascript:alert(1)"}');
    const metadata=validateMetadata('kindle',value);
    assert.deepEqual(metadata.authors,['著者']);assert.equal(metadata.volume,'2');assert.equal(metadata.detailUrl,'https://www.amazon.com/dp/B000000001');assert.equal(metadata.imageUrl,'');
    assert.deepEqual(metadata.contributors,[{name:'Artist',role:'illustrator'}]);assert.ok(!JSON.stringify(metadata).includes('secret'));assert.equal({}.polluted,undefined);
    assert.equal(validateMetadata('humble',{purchaseId:'purchase-1',originType:'Purchase'}).purchaseId,'purchase-1');assert.equal(validateMetadata('humble',{originType:'Purchase'}).originType,undefined);
  }],
  ['known metadata fields reject malformed and excessive shapes without truncating identity', () => {
    for(const metadata of [[], 'raw', {authors:[{}]}, {authors:Array(51).fill('A')}, {series:'s'.repeat(501)}, {contributors:[null]}, {contributors:Array(51).fill({name:'A'})}, {language:{}}, {volume:'1'.repeat(81)}, {isbn:'9'.repeat(33)}, {contentsStatement:'x'.repeat(10001)}, {detailUrl:'x'.repeat(2049)}, {enrichment:{googleBooks:[]}}, {enrichment:{googleBooks:{authors:[{}]}}}])assert.throws(()=>validateMetadata('kindle',metadata));
    assert.throws(()=>normalizeProviderItem({provider:'humble',providerItemId:'a',title:'x'.repeat(501)}),/bounds/u);
    assert.throws(()=>normalizeProviderItem({provider:'humble',providerItemId:'a'.repeat(501),title:'Book'}),/bounds/u);
    assert.throws(()=>normalizeProviderItem({provider:'humble',providerItemId:'a',title:'Book',platform:[{}]}),/text/u);
    assert.throws(()=>normalizeProviderItem({provider:'humble',providerItemId:'a',title:'Book',observedAt:'not-a-date'}),/ISO/u);
    assert.throws(()=>normalizeProviderItem({provider:'humble',providerItemId:'a',title:'Book',observedAt:'2026-02-30T00:00:00Z'}),/ISO/u);
    const legacy='2024-01-01T00:00:00.123456';
    assert.equal(normalizeProviderItem({provider:'humble',providerItemId:'a',title:'Book',acquiredAt:legacy}).acquiredAt,new Date(legacy).toISOString());
  }],
  ['full imports, incremental imports and restore reject malformed later records atomically', () => withWorker(async({pageA,importItems})=>{
    const valid={providerItemId:'a',title:'Book',mediaType:'book',ownership:'owned',metadata:{authors:['Author']}};
    await importItems('kindle',[valid]);const before=await pageA.getDatabase();
    const invalid={...valid,providerItemId:'b',metadata:{authors:Array(51).fill('Author')}};
    await assert.rejects(importItems('kindle',[{...valid,title:'Changed'},invalid]),/too many/u);
    assert.deepEqual(await pageA.getDatabase(),before);
    await assert.rejects(importItems('kindle',[{...valid,title:'Changed'},invalid],'incremental'),/too many/u);
    assert.deepEqual(await pageA.getDatabase(),before);
    const backup=structuredClone(before);backup.providerItems['kindle:b']={...invalid,provider:'kindle',profileId:before.providers.kindle.activeProfileId};
    await assert.rejects(pageA.restoreDatabase(backup),/too many/u);assert.deepEqual(await pageA.getDatabase(),before);
  })],
  ['provider imports cannot inject enrichment, persistent references or observation dates', () => withWorker(async({pageA,importItems})=>{
    const injected={providerItemId:'a',title:'Book',mediaType:'book',ownership:'owned',recordRef:'00000000-0000-0000-0000-000000000000',observedAt:'2099-01-01T00:00:00Z',metadata:{authors:['Author'],source:'secret-source',enrichment:{googleBooks:{source:'google-books',volumeId:'forged',isbn:['9780306406157'],token:'secret'}}}};
    await importItems('kindle',[injected]);let item=(await pageA.getDatabase()).providerItems['kindle:a'];
    assert.notEqual(item.recordRef,injected.recordRef);assert.notEqual(item.observedAt,injected.observedAt);assert.equal(item.metadata.source,'amazon-kindle-content-library');assert.equal(item.metadata.enrichment,undefined);
    const ref=item.recordRef;await pageA.saveGoogleBooksEnrichments([{itemIds:[item.id],enrichment:{source:'google-books',volumeId:'approved',title:'Book',authors:['Author'],token:'secret'}}]);
    await importItems('kindle',[injected],'incremental');item=(await pageA.getDatabase()).providerItems['kindle:a'];assert.equal(item.recordRef,ref);assert.equal(item.metadata.enrichment.googleBooks.volumeId,'approved');assert.equal(item.metadata.enrichment.googleBooks.token,undefined);
  })],
  ['backup validation sanitizes provider state, enrichment URLs and untrusted canonical data', () => {
    const database=createEmptyDatabase();
    const item=normalizeProviderItem({provider:'humble',providerItemId:'a',title:'Book',mediaType:'book',metadata:{authors:['Author']}});database.providerItems[item.id]=item;
    item.metadata.enrichment={googleBooks:{source:'google-books',volumeId:'volume',sourceUrl:'https://books.google.com/books?id=volume&token=secret#secret',authors:['Author'],token:'secret'},unknown:{token:'secret'}};
    database.providers.humble={connected:true,bookCount:1,token:'secret',syncState:{knownPurchaseIds:['purchase-1'],token:'secret'}};
    database.providers['secret-provider']={token:'secret'};
    database.canonicalItems={secret:{id:'edition:secret',providerItemIds:[item.id],token:'secret'}};
    const validated=validateDatabase(database);const json=JSON.stringify(validated);assert.ok(!json.includes('secret'));
    assert.equal(validated.providerItems[item.id].metadata.enrichment.googleBooks.sourceUrl,'https://books.google.com/books?id=volume');
    assert.deepEqual(validated.providers.humble.syncState,{knownPurchaseIds:['purchase-1']});
    const duplicate=structuredClone(database);duplicate.providerItems.duplicate={...item};assert.throws(()=>validateDatabase(duplicate),/duplicate provider identities/u);
    const bad=structuredClone(database);bad.providers.humble.bookCount=-1;assert.throws(()=>validateDatabase(bad),/nonnegative/u);
  }],
  ['legacy storage is sanitized once without rewriting an unchanged database on every read', async () => {
    const database=createEmptyDatabase();const item=normalizeProviderItem({provider:'kindle',providerItemId:'a',title:'Book',mediaType:'book'});database.providerItems[item.id]=item;item.metadata.token='secret';
    const values={[DATABASE_STORAGE_KEY]:database};let writes=0;
    const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>{writes++;Object.assign(values,structuredClone(updates));}});
    await writer.getDatabase();assert.ok(!JSON.stringify(values[DATABASE_STORAGE_KEY]).includes('secret'));assert.equal(writes,1);
    await writer.getDatabase();assert.equal(writes,1);
  }],
  ['contents validation rejects oversized scope and credential URLs while retaining reviewed full evidence', () => {
    const entry={series:'Series',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'};
    assert.throws(()=>validateContentReview({entries:[{...entry,series:'s'.repeat(501)}]}),/bounds/u);
    assert.throws(()=>validateContentReview({entries:[entry],sourceUrl:'https://user:secret@example.test/page'}),/without credentials/u);
    assert.throws(()=>validateContentReview({entries:[entry],verifiedAt:'secret-date'}),/ISO/u);
    const review=validateContentReview({entries:[{...entry,token:'secret'}],sourceUrl:'https://publisher.test/collection?token=secret#secret',token:'secret'});
    assert.equal(review.entries.length,1);assert.ok(!JSON.stringify(review).includes('secret'));
  }],
  ['Fandango session state is bounded, projected and remains unchanged after an invalid write', () => withWorker(async({dispatch})=>{
    const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://athome.fandango.com/content/browse/mylibrary',tab:{id:1}};
    const state={phase:'tv',fullRescan:true,expected:{movies:1,tv:0},urls:{movie:'https://athome.fandango.com/movie-grid?token=secret',tv:'https://athome.fandango.com/tv-grid'},items:[{providerItemId:'1',title:'Movie',mediaType:'movie',ownership:'owned',metadata:{token:'secret'}}],knownItemIds:['1'],token:'secret'};
    assert.ok(!JSON.stringify(validateFandangoState(state)).includes('secret'));
    assert.equal((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'set',state},sender)).ok,true);
    const before=(await dispatch({type:'FANDANGO_IMPORT_STATE',action:'get'},sender)).state;
    const invalid={...state,urls:{...state.urls,tv:'https://evil.test/tv-grid'}};
    assert.equal((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'set',state:invalid},sender)).ok,false);
    assert.deepEqual((await dispatch({type:'FANDANGO_IMPORT_STATE',action:'get'},sender)).state,before);
  })]
];

securityTests.push(['Firefox protection requires private storage readiness and privileged session support',async()=>{let ready=false;const runtime={getURL:()=> 'moz-extension://synthetic/'},session={get:async()=>({})};await restrictStorageAccess({local:{},session},runtime,{ready:async()=>{ready=true;}});assert.equal(ready,true);await assert.rejects(restrictStorageAccess({local:{},session},runtime),/cannot protect/);await assert.rejects(restrictStorageAccess({local:{},session:{}},runtime,{ready:async()=>{}}),/cannot protect/);await assert.rejects(restrictStorageAccess({session},runtime,{ready:async()=>{throw Error('private storage unavailable');}}),/private storage unavailable/);}]);

securityTests.push(['Chrome and Firefox companion IDs share strict validation and reminder-feed round trips',()=>withWorker(async({pageA,dispatchExternal})=>{const client='humble-comic-library@galactichamster.com';assert(isExtensionId(client));assert(isExtensionId('{12345678-1234-1234-1234-123456789abc}'));for(const id of ['moz-extension://private/', 'https://evil.test', '__proto__', 'bad@', 'bad@localhost', 'bad id@example.test'])assert.equal(isExtensionId(id),false);await pageA.saveAllowedExternalClientIds([client]);assert((await dispatchExternal({type:'PING'},{id:client})).ok);await pageA.mergeProviderItems('humble',[],{profileLabel:'firefox'});const upload=await dispatchExternal({type:'BEGIN_ENTITLEMENT_FEED',apiVersion:1,profileLabel:'firefox',count:0,coverage:'complete',sentAt:'2026-10-01'},{id:client});assert(upload.ok);assert((await dispatchExternal({type:'COMMIT_ENTITLEMENT_FEED',apiVersion:1,uploadToken:upload.uploadToken},{id:client})).ok);const database=await pageA.getDatabase();assert(database.companionFeeds[client]);await pageA.restoreDatabase(database);assert((await pageA.getDatabase()).companionFeeds[client]);await pageA.saveAllowedExternalClientIds([]);assert.equal((await dispatchExternal({type:'GET_REMINDERS',apiVersion:1},{id:client})).ok,false);} )]);

securityTests.push(['central review opens only its own options after companion permission and API-version checks',()=>withWorker(async({pageA,dispatchExternal})=>{let opened=0;chrome.runtime.openOptionsPage=async()=>{opened++;};const client='fanatical-library@galactichamster.com',request={type:'OPEN_REVIEW',apiVersion:1,url:'https://evil.test'};assert.equal((await dispatchExternal(request,{id:client})).ok,false);assert.equal(opened,0);await pageA.saveAllowedExternalClientIds([client]);assert.equal((await dispatchExternal({...request,apiVersion:2},{id:client})).ok,false);assert.equal(opened,0);assert.equal((await dispatchExternal(request,{id:client})).ok,true);assert.equal(opened,1);} )]);
