// Offline definition. Run before capture; never makes requests or edits backups.
import {readFile,writeFile} from 'node:fs/promises';
import {loadCorpus,hash} from './contents-parser-corpus.mjs';
const selections=[
 [4,'historical early clause','Book One: plot-only old snippet; family control for the later collected range.'],
 [6,'historical early clause','Book Two: same misleading plot clause; independently test later static evidence.'],
 [5,'historical early clause','Book Three: old ammunition clause; complete five-volume fidelity control.'],
 [3,'successful generation-4 control','Book Four: known static later Collects sentence; preserve #59–80 despite earlier arc names.'],
 [2,'successful generation-4 control','Book Five: known static later Collects sentence; preserve #81–100 and Read More evidence.'],
 [1264,'missing title delimiters','Generation-4 Dragon Blood joins three novel names; test actual DOM separators rather than inventing titles.'],
 [901,'joined paragraphs','Neverwhere has Back”.Published with neighboring prose; inspect paragraph and inline boundaries.'],
 [1482,'unnamed non-comic count','Wool claims five books without naming them; distinguish missing source from extraction loss.'],
 [370,'non-comic complete series','Code Breakers claims four novels; inspect whether a named list exists outside the old first clause.'],
 [1027,'non-comic omnibus early feature clause','Sherlock collection saved illustrations instead of constituents; test descriptive list structure.'],
 [697,'negative topical collection control','Investing lists topics rather than book titles; test whether source actually identifies works without manufacturing them.'],
 [1313,'negative author bibliography control','Midwich names neighboring novels in author context; preserve the distinction from contained works.'],
 [21,'successful non-comic excerpt control','Hunger includes one explicitly named excerpt; capture must preserve excerpt scope.'],
 [240,'generation-4 incomplete-marker partial','Knightfall One has Read more and Vengeance of Bane unresolved; test richer static evidence versus parser ambiguity.'],
 [241,'successful complex generation-4 control','Knightfall Two parses mixed series and disjoint ranges; detect boundary damage in successful evidence.'],
 [498,'generation-4 unresolved named supplement','Ex Machina Three has a named supplement and Read more; inspect whether source delimiters distinguish it.'],
 [626,'generation-4 ambiguous comma labels','Hellboy 1954 joins named arcs and ranges; inspect DOM structure before attributing parser failure.'],
 [629,'historical generic omnibus claim','Hellboy omnibus saved a chronological-order slogan; inspect later explicit constituent evidence.'],
 [1228,'historical short IDW snippet','IDW Eleven saved only one-shots/crossovers; compare complete static description and candidate selection.'],
 [1230,'mixed omnibus unresolved evidence','IDW Thirteen mixes issues, FCBD, named mini-series; test richer source and structural boundaries.'],
 [790,'long mixed omnibus control','King in Black has a 737-character manifest; test source budgets and unresolved one-shot labels.'],
 [254,'prose plus manifest','Road to No Man’s Land joins promotional prose to Reprinting; inspect block and sentence boundaries.'],
 [442,'credits and named excerpts','Dead Boy Detectives joins creator attribution, quoted excerpt and issues; test whether clean source reaches parser.'],
 [1097,'mixed named and dated strips','Star Wars Newspaper mixes specials, issue ranges and dated strips; source sufficiency control.'],
 [1225,'annual and named prelude','TMNT Opening Moves mixes quoted prelude, annual years and issues; inspect structural fidelity.'],
];
const corpus=await loadCorpus(process.argv[2]);
const audit=JSON.parse(await readFile(new URL('../docs/kindle-contents-parser-audit-v4.json',import.meta.url),'utf8'));
const rows=selections.map(([id,category,reason],index)=>{
 const row=corpus.rows.find(r=>r.auditId===id),a=audit.rows.find(r=>r.auditId===id);
 if(!row||!a)throw Error('Missing audit record '+id);
 return {ordinal:index+1,auditId:id,itemId:row.item.id,providerItemId:row.item.providerItemId,asin:new URL(row.item.metadata.detailUrl).pathname.split('/').at(-1),title:row.title,sourceUrl:row.item.metadata.detailUrl,extractorVersion:row.sourceGeneration,parserVersion:4,outcome:a.after.outcome,savedStatementLength:row.statement.length,proposalCount:a.after.entries.length,unresolved:a.after.unparsed,category,reason,statement:row.statement,parseInput:row.input};
});
if(rows.length!==25||new Set(rows.map(r=>r.sourceUrl)).size!==25)throw Error('Invalid sample');
const ledger={frozenAt:new Date().toISOString(),sourceHash:corpus.sourceHash,parserAuditHash:hash(await readFile(new URL('../docs/kindle-contents-parser-audit-v4.json',import.meta.url))),populationHash:hash(rows.map(r=>r.sourceUrl).join('\n')),planned:25,requestsMade:0,definition:'Purposive diverse source-quality sample, not a representative prevalence estimate.',rows};
await writeFile(new URL('../docs/kindle-source-capture-sample.json',import.meta.url),JSON.stringify(ledger,null,2)+'\n');
const cell=s=>String(s).replace(/\|/gu,'\\|').replace(/\s+/gu,' ');
await writeFile(new URL('../docs/kindle-source-capture-sample.md',import.meta.url),`# Frozen Kindle source-capture sample\n\nFrozen ${ledger.frozenAt}, before any network request. **25 distinct product URLs**, parser v4 throughout. This purposive sample cannot estimate whole-library prevalence. Exact URL population SHA-256: \`${ledger.populationHash}\`. Source backup SHA-256: \`${ledger.sourceHash}\`. JSON contains exact old evidence and parser input.\n\n| # / audit | ASIN | Title | Source generation / parser | Outcome | Saved chars / proposals | Unresolved evidence | Category and reason |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`+rows.map(r=>`| ${r.ordinal} / ${r.auditId} | ${r.asin} | ${cell(r.title)} | ${r.extractorVersion} / 4 | ${r.outcome} | ${r.savedStatementLength} / ${r.proposalCount} | ${cell(r.unresolved.join('; ')||'None')} | ${cell(r.category+': '+r.reason)} |`).join('\n')+'\n');
console.log(JSON.stringify({planned:25,populationHash:ledger.populationHash,requestsMade:0}));
