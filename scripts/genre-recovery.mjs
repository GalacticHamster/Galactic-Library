import {createHash} from 'node:crypto';
import {parseBackup} from '../src/lib/storage.js';
import {validateEnrichment} from '../src/lib/metadata-validation.js';
import {libraryBroadGenreValues,normalizedLibraryCategories} from '../src/lib/genre-hints.js';
export const stable=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));return value;}
export const fingerprint=value=>createHash('sha256').update(stable(value)).digest('hex');
const kinds={googleBooks:'categories',googleBooksGenreHint:'categories',openLibrary:'subjects'};
const key=record=>record?.provider&&typeof record.providerItemId==='string'&&record.providerItemId.trim()?record.provider+'\0'+record.providerItemId:null;
function index(records){const found=new Map();for(const record of records){const id=key(record);if(id)found.set(id,[...(found.get(id)??[]),record]);}return found;}
const labels=(record,kind)=>record.metadata?.enrichment?.[kind]?.[kinds[kind]]??[];
function counts(records){const raw={},broad={};for(const record of records){for(const label of new Set(Object.keys(kinds).flatMap(kind=>labels(record,kind))))raw[label]=(raw[label]??0)+1;for(const label of libraryBroadGenreValues(record))broad[label]=(broad[label]??0)+1;}return {raw,broad};}
function reviewedConflict(record,categories){
 const local=record.metadata?.enrichment?.localMetadata;if(!local?.approved||!local.categories?.length)return false;
 const manual=local.categories.flatMap(normalizedLibraryCategories),proposed=categories.flatMap(normalizedLibraryCategories);
 // Different subjects can coexist. Explicitly reviewed prose/novel format is
 // incompatible with historic comic-format labels; do not infer extra conflicts.
 return local.categories.some(label=>/\b(?:prose|novels?|novelization|reference|art ?books?)\b/iu.test(label))&&proposed.includes('Comics & Graphic Novels')||manual.includes('Comics & Graphic Novels')&&categories.some(label=>/^(?:prose fiction|novels?)$/iu.test(label));
}
function sparseEvidence(source,kind,categories){
 const value={source:kind==='openLibrary'?'open-library':'google-books',[kinds[kind]]:categories,matchBasis:'historical-category-only-recovery'};
 for(const field of ['sourceUrl','retrievedAt','appliedAt'])if(source[field])value[field]=source[field];
 if(kind==='googleBooksGenreHint')for(const field of ['confidence','candidateTitle','candidateVolumeId'])if(source[field])value[field]=source[field];
 return validateEnrichment(kind,value);
}
/** Offline, read-only and deterministic. Literal unchanged titles are required;
 * no normalization/fuzzy linkage and no current category replacement. */
export function previewGenreRecovery(oldBackup,currentBackup,{examples=false}={}){
 const oldDb=parseBackup(oldBackup),currentDb=parseBackup(currentBackup);
 const oldRecords=Object.values(oldDb.providerItems),currentRecords=Object.values(currentDb.providerItems),oldIndex=index(oldRecords),currentIndex=index(currentRecords);
 const rawCurrent=index(Object.values(currentBackup.database.providerItems));
 const patches=[],skipped={},summary={oldRecords:oldRecords.length,currentRecords:currentRecords.length,sourceRecords:0,eligibleRecords:0,unchangedRecords:0,existingCategoriesPreserved:0,categoryLabelsAdded:0,conflicts:0};
 const skip=reason=>{skipped[reason]=(skipped[reason]??0)+1;};
 for(const record of oldRecords){if(!Object.keys(kinds).some(kind=>labels(record,kind).length))continue;summary.sourceRecords++;
  const id=key(record);if(!id){skip('missing-identifier');continue;}if(oldIndex.get(id).length!==1||currentIndex.get(id)?.length>1){skip('ambiguous-identifier');continue;}
  const target=currentIndex.get(id)?.[0];if(!target){skip('missing-current-record');continue;}if(record.mediaType!==target.mediaType||!['book','audiobook'].includes(target.mediaType)){skip('media-type');continue;}
  if(record.title!==target.title){skip('changed-title');continue;}
  let changed=false,conflict=false;
  for(const kind of Object.keys(kinds)){const categories=labels(record,kind);if(!categories.length)continue;const before=target.metadata?.enrichment?.[kind];
   if(labels(target,kind).length){summary.existingCategoriesPreserved++;continue;}
   if(reviewedConflict(target,categories)){skip('reviewed-classification-conflict');summary.conflicts++;conflict=true;continue;}
   const historical=record.metadata.enrichment[kind];const nativeField=kind==='googleBooks'?'volumeId':kind==='openLibrary'?'workKey':'candidateVolumeId';
   if(before?.[nativeField]&&historical[nativeField]&&before[nativeField]!==historical[nativeField]){skip('newer-catalogue-source');summary.conflicts++;conflict=true;continue;}
   // When the envelope already exists, preserve every current field and its
   // provenance. Only an absent category list is filled; do not transplant IDs.
   const after=before?validateEnrichment(kind,{...before,[kinds[kind]]:categories}):sparseEvidence(historical,kind,categories);
   const original=rawCurrent.get(id)?.[0];
   patches.push({provider:target.provider,providerItemId:target.providerItemId,profileId:original?.profileId??null,recordRef:original?.recordRef??null,itemId:original?.id??null,kind,field:kinds[kind],before:before??null,after,hadEnrichment:Object.hasOwn(target.metadata??{},'enrichment')});summary.categoryLabelsAdded+=categories.length;changed=true;
  }
  if(changed)summary.eligibleRecords++;else if(!conflict)summary.unchangedRecords++;
 }
 const projected=structuredClone(currentDb),projectedIndex=index(Object.values(projected.providerItems));for(const patch of patches){const record=projectedIndex.get(patch.provider+'\0'+patch.providerItemId)[0];record.metadata.enrichment={...record.metadata.enrichment,[patch.kind]:patch.after};}
 const result={format:1,oldFingerprint:fingerprint(oldBackup),currentFingerprint:fingerprint(currentBackup),titleRule:'Literal unchanged validated title; no fuzzy matching or article/edition normalization.',summary,skipped,categoriesBefore:counts(currentRecords),categoriesAfter:counts(Object.values(projected.providerItems)),patches};
 if(examples)result.examples=patches.slice(0,10).map(p=>({provider:p.provider,title:currentIndex.get(p.provider+'\0'+p.providerItemId)[0].title,kind:p.kind,categories:p.after[p.field]}));
 return result;
}
