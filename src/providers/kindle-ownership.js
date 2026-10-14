/* Pure Kindle access rules shared by the importer and legacy read projection. */
(function(global){
  const key=value=>String(value??'').replace(/\s+/gu,' ').trim().toLowerCase();
  function fromOriginType(value){
    const origin=key(value);
    if(origin==='purchase'||origin==='comixology')return 'owned';
    if(origin==='rental')return 'rental';
    if(/publiclibrarylending|personallending|rfflending/u.test(origin))return 'borrowed';
    if(/kindleunlimited|comicsunlimited|comixologyunlimited|prime|koll|freetrial/u.test(origin))return 'subscription';
    return 'unknown';
  }
  function classify(metadata){
    const origin=key(metadata?.originType),ownership=fromOriginType(origin);
    if(origin!=='comixology')return {ownership};
    const status=key(metadata.itemStatus);
    if(/^(?:expired|access expired|loan expired)$/u.test(status))return {ownership:'unknown',basis:'expired-access'};
    if(/^(?:returned|revoked|deleted|removed|inactive|cancelled|canceled)$/u.test(status))return {ownership:'unknown',basis:'inactive-access'};
    const other=[metadata.ownershipType,metadata.sourceType,metadata.contentType,metadata.itemStatus].map(key);
    if(['conflicting-access-evidence','expired-access','inactive-access'].includes(metadata.ownershipBasis)||other.some(value=>/^(?:sample|borrowed|rental|subscription|kindleunlimited|comicsunlimited|comixologyunlimited|publiclibrarylending|personallending|rfflending|prime|koll|freetrial)$/u.test(value)))return {ownership:'unknown',basis:'conflicting-access-evidence'};
    if(metadata.libraryCategory!=='books')return {ownership:'unknown',basis:'unconfirmed-library-category'};
    return {ownership:'owned',basis:'comixology-migrated-purchase'};
  }
  function infer(item){
    if(item?.provider!=='kindle'||item.mediaType!=='book'||item.ownership!=='unknown'||item.metadata?.source!=='amazon-kindle-content-library'||key(item.metadata.originType)!=='comixology')return null;
    const result=classify(item.metadata);
    return result.ownership==='owned'?result:null;
  }
  global.GalacticKindleOwnership=Object.freeze({fromOriginType,classify,infer});
})(globalThis);
