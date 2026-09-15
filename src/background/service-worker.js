import { matchItems } from '../lib/matcher.js';
import { getDatabase } from '../lib/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {});
});

// This is intentionally internal for now. The later external API will use the
// same handler, after both published extension IDs are fixed and allow-listed.
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type !== 'MATCH_ITEMS') return undefined;
  getDatabase()
    .then((database) => sendResponse({ ok: true, results: matchItems(database.providerItems, request.items ?? []) }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
