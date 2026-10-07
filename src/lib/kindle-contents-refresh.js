import {object,count,date,text} from './validation.js';
import {CONTENTS_PARSER_VERSION} from './contents.js';
import {KINDLE_CONTENTS_EXTRACTOR_VERSION} from './kindle-contents.js';
import {CONTENTS_FILTER_VERSION} from './contents-quality.js';
import {MANIFEST_INTERPRETATION_VERSION} from './kindle-manifest.js';

export const KINDLE_REFRESH_KEY='galacticLibraryKindleContentsRefresh';
export const KINDLE_REFRESH_VERSION=1;
const states=new Set(['running','paused','interrupted','blocked','completed','aborted']);
const uuid=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value??''))throw Error('Invalid refresh reference.');return value;};
export function validateKindleRefresh(value) {
  object(value,'Kindle refresh checkpoint');
  if(value.version!==KINDLE_REFRESH_VERSION||value.extractorVersion!==KINDLE_CONTENTS_EXTRACTOR_VERSION||value.parserVersion!==CONTENTS_PARSER_VERSION||value.filterVersion!==CONTENTS_FILTER_VERSION||value.manifestVersion!==MANIFEST_INTERPRETATION_VERSION)throw Error('Stale or incompatible refresh checkpoint; start a new refresh.');
  if(!states.has(value.status)||!Array.isArray(value.queue)||value.queue.length>50000)throw Error('Invalid refresh checkpoint.');
  const queue=value.queue.map(entry=>{
    object(entry,'Refresh queue item');
    if(!/^kindle:(?:[a-f0-9-]{36}:)?[A-Z0-9]+$/u.test(entry.id)||!/^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]+$/u.test(entry.detailUrl))throw Error('Invalid refresh queue identity.');
    return {id:entry.id,recordRef:uuid(entry.recordRef),detailUrl:entry.detailUrl,title:text(entry.title,500,'Refresh title')};
  });
  if(new Set(queue.map(e=>e.recordRef)).size!==queue.length)throw Error('Duplicate refresh queue identity.');
  const cursor=count(value.cursor,'Refresh position',queue.length),counts={};
  for(const key of ['found','empty','unavailable','failures','skipped'])counts[key]=count(value.counts?.[key],'Refresh count',queue.length);
  if(Object.values(counts).reduce((a,b)=>a+b,0)!==cursor||value.status==='completed'&&cursor!==queue.length)throw Error('Inconsistent refresh checkpoint.');
  if(value.tabId!==null&&(!Number.isInteger(value.tabId)||value.tabId<0))throw Error('Invalid refresh owner.');
  return {version:KINDLE_REFRESH_VERSION,extractorVersion:value.extractorVersion,parserVersion:value.parserVersion,filterVersion:value.filterVersion,manifestVersion:value.manifestVersion,runRef:uuid(value.runRef),leaseRef:value.leaseRef?uuid(value.leaseRef):'',
    status:value.status,profileLabel:text(value.profileLabel,100,'Refresh profile'),queue,cursor,counts,tabId:value.tabId,startedAt:date(value.startedAt),updatedAt:date(value.updatedAt),
    ...(value.blockedBy?{blockedBy:['captcha','sign-in'].includes(value.blockedBy)?value.blockedBy:'unknown'}:{})};
}
export function kindleRefreshSummary(job){if(!job)return null;const {queue,leaseRef,...summary}=job;return {...summary,total:queue.length};}
