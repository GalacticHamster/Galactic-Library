/* Research only. Paste this file into DevTools on play.xbox.com, then call
 * GLXboxOwnershipProbe.install(). Navigate using the site's Library controls.
 * GLXboxOwnershipProbe.report() returns aggregate counts; stop() removes hook.
 * No requests, credentials, persistent writes, titles or account IDs exported.
 * Wire field numbers/flags inspected in the public 2026-10-15 Xbox web client;
 * this is a deliberately partial decoder, NOT a license/ownership importer.
 */
(() => {
  const LIMIT = 8 * 1024 * 1024;
  const CAS = 'https://contentaccess.exp.xboxservices.com/all/v1';
  const names = {1:'ownedFlag',2:'gamePassUltimate',4:'gamePassCore',8:'gamePassPC',
    16:'gamePassStandard',32:'gamePassConsole',64:'gamesWithGold',128:'eaPlayConsole',
    256:'ubisoftPlus',512:'gtaPlus',8192:'disc',16384:'trial'};
  function summarize(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > LIMIT) throw Error('Unsupported response size');
    let budget = 200000;
    function fields(data) {
      const out = []; let pos = 0;
      function integer() {
        let value = 0n;
        for (let i=0;i<10;i++) {
          if (pos >= data.length) throw Error('Truncated protobuf');
          const b=data[pos++]; value |= BigInt(b & 127) << BigInt(i*7);
          if (!(b & 128)) { if (i===9 && b>1) throw Error('Oversized varint'); return value; }
        }
        throw Error('Oversized varint');
      }
      while (pos < data.length) {
        if (--budget < 0) throw Error('Field limit');
        const tag=integer(), number=Number(tag >> 3n), wire=Number(tag & 7n);
        if (number < 1 || number > 536870911) throw Error('Invalid field');
        let value;
        if (wire===0) value=integer();
        else if (wire===2) {
          const size=Number(integer());
          if (!Number.isSafeInteger(size) || size<0 || size>data.length-pos) throw Error('Truncated field');
          value=data.subarray(pos,pos+size); pos+=size;
        } else if (wire===1 || wire===5) {
          pos+=wire===1?8:4; if (pos>data.length) throw Error('Truncated fixed field');
        } else throw Error('Unsupported wire type');
        out.push({number,wire,value});
      }
      return out;
    }
    const messages=(data,n)=>fields(data).filter(f=>f.number===n && f.wire===2).map(f=>f.value);
    const scalar=(data,n)=>{const f=fields(data).findLast(f=>f.number===n && f.wire===0);return f?Number(f.value):0;};
    const text=new TextDecoder('utf-8',{fatal:true});
    function map(data,n) {
      const result=new Map();
      for (const entry of messages(data,n)) {
        const keys=messages(entry,1), values=messages(entry,2);
        if (!keys.length || !values.length) throw Error('Missing map key/value');
        result.set(text.decode(keys.at(-1)),values.at(-1));
      }
      return result;
    }
    const users=new Map();
    function user(id) {
      if (!users.has(id)) users.set(id,{userSlot:users.size+1,products:0,gameProducts:0,
        durableProducts:0,bundleProducts:0,pcProducts:0,consoleProducts:0,
        aggregateOwnedOnly:0,revokedProducts:0,flags:{}});
      return users.get(id);
    }
    const products=map(bytes,2), revoked=map(bytes,4);
    for (const product of products.values()) {
      const metadata=messages(product,1).at(-1) ?? new Uint8Array();
      const platforms=scalar(metadata,1), kind=scalar(metadata,2);
      for (const [id,access] of map(product,2)) {
        const u=user(id), direct=scalar(access,1), aggregate=scalar(access,2);
        u.products++; if (kind===2) u.gameProducts++; if (kind===0) u.durableProducts++;
        if (kind===3) u.bundleProducts++; if (platforms&1) u.pcProducts++;
        if (platforms&6) u.consoleProducts++;
        if (!(direct&1) && (aggregate&1)) u.aggregateOwnedOnly++;
        for (const [bit,name] of Object.entries(names)) if (direct&Number(bit)) u.flags[name]=(u.flags[name]??0)+1;
      }
    }
    for (const product of revoked.values()) for (const id of map(product,1).keys()) user(id).revokedProducts++;
    return {bytes:bytes.length,productEntries:products.size,revokedEntries:revoked.size,
      users:[...users.values()],interpretation:'Raw first-party flags, not verified permanent purchases; no completeness claim'};
  }
  let original, wrapper, installed=false;
  const records=[];
  async function inspect(response,record) {
    let reader;
    try {
      if (!response.ok) return;
      reader=response.clone().body.getReader(); let total=0; const chunks=[];
      while (true) {
        const {done,value}=await reader.read(); if (done) break;
        total+=value.byteLength; if (total>LIMIT) { void reader.cancel().catch(()=>{}); throw Error('Response exceeds bound'); }
        chunks.push(value);
      }
      const bytes=new Uint8Array(total); let offset=0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      record.summary=summarize(bytes);
    } catch {record.decode='Unavailable: unsupported or unreadable bounded response';}
    finally {reader?.releaseLock();}
  }
  function install() {
    if (globalThis.location?.origin!=='https://play.xbox.com') throw Error('Run only on play.xbox.com');
    if (installed) return;
    original=globalThis.fetch;
    wrapper=function(...args) {
      // Do not read headers, request bodies, cookies, tokens or URL query values.
      let relevant=false;
      try {
        const input=args[0];
        const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
        relevant=url.origin+url.pathname===CAS && String(args[1]?.method??args[0]?.method??'GET').toUpperCase()==='GET';
      } catch { /* Leave unrelated requests completely alone. */ }
      const pending=original.apply(this,args);
      if (relevant) void pending.then(response=>{
        const record={endpoint:CAS,status:response.status};
        records.push(record); if (records.length>20) records.shift();
        void inspect(response,record);
      },()=>{records.push({endpoint:CAS,status:'request failed'});if(records.length>20)records.shift();});
      return pending;
    };
    globalThis.fetch=wrapper; installed=true;
  }
  function stop() {
    if (installed && globalThis.fetch===wrapper) globalThis.fetch=original;
    installed=false;
  }
  globalThis.GLXboxOwnershipProbe=Object.freeze({summarize,install,stop,
    report:()=>JSON.parse(JSON.stringify(records)),clear:()=>{records.length=0;}});
})();
