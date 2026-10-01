import {validIsbn,names} from './identity.js';

export function openLibraryEditionUrl(isbn){const identifier=validIsbn(isbn);if(!identifier)throw new Error('A validated ISBN is required for edition lookup.');return `https://openlibrary.org/isbn/${identifier}.json`;}
export function openLibraryEditionCandidate(value,authors=[]){
  if(!/^\/books\/OL\d+M$/u.test(value?.key??'')||typeof value.title!=='string'||!value.title.trim())throw new Error('Open Library did not return an edition record.');
  const text=value=>typeof value==='string'?value.trim().slice(0,500):'';
  const language=(value.languages??[]).map(entry=>String(entry?.key??'').replace(/^\/languages\//u,'')).find(Boolean)??'';
  const codes={eng:'en',jpn:'ja',fre:'fr',fra:'fr',ger:'de',deu:'de',spa:'es',ita:'it',por:'pt',chi:'zh',zho:'zh',kor:'ko'};
  return {source:'open-library-edition',sourceId:value.key,editionKey:value.key,workKey:(value.works??[]).map(entry=>entry?.key).find(key=>/^\/works\/OL\d+W$/u.test(key??''))??'',sourceUrl:`https://openlibrary.org${value.key}`,title:[text(value.title),text(value.subtitle)].filter(Boolean).join(': '),authors:names(authors),isbn:[...new Set([...names(value.isbn_10),...names(value.isbn_13)].map(validIsbn).filter(Boolean))],publisher:names(value.publishers)[0]??'',publishedDate:text(value.publish_date),pageCount:Number.isInteger(value.number_of_pages)&&value.number_of_pages>=0?value.number_of_pages:null,language:codes[language]??language,edition:text(value.edition_name),statement:'',approved:false,matchBasis:'isbn-edition-lookup',retrievedAt:new Date().toISOString()};
}
