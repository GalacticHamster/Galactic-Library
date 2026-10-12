import {collectionOverlap} from '../lib/collection-overlap.js';
// UI-only worker: no storage, acquisition, remote requests or mutation API.
globalThis.onmessage=event=>{
  try{globalThis.postMessage({result:collectionOverlap(event.data)});}
  catch(error){globalThis.postMessage({error:error.message});}
};
