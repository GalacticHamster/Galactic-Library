import '../../shared/purchase-snapshot.js';
import '../../shared/purchase-transfer.js';
import '../../shared/purchase-adapters.js';
import {builtinCompanions,resolvePurchasePeer} from '../lib/companion-identities.js';
import {effectiveOwnershipRecord} from '../lib/ownership.js';
import {PROVIDER_SOURCES} from '../lib/metadata-validation.js';
import {newProviderProfile} from '../lib/provider-profiles.js';
import {normalizeProviderItem,providerItemKey,rebuildCanonicalItems} from '../lib/models.js';
import {mergePurchaseOrigins} from '../lib/purchase-origins.js';
import {strictDatabaseSerialization} from '../lib/validation-certificate.js';
const S=globalThis.GalacticPurchaseSnapshot,A=globalThis.GalacticPurchaseAdapters;
export async function purchaseAccounts(database,provider){if(!['humble','fanatical'].includes(provider))throw Error('Unsupported purchase provider.');const grouped=new Map();for(const item of Object.values(database.providerItems)){const rows=grouped.get(item.profileId)??[];rows.push(item);grouped.set(item.profileId,rows);}return Promise.all(Object.values(database.providerProfiles).filter(p=>p.provider===provider).map(async p=>{const rows=grouped.get(p.profileId)??[],eligible=rows.filter(item=>transferableItem(item,database)&&!(provider==='humble'&&!item.metadata.purchaseId));return {accountRef:p.profileId,label:p.nickname,active:database.providers[provider]?.activeProfileId===p.profileId,count:rows.length,eligibleCount:eligible.length,limitations:eligible.length<rows.length?[(rows.length-eligible.length)+' records lack supported underlying purchase evidence and cannot be transferred.']:[],stamp:await S.hash(strictDatabaseSerialization(p))};}));}
function transferableItem(item,database){return ['book','audiobook','game','software'].includes(item.mediaType)&&((item.ownership==='owned'&&effectiveOwnershipRecord(item,database,Date.now(),{ignoreOverride:true}).ownership==='owned')||(item.provider==='humble'&&item.metadata.entitlement==='third-party-key'&&item.metadata.purchaseId));}
export async function purchaseSnapshot(database,provider,ref){const profile=database.providerProfiles[ref];if(!profile||profile.provider!==provider)throw Error('Saved provider account is unavailable.');const records=[],limitations=[];
 for(const item of Object.values(database.providerItems).filter(i=>i.profileId===ref)){
 if((item.ownership!=='owned'||effectiveOwnershipRecord(item,database,Date.now(),{ignoreOverride:true}).ownership!=='owned')&&!(provider==='humble'&&item.metadata.entitlement==='third-party-key'&&item.metadata.purchaseId)||!['book','audiobook','game','software'].includes(item.mediaType)){limitations.push('Records without supported underlying owned-purchase evidence were excluded; display ownership overrides are not exported.');continue;}
 const metadata=A.pick(item.metadata,provider);if(provider==='humble'&&!metadata.purchaseId){limitations.push('A Humble record without purchase identity was excluded.');continue;}
 if(item.platform?.length)metadata.platforms=item.platform;
 const groups=new Map();if(provider==='fanatical')for(const origin of item.metadata.purchaseOrigins??[]){const key=JSON.stringify([origin.orderRef,origin.bundleId]),group=groups.get(key)??{orderRef:origin.orderRef,bundleId:origin.bundleId,bundleTitle:origin.bundleTitle,bundleSlug:metadata.bundleSlug??'',purchasedAt:origin.purchasedAt,quantity:0,occurrenceRefs:[]};group.quantity++;if(origin.basis==='order-bundle-count')group.aggregate=true;else group.occurrenceRefs.push(origin.occurrenceRef);groups.set(key,group);}
 records.push({providerItemId:item.providerItemId,title:item.title,mediaType:item.mediaType,metadata,purchasedAt:item.acquiredAt,origins:[...groups.values()].map(({aggregate,...group})=>({...group,occurrenceRefs:aggregate?[]:group.occurrenceRefs}))});}
 return S.validate({protocolVersion:1,provider,snapshotId:crypto.randomUUID(),accountRef:ref,accountLabel:profile.nickname,capturedAt:new Date().toISOString(),scope:'historical',completeness:'partial',limitations:[...new Set(limitations),'GL retains supported provider records, not raw orders, Humble prices, signed download links or unsupported Fanatical product types.'],records});}
