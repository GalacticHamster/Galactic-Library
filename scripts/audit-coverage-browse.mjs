// Offline display-only audit. Requires a separately supplied private backup.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseBackup} from '../src/lib/storage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {coverageBrowseState,applyCoveragePreset,publicationClass,coverageGroupMatches,issueCategory} from '../src/ui/coverage-browse.js';
import {requireBackup,outputPath} from './audit-artifacts.mjs';
import {resolutionCandidates,compatibleResolutionCollections,coverageResolutionRequest,applyCoverageResolutions} from '../src/lib/coverage-resolution.js';
const file=requireBackup(process.argv[2]),bytes=await readFile(file),backup=JSON.parse(bytes.toString().replace(/^\uFEFF/u,'')),db=parseBackup(backup),projection=comicCoverageForLibrary(db,backup.comicCoverageMerges??{}),hash=value=>createHash('sha256').update(value).digest('hex'),before=hash(JSON.stringify(projection)),classes={ongoing:0,limited:0,standalone:0,unknown:0};
const rows=projection.groups.map(group=>{const classification=publicationClass(group);classes[classification.type]++;return {series:group.series,run:group.run,issueType:group.unitType,category:issueCategory(group),covered:group.covered,partial:group.partial,duplicates:group.duplicates,...classification};});
const scopes=new Map();for(const group of projection.groups)for(const scope of group.originalScopes??[{series:group.series,run:group.run}])scopes.set(JSON.stringify([scope.series,scope.run]),publicationClass(scope).type);
const publicationRunClasses={ongoing:0,limited:0,standalone:0,unknown:0};for(const type of scopes.values())publicationRunClasses[type]++;
const examples={};for(const query of ['turtles','batman','spider-man']){
 const state=coverageBrowseState({query}),all=projection.groups.filter(g=>coverageGroupMatches(g,state));applyCoveragePreset(state,'mainline');const mainline=projection.groups.filter(g=>coverageGroupMatches(g,state));state.unknown=true;const includingUnknown=projection.groups.filter(g=>coverageGroupMatches(g,state));
 examples[query]={all:all.length,mainline:mainline.length,includingUnknown:includingUnknown.length,mainlineGroups:mainline.map(g=>({series:g.series,run:g.run,covered:g.covered})),actionableCollections:projection.dispositions.filter(r=>r.summary.actionable&&[r.title,...r.observations.map(o=>o.resolved.series)].some(t=>t.toLowerCase().includes(query))).length};
}
assert.equal(hash(JSON.stringify(projection)),before);assert.equal(hash(await readFile(file)),hash(bytes));
let disposable=db;for(const family of ['Ultimate B&W','Urban Legends']){
 const p=comicCoverageForLibrary(disposable),row=p.dispositions.find(r=>r.title.includes(family)&&r.summary.provisional),ids=row.observations.filter(o=>o.actionable).map(o=>o.id),target=resolutionCandidates(row,p.dispositions,disposable,ids).find(c=>c.suggested);
 const requests=[coverageResolutionRequest(row,ids,target,disposable),...compatibleResolutionCollections(row,ids,target,p.dispositions,disposable).map(c=>coverageResolutionRequest(c.collection,c.ids,c.target,disposable))];
 disposable=applyCoverageResolutions(disposable,{confirmed:true,mergeStamp:'{}',targets:requests}).database;
}
const state=coverageBrowseState({query:'turtles'});applyCoveragePreset(state,'mainline');const afterConfirmation=comicCoverageForLibrary(disposable).groups.filter(g=>coverageGroupMatches(g,state)).map(g=>({series:g.series,run:g.run,covered:g.covered}));
const row=projection.dispositions.find(r=>r.title.includes('Urban Legends')&&r.summary.provisional),ids=row.observations.filter(o=>o.actionable).map(o=>o.id),start=performance.now(),choices=resolutionCandidates(row,projection.dispositions,db,ids),candidateMs=performance.now()-start,target=choices.find(c=>c.suggested),relatedStart=performance.now();compatibleResolutionCollections(row,ids,target,projection.dispositions,db);const relatedMs=performance.now()-relatedStart,cachedStart=performance.now();choices.find(c=>c.id===target.id);const cachedChoiceMs=performance.now()-cachedStart;
const data={sha256:hash(bytes),providerRecords:Object.keys(db.providerItems).length,groups:rows.length,classes,classifiedGroups:rows.length-classes.unknown,distinctPublicationScopes:scopes.size,publicationRunClasses,totals:{covered:projection.groups.reduce((n,g)=>n+g.covered,0),partial:projection.groups.reduce((n,g)=>n+g.partial,0),duplicates:projection.groups.reduce((n,g)=>n+g.duplicates,0)},examples,afterExplicitDisposableTmntCorrections:afterConfirmation,preparationTiming:{candidateMs,relatedMs,cachedChoiceMs,note:'Single offline control, not a live browser performance claim. Cached lookup replaces repeated candidate construction; first preparation retains required checks.'},unchanged:true,rows};
const output=await outputPath(process.argv[3]??'audit-artifacts/coverage-browse/audit.json');await writeFile(output,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({...data,rows:undefined},null,2));
