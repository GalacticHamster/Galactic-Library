/** Start on every worker activation, before admitting any library operation. */
export async function restrictStorageAccess(storage) {
  if (typeof storage.local?.setAccessLevel !== 'function' || typeof storage.session?.setAccessLevel !== 'function') {
    throw new Error('This browser cannot protect library storage. Use Chrome 102 or newer.');
  }
  await Promise.all([
    storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
    storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})
  ]);
}
