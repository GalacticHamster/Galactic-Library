import assert from 'node:assert/strict';
import {scenarios,centralResults,book,database,sequel,original,deluxe} from './fixtures/matching/cross-provider-collections.mjs';
import {handleExternalApiRequest} from '../src/lib/external-api.js';
export const crossProviderCollectionTests=[];
const test=(name,run)=>crossProviderCollectionTests.push([name,run]);
const find=(db,title,extra={})=>handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title,mediaType:'book',...extra}]}).results[0];
test('collection discovery exposes exact-series numbered issues without inventing ownership or contents',()=>{
 const s=scenarios().find(s=>s.name==='trees-unknown'),before=JSON.stringify(s.db);
 const r=find(s.db,sequel);
 assert.equal(r.owned,false);assert.equal(r.matches.length,0);assert.equal(r.partialMatches.length,0);
 const issues=r.possibleMatches.filter(m=>m.title.startsWith(sequel+' #'));
 assert.equal(issues.length,2);assert(issues.every(m=>m.ownership==='subscription'&&/membership and completeness are unconfirmed/.test(m.reason)));
 assert.equal(JSON.stringify(s.db),before);assert.equal(find(s.db,original).owned,true);
});
test('related purchased issues alone are Possible, never proof of complete collected ownership',()=>{
 const db=database([book('kindle',sequel+' #1'),book('kindle',sequel+' #2: A synthetic issue subtitle')]);
 const r=find(db,sequel);assert.equal(r.owned,false);assert.equal(r.possibleMatches.length,2);assert.equal(r.partialMatches.length,0);
});
test('explicit series, run, author, unit and annual distinctions remain enforced',()=>{
 const issue=book('kindle',sequel+' #2','owned',{run:'2020',authors:['Writer A']});
 for(const extra of [{issue:'1'},{run:'1990'},{authors:['Writer B']}])assert(!find(database([issue]),sequel,extra).possibleMatches.some(m=>m.itemRef===issue.recordRef));
 const annual=book('kindle',sequel+' Annual #1');const annualResult=find(database([annual]),sequel);
 assert(!annualResult.possibleMatches.some(m=>/Numbered series item/.test(m.reason)));
 const other=book('kindle',original+': Different Sequel #1');
 assert(!find(database([other]),sequel).possibleMatches.some(m=>/Numbered series item/.test(m.reason)));
 const volume=book('kindle','Explicit Series Vol. 2');assert.equal(find(database([volume]),'Explicit Series Vol. 1').owned,false);
});
test('reviewed purchased overlap remains Partial and reviewed temporary access adds no owned coverage',()=>{
 for(const name of ['trees-owned-reviewed-overlap','deluxe-reviewed-overlap','trees-explicit-contents-subscription']){
  const s=scenarios().find(s=>s.name===name),r=centralResults(s.db,s.offers,'humble')[s.offers.at(-1).title];
  assert.equal(r.owned,false);
  if(name.endsWith('subscription'))assert.equal(r.coverage.covered.length,0);
  else {assert.equal(r.coverage.covered.length,1);assert(r.partialMatches.some(m=>m.relationship==='contains'));}
 }
});
test('manual Different works prevents the new issue suggestion through an established query anchor',()=>{
 const anchor=book('kindle',sequel,'subscription'),issue=book('kindle',sequel+' #1','subscription');
 const db=database([anchor,issue],{},{barrier:{itemIds:[anchor.id,issue.id],decision:'different'}});
 assert(!find(db,sequel).possibleMatches.some(m=>m.itemRef===issue.recordRef));
});
test('record-scoped identity preserves providers/accounts/access and public privacy',()=>{
 const a=book('kindle',original,'owned',{}, {profileId:'20000000-0000-4000-8000-000000000001'});
 const b=book('kindle',original,'subscription',{}, {profileId:'20000000-0000-4000-8000-000000000002'});
 const db=database([a,b],{},{review:{itemIds:[a.id,b.id],decision:'same-edition'}}),before=JSON.stringify(db),r=find(db,original);
 assert.equal(r.matches.length,2);assert.equal(new Set(r.matches.map(m=>m.itemRef)).size,2);
 assert.deepEqual(r.matches.map(m=>m.ownership).sort(),['owned','subscription']);
 assert(!JSON.stringify(r).includes('20000000-'));assert.equal(JSON.stringify(db),before);
});
test('generic deluxe overlap remains unresolved rather than an assignment to Book One',()=>{
 const s=scenarios().find(s=>s.name==='deluxe-unknown');
 for(const n of [1,2,3]){const r=find(s.db,deluxe(n));assert.equal(r.owned,false);assert(r.possibleMatches.some(m=>m.title==='30 Days of Night'));}
});
