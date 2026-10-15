import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createEmptyDatabase,normalizeProviderItem} from '../src/lib/models.js';
import {validIsbn} from '../src/lib/identity.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';

const rows=JSON.parse(readFileSync(new URL('./revision-matching-cases.json',import.meta.url),'utf8'));
const variants=row=>row.editions?[
  [{},{}], [{authors:['Alan Moore']},{authors:['Alan Moore']}],
  [{authors:['Alan Moore']},{authors:['A. Moore']}],
  [{isbn:'9780306406157'},{isbn:'9780306406157'}],
  [{isbn:'9780306406157'},{isbn:'9780140328721'}]
]:[[{},{}]];
const run=(records,offer,media='book',policy={allOwned:false,providers:{}})=>{
  const items=records.map((item,index)=>normalizeProviderItem({provider:'kindle',providerItemId:'revision-'+index,
    title:item.title,mediaType:media,ownership:item.ownership??'owned',metadata:item}));
  const database={...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item])),ownershipPolicy:policy};
  const isbns=[offer.isbn].flat().map(validIsbn).filter(Boolean);
  const request={...offer,mediaType:media,...(isbns.length?{identifiers:{isbn:isbns}}:{})};
  const before=JSON.stringify(database);
  const result=handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items:[request]});
  assert.equal(result.ok,true);assert.equal(JSON.stringify(database),before,'Matching must retain original evidence');
  return result.results[0];
};
export const revisionMatchingTests=rows.map(row=>['revision contract: '+row.label,()=>{
  for(const [left,right] of [[row.owned,row.offered],[row.offered,row.owned]])for(const [a,b] of variants(row)){
    const owned={...left,...a},offered={...right,...b};
    for(const duplicates of [1,2])for(const allOwned of [false,true]){
      const result=run(Array.from({length:duplicates},()=>owned),offered,row.media,{allOwned,providers:{}});
      assert.equal(result.owned?'owned':result.matches.length||result.possibleMatches.length?'possible':'new',row.expected,JSON.stringify({owned,offered,allOwned,duplicates}));
      if(row.expected==='possible'){assert.equal(result.matches.length,0);assert.ok(result.possibleMatches.some(item=>item.title===owned.title));}
    }
  }
}]);
revisionMatchingTests.push(['revision contract: identity confidence is independent of ownership and overridden access',()=>{
  for(const ownership of ['owned','claimed','unknown','subscription','borrowed','rental'])for(const policy of [
    {allOwned:false,providers:{}},{allOwned:true,providers:{}},{allOwned:false,providers:{kindle:true}}
  ]){
    const record={title:'The Hobbit',ownership,authors:['J. R. R. Tolkien']};
    const result=run([record],{title:record.title},'book',policy);
    assert.equal(result.matches.length,1);assert.equal(result.possibleMatches.length,0);assert.equal(result.confidence,1);assert.equal(result.matches[0].relationship,'same-edition');
    const overridden=policy.allOwned||policy.providers.kindle;
    assert.equal(result.owned,Boolean(overridden)||['owned','claimed'].includes(ownership));
    assert.equal(result.matches[0].ownership,overridden?'owned':ownership);
    if(overridden)assert.equal(result.matches[0].evidence.observedOwnership,ownership);
    const possible=run([record],{title:record.title+', Revised'},'book',policy);
    assert.equal(possible.owned,false);assert.equal(possible.matches.length,0);assert.equal(possible.possibleMatches.length,1);
  }
}]);
revisionMatchingTests.push(['revision contract: three repos retain the same permanent regression matrix',()=>{
  const semantic=value=>JSON.parse(value).sort((a,b)=>a.label.localeCompare(b.label));
  const own=semantic(readFileSync(new URL('./revision-matching-cases.json',import.meta.url),'utf8'));
  for(const project of ['HB','Fanatical']){
    const path=new URL('../../'+project+'/tests/revision-matching-cases.json',import.meta.url);
    if(existsSync(path))assert.deepEqual(semantic(readFileSync(path,'utf8')),own);
  }
}]);
