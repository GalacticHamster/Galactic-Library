const MAX_METADATA=1024*1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
const safePath=name=>name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&!name.includes('\0');

/** Read only ZIP metadata entries. Images, chapters and other contents stay unread. */
export async function zipMetadataReader(file){
  if(!Number.isSafeInteger(file.size)||file.size>2**31)throw new Error('Choose an archive smaller than 2 GB, or extract its metadata XML.');
  const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());const view=new DataView(tail.buffer);
  let end=-1;for(let at=tail.length-22;at>=0;at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===tail.length){end=at;break;}
  if(end<0)throw new Error('Missing ZIP directory; extract ComicInfo.xml or the EPUB package metadata.');
  const entries=view.getUint16(end+10,true);const length=view.getUint32(end+12,true);const offset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==entries||entries>10000||length>2*MAX_METADATA||offset+length>file.size-tail.length+end)throw new Error('Unsupported ZIP directory, ZIP64 or multi-disk archive.');
  const directory=new DataView(await file.slice(offset,offset+length).arrayBuffer());const files=new Map();let at=0;
  for(let n=0;n<entries;n++){
    if(at+46>directory.byteLength||directory.getUint32(at,true)!==0x02014b50)throw new Error('Malformed ZIP directory.');
    const nameLength=directory.getUint16(at+28,true);const extra=directory.getUint16(at+30,true);const comment=directory.getUint16(at+32,true);const next=at+46+nameLength+extra+comment;
    if(next>directory.byteLength)throw new Error('Truncated ZIP entry.');
    const name=decoder.decode(new Uint8Array(directory.buffer,at+46,nameLength));
    if(!safePath(name)||files.has(name))throw new Error('Unsafe or duplicate archive path.');
    files.set(name,{flags:directory.getUint16(at+8,true),method:directory.getUint16(at+10,true),crc:directory.getUint32(at+16,true),compressed:directory.getUint32(at+20,true),size:directory.getUint32(at+24,true),offset:directory.getUint32(at+42,true)});at=next;
  }
  if(at!==directory.byteLength)throw new Error('Unexpected ZIP directory contents.');
  return async name=>{
    if(!safePath(name))throw new Error('Unsafe metadata path.');const entry=files.get(name);if(!entry)throw new Error(`Archive has no ${name}.`);
    if(entry.flags&1||![0,8].includes(entry.method)||entry.size>MAX_METADATA||entry.compressed>MAX_METADATA)throw new Error('Encrypted, oversized or unsupported metadata entry. Extract its XML first.');
    const header=new DataView(await file.slice(entry.offset,entry.offset+30).arrayBuffer());
    if(header.byteLength!==30||header.getUint32(0,true)!==0x04034b50||header.getUint16(6,true)!==entry.flags||header.getUint16(8,true)!==entry.method)throw new Error('Inconsistent ZIP metadata header.');
    const nameLength=header.getUint16(26,true);const extraLength=header.getUint16(28,true);const start=entry.offset+30+nameLength+extraLength;
    if(start+entry.compressed>offset||decoder.decode(new Uint8Array(await file.slice(entry.offset+30,entry.offset+30+nameLength).arrayBuffer()))!==name)throw new Error('Invalid ZIP metadata extent.');
    let bytes=new Uint8Array(await file.slice(start,start+entry.compressed).arrayBuffer());
    if(entry.method===8){
      let inflater;try{inflater=new DecompressionStream('deflate-raw');}catch{throw new Error('This browser cannot inflate EPUB metadata. Extract the OPF file and import it directly.');}
      const reader=new Blob([bytes]).stream().pipeThrough(inflater).getReader();const chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_METADATA||size>entry.size)throw new Error('Metadata expansion exceeds its declared limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
      bytes=new Uint8Array(size);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
    }
    if(bytes.length!==entry.size)throw new Error('Truncated metadata entry.');
    let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if(((crc^0xffffffff)>>>0)!==entry.crc)throw new Error('Metadata checksum failed.');
    return decoder.decode(bytes);
  };
}
