import {acquisitionHistory,createAcquisitionHistory} from '../src/ui/library-acquisitions.js';
import {createLibraryResultSummary} from '../src/ui/library-result.js';
import {normalizeProviderItem,createEmptyDatabase,rebuildCanonicalItems} from '../src/lib/models.js';
import {matchItems} from '../src/lib/matcher.js';
import assert from 'node:assert/strict';
import {createLibraryBrowseProjection,libraryBrowseResults} from '../src/ui/library-browse.js';
import {validateUiPreferences,browseView,rememberBrowseView,mergeUiPreferences} from '../src/lib/ui-preferences.js';
import {resultProviderSummary} from '../src/ui/library-result.js';
const record=(id,title,metadata={},extra={})=>({id,recordRef:id,provider:'kobo',profileId:'personal',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata,...extra});
const database=records=>({providerItems:Object.fromEntries(records.map(record=>[record.id,record])),canonicalItems:Object.fromEntries(records.map(record=>[record.id,{id:record.id,title:record.title,mediaType:record.mediaType,providerItemIds:[record.id]}])),providerProfiles:{personal:{nickname:'Personal'}},titleAliases:{},readingStates:{},contentReviews:{},enrichmentReviews:{}});
const results=(db,query,options={})=>libraryBrowseResults(createLibraryBrowseProjection()(db),{query,...options}).matches.map(row=>row.canonical.id);
export const libraryBrowseTests=[
 ['Library retrieval searches titles, aliases, creators, series, units and identifiers without changing identity',()=>{
   const db=database([record('one','A Hidden Book',{authors:['Jane Writer'],series:['Night Stories'],volume:'10',isbn:'9780306406157'})]);db.titleAliases.one={titles:['Secret translation']};const before=JSON.stringify(db);
   for(const query of ['hidden','secret translation','Jane Writer','Night Stories','volume 10','978-0-306-40615-7','Kobo Personal'])assert.deepEqual(results(db,query),['one'],query);
   assert.deepEqual(results(db,'unrelated'),[]);assert.equal(JSON.stringify(db),before);
 }],
 ['Exact and strong titles rank ahead of incidental provider/account metadata; search terms combine rather than broaden',()=>{
   const db=database([record('metadata','A Different Book',{authors:['Astro City']}),record('prefix','Astro City Book Two'),record('exact','Astro City')]);db.providerProfiles.personal.nickname='Astro City';
   assert.deepEqual(results(db,'Astro City'),['exact','prefix','metadata']);assert.deepEqual(results(db,'Astro City missing'),[]);
 }],
 ['Browse projection reuses an unchanged snapshot and rebuilds after changes without parsing sources',()=>{
   const db=database([record('one','Example',{enrichment:{kindleProductComicContents:{manifest:{candidates:[],get blocks(){throw Error('Source parsing during retrieval');}}}}})]),project=createLibraryBrowseProjection(),first=project(db);
   assert.equal(project(db),first);assert.deepEqual(libraryBrowseResults(first,{query:'Example'}).rows.map(row=>row.canonical.id),['one']);assert.notEqual(project({...db}),first);
 }]
];
export {record as browseRecord,database as browseDatabase};
libraryBrowseTests.push(
 ['Cached browsing reevaluates access expiry even when the committed record and projection are unchanged',()=>{
   const db=database([record('temporary','Loan',{}, {ownership:'borrowed'})]);db.ownershipReviews={temporary:{ownership:'borrowed',expiresAt:'2026-10-08'}};
   const original=Date.now,project=createLibraryBrowseProjection()(db);try{Date.now=()=>Date.parse('2026-10-07');assert.equal(libraryBrowseResults(project,{filters:{ownership:'borrowed'}}).total,1);Date.now=()=>Date.parse('2026-10-09');assert.equal(libraryBrowseResults(project,{filters:{ownership:'borrowed'}}).total,0);assert.equal(libraryBrowseResults(project,{filters:{ownership:'unknown'}}).total,1);}finally{Date.now=original;}
 }],
 ['Linked DLC searches and counts preserve account boundaries and parent metadata filtering',()=>{
   const db=database([record('parent','Base Game',{series:['Saved game series']},{provider:'steam',providerItemId:'1',mediaType:'game'}),record('dlc','Extra Story',{parentProviderItemId:'1'},{provider:'steam',mediaType:'game-addon'}),record('other','Unrelated Extra',{parentProviderItemId:'1'},{provider:'steam',profileId:'family',mediaType:'game-addon'})]);delete db.canonicalItems.dlc;delete db.canonicalItems.other;
   const project=createLibraryBrowseProjection()(db);assert.deepEqual(libraryBrowseResults(project,{query:'Extra Story',filters:{provider:'steam',account:'personal',series:'Saved game series',dlc:'with'}}).rows.map(row=>row.canonical.id),['parent']);assert.equal(project.linkedAddOnIds.has('other'),false);assert.equal(libraryBrowseResults(project,{query:'Unrelated Extra'}).total,0);
 }],
 ['All stored series editions stay distinct during retrieval rather than becoming new canonical groups',()=>{
   const db=database([record('first','Same Series Volume 2',{series:['Same Series'],volume:'2',edition:'First'}),record('second','Same Series Volume 2 Revised',{series:['Same Series'],volume:'2',edition:'Revised'})]);assert.deepEqual(results(db,'',{filters:{series:'Same Series'},sort:'series'}),['first','second']);assert.equal(Object.keys(db.canonicalItems).length,2);
 }],
 ['A 14,081-record / 13,175-canonical browse projection stays bounded, reusable and source-parser independent',()=>{
   const records=Array.from({length:14081},(_,n)=>{const group=n%13175;return record(String(n),'Catalog '+group,{authors:['Writer '+group%20],series:['Series '+group%30],volume:String(group),unitType:'volume',enrichment:{kindleProductComicContents:{statement:'Collects Example #1-2',manifest:{candidates:[],get blocks(){throw Error('Browsing interpreted source');}}}}});});const db=database(records);db.canonicalItems={};for(const value of records){const group=Number(value.id)%13175,item=db.canonicalItems[group]??{id:String(group),title:value.title,mediaType:'book',providerItemIds:[]};item.providerItemIds.push(value.id);db.canonicalItems[group]=item;}
   const project=createLibraryBrowseProjection(),view=project(db);assert.equal(view.rows.length,13175);for(const sort of ['title-asc','title-desc','creator','series','added','updated']){const result=libraryBrowseResults(view,{sort,page:1});assert.equal(result.rows.length,50);assert.equal(result.total,13175);}
   assert.equal(project(db),view);assert.equal(libraryBrowseResults(view,{query:'Catalog 13174'}).rows[0].canonical.id,'13174');
 }],
 ['Result provider summaries count accounts rather than duplicating canonical results or purchase observations',()=>{
   assert.equal(resultProviderSummary([{record:{provider:'kindle',profileId:'a'}},{record:{provider:'kindle',profileId:'a'}},{record:{provider:'kindle',profileId:'b'}},{record:{provider:'kobo',profileId:'c'}}]),'Kindle (2 accounts) · Kobo');
 }],
 ['Combined canonical filters qualify one record, never different account/access observations',()=>{
   const a=record('a','Shared',{authors:['Writer'],series:['One']},{provider:'kindle',ownership:'owned'}),b=record('b','Shared',{authors:['Writer'],series:['Two']},{provider:'kindle',profileId:'family',ownership:'borrowed'}),db=database([a,b]);db.canonicalItems={shared:{id:'shared',title:'Shared',mediaType:'book',providerItemIds:['a','b']}};
   assert.deepEqual(results(db,'',{filters:{provider:'kindle',account:'personal',ownership:'borrowed'}}),[]);assert.deepEqual(results(db,'',{filters:{provider:'kindle',account:'family',ownership:'borrowed',series:'Two'}}),['shared']);assert.deepEqual(results(db,'',{filters:{account:'family',series:'One'}}),[]);
   const match=libraryBrowseResults(createLibraryBrowseProjection()(db),{filters:{account:'family'}}).rows[0];assert.equal(match.records.length,2);assert.equal(match.qualifying.length,1);assert.equal(match.qualifying[0].record.id,'b');
 }],
 ['Reading separates explicit unread from untracked and excludes non-reading media',()=>{
   const db=database([record('unknown','Untracked'),record('unread','Unread'),record('done','Done'),record('game','Game',{}, {mediaType:'game'})]);db.readingStates={unread:{status:'unread'},done:{status:'completed'}};
   assert.deepEqual(results(db,'',{filters:{reading:'not-saved'}}),['unknown']);assert.deepEqual(results(db,'',{filters:{reading:'unread'}}),['unread']);assert.deepEqual(results(db,'',{filters:{reading:'completed'}}),['done']);
 }],
 ['Series sorting uses stored numeric units and creators/dates put absent values last with deterministic fallbacks',()=>{
   const db=database([record('ten','A Vol 10',{series:['Series'],volume:'10',unitType:'volume',authors:['Zed']}),record('two','Z Vol 2',{series:['Series'],volume:'2',unitType:'volume',authors:['Amy']},{acquiredAt:'2026-01-01',updatedAt:'2026-09-02'}),record('missing','No facts',{}, {updatedAt:'2026-09-03'})]);
   assert.deepEqual(results(db,'',{sort:'series'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'creator'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'added'}),['two','ten','missing']);assert.deepEqual(results(db,'',{sort:'updated'}),['missing','two','ten']);assert.deepEqual(results(db,'',{sort:'title-desc'}),['two','missing','ten']);
 }],
 ['Information filters use stored book gaps and reviews without interpreting source or inferring absent reading',()=>{
   const db=database([record('missing','Missing'),record('known','Known',{authors:['Writer'],isbn:'9780306406157'}),record('video','Video',{}, {mediaType:'movie'})]);db.enrichmentReviews={review:{recordRefs:['known']}};
   assert.deepEqual(results(db,'',{filters:{information:'missing'}}),['missing']);assert.deepEqual(results(db,'',{filters:{information:'review'}}),['known']);
 }],
 ['Search, filters, selected sorting and pagination operate on the same result set',()=>{
   const db=database(Array.from({length:65},(_,n)=>record(String(n),'Book '+n,{series:['Series']}))),projection=createLibraryBrowseProjection()(db);const result=libraryBrowseResults(projection,{query:'Book',filters:{series:'Series'},sort:'title-desc',page:1});assert.equal(result.total,65);assert.equal(result.rows.length,15);assert.equal(result.rows[0].canonical.id,'14');assert.equal(libraryBrowseResults(projection,{filters:{series:'Absent'},page:99}).page,0);
 }],
 ['Extended private browse preferences accept old views and reject unsupported sorts and reading states',()=>{
   assert.equal(validateUiPreferences({library:{search:'Example',page:2}}).browse.sort,'title-asc');const view={sort:'series',account:'family',reading:'not-saved',series:'Long series',information:'review'};assert.deepEqual(Object.fromEntries(Object.keys(view).map(key=>[key,({...validateUiPreferences({library:view}).browse,...validateUiPreferences({library:view}).library})[key]])),view);assert.throws(()=>validateUiPreferences({library:{sort:'magic'}}));assert.throws(()=>validateUiPreferences({library:{reading:'assumed-unread'}}));
 }]
);

