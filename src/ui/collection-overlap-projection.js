import {collectionOverlapAsync} from '../lib/collection-overlap.js';
// Send only current coverage inputs, not history, queues, credentials or sync
// state. This snapshot is disposable; the worker never changes the database.
export function overlapProjectionInput(database){
  const providerItems=Object.fromEntries(Object.entries(database.providerItems??{}).filter(([,item])=>item.mediaType==='book'));
  const contentReviews=Object.fromEntries(Object.entries(database.contentReviews??{}).filter(([id])=>providerItems[id]));
  const canonicalItems=Object.fromEntries(Object.entries(database.canonicalItems??{}).filter(([,item])=>item.providerItemIds.some(id=>providerItems[id])).map(([id,item])=>[id,{id:item.id,title:item.title,mediaType:item.mediaType,providerItemIds:item.providerItemIds}]));
  return {providerItems,canonicalItems,contentReviews,ownershipPolicy:database.ownershipPolicy,ownershipReviews:database.ownershipReviews,providerProfiles:database.providerProfiles};
}
export async function loadOverlapProjection(database){
  return loadCoverageProjection(database);
}
const committedViews=new WeakMap();
// Ownership reviews and key access can expire without a database mutation.
export function coverageProjectionKey(database,merges={},now=Date.now()){
  const expired=[...Object.values(database.providerItems??{}).map(r=>r.metadata?.expiresAt),...Object.values(database.ownershipReviews??{}).map(r=>r.expiresAt)].filter(value=>value&&Date.parse(value)<=now).length;
  return JSON.stringify(merges)+'|'+expired;
}
export async function loadCoverageProjection(database,mode='overlap',merges={}){
  if(mode!=='comic-coverage')return calculateCoverageProjection(database,mode,merges);
  let views=committedViews.get(database);if(!views){views=new Map();committedViews.set(database,views);}
  const key=coverageProjectionKey(database,merges);if(views.has(key))return views.get(key);
  const pending=calculateCoverageProjection(database,mode,merges).catch(error=>{views.delete(key);throw error;});
  views.set(key,pending);while(views.size>3)views.delete(views.keys().next().value);return pending;
}
async function calculateCoverageProjection(database,mode,merges){
  // Paint the existing loading state before preparing the read-only input.
  await new Promise(resolve=>setTimeout(resolve,0));
  const input=overlapProjectionInput(database);
  if(mode==='comic-coverage'){
    input.providerHistory=database.providerHistory;
    input.manualMatchDecisions=database.manualMatchDecisions;
    input.editionSeparations=database.editionSeparations;
  }
  if(typeof Worker==='undefined')return mode==='comic-coverage'?(await import('./comic-coverage-projection.js')).comicCoverageForLibrary(input,merges):collectionOverlapAsync(input);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./collection-overlap-worker.js',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>finish(new Error('The overlap calculation did not finish. Try again.')),60000);
    const finish=(error,result)=>{clearTimeout(timeout);worker.terminate();error?reject(error):resolve(result);};
    worker.onmessage=event=>finish(event.data.error?new Error(event.data.error):null,event.data.result);
    worker.onerror=event=>finish(new Error(event.message||'The overlap calculation could not start.'));
    try{worker.postMessage(mode==='comic-coverage'?{mode,database:input,merges}:input);}catch(error){finish(error);}
  });
}
