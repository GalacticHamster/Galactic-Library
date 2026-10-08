import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceNavigation} from '../src/ui/workspaces.js';
import {defaultUiPreferences,validateUiPreferences,workspaceTarget} from '../src/lib/ui-preferences.js';

export const navigationUxTests=[
 ['Options has four primary destinations and keeps existing tools in reachable secondary homes',async()=>{
   const html=await readFile(new URL('../options.html',import.meta.url),'utf8');
   const primary=html.match(/<nav id="workspace-navigation"[\s\S]*?<\/nav>/u)[0];
   assert.deepEqual([...primary.matchAll(/data-workspace="([^"]+)"/gu)].map(m=>m[1]),['library','providers','contents','settings']);
   assert.match(html,/<nav id="library-navigation"/u);
   const contents=html.slice(html.indexOf('<section id="contents-workspace"'),html.indexOf('<section id="books-workspace"'));
   assert.match(contents,/contents-progress-slot/u);assert.match(contents,/series-coverage-view/u);
   assert.match(contents,/Scan eligible books/u);assert(!contents.includes('comic/manga candidates'));
   const settings=html.slice(html.indexOf('<section id="settings-workspace"'));
   for(const id of ['export','import','performance-diagnostics','assume-all-owned','google-books-api-key','companion-extension-id'])assert(settings.includes(`id="${id}"`));
   assert(!settings.includes('Open signed-in Steam Store'));assert.match(settings,/Restore backup/u);
 }],
 ['Old saved views/deep links remain compatible without changing database identity',()=>{
   for(const name of ['books','reading','ownership','library','providers','contents','settings'])assert.equal(validateUiPreferences({workspace:name}).workspace,name);
   assert.equal(workspaceTarget('#kindle'),'contents');assert.equal(workspaceTarget('#libraries'),'providers');assert.equal(workspaceTarget('#ownership-workspace'),'ownership');
   assert.equal(workspaceTarget('bad-route'),null);
 }],
 ['Navigation hides sections without recreating contents progress or initiating acquisition',()=>{
   const prior=globalThis.document,listeners={};
   const node=(workspace)=>({dataset:{workspace},hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});
   const primary=['library','providers','contents','settings'].map(node),secondary=['library','books','reading','ownership'].map(node);
   const panels=['books','reading','ownership','providers','contents','settings'].map(w=>({...node(w),dataset:{workspacePanel:w}}));
   const nav={querySelectorAll:()=>primary,addEventListener:(k,fn)=>{listeners.primary=fn;}},sub={querySelectorAll:()=>secondary,addEventListener:(k,fn)=>{listeners.secondary=fn;}};
   const library={},enrich={},heading={},status={},progress={cursor:17,runRef:'unchanged'};
   globalThis.document={querySelector:s=>({'#workspace-navigation':nav,'#library-navigation':sub,'#workspace-status':status,'#library-section':library,'#show-enrichment-actions':enrich,'#library-heading':heading})[s],querySelectorAll:()=>panels,addEventListener(){}};
   let changed=0,reads=0;const view=defaultUiPreferences().library;
   try{
     const ui=createWorkspaceNavigation({readView:()=>{reads++;return view;},applyView(){},save:async()=>{},changed:()=>changed++});
     ui.hydrate({...defaultUiPreferences(),workspace:'books'});assert.equal(primary[0].attrs['aria-current'],'page');assert.equal(secondary[1].attrs['aria-current'],'page');
     ui.select('contents');assert.equal(library.hidden,true);assert.equal(sub.hidden,true);assert.equal(panels.find(p=>p.dataset.workspacePanel==='contents').hidden,false);
     ui.select('providers');ui.select('contents');assert.deepEqual(progress,{cursor:17,runRef:'unchanged'});
     ui.select('library');assert.equal(library.hidden,false);assert.equal(primary[0].attrs['aria-current'],'page');assert.equal(reads,1);assert.equal(changed,4);
   }finally{globalThis.document=prior;}
 }]
];
