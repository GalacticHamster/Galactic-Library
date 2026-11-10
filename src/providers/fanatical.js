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
          ...(['unknown','unrevealed'].includes(source.keyStatus)&&typeof source.keyCheckedAt==='string'?{keyStatus:source.keyStatus,keyCheckedAt:source.keyCheckedAt}:{}),
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
    // Diagnostic counters only; never copy provider values or arbitrary keys.
    const fields=['unsupportedStatus','invalidStatus','missingItems','invalidItems','missingBundles','invalidBundles','missingGames','invalidGames','missingNames','summaryConflict','detailRequest','detailStructure','detailIdentity','detailStatus','detailProductMismatch','detailProductIdentity','detailProjection','scheduled','knownSkipped','multipleCopies'];
    const c=value.compatibility;
    if(c?.version===1&&Object.keys(c).every(k=>['version','counts','bundleShapes','summaryRecovery','productMismatches'].includes(k))&&c.counts&&Object.keys(c.counts).length===fields.length&&fields.every(k=>Number.isSafeInteger(c.counts[k])&&c.counts[k]>=0&&c.counts[k]<=100000)){
      const clean={version:1,counts:Object.fromEntries(fields.map(k=>[k,c.counts[k]]))};let valid=true;
      if(c.summaryRecovery!==undefined){
        const r=c.summaryRecovery,counts=['eligible','scheduled','recovered','unresolved','emptyDetailItems'],types=['missing','null','array','object','string','number','boolean','other'],bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
        valid=!!r&&r.version===1&&Object.keys(r).length===7&&Object.keys(r).every(k=>['version','detailItemTypes',...counts].includes(k))&&counts.every(k=>bounded(r[k]))&&!!r.detailItemTypes&&Object.keys(r.detailItemTypes).length===types.length&&types.every(k=>bounded(r.detailItemTypes[k]))&&r.scheduled<=r.eligible&&r.recovered+r.unresolved<=r.scheduled&&r.emptyDetailItems<=r.detailItemTypes.array&&types.reduce((n,k)=>n+r.detailItemTypes[k],0)<=r.scheduled;
        if(valid)clean.summaryRecovery={version:1,...Object.fromEntries(counts.map(k=>[k,r[k]])),detailItemTypes:Object.fromEntries(types.map(k=>[k,r.detailItemTypes[k]]))};
      }
      if(c.bundleShapes!==undefined){
        const s=c.bundleShapes,types=['missing','null','array','object','string','number','boolean','other'];
        const typed=['parentType','bundlesType','parentId','parentName','parentGames','parentProducts','parentItems','parentTiers','bundleGames','bundleProducts','bundleItems','bundleTiers','childType','childId','childName','childGames','childProducts','childItems','childTiers'],keys=['stage','reason','bundlesSize',...typed];
        valid=valid&&!!s&&s.version===1&&Object.keys(s).length===3&&Object.keys(s).every(k=>['version','records','truncated'].includes(k))&&typeof s.truncated==='boolean'&&Array.isArray(s.records)&&s.records.length<=8&&s.records.every(r=>r&&Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k))&&['summaries','details'].includes(r.stage)&&['missing','empty-array','non-array','missingItems','invalidItems','missing-parent-name','missing-leaf-name','missingBundles','invalidBundles','missingGames','invalidGames'].includes(r.reason)&&['not-container','empty','one','many'].includes(r.bundlesSize)&&typed.every(k=>types.includes(r[k])));
        if(valid)clean.bundleShapes={version:1,records:s.records.map(r=>Object.fromEntries(keys.map(k=>[k,r[k]]))),truncated:s.truncated};
      }
      if(c.productMismatches!==undefined){
        const pm=c.productMismatches,cats=['parent-missing','unexpected-detail-item','id-missing','direct-missing','product-missing','product-count'],bounded=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
        valid=valid&&!!pm&&pm.version===1&&Object.keys(pm).length===3&&Object.keys(pm).every(k=>['version','records','truncated'].includes(k))&&typeof pm.truncated==='boolean'&&Array.isArray(pm.records)&&pm.records.length<=8&&pm.records.every(r=>r&&typeof r==='object'&&Object.keys(r).length===3&&Object.keys(r).every(k=>['category','expectedCount','observedCount'].includes(k))&&cats.includes(r.category)&&bounded(r.expectedCount)&&bounded(r.observedCount));
        if(valid)clean.productMismatches={version:1,records:pm.records.map(r=>({category:r.category,expectedCount:r.expectedCount,observedCount:r.observedCount})),truncated:pm.truncated};
      }
      if(valid)report.compatibility=clean;
    }
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
  function formatScanSummary(summary = {}, options = {}) {
    const fullScan = options.fullScan ?? (summary.scanMode === 'full') ?? (options.mode === 'full') ?? false;
    const isFailed = summary.outcome === 'failed' || Boolean(summary.error);
    const isPartial = !isFailed && (
      summary.outcome === 'partial-extraction' ||
      summary.outcome === 'partial-discovery' ||
      summary.outcome === 'partial' ||
      Boolean(summary.recovery) ||
      Boolean(summary.unresolvedOrders)
    );

    let title = '';
    let detail = '';
    let library = '';

    if (isFailed) {
      title = 'Import failed';
      const cat = summary.category ?? (
        /auth|sign.?in|session|401|403|denied/iu.test(summary.error ?? '') ? 'authentication'
        : /account|profile|mismatch|switch/iu.test(summary.error ?? '') ? 'scope'
        : /storage|quota|disk|save/iu.test(summary.error ?? '') ? 'storage'
        : /rate|cooldown|delay|limit/iu.test(summary.error ?? '') ? 'limit'
        : /network|unavailable|timeout|connect|503/iu.test(summary.error ?? '') ? 'unavailable'
        : 'shape'
      );

      switch (cat) {
        case 'authentication':
          detail = "Couldn't access your Fanatical purchases. Make sure you're signed in to Fanatical, then try again.";
          break;
        case 'scope':
          detail = "The signed-in account doesn't match your saved library. Check your active account, then try again.";
          break;
        case 'storage':
          detail = "Couldn't save your purchases locally. Check available browser storage, then try again.";
          break;
        case 'limit':
          detail = "Fanatical requested a temporary delay before checking more purchases. Please try again later.";
          break;
        case 'unavailable':
        case 'listing':
          detail = "Fanatical didn't respond or is currently unavailable. Check your connection, then try again.";
          break;
        default:
          detail = "Couldn't read purchase information from Fanatical. Please try again later.";
          break;
      }

      library = 'Your existing library was not changed.';
    } else if (isPartial) {
      title = fullScan ? 'Full import partially completed' : 'Quick update partially completed';
      const unresolved = summary.unresolvedOrders ?? summary.recovery?.failedOrders ?? 0;
      const listingIncomplete = Boolean(summary.listingIncomplete ?? summary.recovery?.listingIncomplete ?? (summary.outcome === 'partial-discovery'));
      const retryable = summary.retryable ?? (summary.retry !== 'none');

      const retrySuffix = retryable
        ? (unresolved === 1 && !listingIncomplete ? ' It will be retried on your next update.' : ' They will be retried on your next update.')
        : '';

      if (unresolved > 0 && listingIncomplete) {
        detail = `Couldn't check ${unresolved} purchase${unresolved === 1 ? '' : 's'} and part of your purchase list could not be reached.${retrySuffix}`;
      } else if (unresolved > 0) {
        detail = `Couldn't check ${unresolved} purchase${unresolved === 1 ? '' : 's'}.${retrySuffix}`;
      } else if (listingIncomplete) {
        detail = `Part of your purchase list couldn't be checked.${retryable ? ' It will be retried on your next update.' : ''}`;
      } else {
        detail = `Some purchase details couldn't be verified.${retryable ? ' They will be retried on your next update.' : ''}`;
      }

      const saved = summary.verifiedPurchasesSaved ?? summary.ordersScanned ?? 0;
      const added = summary.addedProducts ?? summary.addedItems ?? (Array.isArray(summary.items) ? summary.items.length : 0);
      const total = summary.ownedLeafProducts ?? summary.totalItems ?? summary.itemCount;

      let activity = '';
      if (saved > 0 && added > 0) {
        activity = `Saved ${saved} purchase${saved === 1 ? '' : 's'} and added ${added} item${added === 1 ? '' : 's'}.`;
      } else if (saved > 0 && added === 0) {
        activity = `Saved ${saved} purchase${saved === 1 ? '' : 's'}. No new items found.`;
      } else if (saved === 0 && added > 0) {
        activity = `Added ${added} new item${added === 1 ? '' : 's'}.`;
      } else {
        activity = 'No purchases were saved.';
      }

      let libraryStatus = '';
      if (Number.isSafeInteger(total)) {
        libraryStatus = `Your library now contains ${total} item${total === 1 ? '' : 's'}. Earlier records were preserved.`;
      } else {
        libraryStatus = 'Earlier records were preserved.';
      }

      library = `${activity} ${libraryStatus}`;
    } else {
      title = fullScan ? 'Full import completed' : 'Quick update completed';
      const checked = summary.ordersScanned ?? 0;
      const added = summary.addedProducts ?? summary.addedItems ?? (Array.isArray(summary.items) ? summary.items.length : 0);
      const total = summary.ownedLeafProducts ?? summary.totalItems ?? summary.itemCount ?? 0;

      if (added > 0) {
        if (checked === 0) {
          detail = `No purchases needed checking. Imported ${added} new item${added === 1 ? '' : 's'}.`;
        } else {
          detail = `Checked ${checked} purchase${checked === 1 ? '' : 's'}. Imported ${added} new item${added === 1 ? '' : 's'}.`;
        }
      } else {
        if (checked === 0) {
          detail = fullScan ? 'No purchases found in your account.' : 'No purchases needed checking. No new items found.';
        } else {
          detail = `Checked ${checked} purchase${checked === 1 ? '' : 's'}. No new items found.`;
        }
      }

      library = `${total} item${total === 1 ? '' : 's'} in your library.`;
    }

    const lines = [title, detail, library].filter(Boolean);
    const text = lines.join('\n\n');
    const htmlLines = [`<strong>${title}</strong>`, detail, library].filter(Boolean);
    const html = htmlLines.join('\n\n');

    return {
      title,
      detail,
      library,
      text,
      html,
      toString() { return text; }
    };
  }

  global.GalacticFanatical = { formatScanSummary, fanaticalMediaType, fanaticalItemsFromProjection, scanReport, failureReport, failureMessage,scanProgress,progressMessage };
}(globalThis));
