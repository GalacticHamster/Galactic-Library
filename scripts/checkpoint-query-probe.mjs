// Independent sender for the offline event-loop control; no extension/browser.
import {parentPort,workerData} from 'node:worker_threads';
const now=()=>performance.timeOrigin+performance.now();
parentPort.on('message',message=>{
 if(message==='arm')for(const [index,request] of workerData.requests.entries())setTimeout(()=>parentPort.postMessage({index,sent:now(),request}),5+index*5);
});
parentPort.postMessage('ready');
