// Offline replay of supplied private source evidence. No acquisition or saves.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {parseBackup} from '../src/lib/storage.js';
import {collectionContents,libraryCoverageIndex} from '../src/lib/inferred-coverage.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {CONTENTS_PARSER_VERSION} from '../src/lib/contents.js';
import {effectiveOwnershipRecord} from '../src/lib/ownership.js';
import {outputPath,requireBackup} from './audit-artifacts.mjs';
globalThis.fetch=()=>{throw Error('Offline audit forbids network requests.');};
const path=requireBackup(process.argv[2]),out=await outputPath(process.argv[3]??'audit-artifacts/contextual-contents/current.json');
const bytes=await readFile(path),sha=v=>createHash('sha256').update(v).digest('hex'),backup=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,'')),db=parseBackup(backup),before=sha(JSON.stringify(db)),rows=[];
const comic=e=>['issue','annual','special'].includes(e.unitType);
for(const r of Object.values(db.providerItems)){
 if(r.mediaType!=='book')continue;
 const p=collectionContents(r,db),s=r.metadata?.enrichment?.kindleProductComicContents;
 if(!p.entries.length&&!s?.statement&&!s?.manifest?.blocks?.length&&!r.metadata?.contentsStatement&&!r.metadata?.collects)continue;
 const source=s?{statement:s.statement,manifest:s.manifest,productDetailsEvidence:s.productDetailsEvidence,sourceUrl:s.sourceUrl,extractorVersion:s.extractorVersion}:null;
 rows.push({id:r.id,recordRef:r.recordRef,title:r.title,provider:r.provider,profileId:r.profileId,ownership:effectiveOwnershipRecord(r,db).ownership,reviewed:Boolean(db.contentReviews?.[r.id]),source,sourceHash:sha(JSON.stringify(source)),metadata:{series:r.metadata.series,publisher:r.metadata.publisher,publicationDate:r.metadata.publicationDate},proposal:p});
}
const preferences=backup.comicCoverageMerges??{},coverage=comicCoverageForLibrary(db,preferences),index=libraryCoverageIndex(db,{includeExcerpts:true,runInferenceExclusions:Object.values(preferences).flatMap(m=>m.members??[])});
const observations=[...index.index.values()].flat().map(v=>({recordRef:v.item.recordRef,title:v.item.title,entry:v.entry,provisional:v.provisional,confidence:v.confidence}));
const entries=rows.flatMap(r=>r.proposal.entries.filter(comic));
const data={input:{filename:basename(path),modifiedAt:(await stat(path)).mtime.toISOString(),sha256:sha(bytes),providerRecords:Object.keys(db.providerItems).length},parserVersion:CONTENTS_PARSER_VERSION,summary:{sourceOrReviewedBooks:rows.length,selectedStatementBooks:rows.filter(r=>r.source?.statement).length,enumerableBooks:rows.filter(r=>r.proposal.entries.some(comic)).length,comicObservations:entries.length,fullObservations:entries.filter(e=>e.completeness==='full').length,partialObservations:entries.filter(e=>e.completeness==='excerpt').length,annualObservations:entries.filter(e=>e.unitType==='annual').length,specialObservations:entries.filter(e=>e.unitType==='special').length,covered:coverage.groups.reduce((n,g)=>n+g.covered,0),partialOnly:coverage.groups.reduce((n,g)=>n+g.partial,0),duplicates:coverage.groups.reduce((n,g)=>n+g.duplicates,0),provisional:observations.filter(v=>v.provisional).length,excludedBooks:coverage.excluded.length},rows,observations,coverage:coverage.groups.map(g=>({id:g.id,series:g.series,run:g.run,unitType:g.unitType,issues:g.issues.map(i=>({number:i.number,partial:!!i.partial,copies:i.copies,sources:i.sources.map(s=>({recordRef:s.record.recordRef,completeness:s.completeness}))}))}))};
if(sha(await readFile(path))!==sha(bytes)||sha(JSON.stringify(db))!==before)throw Error('Read-only replay changed input or disposable database.');
data.protectedStateUnchanged=true;await writeFile(out,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({input:data.input,summary:data.summary,output:out},null,2));
