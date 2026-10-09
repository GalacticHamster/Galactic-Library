// BEGIN SHARED BUNDLE MATCH CONTEXT
// Canonical source: GalacticLibrary/shared/bundle-match-context.js.
// Vendored unchanged in HB/FAN; synchronize with sync-companion-bundle-context.mjs.
(function installBundleMatchContext(global) {
  'use strict';
  // A priority projection only. Inputs/authoritative matches are never mutated.
  // offers: [{id, productKey, titleKey, title, media, protected, settled,
  //            candidates:[{id, libraryKey, strength, protected, basis}]}]
  // libraryKey is an opaque provider-record reference or a local object identity;
  // titles/ownership must NEVER be used as a substitute for library identity.
  function automaticTitleCandidate(basis) {
    const reason=String(basis||'');
    if(/\breviewed\b|user-supplied|shared (?:work|identifier|isbn|steam)|\bcontains\b|\bcomponents?\b|\bcontents?\b|\bcoverage\b/iu.test(reason))return false;
    return /related (?:complete base title|main title|title|book presentation)|subtitle|parenthetical|titles differ by an article|one (?:book )?title is a shortened or qualified presentation/iu.test(reason);
  }
  function reconcile({complete=false,offers=[]}={}) {
    const safe=complete===true && offers.length>1 && offers.every(offer=>offer.settled===true && offer.id && offer.productKey && offer.titleKey && offer.media)
      && new Set(offers.map(offer=>offer.id)).size===offers.length;
    const strong=new Map();
    if(safe)for(const offer of offers){
      if(offer.protected)continue;
      for(const candidate of offer.candidates||[]){
        if(candidate.strength!=='strong'||candidate.libraryKey==null)continue;
        const anchors=strong.get(candidate.libraryKey)||new Map();anchors.set(offer.id,offer);strong.set(candidate.libraryKey,anchors);
      }
    }
    const results=new Map();
    for(const offer of offers){
      const primary=[],deferred=[];
      for(const candidate of offer.candidates||[]){
        const titles=safe && !offer.protected && candidate.strength==='weak' && !candidate.protected && automaticTitleCandidate(candidate.basis)
          ? [...(strong.get(candidate.libraryKey)?.values()||[])].filter(anchor=>anchor.id!==offer.id && anchor.media===offer.media && anchor.productKey!==offer.productKey && anchor.titleKey!==offer.titleKey).map(anchor=>anchor.title):[];
        const competingTitles=[...new Set(titles)].sort((a,b)=>a<b?-1:a>b?1:0);
        if(competingTitles.length)deferred.push({id:candidate.id,competingTitles});else primary.push(candidate.id);
      }
      results.set(offer.id,{primary,deferred});
    }
    return {complete:safe,results};
  }
  global.BundleMatchContext=Object.freeze({reconcile});
}(globalThis));
// END SHARED BUNDLE MATCH CONTEXT
