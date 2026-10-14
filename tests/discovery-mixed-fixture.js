import {manifestReviewProposal,selectManifest,validateManifest} from '../src/lib/kindle-manifest.js';
import {contentKey,proposeContentsForReview} from '../src/lib/contents.js';
import {excerptBook} from './excerpt-extent-fixture.js';
import {coverageDatabase} from './inferred-coverage-fixture.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';

export const discoveryCounts=[7,8,10,3,4,16,11,1,8,2,7,7,16,13,5,12,8,7];
export function discoveryBook(c,index=0){
 const book=excerptBook(c,index),source=book.metadata.enrichment.kindleProductComicContents;
 source.manifest=validateManifest(source.manifest,c.title);return book;
}
export function checkDiscoveryCase(c,index,assert){
 const before=JSON.stringify(c),p=manifestReviewProposal(c.source,c.title),book=discoveryBook(c,index),db=coverageDatabase(book);
 const comic=p.entries.filter(e=>e.unitType!=='component');assert(comic.length===discoveryCounts[index],'Wrong issue count: '+c.title+' '+comic.length);
 assert(new Set(p.entries.map(contentKey)).size===p.entries.length,'Repeated issue became another copy: '+c.title);
 assert(JSON.stringify(collectionContents(book,db).entries)===JSON.stringify(p.entries),'Coverage interpretation differs: '+c.title);
 assert(JSON.stringify(manifestReviewProposal(c.source,c.title,c.source.statement.replace(/\s+/gu,' ')).entries)===JSON.stringify(p.entries),'Whitespace handoff differs: '+c.title);
 if(index===0){assert(p.entries.every(e=>e.unitType==='issue'&&e.completeness==='full'),'Oversized ordinal became a special');assert(p.entries.at(-1).number==='100','Lost ordinal');assert(p.unparsed.join(' ').includes('sketchbook'),'Named material lost');}
 if(index===1){assert(p.entries.every(e=>e.series==='Fables'&&Number(e.number)>=11&&Number(e.number)<=18),'Story part count became an issue');assert(p.manifestEvidence.startsWith('Collects 11-18'),'Weak selection still wins');}
 if(index===3)assert(p.entries.every(e=>e.run==='1987'),'Miniseries date lost');
 if(index===4)assert(p.entries.every(e=>e.series==='Loki'&&e.run==='2004'),'Explicit run lost');
 if(index===5){assert(p.entries.every(e=>e.completeness==='excerpt'),'Story completeness became full host coverage');assert(p.entries.filter(e=>e.number==='124').length===1,'Repeated #124');assert(p.unparsed.join(' ').includes('full-length tale'),'Complete story evidence lost');assert(p.supportingStatements.some(s=>s.includes('#124-129')),'Compatible same-sentence claim lost');}
 if(index===7)assert(p.entries[0].number==='150'&&p.entries[0].completeness==='full','Issue/volume equivalence lost');
 if(index===8)assert(p.entries.filter(e=>e.unitType==='annual').length===1,'Annual lost');
 if(index===9){assert(comic.every(e=>e.series==='ROBIN 3000'),'Mixed named work became an issue');assert(p.entries.filter(e=>e.unitType==='component').length===7&&p.entries.some(e=>e.number==='BATMAN: THE BLUE, THE GREY, AND THE BAT'),'Named publications or title commas discarded');}
 if(index===10)assert(p.entries.every(e=>e.series==='Teenage Mutant Ninja Turtles'),'Wrong postposed series');
 if(index===11)assert(p.entries.filter(e=>e.unitType==='issue').length===6&&p.entries.some(e=>e.unitType==='special'&&e.run==='publication 2015'&&e.number==='unnumbered'),'Ongoing series/FCBD lost');
 if(index===12){assert(p.entries.filter(e=>e.completeness==='full').length===10,'Doom Patrol subject extent lost');assert(p.entries.filter(e=>e.completeness==='excerpt').length===6,'Anthology host promoted');}
 if(index===13)assert(p.entries.filter(e=>e.unitType==='issue').length===12&&p.entries.some(e=>e.unitType==='annual'&&e.number==='2'),'Arc/annual scope lost');
 assert(JSON.stringify(c)===before,'Changed captured evidence');return {p,book,db};
}

