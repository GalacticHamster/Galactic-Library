import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createEmptyDatabase, normalizeProviderItem, rebuildCanonicalItems} from '../src/lib/models.js';
import {handleExternalApiRequest, handleExternalApiRequestAsync} from '../src/lib/external-api.js';
import {PROVIDER_SOURCES} from '../src/lib/metadata-validation.js';
import {installXboxFixture} from './xbox-source-fixture.js';
import {memory} from './final-gl-features.js';
import {ownershipCorrectionTarget} from '../src/ui/quick-access.js';
import {createBackup, parseBackup} from '../src/lib/storage.js';
import {companionMatch} from '../src/lib/companion-response.js';
import {completeProviderSnapshot, completedScope} from '../src/lib/provider-snapshot.js';

// Synthetic website input, not a user inventory. Exercise the shipped capture
// projections before normalization, API filtering/redaction and both consumers.
const context=vm.createContext({console});
for(const file of ['provider-snapshot.js','console-library.js','xbox-library.js'])
  vm.runInContext(readFileSync(new URL('../src/providers/'+file,import.meta.url),'utf8'),context);
installXboxFixture(context);
const C=context.GalacticConsoleLibrary;
const nintendo=(extra={})=>C.parseNintendoPage({data:{account:{vgc:{vgcViewsV2:{
  views:[{id:'synthetic-card',applicationId:'synthetic-application',applicationName:'Synthetic Console Adventure',
    apparentPlatform:'NX',ownerNaId:'synthetic-account',userNaId:'synthetic-account',hasReleasedApplication:true,...extra}],
  offsetInfo:{offset:0,total:1}}
}}}},{accountNaId:'synthetic-account'}).items[0];
const playstation=(extra={})=>C.parsePlayStationPage({data:{purchasedTitlesRetrieve:{
  games:[{productId:'synthetic-product',titleId:'synthetic-title',name:'Synthetic Console Adventure',platform:'PS4',membership:'NONE',isActive:true,...extra}],
  pageInfo:{offset:0,size:1,isLast:true}
}}}).items[0];
const xbox=()=>context.GalacticXboxLibrary.read(context).items[1];
const normalize=value=>normalizeProviderItem(JSON.parse(JSON.stringify(value)));
export const consoleRecord=(provider,ownership='owned')=>normalize({
  ...({nintendo,playstation,xbox}[provider])(),ownership
});
export function consoleDatabase(records,extra={}) {
  const providerItems=Object.fromEntries(records.map(record=>[record.id,record]));
  return {...createEmptyDatabase(),providerItems,canonicalItems:rebuildCanonicalItems(providerItems),...extra};
}
export function consoleReply(database,offer,extra={}) {
  const before=JSON.stringify(database);
  const response=handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'synthetic-offer',mediaType:'game',...offer,...extra}]});
  assert.equal(response.ok,true,response.error);
  assert.equal(JSON.stringify(database),before,'Read-only matching must retain all source records');
  return response.results[0];
}

// Use the existing shipped-code fixtures; FAN must pass its network response
// validator as well as its resolver. HB's fixture invokes its real query/render
// merge path. No synthetic replacement matching rules are used here.
async function consumers(database,offer,expected) {
  for(const project of ['HB','Fanatical']) {
    const path=new URL('../../'+project+'/tests/matching-fixture.mjs',import.meta.url);
    if(!existsSync(path))continue; // Same adjacent-checkout convention as policy parity tests.
    const {fixture}=await import(path);
    const f=fixture([],offer.mediaType??'game',offer,{matches:[]});
    const messages=[];
    const send=message=>{messages.push(message);return handleExternalApiRequest(database,message);};
    if(project==='HB') {
      f.context.chrome.runtime.sendMessage=async(_id,message)=>send(message);
    } else {
      const F=f.context.FanaticalLibrary;
      const product={...f.context.offered,sourceItemId:'synthetic-offer'};
      const lookup=await F.queryGalacticItems(F.galacticRequestItems([product],true),async message=>send(message));
      assert.equal(lookup.failed.size,0,'FAN must accept the actual GL response');
      f.context.centralResult=lookup.results.get(product.sourceItemId);
      assert(f.context.centralResult);
    }
    let result;
    if(project==='HB'&&offer.contents?.length){
      f.context.mappings=[{id:'synthetic-map',collectionTitle:offer.title,verified:true,contentsComplete:offer.contentsComplete,
        language:'en',contains:offer.contents.map(unit=>({series:unit.series,run:unit.run,unitType:unit.unitType,from:Number(unit.number),to:Number(unit.number)}))}];
      await vm.runInContext('renderBundleComparison(createBundleLibraryMatcher(records,offered.kind),offered.kind,[],mappings,comparison,1)',f.context);
      result={match:f.context.comparison.resolvedItems[0].match};
    }else result=await f.classify();
    assert.equal(result.match.state,expected==='owned'?(project==='HB'?'elsewhere':'owned-elsewhere'):expected,project+': '+offer.title);
    const requests=messages.filter(message=>message.type==='MATCH_ITEMS');
    assert(requests.length>0);
    for(const request of requests)for(const item of request.items){
      assert.deepEqual([...item.excludeProviders],[project==='HB'?'humble':'fanatical']);
      assert.equal(Object.hasOwn(item,'sources'),false);
    }
  }
}

