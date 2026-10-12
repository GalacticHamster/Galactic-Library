// Installed runtime packages in disposable profiles. Optional private backup is
// copied only into the disposable extension's private database, never modified.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {access,mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
import {chromePipe,freePort,firefoxMarionette} from './native-protocol.mjs';
import {createRelease,projectRoot} from '../scripts/release.mjs';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {collectionOverlap,overlapIssueLabel} from '../src/lib/collection-overlap.js';
import {outputPath} from '../scripts/audit-artifacts.mjs';
const firefox=process.argv.includes('--firefox'),kind=firefox?'firefox':'chrome';
const backupPath=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
const original=backupPath?await readFile(backupPath):null;
const database=original?JSON.parse(original).database:coverageDatabase(coverageBook('left','Collects Alpha (2001) #1-3'),coverageBook('right','Collects Alpha (2001) #3-5'));
const expected=collectionOverlap(database),bytes=Buffer.from(JSON.stringify(database));
assert(expected.pairs.length>0,'Test input must contain overlapping collections');
const hash=value=>createHash('sha256').update(value).digest('hex');
const server=createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');if(req.url==='/backup'){res.end(bytes);}else{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const temporary=await mkdtemp(join(tmpdir(),'gl-overlap-check-'));let child,driver,exited,session;
try{
  const profile=join(temporary,'profile');await mkdir(profile);
  const candidates=firefox?[process.env.FIREFOX_BIN,'C:/Program Files/Mozilla Firefox/firefox.exe']:[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  if(firefox&&process.platform==='win32'){const location=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-AppxPackage -Name Mozilla.Firefox).InstallLocation'],{windowsHide:true,encoding:'utf8'}).trim();if(location)candidates.push(join(location,'VFS/ProgramFiles/Firefox Package Root/firefox.exe'));}
  let binary;for(const path of candidates.filter(Boolean))try{await access(path);binary=path;break;}catch{}
  if(!binary)throw Error('Set CHROME_BIN/FIREFOX_BIN to a local browser binary.');
  const port=firefox?await freePort():0;
  if(firefox)await writeFile(join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\nuser_pref("extensions.update.enabled",false);\nuser_pref("toolkit.telemetry.enabled",false);\nuser_pref("network.captive-portal-service.enabled",false);\n`);
  child=spawn(binary,firefox?['--headless','--no-remote','--profile',profile,'--marionette','--remote-allow-system-access','about:blank']:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:firefox?['ignore','pipe','pipe']:['ignore','pipe','pipe','pipe','pipe']});
  exited=new Promise(done=>child.once('exit',done));child.on('error',()=>{});
  driver=firefox?await firefoxMarionette(port):chromePipe(child);
  if(firefox)await driver.send('WebDriver:NewSession',{capabilities:{alwaysMatch:{browserName:'firefox'}}});
  const release=await createRelease(undefined,undefined,kind);let installed;
  if(firefox){const archive=join(temporary,'GL.zip');await writeFile(archive,release.zip);const response=await driver.send('Addon:Install',{path:archive,temporary:true});installed=response.value??response;
    await driver.send('Marionette:SetContext',{value:'chrome'});const url=await driver.send('WebDriver:ExecuteScript',{script:'return WebExtensionPolicy.getByID(arguments[0]).getURL("options.html");',args:[installed],newSandbox:true});await driver.send('Marionette:SetContext',{value:'content'});await driver.send('WebDriver:Navigate',{url:url.value??url});
  }else{
    const stage=join(temporary,'extension');await mkdir(stage);for(const [path,contents]of release.files){await mkdir(resolve(stage,path,'..'),{recursive:true});await writeFile(join(stage,path),contents);}
    installed=(await driver.send('Extensions.loadUnpacked',{path:stage})).id;
    const target=await driver.send('Target.createTarget',{url:'chrome-extension://'+installed+'/options.html'});session=(await driver.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;await driver.send('Runtime.enable',{},session);
  }
  async function evaluate(script){
    if(firefox){const response=await driver.send('WebDriver:ExecuteAsyncScript',{script:'(async()=>{'+script+'})().then(arguments[arguments.length-1],error=>arguments[arguments.length-1]({error:error.message+"\\n"+error.stack}));',args:[],newSandbox:false});const result=response.value??response;assert.equal(result?.error,undefined,result?.error);return result;}
    const response=await driver.send('Runtime.evaluate',{expression:'(async()=>{'+script+'})()',awaitPromise:true,returnByValue:true},session);assert.equal(response.exceptionDetails,undefined,JSON.stringify(response.exceptionDetails));return response.result.value;
  }
  async function wait(expression){for(let n=0;n<450;n++){const result=await evaluate('return '+expression+';');if(result)return;await pause(100);}throw Error('UI timed out: '+expression);}
  await wait('document.querySelector("#empty-library")&&!document.querySelector("#empty-library").hidden');
  assert(await evaluate('const b=document.querySelector("#library-navigation [data-workspace=overlap]");return b.textContent==="Collection Overlap"&&b.getBoundingClientRect().height>0;'));
  await evaluate('document.querySelector("#library-navigation [data-workspace=overlap]").click();return true;');
  await wait('document.querySelector("#collection-overlap-view").textContent.includes("No comparable issue overlaps found")');
  await evaluate('document.querySelector("#workspace-navigation [data-workspace=library]").click();return true;');
  await evaluate(`window.testRestore={done:false};(async()=>{const S=await import('./src/lib/storage.js');const db=await(await fetch('http://127.0.0.1:${server.address().port}/backup')).json();await S.restoreDatabase(db);window.testRestore.done=true;})().catch(error=>{window.testRestore.error=error.message;});return true;`);
  await wait('window.testRestore?.done||window.testRestore?.error');assert.equal(await evaluate("return window.testRestore.error||'';"),'');
  await wait('document.querySelector("#library-items").children.length>0');
  const coldTimings=await evaluate(`const start=performance.now();let last=start,maxGap=0,ticks=0;const timer=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++;},10);document.querySelector('#library-navigation [data-workspace=overlap]').click();const admissionMs=performance.now()-start;await document.querySelector('#collection-overlap-view > div').ready;clearInterval(timer);return {coldMs:performance.now()-start,admissionMs,maxHeartbeatGapMs:maxGap,heartbeatTicks:ticks};`);
  await wait(`document.querySelector('#collection-overlap-view [role=status]')?.textContent===${JSON.stringify(expected.pairs.length+' overlapping collection pairs.')}`);
  const result=await evaluate(`
    const view=document.querySelector('#collection-overlap-view'),status=view.querySelector('[role=status]');
    const assert=(ok,text)=>{if(!ok)throw Error(text);},change=(node,value,type)=>{node.value=value;node.dispatchEvent(new Event(type,{bubbles:true}));};
    assert(!document.querySelector('#overlap-workspace').hidden,'Workspace hidden');
    const rows=[...view.querySelectorAll('[data-overlap-pair]')],counts=rows.map(row=>Number(/^(\\d+) shared/.exec(row.querySelector('p').textContent)[1]));
    assert(counts.every((n,i)=>!i||counts[i-1]>=n),'Shared-count sorting failed');assert(rows.length<=50,'Eagerly rendered all pairs');
    const first=rows[0],title=first.querySelector('h3').textContent;
    first.querySelector('button').click();const detail=view.querySelector('.overlap-pair-details');
    assert(detail.textContent.includes(title)&&detail.textContent.includes(counts[0]+' shared issues'),'Pair details missing');
    const shared=detail.querySelector('section');shared.querySelector('details').open=true;
    assert(shared.querySelectorAll('a[data-overlap-record]').length>=2,'Supporting books missing');
    const sharedLabels=[...shared.querySelectorAll('li > details > summary')].map(node=>node.textContent.replace(/ · (?:inferred|verified)$/u,'')),sourceRefs=[...new Set([...shared.querySelectorAll('a[data-overlap-record]')].map(link=>link.dataset.overlapRecord))];
    const link=detail.querySelector('a[data-overlap-record]'),ref=link.dataset.overlapRecord;
    const pairId=first.dataset.overlapPair;
    if(${expected.pairs.length}>50){[...view.querySelectorAll('.pagination button')].find(button=>button.textContent==='Next page').click();assert(view.querySelectorAll('[data-overlap-pair]').length===Math.min(50,${expected.pairs.length}-50),'Pair pagination failed');}
    change(view.querySelector('[aria-label="Search overlapping collections"]'),title.split(' ↔ ')[0],'input');assert(view.querySelectorAll('[data-overlap-pair]').length>0,'Positive title search lost selected collection');
    change(view.querySelector('[aria-label="Search overlapping collections"]'),'zzzz-no-match','input');assert(view.textContent.includes('No overlapping collections match'),'Search empty state missing');
    change(view.querySelector('[aria-label="Search overlapping collections"]'),'', 'input');change(view.querySelector('[aria-label="Sort collection overlaps"]'),'title','change');
    const sortedTitles=[...view.querySelectorAll('[data-overlap-pair] h3')].map(node=>node.textContent.split(' ↔ ').sort().join(' '));assert(sortedTitles.every((title,i)=>!i||sortedTitles[i-1].localeCompare(title,undefined,{numeric:true})<=0),'Title sort failed');
    view.querySelector('[data-overlap-pair] button').click();detail.querySelector('a[data-overlap-record]').click();
    assert(!document.querySelector('#library-section').hidden&&document.querySelector('#library-items .item-details[open]'),'Record navigation failed');
    return {pairs:${expected.pairs.length},visibleRows:rows.length,topShared:counts[0],topTitle:title,recordRef:ref,pairId,sharedLabels,sourceRefs};
  `);
  const expectedPair=expected.pairs.find(pair=>pair.id===result.pairId);assert(expectedPair,'UI pair does not exist in frozen index');
  assert.deepEqual([...result.sharedLabels].sort(),expectedPair.shared.map(key=>overlapIssueLabel(expectedPair.left.units.get(key).entry)).sort());
  const refs=new Set(expectedPair.shared.flatMap(key=>[expectedPair.left,expectedPair.right].flatMap(c=>c.units.get(key).sources.map(source=>source.item.recordRef))));assert.deepEqual([...result.sourceRefs].sort(),[...refs].sort());
  // Repeat opening an unchanged snapshot: the already built view is reused.
  const timings=await evaluate(`const t=performance.now();document.querySelector('#library-navigation [data-workspace=overlap]').click();const warmMs=performance.now()-t;return {warmMs,warmVisibleRows:document.querySelectorAll('#collection-overlap-view [data-overlap-pair]').length};`);
  assert(timings.warmVisibleRows>0);assert(timings.warmMs<2000,'Warm navigation rebuilt overlap eagerly');
  if(original)assert.equal(hash(await readFile(backupPath)),hash(original),'Frozen backup changed');
  const report={browser:kind,providerRecords:Object.keys(database.providerItems).length,distinctSharedIssues:new Set(expected.pairs.flatMap(pair=>pair.shared)).size,...result,...coldTimings,...timings,backupUntouched:Boolean(original)};
  await writeFile(await outputPath('audit-artifacts/collection-overlap/'+kind+'-native.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  console.log('PASS installed '+kind+': visible Library entry, empty state, frozen/synthetic pairs, shared issues and source links, search, sorting, record navigation, bounded rendering and warm navigation');
}finally{
  if(firefox)try{await driver?.send('WebDriver:DeleteSession');}catch{}
  child?.kill();if(exited)await exited;await new Promise(done=>server.close(done));
  const target=resolve(temporary),base=resolve(tmpdir());if(target.startsWith(base+sep)&&target.slice(base.length+1).startsWith('gl-overlap-check-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
