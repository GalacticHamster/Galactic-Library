import assert from 'node:assert/strict';
import fs from 'node:fs';
export const bundleMatchContextTests=[];
const test=(name,run)=>bundleMatchContextTests.push([name,run]);
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../shared/bundle-match-context.js',import.meta.url),'utf8');
const c={};vm.createContext(c);vm.runInContext(source,c);
const reconcile=c.BundleMatchContext.reconcile;
const candidate=(id,strength='weak',extra={})=>({id,libraryKey:'provider-record',strength,basis:'Related title or edition; compare titles.',...extra});
const offer=(id,candidates,extra={})=>({id,productKey:id,titleKey:id,title:id,media:'book',settled:true,candidates,...extra});
test('engine projects immutable candidates and respects all explicit overlap/manual protection',()=>{
 const offers=[offer('original',[candidate('exact','strong')]),offer('sequel',[candidate('related')])];
 const before=JSON.stringify(offers);const result=reconcile({complete:true,offers});assert.equal(result.results.get('sequel').deferred.length,1);assert.equal(JSON.stringify(offers),before);
 for(const basis of ['Reviewed same-work relationship.','Shared work identity; edition ownership is not established.','Contains collected issues.','Software component relationship.','Unknown']){const rows=[offers[0],offer('sequel',[candidate('related','weak',{basis})])];assert.equal(reconcile({complete:true,offers:rows}).results.get('sequel').deferred.length,0);}
 for(const extra of [{protected:true},{settled:false},{media:'audiobook'},{productKey:'original'},{titleKey:'original'}])assert.equal(reconcile({complete:true,offers:[offers[0],{...offers[1],...extra}]}).results.get('sequel').deferred.length,0);
 assert.equal(reconcile({complete:false,offers}).results.get('sequel').deferred.length,0);
});
test('no exclusive assignment: multiple strong identities coexist; reorder is deterministic and repeats are idempotent',()=>{
 const offers=[offer('original',[candidate('exact','strong')]),offer('duplicate',[candidate('also-exact','strong')]),offer('sequel',[candidate('related')])];
 const collect=rows=>Object.fromEntries([...reconcile({complete:true,offers:rows}).results].sort(([a],[b])=>a.localeCompare(b)).map(([id,v])=>[id,JSON.stringify(v)]));
 assert.deepEqual(collect(offers),collect([...offers].reverse()));assert.deepEqual(collect(offers),collect(offers));assert.equal(reconcile({complete:true,offers}).results.get('sequel').deferred[0].competingTitles.length,2);
});
test('known identities only, never titles/account inference; missing and protected candidate facts remain primary',()=>{
 const original=offer('original',[candidate('exact','strong')]);
 for(const extra of [{libraryKey:null},{libraryKey:'other-account'},{protected:true},{strength:'strong'}])assert.equal(reconcile({complete:true,offers:[original,offer('sequel',[candidate('related','weak',extra)])]}).results.get('sequel').deferred.length,0);
});
test('all identity/ownership states are outside the engine contract',()=>{const original=offer('original',[candidate('exact','strong')]);for(const ownership of ['owned','subscription','borrowed','unknown'])assert.equal(reconcile({complete:true,offers:[{...original,ownership},offer('sequel',[candidate('related')])]}).results.get('sequel').deferred.length,1);});

test('large candidate lists retain stable relevance order without removing independent claims',()=>{
 const candidates=Array.from({length:10000},(_,i)=>candidate(String(i),'weak',{relevance:i%2?'contents':'related'}));
 const before=JSON.stringify(candidates),r=reconcile({complete:true,offers:[offer('only',candidates)]}).results.get('only');
 assert.equal(r.primary.length,10000);assert.equal(r.deferred.length,0);
 assert.deepEqual(Array.from(r.primary.slice(0,3)),['1','3','5']);assert.equal(r.primary[5000],'0');assert.equal(JSON.stringify(candidates),before);
});
