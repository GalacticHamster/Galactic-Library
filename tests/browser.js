import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {metadataZip,containerXml,opfXml} from './metadata-fixtures.js';

// No personal profile, installed extensions, provider sessions or remote services.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const importerMode=process.argv.includes('--importers');
const candidates=[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let browser;
for(const candidate of candidates){try{await access(candidate);browser=candidate;break;}catch{}}
if(!browser)throw new Error('Set CHROME_BIN to a Chrome/Chromium executable to run the UI checks.');
const profile=await mkdtemp(join(tmpdir(),'gl-browser-test-'));
let result;
let complete;
const fixtureFinished=new Promise(resolve=>{complete=resolve;});
const server=createServer(async(request,response)=>{
  try{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/tests/metadata.epub'){
      response.setHeader('Content-Type','application/epub+zip');response.end(metadataZip([{name:'META-INF/container.xml',text:containerXml,compressed:deflateRawSync(containerXml)},{name:'OEBPS/content.opf',text:opfXml,compressed:deflateRawSync(opfXml)},{name:'OEBPS/chapter.xhtml',text:'Synthetic chapter; should not be read.'}]));return;
    }
    if(pathname==='/test-result'&&request.method==='POST'){
      let body='';for await(const chunk of request){body+=chunk;if(body.length>100000)throw new Error('Excessive result.');}
      result=JSON.parse(body);response.end('ok');complete();return;
    }
    const target=resolve(root,`.${decodeURIComponent(pathname)}`);
    if(!target.startsWith(root+sep)){response.writeHead(403);response.end();return;}
    let body=pathname==='/tests/importers.html'?'<html><body><script type="module" src="/tests/importers-fixture.js"></script></body></html>':await readFile(target);
    if(pathname==='/options.html')body=body.toString().replace('src="src/ui/options.js"','src="tests/browser-fixture.js"');
    response.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(target)]||'application/octet-stream');
    response.end(body);
  }catch(error){response.writeHead(404);response.end(error.message);}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try{
  // Native decompression and Blob I/O need real time. Virtual-time DOM dumping
  // can finish while an EPUB stream is still awaiting native completion.
  let child;
  const exited=new Promise(resolve=>{child=execFile(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,`http://127.0.0.1:${server.address().port}/${importerMode?'tests/importers.html':'options.html'}`],{windowsHide:true,timeout:30000,maxBuffer:4*1024*1024},resolve);});
  let timeout;
  try{await Promise.race([fixtureFinished,exited,new Promise(resolve=>{timeout=setTimeout(resolve,20000);})]);}
  finally{clearTimeout(timeout);child.kill();await exited;}
  assert.ok(result,'The browser did not finish the UI fixture.');
  for(const check of result.checks)console.log(`PASS browser: ${check}`);
  assert.equal(result.error,undefined,result.error);
  console.log(`\n${result.checks.length} browser checks passed.`);
}finally{
  await new Promise(done=>server.close(done));
  // Verify the generated absolute profile is inside the intended temporary root.
  const target=resolve(profile);const temporaryRoot=resolve(tmpdir());
  if(target.startsWith(temporaryRoot+sep)&&target.slice(temporaryRoot.length+1).startsWith('gl-browser-test-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