libraryBrowseTests.push(['Shared Library and Contents state migrates old views once and keeps specialized filters separate',()=>{
 const prefs=validateUiPreferences({library:{search:'Batman',provider:'kindle',sort:'added',page:1,information:'missing'},books:{search:'Other'}});
 assert.equal(prefs.browse.search,'Batman');assert.deepEqual(prefs.library,{information:'missing',dlc:'all',acquisitions:'all'});
 rememberBrowseView(prefs,'contents',{...browseView(prefs,'contents'),search:'Detective',status:'partial',anchor:'same-record'});
 assert.equal(browseView(prefs,'library').search,'Detective');assert.equal(browseView(prefs,'library').information,'missing');assert.equal(prefs.contents.status,'partial');assert.equal(prefs.books.search,'Other');
 const saved=mergeUiPreferences(prefs,{browse:{sort:'series'}});assert.equal(saved.browse.anchor,'same-record');assert.equal(saved.browse.search,'Detective');assert(!('search' in saved.library));
}],['Canonical anchor follows an item when Contents has a different eligible population and expands account records without losing scope',()=>{
 const db=database(Array.from({length:70},(_,n)=>record(String(n),'Book '+n)));const other=record('other','Book 55',{}, {profileId:'family'});db.providerItems.other=other;db.canonicalItems['55'].providerItemIds.push('other');const project=createLibraryBrowseProjection()(db);
 const result=libraryBrowseResults(project,{anchor:'55',recordFilter:r=>Number(r.id)>=40||r.id==='other'});assert.equal(result.page,0);assert(result.rows.some(r=>r.canonical.id==='55'&&r.qualifying.length===2));
 assert.equal(libraryBrowseResults(project,{anchor:'missing',page:99}).page,1);assert.equal(libraryBrowseResults(project,{filters:{account:'family'},anchor:'55'}).rows[0].qualifying[0].record.id,'other');
}]);


