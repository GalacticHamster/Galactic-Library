import {PROVIDERS,MEDIA_TYPES,OWNERSHIP_STATES} from './constants.js';
import {object,text,date,url} from './validation.js';
import {identityEvidence,validIsbn,titleIdentity} from './identity.js';

const uuid=value=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value);
export function validateOwnershipReview(value){
  object(value,'Ownership confirmation');const ownership=text(value.ownership,20,'Ownership');
  if(!OWNERSHIP_STATES.includes(ownership)||!['manual-confirmation','local-purchase-history'].includes(value.source))throw new Error('Invalid ownership confirmation.');
  const note=text(value.note,2000,'Ownership evidence');if(!note)throw new Error('Describe the ownership evidence.');
  const evidenceDate=date(value.evidenceDate,'Evidence date');if(!evidenceDate)throw new Error('An evidence date is required.');
  const expiresAt=date(value.expiresAt,'Access expiry');if(expiresAt&&!['rental','borrowed','subscription'].includes(ownership))throw new Error('Access expiry applies only to temporary access.');
  if(!uuid(value.reviewRef))throw new Error('Invalid ownership confirmation reference.');
  const confirmedAt=date(value.confirmedAt);if(!confirmedAt)throw new Error('An ownership confirmation date is required.');
  return {reviewRef:value.reviewRef,ownership,source:value.source,note,evidenceDate,confirmedAt,sourceUrl:url(value.sourceUrl),expiresAt};
}
export function validateOwnershipReviews(value={}){
  object(value,'Ownership confirmations');if(Object.keys(value).length>100000)throw new Error('Too many ownership confirmations.');
  return Object.fromEntries(Object.entries(value).map(([ref,review])=>{if(!uuid(ref))throw new Error('Invalid ownership record reference.');return [ref,validateOwnershipReview(review)];}));
}
export function purchaseEvidence(value){
  object(value,'Purchase evidence');const provider=value.provider==='comixology'?'kindle':text(value.provider,40,'Receipt provider');const mediaType=text(value.mediaType??(provider==='kindle'?'book':provider==='audible'?'audiobook':'game'),40,'Receipt media');
  if(!PROVIDERS.includes(provider)||!MEDIA_TYPES.includes(mediaType))throw new Error('Unsupported receipt provider or media type.');
  const title=text(value.title,500,'Receipt title');if(!title)throw new Error('Receipt needs a title.');
  const asin=text(value.asin??'',10,'ASIN').toUpperCase();if(asin&&!/^[A-Z0-9]{10}$/u.test(asin))throw new Error('Invalid receipt ASIN.');
  const isbn=value.isbn?validIsbn(value.isbn):'';if(value.isbn&&!isbn)throw new Error('Invalid receipt ISBN.');
  const providerItemId=text(value.providerItemId??'',500,'Receipt catalog ID');
  const acquiredAt=date(value.acquiredAt,'Receipt purchase date');if(!acquiredAt)throw new Error('Receipt needs an ISO purchase date.');
  const sourceLabel=text(value.sourceLabel??'Local purchase history',100,'Receipt source');
  return {provider,mediaType,title,asin,isbn,providerItemId,acquiredAt,sourceLabel};
}
export function validateOwnershipProposals(value={}){
  object(value,'Purchase evidence proposals');if(Object.keys(value).length>20000)throw new Error('Too many purchase evidence proposals.');
  return Object.fromEntries(Object.entries(value).map(([id,entry])=>{
    if(!uuid(id))throw new Error('Invalid purchase proposal reference.');object(entry,'Purchase proposal');
    if(!Array.isArray(entry.recordRefs)||entry.recordRefs.length>50||entry.recordRefs.some(ref=>!uuid(ref)))throw new Error('Invalid receipt candidate references.');
    if(entry.profileId!==undefined&&entry.profileId!==null&&!uuid(entry.profileId))throw Error('Invalid receipt profile reference.');
    return [id,{...(entry.profileId?{profileId:entry.profileId}:{}),evidence:purchaseEvidence(entry.evidence),recordRefs:[...new Set(entry.recordRefs)],profileLabel:text(entry.profileLabel??'',100,'Receipt profile'),importedAt:date(entry.importedAt)}];
  }));
}
export function purchaseCandidates(evidence,items,profileId){
  return Object.values(items).filter(item=>{
    if(profileId&&item.profileId!==profileId)return false;
    if(item.provider!==evidence.provider||item.mediaType!==evidence.mediaType)return false;
    const identity=identityEvidence(item),asin=identity.asin||(/^[A-Z0-9]{10}$/iu.test(item.providerItemId)?item.providerItemId.toUpperCase():'');
    if(evidence.asin&&asin)return evidence.asin===asin;
    if(evidence.isbn&&identity.isbn.length)return identity.isbn.includes(evidence.isbn);
    if(evidence.providerItemId)return item.providerItemId===evidence.providerItemId;
    return titleIdentity(item.title,item.mediaType).base===titleIdentity(evidence.title,item.mediaType).base;
  }).slice(0,50).map(item=>item.recordRef);
}

/** Accept explicit local CSV/JSON exports, project immediately and discard raw
 * customer, payment, download and redemption fields. No OCR or network calls. */
export function parsePurchaseEvidence(input,{provider='kindle',sourceLabel='Local purchase history'}={}){
  if(typeof input!=='string'||input.length>5*1024*1024)throw new Error('Choose a CSV/JSON purchase export under 5 MB.');let entries;
  if(/^[\s\uFEFF]*[\[{]/u.test(input)){
    const value=JSON.parse(input.replace(/^\uFEFF/u,''));entries=Array.isArray(value)?value:value.entries;
  }else{
    const rows=[];let row=[],field='',quoted=false;const source=input.replace(/^\uFEFF/u,'');
    for(let i=0;i<source.length;i++){
      const char=source[i];if(char==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(!quoted&&(char===','||char==='\n')){row.push(field);field='';if(char==='\n'){rows.push(row);row=[];}}
      else if(char!=='\r')field+=char;
      if(rows.length>1001||field.length>100000)throw new Error('Purchase export exceeds its row/field limit.');
    }
    if(quoted)throw new Error('Unclosed CSV field.');if(field||row.length){row.push(field);rows.push(row);}
    const header=(rows.shift()??[]).map(value=>value.trim().toLowerCase().replace(/[^a-z0-9]/gu,''));
    const aliases={title:['title','productname','name','itemtitle'],asin:['asin'],isbn:['isbn','isbn13'],provider:['provider','store'],providerItemId:['provideritemid','catalogid'],mediaType:['mediatype','kind'],acquiredAt:['acquiredat','purchasedate','purchaseDate'.toLowerCase(),'orderdate','date']};
    entries=rows.filter(row=>row.some(value=>value.trim())).map(row=>Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,row[header.findIndex(label=>names.includes(label))]||undefined])));
  }
  if(!Array.isArray(entries)||!entries.length||entries.length>1000)throw new Error('Import 1–1,000 purchase entries.');
  return entries.map(entry=>purchaseEvidence({...entry,provider:entry.provider??provider,sourceLabel}));
}
