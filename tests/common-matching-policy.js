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
