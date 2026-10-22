import assert from 'node:assert/strict';
import {identicalCapture,sourceDifference,sourceHistory} from '../src/lib/source-history.js';
const source={source:'amazon-product-page',sourceUrl:'https://www.amazon.com/dp/B000000001',statement:'Collects Example #1-6',parserVersion:5,checkedAt:'2026-10-01T00:00:00Z'};
export const sourceHistoryTests=[
 ['source capture equivalence preserves all evidence except known retrieval bookkeeping',()=>{
  assert.ok(identicalCapture(source,{...source,checkedAt:'2026-10-02T00:00:00Z',selectionRef:'later'}));
  for(const change of [{statement:source.statement+'!'},{statement:'Collects Example #1-7'},{source:'other-provider'},{sourceUrl:'https://www.amazon.com/dp/B000000002'},{parserVersion:6},{approved:true},{manifest:{blocks:[]}}])assert.equal(identicalCapture(source,{...source,...change}),false);
  assert.match(sourceDifference(source,{...source,statement:source.statement+'!'}),/Only final sentence punctuation/);
  assert.match(sourceDifference(source,{...source,statement:'Collects Example #1-7'}),/statement changed/);
  assert.match(sourceDifference(source,{...source,sourceUrl:'other'}),/Different source/);
 }],
 ['source history sorts event instants before pagination, with deterministic ties and unknown dates last',()=>{
  const rows={};for(let n=0;n<100;n++)rows['id'+String(n).padStart(3,'0')]={recordRef:'book',changedAt:new Date(Date.UTC(2026,9,1,0,n)).toISOString(),previous:{checkedAt:'2030-01-01'}};
  rows.z={recordRef:'book',changedAt:'2026-10-01T02:00:00+02:00'};rows.a={recordRef:'book',changedAt:'2026-10-01T00:00:00Z'};rows.missing={recordRef:'book'};rows.invalid={recordRef:'book',changedAt:'invalid'};rows.other={recordRef:'other',changedAt:'2030-01-01'};
  const db={enrichmentHistory:rows},before=JSON.stringify(db),sorted=sourceHistory(db,'book');
  assert.equal(sorted[0].id,'id099');assert.equal(sorted[20].id,'id079');assert.equal(sorted.at(-1).id,'missing');assert.equal(sorted.at(-2).id,'invalid');assert.ok(sorted.findIndex(x=>x.id==='a')<sorted.findIndex(x=>x.id==='z'));assert.equal(JSON.stringify(db),before);
  const large={enrichmentHistory:Object.fromEntries(Array.from({length:10000},(_,n)=>['id'+n,{recordRef:'book',changedAt:new Date(n*1000).toISOString()}]).reverse())},history=sourceHistory(large,'book');assert.equal(history.length,10000);assert.equal(history[0].id,'id9999');assert.equal(history.slice(9980)[19].id,'id0');
 }]
];
