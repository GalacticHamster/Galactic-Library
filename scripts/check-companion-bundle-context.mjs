import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bundleFixture as hb} from '../../HB/tests/matching-fixture.mjs';
import {bundleFixture as fan} from '../../Fanatical/tests/matching-fixture.mjs';
const root=new URL('../',import.meta.url),source=fs.readFileSync(new URL('shared/bundle-match-context.js',root),'utf8').replace(/^\uFEFF/u,'').trim();
for(const file of [new URL('../HB/ownership.js',root),new URL('../Fanatical/src/shared.js',root)])assert.equal(fs.readFileSync(file,'utf8').match(/\/\/ BEGIN SHARED BUNDLE MATCH CONTEXT[\s\S]*?\/\/ END SHARED BUNDLE MATCH CONTEXT/u)?.[0],source,'Shared engine drift');
const original='Beneath the Trees Where Nobody Sees',sequel=original+': Rite of Spring',offers=[original,sequel].map(title=>({title,kind:'book',mediaType:'book'}));
const strong={title:original,provider:'kindle',itemRef:'original-ref',relationship:'same-edition',ownership:'owned',reason:'Matching full book title with no conflicting identity evidence'};
const weak={...strong,relationship:'same-work',reason:'Related title or edition; compare the owned and offered titles.'};
const subscription={...strong,title:sequel,itemRef:'sequel-ref',ownership:'subscription'};
for(const [name,items,responses,expected]of [
 ['core',offers,{[original]:{matches:[strong]},[sequel]:{possibleMatches:[subscription,weak]}},1],
 ['only sequel',offers.slice(1),{[sequel]:{possibleMatches:[subscription,weak]}},0],
 ['no strong',offers,{[original]:{possibleMatches:[weak]},[sequel]:{possibleMatches:[weak]}},0],
 ['reviewed relationship',offers,{[original]:{matches:[strong]},[sequel]:{possibleMatches:[subscription,{...weak,reason:'Reviewed same-work relationship.'}]}},0],
 ['other account',offers,{[original]:{matches:[strong]},[sequel]:{possibleMatches:[subscription,{...weak,itemRef:'other-account-ref'}]}},0]
]){const views=[];for(const fixture of [hb,fan]){const f=fixture(items,[],responses),rows=await f.classify();assert.equal(f.P.reconcileBundle(rows,{complete:true}).deferredCount,expected);views.push(rows.map(({item,match})=>({title:item.title,status:f.P.status(item,match),explanation:f.P.explanation(item,match),caption:f.P.relatedCaption(item,match),primary:Array.from(f.P.primaryCandidateViews(item,match),v=>[v.title,v.provider,v.access])})));}assert.equal(JSON.stringify(views[0]),JSON.stringify(views[1]),name+' adapter parity');console.log('PASS identical context decisions and explanations: '+name);}
console.log('Shared engine byte parity and five HB/FAN production-matcher scenarios passed.');
