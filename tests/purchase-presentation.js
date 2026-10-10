import assert from 'node:assert/strict';
import '../shared/purchase-snapshot.js';
import '../shared/purchase-adapters.js';
import '../shared/purchase-handoff-ui.js';
const A=globalThis.GalacticPurchaseAdapters,P=globalThis.GalacticPurchasePresentation;
export const purchasePresentationTests=[];
const test=(name,run)=>purchasePresentationTests.push([name,run]);
const text=view=>[view.heading,...view.lines,...view.facts,...view.warnings,view.safety,view.next].join('\n');
const context={store:'Humble',here:'Humble extension',there:'Galactic Library',send:false};
const row=(title='Book',extra={})=>({rowRef:'current:0',status:'current',title,mediaType:'book',purchaseId:'order',entitlement:'direct-download',...extra});
async function report(h,g,hCount=h.length){const inv=(role,rows,count)=>A.inventory({role,accountRef:role,accountLabel:'Personal',currentCount:count,historicalCount:0,observations:rows});return A.reconcileInventories(await inv('hb',h,hCount),await inv('gl',g,g.length));}
const jargon=/\b(?:observation|enrichment|correspondence|canonical|identity conflict|scoped record|provenance|hydration|reconciliation key|purchase origin)s?\b/iu;
test('Different internal totals can describe equivalent saved purchases without claiming missing data',async()=>{
 const r=await report([row(),row('Second')],[row(),row('Book',{entitlement:'third-party-key'}),row('Second')]);const before=JSON.stringify(r),v=P.comparison(r);
 assert.equal(v.state,'equivalent');assert(text(v).includes('2 library entries'));assert(text(v).includes('3 saved purchase records'));assert(text(v).includes('Different totals alone do not mean purchases are missing'));assert(text(v).includes('No library data was changed'));assert(!jargon.test(text(v)));assert.equal(JSON.stringify(r),before);
});
test('Actual unmatched purchase/title coverage shows differences in either direction',async()=>{
 for(const [h,g,where]of [[[row(),row('Missing',{purchaseId:'second-order'})],[row()],'Humble extension'],[[row()],[row(),row('Missing',{purchaseId:'second-order'})],'Galactic Library']]){const v=P.comparison(await report(h,g));assert.equal(v.state,'different');assert(text(v).includes('1 purchased title recorded only in '));assert(text(v).includes(where));assert(!text(v).includes('libraries appear to match'));assert(!jargon.test(text(v)));}
});
test('Ambiguous deliveries and software/game categories are distinct from conflicting identifiers',async()=>{
 const v=P.comparison(await report([row(),row('Tool',{mediaType:'software'})],[row(),row(),row('Tool',{mediaType:'game'})]));assert.equal(v.state,'equivalent');assert(text(v).includes('could match more than one'));assert(text(v).includes('games versus software'));assert(!jargon.test(text(v)));
 const ids=P.comparison(await report([row('Book',{providerItemId:'order:product:a'})],[row('Book',{providerItemId:'order:product:b'})]));assert.equal(ids.state,'incomplete');assert(!text(ids).includes('games versus software'));
 const other=P.comparison(await report([row('Tool',{mediaType:'book'})],[row('Tool',{mediaType:'game'})]));assert(!text(other).includes('games versus software'));
});
test('Incomplete, title-only, truncated and empty comparisons cannot imply equivalent purchases',async()=>{
 for(const r of [await report([row('Book',{purchaseId:null})],[row()]),await report([row('Book',{purchaseId:'other'})],[row()])])assert.equal(P.comparison(r).state,'incomplete');
 const r=await report([row()],[row()]);r.details=[];assert.equal(P.comparison(r).state,'incomplete');
 const empty=P.comparison(await report([],[]));assert.equal(empty.state,'empty');assert(text(empty).includes('Neither selected account'));assert(!jargon.test(text(empty)));
});
test('Preview name counts separate new names from repeated purchase/delivery records without matching changes',()=>{
 assert.deepEqual(A.previewTitles([{title:' Book '}],[{title:'book'},{title:'New'},{title:'New'}]),{newTitleNames:1,additionalRecords:2,titleComparison:'saved-names'});
 const v=P.preview({added:68,updated:7009,newTitleNames:0,additionalRecords:68,updateBreakdownKnown:false,ambiguous:7,conflicts:28},context);assert(text(v).includes('No new purchase titles'));assert(text(v).includes('68 additional purchase or delivery'));assert(text(v).includes('does not distinguish new information'));assert(text(v).includes('7,009 incoming purchase records'));assert(!text(v).includes('improved'));assert(!jargon.test(text(v)));assert(text(v).includes('Nothing has been imported yet'));
});
test('GL meaningful changes and timestamp-only updates remain separate; unsupported models stay conservative',()=>{
 const v=P.preview({added:0,updated:7002,newTitleNames:0,updateBreakdownKnown:true,enrichment:562,observationOnly:6440,legacyMatchable:6440,skipped:35},context);assert(text(v).includes('562 existing records would receive changes beyond'));assert(text(v).includes('6,440 existing records would only receive a last-checked'));assert(!text(v).includes('7,002 records improved'));assert(text(v).includes('does not mean those titles are missing'));assert(!jargon.test(text(v)));
 const unknown=P.preview({added:1,updated:0},context);assert(text(unknown).includes('not necessarily new titles'));
 const none=P.preview({added:0,updated:0,unchanged:3,newTitleNames:0},context);assert(text(none).includes('saved purchase records would stay the same'));
});
test('Both directions and providers explain confirmed import versus an offer, without Humble leaking into FAN',()=>{
 for(const store of ['Humble','Fanatical'])for(const send of [true,false]){const c={store,here:store+' extension',there:'Galactic Library',send},v=P.preview({added:0,updated:1},c),t=P.transfer({added:0,updated:1,skipped:0},c);assert(text(v).includes(send?'Sending creates an offer':'Confirm the selected accounts'));assert(text(v).includes('Nothing has been imported yet'));assert(text(t).includes(send?'The receiving library has not changed':'Confirmed changes have been saved'));assert(!jargon.test(text(v)+text(t)));if(store==='Fanatical')assert(!/Humble|\bHB\b/u.test(text(v)+text(t)));}
});
test('Failed read-only operations describe no changes and an actionable next step; failed imports do not assert rollback',()=>{
 for(const action of ['reconcile','preview']){const v=P.failure(action);assert(text(v).includes('No library data was changed'));assert(text(v).includes('Check the connection, refresh account choices'));assert(!jargon.test(text(v)));}
 assert(!text(P.failure('import')).includes('No library data was changed'));
});
