import {collectionOverlap} from '../lib/collection-overlap.js';
import {comicCoverageForLibrary} from './comic-coverage-projection.js';
// UI-only worker: no storage, acquisition, remote requests or mutation API.
globalThis.onmessage=event=>{
  try{globalThis.postMessage({result:event.data.mode==='comic-coverage'?comicCoverageForLibrary(event.data.database):collectionOverlap(event.data)});}
  catch(error){globalThis.postMessage({error:error.message});}
};
