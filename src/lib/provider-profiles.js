import {PROVIDERS} from './constants.js';
import {validateProviderStates} from './provider-state.js';
import {object,text,date} from './validation.js';

export const profileRef=value=>{if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value??''))throw Error('Invalid provider profile reference.');return value;};
export const profileItemKey=(provider,native,namespace)=>namespace?`${provider}@${namespace}:${native}`:`${provider}:${native}`;
export function newProviderProfile(provider,nickname='',legacy=false){
  if(!PROVIDERS.includes(provider))throw Error('Invalid provider.');
  const profileId=crypto.randomUUID();
  return {profileId,provider,nickname:text(nickname,100,'Profile nickname'),keySpace:legacy?'':profileId,state:{},lastSelectedAt:null,provenance:nickname?'declared':'unassigned'};
}
export function validateProviderProfiles(value={}){
  object(value,'Provider profiles');if(Object.keys(value).length>10000)throw Error('Too many provider profiles.');
  const legacy=new Set(),names=new Set(),bindings=new Set();
  return Object.fromEntries(Object.entries(value).map(([id,p])=>{
    profileRef(id);object(p,'Provider profile');if(p.profileId!==id||!PROVIDERS.includes(p.provider))throw Error('Invalid profile owner.');
    const nickname=text(p.nickname,100,'Profile nickname'),keySpace=p.keySpace===''?'':profileRef(p.keySpace);
    if(keySpace&&keySpace!==id)throw Error('Profile namespace must be immutable identity.');
    if(!keySpace){if(legacy.has(p.provider))throw Error('Duplicate legacy profile namespace.');legacy.add(p.provider);}
    const name=`${p.provider}:${nickname}`;if(nickname&&names.has(name))throw Error('Duplicate provider profile nickname.');if(nickname)names.add(name);
    if(!['declared','unassigned'].includes(p.provenance))throw Error('Invalid profile provenance.');
    if(p.assumeUnconfirmedOwned!==undefined&&(p.provider!=='kobo'||typeof p.assumeUnconfirmedOwned!=='boolean'))throw Error('Invalid Kobo account ownership preference.');
    if(p.sourceAccountFingerprint!==undefined&&(!['nintendo','playstation','xbox'].includes(p.provider)||typeof p.sourceAccountFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(p.sourceAccountFingerprint)))throw Error('Invalid '+(p.provider==='nintendo'?'Nintendo':p.provider==='xbox'?'Xbox':'PlayStation')+' account binding.');
    if(p.sourceAccountFingerprint){if(bindings.has(p.provider+':'+p.sourceAccountFingerprint))throw Error('Duplicate '+(p.provider==='nintendo'?'Nintendo':p.provider==='xbox'?'Xbox':'PlayStation')+' account binding.');bindings.add(p.provider+':'+p.sourceAccountFingerprint);}
    const state=validateProviderStates({[p.provider]:p.state??{}})[p.provider];delete state.activeProfileId;state.profileLabel=nickname;
    const legacyArchive={};object(p.legacyArchive??{},'Legacy archive dates');if(Object.keys(p.legacyArchive??{}).length>500000)throw Error('Too many legacy archive dates.');for(const [ref,at]of Object.entries(p.legacyArchive??{}))legacyArchive[profileRef(ref)]=date(at);
    return [id,{...(Object.keys(legacyArchive).length?{legacyArchive}:{}),...(p.assumeUnconfirmedOwned===true?{assumeUnconfirmedOwned:true}:{}),...(p.sourceAccountFingerprint?{sourceAccountFingerprint:p.sourceAccountFingerprint}:{}),profileId:id,provider:p.provider,nickname,keySpace,state,lastSelectedAt:date(p.lastSelectedAt),provenance:p.provenance}];
  }));
}
// Migration/unscoped legacy bootstrap reserves one legacy namespace; its IDs remain stable;
// every later account gets its own opaque namespace, including after removal.
export function migrateProviderProfiles(input){
  if(input.schemaVersion>=13&&Object.keys(input.providerProfiles??{}).length&&[...Object.values(input.providerItems??{}),...Object.values(input.providerHistory??{}).map(h=>h.item)].some(i=>i.profileId&&!input.providerProfiles[i.profileId]))throw Error('Record belongs to an unknown provider profile.');
  if(input.providerProfiles&&Object.values(input.providerItems??{}).every(i=>i.profileId)&&Object.values(input.providerHistory??{}).every(h=>h.item?.profileId)&&Object.values(input.providers??{}).every(s=>s.activeProfileId)&&[...Object.values(input.providerItems??{}),...Object.values(input.providerHistory??{}).map(h=>h.item)].every(i=>input.providerProfiles[i.profileId]&&i.id===profileItemKey(i.provider,i.providerItemId,input.providerProfiles[i.profileId].keySpace)))return input;
  if(input.schemaVersion>=13&&Object.keys(input.providerProfiles??{}).length&&Object.values(input.providerItems).some(i=>!i.profileId))throw Error('A profile-owned database contains an unassigned current record.');
  const v=structuredClone(input),profiles=v.providerProfiles??={},byLabel=new Map();
  for(const p of Object.values(profiles))byLabel.set(`${p.provider}:${p.nickname}`,p);
  function get(provider,label,legacy=false){label=text(label??'',100,'Profile nickname');const key=`${provider}:${label??''}`;let p=byLabel.get(key);if(!p){p=newProviderProfile(provider,label,legacy);profiles[p.profileId]=p;byLabel.set(key,p);}return p;}
  v.providers??={};v.providerHistory??={};
  for(const provider of new Set([...Object.keys(v.providers).filter(p=>PROVIDERS.includes(p)),...Object.values(v.providerItems).map(i=>i.provider)])){
    const state=v.providers[provider]??{},p=get(provider,state.profileLabel??'',!Object.values(profiles).some(p=>p.provider===provider&&!p.keySpace));
    p.state={...state};delete p.state.activeProfileId;v.providers[provider]={...state,activeProfileId:p.profileId};
  }
  const oldOwners=new Map(),byRef=new Map(),items={};
  function own(item,label,current){
    const oldId=item.id??profileItemKey(item.provider,item.providerItemId,''),p=profiles[item.profileId]??get(item.provider,label,current&&!Object.values(profiles).some(p=>p.provider===item.provider&&!p.keySpace));
    const next={...item,profileId:p.profileId,id:profileItemKey(item.provider,item.providerItemId,p.keySpace)};
    const owners=oldOwners.get(oldId)??new Map();owners.set(next.recordRef??crypto.randomUUID(),next.id);oldOwners.set(oldId,owners);byRef.set(next.recordRef,next);
    return next;
  }
  for(const item of Object.values(v.providerItems)){
    const next=own(item,v.providers[item.provider]?.profileLabel??'',true);if(items[next.id])throw Error('Backup contains duplicate provider identities.');items[next.id]=next;
  }
  const history=[];
  for(const [ref,h]of Object.entries(v.providerHistory)){
    profileRef(ref);if(h.item.recordRef&&h.item.recordRef!==ref)throw Error('Historical reference does not match its record.');
    const next=own({...h.item,recordRef:ref},h.profileLabel??'',false);v.providerHistory[ref]={...h,item:next};history.push([ref,h,next]);
  }
  const counts=new Map();for(const [,h,next]of history)if(h.reason==='profile-switch')counts.set(next.id,(counts.get(next.id)??0)+1);
  for(const [ref,h,next]of history)if(h.reason==='profile-switch'&&counts.get(next.id)===1&&!items[next.id]){
    items[next.id]=next;delete v.providerHistory[ref];
    const profile=profiles[next.profileId];profile.legacyArchive??={};profile.legacyArchive[ref]=date(h.missingSince);
  }
  const resolve=id=>{const owners=oldOwners.get(id);return owners?.size===1?[...owners.values()][0]:null;};
  v.unresolvedProfileState??={contentReviews:{},manualMatchDecisions:{},editionSeparations:{},ownershipProposals:{},companionFeeds:{}};
  for(const name of ['contentReviews','manualMatchDecisions','editionSeparations']){
    const result={};for(const [key,entry]of Object.entries(v[name]??{})){
      const ids=name==='contentReviews'?[key]:name==='manualMatchDecisions'?entry.itemIds:[entry.itemId,...entry.otherItemIds];
      const mapped=ids.map(resolve);
      if(mapped.some(id=>!id)){v.unresolvedProfileState[name][key]=entry;continue;}
      if(name==='contentReviews')result[mapped[0]]=entry;
      else if(name==='manualMatchDecisions'){const itemIds=mapped.sort();result[itemIds.join('\u0000')]={...entry,itemIds};}
      else result[key]={...entry,itemId:mapped[0],otherItemIds:mapped.slice(1)};
    }v[name]=result;
  }
  v.canonicalItems=Object.fromEntries(Object.entries(v.canonicalItems??{}).map(([key,entry])=>[key,{...entry,providerItemIds:entry.providerItemIds.map(resolve).filter(Boolean)}]));
  for(const [ref,observation]of Object.entries(v.kindleContentsObservations??{}))if(byRef.has(ref))observation.providerItemId=byRef.get(ref).id;
  for(const [key,proposal]of Object.entries(v.ownershipProposals??{})){
    const p=byLabel.get(`${proposal.evidence.provider}:${proposal.profileLabel??''}`);
    if(p)proposal.profileId=p.profileId;else{v.unresolvedProfileState.ownershipProposals[key]=proposal;delete v.ownershipProposals[key];}
  }
  for(const [key,feed]of Object.entries(v.companionFeeds??{})){
    const p=byLabel.get(`humble:${feed.profileLabel}`);
    if(p)feed.profileId=p.profileId;else{v.unresolvedProfileState.companionFeeds[key]=feed;delete v.companionFeeds[key];}
  }
  v.providerItems=items;v.providerProfiles=profiles;return v;
}
