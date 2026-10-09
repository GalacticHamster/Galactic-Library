import {identityEvidence} from '../lib/identity.js';
import {formatDate,accountLabel} from './formatters.js';
const labels={publisher:'Publisher',publicationDate:'Publication date',language:'Language',isbn13:'ISBN-13',isbn10:'ISBN-10',pageCount:'Print length',series:'Series',edition:'Edition',fileSize:'File size',guidedView:'Guided View',enhancedTypesetting:'Enhanced typesetting',xRay:'X-Ray',wordWise:'Word Wise',pageFlip:'Page Flip',accessibility:'Accessibility',asin:'ASIN'};
const bibliographic=['publisher','publicationDate','language','isbn13','isbn10','pageCount','series','edition'];
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function productDetailsView(record){
 const evidence=record.metadata?.enrichment?.kindleProductComicContents?.productDetailsEvidence;if(record.provider!=='kindle'||!evidence)return null;
 const identity=identityEvidence(record),existing={publisher:identity.publisher,language:identity.language,series:identity.series,edition:identity.edition,isbn13:identity.isbn,isbn10:identity.isbn,publicationDate:record.metadata?.publicationDate};
 const facts=[];for(const field of bibliographic){const entries=evidence.observations.filter(o=>o.field===field),values=[...new Set(entries.map(o=>o.value).filter(Boolean))];if(!values.length)continue;
  const saved=Array.isArray(existing[field])?existing[field]:existing[field]?[existing[field]]:[];
  if(!field.startsWith('isbn')&&values.length===1&&saved.includes(values[0]))continue;
  facts.push({field,label:labels[field],values,existing:saved,conflict:values.length>1||saved.length>0&&!values.every(v=>saved.includes(v))});
 }
 return {evidence,facts,associationConflict:evidence.observations.some(o=>o.field==='asin'&&o.value&&o.value!==evidence.asin)};
}
export function createProductDetails(records,database){
 const views=records.map(record=>({record,view:productDetailsView(record)})).filter(o=>o.view);if(!views.length)return null;
 const section=text('section','');section.className='product-details';section.append(text('h3','Product details'));
 section.append(text('p','Observed on Amazon Kindle product pages. These fields do not change your saved edition, ownership or matching.'));
 for(const {record,view}of views){section.append(text('strong',accountLabel(record,database)));
  if(view.associationConflict)section.append(text('p','Amazon reported a different ASIN in Product Details. Check the source before using these observations.'));
  const list=text('dl','');list.className='item-catalog-facts';
  for(const fact of view.facts){list.append(text('dt','Amazon page '+fact.label));const value=text('dd',fact.values.map(v=>fact.field==='pageCount'?v+' pages':v).join(' \u00b7 '));if(fact.conflict)value.append(text('small',fact.existing.length?' Saved edition: '+fact.existing.join(' \u00b7 ')+'. The page describes a different or unverified value.':' The page reports several values; none has been selected as your edition.'));list.append(value);}
  section.append(list);
  if(view.facts.some(f=>f.field.startsWith('isbn')))section.append(text('small','Amazon page ISBN: unverified edition relationship. A valid checksum does not confirm that this ISBN describes your Kindle copy; it may describe a print edition.'));
  const source=text('details','');source.append(text('summary','Amazon source evidence and technical details'));const link=text('a','Amazon product page');link.href=view.evidence.sourceUrl;link.target='_blank';link.rel='noreferrer noopener';source.append(link,text('p','Product ASIN: '+view.evidence.asin));
  for(const entry of view.evidence.observations){source.append(text('p',`${labels[entry.field]}: ${entry.raw}`),text('small',`${entry.status}; ${entry.selector}${entry.capturedAt?'; captured '+formatDate(entry.capturedAt):''}`));if(entry.url){const series=text('a','Series on Amazon');series.href=entry.url;series.target='_blank';series.rel='noreferrer noopener';source.append(series);}}
  section.append(source);
 }return section;
}
