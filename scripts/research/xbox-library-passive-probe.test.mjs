// Fully synthetic, offline. No Microsoft login, downloaded code or private input.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import './xbox-library-passive-probe.js';
const probe=globalThis.GLXboxOwnershipProbe;
const v=n=>{n=BigInt(n);const a=[];do{let b=Number(n&127n);n>>=7n;if(n)b|=128;a.push(b);}while(n);return a;};
const bytes=(...parts)=>Uint8Array.from(parts.flatMap(p=>[...p]));
const scalar=(n,x)=>bytes(v(n*8),v(x));
const msg=(n,x)=>bytes(v(n*8+2),v(x.length),x);
const str=s=>new TextEncoder().encode(s);
const entry=(field,key,value)=>msg(field,bytes(msg(1,str(key)),msg(2,value)));
const access=(direct,aggregate=direct)=>bytes(scalar(1,direct),scalar(2,aggregate));
const product=(kind,platforms,users)=>bytes(msg(1,bytes(scalar(1,platforms),scalar(2,kind))),
  ...Object.entries(users).map(([id,a])=>entry(2,id,access(...a))));
test('Owned, Game Pass and EA Play stay distinct; combined grants are retained',()=>{
  const data=bytes(entry(2,'never-played',product(2,6,{privateUser:[1]})),
    entry(2,'subscription',product(2,1,{privateUser:[128]})),
    entry(2,'both',product(2,7,{privateUser:[3]})));
  const s=probe.summarize(data), u=s.users[0];
  assert.equal(s.productEntries,3);assert.equal(u.flags.ownedFlag,2);
  assert.equal(u.flags.eaPlayConsole,1);assert.equal(u.flags.gamePassUltimate,1);
  assert.equal(u.consoleProducts,2);assert.equal(u.pcProducts,2);
  assert(!JSON.stringify(s).includes('privateUser'));assert(!JSON.stringify(s).includes('never-played'));
});
test('Account scopes, direct versus aggregate flags, DLC, bundles, disc and trial stay distinct',()=>{
  const data=bytes(entry(2,'base',product(2,2,{one:[8192,8193],two:[16384]})),
    entry(2,'dlc',product(0,2,{one:[1]})),entry(2,'edition',product(3,2,{one:[1]})));
  const [a,b]=probe.summarize(data).users;
  assert.equal(a.flags.ownedFlag,2);assert.equal(a.aggregateOwnedOnly,1);
  assert.equal(a.durableProducts,1);assert.equal(a.bundleProducts,1);
  assert.equal(a.flags.disc,1);assert.equal(b.flags.trial,1);assert.equal(b.flags.ownedFlag,undefined);
});
test('Revoked observations are separate and not silently subtracted from an independent active grant',()=>{
  const data=bytes(entry(2,'base',product(2,2,{one:[1]})),
    entry(4,'base',entry(1,'one',scalar(1,1))));
  const s=probe.summarize(data);assert.equal(s.users[0].revokedProducts,1);assert.equal(s.users[0].flags.ownedFlag,1);
});
test('Map repeats replace observations, unknown fields/flags do not invent ownership',()=>{
  const data=bytes(entry(2,'base',product(2,2,{one:[1]})),
    entry(2,'base',product(2,2,{one:[1<<30]})),scalar(80,123));
  const s=probe.summarize(data);assert.equal(s.productEntries,1);assert.deepEqual(s.users[0].flags,{});
});
test('Bounds, malformed protobuf and missing map data fail closed',()=>{
  for(const b of [Uint8Array.of(18,99),Uint8Array.of(0),Uint8Array.of(11),new Uint8Array(8*1024*1024+1),msg(2,new Uint8Array())])
    assert.throws(()=>probe.summarize(b));
  assert.equal(probe.summarize(new Uint8Array()).productEntries,0);
});
test('Passive hook forwards original arguments/promise, makes no requests itself, restores fetch, exports no credentials',async()=>{
  const oldFetch=globalThis.fetch,oldLocation=globalThis.location;
  let calls=0;const body=entry(2,'privateProduct',product(2,2,{privateAccount:[1]}));
  const response=new Response(body,{status:200});let passed;
  const pending=Promise.resolve(response);
  globalThis.location={origin:'https://play.xbox.com',href:'https://play.xbox.com/'};
  globalThis.fetch=(...args)=>{calls++;passed=args;return pending;};
  const underlying=globalThis.fetch;
  try {
    probe.install();assert.equal(calls,0);probe.install();
    const options={get headers(){throw Error('Must not inspect headers');},get body(){throw Error('Must not inspect body');}};
    const result=fetch('https://contentaccess.exp.xboxservices.com/all/v1?market=US&offering=private',options);
    assert.equal(result,pending);assert.equal(passed[1],options);assert.equal(await result,response);
    for(let n=0;n<30&&!probe.report()[0]?.summary;n++)await new Promise(r=>setTimeout(r,5));
    const report=probe.report();assert.equal(report[0].summary.users[0].flags.ownedFlag,1);
    assert(!JSON.stringify(report).includes('private'));
    probe.stop();assert.equal(globalThis.fetch,underlying);probe.clear();assert.deepEqual(probe.report(),[]);
    globalThis.location={origin:'https://unrelated.example'};assert.throws(()=>probe.install());
  } finally {probe.stop();globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});
