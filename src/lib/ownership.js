import '../providers/kobo-ownership.js';

export function providerOwnership(provider, ownership, metadata) {
  return provider==='kobo'?globalThis.GalacticKoboOwnership.fromMetadata(ownership,metadata):ownership;
}
