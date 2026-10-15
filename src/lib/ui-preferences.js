import {validateComicCoverageMerges} from './comic-series-merges.js';
import {validateComicCoverageNames} from './comic-series-names.js';
import {validateNumberingTransitions} from './comic-coverage.js';
export const UI_PREFERENCES_KEY = 'galacticLibraryUiPreferences';
export const PAGE_SIZES = Object.freeze([20,50,100,200]);
export const validPageSize = value => PAGE_SIZES.includes(value);
export const PRIMARY_WORKSPACES = ['library', 'providers', 'contents', 'settings'];
export const LIBRARY_WORKSPACES = ['library', 'overlap', 'comic-coverage', 'reading', 'ownership'];
export const BOOK_WORKSPACES = ['contents', 'books', 'comparisons'];
// Legacy workspace keys remain valid; only their navigation grouping changes.
export const WORKSPACES = [...PRIMARY_WORKSPACES, 'overlap', 'comic-coverage', 'books', 'reading', 'ownership', 'comparisons'];
export function workspaceTarget(value) {
  const name=String(value??'').replace(/^#/u,'').split('?')[0].replace(/-workspace$/u,'');
  return name==='overlap'?'comic-coverage':WORKSPACES.includes(name)?name:({libraries:'providers',kindle:'contents','library-section':'library'})[name]??null;
}
export const emptyLibraryView = () => ({ search: '', provider: 'all', mediaType: 'all', genre: 'all', ownership: 'all', dlc: 'all', account:'all', reading:'all', series:'all', information:'all', acquisitions:'all', sort:'title-asc', page: 0 });
export const SHARED_BROWSE_FIELDS = ['search','provider','mediaType','genre','ownership','account','reading','series','sort','page','anchor'];
export const emptyBrowseView = () => Object.fromEntries(SHARED_BROWSE_FIELDS.map(key=>[key,key==='anchor'?'':emptyLibraryView()[key]]));
export const defaultUiPreferences = () => ({workspace:'library',appearance:'dark',pageSize:50,comicCoverageStarts:{},comicCoverageTransitions:{},comicCoverageMerges:{},comicCoverageNames:{},browse:emptyBrowseView(),library:{information:'all',dlc:'all',acquisitions:'all'},contents:{status:'all'},books:emptyLibraryView()});
export function validateComicCoverageTransitions(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10000)throw Error('Invalid numbering transitions.');
  const output={};for(const [key,list]of Object.entries(value)){
    validateComicCoverageStarts({[key]:1});
    const transitions=validateNumberingTransitions(list??[]);if(transitions.length)output[key]=transitions;
  }return output;
}
export function validateComicCoverageStarts(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10000)throw Error('Invalid comic coverage starting numbers.');
  const output={};for(const [key,start]of Object.entries(value)){
    let scope;try{scope=JSON.parse(key);}catch{throw Error('Invalid comic series scope.');}
    if(key.length>800||!Array.isArray(scope)||scope.length!==4||scope.some(part=>typeof part!=='string')||!scope[0]||!['issue','annual','special'].includes(scope[2])||!scope[3])throw Error('Invalid comic series scope.');
    if(start!==null&&(!Number.isSafeInteger(start)||start<0||start>999999))throw Error('Starting number must be a whole number from 0 to 999999.');
    if(start!==null&&start!==1)output[key]=start;
  }return output;
}
function validateView(view,defaults){
  if(!view||typeof view!=='object'||Array.isArray(view)||Object.keys(view).some(key=>!Object.hasOwn(defaults,key)))throw Error('Invalid library filters.');
  const output={...defaults,...view};
  if('acquisitions' in output)output.acquisitions=({multiple:'2'})[output.acquisitions]??output.acquisitions;
  for(const [key,value]of Object.entries(output)){
    if(key==='page'){if(!Number.isSafeInteger(value)||value<0||value>1000000)throw Error('Invalid library page.');}
    else if(typeof value!=='string'||value.length>(['search','series'].includes(key)?500:200))throw Error('Invalid library filter.');
  }
  const enums={acquisitions:['all','1','2','3','4','5'],mediaType:['all','game','software','book','audiobook','movie','tv'],ownership:['all','owned','claimed','unknown','rental','borrowed','subscription','returned','revoked','expired'],dlc:['all','with','without'],reading:['all','not-saved','unread','reading','completed'],information:['all','missing','review'],sort:['title-asc','title-desc','added','updated','creator','series'],status:['all','attention','review','failure','reviewed','rejected','identified','partial','uncertain','missing','unattempted','failed']};
  for(const [key,choices]of Object.entries(enums))if(key in output&&!choices.includes(output[key]))throw Error('Unknown library filter.');
  return output;
}
export function validateUiPreferences(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['workspace','appearance','pageSize','comicCoverageStarts','comicCoverageTransitions','comicCoverageMerges','comicCoverageNames','browse','library','contents','books'].includes(key)))throw Error('Invalid library display preferences.');
  const output=defaultUiPreferences();
  if(value.appearance!==undefined){if(!['dark','light','system'].includes(value.appearance))throw Error('Invalid appearance preference.');output.appearance=value.appearance;}
  if(value.pageSize!==undefined){if(!validPageSize(value.pageSize))throw Error('Invalid items per page.');output.pageSize=value.pageSize;}
  if(value.workspace!==undefined){if(!WORKSPACES.includes(value.workspace))throw Error('Unknown library workspace.');output.workspace=workspaceTarget(value.workspace);}
  if(value.comicCoverageStarts!==undefined)output.comicCoverageStarts=validateComicCoverageStarts(value.comicCoverageStarts);
  if(value.comicCoverageTransitions!==undefined)output.comicCoverageTransitions=validateComicCoverageTransitions(value.comicCoverageTransitions);
  if(value.comicCoverageMerges!==undefined)output.comicCoverageMerges=validateComicCoverageMerges(value.comicCoverageMerges);
  if(value.comicCoverageNames!==undefined)output.comicCoverageNames=validateComicCoverageNames(value.comicCoverageNames);
  // Migrate old Library fields once. Shared state is authoritative thereafter.
  const legacy=value.library?validateView(value.library,emptyLibraryView()):emptyLibraryView();
  output.browse=validateView(value.browse??Object.fromEntries(SHARED_BROWSE_FIELDS.filter(key=>key!=='anchor').map(key=>[key,legacy[key]])),emptyBrowseView());
  output.library={information:legacy.information,dlc:legacy.dlc,acquisitions:legacy.acquisitions};
  if(value.contents)output.contents=validateView(value.contents,output.contents);
  if(value.books)output.books=validateView(value.books,output.books);
  return output;
}
export function mergeUiPreferences(current,patch){
  validateUiPreferences(patch);
  const sharedPatch={...Object.fromEntries(Object.entries(patch.library??{}).filter(([key])=>SHARED_BROWSE_FIELDS.includes(key))),...patch.browse};
  return validateUiPreferences({...current,...patch,comicCoverageNames:validateComicCoverageNames({...current.comicCoverageNames,...patch.comicCoverageNames}),comicCoverageStarts:validateComicCoverageStarts({...current.comicCoverageStarts,...patch.comicCoverageStarts}),comicCoverageTransitions:validateComicCoverageTransitions({...current.comicCoverageTransitions,...patch.comicCoverageTransitions}),browse:{...current.browse,...sharedPatch},library:{...current.library,...patch.library},contents:{...current.contents,...patch.contents},books:{...current.books,...patch.books}});
}
export function browseView(preferences,workspace){
  return workspace==='books'?preferences.books:{...preferences.browse,...preferences[workspace==='contents'?'contents':'library']};
}
export function rememberBrowseView(preferences,workspace,view){
  if(workspace==='books'){preferences.books={...preferences.books,...Object.fromEntries(Object.entries(view).filter(([key])=>key in preferences.books))};return;}
  if(!['library','contents'].includes(workspace))return;
  for(const key of SHARED_BROWSE_FIELDS)if(key in view)preferences.browse[key]=view[key];
  const local=preferences[workspace];for(const key of Object.keys(local))if(key in view)local[key]=view[key];
}
