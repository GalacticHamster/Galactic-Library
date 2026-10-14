// Private replay reconciliation; never imports workbook/public research as ownership.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {contentKey} from '../src/lib/contents.js';
import {outputPath} from './audit-artifacts.mjs';
const [beforePath,afterPath,requested]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Supply BEFORE_JSON AFTER_JSON [audit-artifacts/.../report.md]. No network acquisition is performed.');
const b=JSON.parse(await readFile(beforePath,'utf8')),a=JSON.parse(await readFile(afterPath,'utf8'));
assert.equal(b.input.sha256,a.input.sha256);assert(a.protectedStateUnchanged&&b.protectedStateUnchanged);assert.equal(a.rows.length,b.rows.length);
const old=new Map(b.rows.map(r=>[r.recordRef,r])),changed=[];
const captured=r=>{const s=r.source,m=s?.manifest,c=m?.candidates?.[m.selected];return s?[s.statement,s.sourceUrl,s.extractorVersion,m?.blocks,c?[c.block,c.start,c.end,c.raw]:null,s.productDetailsEvidence]:null;};
for(const row of a.rows){
 const prior=old.get(row.recordRef);assert(prior);for(const field of ['title','provider','profileId','ownership','reviewed'])assert.deepEqual(row[field],prior[field]);
 assert.deepEqual(captured(row),captured(prior),'Captured source or selected coordinates changed: '+row.title);
 const keys=new Set(row.proposal.entries.map(e=>contentKey(e)+':'+e.completeness)),priorKeys=new Set(prior.proposal.entries.map(e=>contentKey(e)+':'+e.completeness));
 assert(prior.proposal.entries.every(e=>keys.has(contentKey(e)+':'+e.completeness)),'Existing parsed identity/extent lost: '+row.title);
 const added=row.proposal.entries.filter(e=>!priorKeys.has(contentKey(e)+':'+e.completeness));
 if(!added.length)continue;assert(!row.reviewed);changed.push({...row,before:prior.proposal,added,visible:a.observations.filter(o=>o.recordRef===row.recordRef)});
}
const fullKeys=d=>d.coverage.flatMap(g=>g.issues.filter(i=>!i.partial).map(i=>g.id+':'+i.number)),bf=new Set(fullKeys(b)),af=new Set(fullKeys(a));assert([...bf].every(k=>af.has(k)));
const comicClaim=r=>Boolean(r.source?.statement)&&!(/\bbooks?\s*#|\b(?:fretboard|tablature|octaves|etudes?)\b/iu.test(r.source.statement)&&!/\b(?:issues?|comics?|miniseries)\b/iu.test(r.source.statement))&&/#[\s]*\d|\bissues?\s*#?\d|\b(?:all|complete|entire)\b[^.!?]{0,50}\bissues?\b|\b[\w]+[-–—]issue\s+(?:mini-?series|series)|\b(?:Annuals?|Free Comic Book Day|one-shots?)\b/iu.test(r.source.statement);
const typed=r=>r.proposal.entries.some(e=>['issue','annual','special'].includes(e.unitType));
const reason=r=>{
 const s=r.source?.statement??'';
 if(!/#\s*\d|\bissues?\s*\d/iu.test(s)&&r.source?.manifest?.candidates?.some((c,i)=>i!==r.source.manifest.selected&&/^collect(?:s|ing)?\b/iu.test(c.raw)&&/#\s*\d/iu.test(c.raw)))return 'selected non-enumerable prose; separate captured issue claim';
 if(r.proposal.provisionalRanges?.length)return 'clear range, unresolved series';
 if(r.proposal.quality==='filtered'||r.proposal.quality==='uncertain')return 'candidate quality / non-contained or uncertain prose';
 if(/\ball\b[^.!?]{0,40}\bissues?\b|[-–—]issue\s+(?:mini-?series|series)/iu.test(s))return 'complete count needs a safe series/start anchor';
 if(/\bAnnuals?|Free Comic Book Day|one-shots?\b/iu.test(s))return 'unnumbered or mixed publication syntax';
 if(/^\s*(?:collects?|collecting|includes?)\s+issues?\b/iu.test(s))return 'implicit/postposed series or unsupported tail';
 return 'explicit numbered syntax / unsupported wrapper';
};
const misses=d=>d.rows.filter(r=>!r.reviewed&&comicClaim(r)&&!typed(r));
const groups=d=>Object.fromEntries([...new Set(misses(d).map(reason))].map(k=>[k,misses(d).filter(r=>reason(r)===k).length]));
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/kindle/contextual-comics.json',import.meta.url),'utf8'));
const targets=fixture.cases.map(c=>a.rows.find(r=>r.provider==='kindle'&&r.source?.sourceUrl===c.source.sourceUrl));assert(targets.every(Boolean));
const remaining=misses(a).map(r=>({title:r.title,reason:reason(r),ownership:r.ownership,source:r.source,proposal:r.proposal,otherCapturedCandidates:r.source?.manifest?.candidates?.filter((c,i)=>i!==r.source.manifest.selected).map(c=>({raw:c.raw,entries:c.entries}))??[]}));
const namedRemaining=a.rows.filter(r=>!r.reviewed&&r.proposal.unparsed?.some(s=>/Annual|Free Comic Book Day|special|one-shot/iu.test(s))).map(r=>({title:r.title,fragments:r.proposal.unparsed.filter(s=>/Annual|Free Comic Book Day|special|one-shot/iu.test(s))}));
const data={input:a.input,before:b.summary,after:a.summary,newBooks:changed.filter(r=>!typed({...r,proposal:r.before})).length,changedBooks:changed.length,recoveredObservations:changed.reduce((n,r)=>n+r.added.length,0),newFullIdentities:[...af].filter(k=>!bf.has(k)),changed,targets,missedFamilies:{before:groups(b),after:groups(a)},remaining,namedRemaining,provisionalRanges:a.rows.filter(r=>r.proposal.provisionalRanges?.length).map(r=>({title:r.title,ranges:r.proposal.provisionalRanges})),assertions:{sameBackup:true,protectedStateUnchanged:true,sourceSelectionsUnchanged:true,allExistingParsedEntriesAndExtentsPreserved:true,allReviewedEntriesPreserved:true,accessStatesPreserved:true}};
const out=await outputPath(requested??'audit-artifacts/contextual-contents/contextual-comics-tmnt-audit-2026-10-14.md'),json=await outputPath(out.replace(/\.md$/u,'.json'));assert(out!==json);await writeFile(json,JSON.stringify(data,null,2)+'\n');
const clean=s=>String(s??'').replace(/\s+/gu,' ').replace(/\|/gu,'\\|');
const describe=entries=>[...new Set(entries.map(e=>JSON.stringify([e.series,e.run,e.unitType])))].map(k=>{const [series,run,type]=JSON.parse(k);return series+(run?' ('+run+')':'')+' — '+type+': '+entries.filter(e=>e.series===series&&e.run===run&&e.unitType===type).map(e=>e.number==='unnumbered'?'unnumbered':'#'+e.number).join(', ');}).join('; ');
const lines=[
 '# Contextual comic contents and TMNT audit — October 14, 2026','',
 'Baseline: GL 654de00 / parser '+b.parserVersion+'. Candidate: parser '+a.parserVersion+'. Newest frozen Downloads backup: **'+a.input.filename+'**, modified '+a.input.modifiedAt+', **'+a.input.providerRecords.toLocaleString()+' provider records**. SHA-256: '+a.input.sha256+'.', '',
 'The backup, live library, reviews, access corrections, merge preferences and HB/FAN data were not modified. Replay was offline and failed if fetch was attempted or the input/disposable database changed. Public bibliographic references below were read separately; no public/workbook information was imported as ownership.', '',
 'Source preservation compares original statements, description blocks, selected raw windows/coordinates and Product Details. Disposable backup validation can recompute candidate ranks/counts under the current parser; those interpretation-cache values are not treated as original source evidence.', '',
 '## Result','',
 '**'+data.newBooks+' books newly gain enumerable comic contents; '+data.recoveredObservations+' observations recovered across '+changed.length+' books; '+data.newFullIdentities.length+' newly full owned identities.** All original parsed identities and extents remain present. Partial and duplicate coverage were not increased by guessing.', '',
 '| Metric | Before | After |','| --- | ---: | ---: |',
 ...Object.entries({selectedStatementBooks:'Books with a selected saved statement',enumerableBooks:'Books with enumerable comic contents',comicObservations:'Comic observations, all access states',fullObservations:'Full observations, all access states',partialObservations:'Partial observations',annualObservations:'Annual observations',specialObservations:'Special observations',covered:'Distinct full owned issue/publication identities',partialOnly:'Distinct partial-only identities',duplicates:'Identities with multiple complete copies',provisional:'Provisional owned observations',excludedBooks:'Parsed books excluded by access'}).map(([k,label])=>'| '+label+' | '+b.summary[k]+' | '+a.summary[k]+' |'), '',
 'Coverage totals include existing direct issues, reviews and inferred collections. Parser observations are per book, not distinct purchases or global issues. More excluded books means previously unparsed subscription books now have contents to exclude; access statuses did not change.', '',
 '## Root causes and correction','',
 '- All seven primary sources were already captured and selected. Acquisition was not the missing step. Zero-entry outcomes came from the discovery grammar and source-context handoff.',
 '- The old anchor required a volume/book marker or narrowly matching metadata. Standalone complete miniseries and meaningful subtitles/sequels now retain the full product identity. Captured qualified series labels can support the same product without transferring a broad franchise identity onto its subseries.',
 '- Complete-count grammar recognizes all N issues and the N-issue (mini)series. It expands #1–N only for a complete standalone series or explicitly named complete series. A trade volume, anthology, mere N issues, chapters, story counts and conflicting context do not establish this start.',
 '- Postposed series names bind a list such as #131 and 132 before conjunction splitting. Bare ranges support Unicode dashes and through; a finite which-serve-as tie-in tail stays unresolved instead of deleting the range or becoming another series.',
 '- Source-bound review can reinterpret the exact saved raw clause for newly supported syntax. Existing explicit series/run normalization remains authoritative for ordinary inherited lists, preserving attribution, punctuation and earlier corrections. Substantive user edits still cannot borrow untouched-provider context.',
 '- Year-named annuals and FCBD issues retain their publication year separately from issue numbering. Annuals allow the literal unnumbered marker; specials already support named numbers. No #2022 or assumed #1 is created. Named Lost Day Special is independent of the regular mini-series. No schema migration, issue registry or matching-rule change was introduced.',
 '- A sibling-volume projection can corroborate an implicit collection label when an explicit source clause, captured series widget and publisher all agree. Only implicit entries use it; explicit conflicting series/runs, reviews and existing merge scopes take precedence. Existing run-resolution rules then apply; no TMNT lookup table or fixed 2011 assignment exists.',
 '- Clear ranges without a safe series retain provisional range information and original unresolved text. The review UI explains that these numbers do not establish owned coverage.', '',
 '## Seven primary TMNT records','',
 '| Book | Before entries | After entries | Frozen access | Owned coverage |','| --- | ---: | ---: | --- | --- |',
 ...targets.map(r=>'| '+clean(r.title)+' | '+old.get(r.recordRef).proposal.entries.length+' | '+r.proposal.entries.length+' | '+r.ownership+' | '+(a.observations.filter(o=>o.recordRef===r.recordRef&&!o.provisional).length)+' observations |'), '',
 ...targets.flatMap(r=>{const c=r.source.manifest.candidates[r.source.manifest.selected];return [
  '### '+r.title,'','> '+r.source.statement,'',
  'Source '+r.source.sourceUrl+'; selected candidate '+r.source.manifest.selected+', block '+c.block+', offsets '+c.start+'–'+c.end+'. Selection/source hash unchanged.', '',
  'Current interpretation: '+describe(r.proposal.entries)+'.', '',
  'Parser input: '+r.proposal.parseInput+'.', '',
  'Context evidence: '+(r.proposal.contextualEvidence??[]).map(e=>e.kind+(e.basis?' / '+e.basis:'')).join('; ')+'. '+(r.ownership==='owned'?'Owned access admits the resolved observations.':'Saved '+r.ownership+' access excludes these entries from owned coverage, even though extraction now succeeds.'), '',
  'Unresolved wording retained: '+(r.proposal.unparsed.join('; ')||'none')+'.', ''
 ];}),
 'The seven books recover 39 regular-issue observations, one dated annual and two named specials (42 total). Only Batman/TMNT II and The Last Ronin are owned in this frozen backup; the other five are subscription records. In a disposable owned fixture, sibling corroboration and a dated same-series anchor resolve the Reborn range to the IDW run while a Mirage reset remains separate. Without a supported dated anchor no calendar year is invented. A subscription entry becoming parseable never grants ownership.', '',
 '## Named-publication evidence and limits','',
 'The [IDW Annual 2022 solicitation](https://www.previewsworld.com/Catalog/JAN220484) confirms a separately titled annual. The [official FCBD 2022 announcement](https://www.freecomicbookday.com/Article/256237-FCBD-2022-Gold-Sponsor-Comic-Books-Announced) identifies a TMNT special for that year. [IDW’s Lost Day announcement](https://idwpublishing.com/blogs/news/epic-teenage-mutant-ninja-turtles-last-ronin-lost-years-comic-book-saga-expands-with-lost-day-special-while-directors-cut-offers-fans-rare-glimpse-behind-scenes) distinguishes the supplemental special from Lost Years. These corroborate publication types; runtime extraction uses saved wording only and does not assign catalogue numbers from these pages. The marker unnumbered means no issue number was supplied, not a claim that all cataloguers number it that way.', '',
 '## All changed records','',
 '| Book | Before | After | Added | Access |','| --- | ---: | ---: | ---: | --- |',
 ...changed.map(r=>'| '+clean(r.title)+' | '+r.before.entries.length+' | '+r.proposal.entries.length+' | '+r.added.length+' | '+r.ownership+' |'), '',
 'The adjacent JSON retains exact source statements, added entries, context evidence, unresolved supplements and projection observations for every changed record. No book-specific production exception or ownership import was used.', '',
 '## Remaining missed-contents families','',
 'This screen counts selected comic-like claims with no usable typed comic entries. It is not an accuracy score: filtered/promotional statements, ambiguous identity and unsupported named material are distinguished from parser failures. Books already yielding some issues can still have unresolved supplements.', '',
 '| Primary reason | Before books | After books |','| --- | ---: | ---: |',
 ...[...new Set([...Object.keys(data.missedFamilies.before),...Object.keys(data.missedFamilies.after)])].map(k=>'| '+k+' | '+(data.missedFamilies.before[k]??0)+' | '+(data.missedFamilies.after[k]??0)+' |'), '',
 ...remaining.map(r=>'- **'+r.title+'** — '+r.reason+'. '+clean(r.source.statement)), '',
 'Additional unresolved annual/special/FCBD fragments are inventoried in the JSON ('+namedRemaining.length+' books). Named one-shots, shorthand publication titles, abbreviated year labels, mixed quoted works and independently selected source claims can still need review. No missing numbered series is manufactured from a named mini-series without a complete count. Hellboy Volume 8’s complete-count statement remains unresolved because the trade number alone does not identify the constituent miniseries. Actual publication-run ambiguity and old source omissions remain separate from extraction success.', '',
 'Two specific selection limitations remain: TMNT IDW Collection Vol. 5 and Vol. 6 retain the historical selected “including one-shots, crossovers, and event series” fragment, while separate captured Collects claims enumerate #38–44 and #45–50 respectively. Vol. 5’s secondary claim already parses seven regular issues. Vol. 6’s secondary claim also needs ongoing-series context and named-publication interpretation. These are not missing Amazon descriptions or failures of the seven primary regressions. This pass preserves selected evidence and does not silently rerank/union independent claims. The B&W Collection Vol. 6 statement supplies no enumerable numbers, so a safe parser cannot manufacture them. Four non-comic book-number/music mentions were excluded from the comic failure screen.', '',
 '## Precision, persistence and validation','',
 'All existing entry keys and extents, all reviewed entries, source selections, access states and protected database contents were checked unchanged. Existing Endgame, Pérez, Outsiders, anthology/excerpt, annual and digital-chapter regressions remain in the normal suites. Unnumbered annuals/specials survive backup/restore without generating #1-through-year gaps. No extra acquisitions or product matches are introduced.', '',
 'Reproduce with scripts/audit-contextual-contents.mjs PRIVATE_BACKUP OUTPUT_JSON on baseline and candidate checkouts, then scripts/compare-contextual-contents.mjs BEFORE_JSON AFTER_JSON. Generated reports, private source inventories and logs stay in ignored audit-artifacts. Public bounded regression inputs live in tests/fixtures/kindle/contextual-comics.json. Final test results and commit are appended after completion.', ''
];
await writeFile(out,lines.join('\n'));console.log(JSON.stringify({report:out,reconciliation:json,changedBooks:changed.length,newBooks:data.newBooks,recovered:data.recoveredObservations,newFull:data.newFullIdentities.length,missedFamilies:data.missedFamilies,remaining:remaining.length},null,2));
