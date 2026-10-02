import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as pause} from 'node:timers/promises';

// Only this disposable test profile receives localhost permission. The shipping
// manifest and its provider-origin checks remain unchanged.
export async function verifyFirefoxImporters({driver,navigate,evaluate,extensions}) {
  let total=200,broken=false,active=0,maxActive=0,tabId;
  const paths=[],errors=[];
  const summary=n=>({_id:'synthetic-order-'+n,status:'COMPLETE',items:[{name:'Synthetic bundle',bundles:[{games:[{name:'Synthetic purchase'}]}]}]});
  const detail=n=>({...summary(n),date:'2026-10-01T00:00:00Z',privateKey:'SYNTHETIC-SECRET',items:[{_id:'bundle-123456',name:'Synthetic bundle',bundles:[{games:[{_id:'product-123456',name:'Synthetic purchase',type:'book',privateDownloadUrl:'SYNTHETIC-SECRET'}]}]}]});
  const server=createServer((request,response)=>{(async()=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname==='/en/orders'){
      response.setHeader('Content-Type','text/html');response.end('<!doctype html><h1>Synthetic orders</h1><script>localStorage.setItem("bsauth",JSON.stringify({token:"SYNTHETIC-SECRET"}));</script>');return;
    }
    if(!url.pathname.startsWith('/api/user/orders')){response.writeHead(404);response.end();return;}
    assert.equal(request.method,'GET');assert.equal(request.headers.authorization,'SYNTHETIC-SECRET');paths.push(url.pathname+url.search);response.setHeader('Content-Type','application/json');
    if(url.pathname==='/api/user/orders'){
      const page=Number(url.searchParams.get('page')||1),start=(page-1)*20,end=Math.min(start+20,total),last=Math.ceil(total/20),links=[];
      response.setHeader('X-Total-Count',String(total));response.setHeader('Content-Range',`items ${start}-${end-1}/${total}`);
      if(page<last&&!(broken&&page===2))links.push(`</api/user/orders?page=${page+1}>; rel="next"`);
      if(page===1)links.push(`</api/user/orders?page=${last}>; rel="last"`);
      if(links.length)response.setHeader('Link',links.join(', '));response.end(JSON.stringify(Array.from({length:end-start},(_,n)=>summary(start+n))));return;
    }
    if(/^\/api\/user\/orders\/synthetic-order-\d+$/.test(url.pathname)){
      active++;maxActive=Math.max(maxActive,active);try{await pause(3);response.end(JSON.stringify(detail(Number(url.pathname.split('-').at(-1)))));}finally{active--;}return;
    }
    response.writeHead(404);response.end('{}');
  })().catch(error=>{errors.push(error);response.writeHead(500);response.end('{}');});});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/en/orders`;
  try{
    for(const extension of extensions){
      await driver.send('Marionette:SetContext',{value:'chrome'});
      const granted=await driver.send('WebDriver:ExecuteAsyncScript',{script:'const done=arguments[arguments.length-1];const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");ExtensionPermissions.add(arguments[0],{permissions:[],origins:["http://127.0.0.1/*"]},WebExtensionPolicy.getByID(arguments[0]).extension).then(()=>done(true),error=>done({error:error.message}));',args:[extension.id],newSandbox:true});assert.equal(granted.value??granted,true);
      await driver.send('Marionette:SetContext',{value:'content'});
      await navigate(extension.id,extension.manifest.options_page);
      if(tabId===undefined)tabId=await evaluate(`return (await chrome.tabs.create({url:${JSON.stringify(url)},active:false})).id;`);await pause(250);
      const execute=async options=>evaluate(`const {${extension.exportName}:importer}=await import(${JSON.stringify(extension.module)});const [result]=await chrome.scripting.executeScript({target:{tabId:${tabId}},world:'MAIN',func:importer,args:[${JSON.stringify(options)}]});if(result.error)throw Error(result.error.message);return result.result;`);
      total=200;broken=false;paths.length=0;maxActive=0;
      const full=await execute({fullScan:true});assert.equal(full.ordersScanned,200);assert.equal(full.coverage.pagesFetched,10);assert.equal(full.items[0].purchaseOrigins.length,200);assert.equal(paths.filter(path=>path.includes('synthetic-order')).length,200);assert(maxActive<=3);assert.doesNotMatch(JSON.stringify(full),/SYNTHETIC-SECRET|synthetic-order-/);
      console.log(`PASS installed Firefox ${extension.label}: actual MAIN injection scans 200 purchases / 10 pages with private projection and bounded concurrency`);
      total=201;paths.length=0;const quick=await execute({knownOrderFingerprints:full.orderFingerprints});assert.equal(quick.ordersScanned,1);assert.equal(quick.coverage.pagesFetched,11);assert.equal(paths.filter(path=>path.includes('synthetic-order')).length,1);
      console.log(`PASS installed Firefox ${extension.label}: quick MAIN import traverses 11 pages and fetches only the new purchase`);
      broken=true;assert.equal(await evaluate(`try{const {${extension.exportName}:importer}=await import(${JSON.stringify(extension.module)});const [result]=await chrome.scripting.executeScript({target:{tabId:${tabId}},world:'MAIN',func:importer,args:[{fullScan:true}]});return Boolean(result.error)||result.result===undefined;}catch{return true;}`),true);
      console.log(`PASS installed Firefox ${extension.label}: broken MAIN pagination returns no importable snapshot`);
    }
    await evaluate(`await chrome.tabs.remove(${tabId});return true;`);assert.equal(errors.length,0,String(errors[0]));
  }finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
}
