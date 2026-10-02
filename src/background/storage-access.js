/** Start on every worker activation, before admitting any library operation. */
export async function restrictStorageAccess(storage, runtime, privateArea) {
  if(runtime?.getURL?.('').startsWith('moz-extension://')){
    if(!privateArea?.ready||typeof storage.session?.get!=='function')throw new Error('This browser cannot protect library storage.');
    // Session storage is privileged by default in Firefox; durable private
    // state uses extension-origin IndexedDB rather than public storage.local.
    await privateArea.ready();return;
  }
  if (typeof storage.local?.setAccessLevel !== 'function' || typeof storage.session?.setAccessLevel !== 'function') {
    throw new Error('This browser cannot protect library storage. Use Chrome 102 or newer.');
  }
  await Promise.all([
    storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
    storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})
  ]);
}
