import {localMetadataFromFile} from '../lib/local-metadata.js';
import {identityEvidence,validIsbn} from '../lib/identity.js';

export function createLocalMetadataTools(records,actions){
  const root=document.createElement('details');root.className='local-metadata-tools';const heading=document.createElement('summary');heading.textContent='Local metadata and publisher evidence';root.append(heading);let ready=false;
  root.addEventListener('toggle',()=>{if(!root.open||ready)return;ready=true;
    const status=document.createElement('p');status.setAttribute('role','status');
    const queue=async candidate=>{await actions.queue({recordRefs:records.map(record=>record.recordRef),source:'localMetadata',status:'candidates',title:records[0].title,reason:'Local/source proposal: confirm the edition before applying.',candidates:[candidate]});actions.refresh();};
    const label=document.createElement('label');label.textContent='Choose ComicInfo.xml, an EPUB, or extracted OPF metadata. Files stay in this browser. ';
    const file=document.createElement('input');file.type='file';file.accept='.xml,.epub,.opf';file.setAttribute('aria-label','Local comic or EPUB metadata');label.append(file);root.append(label);
    file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected)return;file.disabled=true;try{await queue(await localMetadataFromFile(selected));}catch(error){status.textContent=`Metadata import failed: ${error.message}`;}finally{file.value='';file.disabled=false;}});
    const evidence=identityEvidence(records[0]);
    const editionLookup=document.createElement('button');editionLookup.type='button';editionLookup.textContent='Find Open Library edition by ISBN';editionLookup.disabled=!evidence.isbn.length;
    editionLookup.addEventListener('click',async()=>{
      editionLookup.disabled=true;
      try{const response=await chrome.runtime.sendMessage({type:'SEARCH_OPEN_LIBRARY_EDITION',isbn:evidence.isbn[0]});if(!response?.ok)throw new Error(response?.error??'Edition lookup failed.');await queue(response.candidate);}
      catch(error){status.textContent=error.message;try{await actions.queue({recordRefs:records.map(record=>record.recordRef),source:'localMetadata',status:'failed',title:records[0].title,reason:'Open Library edition lookup failed. Review the library item to retry its ISBN lookup.',candidates:[]});actions.refresh();}catch(failure){status.textContent=failure.message;}}
      finally{editionLookup.disabled=false;}
    });root.append(editionLookup);
    const explanation=document.createElement('p');explanation.textContent='Paste edition metadata or a Collects statement from the publisher. Nothing is applied until you review the queued proposal.';root.append(explanation);
    const inputs={};
    for(const [field,title]of Object.entries({title:'Edition title on source',sourceUrl:'Publisher source page URL',authors:'Writers/authors (semicolon separated)',publisher:'Publisher',isbn:'ISBN',series:'Series',volume:'Volume number (if stated)',issue:'Issue number (if stated)',run:'Run / series volume (if stated)',language:'Language (if stated)',statement:'Original contents statement or description'})){
      const label=document.createElement('label');label.textContent=title;const input=document.createElement(field==='statement'?'textarea':'input');input.setAttribute('aria-label',title);input.maxLength=field==='statement'?10000:500;if(field==='sourceUrl')input.type='url';label.append(input);root.append(label);inputs[field]=input;
    }
    const publisher=document.createElement('button');publisher.type='button';publisher.textContent='Queue publisher evidence';publisher.addEventListener('click',async()=>{
      try{
        const value=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()]));let url;try{url=new URL(value.sourceUrl);}catch{throw new Error('Enter the publisher source page URL.');}
        if(!value.title||!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Enter an edition title and an HTTP(S) publisher page.');
        const isbn=validIsbn(value.isbn);if(value.isbn&&!isbn)throw new Error('The ISBN checksum is invalid.');
        await queue({...value,source:'publisher',sourceUrl:`${url.origin}${url.pathname}`,sourceId:`${url.origin}${url.pathname}`,authors:value.authors.split(/\s*;\s*/u).filter(Boolean),isbn:isbn?[isbn]:[],series:value.series?[value.series]:[],unitType:value.volume?'volume':value.issue?'issue':'',approved:false,matchBasis:'publisher-evidence-proposal',retrievedAt:new Date().toISOString()});
      }catch(error){status.textContent=error.message;}
    });root.append(publisher,status);
  });return root;
}
