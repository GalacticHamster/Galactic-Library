import { object, text, strings, date, url, count } from './validation.js';
import {validatePurchaseOrigins} from './purchase-origins.js';

export const PROVIDER_SOURCES = Object.freeze({steam:'steam-store-browse-items',gog:'gog-account-library',epic:'epic-store-library','amazon-games':'amazon-games-collection',audible:'audible-library-page',kindle:'amazon-kindle-content-library','amazon-video':'amazon-prime-video-purchases-library','fandango-at-home':'fandango-at-home-library',kobo:'kobo-my-books-library',fanatical:'fanatical-order-history',humble:'humble-purchase-library'});
const HOSTS = {steam:['steampowered.com'],gog:['gog.com'],epic:['epicgames.com'],'amazon-games':['gaming.amazon.com','luna.amazon.com'],audible:['audible.com'],kindle:['amazon.com'],'amazon-video':['amazon.com'],'fandango-at-home':['athome.fandango.com'],kobo:['kobo.com'],fanatical:['fanatical.com'],humble:['humblebundle.com']};
const FIELDS = {
  steam:['parentProviderItemId'],gog:[],epic:['parentProviderItemId'],'amazon-games':['delivery'],
  audible:['narrators','libraryAction'],kindle:['collections','originType','contentType','itemStatus','libraryCategory'],
  'amazon-video':['entityType','libraryView','ownershipEvidence'],'fandango-at-home':['cardType'],kobo:['librarySection','ownershipBasis'],
  fanatical:['bundleId','bundleTitle','bundleSlug','slug','drm','formats','steamAppId','purchaseOrigins'],humble:['sourceBundle','purchaseId','entitlement','keyType','keyStatus','expiresAt']
};
const COMMON = ['source','authors','contributors','series','isbn','isbns','asin','workId','publisher','language','edition','volume','issue','unitType','run','seriesYear','publicationDate','format','collects','contentsStatement','detailUrl','imageUrl'];
const LISTS = new Set(['authors','series','narrators','collections','drm','formats']);
const LIMITS = {language:80,run:100,seriesYear:100,volume:80,issue:80,unitType:20,asin:32,source:100,collects:10000,contentsStatement:10000,steamAppId:16,purchaseId:256,bundleId:256,parentProviderItemId:500};

export function validateEnrichment(kind, value) {
  object(value, 'Enrichment');
  const fields = {
    openLibrary:['source','workKey','sourceUrl','title','authors','publishers','approved','matchBasis','subjects','firstPublishYear','isbn','editionKeys','appliedAt'],
    googleBooks:['source','volumeId','sourceUrl','title','subtitle','authors','categories','isbn','publisher','publishedDate','pageCount','language','appliedAt','approved','matchBasis'],
    googleBooksGenreHint:['source','confidence','candidateVolumeId','candidateTitle','sourceUrl','categories','appliedAt'],
    kindleProductComicContents:['source','sourceUrl','statement','availability','parseStatus','failureCode','checkedAt'],
    localMetadata:['source','sourceId','sourceUrl','fileName','editionKey','workKey','title','authors','contributors','isbn','publisher','series','volume','issue','unitType','run','edition','language','format','categories','publishedDate','pageCount','statement','approved','matchBasis','retrievedAt']
  }[kind];
  if (!fields) throw new Error('Unsupported enrichment source.');
  const result = {};
  for (const key of [...fields,'selectionRef','retrievedAt','approved','matchBasis']) {
    if (!Object.hasOwn(value,key)) continue;
    if (['authors','publishers','series','subjects','categories','isbn','editionKeys'].includes(key)) result[key]=strings(value[key],50,key==='isbn'?32:500,`Enrichment ${key}`);
    else if(key==='contributors'){if(!Array.isArray(value[key])||value[key].length>50)throw new Error('Invalid enrichment contributors.');result[key]=value[key].map(entry=>{object(entry,'Contributor');return {name:text(entry.name,500,'Name'),role:text(entry.role,80,'Role')};});}
    else if(key==='approved'){if(typeof value[key]!=='boolean')throw new Error('Invalid enrichment approval.');result[key]=value[key];}
    else if (['appliedAt','checkedAt','retrievedAt'].includes(key)) result[key]=date(value[key]);
    else if (key==='sourceUrl') result[key]=url(value[key],kind==='localMetadata'?{}:{hosts:kind==='openLibrary'?['openlibrary.org']:kind==='kindleProductComicContents'?['amazon.com']:['books.google.com'],googleId:kind!=='openLibrary'&&kind!=='kindleProductComicContents'});
    else if (['pageCount','firstPublishYear'].includes(key)) result[key]=value[key]===null?null:count(value[key],key,key==='pageCount'?1000000:9999);
    else result[key]=text(value[key],key==='statement'?10000:key==='source'?100:500,`Enrichment ${key}`);
  }
  if(kind==='localMetadata'&&!['comicinfo','epub','publisher','open-library-edition'].includes(result.source))throw new Error('Invalid local/source adapter.');
  const source = kind==='localMetadata'?result.source:kind==='openLibrary'?'open-library':kind==='kindleProductComicContents'?'amazon-product-page':'google-books';
  if (result.source && result.source!==source) throw new Error('Conflicting enrichment source.');
  if (result.workKey && !/^\/works\/OL\d+W$/u.test(result.workKey)) throw new Error('Invalid Open Library work key.');
  if (result.editionKeys?.some(key=>!/^OL\d+M$/u.test(key))) throw new Error('Invalid Open Library edition key.');
  if(result.editionKey&&!/^\/books\/OL\d+M$/u.test(result.editionKey))throw new Error('Invalid edition key.');
  if (kind==='googleBooksGenreHint' && result.confidence && result.confidence!=='author-and-title-stem') throw new Error('Invalid genre hint confidence.');
  if (kind==='kindleProductComicContents' && result.availability && !['available','statement-found','no-statement','unavailable','temporary-failure'].includes(result.availability)) throw new Error('Invalid contents availability.');
  if(result.parseStatus&&!['parsed','unparsed','not-attempted'].includes(result.parseStatus))throw new Error('Invalid contents parsing state.');
  if(result.failureCode&&!['captcha','http','network','unknown'].includes(result.failureCode))throw new Error('Invalid contents failure code.');
  return result;
}

