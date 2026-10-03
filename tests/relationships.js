import assert from 'node:assert/strict';
import { createStorageWriter } from '../src/background/storage-writer.js';
import { createEmptyDatabase, normalizeProviderItem, rebuildCanonicalItems, validateDatabase } from '../src/lib/models.js';
import { identityEvidence, titleIdentity, validIsbn } from '../src/lib/identity.js';
import { contentCoverage, contentKey, proposeContents, seriesCoverage, validateContents } from '../src/lib/contents.js';
import { matchItems } from '../src/lib/matcher.js';
import { handleExternalApiRequest } from '../src/lib/external-api.js';
import { findDuplicateCandidates } from '../src/lib/duplicate-review.js';
import { googleBooksSearchUrl, highConfidenceGoogleBooksCandidate } from '../src/lib/google-books.js';
import { openLibrarySearchUrl } from '../src/lib/open-library.js';
import { DATABASE_SCHEMA_VERSION } from '../src/lib/constants.js';

export const book = (id, metadata = {}, title = 'Shared Title') => normalizeProviderItem({provider:'humble',providerItemId:id,title,mediaType:'book',ownership:'owned',metadata});
export const records = (...items) => Object.fromEntries(items.map((item) => [item.id,item]));
export const relationshipTests = [
  ['complete scans archive missing records while partial failures and quick scans never infer absence',async()=>{
    const values={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    const item={providerItemId:'history',title:'History Game',mediaType:'game',ownership:'owned'};
    await writer.mergeProviderItems('steam',[item]);let database=await writer.getDatabase();const ref=database.providerItems['steam:history'].recordRef;
    await writer.restoreDatabase({...database,providerItems:{...database.providerItems,'steam:history':{...database.providerItems['steam:history'],metadata:{enrichment:{googleBooks:{source:'google-books',volumeId:'example',title:'History Game'}}}}}});
    await assert.rejects(writer.replaceProviderItems('steam',[],{},{}),/snapshot/);assert.equal(Object.keys((await writer.getDatabase()).providerHistory).length,0);
    await writer.mergeProviderItems('steam',[]);assert.equal(Object.keys((await writer.getDatabase()).providerHistory).length,0);
    const snapshot={version:1,provider:'steam',complete:true,itemCount:0,scopes:[{id:'library',readCount:0,expectedCount:0,end:'reported-count',pagesRead:1,complete:true,limitReached:false}]};
    database=await writer.replaceProviderItems('steam',[],{},snapshot);assert.equal(Object.keys(database.providerItems).length,0);assert.equal(Object.keys(database.providerHistory).length,1);
    const response=handleExternalApiRequest(database,{type:'MATCH_ITEMS',apiVersion:1,items:[{title:'History Game',mediaType:'game'}]}).results[0];
    assert.equal(response.owned,false);assert.equal(response.possibleMatches.length,1);assert.equal(response.possibleMatches[0].ownership,'unknown');assert.equal(response.possibleMatches[0].evidence.availability,'not-observed-in-last-full-scan');
    const restored=validateDatabase(JSON.parse(JSON.stringify(database)));assert.equal(restored.providerHistory[ref].item.recordRef,ref);
    database=await writer.mergeProviderItems('steam',[item]);assert.equal(database.providerItems['steam:history'].recordRef,ref);assert.equal(Object.keys(database.providerHistory).length,0);
    assert.equal(database.providerItems['steam:history'].metadata.enrichment.googleBooks.volumeId,'example');
  }],
  ['reseller key evidence is separate from activation and expired keys do not override Steam ownership', () => {
    const parse=globalThis.GalacticHumble.humbleItemsFromOrder;
    const details={subproducts:[{human_name:'Game',platform:'steam'}],all_tpks:[{human_name:'Game',machine_name:'game',is_expired:true,redeemed_key_val:'__GALACTIC_REDACTED_REDEMPTION_VALUE__',expiration_date:'2026-09-01'}]};
    const imported=parse(details,{},'order');assert.equal(imported.length,1);
    const item=normalizeProviderItem({...imported[0],provider:'humble'});assert.equal(item.ownership,'unknown');
    const query={title:'Game',mediaType:'game'};
    const result=handleExternalApiRequest({...createEmptyDatabase(),providerItems:records(item)},{type:'MATCH_ITEMS',apiVersion:1,items:[query]}).results[0];
    assert.equal(result.owned,false);assert.equal(result.matches[0].evidence.keyStatus,'expired');
    assert.equal(result.matches[0].evidence.activationStatus,'unknown');assert.equal(result.matches[0].evidence.purchaseEvidence,'confirmed');
    assert.equal(result.matches[0].evidence.expiresAt,'2026-09-01T00:00:00.000Z');
    assert.equal(JSON.stringify(result).includes('order'),false);
    const steam=normalizeProviderItem({provider:'steam',providerItemId:'123',title:'Game',ownership:'owned'});
    assert.equal(matchItems(records(item,steam),[query])[0].owned,true);
    for(const keyStatus of ['unrevealed','revealed','unknown']){
      const active=normalizeProviderItem({...imported[0],provider:'humble',metadata:{...imported[0].metadata,keyStatus,expiresAt:null}});
      const response=handleExternalApiRequest({...createEmptyDatabase(),providerItems:records(active)},{type:'MATCH_ITEMS',apiVersion:1,items:[query]}).results[0];
      assert.equal(response.owned,true);assert.equal(response.matches[0].evidence.activationStatus,'unknown');
    }
    const dateExpired=normalizeProviderItem({...imported[0],provider:'humble',metadata:{...imported[0].metadata,keyStatus:'revealed'}});assert.equal(matchItems(records(dateExpired,steam),[query])[0].owned,true);assert.equal(matchItems(records(dateExpired),[query])[0].owned,false);
    const invalid={...imported[0],provider:'humble',metadata:{...imported[0].metadata,keyStatus:'activated'}};
    assert.throws(()=>normalizeProviderItem(invalid),/key status/);
    const restored=validateDatabase({...createEmptyDatabase(),providerItems:records(item)});assert.equal(restored.providerItems[item.id].ownership,'unknown');
  }],
  ['legacy Humble game product duplicates cannot conceal an expired key on restore or incremental refresh',async()=>{
    const duplicate=normalizeProviderItem({provider:'humble',providerItemId:'legacy-product',title:'Game',mediaType:'game',ownership:'owned',metadata:{purchaseId:'order',entitlement:'direct-download'}});
    const expired={providerItemId:'key',title:'Game',mediaType:'game',ownership:'owned',metadata:{purchaseId:'order',entitlement:'third-party-key',keyStatus:'expired'}};
    const values={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    await writer.restoreDatabase({...createEmptyDatabase(),providerItems:records(duplicate)});
    const refreshed=await writer.mergeProviderItems('humble',[expired]);
    assert.equal(Object.keys(refreshed.providerItems).length,2,'incremental refresh must not delete legacy records');
    assert.equal(refreshed.providerItems[duplicate.id].ownership,'unknown');
    assert.equal(matchItems(refreshed.providerItems,[{title:'Game',mediaType:'game'}],refreshed)[0].owned,false);
    const restored=validateDatabase(refreshed);assert.equal(restored.providerItems[duplicate.id].ownership,'unknown');
    const withSteam=await writer.mergeProviderItems('steam',[{providerItemId:'123',title:'Game',ownership:'owned'}]);
    assert.equal(matchItems(withSteam.providerItems,[{title:'Game',mediaType:'game'}],withSteam)[0].owned,true);
  }],
  ['Kobo library presence is unknown, subscription evidence is temporary and explicit purchases can be owned', () => {
    const base={providerItemId:'bookId=11111111-1111-1111-1111-111111111111',title:'Kobo Plus Purchased Adventures',detailUrl:'https://www.kobo.com/ebook/adventures',typeText:'eBook',authors:['Author']};
    const parse=globalThis.GalacticKobo.koboItemFromCardData;
    assert.equal(parse(base).ownership,'unknown');
    assert.equal(parse({...base,ownershipLabels:['Kobo Plus']}).ownership,'unknown');
    assert.equal(parse({...base,isKoboPlus:true}).ownership,'subscription');
    assert.equal(parse({...base,ownershipLabels:['Read with Kobo Plus']}).ownership,'subscription');
    assert.equal(parse({...base,isPurchased:true}).ownership,'owned');
    assert.equal(parse({...base,ownershipLabels:['Purchased','Kobo Plus']}).ownership,'owned');
    assert.equal(parse({...base,isPurchased:true,isKoboPlus:true}).ownership,'unknown');
    const item=normalizeProviderItem({...parse(base),provider:'kobo',ownership:'owned'});assert.equal(item.ownership,'unknown');
    const owned=normalizeProviderItem({...parse({...base,isPurchased:true}),provider:'kobo'});
    const subscription=normalizeProviderItem({...parse({...base,isKoboPlus:true}),provider:'kobo'});
    assert.equal(matchItems(records(subscription),[{title:base.title,mediaType:'book',authors:['Author']}])[0].owned,false);
    assert.equal(matchItems(records(owned),[{title:base.title,mediaType:'book',authors:['Author']}])[0].owned,true);
  }],
  ['legacy Kobo owned claims downgrade on storage read and cannot contribute confirmed contents', async () => {
    const item=book('legacy',{authors:['Author']});item.provider='kobo';item.id='kobo:legacy';item.ownership='owned';
    const database={...createEmptyDatabase(),providerItems:{[item.id]:item},contentReviews:{[item.id]:{entries:[{series:'Comic',run:'2020',unitType:'issue',number:'1',language:'en'}]}}};
    const validated=validateDatabase(database);assert.equal(validated.providerItems[item.id].ownership,'unknown');
    assert.equal(contentCoverage(validated,validated.contentReviews[item.id].entries).owned,0);
    assert.equal(validateDatabase(validated).providerItems[item.id].ownership,'unknown');
  }],
  ['separating a falsely merged edition survives imports, backup and enrichment and can be undone', async () => {
    const values={};const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    const items=['a','b','c'].map(providerItemId=>({providerItemId,title:'Shared Title',mediaType:'book',ownership:providerItemId==='a'?'unknown':'owned',metadata:{authors:['Author']}}));
    await writer.mergeProviderItems('humble',items);let database=await writer.getDatabase();assert.equal(Object.keys(database.canonicalItems).length,1);
    const ref=database.providerItems['humble:a'].recordRef;
    database=await writer.separateEdition('humble:a');assert.equal(Object.keys(database.canonicalItems).length,2);
    const separation=Object.keys(database.editionSeparations)[0];
    assert.deepEqual(database.editionSeparations[separation].otherItemIds,['humble:b','humble:c']);
    await writer.mergeProviderItems('humble',items);
    await writer.saveGoogleBooksEnrichments([{itemIds:['humble:a'],enrichment:{source:'google-books',volumeId:'book-a',authors:['Author']}}]);
    database=await writer.getDatabase();assert.equal(Object.keys(database.canonicalItems).length,2);assert.equal(database.providerItems['humble:a'].recordRef,ref);
    const request={title:'Shared Title',mediaType:'book',authors:['Author']};let result=matchItems(database.providerItems,[request],database)[0];assert.equal(result.owned,false);assert.equal(result.possibleMatches.length,3);
    const restored=validateDatabase(JSON.parse(JSON.stringify(database)));await writer.restoreDatabase(restored);assert.equal(Object.keys((await writer.getDatabase()).canonicalItems).length,2);
    await assert.rejects(writer.saveManualMatchDecision({itemIds:['humble:a','humble:b']},'same-edition'),/prevents this edition merge/u);
    database=await writer.undoEditionSeparation(separation);assert.equal(Object.keys(database.canonicalItems).length,1);assert.equal(matchItems(database.providerItems,[request],database)[0].owned,true);
  }],
  ['Same work blocks automatic and indirect edition merges while preserving Possible', () => {
    const a=book('a',{authors:['Author']});const b=book('b',{authors:['Author']});const c=book('c',{authors:['Author']});
    const items=records(a,b,c);const decisions={pair:{itemIds:[a.id,c.id],decision:'same-work'}};
    const stale=rebuildCanonicalItems(items);const grouped=rebuildCanonicalItems(items,decisions,stale);
    assert.equal(Object.keys(grouped).length,2);assert.ok(Object.values(grouped).every(group=>!(group.providerItemIds.includes(a.id)&&group.providerItemIds.includes(c.id))));
    const result=matchItems(items,[{title:a.title,mediaType:'book',authors:['Author']}],{manualMatchDecisions:decisions,canonicalItems:stale})[0];assert.equal(result.owned,false);assert.equal(result.possibleMatches.length,3);
  }],
  ['full book titles establish companion identity while contradictory identifier scopes require disambiguation', () => {
    const a=book('a',{authors:['Author'],isbn:'9780306406157',language:'en'});
    let [result]=matchItems(records(a),[{title:a.title,mediaType:'book'}]);assert.equal(result.owned,true);assert.equal(result.matches.length,1);
    [result]=matchItems(records(a),[{title:a.title,mediaType:'book',authors:['Author']}]);assert.equal(result.owned,true);
    const b=book('b',{isbn:'9780306406157',language:'ja'});
    [result]=matchItems(records(a,b),[{title:a.title,mediaType:'book',identifiers:{isbn:'9780306406157'}}]);assert.equal(result.owned,false);assert.equal(result.possibleMatches.length,2);
    [result]=matchItems(records(a,b),[{title:a.title,mediaType:'book',language:'en',identifiers:{isbn:'9780306406157'}}]);assert.equal(result.owned,true);assert.equal(result.matches.length,1);
  }],
  ['splitting an edition preserves every record even when canonical and input orders differ', () => {
    const a=book('a',{authors:['Author']});const b=book('b',{authors:['Author']});
    const providerItems=records(b,a);const previous=rebuildCanonicalItems(providerItems);
    const decisions={pair:{decision:'different',itemIds:[a.id,b.id]}};
    const split=rebuildCanonicalItems(providerItems,decisions,previous);
    assert.equal(Object.keys(split).length,2);assert.deepEqual(Object.values(split).flatMap(group=>group.providerItemIds).sort(),[a.id,b.id]);
    assert.deepEqual(Object.keys(rebuildCanonicalItems(providerItems,decisions,split)),Object.keys(split));
  }],
  ['writer rejects a Same edition review that would cross an existing Different works decision', async () => {
    const values={};const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    await writer.mergeProviderItems('humble',['a','b','c'].map(providerItemId=>({providerItemId,title:'Same title',mediaType:'book',metadata:{authors:['Author']}})));
    await writer.saveManualMatchDecision({itemIds:['humble:a','humble:c']},'different');
    const database=await writer.getDatabase();const groups=Object.values(database.canonicalItems);
    const left=groups.find(group=>group.providerItemIds.includes('humble:a'));const right=groups.find(group=>group.providerItemIds.includes('humble:c'));
    assert.ok(left.providerItemIds.includes('humble:b')||right.providerItemIds.includes('humble:b'));
    const other=left.providerItemIds.includes('humble:b')?'humble:c':'humble:a';
    await assert.rejects(writer.saveManualMatchDecision({itemIds:['humble:b',other]},'same-edition'),/indirect identity conflict/u);
    assert.deepEqual((await writer.getDatabase()).manualMatchDecisions,database.manualMatchDecisions);
  }],
  ['ordinary words ending in ed stay meaningful and anniversary editions retain their full label', () => {
    for(const title of ['Red','United','Beloved'])assert.equal(titleIdentity(title).edition,'');
    const identity=titleIdentity('Little Brother (Tenth Anniversary Edition)');assert.equal(identity.base,'little brother');assert.equal(identity.edition,'tenth anniversary edition');
  }],
  ['enrichment prefers validated ISBNs and identifier-only books can enter the queue', async () => {
    const query={title:'Provider collection title',authors:[],isbn:['0-306-40615-2'],language:'en'};
    assert.equal(new URL(googleBooksSearchUrl({...query,apiKey:'test'})).searchParams.get('q'),'isbn:9780306406157');
    const open=new URL(openLibrarySearchUrl(query));assert.equal(open.searchParams.get('q'),'isbn:9780306406157');assert.equal(open.searchParams.has('title'),false);
    const candidate={title:'Catalog title',isbn:['9780306406157'],authors:['Writer'],language:'en',volumeId:'v'};
    assert.equal(highConfidenceGoogleBooksCandidate(query,[candidate]),candidate);
    assert.equal(highConfidenceGoogleBooksCandidate(query,[{...candidate,language:'ja'}]),null);
    assert.equal(highConfidenceGoogleBooksCandidate({...query,authors:['Another Writer']},[candidate]),null);
    assert.equal(highConfidenceGoogleBooksCandidate(query,[{...candidate,isbn:['9780140328721']}]),null);
    const values={};const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    await writer.mergeProviderItems('humble',[{providerItemId:'isbn',title:'Book',mediaType:'book',metadata:{isbn:'9780306406157'}},{providerItemId:'invalid',title:'Another',mediaType:'book',metadata:{isbn:'9780306406158'}}]);
    assert.equal((await writer.startGoogleBooksEnrichmentJob()).queue.length,2);
  }],
  ['series scopes report union, overlaps and bounded gaps without claiming a series endpoint', () => {
    const a=book('a');const b=book('b');const c={...book('c'),ownership:'subscription'};
    const entry=(number,patch={})=>({series:'Batman',run:'2011',language:'en',unitType:'issue',number,completeness:'full',...patch});
    const database={providerItems:records(a,b,c),contentReviews:{[a.id]:{entries:[entry('1'),entry('3'),entry('1/2'),entry('1',{unitType:'annual'})]},[b.id]:{entries:[entry('3'),entry('5'),entry('2',{language:'ja'}),entry('2',{run:'1986'}),entry('4',{completeness:'excerpt'})]},[c.id]:{entries:[entry('2')]}}};
    const groups=seriesCoverage(database);const issues=groups.find(group=>group.unitType==='issue'&&group.run==='2011'&&group.language==='en');
    assert.deepEqual(issues.gaps,['2','4']);assert.equal(issues.entries.length,4);assert.deepEqual(issues.overlap.map(entry=>entry.number),['3']);assert.equal(groups.length,4);
    assert.equal(contentCoverage(database,[entry('1')],{excludeItemIds:[a.id]}).owned,0);
  }],
  ['review queue includes same-title homonyms, same-provider editions and previously reviewed aliases', () => {
    const a=book('a',{authors:['A']});const b=book('b',{authors:['B']});const c=book('c',{},'Other title');
    const candidates=findDuplicateCandidates(records(a,b,c),{[`${a.id}\u0000${c.id}`]:{itemIds:[a.id,c.id],decision:'same-work'}});
    assert.equal(candidates.length,2);assert.ok(candidates.some(candidate=>candidate.itemIds.includes(b.id)));assert.ok(candidates.some(candidate=>candidate.decision==='same-work'));
    const d=book('d',{},'Shared Title, 2nd Edition');assert.equal(findDuplicateCandidates(records(a,d)).length,1);
  }],
  ['provider observation dates stay distinct from enrichment and survive backup validation', async () => {
    const values={};const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    let database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Book',mediaType:'book',ownership:'owned'}]);
    const observed=database.providerItems['humble:a'].observedAt;
    database=await writer.saveOpenLibraryEnrichment(['humble:a'],{source:'open-library',workKey:'/works/OL1W',title:'Book'});
    assert.equal(database.providerItems['humble:a'].observedAt,observed);
    assert.equal(validateDatabase(database).providerItems['humble:a'].observedAt,observed);
    const legacy=structuredClone(database);delete legacy.providerItems['humble:a'].observedAt;legacy.schemaVersion=1;
    assert.equal(validateDatabase(legacy).providerItems['humble:a'].observedAt,null);
  }],
  ['book editions and game packages remain Possible in both comparison directions', () => {
    for(const titles of [['Calculus, First Edition','Calculus, 5th Edition'],['Control','Control Deluxe Edition'],['Control Gold Edition','Control Platinum Edition'],['Control','Control Game of the Year Edition'],['Control','Control Digital Deluxe Edition']]){
      for(const [a,b] of [titles,[...titles].reverse()]){
        const item=normalizeProviderItem({provider:'humble',providerItemId:'a',title:a,mediaType:a.startsWith('Calculus')?'book':'game',ownership:'owned'});
        const [result]=matchItems(records(item),[{title:b,mediaType:item.mediaType}]);
        assert.equal(result.owned,false);assert.equal(result.matches.length,0);assert.equal(result.possibleMatches[0]?.title,a);
      }
    }
  }],
  ['homonyms, differing identifiers and separate manga volumes do not become exact ownership', () => {
    const a=book('a',{authors:['A'],isbn:'9780306406157'});const b=book('b',{authors:['B']});
    let [result]=matchItems(records(a,b),[{title:a.title,mediaType:'book'}]);
    assert.equal(result.owned,false);assert.equal(result.possibleMatches.length,2);
    [result]=matchItems(records(a,b),[{title:a.title,mediaType:'book',authors:['A'],identifiers:{isbn:'9780140328721'}}]);
    assert.equal(result.owned,false);assert.deepEqual(result.possibleMatches.map(item=>item.title),[a.title]);
    [result]=matchItems(records(book('v',{},'Naruto Vol. 1')),[{title:'Naruto Vol. 2',mediaType:'book'}]);
    assert.equal(result.owned,false);assert.equal(result.possibleMatches.length,0);
  }],
  ['reviewed same work is Possible while reviewed same edition is exact and reversible', async () => {
    const values={};const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Alternate title',mediaType:'book',ownership:'unknown'},{providerItemId:'b',title:'Owned title',mediaType:'book',ownership:'owned'}]);
    const candidate={id:'ignored',itemIds:['humble:a','humble:b']};
    let database=await writer.saveManualMatchDecision(candidate,'same-work');
    let [result]=matchItems(database.providerItems,[{title:'Alternate title',mediaType:'book'}],database);
    assert.equal(result.owned,false);assert.ok(result.possibleMatches.some(item=>item.title==='Owned title'));
    database=await writer.saveManualMatchDecision(candidate,'same-edition');
    [result]=matchItems(database.providerItems,[{title:'Alternate title',mediaType:'book'}],database);assert.equal(result.owned,true);
    database=await writer.removeManualMatchDecision(candidate.itemIds.join('\u0000'));
    [result]=matchItems(database.providerItems,[{title:'Alternate title',mediaType:'book'}],database);assert.equal(result.owned,false);
    await writer.mergeProviderItems('humble',[{providerItemId:'c',title:'Owned title, 2nd Edition',mediaType:'book',ownership:'owned'}]);
    await assert.rejects(writer.saveManualMatchDecision({itemIds:['humble:b','humble:c']},'same-edition'),/conflicting edition/u);
  }],
  ['reviewed Different blocks candidates, including indirectly reviewed same-work paths', () => {
    const a=book('a',{},'Story');const b=book('b',{},'Story Deluxe Edition');const c=book('c',{},'Alias');
    const manualMatchDecisions={ab:{decision:'different',itemIds:[a.id,b.id]},ac:{decision:'same-work',itemIds:[a.id,c.id]},bc:{decision:'same-work',itemIds:[c.id,b.id]}};
    const [result]=matchItems(records(a,b,c),[{title:a.title,mediaType:'book'}],{manualMatchDecisions});
    assert.deepEqual(result.matches.map(item=>item.title),['Story']);
    assert.deepEqual(result.possibleMatches.map(item=>item.title),['Alias']);
  }],
  ['API distinguishes partial union, complete explicitly enumerated contents and unknown scope', () => {
    const a=book('a',{},'Collection A');const b=book('b',{},'Collection B');
    const entry=number=>({series:'Naruto',run:'1999',language:'en',unitType:'volume',number,completeness:'full'});
    const database={providerItems:records(a,b),contentReviews:{[a.id]:{entries:[entry('1'),entry('2')]},[b.id]:{entries:[entry('3')]}}};
    let [result]=matchItems(database.providerItems,[{title:'Naruto Vols. 1-4',mediaType:'book',contents:[entry('1'),entry('2'),entry('3'),entry('4')],contentsComplete:true}],database);
    assert.equal(result.owned,false);assert.equal(result.coverage.owned,3);assert.equal(result.partialMatches.length,2);assert.equal(result.coverage.missing[0].number,'4');
    [result]=matchItems(database.providerItems,[{title:'Omnibus',mediaType:'book',contents:[entry('1'),entry('2'),entry('3')],contentsComplete:true}],database);
    assert.equal(result.owned,true);assert.equal(result.coverage.complete,true);
    [result]=matchItems(database.providerItems,[{title:'Omnibus',mediaType:'book',contents:[entry('1'),entry('2'),entry('3')]}],database);assert.equal(result.owned,false);
    [result]=matchItems(database.providerItems,[{title:'Naruto Vols. 1-3',mediaType:'book'}],database);
    assert.equal(result.owned,false);assert.equal(result.coverage.complete,false);assert.equal(result.possibleMatches.length,2);assert.equal(result.coverage.possibleCovered.length,3);
    [result]=matchItems(database.providerItems,[{title:'Omnibus',mediaType:'book',contents:[entry('1')],excludeProviders:['humble'],contentsComplete:true}],database);assert.equal(result.owned,false);assert.equal(result.partialMatches.length,0);
  }],
  ['external responses use opaque references and reject malformed optional matching fields', () => {
    const item=book('purchase-secret',{isbn:'9780306406157',token:'credential-secret'},'Example');const database={providerItems:records(item)};
    const request={type:'MATCH_ITEMS',apiVersion:1,items:[{title:'Example',mediaType:' BOOK ',identifiers:{isbn:'0-306-40615-2'}}]};
    const response=handleExternalApiRequest(database,request);assert.equal(response.ok,true);assert.equal(response.results[0].owned,true);
    const json=JSON.stringify(response);assert.equal(json.includes('purchase-secret'),false);assert.equal(json.includes('credential-secret'),false);assert.equal(response.results[0].matches[0].itemRef,item.recordRef);
    for(const patch of [{identifiers:{isbn:['not-an-isbn']}},{identifiers:[]},{identifiers:{token:'secret'}},{contents:[]},{requestId:{secret:true}},{contentsComplete:'yes'},{authors:'Person'}])assert.equal(handleExternalApiRequest(database,{...request,items:[{title:'Example',...patch}]}).ok,false);
    assert.equal(handleExternalApiRequest(database,{type:'GET_STATUS'}).capabilities.reviewedContents,true);
  }],
  ['backups reject duplicate persistent references and cross-media relationship injection', () => {
    const a=book('a');const b={...book('b'),recordRef:a.recordRef};
    assert.throws(()=>validateDatabase({...createEmptyDatabase(),providerItems:records(a,b)}),/duplicate persistent/u);
    const game=normalizeProviderItem({provider:'steam',providerItemId:'1',title:'Game'});
    assert.throws(()=>validateDatabase({...createEmptyDatabase(),providerItems:records(a,game),manualMatchDecisions:{unsafe:{decision:'same-work',itemIds:[a.id,game.id]}}}),/crosses media/u);
  }],
  ['contents proposals retain runs, omnibus volumes, annuals, fractions and unresolved text', () => {
    const proposal=proposeContents('Collects Batman (2011) #1-3 and Batman Annual #1; Naruto Vols. 1-3; Batman #1/2; bonus essays');
    assert.equal(proposal.entries.length,8);
    assert.equal(proposal.entries[0].run,'2011');
    assert.equal(proposal.entries[3].unitType,'annual');
    assert.equal(proposal.entries[4].unitType,'volume');
    assert.equal(proposal.entries[7].number,'1/2');
    assert.deepEqual(proposal.unparsed,['bonus essays']);
    assert.equal(proposeContents('Collects material from Batman #1-3').entries.every(entry=>entry.completeness==='excerpt'),true);
    assert.equal(proposeContents('Collects Batman #1-10000').entries.length,0);
  }],
  ['verified full contents union across providers; excerpts and temporary access do not count', () => {
    const a=book('a');const b={...book('b'),provider:'kindle'};const c={...book('c'),ownership:'subscription'};
    const entry=(number, completeness='full')=>({series:'Batman',run:'2011',unitType:'issue',number,language:'en',completeness});
    const database={providerItems:records(a,b,c),contentReviews:{[a.id]:{entries:[entry('1'),entry('2')]},[b.id]:{entries:[entry('2'),entry('3'),entry('4','excerpt')]},[c.id]:{entries:[entry('4')]}}};
    const coverage=contentCoverage(database,[entry('1'),entry('2'),entry('3'),entry('4')]);
    assert.equal(coverage.owned,3);assert.equal(coverage.total,4);assert.equal(coverage.complete,false);
    assert.equal(contentCoverage(database,[entry('1'),entry('2'),entry('3')]).complete,true);
    assert.equal(seriesCoverage(database)[0].overlap[0].number,'2');
    assert.equal(contentCoverage(database,[{...entry('1'),run:'1986'}]).owned,0);
    assert.equal(contentCoverage(database,[{...entry('1'),language:'ja'}]).owned,0);
    assert.equal(contentKey(entry('1/2')),contentKey(entry('0.5')));
  }],
  ['contents confirmation survives sync/backup and undo removes its ownership evidence', async () => {
    const values={};const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Collection',mediaType:'book',ownership:'owned'}]);
    const entry={series:'Batman',run:'2011',unitType:'issue',number:'1',language:'en',completeness:'full'};
    let database=await writer.saveContentReview('humble:a',{entries:[entry],statement:'Collects Batman #1',sourceUrl:'https://example.test/book'});
    assert.equal(contentCoverage(validateDatabase(database),[entry]).complete,true);
    database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Collection',mediaType:'book',ownership:'owned'}]);
    assert.equal(contentCoverage(database,[entry]).complete,true);
    await assert.rejects(writer.saveContentReview('humble:a',{entries:[{...entry,unitType:'unknown'}]}));
    database=await writer.removeContentReview('humble:a');assert.equal(contentCoverage(database,[entry]).owned,0);
    assert.throws(()=>validateContents([{...entry,number:'1/0'}]));
  }],
  ['validates ISBN checksums and equivalent ISBN-10/13', () => {
    assert.equal(validIsbn('0-306-40615-2'), '9780306406157');
    assert.equal(validIsbn('9780306406158'), '');
    assert.equal(validIsbn('9781234567890'), '');
  }],
  ['homonymous books require edition evidence and separate different authors', () => {
    const a=book('a',{authors:['Author A']}); const b=book('b',{authors:['Author B']}); const c=book('c');
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,b,c))).length, 3);
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('d',{authors:['Author A']})))).length, 1);
  }],
  ['identifier matches preserve conflicting edition and language evidence', () => {
    const a=book('a',{isbn:'9780306406157',language:'en'});
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('b',{isbn:'9780306406157',language:'fr'})))).length,2);
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,book('c',{isbn:'9780306406157'},'Shared Title, 2nd Edition')))).length,2);
    assert.equal(Object.keys(rebuildCanonicalItems(records(book('d',{asin:'B000000001',authors:['A']}),book('e',{asin:'B000000002',authors:['A']})))).length,2);
  }],
  ['persistent edition IDs survive rename, sync, validation and legacy migration', async () => {
    const values={}; const writer=createStorageWriter({get:async defaults=>({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
    let database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Original Title',mediaType:'book',ownership:'owned'}]);
    const id=Object.keys(database.canonicalItems)[0];
    database=await writer.mergeProviderItems('humble',[{providerItemId:'a',title:'Renamed Title',mediaType:'book',ownership:'owned'}]);
    assert.equal(Object.keys(database.canonicalItems)[0],id);
    assert.equal(Object.keys(validateDatabase(database).canonicalItems)[0],id);
    assert.equal(validateDatabase({...createEmptyDatabase(),schemaVersion:1}).schemaVersion,DATABASE_SCHEMA_VERSION);
  }],
  ['different decisions block indirect grouping; same work never merges editions', () => {
    const a=book('a',{authors:['Author']}); const b=book('b',{authors:['Author']}); const c=book('c',{authors:['Author']});
    const groups=Object.values(rebuildCanonicalItems(records(a,b,c),{negative:{decision:'different',itemIds:[a.id,c.id]},bridge:{decision:'same-edition',itemIds:[b.id,c.id]}}));
    assert.ok(groups.every(group=>!(group.providerItemIds.includes(a.id)&&group.providerItemIds.includes(c.id))));
    const other=book('other',{},'Other Title');
    assert.equal(Object.keys(rebuildCanonicalItems(records(a,other),{work:{decision:'same',itemIds:[a.id,other.id]}})).length,2);
  }],
  ['work-level Open Library ISBNs cannot identify an owned edition', () => {
    const item=book('a',{enrichment:{openLibrary:{workKey:'/works/OL1W',isbn:['9780306406157']}}});
    assert.deepEqual(identityEvidence(item).isbn,[]);
    assert.deepEqual(identityEvidence(item).workIds,['/works/OL1W']);
  }],
  ['provider allowlist retains creators, identifiers and numbering without secrets', () => {
    const metadata=globalThis.GalacticProviderMetadata.extract({authors:[{name:'Writer'}],contributors:[{name:'Artist',role:'illustrator'}],isbn:'9780306406157',volume:2,language:'ja',downloadUrl:'secret',token:'secret'});
    assert.deepEqual(metadata.authors,['Writer']); assert.equal(metadata.volume,'2');
    assert.deepEqual(metadata.contributors,[{name:'Artist',role:'illustrator'}]);
    assert.equal(JSON.stringify(metadata).includes('secret'),false);
  }]
];
