// Gate 5A explicit source overlay: actual engine and validator are siblings of
// the generated guarded worker. No active runtime file is overwritten.
import {pathToFileURL} from 'node:url';
const original=new URL('../../Fanatical/src/order-importer.mjs',import.meta.url).href;
export async function resolve(specifier,context,nextResolve){
  const result=await nextResolve(specifier,context);
  if(result.url!==original)return result;
  if(!process.env.FAN_WORKER_TEST_OVERLAY)throw Error('Complete worker source overlay is required');
  const root=pathToFileURL(process.env.FAN_WORKER_TEST_OVERLAY.replace(/[\\/]?$/u,'/'));
  return {url:new URL('order-importer.mjs',root).href,shortCircuit:true};
}
