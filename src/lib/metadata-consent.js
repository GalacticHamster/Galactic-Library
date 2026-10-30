// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Galactic Hamster

export function metadataConsentRequired(runtime = globalThis.chrome?.runtime) {
  return runtime?.getManifest?.()?.browser_specific_settings?.gecko?.data_collection_permissions?.optional?.includes('websiteContent') === true;
}

export function metadataDataTypes(service) {
  if (service === 'Open Library') return ['websiteContent'];
  if (service === 'Google Books') return ['websiteContent'];
  throw new Error('Unknown book lookup service.');
}

export async function hasMetadataConsent(service, {runtime = globalThis.chrome?.runtime, permissions = globalThis.browser?.permissions ?? globalThis.chrome?.permissions} = {}) {
  const data_collection = metadataDataTypes(service);
  if (!metadataConsentRequired(runtime)) return true;
  try { return await permissions.contains({data_collection}) === true; }
  catch { return false; }
}

export async function requireMetadataConsent(service, options) {
  if (!await hasMetadataConsent(service, options)) {
    throw new Error(`Firefox metadata permission denied. In Settings > Book lookup setup, allow ${service} lookups, then retry.`);
  }
}

export function requestMetadataConsent(service, {runtime = globalThis.chrome?.runtime, permissions = globalThis.browser?.permissions ?? globalThis.chrome?.permissions} = {}) {
  const data_collection = metadataDataTypes(service);
  if (!metadataConsentRequired(runtime)) return Promise.resolve(true);
  // Invoke directly in the click handler, before any asynchronous work.
  return permissions.request({data_collection});
}
