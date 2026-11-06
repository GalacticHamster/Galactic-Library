import '../src/providers/provider-snapshot.js';
import '../src/providers/kobo-ownership.js';
import {koboSectionFixture} from './fixtures/kobo-empty-root.mjs';

export async function checkKoboEmptyRoot() {
  const checks = [], originalFetch = globalThis.fetch;
  const assert = (value, message) => { if (!value) throw Error(message); };
  try {
    for (const [scenario, count, requests] of [['audio', 1, 2], ['archive', 1, 2], ['both', 3, 3], ['ordinary', 1, 1], ['quick-known', 1, 1]]) {
      const urls = [];
      globalThis.fetch = async url => { urls.push(String(url)); const result = koboSectionFixture(scenario, url); return new Response(result.html, {status: result.status}); };
      const value = await globalThis.GalacticKobo.fetchKoboLibrary(() => {}, scenario === 'quick-known' ? ['root'] : null);
      assert(value.items.length === count && urls.length === requests, `${scenario}: wrong item/request count`);
      assert(new Set(value.items.map(item => item.providerItemId)).size === count, `${scenario}: duplicates`);
      assert(value.items.every(item => item.ownership === 'owned'), `${scenario}: purchase classification changed`);
      assert(value.items.filter(item => item.mediaType === 'audiobook').length === (['audio', 'both'].includes(scenario) ? 1 : 0), `${scenario}: wrong media type`);
      assert(value.quick || value.snapshot.complete, `${scenario}: missing Full snapshot`);
      if (scenario === 'quick-known') assert(!value.snapshot && value.quick, 'Quick gained Full authority');
      checks.push(`Kobo ${scenario}: ${count} unique purchased items, ${requests} request(s), existing media and snapshot semantics`);
    }
    for (const scenario of ['all-empty', 'invalid-link', '401', '403', '503', 'malformed', 'unreadable', 'count-mismatch', 'pagination']) {
      let requests = 0, error;
      globalThis.fetch = async url => { requests++; const result = koboSectionFixture(scenario, url); return new Response(result.html, {status: result.status}); };
      try { await globalThis.GalacticKobo.fetchKoboLibrary(); } catch (caught) { error = caught; }
      assert(error && requests === (scenario === 'all-empty' ? 3 : scenario === 'invalid-link' ? 1 : 2), `${scenario}: unexpectedly complete or wrong traversal`);
      if (scenario === 'all-empty') assert(error.message.includes('no readable'), 'All-empty lost conservative guard');
      checks.push(`Kobo ${scenario}: rejected without returning complete acquisition`);
    }
    let requests = 0;
    globalThis.fetch = async url => { requests++; const result = koboSectionFixture('audio', url); return new Response(result.html); };
    const emptyQuick = await globalThis.GalacticKobo.fetchKoboLibrary(() => {}, []);
    assert(emptyQuick.quick && emptyQuick.items.length === 0 && requests === 1 && !emptyQuick.snapshot, 'Empty Quick visited linked sections or gained Full authority');
    checks.push('Kobo empty Quick retains one-request no-snapshot behavior');
  } finally { globalThis.fetch = originalFetch; }
  return checks;
}
