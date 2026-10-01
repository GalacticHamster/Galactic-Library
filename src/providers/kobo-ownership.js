/* Pure evidence rules; shared by the card parser and central storage validation. */
(function attachKoboOwnership(global) {
  const classify = card => {
    const type=typeof card?.ownershipType==='string'?card.ownershipType.trim().toLowerCase():'';
    const labels=(Array.isArray(card?.ownershipLabels)?card.ownershipLabels:[]).filter(value=>typeof value==='string').map(value=>value.replace(/\s+/gu,' ').trim());
    const purchaseAttribute=card?.isPurchased===true || ['purchase','purchased'].includes(type);
    const purchaseLabel=labels.some(value=>/^(?:purchased|bought)(?:\s+on\s+.+)?$/iu.test(value));
    const subscription=card?.isKoboPlus===true || ['kobo-plus','koboplus','subscription'].includes(type)
      || labels.some(value=>/^(?:(?:read|listen) with kobo plus|added (?:with|through|via) kobo plus|kobo plus subscription)$/iu.test(value));
    const temporary=['borrowed','rental'].includes(type);
    if((purchaseAttribute||purchaseLabel)&&(subscription||temporary||card?.isPurchased===false))return {ownership:'unknown',ownershipBasis:'conflicting-evidence'};
    if(subscription)return {ownership:'subscription',ownershipBasis:'kobo-plus-subscription'};
    if(temporary)return {ownership:type,ownershipBasis:type};
    if(purchaseAttribute||purchaseLabel)return {ownership:'owned',ownershipBasis:purchaseAttribute?'purchase-attribute':'purchase-label'};
    return {ownership:'unknown',ownershipBasis:labels.some(value=>/^kobo plus$/iu.test(value))?'kobo-plus-availability':'library-presence-only'};
  };
  function fromMetadata(ownership,metadata) {
    if(metadata.ownershipBasis==='kobo-plus-subscription')return 'subscription';
    if(['borrowed','rental'].includes(metadata.ownershipBasis))return metadata.ownershipBasis;
    if(['purchase-attribute','purchase-label'].includes(metadata.ownershipBasis))return ownership==='owned'?'owned':'unknown';
    return 'unknown';
  }
  global.GalacticKoboOwnership={classify,fromMetadata};
}(globalThis));
