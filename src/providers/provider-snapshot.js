/* Shared by classic provider scripts and the service-worker writer. */
(function attachProviderSnapshot(global) {
  'use strict';
  const END_REASONS = ['reported-count', 'pagination-end', 'scroll-end', 'index-complete'];
  const count = (value) => Number.isSafeInteger(value) && value >= 0;

  function validateProviderSnapshot(provider, items, snapshot) {
    const fail = (message) => { throw new Error(`${provider} full scan is incomplete: ${message} Previous library records were kept.`); };
    if (provider === 'amazon-video' && snapshot?.complete === false) {
      const scope = snapshot.scopes?.[0];
      if (snapshot.version !== 1 || snapshot.provider !== provider || !Array.isArray(items) || !items.length || items.length > 50000
          || snapshot.itemCount !== items.length || new Set(items.map(item => item?.providerItemId)).size !== items.length
          || items.some(item => typeof item?.providerItemId !== 'string' || !item.providerItemId.trim() || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500
            || !['movie', 'tv'].includes(item.mediaType) || !['owned', 'rental', 'subscription', 'unknown'].includes(item.ownership))
          || !Array.isArray(snapshot.scopes) || snapshot.scopes.length !== 1 || scope?.id !== 'library' || scope.complete !== false || scope.limitReached !== false
          || scope.end !== 'partial-acquisition' || scope.expectedCount !== null || scope.readCount !== items.length || !count(scope.pagesRead) || scope.pagesRead < 1 || scope.pagesRead > 250
          || !count(snapshot.recovery?.unreadableCards) || snapshot.recovery.unreadableCards < 1 || snapshot.recovery.unreadableCards > 50000) fail('Invalid Amazon Video partial acquisition.');
      return snapshot;
    }
    // GOG/Epic receipts authorize additive saves only, never absence-based reconciliation.
    if(['gog','epic'].includes(provider)&&snapshot?.complete===false){
      const scope=snapshot.scopes?.[0];
      if(snapshot.version!==1||snapshot.provider!==provider||!Array.isArray(items)||!items.length||snapshot.itemCount!==items.length
        ||new Set(items.map(item=>item.providerItemId)).size!==items.length||items.some(item=>typeof item.providerItemId!=='string'||!item.providerItemId.trim()||typeof item.title!=='string'||!item.title.trim()||item.ownership!=='owned'||!(provider==='gog'?['game']:['game','game-addon']).includes(item.mediaType))
        ||!Array.isArray(snapshot.scopes)||snapshot.scopes.length!==1||scope?.id!=='library'||scope.complete!==false||scope.limitReached!==false||scope.end!=='partial-acquisition'||scope.expectedCount!==null||scope.readCount!==items.length||!count(scope.pagesRead)||scope.pagesRead<1||scope.pagesRead>1000
        ||!snapshot.recovery||!count(snapshot.recovery.failedItems)||snapshot.recovery.failedItems>50000)fail('Invalid partial library acquisition.');
      return snapshot;
    }
    if(provider==='humble'&&snapshot?.complete===false){
      const scope=snapshot.scopes?.[0],successful=snapshot.successfulPurchaseIds,failed=snapshot.failedPurchaseIds;
      const verified=new Set(Array.isArray(successful)?successful:[]);
      const keys=value=>Array.isArray(value)&&value.length>0&&value.length<=50000&&value.every(id=>typeof id==='string'&&id.trim()===id&&id.length>0&&id.length<=256)&&new Set(value).size===value.length;
      if(snapshot.version!==1||snapshot.provider!==provider||!Array.isArray(items)||!keys(successful)||!keys(failed)
        ||failed.some(id=>verified.has(id))||snapshot.itemCount!==new Set(items.map(i=>i.providerItemId)).size
        ||items.some(i=>!verified.has(i.metadata?.purchaseId)||typeof i.providerItemId!=='string'||!i.providerItemId.startsWith(i.metadata.purchaseId+':'))
        ||!Array.isArray(snapshot.scopes)||snapshot.scopes.length!==1||scope?.id!=='purchases'||scope.complete!==false||scope.limitReached!==false||scope.end!=='partial-acquisition'
        ||scope.readCount!==successful.length||scope.expectedCount!==successful.length+failed.length||scope.pagesRead!==scope.expectedCount)fail('Invalid Humble partial acquisition.');
      return snapshot;
    }
    // Fanatical can finish acquiring a headerless order array without proving
    // that the array enumerates the account. This receipt grants additive
    // persistence only; it must never be treated as a complete snapshot.
    if (provider === 'fanatical' && snapshot?.complete === false) {
      const scope = snapshot.scopes?.[0];
      const recovery=snapshot.recovery;
      if(recovery!==undefined){
        const hashes=value=>Array.isArray(value)&&value.length<=50000&&value.every(id=>typeof id==='string'&&/^[a-f0-9]{64}$/u.test(id))&&new Set(value).size===value.length;
        if(!hashes(recovery?.orderFingerprints)||!hashes(recovery?.failedOrderFingerprints)||!recovery.orderFingerprints.length
          ||recovery.failedOrders!==recovery.failedOrderFingerprints.length||typeof recovery.listingIncomplete!=='boolean'||!count(recovery.ordersSkipped)
          ||!recovery.failedOrders&&!recovery.listingIncomplete||recovery.failedOrderFingerprints.some(id=>recovery.orderFingerprints.includes(id))
          ||recovery.ordersAvailable!==recovery.orderFingerprints.length+recovery.failedOrders||scope?.readCount+recovery.ordersSkipped!==recovery.orderFingerprints.length
          ||items.some(item=>!item.metadata?.purchaseOrigins?.length||item.metadata.purchaseOrigins.some(origin=>!recovery.orderFingerprints.includes(origin.orderRef))))fail('Invalid Fanatical partial purchase evidence.');
      }
      if (snapshot.version !== 1 || snapshot.provider !== provider || !Array.isArray(items)
        || !count(snapshot.itemCount) || snapshot.itemCount !== new Set(items.map(item=>String(item?.providerItemId??'').trim())).size
        || !Array.isArray(snapshot.scopes) || snapshot.scopes.length !== 1 || scope?.id !== 'orders'
        || scope.complete !== false || scope.limitReached !== false || scope.end !== (recovery?'partial-acquisition':'acquisition-end')
        || scope.expectedCount !== null || !count(scope.readCount) || (recovery?(!count(scope.pagesRead)||scope.pagesRead<1||scope.pagesRead>1000):scope.pagesRead!==1)) fail('Invalid Fanatical acquisition receipt.');
      return snapshot;
    }
    if (!snapshot || snapshot.version !== 1 || snapshot.provider !== provider || snapshot.complete !== true) fail('A validated complete snapshot is required.');
    if (!Array.isArray(items) || !count(snapshot.itemCount) || snapshot.itemCount !== new Set(items.map((item) => String(item?.providerItemId ?? '').trim())).size) fail('The snapshot item count does not match the import.');
    if (!Array.isArray(snapshot.scopes) || !snapshot.scopes.length) fail('No completed library sections were reported.');
    const names = new Set();
    for (const scope of snapshot.scopes) {
      if (!scope || typeof scope.id !== 'string' || !scope.id || names.has(scope.id)) fail('Invalid library section evidence.');
      names.add(scope.id);
      if (scope.complete !== true || scope.limitReached !== false || !END_REASONS.includes(scope.end) || !count(scope.pagesRead) || scope.pagesRead < 1 || !count(scope.readCount)) fail(`The ${scope.id} section did not reach a validated end.`);
      if (scope.expectedCount !== null && (!count(scope.expectedCount) || scope.expectedCount !== scope.readCount)) fail(`The ${scope.id} section reported ${scope.expectedCount} items but returned ${scope.readCount}.`);
      if (scope.expectedCount === null && scope.readCount === 0) fail(`The ${scope.id} section was empty without an explicit zero count.`);
      if (scope.end === 'reported-count' && scope.expectedCount === null) fail(`The ${scope.id} section did not provide its total.`);
    }
    const required = provider === 'kindle' ? ['books', 'personal-documents'] : provider === 'fandango-at-home' ? ['movie', 'tv'] : [];
    if (required.some((id) => !names.has(id))) fail('A required library section was not scanned.');
    if (provider === 'kindle') {
      if (snapshot.scopes.some((scope) => !count(scope.duplicateCount) || scope.duplicateCount > scope.readCount)) fail('Kindle duplicate-ID counts were not explained.');
      if (snapshot.scopes.reduce((total, scope) => total + scope.readCount - scope.duplicateCount, 0) !== snapshot.itemCount) fail('Kindle returned entries that were neither imported nor explained as duplicate IDs.');
    }
    return snapshot;
  }

  function completeProviderSnapshot(provider, items, scopes) {
    const snapshot = { version: 1, provider, complete: true, itemCount: new Set(items.map((item) => String(item.providerItemId).trim())).size, scopes };
    return validateProviderSnapshot(provider, items, snapshot);
  }

  function completedScope(id, readCount, expectedCount = null, end = 'pagination-end', pagesRead = 1) {
    return { id, readCount, expectedCount, end, pagesRead, complete: true, limitReached: false };
  }

  global.GalacticProviderSnapshot = { validateProviderSnapshot, completeProviderSnapshot, completedScope };
}(globalThis));
