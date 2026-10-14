import {proposeContentsForReview,proposeContents,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';

// Synthetic source shapes from numbered-clause failures. No library metadata.
const cases=[];
const add=(name,check)=>cases.push([name,check]);
const parse=s=>proposeContentsForReview(s,'Collection');
const equal=(a,b,message)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message+': '+JSON.stringify(a));};
const assert=(value,message)=>{if(!value)throw Error(message);};
const nums=(a,b)=>Array.from({length:b-a+1},(_,n)=>String(a+n));
add('parser 12 retains bounded numbered precision with contextual excerpt inference',()=>equal(CONTENTS_PARSER_VERSION,12,'Parser version'));
for(const title of ['Batman and Robin','Sword and Sorcery','Cloak and Dagger']){
 add('conjunction stays inside numbered title: '+title,()=>{
  for(const label of [title,title.toLowerCase()])for(const s of [`Collects ${label} #1-3`,`Collects issues #1-3 of ${label}, part of the event`]){
   const p=parse(s);equal([...new Set(p.entries.map(e=>e.series))],[label],'Title split');equal(p.entries.map(e=>e.number),nums(1,3),'Numbers');
   if(s.includes('part of')){equal(p.outcome,'partial','Tail completeness');assert(p.unparsed.join(' ').includes('part of the event'),'Lost tail');}
  }
 });
}
add('postposed title comma stays within the title',()=>{
 const p=parse('Collects issues #1-2 of Explorer, Agent of S.P.A.C.E., part of the event');
 equal([...new Set(p.entries.map(e=>e.series))],['Explorer, Agent of S.P.A.C.E.'],'Title comma');equal(p.outcome,'partial','Tail');
});
for(const title of ['Guidebook','Bookkeeper','Volumescope','Issueproof','Chapterhouse','Partnership','Specialist','Annualized','Guidepost']){
 add('unit substring is literal title text: '+title,()=>{
  const p=parse(`Collects Explorer ${title} #1`);equal(p.entries.map(e=>[e.series,e.unitType,e.number]),[[`Explorer ${title}`,'issue','1']],'Unit substring');
 });
}
for(const title of ['She-Wolf','He-Man','Books of Lore','More Fun Tales']){
 add('whole numbered title survives former prose guard: '+title,()=>equal(parse(`Collects ${title} (2000) #1-2`).entries.map(e=>[e.series,e.run,e.number]),[[title,'2000','1'],[title,'2000','2']],'Overbroad guard'));
}
add('bounded adventure prefix and multiple series',()=>{
 const p=parse('Collects adventures from Explorer #1-2, Sword and Sorcery #3 and Cloak and Dagger #4');
 equal(p.entries.map(e=>[e.series,e.number]),[['Explorer','1'],['Explorer','2'],['Sword and Sorcery','3'],['Cloak and Dagger','4']],'Prefix');equal(p.outcome,'full','Consumed wrapper');
});
add('later explicit collection survives an unresolved prelude',()=>{
 const p=parse('Includes stories never reprinted before and collects Explorer 24, 27, Other #1');
 equal(p.entries.map(e=>[e.series,e.number]),[['Explorer','24'],['Explorer','27'],['Other','1']],'Later collection');equal(p.outcome,'partial','Prelude unresolved');assert(p.unparsed.join(' ').includes('stories never reprinted'),'Lost prelude');
});
for(const tail of ['written by Jane Doe','with bonus material including sketches','of Jane’s acclaimed Explorer run','from Jane Doe and John Smith, comics creators of the series','. "And I saw everything." A famous tale']){
 add('bounded tail retained: '+tail,()=>{
  const p=parse(`Collects Explorer #1-3 ${tail}`);equal(p.entries.map(e=>e.number),nums(1,3),'Range lost');equal(p.outcome,'partial','Unresolved tail');assert(p.unparsed.length>0,'Discarded tail');
 });
}
add('sentence tail after a numeric continuation stays unresolved',()=>{
 const p=parse('Collects Explorer #219, #226-233. "And I saw everything." A famous tale');equal(p.entries.map(e=>e.number),['219',...nums(226,233)],'Continuation lost');equal(p.outcome,'partial','Tail');
});
for(const [range,expected] of [['645-50',nums(645,650)],['98-102',nums(98,102)],['9-12',nums(9,12)],['100-05',nums(100,105)],['645-650',nums(645,650)]]){
 add('bounded range '+range,()=>equal(parse('Collects Explorer #'+range).entries.map(e=>e.number),expected,'Range'));
}
for(const range of ['99-01','199-02','645-5','645-45','1-501','1/2-3','999999-00']){
 add('ambiguous or oversized range unresolved: '+range,()=>{const p=parse('Collects Explorer #'+range);equal(p.entries,[],'Guessed range');assert(p.unparsed.length>0,'Lost range');});
}
add('annual special volume and excerpt controls retain typed scope',()=>{
 const p=parse('Collects Explorer #1, Explorer Annual #2, Explorer Special #3, Other books 1-2, material from More Fun Tales #4');
 equal(p.entries.map(e=>[e.series,e.unitType,e.number,e.completeness]),[['Explorer','issue','1','full'],['Explorer','annual','2','full'],['Explorer','special','3','full'],['Other','volume','1','full'],['Other','volume','2','full'],['More Fun Tales','issue','4','excerpt']],'Typed scope');
});
add('excerpt conjunction and credit tail never establish full-unit scope',()=>{
 const p=parse('Collects stories from Sword and Sorcery #1-2 written by Jane Doe');assert(p.entries.length===2&&p.entries.every(e=>e.completeness==='excerpt'),'Lost excerpt');equal(p.outcome,'partial','Credits unresolved');
});
add('explicit adventures wrapper now recovers units while retaining its source prose',()=>{
 const p=parse('Collects the early adventures of heroes from Explorer #1-3');equal(p.entries.map(e=>e.number),nums(1,3),'Bounded wrapper');equal(p.unparsed,['the early adventures of heroes from'],'Wrapper evidence');equal(p.outcome,'partial','Source prose retained');
});
for(const source of ['Collects scripts from Explorer #1-3','Includes recommendations for Explorer #1-3','Collects Explorer #1-3 from pages 4-5','Collects Explorer #1-3 from pages selected by the creators','Collects Explorer #1-3 of an unknown book','Collects Explorer #1-3 There are two sides to every story','Collects Explorer #1-3abc','Collects Explorer #1Written by Jane Doe','Collects Explorer #1-3.5','Collects Explorer #1-3–5','Collects more than Explorer #1-3']){
 add('unsafe prose or number attachment remains unresolved: '+source,()=>equal(parse(source).entries,[],'Unsafe numbered clause'));
}
add('bare numbering never finds a unit substring inside a title',()=>equal(parse('Collects Explorerbook 1').entries.map(e=>[e.series,e.unitType,e.number]),[['Explorerbook','issue','1']],'Bare unit boundary'));
add('literal Adventures of title and descriptive postposed tail remain separate',()=>{
 equal(parse('Collects Adventures of Explorer #1-2').entries.map(e=>e.series),['Adventures of Explorer','Adventures of Explorer'],'Literal title');
 const p=parse('Collects issues #1-2 of EXPLORER and features an introduction');equal(p.entries.map(e=>e.series),['EXPLORER','EXPLORER'],'Swallowed tail');equal(p.outcome,'partial','Lost apparatus');
 const q=parse('Collects issues #1-2 of EXPLORER, the new ongoing series');equal([...new Set(q.entries.map(e=>e.series))],['EXPLORER'],'Prose label');equal(q.outcome,'partial','Lost commentary');
});
add('bounded supplement never becomes a named work or Full source',()=>{
 const p=parse('Collects Explorer #1-3 with bonus material including "Sketchbook"');assert(p.entries.every(e=>e.unitType==='issue'),'Invented work');equal(p.outcome,'partial','Apparatus completeness');
});
add('ordinary proposal numeric semantics remain independent',()=>{
 equal(proposeContents('Collects Explorer #645-50').entries,[],'Ordinary range changed');equal(proposeContents('Collects Explorer #645-650').entries.map(e=>e.number),nums(645,650),'Ordinary numeric identity');
});

export const numberedPrecisionCases=cases;
export function checkNumberedPrecision(){for(const [name,check] of cases){try{check();}catch(error){throw Error(name+': '+error.message);}}return cases.length;}