export async function applyPurchaseSnapshot(database,raw,target){const data=S.validate(raw),provider=data.provider,stats={added:0,updated:0,unchanged:0,skipped:0};let profile=database.providerProfiles[target?.accountRef];
 if(target?.newLabel){const label=String(target.newLabel).trim();if(!label||label.length>100||Object.values(database.providerProfiles).some(p=>p.provider===provider&&p.nickname===label)||target.expectedActiveId!==(database.providers[provider]?.activeProfileId??null))throw Error('Invalid or stale new account choice.');profile=newProviderProfile(provider,label);database.providerProfiles[profile.profileId]=profile;}
 else if(!profile||profile.provider!==provider||target.stamp!==await S.hash(strictDatabaseSerialization(profile)))throw Error('Destination account changed. Refresh and confirm again.');
 const now=new Date().toISOString(),oldRecords=Object.values(database.providerItems).filter(i=>i.profileId===profile.profileId);
 const fallback=new Map();for(const item of oldRecords){const key=JSON.stringify([item.metadata.purchaseId,item.mediaType,item.title.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase()]);const rows=fallback.get(key)??[];rows.push(item);fallback.set(key,rows);}
 for(const row of data.records){if(!['book','audiobook','game','software'].includes(row.mediaType)){stats.skipped++;continue;}let native=row.providerItemId;
 if(!native){const candidates=fallback.get(JSON.stringify([row.metadata.purchaseId,row.mediaType,row.title.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase()]))??[];if(candidates.length!==1){stats.skipped++;continue;}native=candidates[0].providerItemId;}
 const id=providerItemKey(provider,native,profile.keySpace),previous=database.providerItems[id];if(previous&&previous.mediaType!==row.mediaType){stats.skipped++;continue;}
 const metadata=S.richer(previous?.metadata??{},row.metadata);delete metadata.platforms;for(const field of ['editionId','seriesId','runId'])delete metadata[field];
 if(Array.isArray(metadata.isbn)){metadata.isbns=metadata.isbn;metadata.isbn=metadata.isbn[0]??'';}metadata.source=PROVIDER_SOURCES[provider];
 if(provider==='fanatical'){
 const prior=previous?.metadata.purchaseOrigins??[],incoming=[];for(const origin of row.origins){
 const refs=origin.occurrenceRefs.length?origin.occurrenceRefs:Array.from({length:origin.quantity},(_,index)=>index);
 for(let index=0;index<origin.quantity;index++)incoming.push({occurrenceRef:typeof refs[index]==='string'?refs[index]:await S.hash(JSON.stringify(['handoff',origin.orderRef,origin.bundleId,native,index])),...(typeof refs[index]==='string'?{}:{basis:'order-bundle-count'}),orderRef:origin.orderRef,bundleId:origin.bundleId,bundleTitle:origin.bundleTitle,purchasedAt:origin.purchasedAt,observedAt:prior.find(p=>p.occurrenceRef===refs[index])?.observedAt??now});}
 metadata.purchaseOrigins=mergePurchaseOrigins(prior,incoming.map(entry=>({...entry,observedAt:prior.find(p=>p.occurrenceRef===entry.occurrenceRef)?.observedAt??entry.observedAt})));}
 const item=normalizeProviderItem({...(previous??{}),provider,providerItemId:native,title:previous?.title??row.title,mediaType:row.mediaType,ownership:previous?.ownership??'owned',profileId:profile.profileId,metadata,platform:previous?.platform?.length?previous.platform:row.metadata.platforms??[],acquiredAt:previous?.acquiredAt??row.purchasedAt,observedAt:previous?.observedAt??now},previous?.updatedAt??now,{allowEnrichment:true,profileKeySpace:profile.keySpace});
 if(previous&&JSON.stringify(item)===JSON.stringify(previous))stats.unchanged++;else{database.providerItems[id]=item;if(previous)stats.updated++;else stats.added++;}}
 if(data.records.length&&stats.skipped===data.records.length)throw Error(provider==='humble'?'No compatible records can be imported. Older Humble records need a retained native product ID or an unambiguous existing GL purchase/title. Run a separate fresh HB scan if necessary.':'No compatible Fanatical records can be imported. GL currently supports books, audiobooks, games and software; incompatible media are skipped.');
 if(stats.added||stats.updated||target?.newLabel){
 database.canonicalItems=rebuildCanonicalItems(database.providerItems,database.manualMatchDecisions,database.canonicalItems,database.editionSeparations);
 const records=Object.values(database.providerItems).filter(i=>i.profileId===profile.profileId),state={...profile.state,connected:true,lastSync:now,recordCount:records.length};for(const [field,type]of [['itemCount','game'],['bookCount','book'],['audiobookCount','audiobook'],['softwareCount','software']])state[field]=records.filter(i=>i.mediaType===type).length;profile.state=state;
 if(!database.providers[provider]?.activeProfileId||database.providers[provider].activeProfileId===profile.profileId)database.providers[provider]={...state,profileLabel:profile.nickname,activeProfileId:profile.profileId};}
 return stats;}
export function createPurchaseHandoff({runtime,area,writer}){
 const bindingKey='galacticPurchasePeerRoles';
 const role=provider=>provider==='humble'?'hb':provider==='fanatical'?'fan':null;
 const allowed=()=>writer.getQueryAllowedExternalClientIds();
 const builtin=provider=>builtinCompanions(runtime).find(item=>item.role===role(provider))?.id;
 async function peer(provider,id){if(!role(provider))throw Error('Wrong purchase provider.');return resolvePurchasePeer(runtime,provider,await allowed(),(await area.get({[bindingKey]:{}}))[bindingKey],id);}
 let pairingWrites=Promise.resolve();
 function bind(id,provider){const work=async()=>{if(id===builtin(provider))return;const value=(await area.get({[bindingKey]:{}}))[bindingKey];const next={...value,[provider]:id};if(JSON.stringify(value)!==JSON.stringify(next))await area.set({[bindingKey]:next});};const pending=pairingWrites.then(work,work);pairingWrites=pending.catch(()=>{});return pending;}
 async function authorize(id,provider){if(!role(provider)||(await allowed()).includes(id)===false)return false;if(id===builtin(provider))return true;
 const bindings=(await area.get({[bindingKey]:{}}))[bindingKey];if(bindings[provider]===id)return true;if(Object.entries(bindings).some(([other,peerId])=>other!==provider&&peerId===id))return false;
 // Already authorized incoming development peers may initialize their role only
 // through a reverse PING to the actual sender ID, never a payload-supplied ID.
 try{await resolvePurchasePeer(runtime,provider,await allowed(),{},id);await bind(id,provider);return true;}catch{return false;}}
 const service=GalacticPurchaseTransfer.createService({runtime,area,peer,bind,authorize,
 accounts:async provider=>purchaseAccounts(await writer.getQueryDatabase(),provider),snapshot:async(provider,ref)=>purchaseSnapshot(await writer.getQueryDatabase(),provider,ref),commit:(data,target)=>writer.importPurchaseSnapshot(data,target)});
 return service;}
