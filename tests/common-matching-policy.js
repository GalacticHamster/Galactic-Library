import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeProviderItem, rebuildCanonicalItems } from '../src/lib/models.js';
import { matchItems } from '../src/lib/matcher.js';
const cases=JSON.parse(readFileSync(new URL('./common-matching-cases.json',import.meta.url),'utf8'));
export const commonMatchingPolicyTests=cases.filter(row=>!row.fanOnly).map(row=>['common matching policy: '+row.label,()=>{
  const media=row.media??'book';
  const items=row.records.map((record,index)=>normalizeProviderItem({provider:'humble',providerItemId:'common-'+index,title:record.title,mediaType:media,ownership:'owned',metadata:record}));
  const offered={...row.offer,mediaType:media,...(row.offer.isbn?{identifiers:{isbn:row.offer.isbn}}:{})};
  const result=matchItems(Object.fromEntries(items.map(item=>[item.id,item])),[offered])[0];
  assert.equal(result.owned?'owned':result.matches.length||result.possibleMatches.length?'possible':'new',row.expected);
}]);
commonMatchingPolicyTests.push(['inferred canonical groups cannot transfer a different title or preview to Owned',()=>{
  const left=normalizeProviderItem({provider:'humble',providerItemId:'left',title:'I Am Legend',mediaType:'book',ownership:'unknown',metadata:{authors:['Writer']}});
  const right=normalizeProviderItem({provider:'humble',providerItemId:'right',title:'1 Am Legend',mediaType:'book',ownership:'owned',metadata:{authors:['Writer']}});
  const items={[left.id]:left,[right.id]:right};
  assert.equal(Object.keys(rebuildCanonicalItems(items)).length,2);
  const stale={canonicalItems:{old:{id:'old',providerItemIds:[left.id,right.id]}}};
  assert.equal(matchItems(items,[{title:left.title,mediaType:'book',authors:['Writer']}],stale)[0].owned,false);
  const reviewed={...stale,manualMatchDecisions:{pair:{decision:'same-edition',itemIds:[left.id,right.id]}}};
  assert.equal(matchItems(items,[{title:left.title,mediaType:'book',authors:['Writer']}],reviewed)[0].owned,true);
}]);
commonMatchingPolicyTests.push(['excluded provider ISBN hits cannot suppress an external full-title match',()=>{
  const excluded=normalizeProviderItem({provider:'humble',providerItemId:'excluded',title:'Shared Comic Title',mediaType:'book',ownership:'owned',metadata:{isbn:'9780306406157'}});
  const external=normalizeProviderItem({provider:'fanatical',providerItemId:'external',title:'Shared Comic Title',mediaType:'book',ownership:'owned'});
  const result=matchItems({[excluded.id]:excluded,[external.id]:external},[{title:'Shared Comic Title',mediaType:'book',identifiers:{isbn:'9780306406157'},excludeProviders:['humble']}])[0];
  assert.equal(result.owned,true);
  assert.equal(result.matches.length,1);
  assert.equal(result.matches[0].provider,'fanatical');
}]);
commonMatchingPolicyTests.push(['HB, FAN and GL agree on shared policy behavior and matching outcomes',async()=>{
  const policies=[['GL',globalThis.LibraryMatchingPolicy]];
  const sorted=rows=>[...rows].sort((a,b)=>a.label.localeCompare(b.label));
  for(const [code,data]of [['../../HB/shared.js','../../HB/tests/common-matching-cases.json'],['../../Fanatical/src/shared.js','../../Fanatical/tests/common-matching-cases.json']]){
    const path=new URL(code,import.meta.url);if(!existsSync(path))continue;
    const source=readFileSync(path,'utf8'),context=vm.createContext({});
    vm.runInContext(source.slice(source.indexOf('// BEGIN SHARED MATCHING POLICY'),source.indexOf('// END SHARED MATCHING POLICY')),context);
    policies.push([code,context.LibraryMatchingPolicy]);
    assert.deepEqual(sorted(JSON.parse(readFileSync(new URL(data,import.meta.url),'utf8'))),sorted(cases),'Shared case content must agree; formatting and order need not.');
    const {fixture}=await import(new URL(code.startsWith('../../HB')?'../../HB/tests/matching-fixture.mjs':'../../Fanatical/tests/matching-fixture.mjs',import.meta.url));
    for(const row of cases.filter(row=>!row.fanOnly||code.includes('Fanatical'))){
      const result=await fixture(row.records,row.media??'book',row.offer).classify();
      assert.equal(result.match.state,row.expected,code+': '+row.label);
    }
  }
  const observations=policy=>cases.flatMap(row=>{
    const kind=row.media??'book',kinds=kind==='book'?['book','comic']:[kind];
    return kinds.flatMap(kind=>row.records.map(record=>({
      offered:policy.presentationTitle(row.offer.title,kind),stored:policy.ownershipTitleKeys(record.title,kind),
      installmentConflict:policy.gameInstallmentConflict(row.offer.title,record.title,kind),exact:policy.fullTitleMatches(row.offer.title,record.title,kind),revision:policy.revisionWordingConflict(row.offer.title,record.title,kind),
      offeredParts:policy.revisionTitleParts(row.offer.title,kind),storedParts:policy.revisionTitleParts(record.title,kind),
      related:Boolean(policy.relatedPresentationReason(row.offer.title,record.title,kind)),
      collection:policy.numberedCollectionRelation(row.offer.title,record.title,kind)===null?null:Boolean(policy.numberedCollectionRelation(row.offer.title,record.title,kind))
    })));
  });
  for(const [name,policy]of policies){assert.deepEqual(JSON.parse(JSON.stringify(observations(policy))),JSON.parse(JSON.stringify(observations(policies[0][1]))),name+' shared policy outcomes');checkFormatPresentation(policy);}
}]);

