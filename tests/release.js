import {requestReminderPermissions} from '../src/ui/reminders.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,utimes} from 'node:fs/promises';
import {join,dirname,resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRelease,projectRoot,readRuntimeZip,validateRuntime} from '../scripts/release.mjs';

export const releaseTests=[['release ZIP contains only the explicit runtime, validates dependencies and is deterministic across line endings and file times',async()=>{
  const first=await createRelease(),second=await createRelease();assert.deepEqual(first.zip,second.zip);assert.deepEqual(first.report,second.report);
  assert.equal(first.files.size,first.report.files.length);assert(first.files.has('src/ui/library-icon.png'));assert(![...first.files.keys()].some(path=>/^(?:tests|scripts|docs|dist)\//u.test(path)||path!=='src/ui/backup-restore.js'&&/backup|start\.txt|package\.json|README|recommendations/iu.test(path)));
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

releaseTests.push(['Firefox packages use stable IDs and module event pages with identical validated runtime',async()=>{const chrome=await createRelease(),first=await createRelease(undefined,undefined,'firefox'),second=await createRelease(undefined,undefined,'firefox');assert.deepEqual(first.zip,second.zip);assert.deepEqual([...first.files.keys()],[...chrome.files.keys()]);const manifest=JSON.parse(first.files.get('manifest.json'));assert.deepEqual(manifest.permissions,['storage','unlimitedStorage','scripting','alarms']);assert.deepEqual(manifest.optional_permissions,['notifications']);const chromeManifest=JSON.parse(chrome.files.get('manifest.json'));assert.deepEqual(chromeManifest.optional_permissions,['alarms','notifications']);assert(!chromeManifest.permissions.includes('alarms'));for(const [installed,expected]of [[chromeManifest,['alarms','notifications']],[manifest,['notifications']]]){const granted=await requestReminderPermissions({runtime:{getManifest:()=>installed},permissions:{request:async request=>{assert.deepEqual(request.permissions,expected);return false;}}});assert.equal(granted,false);}const invalid=new Map(first.files);invalid.set('manifest.json',Buffer.from(JSON.stringify({...manifest,optional_permissions:['alarms','notifications']})));assert.throws(()=>validateRuntime(invalid),/Firefox alarms/);assert.equal(manifest.background.service_worker,undefined);assert.deepEqual(manifest.background.scripts,['src/background/service-worker.js']);assert.equal(manifest.background.type,'module');assert.equal(manifest.browser_specific_settings.gecko.id,'galactic-library@galactichamster.com');for(const [name,bytes]of first.files)if(name!=='manifest.json')assert.deepEqual(bytes,chrome.files.get(name));const missing=new Map(first.files);missing.delete('src/background/service-worker.js');assert.throws(()=>validateRuntime(missing),/Missing manifest runtime dependency/);await assert.rejects(createRelease(undefined,undefined,'invalid'),/Unknown release target/);}]);
