import {requestReminderPermissions} from '../src/ui/reminders.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,utimes} from 'node:fs/promises';
import {join,dirname,resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRelease,projectRoot,readRuntimeZip,validateRuntime} from '../scripts/release.mjs';

export const releaseTests=[['release ZIP contains only the explicit runtime, validates dependencies and is deterministic across line endings and file times',async()=>{
  const first=await createRelease(),second=await createRelease();assert.deepEqual(first.zip,second.zip);assert.deepEqual(first.report,second.report);
  assert.equal(first.files.size,first.report.files.length);assert(first.files.has('src/ui/library-icon.png'));
  const logos=[...first.files].filter(([path])=>path.startsWith('icons/provider-icons/'));
  assert.equal(logos.length,15,'Every provider and both Epic variants must be bundled');
  for(const [path,bytes]of logos){assert.match(path,/-64\.png$/u);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),64);assert.equal(bytes.readUInt32BE(20),64);}
  const backupRuntime=new Set(['src/ui/backup-restore.js','src/ui/backup-export.js']);
  assert([...backupRuntime].every(path=>first.files.has(path)));
  assert(![...first.files.keys()].some(path=>/^(?:tests|scripts|docs|dist)\//u.test(path)||!backupRuntime.has(path)&&/backup|start\.txt|package\.json|README|recommendations/iu.test(path)));
  const root=await mkdtemp(join(tmpdir(),'gl-release-test-'));
  try{
    for(const [path,bytes]of first.files){const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,['.js','.css','.json','.html'].includes(extname(path))?bytes.toString().replaceAll('\n','\r\n'):bytes);await utimes(target,new Date('2001-01-01'),new Date('2026-10-01'));}
    await writeFile(join(root,'package.json'),JSON.stringify({type:'module'}));
    await writeFile(join(root,'galactic-library-backup-v1.json'),'SYNTHETIC PRIVATE EXPORT');await writeFile(join(root,'start.txt'),'SYNTHETIC PRIVATE NOTE');
    const differentCheckout=await createRelease(root,[...first.files.keys()]);assert.deepEqual(differentCheckout.zip,first.zip);assert(!differentCheckout.zip.includes(Buffer.from('SYNTHETIC PRIVATE')));
    await assert.rejects(createRelease(root,[...first.files.keys(),'../private.js']),/allowlist/);await assert.rejects(createRelease(root,[...first.files.keys(),'start.txt']),/allowlist/);await assert.rejects(createRelease(root,[...first.files.keys(),'options.html']),/allowlist/);
    await assert.rejects(createRelease(root,[...first.files.keys()].filter(path=>path!=='src/lib/reading.js')),/Missing runtime dependency/);await assert.rejects(createRelease(root,[...first.files.keys()].filter(path=>path!=='src/providers/humble-content.js')),/Missing manifest runtime dependency/);
    const files=new Map(first.files);files.delete('src/ui/library-icon.png');assert.throws(()=>validateRuntime(files),/Missing runtime dependency/);
    const tampered=Buffer.from(first.zip);tampered[50]^=1;assert.throws(()=>readRuntimeZip(tampered),/ZIP/);
    for(const path of first.files.keys())if(path.endsWith('.js'))execFileSync(process.execPath,['--check',join(root,path)],{windowsHide:true,stdio:'pipe'});
  }finally{
    const target=resolve(root),base=resolve(tmpdir());if(!target.startsWith(base+sep)||!target.slice(base.length+1).startsWith('gl-release-test-'))throw new Error('Unsafe release test cleanup.');await rm(target,{recursive:true,force:true});
  }
}],['release builder rejects allowlisted files reached through a directory junction outside the project',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gl-release-test-')),outside=await mkdtemp(join(tmpdir(),'gl-release-test-'));
  try{
    await mkdir(join(root,'src'));await writeFile(join(outside,'private.js'),'SYNTHETIC OUTSIDE DATA');await symlink(outside,join(root,'src','external'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(createRelease(root,['src/external/private.js']),/leaves project/);
  }finally{
    for(const directory of [root,outside]){const target=resolve(directory),base=resolve(tmpdir());if(!target.startsWith(base+sep)||!target.slice(base.length+1).startsWith('gl-release-test-'))throw new Error('Unsafe release test cleanup.');await rm(target,{recursive:true,force:true});}
  }
}]];

