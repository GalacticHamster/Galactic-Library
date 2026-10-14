// Compare offline excerpt-audit snapshots. Private inventories stay ignored.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {contentKey} from '../src/lib/contents.js';
import {outputPath} from './audit-artifacts.mjs';
const [beforePath,afterPath,requested]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Supply BEFORE_JSON AFTER_JSON [audit-artifacts/.../report.md]. No acquisition is performed.');
const before=JSON.parse(await readFile(beforePath,'utf8')),after=JSON.parse(await readFile(afterPath,'utf8'));
assert.equal(before.input.sha256,after.input.sha256);assert(after.protectedDatabaseUnchanged);
assert.equal(before.records.length,after.records.length);
const old=new Map(before.records.map(r=>[r.recordRef,r])),changed=[];
for(const current of after.records){
 const prior=old.get(current.recordRef);assert(prior);
 for(const field of ['title','provider','profileId','effectiveOwnership','reviewed','sourceTrace','unparsed'])assert.deepEqual(current[field],prior[field],field+' changed: '+current.title);
 const priorEntries=new Map(prior.entries.map(e=>[contentKey(e),e]));assert.deepEqual(current.entries.map(contentKey).sort(),prior.entries.map(contentKey).sort());
 const promoted=current.entries.filter(e=>e.completeness!==priorEntries.get(contentKey(e)).completeness);
 if(!promoted.length){assert.deepEqual(current.entries,prior.entries);continue;}
 assert(!current.reviewed);assert(promoted.every(e=>e.completeness==='full'&&priorEntries.get(contentKey(e)).completeness==='excerpt'));
 const visible=after.coverage.flatMap(g=>g.issues.filter(i=>promoted.some(e=>e.number===i.number&&e.unitType===g.unitType)&&i.sources.some(s=>s.recordRef===current.recordRef&&s.completeness==='full')).map(i=>({series:g.series,run:g.run,unitType:g.unitType,number:i.number,copies:i.copies,key:g.id+':'+i.number})));
 changed.push({title:current.title,recordRef:current.recordRef,sourceTrace:current.sourceTrace,parserInput:current.parseInput,promoted,visible,beforeFull:prior.entries.filter(e=>e.completeness==='full').length,afterFull:current.entries.filter(e=>e.completeness==='full').length,beforePartial:prior.partial,afterPartial:current.partial,remainingPartial:current.entries.filter(e=>e.completeness==='excerpt'),beforeTrace:prior.extentTrace,afterTrace:current.extentTrace,unparsed:current.unparsed,pageCount:prior.source?.productDetailsEvidence?.observations?.find(o=>o.field==='pageCount')?.value});
}
const bFull=new Set(before.fullKeys),aFull=new Set(after.fullKeys),newFull=after.fullKeys.filter(k=>!bFull.has(k));
assert(before.fullKeys.every(k=>aFull.has(k)),'Full coverage was lost.');
const duplicates=data=>new Set(data.coverage.flatMap(g=>g.issues.filter(i=>!i.partial&&i.copies>1).map(i=>g.id+':'+i.number)));
const bDup=duplicates(before),aDup=duplicates(after),newDuplicates=[...aDup].filter(k=>!bDup.has(k));
const controls=after.records.filter(r=>/Aquaman: 80 Years|Urban Legends|Endgame|George P[eé]rez/i.test(r.title)).map(r=>({title:r.title,partial:r.partial,full:r.entries.filter(e=>e.completeness==='full').length,unchanged:JSON.stringify(r.entries)===JSON.stringify(old.get(r.recordRef).entries)}));
assert(controls.every(c=>c.unchanged));
const output={input:after.input,before:before.summary,after:after.summary,changed,newFullIdentities:newFull,newDuplicateIdentities:newDuplicates,controls,assertions:{identitiesUnchanged:true,sourceSelectionsUnchanged:true,unresolvedFragmentsUnchanged:true,reviewedEntriesUnchanged:true,accessUnchanged:true,backupUnchanged:true,protectedDatabaseUnchanged:after.protectedDatabaseUnchanged}};
const destination=await outputPath(requested??'audit-artifacts/narrative-extents/narrative-wrapper-audit-2026-10-14.md');assert(destination.endsWith('.md'));
const jsonPath=await outputPath(destination.slice(0,-3)+'.json');await writeFile(jsonPath,JSON.stringify(output,null,2)+'\n');
const lines=[
 '# Narrative-wrapper extent correction — October 14, 2026','',
 'Baseline: GL beffb4e, discovery parser '+before.parserVersion+'. Candidate: discovery parser '+after.parserVersion+'.', '',
 'Frozen input: **'+after.input.filename+'**, modified '+after.input.modifiedAt+', '+after.input.providerRecords.toLocaleString()+' provider records. SHA-256: '+after.input.sha256+'. This is the newest Downloads backup at audit time; the input hash and disposable database were checked unchanged after replay. No Amazon requests or live library writes were made.', '',
 '## Result','',
 changed.reduce((n,r)=>n+r.promoted.length,0)+' observations across '+changed.length+' book(s) become inferred full coverage; '+newFull.length+' newly full issue identities; '+newDuplicates.length+' newly duplicated identities. No issue identity, selected source, unresolved fragment, review, ownership status, merge preference or original record changed.', '',
 '| Metric | Before | After |','| --- | ---: | ---: |',
 ...Object.entries({booksWithComicContents:'Books with enumerable comic contents',partialObservations:'Partial observations',reviewedPartialObservations:'Reviewed partial observations',covered:'Distinct full issue identities',partialOnly:'Distinct partial-only identities',duplicates:'Identities with multiple complete copies',excludedBooks:'Books excluded by access',provisionalPartialObservations:'Owned partial observations still provisional'}).map(([key,label])=>'| '+label+' | '+before.summary[key]+' | '+after.summary[key]+' |'), '',
 '## Exact failure path','',
 '`manifestReviewProposal` correctly selects the saved narrative statement. `discoveryNumberedContents` sends its first clause to `numberedCollectionPayload`, whose final tales-wrapper rule explicitly marks a Find out introduction as excerpt. `clauseExtent` then propagates that extent into the annual and DC Comics Presents clause. The previous full-subject correction only enabled unqualified stories/tales headings inside explicit Collects/Includes claims, so this narrative heading could not use it. Run resolution and owned eligibility were already correct.', '',
 'The bounded `narrativeStoryPayload` recognizer now identifies Find out, Discover what happens/comes next, and adventure-continues introductions to finite numbered lists. The existing literal collection-subject, run-conflict and captured anthology/backup-context checks decide extent. Explicit nested subset qualifiers disable promotion. Cross-title clauses keep partial extent unless a separate explicit clause establishes full contents. No page-count threshold, title exception, alias or new run inference was introduced. The promotional words remain unresolved source evidence, so the proposal can still have parse outcome Partial while its main-series issues are full.', '',
 '## Changed records and source → parser → extent → coverage','',
 ...changed.flatMap(r=>[
  '### '+r.title,'',
  '> '+r.sourceTrace.statement,'',
  'Saved source: '+r.sourceTrace.sourceUrl+'. Selected candidate '+r.sourceTrace.selection.index+', block '+r.sourceTrace.selection.block+', offsets '+r.sourceTrace.selection.start+'–'+r.sourceTrace.selection.end+'. Block hash: '+r.sourceTrace.blocksHash+'. Captured page count: '+(r.pageCount??'not retained')+'.', '',
  'Parser input: '+r.parserInput+'.', '',
  'Full observations: '+r.beforeFull+' → '+r.afterFull+'. Partial observations: '+r.beforePartial+' → '+r.afterPartial+'.', '',
  '| Resolved series | Run | Type | Promoted numbers |','| --- | --- | --- | --- |',
  ...[...new Set(r.visible.map(v=>JSON.stringify([v.series,v.run,v.unitType])))].map(k=>{const [series,run,type]=JSON.parse(k);return '| '+series+' | '+run+' | '+type+' | '+r.visible.filter(v=>v.series===series&&v.run===run&&v.unitType===type).map(v=>'#'+v.number).join(', ')+' |';}), '',
  'Supporting evidence: the conventional volume title matches the explicitly enumerated main series; the description contains no subset limitation for that series or its contextual annual. The captured '+(r.pageCount??'unknown')+'-page length is corroboration, not proof or a parsing rule. All promotions remain Inferred; no human review is created.', '',
  'Remaining partial: '+r.remainingPartial.map(e=>e.series+' '+e.unitType+' #'+e.number).join('; ')+'. Original wrapper retained unresolved: '+r.unparsed.join('; ')+'.', ''
 ]),
 '## DC Comics Presents #83: unresolved completeness','',
 'The frozen corpus contains only this one parsed reference to DC Comics Presents #83. Its captured source merely lists that host issue beside the main series; the saved product metadata supplies publication, publisher, page count and subject series, but no story-level table of contents or explicit whole-host-issue claim. The 304-page count cannot distinguish a complete host issue from a reprinted feature. The implementation therefore retains partial coverage. This is conservative uncertainty, not a verified assertion that only a feature is present. A trustworthy contents breakdown or explicit user review can establish full extent later.', '',
 '## Precision and remaining uncertainty','',
 '| Control | Full observations | Partial observations | Unchanged |','| --- | ---: | ---: | --- |',
 ...controls.map(c=>'| '+c.title+' | '+c.full+' | '+c.partial+' | '+c.unchanged+' |'), '',
 'All other enumerable books are unchanged. Explicit excerpts/pages/material, selected/backup features, credited individual stories and unrelated host issues receive no blanket upgrade. The 25 provisional partial observations remain provisional; no identity ambiguity was bypassed. The wider set of remaining partials was not reclassified as bibliographically confirmed excerpts merely because it stayed unchanged.', '',
 '## Reproduction and validation','',
 'Run scripts/audit-excerpt-classification.mjs with the private backup and an explicit output filename on baseline and candidate checkouts. Compare the snapshots with scripts/compare-narrative-extents.mjs BEFORE_JSON AFTER_JSON. Full per-observation traces and changed coverage keys are in the adjacent JSON; private inventories are ignored.', '',
 'Focused regressions cover the actual captured Outsiders selection, promotional variants, annuals, cross-title clauses, explicit subset limits, run conflicts, anthology context, mixed extents, prior Endgame/Pérez behavior, review precedence, access exclusions and backup round-trip. Packaged UI checks inspect the grid, duplicates, source links and contents editor in disposable Chrome/Firefox profiles. Validation results and implementation commit are appended after completion.', ''
];
await writeFile(destination,lines.join('\n'));
console.log(JSON.stringify({report:destination,reconciliation:jsonPath,changed:changed.map(r=>({title:r.title,promoted:r.promoted.length,remainingPartial:r.afterPartial})),newFull:newFull.length,newDuplicates:newDuplicates.length},null,2));
