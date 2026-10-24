import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { withWorker, snapshotFixture } from './storage.js';
import { validateProviderSnapshot, completedScope, completeProviderSnapshot } from '../src/lib/provider-snapshot.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {audibleRescanTests} from './audible-rescan.js';

// Exercise the actual classic importers in isolated signed-in page contexts.
// Timers resolve immediately; no network, credentials, or real account is used.
function providerContext(provider, fetch, overrides = {}) {
  const context = vm.createContext({
    URL, URLSearchParams, console, fetch,
    setTimeout: (callback) => { callback(); return 0; },
    location: { origin: 'https://www.amazon.com', href: 'https://www.amazon.com/hz/mycd/', pathname: '/hz/mycd/' },
    document: {
      querySelector: () => ({ value: 'test-csrf' }),
      createElement: () => ({ set innerHTML(value) { this.value = value; } }),
      scripts: []
    },
    ...overrides
  });
  for (const file of ['provider-snapshot',...(provider==='kindle'?['kindle-ownership']:[]),provider]) {
    vm.runInContext(readFileSync(new URL(`../src/providers/${file}.js`, import.meta.url), 'utf8'), context, { filename: `${file}.js` });
  }
  return context;
}
const json = (payload) => ({ ok: true, json: async () => payload });
const kindlePayload = (items, numberOfItems) => ({ success: true, GetContentOwnershipData: { items, numberOfItems } });
const book = (asin, title = `Book ${asin}`) => ({ asin, title, originType: 'Purchase' });
const oldBooks = ['OLD1', 'OLD2'].map((id) => ({ providerItemId: id, title: `Old ${id}`, mediaType: 'book', ownership: 'owned' }));
const kindleSender = { id: 'abcdefghijklmnopabcdefghijklmnop', url: 'https://www.amazon.com/hz/mycd/' };
const plain = (value) => JSON.parse(JSON.stringify(value));

async function seed({ importItems, pageA, memory }) {
  await importItems('kindle', oldBooks);
  await importItems('gog', [{ providerItemId: '10', title: 'Existing GOG game', mediaType: 'game' }]);
  await pageA.saveOpenLibraryEnrichment(['kindle:OLD1'], { source: 'open-library', workKey: '/works/OL1W', subjects: ['Comics'] });
  await pageA.saveManualMatchDecision({ id: 'keep-review', itemIds: ['kindle:OLD1', 'kindle:OLD2'] }, 'different');
  return structuredClone(memory.values);
}

async function scanAndImport(context, dispatch) {
  const result = await context.GalacticKindle.fetchKindleBooks();
  const response = await dispatch({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: 'full', ...plain(result) }, kindleSender);
  if (!response.ok) throw new Error(response.error);
  return response;
}

