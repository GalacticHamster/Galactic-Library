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

  // Display scope only: never canonical identity, contents or ownership evidence.
  function numberedScope(title) {
    const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10};
    const text=String(title||'').trim();
    const match=/^(.*?)\s*(?:(book|vol(?:ume)?\.?|issue|annual|special)\s+|(#)\s*)(\d+(?:\.\d+)?|\d+\/\d+|one|two|three|four|five|six|seven|eight|nine|ten|i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/iu.exec(text);
    if(!match||!match[1].replace(/[:,-]\s*$/u,'').trim())return null;
    const type=match[3]?'issue':match[2].toLowerCase().replace(/\.$/u,'');
    return {stem:match[1].replace(/[:,-]\s*$/u,'').trim(),type,number:String(words[match[4].toLowerCase()]||match[4]),label:match[3]?'issue #'+match[4]:match[2]+' '+match[4]};
  }
  function relevance({offeredTitle,title,media,relationship,basis,strong=false,unit=''}) {
    if(strong)return 'direct';
    if(relationship==='contains')return 'contents';
    if(/\breviewed\b|user-supplied|shared work identity/iu.test(basis||''))return 'reviewed';
    if(media!=='book'&&media!=='audiobook')return 'related';
    if(/^Numbered series item related to this title; collection membership and completeness are unconfirmed\./u.test(basis||''))return 'numbered-series';
    const offered=numberedScope(offeredTitle),candidate=numberedScope(title);
    if(!offered&&candidate&&global.LibraryMatchingPolicy.presentationTitle(candidate.stem,media)===global.LibraryMatchingPolicy.presentationTitle(offeredTitle,media))return 'numbered-series';
    if(offered&&!candidate&&!unit)return 'generic-numbered';
    return 'related';
  }
  function order(candidates) {
    const priorities=['direct','contents','reviewed','numbered-series','related','generic-numbered'];
    return candidates.map((candidate,index)=>({candidate,index})).sort((a,b)=>{
      const rank=value=>{const index=priorities.indexOf(value.relevance);return index<0?priorities.indexOf('related'):index;};
      return rank(a.candidate)-rank(b.candidate)||a.index-b.index;
    }).map(row=>row.candidate.id);
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
      const primaryIds=new Set(primary);
      const ordered=order((offer.candidates||[]).filter(candidate=>primaryIds.has(candidate.id)));
      results.set(offer.id,{primary:ordered,deferred});
    }
    return {complete:safe,results};
  }
  global.BundleMatchContext=Object.freeze({reconcile,numberedScope,relevance,order});
}(globalThis));
// END SHARED BUNDLE MATCH CONTEXT
