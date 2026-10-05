// Minimal synthetic acceptance matrix, shared by Node and packaged browsers.
import {contentKey,validateContents,validateContentReview,ownedContentIndex,contentCoverage,parentContentCoverage,seriesCoverage} from '../src/lib/contents.js';
import {createEmptyDatabase,normalizeProviderItem,validateDatabase} from '../src/lib/models.js';
import {createBackup,parseBackup} from '../src/lib/storage.js';
import {createStorageWriter} from '../src/background/storage-writer.js';
import {handleExternalApiRequest} from '../src/lib/external-api.js';

const assert=(value,message)=>{if(!value)throw Error(message);};
const equal=(a,b,message)=>assert(JSON.stringify(a)===JSON.stringify(b),message);
const unit=(number='Alpha',patch={})=>({series:'Collection A',run:'2020',unitType:'component',number,language:'en',completeness:'full',...patch});
const record=(id,patch={})=>normalizeProviderItem({provider:'kindle',providerItemId:id,title:'Collection A',mediaType:'book',ownership:'owned',...patch});
const review=entries=>validateContentReview({entries,statement:'Synthetic source',sourceUrl:'https://example.test/collection',source:'manual-review',verifiedAt:'2026-10-05T12:00:00.000Z'});
const setup=()=>{const p1=record('parent-one'),p2=record('parent-two');const db=createEmptyDatabase();db.providerItems={[p1.id]:p1,[p2.id]:p2};db.contentReviews[p1.id]=review([unit()]);return {db,p1,p2};};
const api=(db,patch={})=>{
  const result=handleExternalApiRequest(db,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Unrelated offered parent',mediaType:'book',contents:[unit()],contentsComplete:true,...patch}]});
  assert(result.ok,'API request rejected');return result.results[0];
};

export const parentScopedComponentCases=[
 ['named coverage belongs to the actual parent, not its shared display label',()=>{
  const {db,p1,p2}=setup();assert(parentContentCoverage(db,p1.id,[unit()]).complete,'Same-parent coverage failed');
  assert(parentContentCoverage(db,p2.id,[unit()]).owned===0,'Another same-label parent supplied coverage');
  db.providerItems[p2.id].title='Collection B';assert(parentContentCoverage(db,p2.id,[unit('Alpha',{series:'Collection B'})]).owned===0,'Different-label parent supplied coverage');
  assert(parentContentCoverage(db,p1.id,[unit('Alpha',{series:'Edited display label'})]).complete,'Display label became the parent identity boundary');
 }],
 ['named index evidence and overlap remain separate across identical parent titles',()=>{
  const {db,p1,p2}=setup();db.contentReviews[p2.id]=review([unit()]);const index=ownedContentIndex(db);
  assert(index.size===2,'Same-label parents shared a component key');
  equal([...index.values()].map(rows=>rows.map(r=>r.parentItemId)),[[p1.id],[p2.id]],'Review-owner attribution lost');
  const groups=seriesCoverage(db);assert(groups.length===2&&groups.every(g=>!g.overlap.length),'Shared names became cross-parent overlap');
 }],
 ['unscoped component equality remains Possible without complete Owned promotion',()=>{
  const {db}=setup(),result=api(db);assert(!result.owned&&!result.coverage.complete&&result.coverage.owned===0,'Unscoped component promoted Owned');
  assert(result.coverage.missing.length===1&&result.coverage.possibleCovered.length===1,'Unscoped evidence disappeared');
  assert(result.possibleMatches[0].title==='Collection A'&&result.possibleMatches[0].relationship==='contains','Candidate parent not explained');
  assert(contentCoverage(db,[unit()]).owned===0,'Unscoped internal lookup promoted coverage');
 }],
 ['caller-provided parent fields and opaque refs cannot inject trusted scope',()=>{
  const {db,p1}=setup();for(const patch of [{parentItemId:p1.id},{componentParentItemId:p1.id},{parentItemRef:p1.recordRef},{contentsParentRef:p1.recordRef},{contents:[unit('Alpha',{parentItemId:p1.id,parentScope:p1.recordRef,mediaType:'book'})]}]){
   const result=api(db,patch);assert(!result.owned&&result.coverage.owned===0,'External caller injected a parent');
   const serialized=JSON.stringify(result);assert(!serialized.includes(p1.id)&&!serialized.includes('parentScope'),'Private scope escaped API projection');
  }
 }],
 ['named components respect stored parent media in scoped and unscoped requests',()=>{
  const {db,p1}=setup();for(const mediaType of ['game','software','audiobook','movie','tv','game-addon']){
   db.providerItems[p1.id].mediaType=mediaType;
   const result=api(db);assert(!result.owned&&!result.coverage.possibleCovered.length,'Cross-media component supplied book evidence: '+mediaType);
   assert(parentContentCoverage(db,p1.id,[unit()],{mediaType:'book'}).owned===0,'Scoped lookup ignored requested media');
   assert(parentContentCoverage(db,p1.id,[unit()],{mediaType}).complete,'Same-domain scoped comparison failed');
  }
 }],
 ['component numeric and fractional names retain literal title identity',()=>{
  const {db,p1}=setup();db.contentReviews[p1.id]=review([unit('01'),unit('1'),unit('1/2'),unit('0.5')]);
  assert(contentKey(unit('01'))!==contentKey(unit('1'))&&contentKey(unit('1/2'))!==contentKey(unit('0.5')),'Component title interpreted as a number');
  assert(validateContents(db.contentReviews[p1.id].entries).length===4,'Literal titles deduplicated');
  db.contentReviews[p1.id]=review([unit('01')]);assert(parentContentCoverage(db,p1.id,[unit('1')]).owned===0,'01 satisfied component 1');
 }],
 ['numbered issue, volume, annual, special and fractional semantics are preserved',()=>{
  for(const unitType of ['issue','volume','annual','special']){
   assert(contentKey(unit('01',{unitType}))===contentKey(unit('1',{unitType})),'Numbered leading-zero control changed');
   assert(contentKey(unit('1/2',{unitType}))===contentKey(unit('0.5',{unitType})),'Numbered fraction control changed');
  }
 }],
 ['component case, Unicode and meaningful edition punctuation remain literal',()=>{
  const {db,p1}=setup();db.contentReviews[p1.id]=review([unit('Alpha'),unit('Café')]);
  for(const title of ['alpha','Ａlpha','Alpha: Special Edition','Alpha - Special Edition'])assert(parentContentCoverage(db,p1.id,[unit(title)]).owned===0,'Literal title distinction erased: '+title);
  assert(parentContentCoverage(db,p1.id,[unit('Cafe\u0301')]).owned===0,'Unicode code-point distinction changed');
  assert(validateContents([unit('  Alpha  '),unit('Alpha')]).length===1,'Existing whitespace validation changed');
 }],
 ['named gaps never interpret numeric component titles as a numbered series',()=>{
  const {db,p1}=setup();db.contentReviews[p1.id]=review([unit('01'),unit('3')]);
  const group=seriesCoverage(db)[0];assert(group.entries.length===2&&!group.gaps.length,'Numeric-looking titles generated issue gaps');
 }],
 ['scoped named coverage retains ownership gates, overrides and exclusions',()=>{
  const {db,p1}=setup();for(const ownership of ['unknown','subscription','borrowed','rental']){db.providerItems[p1.id].ownership=ownership;assert(parentContentCoverage(db,p1.id,[unit()]).owned===0,'Temporary/unknown access supplied coverage');}
  db.ownershipPolicy={allOwned:true,providers:{}};assert(parentContentCoverage(db,p1.id,[unit()]).owned===1,'Effective ownership override lost');
  assert(parentContentCoverage(db,p1.id,[unit()],{excludeProviders:['kindle']}).owned===0,'Provider exclusion ignored');
  assert(parentContentCoverage(db,p1.id,[unit()],{excludeItemIds:[p1.id]}).owned===0,'Parent exclusion ignored');
 }],
 ['excerpts and incomplete run/language remain non-promoting',()=>{
  const {db,p1}=setup();db.contentReviews[p1.id]=review([unit('Alpha',{completeness:'excerpt'})]);assert(parentContentCoverage(db,p1.id,[unit()]).owned===0,'Excerpt became full coverage');
  db.contentReviews[p1.id]=review([unit('Alpha',{run:'',language:''})]);const result=parentContentCoverage(db,p1.id,[unit('Alpha',{run:'',language:''})]);
  assert(result.owned===1&&!result.complete&&result.scopeUncertain,'Existing incomplete scope rules changed');
 }],
 ['orphan, historical and wrong-parent scopes cannot borrow other reviews',()=>{
  const {db,p1,p2}=setup();assert(parentContentCoverage(db,'missing',[unit()]).owned===0,'Missing parent supplied coverage');
  const orphan=structuredClone(db);delete orphan.providerItems[p1.id];assert(parentContentCoverage(orphan,p2.id,[unit()]).owned===0,'Orphan review supplied coverage');
 }],
 ['ordinary standalone title matching and edition grouping stay independent',()=>{
  const {db,p1,p2}=setup();delete db.contentReviews[p1.id];const bare=api(db,{title:'Alpha',contents:undefined,contentsComplete:false}),canonical=validateDatabase(db).canonicalItems;
  db.contentReviews[p1.id]=review([unit()]);equal(api(db,{title:'Alpha',contents:undefined,contentsComplete:false}),bare,'Component entered ordinary title matching');
  equal(validateDatabase(db).canonicalItems,canonical,'Contents changed canonical grouping');
  db.manualMatchDecisions[[p1.id,p2.id].sort().join('\u0000')]={itemIds:[p1.id,p2.id],decision:'same-edition',updatedAt:null};
  assert(parentContentCoverage(validateDatabase(db),p2.id,[unit()]).owned===0,'Same-edition grouping implicitly equated contained works');
 }],
 ['numbered issue identity still spans two collections and reports real overlap',()=>{
  const {db,p1,p2}=setup(),issue=unit('01',{unitType:'issue',series:'Series X'});db.contentReviews[p1.id]=review([issue]);db.contentReviews[p2.id]=review([{...issue,number:'1'}]);
  const result=contentCoverage(db,[{...issue,number:'1'}]);assert(result.complete&&result.covered[0].evidence.length===2,'Numbered cross-collection identity lost');
  assert(seriesCoverage(db)[0].overlap.length===1,'Numbered overlap lost');assert(api(db,{contents:[issue]}).owned,'Numbered API promotion changed');
 }],
 ['mixed numbered and named requests retain numbered partial coverage only',()=>{
  const {db,p1}=setup(),issue=unit('1',{unitType:'issue',series:'Series X'});db.contentReviews[p1.id]=review([unit(),issue]);
  const result=api(db,{contents:[issue,unit()]});assert(!result.owned&&result.coverage.owned===1&&result.coverage.total===2&&!result.coverage.complete,'Mixed list promoted unscoped name');
  assert(result.partialMatches.length===1&&result.coverage.possibleCovered.length===1,'Numbered partial/named Possible evidence lost');
 }],
 ['legacy reviews restore scoped identity without new stored fields or schema',async()=>{
  const {db,p1,p2}=setup();db.contentReviews[p1.id]=review([unit('01',{parentItemId:p2.id,mediaType:'game'}),unit('1')]);
  const values={},writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async update=>Object.assign(values,structuredClone(update))});
  await writer.restoreDatabase(db);await writer.saveContentReview(p2.id,{entries:[unit()],statement:'Legacy editable source',sourceUrl:'https://example.test/legacy'});
  const saved=await writer.getDatabase(),restored=parseBackup(createBackup(saved));equal(restored.contentReviews,saved.contentReviews,'Review/provenance changed on restore');
  equal(restored.providerItems,saved.providerItems,'Provider identity or ownership changed');equal(restored.canonicalItems,saved.canonicalItems,'Grouping changed');
  equal(restored.manualMatchDecisions,saved.manualMatchDecisions,'Manual decisions changed');equal(restored.editionSeparations,saved.editionSeparations,'Separations changed');
  assert(parentContentCoverage(restored,p1.id,[unit('01')]).complete&&parentContentCoverage(restored,p1.id,[unit('1')]).complete,'Numeric literal reviews failed reconstruction');
  assert(parentContentCoverage(restored,p2.id,[unit('01')]).owned===0,'Restored scopes merged');
  assert(!Object.hasOwn(restored.contentReviews[p1.id].entries[0],'parentItemId'),'Injected entry scope persisted');
  assert(!api(restored).owned,'Restore re-enabled unscoped promotion');
 }]
];

export async function checkParentScopedComponents(){for(const [,run] of parentScopedComponentCases)await run();return parentScopedComponentCases.map(([name])=>name);}
