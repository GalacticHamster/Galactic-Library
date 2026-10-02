import { EXTERNAL_API_VERSION, PROVIDERS } from './constants.js';
import { companionResult } from './companion-response.js';
import { matchItems } from './matcher.js';
import { validIsbn } from './identity.js';
import { validateContents } from './contents.js';

const EXTENSION_ID = /^[a-p]{32}$/u;
const REQUEST_MEDIA_TYPES = new Set(['game', 'book', 'audiobook', 'software']);

export function isExtensionId(value) {
  return EXTENSION_ID.test(String(value ?? '').trim());
}

export function normaliseExternalClientIds(values) {
  const candidates = Array.isArray(values) ? values : [];
  return [...new Set(candidates.map((value) => String(value ?? '').trim()).filter(isExtensionId))].sort();
}

function providerStatus(providers) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return Object.fromEntries(PROVIDERS.filter(id => Object.hasOwn(providers ?? {}, id)).map(id => { const state = providers[id]; return [id, {
    connected: Boolean(state?.connected),
    gameCount: count(state?.itemCount),
    audiobookCount: count(state?.audiobookCount),
    bookCount: count(state?.bookCount)
    ,softwareCount:count(state?.softwareCount)
  }]; }));
}

function validMatchRequest(item) {
  if (!item || typeof item !== 'object') return false;
  if(item.mediaType!==undefined&&typeof item.mediaType!=='string')return false;
  const mediaType = (item.mediaType ?? 'game').trim().toLowerCase();
  if(item.requestId!==undefined&&item.requestId!==null&&(typeof item.requestId!=='string'||item.requestId.length>500))return false;
  if(item.identifiers!==undefined){
    if(!item.identifiers||typeof item.identifiers!=='object'||Array.isArray(item.identifiers))return false;
    if(Object.keys(item.identifiers).some(key=>!['isbn','asin','workId'].includes(key)))return false;
    const isbn=item.identifiers.isbn;
    if(isbn!==undefined&&(!(typeof isbn==='string'||Array.isArray(isbn))||(Array.isArray(isbn)&&(!isbn.length||isbn.length>50))||!(Array.isArray(isbn)?isbn:[isbn]).every(value=>typeof value==='string'&&Boolean(validIsbn(value)))))return false;
    for(const key of ['asin','workId'])if(item.identifiers[key]!==undefined&&(typeof item.identifiers[key]!=='string'||!item.identifiers[key].trim()||item.identifiers[key].length>500))return false;
  }
  if(item.contentsComplete!==undefined&&typeof item.contentsComplete!=='boolean')return false;
  if(item.contents!==undefined){try{validateContents(item.contents);}catch{return false;}}
  if(item.excludeProviders!==undefined&&(!Array.isArray(item.excludeProviders)||item.excludeProviders.length>20||!item.excludeProviders.every(value=>typeof value==='string'&&value.length<=80)))return false;
  for(const key of ['language','edition','series','run','volume','issue'])if(item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>500))return false;
  if(item.authors!==undefined&&(!Array.isArray(item.authors)||item.authors.length>50||!item.authors.every(author=>typeof author==='string'&&author.length<=500)))return false;
  return REQUEST_MEDIA_TYPES.has(mediaType)
    && typeof item.title === 'string'
    && item.title.trim().length > 0
    && item.title.length <= 500;
}

/** A deliberately narrow, JSON-only API for an explicitly allow-listed
 * companion extension. It never exposes the raw Galactic Library database. */
export function handleExternalApiRequest(database, request) {
  if (!request || typeof request !== 'object') return { ok: false, error: 'Invalid Galactic Library API request.' };
  if (request.type === 'PING') return { ok: true, apiVersion: EXTERNAL_API_VERSION, appVersion: '0.1.0' };
  if (request.type === 'GET_STATUS') return { ok: true, apiVersion: EXTERNAL_API_VERSION, ready: true, providers: providerStatus(database.providers), capabilities:{mediaTypes:[...REQUEST_MEDIA_TYPES],relationships:['same-work','same-edition','contains'],reviewedContents:true,opaqueItemReferences:true} };
  if (request.type !== 'MATCH_ITEMS') return { ok: false, error: 'Unsupported Galactic Library API request.' };
  if (request.apiVersion !== EXTERNAL_API_VERSION) return { ok: false, error: `Unsupported Galactic Library API version: ${request.apiVersion ?? '(missing)'}.` };
  if (!Array.isArray(request.items) || !request.items.length || request.items.length > 500 || !request.items.every(validMatchRequest)) {
    return { ok: false, error: 'MATCH_ITEMS needs 1–500 valid game, book, audiobook, or software titles.' };
  }
  if(request.items.reduce((sum,item)=>sum+(item.contents?.length??0),0)>20000)return {ok:false,error:'The batch contains too many contents entries.'};
  return { ok: true, apiVersion: EXTERNAL_API_VERSION, results: matchItems(database.providerItems, request.items, database).map(companionResult) };
}
