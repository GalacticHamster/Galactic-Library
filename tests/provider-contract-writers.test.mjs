import test from 'node:test';import assert from 'node:assert/strict';
import {importFanaticalOrdersInPage} from '../shared/fanatical-acquisition.js';
import {fanaticalAcquisitionForGL} from '../src/providers/fanatical-acquisition-adapter.js';
import {fanaticalFixture} from './provider-engine-differential.test.mjs';
import {fanaticalWorker} from './fanatical-coverage.js';
import {validateScanResult,createSyncStore} from '../../Fanatical/src/library-data.mjs';
test('contract v1 projects into GL worker/writer and FAN transactional writer without schema conversion',async()=>{
  for(const headers of [{},{'x-total-count':'2'}]){
    const {result}=await fanaticalFixture(importFanaticalOrdersInPage,{headers});
    assert.equal(result.acquisitionContract.persistence.outcome,'not-attempted');
    await fanaticalWorker(async h=>{
      const acquired=await h.acquire();acquired.projection={ok:true,result:fanaticalAcquisitionForGL(result,{fullScan:true})};
      // The ordinary worker projection adds its snapshot before commit.
      const original=chrome.scripting.executeScript;chrome.scripting.executeScript=async()=>[{result:acquired.projection.result}];
      const projected=await h.acquire();chrome.scripting.executeScript=original;
      assert(projected.projection.ok,projected.projection.error);assert((await h.commit(projected)).result.ok);
      const db=await h.pageB.getDatabase();assert.equal(Object.keys(db.providerItems).length,2);assert.equal(Object.keys(db.providerHistory).length,0);
    });
    const state={};const area={get:async defaults=>structuredClone({...defaults,...state}),set:async patch=>Object.assign(state,structuredClone(patch))};
    const store=createSyncStore(area),receipt=validateScanResult(result,{fullScan:true});
    const scan=await store.execute('begin',[{fullScan:true,confirmed:true,profileLabel:'Synthetic'},1]);
    if(receipt.outcome==='complete')await store.execute('commit',[scan.token,{fanaticalLibraryItems:receipt.items,fanaticalScannedOrderFingerprints:receipt.orderFingerprints,fanaticalImportSummary:{scanMode:'full'}},1]);
    else await store.execute('commitPartial',[scan.token,receipt,1]);
    assert.equal(state.fanaticalLibraryItems.length,2);assert.equal(state.fanaticalHistoricalItems.length,0);
    assert.equal(state.fanaticalScannedOrderFingerprints.length,2);
  }
});