releaseTests.push(['extension and toolbar icons are genuine size-matched local artwork in both artifacts',async()=>{
 for(const target of ['chrome','firefox']){
  const release=await createRelease(undefined,undefined,target),manifest=JSON.parse(release.files.get('manifest.json'));
  for(const group of [manifest.icons,manifest.action.default_icon]){assert.deepEqual(Object.keys(group),['16','32','48','128']);for(const [size,path]of Object.entries(group)){assert.equal(path,`icons/icon${size}.png`);const bytes=release.files.get(path);assert.equal(bytes.readUInt32BE(16),Number(size));assert.equal(bytes.readUInt32BE(20),Number(size));}}
  const broken=new Map(release.files);broken.set('icons/icon32.png',Buffer.from('not an icon'));assert.throws(()=>validateRuntime(broken),/Invalid manifest icon/);
  const mismatched=new Map(release.files);mismatched.set('icons/icon32.png',release.files.get('icons/icon48.png'));assert.throws(()=>validateRuntime(mismatched),/Invalid manifest icon/);
  const missing=new Map(release.files);missing.delete('icons/icon16.png');assert.throws(()=>validateRuntime(missing),/Missing manifest runtime/);
  assert(!release.files.has('icons/icon256.png')&&!release.files.has('icons/icon512-source-extract.png'));
 }
}]);

releaseTests.push(['Firefox packages use stable IDs and module event pages with identical validated runtime',async()=>{const chrome=await createRelease(),first=await createRelease(undefined,undefined,'firefox'),second=await createRelease(undefined,undefined,'firefox');assert.deepEqual(first.zip,second.zip);assert.deepEqual([...first.files.keys()],[...chrome.files.keys()]);const manifest=JSON.parse(first.files.get('manifest.json'));assert.deepEqual(manifest.permissions,['storage','unlimitedStorage','scripting','alarms']);assert.deepEqual(manifest.optional_permissions,['notifications']);const chromeManifest=JSON.parse(chrome.files.get('manifest.json'));assert.deepEqual(chromeManifest.optional_permissions,['notifications']);assert(chromeManifest.permissions.includes('alarms'));for(const [installed,expected]of [[chromeManifest,['notifications']],[manifest,['notifications']]]){const granted=await requestReminderPermissions({runtime:{getManifest:()=>installed},permissions:{request:async request=>{assert.deepEqual(request.permissions,expected);return false;}}});assert.equal(granted,false);}const invalid=new Map(first.files);invalid.set('manifest.json',Buffer.from(JSON.stringify({...manifest,optional_permissions:['alarms','notifications']})));assert.throws(()=>validateRuntime(invalid),/Firefox alarms/);assert.equal(manifest.background.service_worker,undefined);assert.deepEqual(manifest.background.scripts,['src/background/service-worker.js']);assert.equal(manifest.background.type,'module');assert.equal(manifest.browser_specific_settings.gecko.id,'galactic-library@galactichamster.com');for(const [name,bytes]of first.files)if(name!=='manifest.json')assert.deepEqual(bytes,chrome.files.get(name));const missing=new Map(first.files);missing.delete('src/background/service-worker.js');assert.throws(()=>validateRuntime(missing),/Missing manifest runtime dependency/);await assert.rejects(createRelease(undefined,undefined,'invalid'),/Unknown release target/);}]);

releaseTests.push(['both packaged extension pages explicitly reuse the approved 16px manifest favicon',async()=>{
 for(const target of ['chrome','firefox']){
  const release=await createRelease(undefined,undefined,target),files=readRuntimeZip(release.zip),manifest=JSON.parse(files.get('manifest.json'));
  for(const page of [manifest.options_page,manifest.action.default_popup]){
   const links=[...files.get(page).toString().matchAll(/<link\b[^>]*rel="icon"[^>]*>/gu)];assert.equal(links.length,1);
   const link=links[0][0],href=link.match(/href="([^"]+)"/u)[1],asset=new URL(href,'https://package.invalid/'+page).pathname.slice(1);
   assert.equal(asset,manifest.icons['16']);assert(link.includes('image/png')&&link.includes('16x16'));assert(files.has(asset));
   const bytes=files.get(asset);assert.equal(bytes.readUInt32BE(16),16);assert.equal(bytes.readUInt32BE(20),16);
  }
 }
}]);
