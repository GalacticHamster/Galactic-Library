import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposeContentsForReview,proposeContents,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {manifestReviewProposal,selectManifest,validateManifest} from '../src/lib/kindle-manifest.js';
import {contentsParseState} from '../src/lib/kindle-contents.js';
import {validateEnrichment} from '../src/lib/metadata-validation.js';
import {oldParser} from '../scripts/contents-parser-corpus.mjs';
const fixtures=JSON.parse(await readFile(new URL('./fixtures/kindle/contents-parser-v4-corpus.json',import.meta.url),'utf8'));
const byId=id=>fixtures.find(r=>r.auditId===id);
const parse=id=>{const f=byId(id);return proposeContentsForReview(f.statement,f.title,f.context);};
const range=(p,series,type='issue')=>p.entries.filter(e=>e.series===series&&e.unitType===type).map(e=>e.number);
const numbers=(start,end)=>Array.from({length:end-start+1},(_,n)=>String(n+start));
export const contentsParserV4Tests=[
 ...fixtures.filter(f=>![32,284,442,1437].includes(f.auditId)).map(f=>[`parser 4 saved-corpus regression ${f.auditId}: ${f.title}`,()=>{
   const p=proposeContentsForReview(f.statement,f.title,f.context);
   assert.equal(p.outcome,f.outcome);assert.deepEqual(p.entries,f.entries);assert.deepEqual(p.unparsed,f.unparsed);
 }]),
 ['bounded wrapper recovery preserves historical source and unnumbered siblings',()=>{
   const bat=parse(284);assert.deepEqual(range(bat,'Batman/Catwoman'),numbers(1,12));assert.equal(bat.entries.length,15);assert.ok(bat.unparsed.some(t=>t.includes('Batman/Catwoman Special')));
   const dead=parse(442);assert.deepEqual(range(dead,'Dead Boy Detectives'),numbers(1,12));assert.equal(dead.entries.length,15);
   assert.ok(dead.entries.filter(e=>['Witching Hour','Ghosts','Time Warp'].includes(e.series)).every(e=>e.completeness==='excerpt'));
 }],
 ['parser 5 recovers bounded dash clause and lexical Book labels in prior regressions',()=>{
   const aliens=parse(32);assert.deepEqual(range(aliens,'Aliens, Space Marines'),numbers(1,12));
   assert.deepEqual(aliens.entries.filter(e=>e.series!=='Aliens, Space Marines'),byId(32).entries);
   assert.equal(aliens.outcome,'partial');assert.deepEqual(aliens.unparsed,['—','Fifth Anniversary Special']);
   const venom=parse(1437);assert.equal(venom.outcome,'full');assert.deepEqual(venom.unparsed,[]);
   assert.deepEqual(venom.entries.filter(e=>!e.series.startsWith('Free Comic Book Day')),byId(1437).entries);
   assert.deepEqual(venom.entries.filter(e=>e.series.startsWith('Free Comic Book Day')).map(e=>[e.series,e.unitType,e.number,e.completeness]),[['Free Comic Book Day 2019 (Spider-Man/Venom)','issue','1','excerpt'],['Free Comic Book Day 2020 (Spider-Man/Venom)','issue','1','excerpt']]);
 }],
 ['run qualifiers preserve series, explicit run and issue identity independently',()=>{
   const a=parse(240);assert.deepEqual(range(a,'Batman'),numbers(491,500));assert.deepEqual(range(a,'Detective Comics'),numbers(659,666));
   assert.ok(a.entries.filter(e=>e.series==='Batman').every(e=>e.run==='volume 1'&&e.unitType==='issue'));
   assert.ok(a.entries.filter(e=>e.series==="Showcase '93").every(e=>e.completeness==='excerpt'));assert.ok(a.unparsed.join(' ').includes('Vengeance of Bane'));assert.equal(a.outcome,'partial');
   const b=parse(241);assert.equal(b.entries.length,27);assert.equal(b.outcome,'full');assert.deepEqual(range(b,'Batman: Shadow of the Bat'),['19','20',...numbers(24,28)]);
   assert.equal(parse(259).entries.length,11);assert.ok(parse(1474).entries.some(e=>e.series==='Wonder Woman'&&e.run==='volume 1'&&e.number==='5'&&e.completeness==='excerpt'));
 }],
 ['bare ranges require bounded series context; conflicts and generic titles stay unresolved',()=>{
   const p=parse(478);assert.deepEqual(range(p,'Earth 2'),numbers(1,6));assert.ok(p.entries.every(e=>e.run==='2012-2015'));assert.equal(p.parseBinding,'explicit-product-series-volume-title');
   assert.equal(proposeContentsForReview('Collects #1-6','A collection',{allowTitleBinding:true}).entries.length,0);
   assert.equal(proposeContentsForReview('Collects #1-6','Earth 2 Vol. 1').entries.length,0);
   assert.equal(proposeContentsForReview('Collects #1-6','Anything',{series:['Earth 2']}).entries.length,6);
   for(const series of [['Other Series'],['Earth 2','Other Series'],['Earth 2 (2020)']])assert.equal(proposeContentsForReview('Collects #1-6','Earth 2 (2012) Vol. 1',{allowTitleBinding:true,series}).entries.length,0);
   assert.equal(proposeContentsForReview('Collects issues #1-6 of OTHER SERIES','Earth 2 Vol. 1',{allowTitleBinding:true}).entries[0].series,'OTHER SERIES');
   const swamp=parse(1195);assert.deepEqual(range(swamp,'Swamp Thing'),['0',...numbers(8,11)]);assert.deepEqual(range(swamp,'Swamp Thing','annual'),['1']);
   const mixed=proposeContentsForReview('Collects #1-3, Infinite Frontier #1','Batman Vol. 2',{allowTitleBinding:true});assert.deepEqual(range(mixed,'Batman'),numbers(1,3));assert.deepEqual(range(mixed,'Infinite Frontier'),['1']);
 }],
 ['mixed supplement never fabricates a numbered series, including a first comma label',()=>{
   const p=proposeContentsForReview('Collects issues #21-29, Ex Machina: Inside the Machine, and Ex Machina Special #3','Ex Machina: Book Three',{allowTitleBinding:true});
   assert.equal(p.entries.length,10);assert.deepEqual(range(p,'Ex Machina'),numbers(21,29));assert.deepEqual(range(p,'Ex Machina','special'),['3']);assert.equal(p.outcome,'partial');assert.ok(p.unparsed.join(' ').includes('Inside the Machine'));
   const h=parse(626);assert.equal(h.entries.length,2);assert.equal(h.outcome,'partial');assert.ok(h.unparsed.join(' ').includes('The Unreasoning Beast, Ghost Moon'));
   assert.equal(proposeContentsForReview('Collects The Unreasoning Beast, Ghost Moon #1-2','Collection').entries.length,0);
   assert.ok(!parse(603).entries.some(e=>e.series.includes('Ignition')));assert.ok(!parse(1225).entries.some(e=>e.series==='the'||e.series.includes('Annuals,')));
   assert.equal(proposeContentsForReview('Collects Comic #1, A Miniseries','Collection').outcome,'partial');
 }],
 ['finite non-comic names and excerpts survive without invented delimiters or counts',()=>{
   assert.deepEqual(parse(21).entries.map(e=>[e.unitType,e.number,e.completeness]),[['component','No Rest for the Wicked','excerpt']]);
   assert.deepEqual(proposeContentsForReview('Contains Wool, Shift, and Dust','Wool Omnibus').entries.map(e=>e.number),['Wool','Shift','Dust']);
   for(const s of ['Contains all four novels of the series','Includes three novels: Balanced on the Blade’s Edge Deathmaker Blood Charged','Includes stories by Jane Doe and John Smith'])assert.equal(proposeContentsForReview(s,'Anthology').entries.length,0);
 }],
 ['annual years never become issue numbers; explicit numbered annuals and specials survive',()=>{
   assert.equal(proposeContentsForReview('Collects Comic Annual 2000','Collection').entries.length,0);
   assert.equal(proposeContentsForReview('Collects Comic Annual #2000','Collection').entries[0].number,'2000');
   assert.deepEqual(proposeContentsForReview('Collects Comic #1, the Annual #2, Comic Special #3','Collection').entries.map(e=>[e.series,e.unitType,e.number]),[['Comic','issue','1'],['Comic','annual','2'],['Comic','special','3']]);
   assert.ok(parse(209).entries.some(e=>e.series==='Batman Incorporated'&&e.unitType==='special'&&e.run==='2012-2013'));
 }],
 ['scope, discontinuities, ampersands and genuine title punctuation survive',()=>{
   const p=proposeContentsForReview('Collects Comic #0, 7-11, selected from Other #22 & #28-33','Collection');assert.deepEqual(range(p,'Comic'),['0',...numbers(7,11)]);assert.ok(p.entries.filter(e=>e.series==='Other').every(e=>e.completeness==='excerpt'));
   assert.equal(proposeContentsForReview('Collects Comic #582-586, #591-597','Collection').entries.length,12);
   assert.ok(proposeContentsForReview('Includes pages from Wool, Shift and Dust','Wool Omnibus').entries.every(e=>e.completeness==='excerpt'));
   assert.ok(parse(448).entries.filter(e=>e.series==='AQUAMAN'||e.series==='CHALLENGERS OF THE UNKNOWN').every(e=>e.completeness==='excerpt'));
   for(const [id,label]of [[32,'Aliens, Earth War'],[1437,'Carnage: Black, White & Blood'],[465,'Doctor Strange, Sorcerer Supreme'],[1508,'X-Men: God Loves, Man Kills Extended Cut']])assert.ok(parse(id).entries.some(e=>e.series===label));
   for(const title of ['Promethea: Deluxe Edition Book Two','A Collection Book 1','Collection Volume 1','Omnibus Book 2','Collected Works Book One'])assert.equal(proposeContentsForReview('Collects issues #1-3',title,{allowTitleBinding:true}).entries.length,0);
   for(const statement of ['Includes Parts 1 & 2Often plot text','Collects Calendar 1978'])assert.equal(proposeContentsForReview(statement,'Collection').entries.length,0);
 }],
 ['context basis persists locally; edited statements do not reuse title binding',()=>{
   const f=byId(478),saved={source:'amazon-product-page',sourceUrl:'https://www.amazon.com/dp/B000000001',statement:f.rawStatement,availability:'statement-found',extractorVersion:4,checkedAt:'2026-10-05T00:00:00.000Z'};
   const state=contentsParseState({title:f.title,metadata:{enrichment:{kindleProductComicContents:saved}}});assert.equal(state.parserVersion,CONTENTS_PARSER_VERSION);assert.equal(state.parseOutcome,'full');assert.equal(state.parseBinding,'explicit-product-series-volume-title');assert.match(state.parseInput,/Earth 2/);
   const v=validateEnrichment('kindleProductComicContents',{...saved,...state});for(const k of ['statement','checkedAt','extractorVersion'])assert.equal(v[k],saved[k]);for(const k of ['parseInput','parseBinding'])assert.equal(v[k],state[k]);
   assert.equal(manifestReviewProposal(saved,f.title,'Collects #1-3').entries.length,0);
 }],
 ['restore preserves a selected source when improved grammar changes the winner',async()=>{
   const source=await readFile(new URL('../src/lib/kindle-manifest.js',import.meta.url),'utf8'),old=await oldParser();
   const frozen=await readFile(new URL('./fixtures/kindle/contents-parser-v3.snapshot.txt',import.meta.url),'utf8');
   const oldUrl='data:text/javascript;base64,'+Buffer.from(frozen.replace(/from '\.\/([^']+)'/gu,(_,p)=>`from '${new URL('../src/lib/'+p,import.meta.url).href}'`)).toString('base64');
   const rewritten=source.replace(/from '\.\/([^']+)'/gu,(_,p)=>`from '${p==='contents.js'?oldUrl:new URL('../src/lib/'+p,import.meta.url).href}'`);
   const previous=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));
   const blocks=[{selector:'#description',text:'Collects First Series vol. 1 #1-5. Contains Other Series #1-2.'}];
   const prior=previous.selectManifest(blocks,'Collection').manifest,current=selectManifest(blocks,'Collection').manifest;
   assert.notEqual(prior.selected,current.selected,'parser change demonstrably changes winner');
   const restored=validateManifest(prior);assert.equal(restored.candidates[restored.selected].raw,prior.candidates[prior.selected].raw);assert.deepEqual(restored.blocks,prior.blocks);
   const forged=structuredClone(prior);forged.candidates[forged.selected].raw='Collects Fake #1-99';forged.candidates[0].parserInput='Collects Fake #1-99';assert.deepEqual(validateManifest(forged),current);
   assert.equal(old.module.CONTENTS_PARSER_VERSION,3);assert.equal(CONTENTS_PARSER_VERSION,6);
 }],
 ['ordinary proposal semantics remain independent of discovery grammar',async()=>{
   const old=await oldParser();for(const f of fixtures)assert.deepEqual(proposeContents(f.statement),old.module.proposeContents(f.statement));
 }]
];