const purchase=(id,volume,order,bundle,date,extra={})=>record(id,'The Autumnlands Vol. '+volume,
  {purchaseId:order,sourceBundle:bundle,entitlement:'direct-download'},
  {provider:'humble',acquiredAt:date,...extra});
libraryBrowseTests.push(
 ['Autumnlands purchases consolidate as two display rows with two independent histories and unchanged data/matches',()=>{
   const records=[1,2].flatMap(volume=>[
     purchase('old-'+volume,volume,'old-order',"Humble Comics Bundle: Image Comics 30th Anniversary: The '10s",'2022-12-25'),
     purchase('new-'+volume,volume,'new-order',"Humble Comic Bundle: Image Comics in the '10s",'2025-12-17')]);
   const items=records.map(value=>normalizeProviderItem({...value,profileId:undefined}));
   const db={...createEmptyDatabase(),providerItems:Object.fromEntries(items.map(item=>[item.id,item]))};db.canonicalItems=rebuildCanonicalItems(db.providerItems);
   assert.equal(Object.keys(db.canonicalItems).length,4,'Canonical identity requires stronger evidence and remains untouched');
   const before=JSON.stringify(db),offers=[1,2].map(n=>({title:'AUTUMNLANDS, VOL. '+n+' TP (Digital)',mediaType:'book'})),matches=JSON.stringify(matchItems(db.providerItems,offers,db));
   const result=libraryBrowseResults(createLibraryBrowseProjection()(db));assert.equal(result.total,2);
   for(const row of result.rows){assert.equal(row.records.length,2);const h=acquisitionHistory(row.records.map(v=>v.record),db);assert.equal(h.label,'Owned twice');assert.equal(h.purchases,2);assert.equal(resultProviderSummary(row.records),'Humble Bundle');assert.deepEqual(h.entries.map(e=>e.dates[0].slice(0,10)),['2022-12-25','2025-12-17']);assert(h.entries.every(e=>e.bundles.length===1));}
   assert.equal(JSON.stringify(db),before);assert.equal(JSON.stringify(matchItems(db.providerItems,offers,db)),matches);
 }],
 ['Cross-provider exact identity consolidates without conflating access or inventing a second transaction',()=>{
   const db=database([purchase('purchase',1,'one','Bundle','2025-01-01'),record('kindle','AUTUMNLANDS, VOL. 1',{}, {provider:'kindle',ownership:'borrowed',profileId:'family'})]);
   const row=libraryBrowseResults(createLibraryBrowseProjection()(db)).rows[0];assert.equal(row.records.length,2);
   const h=acquisitionHistory(row.records.map(v=>v.record),db);assert.equal(h.purchases,1);assert.equal(h.ownedPurchases,1);assert.equal(h.entries.length,2);assert(h.entries.some(e=>e.access.includes('Borrowed')));
   assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(db),{filters:{provider:'kindle',account:'family',ownership:'borrowed'}}).total,1);
   const fan=record('fan','AUTUMNLANDS, VOL. 1',{purchaseOrigins:[{occurrenceRef:'b'.repeat(64),orderRef:'a'.repeat(64),bundleId:'fan-bundle',bundleTitle:'Fan bundle',purchasedAt:'2026-01-01'}]},{provider:'fanatical'});
   const both=database([db.providerItems.purchase,fan]),bothRow=libraryBrowseResults(createLibraryBrowseProjection()(both)).rows[0];
   assert.equal(bothRow.records.length,2);assert.equal(acquisitionHistory(bothRow.records.map(v=>v.record),both).label,'Owned twice');assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(both),{filters:{acquisitions:'multiple',provider:'fanatical'}}).total,1);
 }],
 ['Repeated Humble native/companion observations of one order count once, with separate account scope retained',()=>{
   const records=[purchase('native',1,'same','Bundle','2025-01-01'),purchase('synced',1,'same','Bundle','2025-01-01')],db=database(records);
   let h=acquisitionHistory(records,db);assert.equal(h.entries.length,1);assert.equal(h.purchases,1);assert.equal(h.ownedPurchases,1);assert.equal(h.entries[0].records.length,2);
   const another={...records[1],id:'family',profileId:'family'};h=acquisitionHistory([...records,another],db);assert.equal(h.purchases,2);
 }],
 ['Fanatical native and synchronized aggregate occurrences do not double count purchases',()=>{
   const origin=(ref,basis)=>({occurrenceRef:ref.repeat(64),orderRef:'a'.repeat(64),bundleId:'bundle',bundleTitle:'Fan bundle',purchasedAt:'2025-01-01',...(basis?{basis:'order-bundle-count'}:{})});
   const native=record('native','Example', {purchaseOrigins:[origin('b'),origin('c')]},{provider:'fanatical'}),sync=record('sync','Example',{purchaseOrigins:[origin('d',true),origin('e',true)]},{provider:'fanatical'}),db=database([native,sync]);
   const h=acquisitionHistory([native,sync,native],db);assert.equal(h.entries.length,1);assert.equal(h.purchases,2);assert.equal(h.label,'Owned twice');
 }],
 ['Different editions, units, runs, creators, identifiers and Possible subtitles never consolidate',()=>{
   for(const [title,metadata]of [['The Autumnlands Vol. 2',{}],['The Autumnlands Vol. 1: A Different Story',{}],['The Autumnlands Vol. 1',{edition:'Second'}],['The Autumnlands Vol. 1',{run:'2020'}],['The Autumnlands Vol. 1',{authors:['Other Writer']}],['The Autumnlands Vol. 1',{isbn:'9780140328721'}]]){
     const db=database([record('first','The Autumnlands Vol. 1',{edition:'First',run:'1995',authors:['Writer'],isbn:'9780306406157'}),record('other',title,metadata)]);
     assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(db)).total,2,title+JSON.stringify(metadata));
   }
 }],
 ['Explicit separations and ambiguous missing-metadata bridges remain separate display entries',()=>{
   const db=database([record('a','Same Work',{isbn:'9780306406157'}),record('b','Same Work'),record('c','Same Work',{isbn:'9780140328721'})]);assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(db)).total,3);
   const split=database([record('a','Same Work'),record('b','Same Work')]);split.manualMatchDecisions={different:{decision:'same-work',itemIds:['a','b']}};assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(split)).total,2);
   delete split.manualMatchDecisions;split.editionSeparations={one:{itemId:'a',otherItemIds:['b']}};assert.equal(libraryBrowseResults(createLibraryBrowseProjection()(split)).total,2);
 }],
 ['Earlier missing records remain history, deduplicate observations and cannot add current owned copies',()=>{
   const current=purchase('current',1,'new','New bundle','2025-12-17'),db=database([current]);
   db.providerHistory={older:{item:purchase('old',1,'old','Old bundle','2022-12-25')},observation:{item:{...current,observedAt:'2025-12-18'}},otherVolume:{item:purchase('other',2,'other','Other bundle','2020-01-01')}};
   const before=JSON.stringify(db),row=libraryBrowseResults(createLibraryBrowseProjection()(db)).rows[0],h=acquisitionHistory([...row.records.map(v=>v.record),...row.historyRecords],db);
   assert.equal(row.records.length,1);assert.equal(row.historyRecords.length,2);assert.equal(h.purchases,2);assert.equal(h.ownedPurchases,1);assert.equal(h.label,'2 recorded purchases');assert.equal(JSON.stringify(db),before);
 }],
 ['Single purchases stay simple and ownership overrides cannot manufacture acquisitions',()=>{
   const item=purchase('one',1,'order','Bundle',null),db=database([item]),h=acquisitionHistory([item],db);assert.equal(h.label,'');assert.equal(h.purchases,1);assert.deepEqual(h.entries[0].dates,[]);
   db.ownershipPolicy={allOwned:true,providers:{}};const unknown={...item,ownership:'unknown'};assert.equal(acquisitionHistory([unknown],db).ownedPurchases,0);
 }],
 ['Consolidated filters, pagination and all original canonical anchors retain every current record',()=>{
   const records=[purchase('a',1,'a','Bundle A','2022-01-01'),purchase('b',1,'b','Bundle B','2025-01-01',{profileId:'family'})],db=database(records),projection=createLibraryBrowseProjection()(db);
   assert.equal(libraryBrowseResults(projection,{anchor:'b'}).rows[0].records.length,2);
   const filtered=libraryBrowseResults(projection,{filters:{account:'family'}});assert.equal(filtered.total,1);assert.equal(filtered.rows[0].qualifying.length,1);
   assert.equal(libraryBrowseResults(projection,{paginateRecords:true}).total,2);
 }]
);

