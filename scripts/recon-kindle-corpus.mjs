import {corpusReviewLabels} from './contents-parser-corpus.mjs';
// Audit-only offline counts/probes. Does not write library data or make requests.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {proposeContentsForReview} from '../src/lib/contents.js';
import {supportedKindleContentsBook} from '../src/lib/kindle-contents.js';
const [backupPath,controlPath]=process.argv.slice(2);
if(!backupPath||!controlPath)throw Error('Usage: node scripts/recon-kindle-corpus.mjs BACKUP_JSON CONTROL_EVIDENCE_JSON');
const bytes=await readFile(backupPath),sourceHash=createHash('sha256').update(bytes).digest('hex');
const annotations=await corpusReviewLabels();
if(sourceHash!==annotations.sourceHash)throw Error('Backup must match the audited SHA-256 before applying ordinal annotations.');
const labels=annotations.labels.map(r=>({id:r.auditId,category:r.legacyCategory,trigger:r.trigger,before:r.before,beforeEntries:r.beforeEntries}));
const db=JSON.parse(bytes.toString()).database,eligible=Object.values(db.providerItems).filter(supportedKindleContentsBook);
const items=eligible.filter(i=>i.metadata?.enrichment?.kindleProductComicContents?.statement?.trim()).sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
if(items.length!==1520||labels.length!==1520)throw Error('Audit corpus changed');
const trigger=/\b(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b/giu;
const rows=items.map((item,n)=>{const statement=item.metadata.enrichment.kindleProductComicContents.statement;return {...labels[n],key:item.id,statement,proposal:proposeContentsForReview(statement,item.title),hits:[...statement.matchAll(trigger)].map(m=>({verb:m[0],index:m.index}))};});
const useful=r=>['A','B','C'].includes(r.category),noProposals=r=>!r.proposal.entries.length;
const marker=rows.filter(r=>/\s+Read more\s*$/iu.test(r.statement));
const falseRows=rows.filter(r=>r.category==='D');
const unresolvedOriginalFailures=rows.filter(r=>useful(r)&&r.before==='failed'&&noProposals(r));
const laterCollect=rows.filter(r=>r.hits.some((h,n)=>n>0&&/^collect/iu.test(h.verb)));
const distinctLaterCollect=laterCollect.filter(r=>!/^collect/iu.test(r.hits[0].verb));
const strict=/\b(?:omnibus|compendium|box(?:ed)?[ -]?set|antholog(?:y|ies)|complete\s+(?:collection|series|novels|works|stories)|books?\s*(?:\d+\s*[-–—&]\s*\d+|one\s+and\s+two)|(?:story|stories|novel|tale|trilogy)\s+collection|epic collection|masterworks)\b/iu;
const broad=/\b(?:collection|collected|trilogy|tales|short stories)\b/iu;
const negatives=eligible.filter(i=>['no-statement','unavailable'].includes(i.metadata?.enrichment?.kindleProductComicContents?.availability));
const strictNegative=negatives.filter(i=>strict.test(i.title)),broadNegative=negatives.filter(i=>strict.test(i.title)||broad.test(i.title));
const controls=rows.filter(r=>/^100 Bullets: Book (Four|Five)$/u.test(items[rows.indexOf(r)].title));
const union=(...sets)=>new Set(sets.flat().map(r=>r.key??r.id));
const pilot=union(controls,marker),expanded=union(controls,marker,falseRows,unresolvedOriginalFailures,strictNegative);
const count=(array,fn)=>array.reduce((out,r)=>(out[fn(r)]=(out[fn(r)]??0)+1,out),{});
const sources={current:await readFile(new URL('../src/providers/kindle.js',import.meta.url),'utf8'),historical:execFileSync('git',['show','092bce4:src/providers/kindle.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8',windowsHide:true})};
const adapters=Object.fromEntries(Object.entries(sources).map(([version,source])=>{const context=vm.createContext({});vm.runInContext(source,context);return [version,context.GalacticKindle];}));
const evidence=JSON.parse(await readFile(controlPath,'utf8'));
const probes=evidence.controls.map(c=>{const text=c.glStyleFetch.regions.find(r=>r.selector==='#bookDescription_feature_div').text;
 return {book:c.book,source:'Observed anonymous GL-options static fetch description',fullTextLength:text.length,historicalSelected:adapters.historical.explicitContentsStatement(text),currentSelected:adapters.current.explicitContentsStatement(text),
  independentTriggerProbes:[...text.matchAll(trigger)].map(m=>{const statement=adapters.current.explicitContentsStatement(text.slice(m.index)),proposal=proposeContentsForReview(statement,'100 Bullets: Book '+c.book);return {trigger:m[0],statement,quality:proposal.quality,outcome:proposal.outcome,entries:proposal.entries.length};})};
});
const candidateExamples=['Includes Wool, Shift, and Dust','Contains Epic Books 1-3','Includes writers Jane Doe and John Smith','containing an untraceable gun and 100 rounds of ammunition','Includes wireless delivery','Collects SERIES #1-6 and material from OTHER SERIES #7','Collects SERIES #1-6','Includes material from OTHER SERIES #7'].map(statement=>{const p=proposeContentsForReview(statement,'Example Collection');return {statement,quality:p.quality,outcome:p.outcome,entries:p.entries.length,extents:count(p.entries,e=>e.completeness)};});
console.log(JSON.stringify({sourceHash,networkCalls:0,eligibility:eligible.length,statements:rows.length,
 populations:{false:330,falseAfterQuality:count(falseRows,r=>r.proposal.outcome),originalUsefulFailures:308,originalUsefulFailuresStillWithoutProposals:unresolvedOriginalFailures.length,allUsefulWithoutProposals:rows.filter(r=>useful(r)&&noProposals(r)).length,allUsefulPartial:rows.filter(r=>useful(r)&&r.proposal.outcome==='partial').length,
  terminalMarker:{count:marker.length,classes:count(marker,r=>r.category),outcomes:count(marker,r=>r.proposal.outcome)},includeContain:{count:rows.filter(r=>['include','contain'].includes(r.trigger)).length,classes:count(rows.filter(r=>['include','contain'].includes(r.trigger)),r=>r.category)},multipleTriggers:rows.filter(r=>r.hits.length>1).length,laterCollect:{count:laterCollect.length,ids:laterCollect.map(r=>r.id),distinctWeakLeadCount:distinctLaterCollect.length,distinctWeakLeadIds:distinctLaterCollect.map(r=>r.id)},negativeOutcomes:count(negatives,i=>i.metadata.enrichment.kindleProductComicContents.availability),strictNegative:count(strictNegative,i=>i.metadata.enrichment.kindleProductComicContents.availability),broadNegative:count(broadNegative,i=>i.metadata.enrichment.kindleProductComicContents.availability)},
 targeted:{controls:controls.length,pilot:pilot.size,pilotPercent:100*pilot.size/eligible.length,expanded:expanded.size,expandedPercent:100*expanded.size/eligible.length,broadNegativesExpanded:union(controls,marker,falseRows,unresolvedOriginalFailures,broadNegative).size,overlaps:{markerAndFalse:marker.filter(r=>r.category==='D').length,markerAndOriginalUnresolved:marker.filter(r=>useful(r)&&r.before==='failed'&&noProposals(r)).length}},probes,candidateExamples},null,2));
