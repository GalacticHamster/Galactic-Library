import assert from 'node:assert/strict';
import {itemPresentation,artworkUrl} from '../src/ui/item-presentation.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';
const a={id:'kindle:a',recordRef:'a',profileId:'personal',provider:'kindle',title:'Example',mediaType:'book',ownership:'owned',metadata:{authors:['Writer'],series:['Example'],volume:'2'}};
const b={...a,id:'kindle:b',recordRef:'b',profileId:'family',ownership:'borrowed'};
const canonical={title:'Example',mediaType:'book'};
export const itemDetailsUxTests=[
 ['Item presentation preserves each account access without inventing a shared entitlement or reading progress',()=>{
   const db={providerProfiles:{personal:{nickname:'Personal'},family:{nickname:'Family'}},readingStates:{a:{status:'reading',progress:35}},contentReviews:{'kindle:a':{entries:[{}],statement:'',verifiedAt:'2026-10-01'}}};
   const before=JSON.stringify({a,b,db}),view=itemPresentation(canonical,[a,b],db);
   assert.deepEqual(view.creators,['Writer']);assert.equal(view.records[0].label,'Kindle — Personal');assert.equal(view.records[1].label,'Kindle — Family');assert.equal(view.records[0].access,'Owned');assert.equal(view.records[1].access,'Borrowed');assert.match(view.records[0].reading,/35%/);assert.equal(view.records[1].reading,'Reading status not saved');assert.equal(view.records[0].contents.count,1);assert.equal(JSON.stringify({a,b,db}),before);
 }],
 ['Sparse and unsupported item metadata remains inspectable without book-only claims',()=>{
   const record={...a,mediaType:'game',metadata:{}};const view=itemPresentation({title:'Game',mediaType:'game'},[record],{});assert.equal(view.title,'Game');assert.equal(view.cover,'');assert.deepEqual(view.creators,[]);assert.equal(view.records[0].reading,null);assert.equal(view.records[0].contents,null);
   for(const type of ['software','movie','tv','audiobook','other'])assert(itemPresentation({title:'Item',mediaType:type},[{...record,mediaType:type}],{}).media);
 }],
 ['Artwork rejects active URL schemes and credentials without creating metadata',()=>{
   assert.equal(artworkUrl('javascript:alert(1)'),'');assert.equal(artworkUrl('https://user:pass@example.com/image'),'');assert.equal(artworkUrl('https://example.com/image'),'https://example.com/image');
 }]
];
itemDetailsUxTests.push(['Scoped enrichment rows cannot reach another account and do not interpret contents or unrelated canonicals',()=>{
  const db={providerItems:{a,b},enrichmentReviews:{one:{recordRefs:['a'],source:'googleBooks',candidates:[],status:'no-results'},two:{recordRefs:['b'],source:'googleBooks',candidates:[],status:'failed'}},contentReviews:{},enrichmentHistory:{},get canonicalItems(){throw Error('Unnecessary canonical projection');}};
  const rows=enrichmentWorkbenchRows(db,{recordRefs:['a'],includeContents:false,includeMissing:false});assert.equal(rows.length,1);assert.equal(rows[0].id,'one');
}]);