function checkFormatPresentation(policy) {
  const p = (title, kind = 'book') => policy.presentationTitle(title, kind);
  assert.equal(p('FREE AGENTS TP VOL 01 (Digital)'), p('FREE AGENTS, VOL. 1'));
  assert.equal(p('FREE AGENTS TPB VOLUME 001 (Digital)'), p('FREE AGENTS, VOL. 1'));
  assert.equal(p('FREE AGENTS TP VOL 01 (Digital)','comic'),p('FREE AGENTS, VOL. 1','book'));
  assert.equal(policy.revisionWordingConflict('Algorithmic Thinking','Algorithmic Thinking, 2nd Edition','comic'),true);
  assert(policy.numberedCollectionRelation('Astro City Vol. 1','Astro City Vol. 1: Another Story','comic'));
  for (const [left,right,kind] of [
    ['The Room','Room','book'], ['The Room Vol. 1','Room Vol. 1','book'],
    ['The Complete Guide Vol. 1','Complete Guide Vol. 1','book'],
    ['The Autumnlands Vol. 1','Autumnlands Vol. 1','game'],
    ['Autumnlands and The Visitors Vol. 1','Autumnlands and Visitors Vol. 1','book'],
    ['Project 01','Project 1','book'], ['Series #01','Series #1','book'],
    ['Series Book 01','Series Book 1','book'], ['Series Vol. 01.5','Series Vol. 1.5','book'],
    ['Series Vol. 01/2','Series Vol. 1/2','book'], ['Digital Agents','Agents','book'],
    ['Agents Digital','Agents','book'], ['Agents TP Stories Vol. 1','Agents Stories Vol. 1','book'],
    ['Agents TP VOL 01 (Digital)','Agents Vol. 1','game'],
    ['Agents Vol. 01','Agents Vol. 1','software'],
    ['Agents Vol. 1: Revised Edition','Agents Vol. 1','book'],
    ['Agents Vol. 1: Another Story','Agents Vol. 1','book']
  ]) assert.notEqual(p(left,kind),p(right,kind),left+' must keep meaningful information');
}

