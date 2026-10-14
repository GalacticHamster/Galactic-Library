import {groupContents} from './contents-display.js';
import {formatDate} from './formatters.js';
const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
export function publicationEvidence(resolutions=[]){
  const details=text('details','');details.className='contents-publication-evidence';details.append(text('summary','How these publications were identified'));
  details.append(text('p','The description identifies what is included. The references below supply publication names, dates and issue numbers; they are not purchase evidence.'));
  const list=text('ul','');for(const r of resolutions){const row=text('li',r.title+' ('+r.run+')'+(r.enumeration==='unresolved'?' — '+r.reason:'. '));for(const url of r.sources??[]){if(!/^https:\/\//u.test(url))continue;const link=text('a','Publication reference');link.href=url;link.target='_blank';link.rel='noopener noreferrer';row.append(link,' ');}list.append(row);}details.append(list);return details;
}

// Display an existing proposal. This must not parse, select, combine or save evidence.
export function createContentsInterpretation({statement,proposal,reviewed=false,capturedAt,technical}={}){
  const root=text('div','');root.className='contents-interpretation';
  root.append(text('h4','Original description'),text('blockquote',statement||'No description statement is available.'));
  for(const claim of proposal?.supportingStatements??[])root.append(text('blockquote',claim));
  root.append(text('h4','Suggested included works'));
  const list=text('ul','');for(const group of groupContents(proposal?.entries??[]))list.append(text('li',group.text));
  if(list.children.length)root.append(list);else root.append(text('p','No included works could be identified from this statement.'));
  for(const range of proposal?.provisionalRanges??[])root.append(text('p','Issue numbers found: #'+range.first+(range.last!==range.first?'–'+range.last:'')+'. The series is unresolved; these numbers do not contribute to owned coverage. Specify the series before saving.'));
  if(proposal?.contextualEvidence?.some(e=>e.kind==='complete-story-not-host'))root.append(text('p','A complete story is listed, but that does not establish that its entire source issue is included. The issue remains partial.'));
  root.append(text('p','From the description'+(capturedAt?' captured '+formatDate(capturedAt):'')+'. '+(reviewed?'A separate human review is saved; these are the description suggestions.':'Not reviewed. Check names, numbers, series version, language and full works versus excerpts before saving.')));
  if(proposal?.unparsed?.length)root.append(text('p','Still to check: '+proposal.unparsed.join('; ')));
  if(proposal?.publicationResolutions?.length)root.append(publicationEvidence(proposal.publicationResolutions));
  if(proposal?.descriptionMayBeIncomplete)root.append(text('p','The captured description may be incomplete; later included material may be missing.'));
  root.append(text('small','Identifying every entry in this statement does not establish that it lists everything in the book.'));
  const details=text('details','');details.className='contents-technical-details';details.append(text('summary','Technical details'));let built=false;
  details.addEventListener('toggle',()=>{if(!details.open||built)return;built=true;details.append(text('pre',JSON.stringify({outcome:proposal?.outcome,qualityReason:proposal?.qualityReason,binding:proposal?.parseBinding,parserInput:proposal?.parseInput,...technical},null,2)));});root.append(details);
  return root;
}
