import test from 'node:test';import assert from 'node:assert/strict';
import {acquisitionContract} from '../shared/provider-acquisition-contract.js';
const input={provider:'fanatical',finished:true,verified:['purchase'],coverage:{status:'unverified',evidence:['array']},scope:{authority:'declared-scope'}};
test('acquisition completion is independent of coverage, reconciliation and persistence',()=>{
  const r=acquisitionContract(input);assert.equal(r.acquisition.outcome,'finished');assert.equal(r.coverage.status,'unverified');
  assert.equal(r.reconciliation.authority,'none');assert.equal(r.persistence.outcome,'not-attempted');
});
test('verified coverage still grants no writer authority',()=>assert.equal(acquisitionContract({...input,coverage:{status:'verified',evidence:['count']}}).reconciliation.authority,'none'));
test('unresolved and ineligible purchase identities cannot be promoted to processed evidence',()=>{
  for(const patch of [{unresolved:['purchase']},{ineligible:['purchase']},{finished:false,coverage:{status:'verified'}},{verified:['purchase','purchase']}])assert.throws(()=>acquisitionContract({...input,...patch}));
});
