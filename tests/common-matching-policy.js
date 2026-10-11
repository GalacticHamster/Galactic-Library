import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
commonMatchingPolicyTests.push(['HB, FAN and GL ship identical shared identity rules and decision fixtures',()=>{
  const common=readFileSync(new URL('../src/lib/matching-policy.js',import.meta.url),'utf8').replace(/\r\n/g,'\n').trim();
  const fixture=readFileSync(new URL('./common-matching-cases.json',import.meta.url),'utf8').trim();
  for(const [code,data]of [['../../HB/shared.js','../../HB/tests/common-matching-cases.json'],['../../Fanatical/src/shared.js','../../Fanatical/tests/common-matching-cases.json']]){
    const path=new URL(code,import.meta.url);if(!existsSync(path))continue;
    const source=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
    assert.equal(source.slice(source.indexOf('// BEGIN SHARED MATCHING POLICY'),source.indexOf('// END SHARED MATCHING POLICY')+'// END SHARED MATCHING POLICY'.length).trim(),common);
    assert.equal(readFileSync(new URL(data,import.meta.url),'utf8').trim(),fixture);
  }
}]);

function checkFormatPresentation(policy) {
  const p = (title, kind = 'book') => policy.presentationTitle(title, kind);
  assert.equal(p('FREE AGENTS TP VOL 01 (Digital)'), p('FREE AGENTS, VOL. 1'));
  assert.equal(p('FREE AGENTS TPB VOLUME 001 (Digital)'), p('FREE AGENTS, VOL. 1'));
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
