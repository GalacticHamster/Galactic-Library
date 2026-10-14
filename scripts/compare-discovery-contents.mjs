// Read-only comparison of two offline audit-contextual-contents replays.
// Requires separately supplied private replay JSON; never acquires sources.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {contentKey} from '../src/lib/contents.js';
import {outputPath} from './audit-artifacts.mjs';
globalThis.fetch=()=>{throw Error('Offline comparison forbids network requests.');};
if(!process.argv[2]||!process.argv[3])throw Error('Supply BEFORE_JSON AFTER_JSON [OUTPUT_MD].');
const a=JSON.parse(await readFile(process.argv[2],'utf8')),b=JSON.parse(await readFile(process.argv[3],'utf8'));
assert.equal(a.input.sha256,b.input.sha256);assert(a.protectedStateUnchanged&&b.protectedStateUnchanged);
const old=new Map(a.rows.map(r=>[r.id,r])),comic=e=>['issue','annual','special'].includes(e.unitType),key=e=>contentKey(e)+':'+e.completeness;
const signature=p=>JSON.stringify([p.entries,p.unparsed,p.outcome,p.manifestEvidence,p.supportingStatements]);
const metric=d=>{
 const captured=d.rows.filter(r=>r.source?.manifest?.blocks?.length),withIssues=r=>r.proposal.entries.some(comic);
 return {...d.summary,capturedDescriptionBooks:captured.length,capturedButZeroComicIssues:captured.filter(r=>!withIssues(r)).length,
  selectedEnumerableBooks:d.rows.filter(r=>withIssues(r)&&r.source?.statement).length,
  recoveredWithoutSavedStatement:d.rows.filter(r=>withIssues(r)&&!r.source?.statement&&r.source?.manifest?.blocks?.length).length,
  incompleteSourceMarkers:captured.filter(r=>r.proposal.descriptionMayBeIncomplete).length,
  enumerableWithUnresolvedNumberedText:captured.filter(r=>withIssues(r)&&r.proposal.unparsed.some(t=>/#\s*\d|\bissues?\s*\d/iu.test(t))).length,
  unresolvedNamedPublicationBooks:captured.filter(r=>r.proposal.unparsed.some(t=>/\b(?:mini-series|miniseries|crossover|one-shot|sketchbook|prose story)\b|[\p{Lu}][^#:;]{1,50}:/u.test(t))).length,
  namedComponentObservations:d.rows.flatMap(r=>r.proposal.entries).filter(e=>e.unitType==='component').length};
};
const changes=[];let removed=0,added=0,comicChanged=0;
for(const row of b.rows){
 const previous=old.get(row.id);assert(previous,'Unexpected new saved record');
 const original=s=>JSON.stringify([s?.statement,s?.manifest?.blocks,s?.productDetailsEvidence,s?.sourceUrl,s?.extractorVersion]);
 assert.equal(original(row.source),original(previous.source),'Captured source changed: '+row.title);
 assert.equal(row.ownership,previous.ownership);assert.equal(row.reviewed,previous.reviewed);
 const existing=new Set(row.proposal.entries.map(key)),prior=new Set(previous.proposal.entries.map(key));
 const lost=previous.proposal.entries.filter(e=>!existing.has(key(e))),gained=row.proposal.entries.filter(e=>!prior.has(key(e)));
 removed+=lost.length;added+=gained.filter(comic).length;
 assert.equal(lost.length,0,'Lost identity/extent: '+row.title);
 if(signature(row.proposal)===signature(previous.proposal))continue;
 if(JSON.stringify(previous.proposal.entries)!==JSON.stringify(row.proposal.entries))comicChanged++;
 const observations=b.observations.filter(o=>o.recordRef===row.recordRef),reasons=[...new Set(row.proposal.contextualEvidence?.map(e=>e.kind)??[])];
 if(!previous.proposal.entries.length&&row.proposal.manifestEvidence)reasons.push(row.source?.statement?'stronger captured candidate':'natural collection discovery');
 changes.push({title:row.title,id:row.id,ownership:row.ownership,reviewed:row.reviewed,source:row.source,reasons,before:previous.proposal,after:row.proposal,
  added:gained,removed:lost,eligibleObservations:observations.length,provisional:observations.filter(o=>o.provisional).length,resolvedIdentities:[...new Set(observations.map(o=>JSON.stringify([o.entry.series,o.entry.run,o.entry.unitType,o.entry.completeness,o.provisional])))]});
}
const result={input:b.input,before:metric(a),after:metric(b),changedProposalBooks:changes.length,changedEntryListBooks:comicChanged,newComicObservations:added,lostIdentitiesOrExtents:removed,changes,protectedStateUnchanged:true};
const covered=d=>new Set(d.coverage.flatMap(g=>g.issues.filter(i=>!i.partial&&i.copies>0).map(i=>JSON.stringify([g.id,i.number]))));
const oldCovered=covered(a),newCovered=covered(b);result.coverageReconciliation={newFullIdentities:[...newCovered].filter(k=>!oldCovered.has(k)).length,lostFullIdentities:[...oldCovered].filter(k=>!newCovered.has(k)).length};
const out=await outputPath(process.argv[4]??'audit-artifacts/discovery-mixed/discovery-mixed-audit-2026-10-14.md');
await writeFile(out.replace(/\.md$/u,'.json'),JSON.stringify(result,null,2)+'\n');
const lines=['# Comic contents discovery, selection and mixed extent — 2026-10-14','',
 'Offline replay of '+b.input.filename+' ('+b.input.modifiedAt+'), '+b.input.providerRecords+' provider records. SHA-256: '+b.input.sha256+'. No provider acquisition or library writes. Baseline parser '+a.parserVersion+'; current parser '+b.parserVersion+'.','',
 '## Outcome','',
 changes.length+' books have changed proposal text/results; '+comicChanged+' have changed entry lists. '+added+' comic observations recovered; '+removed+' previous identity/extent pairs lost. Full-coverage identity reconciliation: '+result.coverageReconciliation.newFullIdentities+' newly covered, '+result.coverageReconciliation.lostFullIdentities+' previously covered lost. Existing source statements, captured blocks, Product Details evidence, effective ownership and review-presence checks are unchanged. Both replay runs assert that their disposable databases and backup bytes remain unchanged.','',
 '## Comparable counts','',
 '| Metric | Before | After | Change |','| --- | ---: | ---: | ---: |',
 ...Object.keys(result.before).map(k=>'| '+k+' | '+result.before[k]+' | '+result.after[k]+' | '+(result.after[k]-result.before[k])+' |'),' ',
 'Counts cover all saved book descriptions, including non-comic collections. Zero comic issues does not by itself mean extraction failed. Unresolved-numbered and named-text counts are review screens, not an accuracy score. Incomplete-source markers record retained terminal Read more evidence, not proof that later material exists. No workbook accuracy claims are made by this replay.','',
 '## Root causes and bounded corrections','',
 '- Doom Patrol: the full description was captured; no recognized containment/structural candidate covered “series with tales from.” That left an empty selected statement and the UI’s Contents not extracted state. The new bounded natural claim reaches the editor and coverage: ten subject issues full, six anthology host references partial. No description was downloaded or reconstructed. The optional source article affects subject-extent comparison only, not bibliographic identity matching.',
 '- Fables 3 and TMNT 5–6: old automatic weak selections remain saved evidence. An explicitly automatic empty interpretation may project one uniquely enumerable claim from the same block. Human-approved/unknown selections and manual reviews are not reranked. Different sources, competing enumerable claims, and substantive edited drafts do not receive this fallback. The displaced source remains reviewable.',
 '- Fables 15: an oversized 100th issue is regular #100. The prose/sketchbook follow-up remains separate source material, never a comic issue.',
 '- Fables 19: the selected story-feature grammar was unsupported. #114–124 becomes partial host references; its additional full-length story is retained without upgrading host completeness. The explicitly connected same-sentence “Stories from FABLES #124–129” prelude also contributes partial references. #124 occurs once, yielding sixteen unique partial identities (#114–129). No independent-claim union or extra acquisition is created.',
 '- Fables 20: a bounded deictic/award suffix prevented parsing. The source series/volume context now binds the explicit range and retains the attribution.',
 '- Fables 22: an explicit same-title issue/volume equivalence (“#150 is here! Doubling as the final volume…”) is different from an incidental marketing mention. The product series must agree with the literal collection-title subject. The current saved source supplies that assertion. [DC’s product page](https://www.dc.com/graphic-novels/fables-2002/fables-vol-22-farewell) and [publisher announcement](https://www.dc.com/blog/2015/07/22/bid-farewell-to-fables-as-the-series-comes-to-an-epic-conclusion) independently corroborate the equivalence. No bibliography is embedded in production code.',
 '- Other recovered grammar: labelled to-ranges; dated complete miniseries; explicitly named complete sagas corroborated by captured series context; bounded creator/review tails; collection arcs; explicit postposed series labels. Named one-shots in the bounded mixed list become parent-scoped Named work components, never invented issue #1 identities. Unsupported miniseries/crossovers remain unresolved.',
 '- TMNT 4/9/10/11 also benefit: the explicit postposed host takes precedence over the previously listed constituent. Dated annual evidence remains a publication date, not an issue number. A historical comparison interpreter had also assigned #76–84 to Universe; that wrong-host interpretation is now explicitly rejected by regression tests.','',
 '## Limitations and precision review','',
 'Full-length story evidence does not establish a full host issue for Fables #124. All Snow White hosts remain partial unless independently reviewed; the saved source does not supply an explicit full-host assertion. The description’s main #124–129 wording is preserved separately. No speculative trade-to-miniseries numbering is added for Hellboy. Named crossovers and unnamed or unnumbered miniseries do not gain invented ranges. Missing publication runs remain unresolved/provisional under the existing resolver. In particular, the newly recovered seven Universe observations in TMNT IDW Collection 9 remain provisional; they do not become full owned coverage merely because the host name parses. Existing ownership/access gates remain in force; inferred extraction is not verified issue ownership.','',
 'Human reviews, ownership corrections and merge decisions are neither rewritten nor used as a source import. Regression tests cover their precedence and backup round-trip. Existing full/partial entry identities are checked library-wide; the only nonidentical literal old labels in the entry replay differ in capitalization and retain identical content keys/extents. New entries were individually inspected against their captured statements; no page-wide numeric union or all-features-full rule was added.','',
 '## Per-book trace',''];
const summarize=p=>{const groups=new Map();for(const e of p.entries){const k=JSON.stringify([e.series,e.run,e.unitType,e.completeness]);const g=groups.get(k)??[];g.push(e.number);groups.set(k,g);}return [...groups].map(([k,n])=>JSON.parse(k).filter(Boolean).join(' · ')+': '+n.join(', ')).join('\n');};
for(const c of changes){lines.push('### '+c.title,'','Ownership: '+c.ownership+'; reviewed: '+c.reviewed+'. Reasons: '+(c.reasons.join(', ')||'bounded normalization / preserved unresolved text')+'. Eligible index observations: '+c.eligibleObservations+'; provisional: '+c.provisional+'.','',
 'Saved selected source:','', '> '+(c.source?.statement||'(No selected statement; see captured block.)').replace(/\n/gu,'\n> '),'',
 'Captured source blocks:','',...((c.source?.manifest?.blocks??[]).map(block=>'> '+block.text.replace(/\n/gu,'\n> '))),'',
 '| Candidate | Selected in saved interpretation | Rank | Raw source |','| --- | --- | --- | --- |',
 ...(c.source?.manifest?.candidates??[]).map((candidate,i)=>'| '+i+' | '+(i===c.source.manifest.selected?'yes':'')+' | '+JSON.stringify(candidate.rank)+' | '+candidate.raw.replace(/\|/gu,'\\|').replace(/\n/gu,' ')+' |'),' ',
 'Before: '+c.before.entries.length+' entries; '+c.before.outcome+'.','',summarize(c.before)||'(None.)','',
 'After: '+c.after.entries.length+' entries; '+c.after.outcome+'.','',summarize(c.after)||'(None.)','',
 'Review/parser input: '+(c.after.parseInput??''),'',
 'Projected source: '+(c.after.manifestEvidence??c.source?.statement??''),'',
 'Supporting connected claims: '+(c.after.supportingStatements??[]).join(' | '),'',
 'Unresolved material: '+(c.after.unparsed??[]).join(' | '),'',
 'Resolved coverage identities / extent / provisional:','',...c.resolvedIdentities.map(v=>'- '+v),'');}
await writeFile(out,lines.join('\n')+'\n');console.log(JSON.stringify({output:out,before:result.before,after:result.after,changedProposalBooks:changes.length,changedEntryListBooks:comicChanged,newComicObservations:added,lostIdentitiesOrExtents:removed},null,2));
