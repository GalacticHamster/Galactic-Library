import assert from 'node:assert/strict';
import { normalizeProviderItem, createEmptyDatabase } from '../src/lib/models.js';
import { handleExternalApiRequest } from '../src/lib/external-api.js';
import { withWorker, snapshotFixture } from './storage.js';
import { PROVIDERS } from '../src/lib/constants.js';
import { restrictStorageAccess } from '../src/background/storage-access.js';

export const securityTests = [
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
  })]
];
