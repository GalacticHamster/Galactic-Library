// Fault injection is added ONLY to a disposable extracted test package. The
// shipped worker has no pause hooks, test messages, or fault-control API.
export function instrumentObservationWorker(source){
 const anchor='createStorageWriter(privateArea, storageReady,';
 if(!source.includes(anchor))throw Error('Observation test injection point changed');
 return source.replace(anchor,'createStorageWriter(observationFaultArea(privateArea), storageReady,')+'\n'+observationFaultArea.toString();
}
function observationFaultArea(area){
 async function control(){return (await chrome.storage.session.get('observationTestFault')).observationTestFault??'';}
 async function reached(point){await chrome.storage.session.set({observationTestReached:point});await new Promise(()=>{});}
 return {get:defaults=>area.get(defaults),
  async set(updates){
   const point=await control(),envelope=updates.galacticLibraryObservations,receipt=envelope?.kind==='active'&&envelope.packet;
   if(point==='before-receipt'&&receipt)await reached(point);
   if(point==='before-database'&&updates.galacticLibraryDatabase)await reached(point);
   if(point==='lease-cleanup-error'&&updates.galacticLibraryProviderScans&&!Object.keys(updates.galacticLibraryProviderScans).length)throw Error('Disposable lease cleanup failure');
   if(point==='quota'&&receipt)throw new DOMException('Disposable quota rejection','QuotaExceededError');
   if(point==='during-receipt'&&receipt){const pending=area.set(updates);await chrome.storage.session.set({observationTestReached:point});await pending;await new Promise(()=>{});}
   await area.set(updates);
   if(point==='after-receipt'&&receipt||point==='after-journal'&&envelope?.kind==='saving'||point==='after-database'&&updates.galacticLibraryDatabase)await reached(point);
  },
  async remove(keys){const point=await control();await area.remove(keys);if(point==='after-clear'&&[keys].flat().includes('galacticLibraryDatabase'))await reached(point);}
 };
}
