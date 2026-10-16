import {writeFile} from 'node:fs/promises';
import {outputPath} from './audit-artifacts.mjs';
import {syntheticProviderLibrary,performanceWriter,measuredScan} from '../tests/provider-performance-fixture.js';

const sizes=(process.argv.find(arg=>arg.startsWith('--sizes='))?.slice(8)??'100,1000,5000,10000,20000').split(',').map(Number);
if(sizes.some(size=>!Number.isSafeInteger(size)||size<1||size>20000))throw Error('Sizes must be 1..20000.');
const output=await outputPath(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9),'provider-pipeline.json'),rows=[];
for(const size of sizes){
  const database=syntheticProviderLibrary(size);
  for(let repeat=0;repeat<2;repeat++){
    const harness=performanceWriter(database);
    const items=Object.values(database.providerItems).filter(record=>record.provider==='steam'&&record.profileId===database.providers.steam.activeProfileId);
    const extra={providerItemId:'synthetic-new',title:'Synthetic Added Game',mediaType:'game',ownership:'owned'};
    for(const [workflow,options]of [
      ['quick-cold',{}],['quick-warm',{}],['incremental-change',{items:[extra]}],
      ['full-unchanged',{mode:'full',items:[...items,extra]}],
      ['full-change',{mode:'full',items:[...items.map((record,index)=>index?record:{...record,title:'Synthetic Changed Game',ownership:'revoked'}),extra,{...extra,providerItemId:'second-new',title:'Synthetic Second Addition'}]}],
      ['failed',{fail:true}]
    ])rows.push({size,repeat,workflow,...await measuredScan(harness,options)});
  }
  console.log('Measured',size,'records');
  await writeFile(output,JSON.stringify({format:1,environment:'Node structured-clone storage adapter; provider scan is intentionally zero, not measured network time',rows},null,2));
}
console.log('Wrote',output);
