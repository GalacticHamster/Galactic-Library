/* Epic Games Store importer. It runs only after a user selects sync in an
 * already signed-in Epic Store tab; passwords, cookies, and tokens are never
 * read, copied, or stored by this extension. */
(function attachEpicImporter(global) {
  'use strict';
  const MAX_PAGES = 500;
  let diagnostics=null,reading=false;
  const sessionMessage='Epic Games could not authorize the library request. Sign in on Epic or finish verifying your session, then retry Sync Epic library. Complete any security check Epic shows. Your saved library is unchanged.';
  function pageState(){
    const element=global.document?.querySelector('input[type="password"],iframe[src*="captcha" i],[data-testid*="captcha" i]');
    const style=element?global.getComputedStyle?.(element):null;
    const visible=element&&element.hidden!==true&&element.getAttribute?.('aria-hidden')!=='true'&&element.getClientRects?.().length>0&&style?.visibility!=='hidden'&&style?.display!=='none'&&style?.opacity!=='0';
    return {documentReady:global.document?.readyState==='complete',securityCheckVisible:Boolean(visible)};
  }
  function failure(kind,httpStatus=null,upstreamStatus=null){
    if(diagnostics&&!diagnostics.firstFailure)diagnostics.firstFailure={stage:'library',kind,httpStatus,upstreamStatus,...pageState()};
    const librarySession=kind==='authorization'&&httpStatus===200&&upstreamStatus===401;
    const error=Error(librarySession?"Epic did not authorize the library request, even if the site shows you as signed in. Open My Achievements from Epic's profile menu, then retry Sync Epic library. If that does not work, sign in again and retry. Your saved library hasn't changed.":['authorization','forbidden'].includes(kind)?sessionMessage:kind==='network'?'Epic Games could not connect to its library. Check your connection and retry. Your saved library is unchanged.':'Epic Games could not read your library. Retry later. Your saved library is unchanged.');
    error.epicFailure=librarySession?'library-session':kind;return error;
  }
  function upstreamStatus(errors){
    for(const error of errors){
      const status=error?.extensions?.http?.status??error?.extensions?.status;
      if([401,403].includes(status))return status;
      if(error?.extensions?.code==='UNAUTHENTICATED')return 401;
      if(error?.extensions?.code==='FORBIDDEN')return 403;
      const match=/(?:status code|http|status)\s*:?\s*(401|403)\b/iu.exec(typeof error?.message==='string'?error.message:'');
      if(match)return Number(match[1]);
    }
    return null;
  }
  function getDiagnostics(){return diagnostics?JSON.parse(JSON.stringify(diagnostics)):null;}
  function recordSaveState(state){if(diagnostics&&['not-requested','requested','saved','save-rejected'].includes(state))diagnostics.saveState=state;}

  const USER_LIBRARY_QUERY = `query getUserLibrary($cursor: String, $locale: String) {
    Library {
      libraryItems(cursor: $cursor, params: {includeMetadata: true}) {
        records {
          catalogItemId
          namespace
          sandboxType
          product { supportedTypes }
          catalogItem(locale: $locale) {
            id
            title
            categories { path }
            mainGameItem { id }
            releaseInfo { platform }
          }
        }
        responseMetadata { nextCursor }
      }
    }
  }`;

  function platformsFromRecord(record) {
    const releaseInfo = Array.isArray(record?.catalogItem?.releaseInfo) ? record.catalogItem.releaseInfo : [];
    return [...new Set(releaseInfo.map((item) => String(item?.platform ?? '').trim().toLowerCase()).filter(Boolean))];
  }

  function epicItemsFromLibraryPage(value) {
    const items = [];
    const skipped = [];
    const records = value?.data?.Library?.libraryItems?.records ?? value?.Library?.libraryItems?.records ?? [];
    for (const record of records) {
      const providerItemId = String(record?.catalogItem?.id ?? record?.catalogItemId ?? '').trim();
      const title = String(record?.catalogItem?.title ?? '').replace(/\s+/gu, ' ').trim();
      const parentProviderItemId = String(record?.catalogItem?.mainGameItem?.id ?? '').trim();
      const supportedTypes = (Array.isArray(record?.product?.supportedTypes) ? record.product.supportedTypes : []).map((type) => String(type).toUpperCase());
      const categoryPaths = (Array.isArray(record?.catalogItem?.categories) ? record.catalogItem.categories : [])
        .map((category) => String(category?.path ?? '').toLowerCase())
        .filter(Boolean);
      // Unreal Engine assets and private/testing entries are not Epic Games
      // Store games. Other unknown items stay out of the game count unless
      // Epic identifies them as a game or an add-on for a main game.
      if (!providerItemId || !title || record?.namespace === 'ue' || record?.sandboxType === 'PRIVATE') {
        skipped.push(providerItemId || '(missing ID)');
        continue;
      }
      const hasGameCategory = categoryPaths.some((path) => path === 'games' || path.startsWith('games/') || path === 'bundles/games');
      const isAddOn = Boolean(parentProviderItemId) || supportedTypes.includes('DLC') || categoryPaths.some((path) => path.includes('/dlc'));
      const hasExplicitNonGameType = supportedTypes.length > 0 && !supportedTypes.includes('GAME') && !supportedTypes.includes('DLC');
      // Some current Epic library records omit supportedTypes even for normal
      // games. A public catalog record with a title is then a safer fallback
      // than dropping the entire owned library; known non-game sources above
      // remain excluded.
      const isGame = supportedTypes.includes('GAME') || hasGameCategory || supportedTypes.length === 0;
      if (!isAddOn && (!isGame || hasExplicitNonGameType && !hasGameCategory)) {
        skipped.push(providerItemId);
        continue;
      }
      items.push({
        providerItemId,
        title,
        mediaType: isAddOn ? 'game-addon' : 'game',
        ownership: 'owned',
        platform: platformsFromRecord(record),
        metadata: {
          source: 'epic-store-library',
          ...(isAddOn ? { parentProviderItemId } : {})
        }
      });
    }
    return { items, skipped };
  }

  function nextCursorFromPage(value) {
    return value?.data?.Library?.libraryItems?.responseMetadata?.nextCursor
      ?? value?.Library?.libraryItems?.responseMetadata?.nextCursor
      ?? null;
  }

  async function fetchLibraryPage(cursor) {
    let response;
    diagnostics.requestsMade++;
    try{response = await fetch('/graphql', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ operationName: 'getUserLibrary', query: USER_LIBRARY_QUERY, variables: { cursor, locale: 'en-US' } })
    });}catch{throw failure('network');}
    diagnostics.httpStatuses[response.status]=(diagnostics.httpStatuses[response.status]??0)+1;
    if (!response.ok) throw failure(response.status===401?'authorization':response.status===403?'forbidden':'http',response.status);
    let body;
    try {
      body = await response.json();
    } catch {
      throw failure('unreadable',response.status);
    }
    if (Array.isArray(body?.errors) && body.errors.length){const status=upstreamStatus(body.errors);throw failure(status===401?'authorization':status===403?'forbidden':'graphql',response.status,status);}
    const library = body?.data?.Library?.libraryItems;
    if (!Array.isArray(library?.records) || !library.responseMetadata || !Object.hasOwn(library.responseMetadata, 'nextCursor')) throw Object.assign(new Error('Epic Games Store returned a malformed library page; no library changes were saved.'),{fatal:true});
    if (library.responseMetadata.nextCursor !== null && (typeof library.responseMetadata.nextCursor !== 'string' || library.responseMetadata.nextCursor!==''&&!library.responseMetadata.nextCursor.trim())) throw failure('invalid-cursor',response.status);
    return body;
  }

  async function fetchEpicGames(reportProgress = () => {}) {
    if(reading)throw Error('An Epic library check is already running. Wait for it to finish.');
    reading=true;
    diagnostics={format:1,provider:'epic',operation:'complete-library',requestsMade:0,pagesRead:0,httpStatuses:{},firstFailure:null,...pageState(),automaticRetries:0,saveState:'not-requested',incomplete:false,failedItems:0,duplicateRecords:0,conflictingIds:0,incompleteReasons:[],terminal:null};
    try{
      const itemsById = new Map();
      const skippedIds = new Set();
      const seenCursors = new Set();
      const definitions = new Map(),conflicts = new Set();
      const markIncomplete=kind=>{incomplete=true;if(!diagnostics.incompleteReasons.includes(kind))diagnostics.incompleteReasons.push(kind);};
      let cursor = null;
      let pagesRead = 0;
      let recordsRead = 0,incomplete=false,failedItems=0,terminalReached=false;
      try { do {
        if (pagesRead >= MAX_PAGES) throw failure('page-limit');
        if (cursor && seenCursors.has(cursor)) throw failure('cursor-loop');
        if (cursor) seenCursors.add(cursor);
        reportProgress({ pagesRead, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
        const page = await fetchLibraryPage(cursor);
        recordsRead += page.data.Library.libraryItems.records.length;
        const records=page.data.Library.libraryItems.records;
        const valid=records.filter(record=>{const ok=record&&typeof record==='object'&&((record.namespace==='ue'||record.sandboxType==='PRIVATE')||(String(record.catalogItem?.id??record.catalogItemId??'').trim()&&String(record.catalogItem?.id??record.catalogItemId??'').trim().length<=500&&typeof record.catalogItem?.title==='string'&&record.catalogItem.title.replace(/\s+/gu,' ').trim().length<=500&&record.catalogItem.title.trim()));if(!ok){markIncomplete('invalid-entry');failedItems++;}return ok;});
        // Deduplicate equivalent observations within and across pages. A
        // conflicting definition is unresolved evidence, never last-write-wins.
        for(const record of valid){
          const {items,skipped}=epicItemsFromLibraryPage({data:{Library:{libraryItems:{records:[record]}}}});
          for(const id of skipped)skippedIds.add(id);
          for (const item of items) {
            const id=item.providerItemId,namespace=record.namespace??null;
            const definition=JSON.stringify({...item,platform:[...item.platform].sort(),namespace});
            if(definitions.has(id)){
              diagnostics.duplicateRecords++;
              if(definitions.get(id)!==definition){
                if(!conflicts.has(id)){conflicts.add(id);diagnostics.conflictingIds++;failedItems++;}
                itemsById.delete(id);markIncomplete('conflicting-entry');
              }
            }else definitions.set(id,definition);
            if(!conflicts.has(id))itemsById.set(id,item);
          }
        }
        pagesRead += 1;diagnostics.pagesRead=pagesRead;
        reportProgress({ pagesRead, games: [...itemsById.values()].filter((item) => item.mediaType === 'game').length });
        cursor = nextCursorFromPage(page);
        terminalReached=cursor===null||cursor==='';
      } while (cursor);
      }catch(error){if(error.fatal||['authorization','forbidden','library-session','unreadable'].includes(error.epicFailure))throw error;markIncomplete(error.epicFailure??'acquisition');}
      if (![...itemsById.values()].some((item) => item.mediaType === 'game')&&(!incomplete||!itemsById.size)) throw new Error('Epic Games Store returned no readable games. Confirm that this signed-in account has games in its library.');
      const items = [...itemsById.values()];
      const snapshot=incomplete?{version:1,provider:'epic',complete:false,itemCount:items.length,scopes:[{id:'library',readCount:items.length,expectedCount:null,end:'partial-acquisition',pagesRead,complete:false,limitReached:false}],recovery:{failedItems}}:global.GalacticProviderSnapshot.completeProviderSnapshot('epic', items, [global.GalacticProviderSnapshot.completedScope('library', recordsRead, null, 'pagination-end', pagesRead)]);
      Object.assign(diagnostics,{incomplete,failedItems,recordsRead,terminal:terminalReached?'cursor-exhausted':null});
      return { items, skippedCount: skippedIds.size, snapshot,incomplete,failedItems };
    }catch(error){if(!diagnostics.firstFailure)diagnostics.firstFailure={stage:'library-validation',kind:'validation',httpStatus:null,upstreamStatus:null,...pageState()};throw error;}
    finally{reading=false;}
  }

  global.GalacticEpic = { epicItemsFromLibraryPage, nextCursorFromPage, fetchEpicGames, getDiagnostics, recordSaveState, resetDiagnostics(){if(!reading)diagnostics=null;} };
}(globalThis));
