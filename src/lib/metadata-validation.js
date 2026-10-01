import { object, text, strings, date, url, count } from './validation.js';

export const PROVIDER_SOURCES = Object.freeze({steam:'steam-store-browse-items',gog:'gog-account-library',epic:'epic-store-library','amazon-games':'amazon-games-collection',audible:'audible-library-page',kindle:'amazon-kindle-content-library','amazon-video':'amazon-prime-video-purchases-library','fandango-at-home':'fandango-at-home-library',kobo:'kobo-my-books-library',fanatical:'fanatical-order-history',humble:'humble-purchase-library'});
const HOSTS = {steam:['steampowered.com'],gog:['gog.com'],epic:['epicgames.com'],'amazon-games':['gaming.amazon.com','luna.amazon.com'],audible:['audible.com'],kindle:['amazon.com'],'amazon-video':['amazon.com'],'fandango-at-home':['athome.fandango.com'],kobo:['kobo.com'],fanatical:['fanatical.com'],humble:['humblebundle.com']};
const FIELDS = {
  steam:['parentProviderItemId'],gog:[],epic:['parentProviderItemId'],'amazon-games':['delivery'],
  audible:['narrators','libraryAction'],kindle:['collections','originType','contentType','itemStatus','libraryCategory'],
  'amazon-video':['entityType','libraryView','ownershipEvidence'],'fandango-at-home':['cardType'],kobo:['librarySection'],
  fanatical:['bundleId','bundleTitle','bundleSlug','slug','drm','formats','steamAppId'],humble:['sourceBundle','purchaseId','entitlement','keyType']
};
const COMMON = ['source','authors','contributors','series','isbn','isbns','asin','workId','publisher','language','edition','volume','issue','unitType','run','seriesYear','publicationDate','format','collects','contentsStatement','detailUrl','imageUrl'];
const LISTS = new Set(['authors','series','narrators','collections','drm','formats']);
const LIMITS = {language:80,run:100,seriesYear:100,volume:80,issue:80,unitType:20,asin:32,source:100,collects:10000,contentsStatement:10000,steamAppId:16,purchaseId:256,bundleId:256,parentProviderItemId:500};

export function validateEnrichment(kind, value) {
  object(value, 'Enrichment');
  const fields = {
    openLibrary:['source','workKey','sourceUrl','title','authors','subjects','firstPublishYear','isbn','editionKeys','appliedAt'],
    googleBooks:['source','volumeId','sourceUrl','title','subtitle','authors','categories','isbn','publisher','publishedDate','pageCount','language','appliedAt'],
    googleBooksGenreHint:['source','confidence','candidateVolumeId','candidateTitle','sourceUrl','categories','appliedAt'],
    kindleProductComicContents:['source','sourceUrl','statement','availability','checkedAt']
  }[kind];
  if (!fields) throw new Error('Unsupported enrichment source.');
  const result = {};
  for (const key of fields) {
    if (!Object.hasOwn(value,key)) continue;
    if (['authors','subjects','categories','isbn','editionKeys'].includes(key)) result[key]=strings(value[key],50,key==='isbn'?32:500,`Enrichment ${key}`);
    else if (['appliedAt','checkedAt'].includes(key)) result[key]=date(value[key]);
    else if (key==='sourceUrl') result[key]=url(value[key],{hosts:kind==='openLibrary'?['openlibrary.org']:kind==='kindleProductComicContents'?['amazon.com']:['books.google.com'],googleId:kind!=='openLibrary'&&kind!=='kindleProductComicContents'});
    else if (['pageCount','firstPublishYear'].includes(key)) result[key]=value[key]===null?null:count(value[key],key,key==='pageCount'?1000000:9999);
    else result[key]=text(value[key],key==='statement'?10000:key==='source'?100:500,`Enrichment ${key}`);
  }
  const source = kind==='openLibrary'?'open-library':kind==='kindleProductComicContents'?'amazon-product-page':'google-books';
  if (result.source && result.source!==source) throw new Error('Conflicting enrichment source.');
  if (result.workKey && !/^\/works\/OL\d+W$/u.test(result.workKey)) throw new Error('Invalid Open Library work key.');
  if (result.editionKeys?.some(key=>!/^OL\d+M$/u.test(key))) throw new Error('Invalid Open Library edition key.');
  if (kind==='googleBooksGenreHint' && result.confidence && result.confidence!=='author-and-title-stem') throw new Error('Invalid genre hint confidence.');
  if (kind==='kindleProductComicContents' && result.availability && !['available','unavailable'].includes(result.availability)) throw new Error('Invalid contents availability.');
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
    if (LISTS.has(key)) result[key]=strings(value[key],50,500,key);
    else if (['isbn','isbns'].includes(key)) result[key]=Array.isArray(value[key])?strings(value[key],50,32,key):text(value[key],32,key);
    else if (key==='contributors') {
      if (!Array.isArray(value[key]) || value[key].length>50) throw new Error('Contributors must be a bounded list.');
      result[key]=value[key].map(entry=>{object(entry,'Contributor');return {name:text(entry.name,500,'Contributor name'),role:text(entry.role,80,'Contributor role')};}).filter(entry=>entry.name);
    } else if (key==='detailUrl'||key==='imageUrl') result[key]=url(value[key],key==='detailUrl'?{hosts:HOSTS[provider]}:{});
    else result[key]=text(value[key],LIMITS[key]??500,key);
  }
  if (result.steamAppId && !/^\d{1,16}$/u.test(result.steamAppId)) throw new Error('Invalid Steam App ID.');
  if (allowEnrichment && value.enrichment !== undefined && value.enrichment !== null) {
    object(value.enrichment,'Enrichment metadata'); const entries={};
    for (const kind of ['openLibrary','googleBooks','googleBooksGenreHint','kindleProductComicContents']) {
      if (!Object.hasOwn(value.enrichment,kind)) continue;
      if (kind==='kindleProductComicContents' && provider!=='kindle') continue;
      entries[kind]=validateEnrichment(kind,value.enrichment[kind]);
    }
    if (Object.keys(entries).length) result.enrichment=entries;
  }
  if (JSON.stringify(result).length>100000) throw new Error('Provider metadata exceeds the per-record limit.');
  return result;
}
