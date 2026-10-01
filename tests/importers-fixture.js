import { createStorageWriter } from '../src/background/storage-writer.js';
import { completeProviderSnapshot, completedScope } from '../src/lib/provider-snapshot.js';
import '../src/providers/metadata.js';
import '../src/providers/fanatical.js';

// Real content-script controls, with signed-in fetches replaced by fixtures.
// Content scripts have no direct storage access; the worker owns this hidden area.
const checks=[]; const values={}; const writer=createStorageWriter({get:async defaults=>structuredClone({...defaults,...values}),set:async updates=>Object.assign(values,structuredClone(updates))});
const shadows=[]; const attach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.push(root);return root;};
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await pause();}throw new Error('Importer did not finish.');};
const fixtures=[
  ['steam','steam-store','GalacticSteamStore','fetchOwnedSteamGames','/account'],
  ['gog','gog','GalacticGog','fetchGogGames','/account'],
  ['epic','epic','GalacticEpic','fetchEpicGames','/library'],
  ['amazon-games','amazon-games','GalacticAmazonGames','fetchAmazonGames','/my-collection'],
  ['audible','audible','GalacticAudible','fetchAudibleAudiobooks','/library'],
  ['kindle','kindle','GalacticKindle','fetchKindleBooks','/hz/mycd/'],
  ['amazon-video','amazon-video','GalacticAmazonVideo','fetchAmazonVideoLibrary','/gp/video/library'],
  ['kobo','kobo','GalacticKobo','fetchKoboLibrary','/library'],
  ['humble','humble','GalacticHumble','fetchHumblePurchases','/home/purchases'],
  ['fanatical','fanatical','GalacticFanatical',null,'/orders'],
  ['fandango-at-home','fandango-at-home','GalacticFandangoAtHome','readFandangoGrid','/content/browse/mylibrary']
];
try{
  for(const [provider,file,globalName,method,path] of fixtures){
    history.replaceState({},'',path);
    const mediaType=provider==='kindle'||provider==='kobo'||provider==='humble'?'book':provider==='audible'?'audiobook':provider==='amazon-video'||provider==='fandango-at-home'?'movie':'game';
    const items=[{providerItemId:'fixture-123',title:`Test ${provider}`,mediaType,ownership:'owned'}];
    const scopes=provider==='kindle'?[completedScope('books',1,1,'reported-count'),completedScope('personal-documents',0,0,'reported-count')].map(scope=>({...scope,duplicateCount:0})):provider==='fandango-at-home'?[completedScope('movie',1,1,'reported-count'),completedScope('tv',0,0,'reported-count')]:[completedScope('library',1,1,'reported-count')];
    const snapshot=completeProviderSnapshot(provider,items,scopes);
    const result={items,snapshot,unresolvedApps:[],newAppCount:1,skippedCount:0,failures:[],knownPurchaseIds:['fixture-purchase'],purchasesRead:1,skippedKnown:0,diagnostics:{windowsRead:1,categoryCounts:{'personal-documents':0}}};
    if(method)globalThis[globalName]={[method]:async()=>method==='readFandangoGrid'?items:result};
    const denied=()=>{throw new Error('Content-script storage access denied.');};
    let imported=0; let mode='full';
    globalThis.chrome={storage:{local:{get:denied,set:denied},session:{get:denied,set:denied}},runtime:{sendMessage:async request=>{
      if(request.type==='GET_PROVIDER_SYNC_STATE')return {ok:true,hasFullBaseline:true,syncState:{knownProviderItemIds:[],knownPurchaseIds:[],knownOrderFingerprints:[]}};
      if(request.type==='FETCH_FANATICAL_ORDERS')return {ok:true,result:{items:[{sourceItemId:'fixture-123',title:items[0].title,mediaType}],snapshot,orderFingerprints:[]}};
      if(request.type==='FANDANGO_IMPORT_STATE')return {ok:true,state:request.action==='get'?{phase:'tv',fullRescan:mode==='full',expected:{movies:1,tv:0},urls:{tv:location.href},items:mode==='full'?items:[],knownItemIds:[]}:null};
      if(request.type==='IMPORT_PROVIDER_ITEMS'){
        const database=await (request.mode==='incremental'?writer.mergeProviderItems(provider,request.items):writer.replaceProviderItems(provider,request.items,{},request.snapshot));
        imported++;const state=database.providers[provider];return {ok:true,gameCount:state.itemCount,...state};
      }
      return {ok:false,error:'Unexpected importer request.'};
    }}};
    for(mode of provider==='epic'?['full']:['full','incremental']){
      const before=imported;
      if(provider==='fandango-at-home'){
        // Final View All stage of the actual resumable workflow, in both modes.
        globalThis[globalName][method]=async()=>[];
        await import(`../src/providers/${file}-content.js?mode=${mode}`);
      }else{
        if(mode==='full')await import(`../src/providers/${file}-content.js`);
        const shadow=shadows.at(-1);
        const button=shadow.querySelector(`button[data-mode="${mode}"]`)||shadow.querySelector('button');
        assert(button,`${provider} missing ${mode} button`);button.click();
      }
      const shadow=shadows.at(-1);
      await wait(()=>!shadow.querySelector('.status').dataset.busy&&(imported>before||/failed:/iu.test(shadow.querySelector('.status').textContent)));
      assert(!/failed:/iu.test(shadow.querySelector('.status').textContent),shadow.querySelector('.status').textContent);
      checks.push(`${provider} ${mode} controls work with direct storage denied`);
      if(provider==='fandango-at-home')document.querySelector('#galactic-library-fandango-at-home-importer').remove();
    }
  }
  await fetch('/test-result',{method:'POST',body:JSON.stringify({checks})});
}catch(error){await fetch('/test-result',{method:'POST',body:JSON.stringify({checks,error:error.stack||error.message})});}
