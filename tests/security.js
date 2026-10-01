import assert from 'node:assert/strict';
import { normalizeProviderItem, createEmptyDatabase } from '../src/lib/models.js';
import { handleExternalApiRequest } from '../src/lib/external-api.js';

export const securityTests = [
  ['companion output strips private fields from exact, possible, partial and contents evidence', () => {
    const database = createEmptyDatabase();
    const item = normalizeProviderItem({provider:'humble', providerItemId:'private-purchase-id', title:'Comic Collection', mediaType:'book', ownership:'owned', metadata:{authors:['Author'], source:'secret-token', purchaseId:'secret-purchase', detailUrl:'https://example.test/private', token:'secret-token'}});
    // Bypass storage validation to exercise the independent API output boundary.
    item.observedAt = 'secret-date';
    item.privateField = 'secret-record'; database.providerItems[item.id] = item;
    database.providers.humble = {connected:true, itemCount:Infinity, bookCount:1, syncState:{token:'secret-token'}};
    database.providers['secret-provider'] = {connected:true};
    const entry = {series:'Comic', run:'2020', unitType:'issue', number:'1', language:'en', completeness:'full'};
    database.contentReviews[item.id] = {entries:[entry], verifiedAt:'secret-review', sourceUrl:'https://example.test/private', statement:'secret-statement'};
    const response = handleExternalApiRequest(database, {type:'MATCH_ITEMS', apiVersion:1, items:[
      {requestId:'exact', title:item.title, mediaType:'book', authors:['Author'], contents:[entry]},
      {requestId:'possible', title:'Comic Collection, 2nd Edition', mediaType:'book', authors:['Author']}
    ]});
    assert.equal(response.ok,true); assert.equal(response.results[0].owned,true);
    assert.equal(response.results[0].coverage.covered.length,1); assert.equal(response.results[1].possibleMatches.length,1);
    const serialized=JSON.stringify(response);
    for(const secret of ['private-purchase-id','secret-purchase','secret-token','secret-date','secret-record','secret-review','secret-statement','https://example.test/private']) assert.ok(!serialized.includes(secret),secret);
    const match=response.results[0].matches[0]; assert.equal(match.itemRef,item.recordRef); assert.equal(match.evidence.source,'humble'); assert.equal(match.evidence.checkedAt,null);
    assert.equal(response.results[0].coverage.covered[0].evidence[0].verifiedAt,null);
    const status=handleExternalApiRequest(database,{type:'GET_STATUS'});
    assert.deepEqual(Object.keys(status.providers),['humble']); assert.equal(status.providers.humble.gameCount,0);
  }]
];