/** Drop unknown fields without traversing arbitrary provider objects. Known
 * fields have explicit types/bounds; malformed input rejects the entire write. */
export function validateMetadata(provider, value, {allowEnrichment = true} = {}) {
  if (value === undefined || value === null) return {};
  object(value, 'Provider metadata');
  const result = {};
  for (const key of [...COMMON,...(FIELDS[provider]??[])]) {
    if (!Object.hasOwn(value,key)) continue;
    if(key==='purchaseOrigins')result[key]=validatePurchaseOrigins(value[key]);
    else if (LISTS.has(key)) result[key]=strings(value[key],50,500,key);
    else if (['isbn','isbns'].includes(key)) result[key]=Array.isArray(value[key])?strings(value[key],50,32,key):text(value[key],32,key);
    else if (key==='contributors') {
      if (!Array.isArray(value[key]) || value[key].length>50) throw new Error('Contributors must be a bounded list.');
      result[key]=value[key].map(entry=>{object(entry,'Contributor');return {name:text(entry.name,500,'Contributor name'),role:text(entry.role,80,'Contributor role')};}).filter(entry=>entry.name);
    } else if (key==='detailUrl'||key==='imageUrl') result[key]=url(value[key],key==='detailUrl'?{hosts:HOSTS[provider]}:{});
    else if(key==='expiresAt')result[key]=date(value[key]);
    else result[key]=text(value[key],LIMITS[key]??500,key);
  }
  if (result.steamAppId && !/^\d{1,16}$/u.test(result.steamAppId)) throw new Error('Invalid Steam App ID.');
  if(result.keyStatus&&!['unknown','unrevealed','revealed','expired','unavailable'].includes(result.keyStatus))throw new Error('Invalid key status.');
  if(provider==='kobo'&&result.ownershipBasis&&!['purchase-attribute','purchase-label','kobo-plus-subscription','kobo-plus-availability','library-presence-only','conflicting-evidence','borrowed','rental'].includes(result.ownershipBasis))throw new Error('Invalid Kobo ownership basis.');
  if (allowEnrichment && value.enrichment !== undefined && value.enrichment !== null) {
    object(value.enrichment,'Enrichment metadata'); const entries={};
    for (const kind of ['openLibrary','googleBooks','googleBooksGenreHint','kindleProductComicContents','localMetadata']) {
      if (!Object.hasOwn(value.enrichment,kind)) continue;
      if (kind==='kindleProductComicContents' && provider!=='kindle') continue;
      entries[kind]=validateEnrichment(kind,value.enrichment[kind]);
    }
    if (Object.keys(entries).length) result.enrichment=entries;
  }
  if (JSON.stringify(result).length>100000) throw new Error('Provider metadata exceeds the per-record limit.');
  return result;
}
