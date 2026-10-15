import {reviewedContents} from './contents.js';
import {scopedEntryKeys,sameCoverageBasis} from './scoped-coverage.js';
import {includedPublicationTitle} from './coverage-disposition.js';
import {collectionContents,libraryCoverageIndex,coverageLanguage} from './inferred-coverage.js';
import {identityKey,identityEvidence} from './identity.js';
import {contentKey,validateContents,validateContentReview,contentsSourceBaseline,contentsStatement} from './contents.js';
import {publicationContext,validatePublicationReferences} from './comic-publications.js';
import {PUBLICATION_REFERENCES,COVERAGE_RESOLUTION_REFERENCES} from './publication-reference-data.js';

const facts=validatePublicationReferences([...PUBLICATION_REFERENCES,...COVERAGE_RESOLUTION_REFERENCES]);
const member=e=>JSON.stringify([identityKey(e.series),identityKey(e.run),e.unitType,identityKey(e.language)]);
const scope=e=>JSON.stringify([identityKey(e.series),e.unitType,coverageLanguage(e.language)]);
const targetId=t=>member(t);
const recordFor=(database,ref)=>Object.values(database.providerItems??{}).find(r=>r.recordRef===ref);
const scoped=(p,r)=>{
 const c=publicationContext(r.metadata?.enrichment?.kindleProductComicContents),pubs=new Set(c.publishers.map(identityKey)),families=new Set(c.contexts.map(identityKey));
 return pubs.size===1&&p.publishers.some(v=>pubs.has(identityKey(v)))&&(!p.contexts.length||families.size===1&&p.contexts.some(v=>families.has(identityKey(v))));
};
export function resolutionStamp(record,database){
 const p=collectionContents(record,database);
 return JSON.stringify([record.id,record.recordRef,record.profileId,record.title,p.entries,contentsSourceBaseline(record),publicationContext(record.metadata?.enrichment?.kindleProductComicContents),database.contentReviews?.[record.id],database.ownershipReviews?.[record.recordRef],database.ownershipPolicy,record.ownership,record.metadata?.series,record.metadata?.edition,record.metadata?.language]);
}
export function applyCoverageReferenceDecision(database,request,{now=new Date().toISOString()}={}){
 const record=recordFor(database,request?.recordRef);
 if(!record||request.expected!==resolutionStamp(record,database))throw Error('Saved source or reviews changed. Reopen this collection before changing a reference.');
 const old=database.contentReviews?.[record.id],decisions=old?.referenceDecisions??[];
 if(!['incorrect-extraction','not-included','restore'].includes(request.reason))throw Error('Choose Incorrect extraction, Not included contents, or Restore.');
 const reference=libraryCoverageIndex(database,{includeExcerpts:true}).dispositions.find(r=>r.recordRef===record.recordRef)?.references.find(r=>r.key===request.key);
 const existing=decisions.find(d=>d.key===request.key);
 if(request.reason==='restore'?!existing:!reference||reference.ignored)throw Error('This reference is no longer available. Reopen the collection.');
 const nextDecisions=decisions.filter(d=>d.key!==request.key);
 if(request.reason!=='restore')nextDecisions.push({key:reference.key,fragment:reference.fragment,reason:request.reason,decidedAt:now});
 const reviews={...database.contentReviews};
 if(!nextDecisions.length&&old?.referenceOnly&&!old.coverageResolutions?.length)delete reviews[record.id];
 else reviews[record.id]=validateContentReview({...old,...(!old?{referenceOnly:true,entries:[],statement:'',source:'coverage-reference-decisions',verifiedAt:null}:{}),referenceDecisions:nextDecisions});
 return {...database,contentReviews:reviews};
}
export function resolutionCandidates(collection,dispositions,database,ids){
 const record=recordFor(database,collection.recordRef);if(!record)return [];
 const selected=collection.observations.filter(o=>ids.includes(o.id)),reference=collection.references.find((r,i)=>ids.includes('reference:'+i));
 if(reference&&(reference.ignored||reference.resolved||!reference.actionable))return [];
 if(!reference&&(!selected.length||selected.some(o=>o.origin!=='contents'||!o.parsed)||new Set(selected.map(o=>scope(o.resolved))).size!==1))return [];
 const e=selected[0]?.resolved,choices=new Map();
 if(!reference)for(const row of dispositions)for(const o of row.observations){
  const t=o.resolved;if(!o.parsed||!t.run||scope(t)!==scope(e))continue;
  const target={series:t.series,run:t.run,unitType:t.unitType,language:coverageLanguage(t.language)},id=targetId(target);
  if(!choices.has(id))choices.set(id,{...target,id,label:t.series+' ('+t.run+') — '+t.unitType,evidence:'Existing saved publication identity. Check it against this collection’s source.',suggested:false,sources:[]});
  const anchor=database.providerItems[row.id],sameFamily=family(record)&&anchor&&family(record)===family(anchor),review=reviewedContents(database.contentReviews?.[row.id]);
  if(sameFamily&&o.extracted.run===t.run&&!o.protectedMerge&&!review?.source?.startsWith('coverage-resolution')){
   const url=review?.sourceUrl||anchor.metadata?.enrichment?.kindleProductComicContents?.sourceUrl;
   choices.set(id,{...target,id,label:t.series+' ('+t.run+') — '+t.unitType,evidence:'The saved contents of “'+row.title+'” explicitly identify this run within the same captured publisher and collection family.',suggested:true,referenceId:'local:'+id,sources:url?[url]:[]});
  }
 }
 for(const p of facts){
  if(!scoped(p,record))continue;
  if(reference){
   const named=includedPublicationTitle(reference.fragment,collectionContents(record,database,{ignoreScoped:true}));
   if(reference.code!=='named-publication-unresolved'||(!named&&!/\bone-shots?\b/iu.test(reference.fragment))||/\b(?:selected|material|excerpts?|portions?|story|stories|preview)\b/iu.test(reference.fragment))continue;
   if(named&&(identityKey(named.title)!==identityKey(p.title)&&!p.aliases.some(a=>identityKey(a)===identityKey(named.title))||named.run!==p.run))continue;
   if(p.kind!=='one-shot'||!p.complete||p.numbers.length!==1||!p.numbers.every(n=>n==='unnumbered'||/^\d+$/u.test(n)))continue;
   const text=identityKey(reference.fragment);if(![p.title,...p.aliases].some(name=>(' '+text+' ').includes(' '+identityKey(name)+' ')))continue;
  }else if(p.kind!=='ongoing'||identityKey(p.title)!==identityKey(e.series)||e.unitType!=='issue'||!selected.every(o=>p.numbers.includes(o.resolved.number)))continue;
  const target={series:p.title,run:p.run,unitType:reference?(p.numbers[0]==='unnumbered'?'special':'issue'):e.unitType,language:coverageLanguage(e?.language)},id=targetId(target);
  choices.set(id,{...target,id,label:p.label??p.title+' ('+p.run+') — '+target.unitType,evidence:p.note??'Captured publisher and collection family agree with this cited publication reference.',sources:p.sources,suggested:true,referenceId:p.id,...(reference?{number:p.numbers[0]}:{})});
 }
 return [...choices.values()].sort((a,b)=>Number(b.suggested)-Number(a.suggested)||a.label.localeCompare(b.label,undefined,{numeric:true}));
}
// User-defined runs use the same series/run/type/language fields as Contents.
// They are drafts carried by a scoped review request, never separate records.
export function newResolutionPublication(collection,ids,definition,dispositions,database){
 const selected=collection.observations.filter(o=>ids.includes(o.id));
 if(!selected.length||selected.length!==ids.length||selected.some(o=>!o.parsed||o.origin!=='contents'||o.protectedMerge)||new Set(selected.map(o=>scope(o.resolved))).size!==1)throw Error('Choose parsed contents from one publication. Named or unnumbered references needing more information can be entered in the contents editor.');
 if(!definition||typeof definition!=='object'||Array.isArray(definition)||Object.keys(definition).some(k=>!['series','startYear','endYear'].includes(k)))throw Error('Enter a series title and publication years.');
 const series=typeof definition.series==='string'?definition.series.trim():'',start=String(definition.startYear??'').trim(),end=String(definition.endYear??'').trim();
 if(!/^[1-9]\d{3}$/u.test(start)||end&&!/^[1-9]\d{3}$/u.test(end))throw Error('Enter a four-digit starting year and, optionally, a four-digit ending year.');
 if(end&&Number(end)<Number(start))throw Error('The ending year must not be earlier than the starting year.');
 if(!series||series.length>500)throw Error('Enter a series title of 1-500 characters.');
 if(/\(\s*\d{4}(?:\s*[-\u2013\u2014]\s*\d{0,4})?\s*\)\s*$/u.test(series))throw Error('Enter the series title without its year suffix; use the year fields below.');
 const source=selected[0].resolved,run=end&&end!==start?start+'-'+end:start;
 const entry=validateContents([{...source,series,run,language:coverageLanguage(source.language)}])[0],target={series:entry.series,run:entry.run,unitType:entry.unitType,language:entry.language};
 const existing=new Map(resolutionCandidates(collection,dispositions,database,ids).map(t=>[t.id,t]));
 for(const row of dispositions)for(const o of row.observations){const t=o.resolved;if(!o.parsed||!t.run||identityKey(t.series)!==identityKey(target.series)||t.unitType!==target.unitType||coverageLanguage(t.language)!==target.language)continue;const candidate={series:t.series,run:t.run,unitType:t.unitType,language:coverageLanguage(t.language)},id=targetId(candidate);if(!existing.has(id))existing.set(id,{...candidate,id,label:t.series+' ('+t.run+') - '+t.unitType,evidence:'Existing saved publication identity.',sources:[],suggested:false});}
 const same=[...existing.values()].filter(t=>identityKey(t.series)===identityKey(target.series)&&t.unitType===target.unitType&&t.language===target.language),equivalent=[];
 for(const known of same){
  const years=/^(\d{4})(?:\s*[-\u2013\u2014]\s*(\d{4})?)?$/u.exec(known.run.trim());
  if(!years){if(new RegExp('\\b'+start+'\\b','u').test(known.run))throw Error('An existing run has additional publication-volume or numbering information for this year. Select that definition or inspect it in the contents editor.');continue;}
  if(years[1]!==start)continue;
  if(years[2]&&end&&years[2]!==end)throw Error('An existing run starts in '+start+' but has a different ending year. Select or correct the existing definition instead of creating a conflicting run.');
  equivalent.push(known);
 }
 if(equivalent.length>1)throw Error('Several existing definitions match this starting year. Select the correct existing publication rather than creating another.');
 if(equivalent.length===1)return {...equivalent[0],newPublication:{series:target.series,startYear:start,endYear:end},evidence:'This run is already saved. Using the existing publication; no new definition will be added.'};
 return {...target,id:targetId(target),label:target.series+' ('+target.run+') - '+target.unitType+' - new user-defined run',evidence:'New user-defined publication. Preview and save to confirm only the selected contents; no publication is saved yet.',sources:[],suggested:false,newPublication:{series:target.series,startYear:start,endYear:end}};
}
function requestTarget(row,request,dispositions,database){
 const target=request.newPublication?newResolutionPublication(row,request.observationIds,request.newPublication,dispositions,database):resolutionCandidates(row,dispositions,database,request.observationIds).find(t=>t.id===request.targetId);
 if(!target||target.id!==request.targetId)throw Error('The selected publication identity is no longer available or an equivalent definition changed. Reload the preview.');return target;
}
function family(record){
 const c=publicationContext(record.metadata?.enrichment?.kindleProductComicContents);
 if(new Set(c.publishers.map(identityKey)).size!==1||new Set(c.contexts.map(identityKey)).size!==1)return null;
 return JSON.stringify([record.provider,record.profileId,c.publishers.map(identityKey).sort(),c.contexts.map(identityKey).sort(),identityEvidence(record).edition,coverageLanguage(record.metadata?.language)]);
}
export function compatibleResolutionCollections(collection,ids,target,dispositions,database){
 const source=recordFor(database,collection.recordRef),selected=collection.observations.filter(o=>ids.includes(o.id)),key=source&&family(source);
 if(!key||!selected.length||selected.some(o=>o.protectedMerge)||reviewedContents(database.contentReviews?.[source.id]))return [];
 const scopes=new Set(selected.map(o=>scope(o.resolved)));if(scopes.size!==1)return [];
 const results=[];
 for(const row of dispositions){
  const record=recordFor(database,row.recordRef);
  if(row.recordRef===collection.recordRef||!record||family(record)!==key||!row.accessEligible||row.rejected||reviewedContents(database.contentReviews?.[record.id]))continue;
  const candidates=row.observations.filter(o=>o.origin==='contents'&&o.parsed&&scopes.has(scope(o.resolved)));
  if(!candidates.length||candidates.some(o=>o.protectedMerge||o.resolved.run&&identityKey(o.resolved.run)!==identityKey(target.run)||o.reasons.some(r=>['run-conflict','containment-unresolved'].includes(r.code))))continue;
  const unresolved=candidates.filter(o=>o.provisional&&!o.resolved.run);if(!unresolved.length)continue;
  const other=resolutionCandidates(row,dispositions,database,unresolved.map(o=>o.id)).find(c=>c.id===target.id&&c.suggested===target.suggested);
  // Related books require the same cited suggestion, not just similar names.
  if(!other?.suggested||other.referenceId!==target.referenceId)continue;
  results.push({collection:row,ids:unresolved.map(o=>o.id),target:other});
 }
 return results;
}
export function coverageResolutionRequest(collection,ids,target,database){
 const record=recordFor(database,collection.recordRef);if(!record)throw Error('This collection is no longer saved.');
 return {recordRef:collection.recordRef,observationIds:[...ids],targetId:target.id,...(target.newPublication?{newPublication:target.newPublication}:{}),expected:resolutionStamp(record,database)};
}
export function previewCoverageResolutions(database,requests,{merges={},dispositions,now=new Date().toISOString()}={}){
 if(!Array.isArray(requests)||!requests.length||requests.length>50||new Set(requests.map(r=>r.recordRef)).size!==requests.length)throw Error('Select 1–50 distinct saved collections.');
 dispositions??=libraryCoverageIndex(database,{includeExcerpts:true,runInferenceExclusions:Object.values(merges).flatMap(m=>m.members??[])}).dispositions;
 const next={...database,contentReviews:{...database.contentReviews}},changes=[];
 for(const request of requests){
  const record=recordFor(database,request.recordRef),row=dispositions.find(r=>r.recordRef===request.recordRef);
  if(!record||!row||record.mediaType!=='book'||row.rejected)throw Error('This collection is unavailable or its contents were explicitly rejected. Use the contents editor.');
  if(request.expected!==resolutionStamp(record,database))throw Error('Saved contents or access changed. Reload the coverage preview before saving.');
  const ids=request.observationIds;if(!Array.isArray(ids)||!ids.length||ids.length>2000||new Set(ids).size!==ids.length)throw Error('Choose distinct contents observations.');
  const selected=row.observations.filter(o=>ids.includes(o.id)),reference=row.references.find((r,i)=>ids.includes('reference:'+i));
  if(selected.some(o=>o.protectedMerge)||selected.length+(reference?1:0)!==ids.length)throw Error('These observations are unavailable or controlled by a manual series merge. Use the contents editor to inspect them.');
  if(selected.some(o=>o.reasons.some(r=>r.code==='containment-unresolved')))throw Error('The source does not establish included contents. Confirm the issue and extent in the contents editor.');
  // A saved review has broader semantics than an inferred proposal. Do not let
  // a small run correction implicitly confirm another unresolved publication
  // or discard a source-only run inference elsewhere in a mixed collection.
  const limited=!reviewedContents(database.contentReviews?.[record.id])||database.contentReviews[record.id].source==='coverage-resolution';
  const needsScoped=Boolean(request.newPublication)||Boolean(reviewedContents(database.contentReviews?.[record.id])&&database.contentReviews[record.id].source!=='coverage-resolution')||database.contentReviews?.[record.id]?.coverageResolutions?.length||limited&&row.observations.some(o=>o.origin==='contents'&&!ids.includes(o.id)&&(o.reasons.some(r=>['publication-unresolved','annual-run-unresolved','containment-unresolved'].includes(r.code))||o.extracted.run!==o.resolved.run||o.extracted.series!==o.resolved.series));
  const target=requestTarget(row,request,dispositions,database);
  if(needsScoped){
   const raw=database.contentReviews?.[record.id],base=collectionContents(record,database,{ignoreScoped:true});
   if(raw?.coverageResolutions?.length&&!sameCoverageBasis(record,raw))throw Error('The source changed after an earlier scoped correction. Review the changed contents before adding another correction.');
   const patches=new Map((raw?.coverageResolutions??[]).map(p=>[p.key,p])),entryKeys=scopedEntryKeys(base.entries);
   for(const observation of selected){
    const referenceKey=observation.resolved.scopedResolution?.referenceKey,key=observation.resolved.scopedResolution?.key??entryKeys[observation.entryIndex];
    patches.set(key,{key,entry:{...observation.resolved,series:target.series,run:target.run,language:target.language},verifiedAt:now,...(referenceKey?{referenceKey}:{})});
   }
   if(reference){const key='reference:'+reference.key;patches.set(key,{key,referenceKey:reference.key,entry:{series:target.series,run:target.run,unitType:target.unitType,number:target.number,language:target.language,completeness:'full'},verifiedAt:now});}
   next.contentReviews[record.id]=validateContentReview({...raw,...(!raw?{referenceOnly:true,entries:[],statement:'',source:'coverage-resolution-scoped',verifiedAt:null}:{}),coverageResolutions:[...patches.values()],coverageResolutionBaseline:contentsSourceBaseline(record)});
   changes.push({recordRef:record.recordRef,title:record.title,selected:ids.length,before:selected.map(o=>o.resolved),after:collectionContents(record,next).entries,reference:reference?.fragment,target});continue;
  }
  const contents=collectionContents(record,database),entries=contents.entries.map((e,i)=>selected.some(o=>o.entryIndex===i)?{...e,series:target.series,run:target.run,language:target.language}:e);
  if(reference)entries.push({series:target.series,run:target.run,unitType:target.unitType,number:target.number,language:target.language,completeness:'full'});
  const raw=database.contentReviews?.[record.id],old=reviewedContents(raw),review=validateContentReview({...old,referenceDecisions:raw?.referenceDecisions,entries,statement:old?.statement||row.statement||contentsStatement(record),sourceUrl:old?.sourceUrl||record.metadata?.enrichment?.kindleProductComicContents?.sourceUrl||'',source:old&&old.source!=='coverage-resolution'?'coverage-resolution-reviewed':'coverage-resolution',sourceBaseline:contentsSourceBaseline(record),verifiedAt:now});
  next.contentReviews[record.id]=review;changes.push({recordRef:record.recordRef,title:record.title,selected:ids.length,before:selected.map(o=>o.resolved),after:review.entries,reference:reference?.fragment,target});
 }
 return {database:next,changes};
}
export function applyCoverageResolutions(database,request,{merges={},now}={}){
  if(request?.confirmed!==true)throw Error('Confirm the coverage changes before saving.');
  if(request.mergeStamp!==JSON.stringify(merges))throw Error('Series merge preferences changed. Reload the preview.');
 if(!Array.isArray(request.targets)||!request.targets.length||request.targets.length>50)throw Error('Select 1–50 distinct saved collections.');
 for(const target of request.targets){const record=recordFor(database,target.recordRef);if(!record||target.expected!==resolutionStamp(record,database))throw Error('Saved contents or access changed. Reload the coverage preview before saving.');}
 const dispositions=libraryCoverageIndex(database,{includeExcerpts:true,runInferenceExclusions:Object.values(merges).flatMap(m=>m.members??[])}).dispositions;
 if(request.targets?.length>1){
  const first=request.targets[0],row=dispositions.find(r=>r.recordRef===first.recordRef),target=row&&requestTarget(row,first,dispositions,database);
  const compatible=row&&target?compatibleResolutionCollections(row,first.observationIds,target,dispositions,database):[];
  for(const other of request.targets.slice(1))if(!compatible.some(c=>c.collection.recordRef===other.recordRef&&c.target.id===other.targetId&&JSON.stringify(c.ids)===JSON.stringify(other.observationIds)))throw Error('Bulk resolution includes a different collection family, account, explicit run, review or manual merge. Resolve it separately.');
 }
 return previewCoverageResolutions(database,request.targets,{merges,dispositions,now});
}
