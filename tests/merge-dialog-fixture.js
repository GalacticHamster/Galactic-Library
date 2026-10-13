import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {addSeriesMerge,continuityAssessment} from '../src/lib/comic-series-merges.js';
// Bounded synthetic statements reflecting the three frozen Swamp Thing scopes.
export function mergeDialogFixture(){
  const database=coverageDatabase(
    coverageBook('saga','Collects SAGA OF THE SWAMP THING #28-34'),
    coverageBook('the-saga','Collects The Saga of the Swamp Thing #1-19'),
    coverageBook('dated','Collects Swamp Thing (1982-1996) #43-56, #76-77, #140-171'),
    coverageBook('annual','Collects Swamp Thing (1982-1996) #45, Annual #2'),
    coverageBook('reset','Collects Swamp Thing (2011-2015) #1-10'));
  const groups=comicCoverageForLibrary(database).groups;
  const saga=groups.find(g=>g.series==='SAGA OF THE SWAMP THING'),other=groups.find(g=>g.series==='The Saga of the Swamp Thing'),dated=groups.find(g=>g.run==='1982-1996'&&g.unitType==='issue'),annual=groups.find(g=>g.unitType==='annual'),reset=groups.find(g=>g.run==='2011-2015');
  const merges=addSeriesMerge({},saga.id,other.id,'Saga of the Swamp Thing');
  const merged=comicCoverageForLibrary(database,merges).groups.find(g=>g.id===other.id);
  return {database,groups,saga,other,dated,annual,reset,merges,merged};
}
export function checkMergeDialogFixture(){
  const result=mergeDialogFixture();
  if(continuityAssessment(result.merged,result.dated).problem)throw Error('Runless merged scopes cannot be assessed');
  const merges=addSeriesMerge(result.merges,result.merged.id,result.dated.id,'My Swamp Thing',true),full=comicCoverageForLibrary(result.database,merges).groups.find(g=>g.id===result.dated.id);
  if(full.covered!==74||full.series!=='My Swamp Thing'||full.originalScopes.length!==3)throw Error('Continuing Swamp scopes lost coverage or changed custom title');
  if(!continuityAssessment(full,result.reset).problem.includes('restarted numbering'))throw Error('New 52 reset protection lost');
  return {...result,full,combinedMerges:merges};
}