export const consoleCompanionTests=[];
for(const provider of ['nintendo','playstation','xbox']) {
  consoleCompanionTests.push(['console API: '+provider+' capture survives normalization and response projection',async()=>{
    const record=consoleRecord(provider),db=consoleDatabase([record]);
    assert.equal(record.metadata.source,PROVIDER_SOURCES[provider]);
    const result=consoleReply(db,{title:record.title});
    assert.equal(result.owned,true);assert.equal(result.matches.length,1);
    assert.equal(result.matches[0].relationship,'same-edition');
    assert.equal(result.matches[0].evidence.source,record.metadata.source);
    assert.equal(result.matches[0].provider,provider);
    assert.equal(result.matches[0].itemRef,record.recordRef);
    assert.equal(Object.hasOwn(result.matches[0],'platform'),false,'API v1 does not project platform/product IDs');
    assert(!JSON.stringify(result).includes(record.providerItemId));
    assert.deepEqual((await handleExternalApiRequestAsync(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'synthetic-offer',mediaType:'game',title:record.title}]})).results[0],result);
  }]);
  for(const ownership of ['owned','unknown','subscription','borrowed','returned','revoked','expired'])
    consoleCompanionTests.push(['console consumers: '+provider+' '+ownership+' separates exact identity from ownership',async()=>{
      const record=consoleRecord(provider,ownership),db=consoleDatabase([record]);
      const result=consoleReply(db,{title:record.title});
      assert.equal(result.confidence,1);assert.equal(result.matches[0].ownership,ownership);
      assert.equal(result.owned,ownership==='owned');
      await consumers(db,{title:record.title},ownership==='owned'?'owned':'possible');
    }]);
}
consoleCompanionTests.push(['console API: source access evidence remains uncertain after capture',async()=>{
  for(const raw of [nintendo({hasReleasedApplication:false,hasReleasedAddOnContents:true}),nintendo({ownerNaId:'another-account'}),playstation({membership:'PS_PLUS'}),playstation({isTrial:true})]){
    const record=normalize(raw),db=consoleDatabase([record]);
    assert.notEqual(record.ownership,'owned');assert.equal(consoleReply(db,{title:record.title}).owned,false);
    await consumers(db,{title:record.title},'possible');
  }
  // The Xbox capture itself rejects access-only caches; a saved unknown
  // observation is also safe if encountered through older/imported data.
  context.fixtureXbox.access.get('X00000000001').userAccessTypes=new Set([2]);
  assert.throws(()=>context.GalacticXboxLibrary.read(context));
  context.fixtureXbox.access.get('X00000000001').userAccessTypes=new Set([1]);
}]);
consoleCompanionTests.push(['console API: canonical provider exclusions, unsupported source fields and malformed input',()=>{
  const records=['nintendo','playstation','xbox'].map(provider=>({...consoleRecord(provider),title:'Synthetic Shared Game',normalizedTitle:'synthetic shared game',baseTitle:'synthetic shared game'}));
  const db=consoleDatabase(records),offer={title:'Synthetic Shared Game'};
  assert.equal(consoleReply(db,offer).matches.length,3);
  for(const record of records){
    const remaining=consoleReply(db,offer,{excludeProviders:records.filter(other=>other.provider!==record.provider).map(other=>other.provider)});
    assert.deepEqual(remaining.matches.map(match=>match.provider),[record.provider]);assert.equal(remaining.owned,true);
    for(const unsupported of [record.metadata.source,'unsupported-source'])assert.equal(consoleReply(db,offer,{excludeProviders:[unsupported]}).matches.length,3);
    // No include-source filter exists in API v1. Unknown additive fields are
    // ignored, not silently promoted into a new filtering contract.
    assert.equal(consoleReply(db,offer,{sources:[record.metadata.source]}).matches.length,3);
  }
  assert.equal(consoleReply(db,offer,{excludeProviders:records.map(record=>record.provider)}).owned,false);
  for(const excludeProviders of [null,'xbox',[null],[42],Array(21).fill('xbox')]){
    const reply=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{...offer,excludeProviders}]});assert.equal(reply.ok,false);
  }
}]);
consoleCompanionTests.push(['console API: mixed-source ownership and account scope do not transfer access',async()=>{
  const unknown=consoleRecord('xbox','unknown');
  const owned=normalizeProviderItem({provider:'steam',providerItemId:'synthetic-steam',title:unknown.title,ownership:'owned',metadata:{source:PROVIDER_SOURCES.steam}});
  const db=consoleDatabase([unknown,owned]);
  assert.equal(consoleReply(db,{title:unknown.title}).owned,true);
  assert.equal(consoleReply(db,{title:unknown.title},{excludeProviders:['xbox']}).owned,true);
  const excluded=consoleReply(db,{title:unknown.title},{excludeProviders:['steam']});
  assert.equal(excluded.owned,false);assert.equal(excluded.matches[0].ownership,'unknown');
  await consumers(db,{title:unknown.title},'owned');
  const profileIds=['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'];
  const profiles=profileIds.map((profileId,index)=>normalizeProviderItem({...unknown,profileId,ownership:index?'owned':'unknown'}));
  const multi=consoleDatabase(profiles);
  assert.notEqual(profiles[0].id,profiles[1].id);
  const all=consoleReply(multi,{title:unknown.title});
  assert.equal(all.matches.length,2);assert.equal(all.owned,true,'Companion searches the complete saved library, not just the active profile');
  assert.equal(consoleReply(multi,{title:unknown.title},{excludeProviders:['xbox']}).matches.length,0);
  for(const profileId of profileIds)assert(!JSON.stringify(all).includes(profileId));
}]);
consoleCompanionTests.push(['console consumers: edition and software-version conflicts remain Possible',async()=>{
  for(const [title,offered,mediaType]of [['Synthetic Adventure Deluxe Edition','Synthetic Adventure','game'],['Creative Studio 2024','Creative Studio 2025','software']]){
    const record=normalizeProviderItem({...consoleRecord('xbox'),title,mediaType});
    const db=consoleDatabase([record]);
    assert.equal(consoleReply(db,{title:offered,mediaType}).owned,false);
    await consumers(db,{title:offered,mediaType},'possible');
  }
}]);
consoleCompanionTests.push(['console API: catalog-only identities and unsupported wishlist states cannot grant ownership',async()=>{
  const record=consoleRecord('nintendo'),db=consoleDatabase([record]);
  // Bibliographic identity alone, without a provider observation, is not an entitlement.
  db.providerItems={};
  assert.equal(consoleReply(db,{title:record.title}).owned,false);
  await consumers(db,{title:record.title},'new');
  // GL has no wishlist ownership state. Reject it rather than inventing an
  // owned record. HB/FAN keep wishlist entries outside their purchase inputs.
  assert.throws(()=>normalizeProviderItem({...record,ownership:'wishlist'}),/Unsupported ownership state/);
  assert.throws(()=>normalizeProviderItem({...record,provider:'unsupported-provider'}),/Unsupported provider/);
}]);
consoleCompanionTests.push(['console API: manual access correction survives ambiguous reimport and backup restore',async()=>{
  const {writer}=memory();
  const raw=normalize(nintendo({hasReleasedApplication:false,hasReleasedAddOnContents:true})),fingerprint='a'.repeat(64);
  const snapshot=completeProviderSnapshot('nintendo',[raw],[completedScope('non-hidden-virtual-cards',1,1,'reported-count')]);
  const begin=()=>writer.beginProviderScan('nintendo','Synthetic account','full',false,1,null,false,fingerprint);
  const commit=async()=>{
    const scan=await begin();
    return writer.commitProviderScan('nintendo',[raw],{syncMode:'full',fullSyncAt:'2026-10-16'},snapshot,scan.scanToken,1,false,fingerprint);
  };
  let db=await commit();
  const item=Object.values(db.providerItems)[0];
  db=await writer.saveOwnershipCorrections([ownershipCorrectionTarget(item,db)],{ownership:'owned',note:'Synthetic user correction'});
  db=await commit();
  assert.equal(Object.values(db.providerItems)[0].ownership,'unknown');
  const failed=await begin();await writer.failProviderScan('nintendo',failed.scanToken,1,{message:'Synthetic incomplete scan'});
  db=await writer.getDatabase();
  db=parseBackup(createBackup(db));
  assert.equal(consoleReply(db,{title:raw.title}).owned,true);
  await consumers(db,{title:raw.title},'owned');
}]);
consoleCompanionTests.push(['companion evidence: registered importer labels survive and unknown source text is redacted',()=>{
  for(const [provider,source]of Object.entries(PROVIDER_SOURCES)){
    const record={provider,title:'Synthetic title',ownership:'unknown',evidence:{source}};
    assert.equal(companionMatch(record).evidence.source,source);
    assert.equal(companionMatch({...record,evidence:{source:'https://private.example/account'}}).evidence.source,provider);
  }
}]);
consoleCompanionTests.push(['companion consumers: partial reviewed contents never becomes whole-product ownership',async()=>{
  const unit=number=>({series:'Synthetic Comic',run:'2020',unitType:'issue',number:String(number),language:'en',completeness:'full'});
  const record=normalizeProviderItem({provider:'kindle',providerItemId:'synthetic-contents',title:'Synthetic First Collection',mediaType:'book',ownership:'owned',metadata:{authors:['Synthetic Author']}});
  const db=consoleDatabase([record],{contentReviews:{[record.id]:{entries:[unit(1)],verifiedAt:'2026-10-01'}}});
  const offer={title:'Synthetic Second Collection',mediaType:'book',contents:[unit(1),unit(2)],contentsComplete:true};
  const result=consoleReply(db,offer);
  assert.equal(result.owned,false);assert.equal(result.coverage.owned,1);assert.equal(result.coverage.total,2);
  await consumers(db,offer,'partial');
}]);
