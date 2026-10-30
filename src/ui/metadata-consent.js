import {metadataConsentRequired,hasMetadataConsent,requestMetadataConsent} from '../lib/metadata-consent.js';

export function bindMetadataConsent(root, options = {}) {
  if (!root || !metadataConsentRequired(options.runtime)) return;
  root.hidden = false;
  const status = root.querySelector('[data-metadata-permission-status]');
  const buttons = [...root.querySelectorAll('[data-allow-metadata]')];
  const refresh = async () => {
    const allowed = await Promise.all(buttons.map(button => hasMetadataConsent(button.dataset.allowMetadata, options)));
    buttons.forEach((button, index) => { button.disabled = allowed[index]; });
    status.textContent = `Online book lookups: ${allowed.every(Boolean) ? 'allowed' : 'not allowed'}`;
  };
  for (const button of buttons) button.addEventListener('click', () => {
    // Preserve the native user gesture required by Firefox's permission API.
    let request;
    try { request = requestMetadataConsent(button.dataset.allowMetadata, options); }
    catch { status.textContent = 'Could not request permission. Try again from this button.'; return; }
    button.disabled = true;
    Promise.resolve(request).then(async granted => {
      await refresh();
      if (!granted) status.textContent += '. Permission was not granted. Your library is unchanged.';
    }).catch(() => { button.disabled = false; status.textContent = 'Could not request permission. Try again from this button.'; });
  });
  const permissions = options.permissions ?? globalThis.browser?.permissions ?? globalThis.chrome?.permissions;
  permissions?.onAdded?.addListener(() => refresh().catch(() => {}));
  permissions?.onRemoved?.addListener(() => refresh().catch(() => {}));
  refresh().catch(() => { status.textContent = 'Could not read Firefox lookup permissions. No lookup permission was assumed.'; });
}
