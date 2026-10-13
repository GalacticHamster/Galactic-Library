import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {continuityAssessment,addSeriesMerge} from '../src/lib/comic-series-merges.js';
import {seriesMergeTargets} from '../src/ui/comic-coverage-presentation.js';
// Minimal public numbering/context regressions from the reported split. No
// private record IDs, account data or complete library inventory are fixtures.
export const equivalentRunBooks=()=>[
  coverageBook('earlier-collection','Collects Uncanny X-Men (1963-2011) #1-66, 94-167, 248-267, 273-280',{title:'Earlier collected issues (Uncanny X-Men (1963-2011))'}),
  coverageBook('later-collection','Collects Uncanny X-Men (1981) #167-243, 281-306, 320-321, 333-337, 462-465',{title:'Later collected issues (Uncanny X-Men (1963-2011))'}),
  coverageBook('annuals','Collects Uncanny X-Men Annual #9-10',{title:'Annual collection (Uncanny X-Men (1981))'}),
  coverageBook('reset','Collects Uncanny X-Men (2011) #1-20',{title:'Restarted collection'})
];
export function equivalentRunResult(database=coverageDatabase(...equivalentRunBooks())){
  const groups=comicCoverageForLibrary(database).groups,left=groups.find(g=>g.series==='Uncanny X-Men'&&g.run==='1963-2011'&&g.unitType==='issue'),right=groups.find(g=>g.series==='Uncanny X-Men'&&g.run==='1981'&&g.unitType==='issue');
  const aliases=addSeriesMerge({},right.id,left.id,'Uncanny X-Men',true),combined=comicCoverageForLibrary(database,aliases).groups.find(g=>g.id===left.id);
  return {database,groups,left,right,aliases,combined};
}
export function checkEquivalentRunFixture(){
  const assert=(value,message)=>{if(!value)throw Error(message);},result=equivalentRunResult(),{database,groups,left,right,combined}=result,before=JSON.stringify(database);
  assert(continuityAssessment(left,right).equivalent&&!continuityAssessment(left,right).problem,'Supported labels rejected');
  assert(left.covered===168&&right.covered===114&&combined.covered===281,'Reported ranges were lost');
  const shared=combined.issues.find(issue=>issue.number==='167');assert(shared.copies===2&&shared.sources.length===2&&combined.duplicates===1,'Shared issue was not counted from distinct books');
  assert(groups.find(g=>g.unitType==='annual').covered===2,'Annuals missing');
  assert(continuityAssessment(left,groups.find(g=>g.run==='2011'&&g.unitType==='issue')).problem.includes('restarted numbering'),'Later reset allowed');
  const choices=seriesMergeTargets(left,groups);assert(choices[0].id===right.id&&choices.slice(0,2).every(g=>g.unitType==='issue'),'Annuals crowd out regular same-name runs');assert(seriesMergeTargets(left,groups,'Uncanny').some(g=>g.unitType==='annual'),'Annuals no longer discoverable');
  assert(JSON.stringify(database)===before,'Projection changed sources');return result;
}
