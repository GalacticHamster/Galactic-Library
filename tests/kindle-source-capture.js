import {readFile} from 'node:fs/promises';
import {checkKindleSourceCapture} from './kindle-source-capture-fixture.js';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle-source-capture.json',import.meta.url),'utf8'));
// Minimal tree for these sanitized fragments. Real DOMParser runs the same
// checks in packaged Chrome and Firefox importer suites, independently.
function fragmentDocument(html){
 const root={nodeType:1,tagName:'BODY',childNodes:[]},stack=[root];
 for(const token of html.matchAll(/<[^>]+>|[^<]+/gu)){
  const text=token[0];if(text.startsWith('</')){stack.pop();continue;}
  if(text.startsWith('<')){const tag=/^<([a-z0-9]+)/iu.exec(text)?.[1];if(!tag)continue;const node={nodeType:1,tagName:tag.toUpperCase(),childNodes:[]};stack.at(-1).childNodes.push(node);if(tag!=='br')stack.push(node);}
  else stack.at(-1).childNodes.push({nodeType:3,nodeValue:text.replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&amp;/gu,'&')});
 }
 return {querySelectorAll:selector=>selector==='#bookDescription_feature_div'?root.childNodes:[]};
}
export const kindleSourceCaptureTests=[['source generation 5: captured HTML through actual writer, backup and owned indexing',()=>checkKindleSourceCapture(fixtures,fragmentDocument)]];
