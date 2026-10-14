// Offline only. Supply a private backup; no acquisition or provider writes.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {parseBackup} from '../src/lib/storage.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {contentKey,CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
globalThis.fetch=()=>{throw Error('Offline audit forbids network requests.');};
// Instrument a disposable in-memory copy, never the runtime parser. Replaying
// the selected parser input must reproduce entries before assigning reasons.
const parserUrl=new URL('../src/lib/contents.js',import.meta.url),parserSource=await readFile(parserUrl,'utf8');
const hook='entries.push(...validated);if(annualYear)';
if(!parserSource.includes(hook))throw Error('Parser trace hook changed; update the audit instead of guessing reasons.');
const probeSource=parserSource.replace(hook,'entries.push(...validated);context.__audit?.push(...validated.map(entry=>({entry,raw,body,headingExtent,qualified,wrapper:wrapped?.prefix,wrapperExcerpt:wrapped?.excerpt,clauseExtent})));if(annualYear)').replace(/(from\s*['"])(\.\/[^'"]+)(['"])/gu,(_,a,path,b)=>a+new URL(path,parserUrl).href+b);
const probe=await import('data:text/javascript;base64,'+Buffer.from(probeSource).toString('base64'));
function reason(trace,reviewed){
 if(reviewed)return 'human-reviewed-partial';if(!trace)return 'audit-trace-unresolved';
 const {raw,body,wrapper,qualified}=trace;
 if(/\bbackup\b/iu.test(raw))return 'backup-stories';
 if(/\bselected (?:stories|tales)|\b(?:short story|short stories|a story)\b/iu.test(raw))return 'selected-or-single-stories';
 if(/\b(?:selected )?pages?\s+from\b|\bportions?\b/iu.test(raw))return 'pages-or-portions';
 if(/\bexcerpts?\b/iu.test(raw))return 'explicit-excerpts';
 if(/\b(?:selected )?material\s+from\b|^selected from\b/iu.test(raw))return 'material-or-selections';
 if(/^(?:stories|tales)\s+from\b/iu.test(body)&&!qualified&&!wrapper)return 'inherited-story-heading';
 if(/^(?:stories|tales)\s+from\b/iu.test(raw))return 'ordinary-story-heading-or-clause';
 if(/\bstories?\b[^#]{0,100}\bfrom\b/iu.test(raw))return 'attributed-or-named-story-wrapper';
 if(wrapper&&trace.wrapperExcerpt)return /tales/iu.test(wrapper)?'narrative-tales-wrapper':'other-partial-wrapper';
 return 'inherited-partial-extent';
}
const input=requireBackup(process.argv[2]),destination=await outputPath(process.argv[3]??'audit-artifacts/excerpt-classification/before.json');
const bytes=await readFile(input),sha=v=>createHash('sha256').update(v).digest('hex'),backup=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,'')),db=parseBackup(backup),records=[];
const protectedState=sha(JSON.stringify(db)),comic=e=>['issue','annual','special'].includes(e.unitType);
for(const record of Object.values(db.providerItems)){
 if(record.mediaType!=='book')continue;
 const p=collectionContents(record,db),entries=p.entries.filter(comic);if(!entries.length)continue;
 const source=record.metadata?.enrichment?.kindleProductComicContents,review=db.contentReviews[record.id];
 const partial=entries.filter(e=>e.completeness==='excerpt'),trace=[];
 if(!review&&p.parseInput&&(partial.length||/\b(?:stories|tales)\s+from\b/iu.test(p.parseInput))){
  const subjects=(source?.productDetailsEvidence?.observations??[]).filter(o=>o.field==='series'&&o.status==='observed'&&/^Part of:\s*/iu.test(o.value??o.raw??'')).map(o=>(o.value??o.raw).replace(/^Part of:\s*/iu,''));
  const extentDescription=source?.manifest?.blocks?.[source.manifest.candidates?.[source.manifest.selected]?.block]?.text;
  const parsed=probe.proposeContentsForReview(p.parseInput,record.title,{allowTitleBinding:true,series:record.metadata?.series,extentDescription,...(subjects.length===1?{subjectSeries:subjects[0]}:{}),__audit:trace});
  if(JSON.stringify(parsed.entries.filter(comic))!==JSON.stringify(entries))trace.length=0;
 }
 const reasons=partial.map(entry=>{const detail=trace.find(t=>contentKey(t.entry)===contentKey(entry)&&t.entry.completeness===entry.completeness);return {entry,reason:reason(detail,Boolean(review)),...(detail?{trace:detail}:{})};});
 const selected=source?.manifest?.candidates?.[source.manifest.selected],sourceTrace=source?{statement:source.statement,sourceUrl:source.sourceUrl,blocksHash:sha(JSON.stringify(source.manifest?.blocks??[])),selection:selected?{index:source.manifest.selected,block:selected.block,start:selected.start,end:selected.end,raw:selected.raw}:null}:null;
 records.push({id:record.id,recordRef:record.recordRef,title:record.title,provider:record.provider,profileId:record.profileId,effectiveOwnership:effectiveOwnershipRecord(record,db).ownership,reviewed:Boolean(review),entries,reasons,extentTrace:trace,sourceTrace,unparsed:p.unparsed,parseBinding:p.parseBinding,parseInput:p.parseInput,normalizedInput:p.normalizedInput,manifestEvidence:p.manifestEvidence,statement:source?.statement??record.metadata.contentsStatement??record.metadata.collects??review?.statement??'',...(partial.length||/Vol\. 7: Endgame/u.test(record.title)?{source,review}:{}),partial:partial.length});
}
const coverage=comicCoverageForLibrary(db,backup.comicCoverageMerges??{}),index=libraryCoverageIndex(db,{includeExcerpts:true,runInferenceExclusions:Object.values(backup.comicCoverageMerges??{}).flatMap(m=>m.members??[])});
const keys=(partial)=>coverage.groups.flatMap(g=>g.issues.filter(i=>Boolean(i.partial)===partial).map(i=>g.id+':'+i.number));
const data={input:{filename:basename(input),modifiedAt:(await stat(input)).mtime.toISOString(),sha256:sha(bytes),providerRecords:Object.keys(db.providerItems).length},parserVersion:CONTENTS_PARSER_VERSION,summary:{booksWithComicContents:records.length,partialBooks:records.filter(r=>r.partial).length,partialObservations:records.reduce((n,r)=>n+r.partial,0),reviewedPartialObservations:records.filter(r=>r.reviewed).reduce((n,r)=>n+r.partial,0),ownedPartialObservations:records.filter(r=>['owned','claimed'].includes(r.effectiveOwnership)).reduce((n,r)=>n+r.partial,0),coverageGroups:coverage.groups.length,covered:coverage.groups.reduce((n,g)=>n+g.covered,0),partialOnly:coverage.groups.reduce((n,g)=>n+g.partial,0),duplicates:coverage.groups.reduce((n,g)=>n+g.duplicates,0),excludedBooks:coverage.excluded.length,provisionalPartialObservations:[...index.index.values()].flat().filter(v=>v.entry.completeness==='excerpt'&&v.provisional).length},fullKeys:keys(false),partialKeys:keys(true),coverage:coverage.groups.map(g=>({id:g.id,series:g.series,run:g.run,unitType:g.unitType,issues:g.issues.map(i=>({number:i.number,partial:!!i.partial,copies:i.copies,sources:i.sources.map(s=>({recordRef:s.record.recordRef,completeness:s.completeness}))}))})),records};
if(sha(await readFile(input))!==sha(bytes))throw Error('Backup changed during read-only audit.');
if(sha(JSON.stringify(db))!==protectedState)throw Error('Coverage projection mutated the disposable database.');
data.protectedDatabaseUnchanged=true;
data.provisionalPartials=[...index.index.values()].flat().filter(v=>v.entry.completeness==='excerpt'&&v.provisional).map(v=>({title:v.item.title,recordRef:v.item.recordRef,entry:v.entry}));
await writeFile(destination,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({file:data.input,...data.summary,output:destination},null,2));
