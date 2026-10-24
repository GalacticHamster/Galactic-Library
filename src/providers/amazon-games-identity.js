/* Evidence groups, not asserted Amazon transaction IDs. Shared by page and writer. */
(function(global){
  'use strict';
  const clean=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const fullMonths=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthNumber=value=>{const name=value.toLowerCase();return months.includes(name)?months.indexOf(name)+1:fullMonths.includes(name)?fullMonths.indexOf(name)+1:name==='sept'?9:0;};
  function calendar(year,month,day){
    const value=new Date(0);value.setUTCFullYear(year,month-1,day);
    return year>=1900&&year<=9999&&value.getUTCFullYear()===year&&value.getUTCMonth()===month-1&&value.getUTCDate()===day
      ?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
  }
  function collectedDate(value){
    const text=clean(value);let match=/^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
    if(match)return calendar(+match[1],+match[2],+match[3]);
    match=/^([a-z]+)\.? (\d{1,2})(?:,\s*|\s+)(\d{4})$/iu.exec(text);
    if(match&&monthNumber(match[1]))return calendar(+match[3],monthNumber(match[1]),+match[2]);
    match=/^(\d{1,2}) ([a-z]+)\.? (\d{4})$/iu.exec(text);
    if(match&&monthNumber(match[2]))return calendar(+match[3],monthNumber(match[2]),+match[1]);
    return null; // Numeric locale dates without a declared ordering are ambiguous.
  }
  function collectedFromText(value){
    const text=String(value??'');
    const match=/\bCollected on\s*:?\s*(\d{4}-\d{2}-\d{2}|[a-z]+\.?\s+\d{1,2}(?:,\s*|\s+)\d{4}|\d{1,2}\s+[a-z]+\.?\s+\d{4})\b/iu.exec(text);
    return match?collectedDate(match[1]):null;
  }
  const hash=async value=>Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  function artwork(value){
    try{const url=new URL(value),asset=/(?:^|\.)media-amazon\.com$/iu.test(url.hostname)?/^\/images\/I\/([^/.]+)(?:\.[^/]*)?$/u.exec(url.pathname):null;
      return asset?'amazon-image:'+asset[1]:url.origin+url.pathname;
    }catch{return '';}
  }
  async function identify(item){
    const metadata=item.metadata??{};
    const product=await hash([clean(item.title),artwork(metadata.imageUrl),artwork(metadata.detailUrl),...['edition','volume','format','language','publisher'].map(key=>clean(metadata[key])),(Array.isArray(item.platform)?item.platform:item.platform?[item.platform]:[]).map(clean).sort()]);
    const date=metadata.collectedOn??(item.acquiredAt?String(item.acquiredAt).slice(0,10):null);
    const validDate=date?collectedDate(date):null;
    // An imported, destination-unconfirmed row is not a proven extra purchase.
    const destination=clean(metadata.deliveryDestination)||'Amazon Games library';
    const key=await hash([product,destination,validDate]);
    return {...item,providerItemId:'claim-v1-'+key,acquiredAt:validDate?validDate+'T00:00:00.000Z':null,
      metadata:{...metadata,claimKey:key,claimProductKey:product,claimBasis:validDate?'dated-evidence':'undated-evidence',
        ...(validDate?{collectedOn:validDate}:{})}};
  }
  async function consolidate(items){
    const groups=new Map();
    for(const raw of items){const item=await identify(raw),previous=groups.get(item.providerItemId);
      if(!previous)groups.set(item.providerItemId,item);
      else{const preferred=['owned','claimed','permanently_claimed'].includes(item.ownership)?item:previous;
        const observations=[...new Set([...(previous.metadata.observationIds??[]),...(item.metadata.observationIds??[])])].sort();
        groups.set(item.providerItemId,{...preferred,metadata:{...preferred.metadata,...(observations.length?{observationIds:observations}:{})}});
      }
    }
    return [...groups.values()].sort((a,b)=>a.providerItemId.localeCompare(b.providerItemId));
  }
  // A conflict guard only: sparse evidence must never bypass a saved decision.
  // This does not establish product or claim equivalence.
  function potentiallySameClaim(left,right){
    if(clean(left.title)!==clean(right.title))return false;
    const a=left.metadata??{},b=right.metadata??{};
    if(a.imageUrl&&b.imageUrl&&artwork(a.imageUrl)!==artwork(b.imageUrl))return false;
    if(left.acquiredAt&&right.acquiredAt&&left.acquiredAt.slice(0,10)!==right.acquiredAt.slice(0,10))return false;
    if(left.platform?.length&&right.platform?.length&&JSON.stringify([...left.platform].sort())!==JSON.stringify([...right.platform].sort()))return false;
    return ['edition','volume','format','language','publisher','deliveryDestination'].every(key=>!a[key]||!b[key]||clean(a[key])===clean(b[key]));
  }
  global.GalacticAmazonGamesIdentity={collectedDate,collectedFromText,identify,consolidate,potentiallySameClaim};
})(globalThis);