commonMatchingPolicyTests.push(['format presentation normalizes only delivery labels and labeled whole volumes', () => {
  checkFormatPresentation(globalThis.LibraryMatchingPolicy);
}]);
commonMatchingPolicyTests.push(['format identity cannot invent permanent ownership', () => {
  for (const [libraryTitle,offeredTitle] of [['FREE AGENTS, VOL. 1','FREE AGENTS TP VOL 01 (Digital)'],['The Autumnlands Vol. 1','AUTUMNLANDS, VOL. 1 TP (Digital)']]) for (const ownership of ['unknown','borrowed','subscription']) {
    const item = normalizeProviderItem({provider:'kindle',providerItemId:'format-access',
      title:libraryTitle,mediaType:'book',ownership});
    const result = matchItems({[item.id]:item},[{title:offeredTitle,mediaType:'book'}])[0];
    assert.equal(result.owned,false,ownership);
    assert.equal(result.matches[0].relationship,'same-edition');
    assert.equal(item.ownership,ownership);
  }
}]);
commonMatchingPolicyTests.push(['software identity keeps release/tier differences through media labels and preserves canonical ownership evidence',()=>{
  for(const mediaType of ['book','game','software'])for(const [left,right]of [
    ['Forest Builder Pro 2025','Forest Builder Pro 2026'],
    ['Forest Builder Pro v2','Forest Builder Pro v3'],
    ['Forest Builder Pro Standard Edition','Forest Builder Pro Enterprise Edition']
  ]){
    assert.equal(globalThis.LibraryMatchingPolicy.fullTitleMatches(left,right,mediaType),false);
    const items=[left,right].map((title,i)=>normalizeProviderItem({provider:'humble',providerItemId:'media-safety-'+i,title,mediaType,ownership:i?'unknown':'owned'}));
    const records=Object.fromEntries(items.map(item=>[item.id,item])),before=JSON.stringify(records);
    assert.equal(Object.keys(rebuildCanonicalItems(records)).length,2);
    assert.equal(matchItems(records,[{title:right,mediaType}])[0].owned,false,'Neither a related owned release nor an exact unknown record establishes ownership');
    assert.equal(JSON.stringify(records),before);
  }
}]);

commonMatchingPolicyTests.push(['game installment barrier rejects fallback and alias candidates without suppressing valid matches',()=>{
  const wrong=normalizeProviderItem({provider:'steam',providerItemId:'wrong-sequel',title:'Cat Quest II',mediaType:'game',ownership:'owned'});
  const valid=normalizeProviderItem({provider:'gog',providerItemId:'right-sequel',title:'Cat Quest III',mediaType:'game',ownership:'owned'});
  const items={[wrong.id]:wrong,[valid.id]:valid};
  const context={titleAliases:{[wrong.recordRef]:{titles:['Cat Quest III']}}};
  const result=matchItems(items,[{title:'Cat Quest III',mediaType:'game'}],context)[0];
  assert.equal(result.owned,true);
  assert.deepEqual(result.matches.map(record=>record.title),['Cat Quest III']);
  assert.equal(result.possibleMatches.length,0);
  for(const [title,stored]of [['Cat Quest III','Cat Quest II'],['Cat Quest II','Cat Quest III'],['Portal','Portal 2']]){
    const item={...wrong,title,normalizedTitle:title.toLowerCase()};
    const response=matchItems({[item.id]:item},[{title:stored,mediaType:'game'}])[0];
    assert.equal(response.owned,false);assert.equal(response.matches.length,0);assert.equal(response.possibleMatches.length,0);
  }
  assert.equal(globalThis.LibraryMatchingPolicy.gameInstallmentConflict('Final Fantasy VII','Final Fantasy VII Remake','game'),false);
}]);
