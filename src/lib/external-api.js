import { EXTERNAL_API_VERSION } from './constants.js';
import { matchItems } from './matcher.js';

const EXTENSION_ID = /^[a-p]{32}$/u;
const REQUEST_MEDIA_TYPES = new Set(['game', 'book', 'audiobook']);

export function isExtensionId(value) {
  return EXTENSION_ID.test(String(value ?? '').trim());
}

export function normaliseExternalClientIds(values) {
  const candidates = Array.isArray(values) ? values : [];
  return [...new Set(candidates.map((value) => String(value ?? '').trim()).filter(isExtensionId))].sort();
}

function providerStatus(providers) {
  return Object.fromEntries(Object.entries(providers ?? {}).map(([id, state]) => [id, {
    connected: Boolean(state?.connected),
    gameCount: Number(state?.itemCount ?? 0),
    audiobookCount: Number(state?.audiobookCount ?? 0),
    bookCount: Number(state?.bookCount ?? 0)
  }]));
}

function validMatchRequest(item) {
  if (!item || typeof item !== 'object') return false;
  const mediaType = String(item.mediaType ?? 'game').trim().toLowerCase();
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
  if (request.type === 'GET_STATUS') return { ok: true, apiVersion: EXTERNAL_API_VERSION, ready: true, providers: providerStatus(database.providers) };
  if (request.type !== 'MATCH_ITEMS') return { ok: false, error: 'Unsupported Galactic Library API request.' };
  if (request.apiVersion !== EXTERNAL_API_VERSION) return { ok: false, error: `Unsupported Galactic Library API version: ${request.apiVersion ?? '(missing)'}.` };
  if (!Array.isArray(request.items) || !request.items.length || request.items.length > 500 || !request.items.every(validMatchRequest)) {
    return { ok: false, error: 'MATCH_ITEMS needs 1–500 valid game, book, or audiobook titles.' };
  }
  return { ok: true, apiVersion: EXTERNAL_API_VERSION, results: matchItems(database.providerItems, request.items) };
}