libraryBrowseTests.push(['Purchase history is collapsed and lazy, safely shows original bundles/accounts/dates and labels unavailable totals',()=>{
 class Element{constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.open=false;this.value='';}set textContent(v){this.value=v;}get textContent(){return this.value+this.children.map(c=>c.textContent).join(' ');}append(...values){this.children.push(...values);}addEventListener(name,listener){this.listeners[name]=listener;}}
 const old=globalThis.document;try{globalThis.document={createElement:tag=>new Element(tag)};
   const records=[purchase('a',1,'a','Bundle A <img src=x>','2022-12-25'),purchase('b',1,'b','Bundle B','2025-12-17')],db=database(records),row=libraryBrowseResults(createLibraryBrowseProjection()(db)).rows[0];
   const summary=createLibraryResultSummary(row,db);assert.match(summary.textContent,/Owned twice/);
   const history=summary.children.find(child=>child.className==='library-purchase-history');assert.equal(history.open,false);assert.equal(history.children.length,1);assert(!history.textContent.includes('Bundle A'));
   history.open=true;history.listeners.toggle();assert.match(history.textContent,/Bundle A <img src=x>/);assert.match(history.textContent,/Humble Bundle/);assert.match(history.textContent,/Personal/);assert.match(history.textContent,/2022/);assert.match(history.textContent,/Total bundle price: not recorded/);assert(!history.textContent.includes('$25'));
   history.listeners.toggle();assert.equal(history.children.length,2,'Expanding repeatedly does not duplicate history');
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
}]);


