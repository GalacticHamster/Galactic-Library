import {validIsbn} from './identity.js';
import {zipMetadataReader} from './zip-metadata.js';
import '../providers/kindle-ownership.js';
import '../providers/kindle.js';

function xmlDocument(text){
  if(typeof text!=='string'||text.length>1024*1024||/<!DOCTYPE|<!ENTITY/iu.test(text))throw new Error('Choose metadata XML under 1 MB without DTDs or entities.');
  const document=new DOMParser().parseFromString(text,'application/xml');if(document.querySelector('parsererror'))throw new Error('Malformed metadata XML.');return document;
}
const nodes=(root,name)=>[...root.getElementsByTagName('*')].filter(node=>node.localName===name);
const value=(root,name)=>nodes(root,name)[0]?.textContent.trim()??'';
const names=value=>[...new Set(value.split(/\s*[,;]\s*/u).filter(Boolean))].slice(0,50);
const statement=value=>globalThis.GalacticKindle.explicitCollectsStatement(value);

export function parseLocalMetadata(text,format='comicinfo'){
  const document=xmlDocument(text);let result;
  if(format==='comicinfo'){
    if(document.documentElement.localName!=='ComicInfo')throw new Error('Expected ComicInfo.xml.');
    const series=value(document,'Series');const number=value(document,'Number');const manga=/^Yes/iu.test(value(document,'Manga'));const run=value(document,'Volume');
    const contributors=['Writer','Penciller','Inker','Colorist','Letterer','CoverArtist','Editor','Translator'].flatMap(role=>names(value(document,role)).map(name=>({name,role:role.toLowerCase()})));
    result={source:'comicinfo',title:value(document,'Title')||`${series}${number?` ${manga?'Vol.':'#'} ${number}`:''}`,series:series?[series]:[],authors:names(value(document,'Writer')),contributors,publisher:value(document,'Publisher'),language:value(document,'LanguageISO'),run,unitType:number?(manga?'volume':'issue'):'',...(manga?{volume:number}:{issue:number}),isbn:[validIsbn(value(document,'GTIN'))].filter(Boolean),format:value(document,'Format'),categories:[...(manga?['Manga']:[]),...names(value(document,'Genre'))],statement:statement(value(document,'Summary'))};
  }else{
    if(document.documentElement.localName!=='package')throw new Error('Expected an EPUB OPF package document.');
    const metadata=nodes(document,'metadata')[0];if(!metadata)throw new Error('EPUB has no package metadata.');
    const dc=name=>nodes(metadata,name).filter(node=>node.namespaceURI==='http://purl.org/dc/elements/1.1/');
    const metas=nodes(metadata,'meta');const collection=metas.find(node=>node.getAttribute('property')==='belongs-to-collection');
    const series=collection?.textContent.trim()||metas.find(node=>node.getAttribute('name')==='calibre:series')?.getAttribute('content')||'';
    const collectionRef=collection?.id?`#${collection.id}`:'';
    const position=metas.find(node=>node.getAttribute('property')==='group-position'&&collectionRef&&node.getAttribute('refines')===collectionRef)?.textContent.trim()||metas.find(node=>node.getAttribute('name')==='calibre:series_index')?.getAttribute('content')||'';
    const volume=/^\d+$/u.test(position)?position:'';
    const titleNodes=dc('title');const main=titleNodes.find(node=>metas.some(meta=>meta.getAttribute('refines')===`#${node.id}`&&meta.getAttribute('property')==='title-type'&&meta.textContent.trim()==='main'))??titleNodes[0];
    const creators=dc('creator');const contributors=creators.map(node=>({name:node.textContent.trim(),role:node.getAttributeNS('http://www.idpf.org/2007/opf','role')||metas.find(meta=>node.id&&meta.getAttribute('refines')===`#${node.id}`&&meta.getAttribute('property')==='role')?.textContent.trim()||'author'}));
    result={source:'epub',title:main?.textContent.trim()??'',authors:contributors.filter(entry=>['author','aut'].includes(entry.role)).map(entry=>entry.name),contributors,publisher:dc('publisher')[0]?.textContent.trim()??'',language:dc('language')[0]?.textContent.trim()??'',isbn:[...new Set(dc('identifier').map(node=>validIsbn(node.textContent.replace(/^urn:isbn:/iu,''))).filter(Boolean))],series:series?[series]:[],volume,unitType:volume?'volume':'',publishedDate:dc('date')[0]?.textContent.trim()??'',categories:dc('subject').map(node=>node.textContent.trim()),statement:statement(dc('description')[0]?.textContent??'')};
  }
  if(!result.title)throw new Error('Metadata needs a title or ComicInfo series/number.');return {...result,approved:false,matchBasis:'local-metadata-proposal'};
}

export async function localMetadataFromFile(file){
  if(!file||!Number.isSafeInteger(file.size))throw new Error('Choose a local metadata file.');let xml;let format;
  if(/\.epub$/iu.test(file.name)){
    const read=await zipMetadataReader(file);const container=xmlDocument(await read('META-INF/container.xml'));
    const path=nodes(container,'rootfile')[0]?.getAttribute('full-path');if(!path)throw new Error('EPUB container has no package path.');xml=await read(path);format='epub';
  }else{if(file.size>1024*1024)throw new Error('Choose an XML/OPF file under 1 MB.');xml=await file.text();format=/\.opf$/iu.test(file.name)?'epub':'comicinfo';}
  const candidate=parseLocalMetadata(xml,format);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
  return {...candidate,sourceId:[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),fileName:String(file.name).slice(0,300),retrievedAt:new Date().toISOString()};
}
