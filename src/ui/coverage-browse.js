// Presentation only. Bibliographic facts never admit observations to coverage.
import {PUBLICATION_REFERENCES,COVERAGE_RESOLUTION_REFERENCES} from '../lib/publication-reference-data.js';
import {identityKey} from '../lib/identity.js';
import {comicRange} from '../lib/comic-coverage.js';
const facts=[...PUBLICATION_REFERENCES,...COVERAGE_RESOLUTION_REFERENCES];
const classifications=new WeakMap();
export function publicationClass(group){
 if(classifications.has(group))return classifications.get(group);
 const scopes=group.originalScopes??[{series:group.series,run:group.run}];
 const matches=scopes.map(scope=>facts.filter(f=>/^\d{4}(?:[-–—]\d{4})?$/u.test(scope.run??'')&&f.run===scope.run.slice(0,4)&&[f.title,...f.aliases].some(t=>identityKey(t)===identityKey(scope.series))));
 const types=matches.map(rows=>new Set(rows.map(f=>f.kind==='ongoing'?'ongoing':f.kind==='miniseries'?'limited':f.kind==='one-shot'?'standalone':'unknown')));
 const known=types.map(set=>set.size===1?[...set][0]:'unknown');
 const result={type:known.length&&known.every(t=>t===known[0])?known[0]:'unknown',sources:[...new Set(matches.flat().flatMap(f=>f.sources))]};classifications.set(group,result);return result;
}
export function issueCategory(group){
 return group.unitType==='annual'?'annual':group.unitType==='special'?'special':group.unitType==='issue'?(publicationClass(group).type==='standalone'||group.issues.every(i=>i.number==='unnumbered')?'special':'issue'):'unknown';
}
export function coverageBrowseState(state={}){
 const defaults={query:'',scope:'all',run:'all',issue:'all',coverage:'all',sort:'title',direction:'default',unknown:false,page:0,size:50,selected:null,details:{},queue:{}};
 for(const [key,value]of Object.entries(defaults))if(state[key]===undefined)state[key]=value;
 return state;
}
export function applyCoveragePreset(state,preset){
 Object.assign(state,{run:preset==='mainline'?'ongoing':'all',issue:preset==='mainline'?'issue':'all',coverage:'all',unknown:false,page:0});
 state.queue.open=preset==='resolution';if(preset==='resolution')state.queue.category='actionable';
 state.preset=preset;
}
export function coverageGroupMatches(group,state,{label=group.series,starts={},transitions={}}={}){
 const titles=state.scope==='series'?[label,group.series,...(group.originalTitles??[])]:state.scope==='books'?group.issues.flatMap(i=>i.sources.map(s=>s.record.title)):[label,group.series,...(group.originalTitles??[]),...group.issues.flatMap(i=>i.sources.map(s=>s.record.title))];
 if(!titles.some(t=>t.toLowerCase().includes(state.query.trim().toLowerCase())))return false;
 const type=publicationClass(group).type;
 if(state.run!=='all'&&type!==state.run&&!(state.unknown&&type==='unknown'))return false;
 if(state.issue!=='all'&&issueCategory(group)!==state.issue)return false;
 const range=comicRange(group,starts[group.id]??1,transitions[group.id]);
 return state.coverage==='all'||state.coverage==='gaps'&&range.missing>0||state.coverage==='no-gaps'&&range.missing===0||state.coverage==='duplicates'&&group.duplicates>0||state.coverage==='partial'&&group.partial>0;
}
