import test from 'node:test';
import assert from 'node:assert/strict';
import {fanaticalRejectedPurchaseItems as canonical} from '../shared/provider-acquisition-contract.js';
import {fanaticalRejectedPurchaseItems as mirror} from '../../Fanatical/src/acquisition-contract.mjs';

const record=()=>({sourceItemId:'synthetic-rejected',title:'Synthetic promotion',sourceBundle:'Synthetic bundle',bundle:{sourceItemId:'synthetic-bundle',title:'Synthetic bundle',slug:'synthetic-bundle'},purchaseDate:'2026-11-01',reason:'Promotional content',delivery:'external-key',streaming:false,formats:['pdf']});

for(const [name,parse]of [['canonical',canonical],['FAN mirror',mirror]]){
  test(name+': rejected diagnostics reconstruct only allowed fields without reading unknown properties',()=>{
    const expected=record(),input=record();let reads=0;
    for(const object of [input,input.bundle,input.formats]){
      Object.defineProperty(object,'key',{enumerable:true,get(){reads++;throw Error('Must not read key values');}});
      object.credentials={token:'SYNTHETIC_SENTINEL'};
    }
    const output=parse([input]);assert.deepEqual(output,[expected]);assert.equal(reads,0);
    assert.notEqual(output[0],input);assert.notEqual(output[0].bundle,input.bundle);assert.notEqual(output[0].formats,input.formats);
    assert(!JSON.stringify(output).includes('SYNTHETIC_SENTINEL'));
    assert.deepEqual(parse([{sourceItemId:'legacy-promo',title:'Legacy promotion',reason:'Promotional'}]),[{sourceItemId:'legacy-promo',title:'Legacy promotion',reason:'Promotional'}]);
    const polluted=JSON.parse('{"sourceItemId":"synthetic-rejected","title":"Synthetic","__proto__":{"token":"SYNTHETIC_SENTINEL"}}');
    assert.deepEqual(parse([polluted]),[{sourceItemId:'synthetic-rejected',title:'Synthetic'}]);
  });
  test(name+': rejected diagnostics reject invalid field types, excessive bounds, accessors and nested payloads',()=>{
    for(const change of [
      {sourceItemId:''},{sourceItemId:'x'.repeat(129)},{title:'x'.repeat(501)},
      {title:{key:'SYNTHETIC_SENTINEL'}},{sourceBundle:[]},{reason:{}},{delivery:42},
      {purchaseDate:'invalid'},{purchaseDate:0},{streaming:'true'},
      {formats:Array(31).fill('pdf')},{formats:['x'.repeat(41)]},{formats:[{}]},
      {bundle:[]},{bundle:{sourceItemId:'id',title:{token:'SYNTHETIC_SENTINEL'}}},
      {bundle:{sourceItemId:'id',title:'Bundle',slug:'x'.repeat(301)}}
    ])assert.throws(()=>parse([{...record(),...change}]),/Invalid Fanatical rejected purchase/);
    for(const input of [null,{},[null],new Array(1),Array(50001).fill(record())])assert.throws(()=>parse(input));
    const accessor=record();Object.defineProperty(accessor,'title',{get(){throw Error('Accessor executed');}});
    assert.throws(()=>parse([accessor]),/Invalid Fanatical rejected purchase/);
    const array=record();Object.defineProperty(array.formats,'0',{get(){throw Error('Accessor executed');}});
    assert.throws(()=>parse([array]),/Invalid Fanatical rejected purchase/);
    assert.throws(()=>parse([Object.assign(Object.create({foreign:true}),record())]));
    const nullable=record();nullable.purchaseDate=null;assert.equal(parse([nullable])[0].purchaseDate,null);
  });
}
