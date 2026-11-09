// Isolated test-only substitution. Never generates or overwrites a runtime mirror.
const original=new URL('../../Fanatical/src/order-importer.mjs',import.meta.url).href;
const candidate=new URL('../shared/fanatical-acquisition.js',import.meta.url).href;
export async function resolve(specifier,context,nextResolve){
  const result=await nextResolve(specifier,context);
  return result.url===original?{url:candidate,shortCircuit:true}:result;
}
