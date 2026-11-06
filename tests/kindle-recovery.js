import assert from 'node:assert/strict';
import {providerContext} from './provider-snapshots.js';
import {withWorker} from './storage.js';
export const kindleSender={id:'abcdefghijklmnopabcdefghijklmnop',url:'https://www.amazon.com/hz/mycd/',tab:{id:19}};
export const kindleBook=(n,extra={})=>({asin:'B'+String(n).padStart(9,'0'),title:'Synthetic Kindle '+n,originType:'Purchase',acquiredDate:'2023-06-07',...extra});
export const kindlePayload=(items,total)=>({success:true,GetContentOwnershipData:{items,...(total===null?{}:{numberOfItems:total})}});
export async function kindleWorker(run){return withWorker(async h=>{
 let books=[kindleBook(1)],documents=[],reply=null,token='synthetic';const requests=[];
 const context=providerContext('kindle',async(url,request)=>{const input=JSON.parse(request.body.get('activityInput'));requests.push(input);if(reply)return reply(input,()=>{token='changed';});const rows=input.contentType==='Ebook'?books:documents;return {ok:true,status:200,json:async()=>kindlePayload(rows.slice(input.fetchCriteria.startIndex,input.fetchCriteria.startIndex+100),rows.length)};},{chrome:{runtime:{sendMessage:r=>h.dispatch(r,kindleSender)}},document:{querySelector:()=>({get value(){return token;}}),createElement:()=>({set innerHTML(value){this.value=value;}}),scripts:[]}});
 const acquire=async(mode='full',label='Synthetic')=>{const state=await h.dispatch({type:'GET_PROVIDER_SYNC_STATE',provider:'kindle',mode,profileLabel:label,confirmed:true,beginScan:true},kindleSender);assert(state.ok,state.error);const full=mode==='full'||state.forceFull||state.syncState?.listingIncomplete;const result=JSON.parse(JSON.stringify(await context.GalacticKindle.fetchKindleBooks(()=>{},full?null:state.syncState.knownProviderItemIds)));return {state,result,full};};
 const commit=async a=>{const request={type:'COMMIT_PROVIDER_SCAN',provider:'kindle',mode:a.full?'full':'incremental',scanToken:a.state.scanToken,items:a.result.items,snapshot:a.result.snapshot,scanDiagnostics:{incomplete:a.result.incomplete===true,failedRequestCount:(a.result.snapshot?.recovery?.failedItems??0)+(a.result.snapshot?.recovery?.failedPages??0)}};return {request,result:await h.dispatch(request,kindleSender)};};
 await run({...h,acquire,commit,requests,context,setBooks:v=>{books=structuredClone(v);},setDocuments:v=>{documents=structuredClone(v);},setReply:v=>{reply=v;}});
 },{storageEvents:true,concurrentQueries:true});}
