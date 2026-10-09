import {object,text,date} from './validation.js';
import {validIsbn} from './identity.js';
export const PRODUCT_DETAIL_FIELDS=['asin','publisher','publicationDate','language','isbn13','isbn10','pageCount','series','edition','fileSize','guidedView','enhancedTypesetting','xRay','wordWise','pageFlip','accessibility'];
const selectors=['#detailBullets_feature_div','#detailBulletsWrapper_feature_div','#productDetails_detailBullets_sections1','#productDetails_techSpec_section_1','#productDetails_techSpec_section_2','#seriesBulletWidget_feature_div','product-json-ld'];
const rpi=/^#rpi-attribute-book_details-(?:publisher|publication_date|language|isbn13|isbn10|print_length|edition|series_content)$/u;
export function validateProductDetailsEvidence(input){
 object(input,'Product Details');if(input.version!==1)throw Error('Unsupported Product Details version.');
 const asin=text(input.asin,10,'Product ASIN'),sourceUrl=text(input.sourceUrl,100,'Product URL');
 if(!/^[A-Z0-9]{10}$/u.test(asin)||sourceUrl!==`https://www.amazon.com/dp/${asin}`)throw Error('Invalid Product Details association.');
 if(!Array.isArray(input.observations)||!input.observations.length||input.observations.length>40)throw Error('Product Details must have 1?40 observations.');
 const result={version:1,asin,sourceUrl,observations:input.observations.map(entry=>{
  object(entry,'Product observation');const field=text(entry.field,30),label=text(entry.label,100),raw=text(entry.raw,500),value=text(entry.value,500),status=text(entry.status,20),selector=text(entry.selector,100);
  if(!PRODUCT_DETAIL_FIELDS.includes(field)||!label||!raw||!['observed','parsed','unparsed','invalid','valid-checksum'].includes(status)||!selectors.includes(selector)&&!rpi.test(selector))throw Error('Invalid Product Details observation.');
  if(field==='isbn10'||field==='isbn13'){const normalized=raw.toUpperCase().replace(/[\s-]/gu,'');const valid=normalized.length===(field==='isbn10'?10:13)&&validIsbn(normalized);if(valid?value!==normalized||status!=='valid-checksum':value!==''||status!=='invalid')throw Error('Invalid ISBN observation checksum.');}
  if(field==='pageCount'&&value&&(!/^\d+$/u.test(value)||Number(value)<1||Number(value)>1000000))throw Error('Invalid page count.');
  if(field==='publicationDate'&&value){date(value);if(!/^\d{4}-\d{2}-\d{2}$/u.test(value))throw Error('Invalid publication date.');}
  if(field==='asin'&&value&&!/^[A-Z0-9]{10}$/u.test(value))throw Error('Invalid observed ASIN.');
  const observation={field,label,raw,value,status,selector};
  if(entry.url!==undefined){const url=new URL(text(entry.url,500));if(field!=='series'||url.origin!=='https://www.amazon.com'||url.username||url.password||url.search||url.hash||!/^\/(?:dp|gp\/product|kindle-dbs|series)\//u.test(url.pathname))throw Error('Invalid series evidence link.');observation.url=url.href;}
  if(entry.capturedAt!==undefined){observation.capturedAt=date(entry.capturedAt);if(!observation.capturedAt)throw Error('Missing observation timestamp.');}
  return observation;
 })};
 if(input.capturedAt!==undefined){result.capturedAt=date(input.capturedAt);if(!result.capturedAt)throw Error('Missing Product Details timestamp.');}
 return result;
}
const comparable=entries=>JSON.stringify(entries.map(({capturedAt,...rest})=>rest));
/** Missing fields retain their original timestamps. A changed field replaces
 * only that field's observations, preserving competing values on the new page. */
export function mergeProductDetailsEvidence(previous,incoming,sourceUrl,now){
 if(!incoming)return previous;
 const fresh=validateProductDetailsEvidence(incoming);
 if(fresh.sourceUrl!==sourceUrl)throw Error('Product Details belong to another product.');
 const old=previous?validateProductDetailsEvidence(previous):null;
 if(old&&old.sourceUrl!==sourceUrl)throw Error('Previous Product Details belong to another product.');
 const observations=[];let changed=false;
 for(const field of PRODUCT_DETAIL_FIELDS){const before=old?.observations.filter(o=>o.field===field)??[],after=fresh.observations.filter(o=>o.field===field);
  if(!after.length||comparable(before)===comparable(after))observations.push(...before);
  else{changed=true;observations.push(...after.map(({capturedAt,...entry})=>({...entry,capturedAt:date(now)})));}
 }
 if(!changed)return previous;
 return validateProductDetailsEvidence({...fresh,observations,capturedAt:now});
}