export const providerSnapshotTests = [
  ...audibleRescanTests,
  ['Audible runtime completion returns committed added, updated and retired source counts',()=>withWorker(async({pageA,dispatch})=>{
    const prior=[{providerItemId:'B000000001',title:'Existing audio',mediaType:'audiobook',ownership:'unknown'},{providerItemId:'B000000002',title:'Wishlist audio',mediaType:'audiobook',ownership:'unknown'}];
    await pageA.mergeProviderItems('audible',prior);
    const items=[{...prior[0],metadata:{authors:['Writer'],narrators:['Narrator'],asin:'B000000001'}}];
    const snapshot=completeProviderSnapshot('audible',items,[completedScope('library',1,1,'pagination-end',1)]);
    const response=await dispatch({type:'IMPORT_PROVIDER_ITEMS',provider:'audible',mode:'full',items,snapshot},{id:kindleSender.id,url:'https://www.audible.com/library/titles'});
    assert.equal(response.ok,true,response.error);assert.equal(response.audiobookCount,1);assert.equal(response.changes.added,0);assert.equal(response.changes.updated,1);assert.equal(response.changes.missing,1);
  })],
  ['Kindle 1,000-item response then malformed page leaves the entire saved snapshot intact', () => withWorker(async (worker) => {
    const before = await seed(worker);
    let requests = 0;
    const context = providerContext('kindle', async () => json(++requests === 1
      ? kindlePayload([book('NEW1')], 1000)
      : kindlePayload({ malformed: true }, 1000)));
    await assert.rejects(scanAndImport(context, worker.dispatch), /unreadable Kindle library response/u);
    assert.equal(requests, 2);
    assert.deepEqual(worker.memory.values, before);
  })],
  ['writer rejects missing, partial, inconsistent, or truncated full snapshots without touching storage', () => withWorker(async (worker) => {
    const before = await seed(worker);
    const items = [oldBooks[0]];
    const proof = snapshotFixture('kindle', items);
    const cases = [
      undefined,
      { ...proof, complete: false },
      { ...proof, provider: 'gog' },
      { ...proof, itemCount: 999 },
      { ...proof, scopes: [proof.scopes[0]] },
      { ...proof, scopes: [{ ...proof.scopes[0], expectedCount: 1000 }, proof.scopes[1]] },
      { ...proof, scopes: [{ ...proof.scopes[0], limitReached: true }, proof.scopes[1]] },
      { ...proof, scopes: [{ ...proof.scopes[0], pagesRead: 0 }, proof.scopes[1]] },
      { ...proof, scopes: [{ ...proof.scopes[0], readCount: 2, expectedCount: 2 }, proof.scopes[1]] }
    ];
    for (const snapshot of cases) {
      const response = await worker.dispatch({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: 'full', items, snapshot }, kindleSender);
      assert.equal(response.ok, false);
      assert.match(response.error, /full scan is incomplete/u);
      assert.deepEqual(worker.memory.values, before);
    }
    // Privileged extension pages cannot bypass the writer's snapshot gate.
    await assert.rejects(worker.pageA.replaceProviderItems('kindle', items), /complete snapshot/u);
    assert.deepEqual(worker.memory.values, before);
    await worker.importItems('kindle', oldBooks);
    assert.equal((await worker.pageA.getDatabase()).providers.kindle.snapshotValidation.complete, true);
  })],
  ['Kindle empty later page with unexplained count mismatch retains old records', () => withWorker(async (worker) => {
    const before = await seed(worker);
    let requests = 0;
    const context = providerContext('kindle', async () => json(kindlePayload(++requests === 1 ? [book('NEW1')] : [], 1000)));
    await assert.rejects(scanAndImport(context, worker.dispatch), /reported 1000 books items but returned 1/u);
    assert.equal(requests, 2);
    assert.deepEqual(worker.memory.values, before);
  })],
  ['Kindle rejects changing totals and unreadable individual entries', async () => {
    let requests = 0;
    const changed = providerContext('kindle', async () => json(kindlePayload([book(`NEW${++requests}`)], requests === 1 ? 1000 : 999)));
    await assert.rejects(changed.GalacticKindle.fetchKindleBooks(), /changed the books total/u);
    const malformed = providerContext('kindle', async () => json(kindlePayload([book('NEW1'), { asin: 'NO-TITLE' }], 2)));
    await assert.rejects(malformed.GalacticKindle.fetchKindleBooks(), /(?:unreadable|malformed) books entries/u);
  }],
  ['Kindle pagination-limit truncation never becomes a replacement', () => withWorker(async (worker) => {
    const before = await seed(worker);
    let requests = 0;
    const context = providerContext('kindle', async () => json(kindlePayload([book(`NEW${++requests}`)], 100000)));
    await assert.rejects(scanAndImport(context, worker.dispatch), /500-page limit/u);
    assert.equal(requests, 500);
    assert.deepEqual(worker.memory.values, before);
  })],
  ['complete Kindle snapshot reconciles duplicate IDs and documents before replacing', () => withWorker(async (worker) => {
    await seed(worker);
    const context = providerContext('kindle', async (_url, request) => {
      const input = JSON.parse(request.body.get('activityInput'));
      return json(input.contentType === 'Ebook'
        ? kindlePayload([book('OLD1'), book('OLD1'), book('NEW1')], 3)
        : kindlePayload([book('DOC1')], 1));
    });
    const result = await context.GalacticKindle.fetchKindleBooks();
    assert.equal(result.items.length, 3);
    assert.equal(result.snapshot.scopes[0].duplicateCount, 1);
    validateProviderSnapshot('kindle', plain(result.items), plain(result.snapshot));
    const response = await worker.dispatch({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: 'full', ...plain(result) }, kindleSender);
    assert.equal(response.ok, true, response.error);
    const database = await worker.pageA.getDatabase();
    assert.deepEqual(Object.keys(database.providerItems).sort(), ['gog:10', 'kindle:DOC1', 'kindle:NEW1', 'kindle:OLD1']);
    assert.equal(database.providerItems['kindle:OLD1'].metadata.enrichment.openLibrary.workKey, '/works/OL1W');
    assert.equal(database.manualMatchDecisions[['kindle:OLD1','kindle:OLD2'].join('\u0000')].decision, 'different');
    assert.equal(database.providers.kindle.snapshotValidation.itemCount, 3);
  })],
  ['quick Kindle update remains non-destructive without full completion evidence', () => withWorker(async (worker) => {
    await seed(worker);
    const before = await worker.pageA.getDatabase();
    const context = providerContext('kindle', async (_url, request) => {
      const input = JSON.parse(request.body.get('activityInput'));
      return json(input.contentType === 'Ebook' ? kindlePayload([book('OLD1')], 1000) : kindlePayload([], 0));
    });
    const result = await context.GalacticKindle.fetchKindleBooks(() => {}, ['OLD1', 'OLD2']);
    assert.equal(result.snapshot, undefined);
    assert.equal(result.items.length, 0);
    await worker.importItems('kindle', [], 'incremental');
    const after = await worker.pageA.getDatabase();
    assert.deepEqual(after.providerItems, before.providerItems);
    assert.deepEqual(after.providers.kindle.snapshotValidation, before.providers.kindle.snapshotValidation);
  })],
  ['explicit validated zero count can remove only the selected provider', () => withWorker(async (worker) => {
    await seed(worker);
    const response = await worker.dispatch({ type: 'IMPORT_PROVIDER_ITEMS', provider: 'kindle', mode: 'full', items: [], snapshot: snapshotFixture('kindle', []) }, kindleSender);
    assert.equal(response.ok, true, response.error);
    assert.deepEqual(Object.keys((await worker.pageA.getDatabase()).providerItems), ['gog:10']);
    assert.throws(() => completeProviderSnapshot('gog', [], [completedScope('library', 0)]), /empty without an explicit zero count/u);
  })],
  ['GOG rejects malformed later pages, count mismatches, and excessive pagination', async () => {
    let requests = 0;
    const malformed = providerContext('gog', async () => json(++requests === 1
      ? { products: [{ id: 1, title: 'Game' }], totalPages: 2, totalProducts: 2 }
      : { products: {}, totalPages: 2, totalProducts: 2 }));
    await assert.rejects(malformed.GalacticGog.fetchGogGames(), /unreadable library response/u);
    const mismatch = providerContext('gog', async () => json({ products: [{ id: 1, title: 'Game' }], totalPages: 1, totalProducts: 2 }));
    await assert.rejects(mismatch.GalacticGog.fetchGogGames(), /reported 2 items but returned 1/u);
    const limit = providerContext('gog', async () => json({ products: [{ id: 1, title: 'Game' }], totalPages: 501 }));
    await assert.rejects(limit.GalacticGog.fetchGogGames(), /more than 500 pages/u);
    const complete = providerContext('gog', async () => json({ products: [{ id: 1, title: 'Game' }], totalPages: 1, totalProducts: 1 }));
    const result = await complete.GalacticGog.fetchGogGames();
    validateProviderSnapshot('gog', plain(result.items), plain(result.snapshot));
  }],
  ['Epic rejects missing records/cursor, repeated cursors, and pagination-limit truncation', async () => {
    const page = (id, cursor) => ({ data: { Library: { libraryItems: { records: [{ catalogItem: { id, title: `Game ${id}` } }], responseMetadata: { nextCursor: cursor } } } } });
    for (const invalid of [{ records: {}, responseMetadata: { nextCursor: null } }, { records: [] }]) {
      let requests = 0;
      const context = providerContext('epic', async () => json(++requests === 1 ? page('1', 'next') : { data: { Library: { libraryItems: invalid } } }));
      await assert.rejects(context.GalacticEpic.fetchEpicGames(), /malformed library page/u);
    }
    const repeated = providerContext('epic', async () => json(page('1', 'same')));
    await assert.rejects(repeated.GalacticEpic.fetchEpicGames(), /repeated a library page/u);
    let requests = 0;
    const limit = providerContext('epic', async () => json(page(String(++requests), String(requests))));
    await assert.rejects(limit.GalacticEpic.fetchEpicGames(), /500-page limit/u);
    assert.equal(requests, 500);
    const complete = providerContext('epic', async () => json(page('1', null)));
    const result = await complete.GalacticEpic.fetchEpicGames();
    validateProviderSnapshot('epic', plain(result.items), plain(result.snapshot));
  }],
  ['Steam unresolved owned apps block full replacement but allow a non-destructive quick merge', async () => {
    const context = providerContext('steam-store', async (url) => json(String(url).startsWith('/dynamicstore')
      ? { rgOwnedApps: [1, 2] }
      : { response: { store_items: [{ appid: 1, name: 'Resolved game', type: 0 }] } }));
    await assert.rejects(context.GalacticSteamStore.fetchOwnedSteamGames(), /could not resolve 1 owned apps/u);
    const quick = await context.GalacticSteamStore.fetchOwnedSteamGames(() => {}, []);
    assert.equal(quick.items.length, 1);
    assert.equal(quick.unresolvedApps.length, 1);
    assert.equal(quick.snapshot, undefined);
    const malformed = providerContext('steam-store', async () => json({ rgOwnedApps: [1, 'invalid'] }));
    await assert.rejects(malformed.GalacticSteamStore.fetchOwnedSteamGames(), /malformed owned-App-ID list/u);
  }],
  ['Amazon Video inferred full scans preserve unseen records and other accounts in the actual worker', () => withWorker(async ({dispatch,pageA,importItems}) => {
    await importItems('gog',[{providerItemId:'unrelated',title:'Unrelated game',mediaType:'game',ownership:'owned'}]);
    const sender={...kindleSender,url:'https://www.amazon.com/gp/video/library',tab:{id:17}};
    const items=[{providerItemId:'seen',title:'Seen movie',mediaType:'movie',ownership:'unknown'},
      {providerItemId:'unseen',title:'Preserved rental',mediaType:'movie',ownership:'rental',metadata:{authors:['Preserved creator']}}];
    const begin=async label=>{const result=await dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'amazon-video',beginScan:true,confirmed:true,profileLabel:label,mode:'full',switchProfile:true},sender);assert.equal(result.ok,true,result.error);return result;};
    const commit=(scan,values,snapshot)=>dispatch({type:'COMMIT_PROVIDER_SCAN',provider:'amazon-video',mode:'full',scanToken:scan.scanToken,items:values,snapshot},sender);
    for(const label of ['Personal','Other account']){const response=await commit(await begin(label),items,snapshotFixture('amazon-video',items));assert.equal(response.ok,true,response.error);}
    const scan=await begin('Personal'),before=await pageA.getDatabase();
    const inferred=[items[0],{providerItemId:'new',title:'New observation',mediaType:'tv',ownership:'unknown'}];
    const snapshot=completeProviderSnapshot('amazon-video',inferred,[completedScope('library',2,null,'scroll-end',12)]);
    const response=await commit(scan,inferred,snapshot);assert.equal(response.ok,true,response.error);
    const after=await pageA.getDatabase();
    for(const [id,item]of Object.entries(before.providerItems))if(item.profileId!==scan.profileId||item.providerItemId==='unseen')assert.deepEqual(after.providerItems[id],item);
    assert.equal(Object.keys(after.providerHistory).length,Object.keys(before.providerHistory).length);
    assert.equal(after.providerProfiles[scan.profileId].state.syncHealth.status,'partial');
    assert.equal(after.providerProfiles[scan.profileId].state.syncHealth.coverageLimit,'inferred-scroll-convergence-preserve-unseen');
    assert.equal(Object.values(after.providerItems).filter(item=>item.profileId===scan.profileId).length,3);
    const stale=await commit(scan,inferred,snapshot);assert.equal(stale.ok,false);assert.deepEqual((await pageA.getDatabase()).providerItems,after.providerItems);
    const countedScan=await begin('Personal');const counted=await commit(countedScan,[inferred[1]],snapshotFixture('amazon-video',[inferred[1]]));assert.equal(counted.ok,true,counted.error);
    const confirmed=await pageA.getDatabase();assert.equal(Object.values(confirmed.providerItems).filter(item=>item.profileId===scan.profileId).length,1);
    assert(Object.values(confirmed.providerHistory).some(entry=>entry.item.providerItemId==='unseen'&&entry.item.profileId===scan.profileId));
  })],
  ['Amazon Video purchase evidence upgrades existing records and survives sparse rescans, reviews and restore', () => withWorker(async ({pageA}) => {
    const raw={providerItemId:'same-movie',title:'A movie',mediaType:'movie',ownership:'unknown',metadata:{entityType:'MOVIE'}};
    await pageA.mergeProviderItems('amazon-video',[raw]);
    const original=Object.values((await pageA.getDatabase()).providerItems)[0];
    const purchase={...raw,ownership:'owned',metadata:{...raw.metadata,ownershipEvidence:'You purchased this'}};
    const full=async item=>pageA.replaceProviderItems('amazon-video',[item],{},completeProviderSnapshot('amazon-video',[item],[completedScope('library',1,null,'scroll-end',8)]));
    await full(purchase);
    let db=await pageA.getDatabase(),item=Object.values(db.providerItems)[0];
    assert.equal(item.id,original.id);assert.equal(item.recordRef,original.recordRef);assert.equal(item.ownership,'owned');
    assert.equal(Object.keys(db.providerItems).length,1);
    await pageA.saveOwnershipCorrections([{recordRef:item.recordRef,provider:item.provider,profileId:item.profileId,expectedReviewRef:null}],{ownership:'returned'});
    const corrected=await pageA.getDatabase();
    for(const observation of [raw,purchase,raw]){
      await full(observation);db=await pageA.getDatabase();item=db.providerItems[original.id];
      assert.equal(item.ownership,'owned');assert.equal(item.metadata.ownershipEvidence,'You purchased this');
      assert.equal(effectiveOwnershipRecord(item,db).ownership,'returned');
      assert.deepEqual(db.ownershipReviews,corrected.ownershipReviews);assert.equal(Object.keys(db.providerItems).length,1);
    }
    await pageA.restoreDatabase(parseBackup(createBackup(db)));
    db=await pageA.getDatabase();assert.equal(db.providerItems[original.id].ownership,'owned');assert.equal(effectiveOwnershipRecord(db.providerItems[original.id],db).ownership,'returned');
    // An explicit changed entitlement is not treated as an absent label.
    await full({...raw,ownership:'rental',metadata:{...raw.metadata,ownershipEvidence:'Rental expires in 2 days'}});
    assert.equal((await pageA.getDatabase()).providerItems[original.id].ownership,'rental');
  })],
  ['Amazon Video purchases outrank later Prime availability across merge, inferred, confirmed and restored records', () => withWorker(async ({pageA}) => {
    const prime=id=>({providerItemId:id,title:'Same TV title',mediaType:'tv',ownership:'subscription',metadata:{entityType:'TV Show',ownershipEvidence:'Included with Prime'}});
    const purchase={...prime('purchase'),ownership:'owned',metadata:{...prime('purchase').metadata,ownershipEvidence:'You purchased this'}};
    const rows=[prime('purchase'),prime('prime-only')];
    await pageA.mergeProviderItems('amazon-video',rows);
    const original=Object.values((await pageA.getDatabase()).providerItems).find(item=>item.providerItemId==='purchase');
    const inferred=items=>pageA.replaceProviderItems('amazon-video',items,{},completeProviderSnapshot('amazon-video',items,[completedScope('library',items.length,null,'scroll-end',8)]));
    await inferred([purchase,rows[1]]);
    await pageA.replaceProviderItems('amazon-video',rows,{},snapshotFixture('amazon-video',rows));
    for(let n=0;n<2;n++){await pageA.mergeProviderItems('amazon-video',[purchase,rows[1]]);await inferred(rows);}
    let db=await pageA.getDatabase(),saved=db.providerItems[original.id];
    assert.equal(saved.ownership,'owned');assert.equal(saved.recordRef,original.recordRef);assert.equal(Object.keys(db.providerItems).length,2);
    assert(saved.metadata.ownershipEvidence.includes('You purchased this'));assert(saved.metadata.ownershipEvidence.includes('Included with Prime'));
    assert.equal(Object.values(db.providerItems).find(item=>item.providerItemId==='prime-only').ownership,'subscription');
    await pageA.saveOwnershipCorrections([{recordRef:saved.recordRef,provider:saved.provider,profileId:saved.profileId,expectedReviewRef:null}],{ownership:'returned'});
    await inferred(rows);db=await pageA.getDatabase();assert.equal(effectiveOwnershipRecord(db.providerItems[original.id],db).ownership,'returned');
    await pageA.restoreDatabase(parseBackup(createBackup(db)));db=await pageA.getDatabase();
    assert.equal(db.providerItems[original.id].ownership,'owned');assert.equal(effectiveOwnershipRecord(db.providerItems[original.id],db).ownership,'returned');
  })],
  ['Amazon Video inferred reconciliation still rejects malformed complete-snapshot attestations', () => withWorker(async ({pageA}) => {
    const items=[{providerItemId:'one',title:'Retained movie',mediaType:'movie',ownership:'owned'}];
    await pageA.mergeProviderItems('amazon-video',items);const before=await pageA.getDatabase();
    const snapshot=completeProviderSnapshot('amazon-video',items,[completedScope('library',1,null,'scroll-end',8)]);
    await assert.rejects(pageA.replaceProviderItems('amazon-video',items,{syncMode:'full'},{...snapshot,itemCount:2}),/snapshot item count/);
    await assert.rejects(pageA.replaceProviderItems('amazon-video',items,{syncMode:'full'},{...snapshot,scopes:[{...snapshot.scopes[0],readCount:2}]}),/inconsistent library completion/);
    await assert.rejects(pageA.replaceProviderItems('amazon-video',items,{syncMode:'full'},{...snapshot,scopes:[{...snapshot.scopes[0],end:'pagination-end'}]}),/supported completion evidence/);
    assert.deepEqual(await pageA.getDatabase(),before);
  })],
  ['Amazon Video rejects a scroll limit instead of certifying a partial library', async () => {
    const scrollingElement = { scrollTop: 0, scrollHeight: 1000 };
    const context = providerContext('amazon-video', async () => { throw new Error('No fetch expected.'); }, {
      innerHeight: 500,
      scrollTo: ({ top }) => { scrollingElement.scrollTop = Math.max(0, top - 500); scrollingElement.scrollHeight += 1000; },
      document: { scrollingElement, querySelectorAll: () => [], querySelector: () => null, body: { textContent: 'Purchases' } }
    });
    await assert.rejects(context.GalacticAmazonVideo.fetchAmazonVideoLibrary(), /250-pass limit/u);
  }],
  ['Audible rejects a non-library page instead of treating it as the end', async () => {
    const context = providerContext('audible', async () => ({ ok: true, text: async () => 'Signed-out page' }), {
      DOMParser: class { parseFromString() { return { querySelector: () => null }; } }
    });
    await assert.rejects(context.GalacticAudible.fetchAudibleAudiobooks(), /without its library structure/u);
  }],
  ['Humble aborts a full scan when one purchase detail is malformed', async () => {
    const context = providerContext('humble', async (url) => {
      if (url.startsWith('/api/v1/user/')) return json([{ gamekey: 'order-1' }, { gamekey: 'order-2' }]);
      return { ok: true, text: async () => JSON.stringify(url.includes('order-1')
        ? { subproducts: [{ human_name: 'Game One', platform: 'steam', id: 'game-one' }] }
        : { unexpected: 'response' }) };
    });
    await assert.rejects(context.GalacticHumble.fetchHumblePurchases(), /1 Humble purchase could not be read; no library changes/u);
    const quick = await context.GalacticHumble.fetchHumblePurchases(() => {}, []);
    assert.equal(quick.items.length, 1);
    assert.equal(quick.failures.length, 1);
    assert.equal(quick.snapshot, undefined);
  }],
  ['Fanatical malformed MAIN-world order cannot produce an accepted full projection', () => withWorker(async (worker) => {
    const before = await seed(worker);
    globalThis.chrome.scripting = { executeScript: async ({ func, args }) => {
      const context = vm.createContext({
        crypto: webcrypto, TextEncoder, AbortController, setTimeout, clearTimeout, URL,
        localStorage: { getItem: () => JSON.stringify({ token: 'fixture-not-a-real-token' }) },
        fetch: async (url) => json(url === '/api/user/orders'
          ? [{ _id: 'order-one', status: 'COMPLETE' }, { _id: 'order-two', status: 'COMPLETE' }]
          : url.endsWith('order-one')
            ? { status: 'COMPLETE', items: [{ bundles: [{ games: [{ _id: 'game-one', name: 'Game One', display_type: 'game' }] }] }] }
            : { status: 'COMPLETE', items: {} })
      });
      const result = await vm.runInContext(`(${func.toString()})`, context)(...args);
      return [{ result: plain(result) }];
    } };
    const response = await worker.dispatch({ type: 'FETCH_FANATICAL_ORDERS', fullScan: true }, {
      id: kindleSender.id, url: 'https://www.fanatical.com/en/orders', tab: { id: 1 }
    });
    assert.equal(response.ok, false);
    assert.match(response.error, /unreadable or incomplete/u);
    assert.deepEqual(worker.memory.values, before);
  })],
  ['Kobo rejects missing library structure and excessive reported page counts', async () => {
    let document = { querySelector: () => null, body: { textContent: 'Sign in' } };
    const context = providerContext('kobo', async () => ({ ok: true, text: async () => '' }), {
      DOMParser: class { parseFromString() { return document; } }
    });
    await assert.rejects(context.GalacticKobo.fetchKoboLibrary(), /without readable library structure/u);
    document = {
      querySelector: () => ({}),
      querySelectorAll: (selector) => selector.startsWith('.page-link') ? [{ getAttribute: () => '501' }] : [],
      body: { textContent: '' }
    };
    await assert.rejects(context.GalacticKobo.fetchKoboLibrary(), /exceeding the 500-page scan limit/u);
  }],
  ['Amazon Games requires all-year selection and rejects unexhausted load-more pagination', async () => {
    const context = providerContext('amazon-games', async () => { throw new Error('No fetch expected.'); }, {
      document: { querySelectorAll: () => [], querySelector: () => null }
    });
    await assert.rejects(context.GalacticAmazonGames.fetchAmazonGames(), /complete collection year list/u);
    const year = { textContent: '2026', getAttribute: () => '2026', click: () => {} };
    let clicks = 0;
    const more = { textContent: 'See 10 more', click: () => { clicks += 1; } };
    const document = {
      querySelectorAll: (selector) => selector.includes('flyout') ? [year] : selector === 'button, [role="button"], a' ? [more] : [],
      querySelector: (selector) => selector.includes('time-window-filter-dropdown') ? { getAttribute: () => '2026' } : null,
      scrollingElement: { scrollTop: 0, scrollHeight: 500 },
      body: { textContent: 'No games' }
    };
    const limit = providerContext('amazon-games', async () => {}, { document, innerHeight: 500, scrollY: 0, scrollTo: () => {} });
    await assert.rejects(limit.GalacticAmazonGames.fetchAmazonGames(), /180-pass limit/u);
    assert.equal(clicks, 180);
  }],
  ['Fandango refuses full scans without both totals and incomplete View All grids', async () => {
    const context = providerContext('fandango-at-home', async () => {}, {
      location: { origin: 'https://athome.fandango.com', pathname: '/content/browse/mylibrary' },
      document: { querySelectorAll: () => [], querySelector: () => null, scrollingElement: { scrollHeight: 500, scrollTop: 0 } },
      innerHeight: 500, scrollY: 0, scrollTo: () => {}
    });
    await assert.rejects(context.GalacticFandangoAtHome.fetchFandangoLibrary(), /both library totals/u);
    await assert.rejects(context.GalacticFandangoAtHome.readFandangoGrid('movie', 346), /scan limit or loading timeout/u);
    assert.throws(() => completeProviderSnapshot('fandango-at-home', [], [completedScope('movie', 0, 0, 'reported-count')]), /required library section/u);
  }]
];
