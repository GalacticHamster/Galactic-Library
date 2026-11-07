/* Fanatical import projection. Authentication happens only in the page's MAIN
 * world; this isolated-world code sees the already allowlisted DTO. */
(function attachFanaticalImporter(global) {
  'use strict';

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function safeList(value, max = 30) {
    return [...new Set((Array.isArray(value) ? value : []).map((entry) => compactText(entry)).filter(Boolean))].slice(0, max);
  }

  function fanaticalMediaType(value) {
    const type = compactText(value).toLocaleLowerCase();
    if (type === 'game') return 'game';
    if(type==='software'||type==='asset')return 'software';
    if (type === 'book' || type.includes('comic')) return 'book';
    if (type === 'audiobook' || (type.includes('audio') && type.includes('book'))) return 'audiobook';
    return null;
  }

  function fanaticalItemsFromProjection(value) {
    const itemsById = new Map();
    for (const source of Array.isArray(value?.items) ? value.items : []) {
      const providerItemId = compactText(source?.sourceItemId);
      const title = compactText(source?.title);
      const mediaType = fanaticalMediaType(source?.mediaType);
      if (!providerItemId || !title || !mediaType) continue;
      const steamAppId = compactText(source?.externalIds?.steamAppId);
      const isbn = compactText(source?.externalIds?.isbn);
      itemsById.set(providerItemId, {
        providerItemId,
        title,
        mediaType,
        ownership: 'owned',
        platform: safeList(source?.platforms),
        acquiredAt: typeof source?.purchaseDate === 'string' && !Number.isNaN(Date.parse(source.purchaseDate)) ? source.purchaseDate : null,
        metadata: {
          ...(global.GalacticProviderMetadata?.extract(source?.bibliographic) ?? {}),
          source: 'fanatical-order-history',
          bundleId: compactText(source?.bundle?.sourceItemId),
          bundleTitle: compactText(source?.bundle?.title),
          bundleSlug: compactText(source?.bundle?.slug),
          slug: compactText(source?.slug),
          drm: safeList(source?.drm),
          formats: safeList(source?.formats),
          ...(Array.isArray(source?.purchaseOrigins)?{purchaseOrigins:source.purchaseOrigins}:{}),
          ...(steamAppId ? { steamAppId } : {}),
          ...(isbn ? { isbn } : {})
        }
      });
    }
    return [...itemsById.values()];
  }

  const categories=['none','authentication','shape','listing','continuation','summary','detail','limit','scope','unknown','unavailable','validation','storage'];
  const stages=['initial-listing','pagination','summaries','details','projection','execution','validation','save'];
  const counters=['pagesAttempted','pagesParsed','ordersDiscovered','ordersValidated','ordersUnresolved','detailsAttempted','detailsParsed'];
  // Copy only allowlisted fields. Neither this report nor a failure grants save authority.
  function scanReport(value) {
    if(value?.version!==1||!categories.includes(value.category)||!stages.includes(value.stage))return null;
    if(typeof value.countsAvailable!=='boolean')return null;
    const report={version:1,countsAvailable:value.countsAvailable,category:value.category,stage:value.stage};
    for(const key of counters){if(!value.countsAvailable&&value[key]===null){report[key]=null;continue;}if(!value.countsAvailable||!Number.isSafeInteger(value[key])||value[key]<0||value[key]>100000)return null;report[key]=value[key];}
    if(report.pagesParsed>report.pagesAttempted||report.detailsParsed>report.detailsAttempted||report.ordersValidated>report.ordersDiscovered||report.ordersUnresolved>report.ordersDiscovered)return null;
    for(const key of ['continuationPending','acquisitionFinished']){if(typeof value[key]!=='boolean')return null;report[key]=value[key];}
    return report;
  }
  function failureReport(category='unavailable',stage='execution') {
    return {version:1,countsAvailable:false,category,stage,...Object.fromEntries(counters.map(key=>[key,null])),continuationPending:false,acquisitionFinished:false};
  }
  function failureMessage(category) {
    const reason={authentication:'Fanatical could not authorize the request. Sign in to Fanatical, then retry.',shape:'Fanatical returned an unrecognized purchase list. Retry later; export the scan report if this continues.',listing:'The purchase list could not be loaded. Retry the import.',continuation:'The next purchase page could not be verified. Retry the import.',summary:'A purchase could not be read safely. Retry later; export the scan report if this continues.',detail:'Purchase details could not be read. Retry the import.',limit:'The scan reached a safety limit. Export the scan report for support.',scope:'The signed-in account or purchase history changed. Check the selected account before retrying.',validation:'The purchase information could not be validated. Retry later; export the scan report if this continues.',storage:'The purchases could not be saved locally. Check available browser storage, then retry.',unknown:'The purchase check stopped unexpectedly. Retry later; export the scan report if this continues.',unavailable:'The purchase check returned no usable result. Reload the Fanatical page, then retry.'};
    return `${reason[category]??reason.unavailable} No purchases were saved by this attempt; earlier records were kept.`;
  }
  function scanProgress(value){
    if(!value||!['listing','details','retry','validating'].includes(value.phase))return null;
    const result={phase:value.phase};
    for(const key of ['sequence','pages','discovered','scheduled','completed','failed','active','retries','validatedItems','elapsedMs']){
      const max=key==='elapsedMs'?Number.MAX_SAFE_INTEGER:key==='validatedItems'?500000:key==='retries'?300000:key==='sequence'?1000000:100000;
      if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>max)return null;result[key]=value[key];
    }
    if(result.completed>result.scheduled||result.active>3||result.completed+result.active>result.scheduled||result.failed>result.completed)return null;
    return result;
  }
  function progressMessage(p){
    if(p.phase==='listing')return 'Reading Fanatical purchase pages: '+p.pages+' read | '+p.discovered+' purchases found';
    if(p.phase==='validating')return 'Checking acquired purchase information';
    return (p.phase==='retry'?'Retrying a purchase request':'Reading purchase details')+': '+p.completed+' of '+p.scheduled+' checked | '+p.active+' active'+(p.failed?' | '+p.failed+' unreadable':'')+(p.retries?' | '+p.retries+' retries':'');
  }
  global.GalacticFanatical = { fanaticalMediaType, fanaticalItemsFromProjection, scanReport, failureReport, failureMessage,scanProgress,progressMessage };
}(globalThis));