export function checkDiscoverySafety(assert){
 const parse=(s,title='Alpha Vol. 1',context={})=>proposeContentsForReview(s,title,{allowTitleBinding:true,...context});
 const feature=parse('Collects stories starring A and B from issues #1-3 and the complete story from #4.');
 assert(feature.entries.length===4&&feature.entries.every(e=>e.completeness==='excerpt'),'Separate story host dropped/promoted');
 for(const text of ['Includes the 4-part story "An Adventure".','Following Alpha #150, an adventure begins.','Alpha #150 is here! Read the final volume too.','Beta #150 is here! Doubling as the final volume of the series.','First appearing in Alpha #1, the hero returns.'])assert(selectManifest([{selector:'#fixture',text}],'Alpha Vol. 2').manifest.candidates.every(c=>!c.entries),'Marketing became issue ownership');
 for(const text of ['Collects the complete eight-issue saga.','Collects the complete eight-issue Mystery saga.'])assert(!parse(text,'Unknown Omnibus').entries.length,'Unnamed saga invented a series');
 assert(!parse('Collects the 3-issue 2011 miniseries.','Alpha (1984)').entries.length,'Conflicting explicit miniseries year was overwritten');
 assert(!parse('Collects 11-18 of the classic series.').entries.length,'Bare volume-like numbers became issues without comic context');
 assert(parse('Collects 11-18 of the classic series.','Alpha Vol. 3',{extentDescription:'Includes single-issue tales.'}).entries.length===8,'Captured comic context did not support the bare range');
 for(const text of ['Collects material from Alpha: One, Beta: Two, Gamma #1-2.','Collects material from Alpha, issues #1-2 of the ongoing Beta series.'])assert(parse(text).entries.every(e=>e.completeness==='excerpt'),'Named prelude lost partial extent');
 const mixed=parse('Collects Alpha (1984) #0, #1/2; material from Beta (2011) #2; digital chapters 1-15.');assert(mixed.entries.length===3&&mixed.entries.filter(e=>e.completeness==='full').length===2,'Existing fraction/chapter/extent guards changed');
 const post=parse('Collects Alpha Universe #1-2 and issues #3-4 of the ongoing Alpha series.');assert(post.entries.filter(e=>e.series==='Alpha').length===2&&post.entries.filter(e=>e.series==='Alpha Universe').length===2,'Postposed host inherited previous series');
 const old=selectManifest([{selector:'#fixture',text:'Includes the story arcs "A" and "B". Collects Alpha #1-3. Contains Beta #4-6.'}],'Alpha Vol. 1');
 const weak=old.manifest.candidates.findIndex(c=>c.raw.startsWith('Includes'));old.statement=old.manifest.candidates[weak].raw;old.manifest.selected=weak;old.approved=false;old.matchBasis='source-evidence';
 assert(!manifestReviewProposal(old,'Alpha Vol. 1').entries.some(e=>e.unitType==='issue'),'Conflicting independent candidates silently unioned');
 const blocks=[{selector:'#one',text:'Includes story arcs.'},{selector:'#two',text:'Collects Beta #1-3.'}],two=selectManifest(blocks,'Alpha Vol. 1');two.manifest.selected=0;two.statement=two.manifest.candidates[0].raw;two.approved=false;two.matchBasis='source-evidence';assert(!manifestReviewProposal(two,'Alpha Vol. 1').entries.length,'Independent description sources crossed');
 assert(validateManifest(selectManifest([{selector:'#fixture',text:'Collects Alpha #1-3.'}]).manifest).candidates.length===1,'Manifest validation failed');
}