libraryBrowseTests.push(
 ['Owned multiple times filters distinct Autumnlands purchases, not observations, editions or uncertain access',()=>{
   const records=[1,2].flatMap(n=>[purchase('old-'+n,n,'old','Old bundle','2022-12-25'),purchase('new-'+n,n,'new','New bundle','2025-12-17')]);
   records.push(purchase('single',3,'one','One bundle','2025-01-01'),purchase('repeat-a',4,'repeat','Repeated bundle','2025-01-01'),purchase('repeat-b',4,'repeat','Repeated bundle','2025-01-01'),purchase('five',5,'five','Bundle','2025-01-01'),purchase('six',6,'six','Bundle','2025-01-01'));
   records.push({...purchase('first',7,'first','Bundle','2025-01-01'),metadata:{purchaseId:'first',edition:'First'}},{...purchase('second',7,'second','Bundle','2025-01-01'),metadata:{purchaseId:'second',edition:'Second'}});
   records.push(purchase('unknown-a',8,'ua','Bundle','2025-01-01',{ownership:'unknown'}),purchase('unknown-b',8,'ub','Bundle','2025-01-01',{ownership:'unknown'}));
   const db=database(records);db.ownershipPolicy={allOwned:true,providers:{}};const before=JSON.stringify(db),projection=createLibraryBrowseProjection()(db);
   const all=libraryBrowseResults(projection,{countAcquisitions:true}),filtered=libraryBrowseResults(projection,{filters:{acquisitions:'multiple'},countAcquisitions:true});
   assert.equal(all.total,9);assert.equal(all.multipleOwnedCount,2);assert.deepEqual(filtered.rows.map(row=>row.canonical.title),['The Autumnlands Vol. 1','The Autumnlands Vol. 2']);assert.equal(filtered.multipleOwnedCount,2);
   assert.equal(JSON.stringify(db),before);
 }],
 ['Multiple ownership composes with search, media, provider, account and access without recounting filtered copies',()=>{
   const records=[1,2].flatMap(n=>[purchase('old-'+n,n,'old','Old bundle','2022-12-25'),purchase('new-'+n,n,'new','New bundle','2025-12-17',{profileId:'family'})]);
   const projection=createLibraryBrowseProjection()(database(records)),filters={acquisitions:'multiple',provider:'humble',account:'family',ownership:'owned',mediaType:'book'};
   const result=libraryBrowseResults(projection,{query:'Autumnlands Vol 2',filters,countAcquisitions:true});assert.equal(result.total,1);assert.equal(result.multipleOwnedCount,1);assert.equal(result.rows[0].qualifying.length,1);assert.equal(result.rows[0].records.length,2);
   assert.equal(libraryBrowseResults(projection,{filters:{...filters,provider:'kobo'},countAcquisitions:true}).multipleOwnedCount,0);assert.equal(libraryBrowseResults(projection,{filters:{...filters,mediaType:'game'}}).total,0);
   const unfiltered=libraryBrowseResults(projection,{query:'Autumnlands Vol 2',filters:{provider:'humble'},countAcquisitions:true});assert.equal(unfiltered.multipleOwnedCount,1);
 }],
 ['Multiple ownership keeps sorting/pagination and uses Fanatical occurrence deduplication including single aggregated records',()=>{
   const records=Array.from({length:21},(_,i)=>i+1).flatMap(n=>[purchase('a-'+n,n,'a','A','2022-01-01'),purchase('b-'+n,n,'b','B','2025-01-01')]);
   const projection=createLibraryBrowseProjection()(database(records)),result=libraryBrowseResults(projection,{filters:{acquisitions:'multiple'},sort:'title-desc',size:20,page:1});assert.equal(result.total,21);assert.equal(result.multipleOwnedCount,21);assert.equal(result.rows.length,1);assert.equal(result.rows[0].canonical.title,'The Autumnlands Vol. 1');
   const origin=ref=>({occurrenceRef:ref.repeat(64),orderRef:'a'.repeat(64),bundleId:'bundle',bundleTitle:'Fan bundle'}),single=record('single','Single Fan',{purchaseOrigins:[origin('b')]},{provider:'fanatical'}),repeat={...single,id:'repeat',recordRef:'repeat'},multiple=record('multiple','Multiple Fan',{purchaseOrigins:[origin('b'),origin('c')]},{provider:'fanatical'});
   const fan=libraryBrowseResults(createLibraryBrowseProjection()(database([single,repeat,multiple])),{filters:{acquisitions:'multiple'}});assert.equal(fan.total,1);assert.equal(fan.rows[0].canonical.title,'Multiple Fan');
 }],
 ['Multiple ownership preferences default to All, round-trip privately, reject unsupported values and stay local to Library',()=>{
   assert.equal(validateUiPreferences({library:{}}).library.acquisitions,'all');
   const prefs=mergeUiPreferences(validateUiPreferences({}),{library:{acquisitions:'multiple'}});assert.equal(browseView(prefs,'library').acquisitions,'multiple');assert(!('acquisitions' in browseView(prefs,'contents')));
   assert.equal(validateUiPreferences(JSON.parse(JSON.stringify(prefs))).library.acquisitions,'multiple');assert.throws(()=>validateUiPreferences({library:{acquisitions:'all-observations'}}));rememberBrowseView(prefs,'library',{acquisitions:'all'});assert.equal(prefs.library.acquisitions,'all');
 }]
);
