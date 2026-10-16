/* Neutral console-library projections. No credentials, network or storage APIs.
 * The caller must establish the signed-in account independently of card owners.
 */
(function attachConsoleLibrary(global) {
  'use strict';
  const integer=value=>Number.isSafeInteger(value)&&value>=0;
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const fail=message=>{throw Error(message+' Previous library records were kept.');};
  function identifier(value,label) {
    if(Number.isSafeInteger(value)&&value>=0)value=String(value);
    if(typeof value!=='string'||!value||value.length>200||!/^[A-Za-z0-9_.:-]+$/u.test(value))fail('Invalid '+label+'.');
    return value;
  }
  function title(value) {
    if(typeof value!=='string'||!value.trim()||value.length>500)fail('The provider returned an unreadable game title.');
    return value.replace(/\s+/gu,' ').trim();
  }
  function page(value) {
    if(!object(value)||Array.isArray(value.errors)&&value.errors.length)fail('The provider returned an incomplete library response.');
    return value.data;
  }
  function requestBounds(offset,limit) {
    if(!integer(offset)||!Number.isSafeInteger(limit)||limit<1||limit>300)fail('Invalid library pagination.');
  }
  const membership=value=>typeof value==='string'&&/^[A-Z_]{1,40}$/u.test(value)?value:null;
  const subscriptions=new Set(['PS_PLUS','PSPLUS','PS_NOW','PSNOW','PLUS','EA_PLAY']);
  function playStationAccess(row) {
    const member=membership(row.membership),service=membership(row.subscriptionService);
    if(row.isTrial===true)return {ownership:'unknown',basis:'trial'};
    if(subscriptions.has(member)||subscriptions.has(service))return {ownership:'subscription',basis:'subscription-membership'};
    if(row.isActive===true&&member==='NONE'&&(!Object.hasOwn(row,'subscriptionService')||service==='NONE'))return {ownership:'owned',basis:'active-purchased-library-non-subscription'};
    return {ownership:'unknown',basis:row.isActive===false?'inactive-library-entry':'unconfirmed-license'};
  }
  function parsePlayStationPage(value,{offset=0,limit=24}={}) {
    requestBounds(offset,limit);
    const list=page(value)?.purchasedTitlesRetrieve,paging=list?.pageInfo;
    if(!Array.isArray(list?.games)||list.games.length>limit||!object(paging)||paging.offset!==offset||typeof paging.isLast!=='boolean'
      ||!Number.isSafeInteger(paging.size)||paging.size<list.games.length||paging.size>limit)fail('PlayStation returned an unreadable or inconsistent library page.');
    if(!paging.isLast&&(!list.games.length||paging.size<1))fail('PlayStation pagination did not advance.');
    const items=list.games.map(row=>{
      if(!object(row))fail('PlayStation returned an unreadable purchase row.');
      const productId=identifier(row.productId,'PlayStation product ID'),titleId=identifier(row.titleId,'PlayStation title ID');
      if(!['PS4','PS5'].includes(row.platform))fail('PlayStation returned a platform outside this PS4/PS5 import.');
      const access=playStationAccess(row),metadata={source:'playstation-web-purchased-library',productId,titleId,accessBasis:access.basis};
      if(row.conceptId!==undefined&&row.conceptId!==null)metadata.conceptId=identifier(row.conceptId,'PlayStation concept ID');
      for(const field of ['membership','subscriptionService'])if(membership(row[field]))metadata[field]=row[field];
      for(const field of ['isActive','isTrial'])if(typeof row[field]==='boolean')metadata[field]=row[field];
      return {provider:'playstation',providerItemId:[productId,titleId,row.platform].join(':'),title:title(row.name),mediaType:'game',ownership:access.ownership,platform:[row.platform],acquiredAt:null,metadata};
    });
    if(new Set(items.map(item=>item.providerItemId)).size!==items.length)fail('PlayStation repeated a purchase identity within one page.');
    return {items,offset,nextOffset:offset+paging.size,complete:paging.isLast,expectedCount:null};
  }
  function parseNintendoPage(value,{offset=0,limit=300,accountNaId}={}) {
    requestBounds(offset,limit);identifier(accountNaId,'signed-in Nintendo account identity');
    const vgc=page(value)?.account?.vgc,fields=object(vgc)?['vgcViews','vgcViewsV2'].filter(key=>Object.hasOwn(vgc,key)):[];
    const list=fields.length===1?vgc[fields[0]]:null,paging=list?.offsetInfo;
    if(!Array.isArray(list?.views)||list.views.length>limit||!object(paging)||paging.offset!==offset||!integer(paging.total)
      ||offset+list.views.length>paging.total||!list.views.length&&offset<paging.total)fail('Nintendo returned an unreadable or inconsistent card page.');
    const items=list.views.map(row=>{
      if(!object(row))fail('Nintendo returned an unreadable card.');
      const cardId=identifier(row.id,'Nintendo card ID'),applicationId=identifier(row.applicationId,'Nintendo application ID');
      if(!['NX','OUNCE'].includes(row.apparentPlatform))fail('Nintendo returned an unsupported card platform.');
      if(row.isHidden===true)fail('Nintendo returned a hidden card outside the requested non-hidden scope.');
      const owner=typeof row.ownerNaId==='string'?identifier(row.ownerNaId,'Nintendo owner identity'):null;
      const user=typeof row.userNaId==='string'?identifier(row.userNaId,'Nintendo user identity'):null;
      if(owner&&user&&owner!==accountNaId&&user!==accountNaId)fail('The Nintendo account changed or the card belongs to another account.');
      // The verified website exposes released flags only. Reference clients may
      // alias hasReleasedApplication as hasApplication; neither false value proves
      // that an unreleased base game is absent. Do not invent a DLC-only product.
      const base=row.hasReleasedApplication===true?true:null;
      const mediaType='game',scopeKnown=base===true;
      const ownership=scopeKnown&&owner===accountNaId?'owned':scopeKnown&&owner&&user===accountNaId?'borrowed':'unknown';
      const metadata={source:'nintendo-virtual-game-cards',cardId,applicationId,
        accessBasis:!scopeKnown?'card-product-scope-unconfirmed':owner===accountNaId?'account-owned-card':owner&&user===accountNaId?'borrowed-card':'unconfirmed-card-owner',
        productKind:base===true?'base-application-card':'unconfirmed-card-scope'};
      if(typeof row.publisher==='string'&&row.publisher.trim()&&row.publisher.length<=500)metadata.publisher=title(row.publisher);
      if(row.lendingExpireDatetime!=null){
        if(typeof row.lendingExpireDatetime!=='string'||!/^\d{4}-\d{2}-\d{2}T/u.test(row.lendingExpireDatetime)||!Number.isFinite(Date.parse(row.lendingExpireDatetime)))fail('Nintendo returned an unreadable lending date.');
        metadata.lendingExpiresAt=new Date(row.lendingExpireDatetime).toISOString();
      }
      // Keep the source's flags, not account IDs, device IDs, tokens or a guessed
      // purchase date. Activation dates are not treated as purchase receipts.
      for(const field of ['isHidden','isLending','isPartialLending','hasApplication','hasAddOnContents','hasReleasedApplication','hasReleasedAddOnContents','hasReleasedUpgrade'])
        if(typeof row[field]==='boolean')metadata[field]=row[field];
      return {provider:'nintendo',providerItemId:cardId,title:title(row.applicationName),mediaType,ownership,platform:[row.apparentPlatform==='NX'?'Switch':'Switch 2'],acquiredAt:null,metadata};
    });
    if(new Set(items.map(item=>item.providerItemId)).size!==items.length)fail('Nintendo repeated a card identity within one page.');
    return {items,offset,nextOffset:offset+items.length,complete:offset+items.length===paging.total,expectedCount:paging.total};
  }
  async function collectLibrary({provider,accountIdentity,currentAccountIdentity,readPage,onProgress=()=>{},signal,maxPages=500}) {
    if(!['playstation','nintendo'].includes(provider)||typeof readPage!=='function'||typeof currentAccountIdentity!=='function'
      ||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>500)fail('Invalid console library scan.');
    identifier(accountIdentity,'signed-in console account identity');
    const check=async()=>{signal?.throwIfAborted();if(await currentAccountIdentity()!==accountIdentity)fail('The signed-in console account changed during import.');};
    const all=[],seen=new Set();let offset=0,expectedCount=null;
    const limit=provider==='playstation'?24:300;
    for(let pagesRead=1;pagesRead<=maxPages;pagesRead++) {
      await check();const raw=await readPage({offset,limit,signal});await check();
      const parsed=provider==='playstation'?parsePlayStationPage(raw,{offset,limit}):parseNintendoPage(raw,{offset,limit,accountNaId:accountIdentity});
      if(expectedCount!==null&&expectedCount!==parsed.expectedCount)fail('The console library total changed during pagination.');
      expectedCount=parsed.expectedCount;
      for(const item of parsed.items){if(seen.has(item.providerItemId))fail('Console pagination repeated an item from an earlier page.');seen.add(item.providerItemId);all.push(item);}
      if(all.length>50000)fail('The console library exceeds the safe import limit.');
      onProgress({pagesRead,items:all.length,expectedCount});
      if(parsed.complete){
        await check();
        const snapshots=global.GalacticProviderSnapshot;if(!snapshots)fail('Library snapshot validation is unavailable.');
        const section=snapshots.completedScope(provider==='playstation'?'ps4-ps5-purchased':'non-hidden-virtual-cards',all.length,expectedCount,expectedCount===null?'pagination-end':'reported-count',pagesRead);
        return {items:all,snapshot:snapshots.completeProviderSnapshot(provider,all,[section]),accountIdentity};
      }
      if(!integer(parsed.nextOffset)||parsed.nextOffset<=offset)fail('Console pagination did not advance.');
      offset=parsed.nextOffset;
    }
    fail('The console library did not reach a validated last page.');
  }
  global.GalacticConsoleLibrary={parsePlayStationPage,parseNintendoPage,collectLibrary};
}(globalThis));
