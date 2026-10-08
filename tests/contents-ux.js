import {bookRoute,bookHref} from '../src/ui/contents-navigation.js';
import {workspaceTarget} from '../src/lib/ui-preferences.js';
import {collectionComparison} from '../src/ui/contents-book-details.js';
import assert from 'node:assert/strict';
import {contentsSummary,contentsPage,createContentsProjection} from '../src/ui/contents-overview.js';
const book=(id,source)=>({id,recordRef:id,profileId:'a',title:'Collection '+id,provider:'kindle',mediaType:'book',metadata:{enrichment:source?{kindleProductComicContents:source}:{}}});
export const contentsUxTests=[
 ['Contents states distinguish suggestions, unresolved text, empty capture, failure and never acquired',()=>{
   const db={};
   for(const [source,status] of [[null,'unattempted'],[{availability:'no-statement'},'missing'],[{availability:'unavailable'},'failed'],[{statement:'Collects Example #1',parseOutcome:'full'},'identified'],[{statement:'Collects Example #1; bonus',parseOutcome:'partial'},'partial'],[{statement:'Contains something',parseOutcome:'uncertain'},'uncertain'],[{statement:'Collects Example #1',parseOutcome:'full',descriptionMayBeIncomplete:true},'partial']])assert.equal(contentsSummary(book('a',source),db).status,status);
   assert.equal(contentsSummary(book('a',{statement:'Collects Example #1',parseOutcome:'full'}),db).count,null,'Do not misrepresent child-span counts as whole book contents.');
 }],
 ['Contents retained review and latest failed attempt remain separate without replacing evidence',()=>{
   const record=book('a',{statement:'Collects Example #1-2',parseOutcome:'full'});
   const db={contentReviews:{a:{statement:'Collects Example #1',entries:[{number:'1'}],verifiedAt:'2026-10-01'}},kindleContentsObservations:{a:{latestAttempt:{availability:'unavailable',checkedAt:'2026-10-02'}}}};
   const original=JSON.stringify({record,db});const row=contentsSummary(record,db);
   assert.equal(row.status,'reviewed');assert(row.changed&&row.needsReview&&row.retained&&row.failed);assert.equal(row.count,1);assert.equal(JSON.stringify({record,db}),original);
 }],
 ['Contents projection remains account scoped, caches unchanged data and renders bounded searchable pages',()=>{
   const a=book('a'),b={...book('b'),title:a.title,profileId:'b'};
   const db={providerItems:{a,b,...Object.fromEntries(Array.from({length:14081},(_,i)=>{const item=book(String(i));return [item.id,item];}))},providerProfiles:{a:{nickname:'Personal'},b:{nickname:'Family'}}};
   // A poisoned manifest getter proves list navigation does not parse source material.
   db.providerItems.a.metadata.enrichment.kindleProductComicContents={availability:'no-statement',manifest:{get blocks(){throw Error('Eager source parse');},candidates:[],selected:-1}};
   const project=createContentsProjection(),rows=project(db);assert.equal(project(db),rows);
   assert.equal(rows.filter(r=>r.title===a.title).length,2);assert.equal(contentsPage(rows,{query:'Family'}).rows[0].recordRef,'b');
   assert.equal(contentsPage(rows).rows.length,50);assert.equal(contentsPage(rows,{page:9999}).rows.length,33);assert.equal(contentsPage(rows,{status:'missing'}).total,1);
   assert.notEqual(project({...db}),rows);
 }]
];

contentsUxTests.push(['Collection overlap uses reviewed coverage without counting itself or confirming named matches',()=>{
  const a={...book('a'),ownership:'owned'},b={...book('b'),ownership:'owned'};
  const entry={series:'Example',run:'2020',unitType:'issue',number:'1',language:'en',completeness:'full'};
  const db={providerItems:{a,b},contentReviews:{a:{entries:[entry,{...entry,number:'2'}]},b:{entries:[entry]}}};
  const before=JSON.stringify(db),result=collectionComparison(a,db);assert.equal(result.owned,1);assert.equal(result.missing.length,1);assert.equal(JSON.stringify(db),before);
  db.contentReviews.a.entries=db.contentReviews.b.entries=[{...entry,unitType:'component',number:'Named Story'}];
  const named=collectionComparison(a,db);assert.equal(named.owned,0);assert.equal(named.possibleCovered.length,1);assert.equal(named.complete,false);
  delete db.contentReviews.a;assert.equal(collectionComparison(a,db),null);
}]);

contentsUxTests.push(['Book deep links retain exact record scope and legacy workspace routes',()=>{
  const ref='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  for(const workspace of ['contents','library']){const href=bookHref(workspace,ref);assert.deepEqual(bookRoute(href),{workspace,recordRef:ref});assert.equal(workspaceTarget(href),workspace);}
  for(const bad of ['#contents?record=kindle:B123','#contents?record=<script>','#contents?record=undefined','#books?record='+ref])assert.equal(bookRoute(bad),null);
  assert.equal(workspaceTarget('#books'),'books');assert.equal(workspaceTarget('#kindle'),'contents');assert.throws(()=>bookHref('contents','bad'));
}]);

contentsUxTests.push(['Provider/local statements are visible and same-manifest parent reviews are not false new discoveries',()=>{
  const record=book('a');record.metadata.contentsStatement='Collects Example #1';assert.equal(contentsSummary(record,{}).status,'uncertain');
  const source={statement:'Collects Example #1',parseOutcome:'full',checkedAt:'2026-10-01',manifest:{selected:0,candidates:[{block:0,raw:'Collects Example #1',manifestRange:{start:0,end:50}},{block:0,whole:true,raw:'Collects Example #1; Other #2',manifestRange:{start:0,end:50}}]}};
  record.metadata.enrichment.kindleProductComicContents=source;
  const db={contentReviews:{a:{entries:[{number:'1'}],statement:'Collects Example #1; Other #2',verifiedAt:'2026-10-02'}}};
  const row=contentsSummary(record,db);assert.equal(row.changed,false);assert.equal(row.needsReview,false);assert.equal(row.updatedAt,'2026-10-02');
}]);
