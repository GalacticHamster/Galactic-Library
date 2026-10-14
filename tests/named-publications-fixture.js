import {manifestReviewProposal,validateManifest} from '../src/lib/kindle-manifest.js';
import {collectionContents} from '../src/lib/inferred-coverage.js';
import {excerptBook} from './excerpt-extent-fixture.js';
import {coverageDatabase} from './inferred-coverage-fixture.js';
export const namedCounts=[3,13,9,15,13,15,15,14,15,15];
export function namedBook(c,index=0){const book=excerptBook(c,index);book.metadata.enrichment.kindleProductComicContents.manifest=validateManifest(c.source.manifest,c.title);return book;}
export function checkNamedPublication(c,index,assert){
 const book=namedBook(c,index),db=coverageDatabase(book),before=JSON.stringify(db),p=collectionContents(book,db);
 assert(p.entries.length===namedCounts[index],'Incorrect named-publication count: '+c.title+' '+p.entries.length);
 assert(p.entries.every(e=>e.completeness==='full'),'Named publication was assigned the wrong extent');
 assert(JSON.stringify(manifestReviewProposal(c.source,c.title).entries)===JSON.stringify(p.entries),'Saved source differs from the coverage path');
 assert(JSON.stringify(manifestReviewProposal(c.source,c.title,c.source.statement.replace(/\s+/gu,' ')).entries)===JSON.stringify(p.entries),'Whitespace changes publication resolution');
 assert(JSON.stringify(db)===before,'Publication interpretation mutated saved data');
 if(index===2)assert(p.entries.filter(e=>e.unitType==='special'&&e.number==='unnumbered').length===7&&!p.entries.some(e=>e.unitType==='component'),'One-shots became numbered #1 or remained parent components');
 if(index===3)assert(p.entries.filter(e=>e.series.endsWith('Villains Micro-Series')).map(e=>e.number).join(',')==='3,4,5,6,7,8'&&p.entries.some(e=>e.unitType==='annual'&&e.number==='unnumbered'),'Character installments or dated annual wrong');
 if(index===6)assert(p.entries.some(e=>e.unitType==='special'&&e.run==='publication 2015'&&e.number==='unnumbered'),'FCBD was renumbered');
 if(index===8)assert(p.entries.filter(e=>e.series.endsWith('Ghostbusters 2')).length===5&&!p.entries.some(e=>e.series.endsWith('/Ghostbusters')),'Crossover sequel conflated');
 if(index===9)assert(p.entries.filter(e=>e.series.endsWith('Macro-Series')).map(e=>e.number).join(',')==='2,3','Macro-Series installments conflated');
 return {p,book,db};
}
