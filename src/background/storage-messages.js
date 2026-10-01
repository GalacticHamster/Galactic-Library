import { STORAGE_MESSAGE_TYPE } from '../lib/storage-protocol.js';

/** Keep privileged writes behind extension-page messages, never provider tabs. */
export function createStorageMessageHandler(writer, runtime) {
  return (request, sender, sendResponse) => {
    if (request?.type !== STORAGE_MESSAGE_TYPE) return undefined;
    if (sender.id !== runtime.id || typeof sender.url !== 'string' || !sender.url.startsWith(runtime.getURL(''))) {
      sendResponse({ ok: false, error: 'Library storage operations are accepted only from Galactic Library pages.' });
      return undefined;
    }
    writer.execute(request.operation, request.args)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    // Keep the response channel open until this queued operation commits.
    return true;
  };
}
