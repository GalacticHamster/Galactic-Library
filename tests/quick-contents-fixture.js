import {previewQuickContents,quickContentsToAppend,quickContentsNumbers} from '../src/lib/quick-contents.js';
const check=(value,message)=>{if(!value)throw Error(message);};
export const quickContentsExamples=[
 ['The Sandman #1-8',8],
 ['Uncanny X-Men #141-150, #152',11],
 ['The Sandman (1989) #1-8',8],
 ['Uncanny X-Men #210-219; X-Men Annual #10',11],
 ['Batman #21-25; Detective Comics #82-92',16],
 ['Collects The Sandman #1-8 and The Sandman Special #1',9]
];
export function checkQuickContentsExamples(){
  for(const [text,count]of quickContentsExamples){const parsed=previewQuickContents(text);check(parsed.entries.length===count,'Wrong quick-add count: '+text);check(!parsed.unparsed.length,'Supported quick-add text unresolved: '+text);check(parsed.entries.every(entry=>entry.completeness==='full'),'Full contents became excerpts: '+text);}
  const years=previewQuickContents(quickContentsExamples[2][0]);check(years.entries.every(e=>e.series==='The Sandman'&&e.run==='1989'&&e.unitType==='issue'),'Publication year not retained');
  const annual=previewQuickContents(quickContentsExamples[3][0]);check(annual.entries.at(-1).unitType==='annual'&&annual.entries.at(-1).series==='X-Men','Annual confused with regular issues');
  const special=previewQuickContents(quickContentsExamples[5][0]);check(special.entries.at(-1).unitType==='special','Special issue type lost');
  const mixed=previewQuickContents('Alpha #1-3; material from Beta #0, #1/2, Annual #1');check(mixed.entries.filter(e=>e.series==='Beta').every(e=>e.completeness==='excerpt'),'Partial material became complete');
  const overlap=previewQuickContents('Alpha #1-3, #2-4');check(overlap.entries.length===4,'Overlapping ranges duplicated');
  const existing=[overlap.entries[0],{...overlap.entries[1],number:'02'},{series:'Keep this correction',number:''}],before=JSON.stringify(existing),added=quickContentsToAppend(existing,overlap.entries);check(added.map(e=>e.number).join()==='3,4','Duplicate appends or invalid drafts replaced');check(JSON.stringify(existing)===before,'Existing draft mutated');
  check(quickContentsNumbers(previewQuickContents('Alpha #141-150, #152').entries.map(e=>e.number))==='#141–150, #152','Preview ranges misleading');
  const unsupported=previewQuickContents('Alpha #1-3; Digital Chapters 1-15; Beta #8-2');check(unsupported.entries.length===3&&unsupported.unparsed.some(t=>t.includes('Chapters'))&&unsupported.unparsed.some(t=>t.includes('8-2')),'Unsupported portions silently lost');
  check(!previewQuickContents('#1-8').entries.length,'Bare issues guessed a series');
  check(previewQuickContents('Alpha #1.Collects Beta #2').unparsed.some(t=>t.includes('Beta')),'Normalizer silently dropped user text');
  check(previewQuickContents('Alpha #1-2\nBeta #3-4').entries.length===4,'Multiline series list lost');
}
