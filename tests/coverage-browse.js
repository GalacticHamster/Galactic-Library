import assert from 'node:assert/strict';
import {coverageBrowseState,applyCoveragePreset,coverageGroupMatches,publicationClass,issueCategory} from '../src/ui/coverage-browse.js';
const group=(series,run,unitType='issue',numbers=['1','3'])=>({id:JSON.stringify([series,run,unitType,'en']),series,run,unitType,language:'en',issues:numbers.map(number=>({number,copies:1,sources:[{record:{title:'Supporting collection'}}]})),covered:numbers.length,partial:0,duplicates:0});
export const coverageBrowseTests=[
 ['coverage browse classifies only cited, literal publication scopes, never issue counts or title substrings',()=>{
  for(const run of ['1984','1996','2011'])assert.equal(publicationClass(group('Teenage Mutant Ninja Turtles',run)).type,'ongoing');
  assert.equal(publicationClass(group('Teenage Mutant Ninja Turtles: Turtles in Time','2014')).type,'limited');
  assert.equal(publicationClass(group('Batman: Holy Terror','1991','special',['unnumbered'])).type,'standalone');
  for(const g of [group('Teenage Mutant Ninja Turtles','2024'),group('Batman','1939'),group('Amazing Spider-Man','1963'),group('Four issue ongoing','2020'),group('Twelve issue limited','2020'),group('Teenage Mutant Ninja Turtles','2011 volume 2')])assert.equal(publicationClass(g).type,'unknown');
  const merged=group('Teenage Mutant Ninja Turtles','2011');merged.originalScopes=[{series:merged.series,run:'2011'},{series:'Unknown alias',run:'2011'}];assert.equal(publicationClass(merged).type,'unknown');
 }],
 ['coverage filters compose without mutating groups, preserving annuals, partials, standalone and unknown identities',()=>{
  const ongoing=group('Teenage Mutant Ninja Turtles','2011'),annual=group(ongoing.series,'2011','annual'),limited=group('Teenage Mutant Ninja Turtles: Turtles in Time','2014'),unknown=group('Unclassified','2020'),special=group('Batman: Holy Terror','1991','special',['unnumbered']),before=JSON.stringify([ongoing,annual,limited,unknown,special]);
  const s=coverageBrowseState();assert([ongoing,annual,limited,unknown,special].every(g=>coverageGroupMatches(g,s)));
  applyCoveragePreset(s,'mainline');assert(coverageGroupMatches(ongoing,s));assert(!coverageGroupMatches(annual,s));assert(!coverageGroupMatches(limited,s));assert(!coverageGroupMatches(unknown,s));s.unknown=true;assert(coverageGroupMatches(unknown,s));
  s.query='turtles';s.coverage='gaps';assert(coverageGroupMatches(ongoing,s));s.issue='annual';assert(coverageGroupMatches(annual,s));assert(!coverageGroupMatches(ongoing,s));
  applyCoveragePreset(s,'all');s.query='';s.issue='special';assert(coverageGroupMatches(special,s));assert.equal(issueCategory(special),'special');
  const numbered=group('Civil War: The Confession','2007');assert.equal(issueCategory(numbered),'special');
  assert.equal(JSON.stringify([ongoing,annual,limited,unknown,special]),before);
 }],
 ['browse state and resolution category survive remount; presets retain search and do not invent completeness',()=>{
  const s=coverageBrowseState({query:'turtles',run:'ongoing',issue:'issue',coverage:'gaps',scope:'books',sort:'missing',direction:'reverse',page:2,size:20,queue:{open:true,category:'run',page:1,size:20}}),before=structuredClone(s);
  assert.equal(coverageBrowseState(s),s);assert.deepEqual(s,before);applyCoveragePreset(s,'resolution');assert.equal(s.query,'turtles');assert.equal(s.queue.category,'actionable');assert.equal(s.queue.open,true);assert.equal(s.scope,'books');
  const g=group('Unclassified','2020','issue',['1','2']);applyCoveragePreset(s,'all');s.query='';s.scope='all';s.coverage='no-gaps';assert(coverageGroupMatches(g,s));g.issues.push({number:'4',sources:[]});assert(!coverageGroupMatches(g,s));
 }]
];
