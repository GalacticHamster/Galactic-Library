import {MANIFEST_INTERPRETATION_VERSION,manifestReviewProposal} from '../src/lib/kindle-manifest.js';
import {contentsParseState} from '../src/lib/kindle-contents.js';
import {contentsStatement} from '../src/lib/contents.js';
import {enrichmentWorkbenchRows} from '../src/lib/enrichment-workbench.js';

// Preserve the captured selection and contextual input, without private IDs.
export function precisionRecord(c){
 const source={statement:c.statement,manifest:{interpretationVersion:MANIFEST_INTERPRETATION_VERSION,title:c.title,blocks:[{selector:'#description',text:c.statement}],selected:0,secondary:[],candidates:[{block:0,start:0,end:c.statement.length,raw:c.statement,parserInput:c.parserInput,binding:c.binding}]}};
 return {id:'fixture',recordRef:'fixture',provider:'kindle',mediaType:'book',title:c.title,metadata:{enrichment:{kindleProductComicContents:source}}};
}
export function verifySourcePaths(c,assert){
 const record=precisionRecord(c),source=record.metadata.enrichment.kindleProductComicContents,before=JSON.stringify(record);
 const raw=manifestReviewProposal(source,c.title),compact=manifestReviewProposal(source,c.title,contentsStatement(record)),status=contentsParseState(record);
 assert(JSON.stringify(raw.entries)===JSON.stringify(c.expected),'Captured-source entries changed: '+c.title);
 assert(JSON.stringify(compact)===JSON.stringify(raw),'Whitespace-only text lost source context: '+c.title);
 assert(status.parseInput===raw.parseInput&&status.parseOutcome===raw.outcome,'Scan/status context differs: '+c.title);
 const rows=enrichmentWorkbenchRows({providerItems:{fixture:record},contentReviews:{},enrichmentReviews:{},enrichmentHistory:{},canonicalItems:{}},{includeMissing:false});
 assert(rows.length===1&&rows[0].reason.startsWith(raw.unparsed.length?'Partially parsed proposal':'Parsed proposal'),'Workbench misclassifies source: '+c.title);
 assert(JSON.stringify(record)===before,'Parsing modified captured evidence');
 return {record,proposal:raw};
}
