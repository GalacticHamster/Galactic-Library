import {comicIssueEvidence,comicGroupCounts} from './comic-coverage.js';
export function seriesScope(id){
  let scope;try{scope=JSON.parse(id);}catch{throw Error('Invalid comic series.');}
  if(typeof id!=='string'||id.length>800||!Array.isArray(scope)||scope.length!==4||scope.some(part=>typeof part!=='string')||!scope[0]||!['issue','annual','special'].includes(scope[2])||!scope[3])throw Error('Invalid comic series.');
  return scope;
}
export function compatibleSeries(a,b,continuity=false){
  const left=seriesScope(a),right=seriesScope(b);
  return left[2]===right[2]&&left[3]===right[3]&&(continuity||left[1]===right[1]);
}
export function continuityProblem(left,right){
  const scopes=group=>(group.originalScopes??[{series:group.series,run:group.run}]).map(scope=>{
    const year=/^(\d{4})(?:$|[-–—])/u.exec(scope.run??'');
    const issues=group.issues.filter(issue=>!group.originalScopes||issue.sources.some(source=>source.seriesScope?.run===scope.run&&source.seriesScope?.series===scope.series));
    const numbers=issues.map(issue=>/^\d+\/\d+$/u.test(issue.number)?Number(issue.number.split('/')[0])/Number(issue.number.split('/')[1]):Number(issue.number)).filter(Number.isFinite);
    return {year:year?Number(year[1]):null,min:Math.min(...numbers),max:Math.max(...numbers)};
  });
  for(const a of scopes(left))for(const b of scopes(right)){
    if(a.year===null||b.year===null||a.year===b.year)continue;
    const [early,late]=a.year<b.year?[a,b]:[b,a];
    if(early.max>=late.min)return 'These publication eras have overlapping or restarted numbering. Keep them separate so different issues with the same number do not become duplicates.';
  }return '';
}
export function validateComicCoverageMerges(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>1000)throw Error('Invalid comic series merges.');
  const output={},seen=new Set();
  for(const [id,merge]of Object.entries(value)){
    seriesScope(id);
    if(!merge||typeof merge!=='object'||Object.keys(merge).some(key=>!['members','title','continuity'].includes(key))||merge.continuity!==undefined&&typeof merge.continuity!=='boolean'||!Array.isArray(merge.members)||merge.members.length<2||merge.members.length>100||!merge.members.includes(id)||typeof merge.title!=='string'||!merge.title.trim()||merge.title.length>300)throw Error('Invalid comic series merge.');
    for(const member of merge.members){if(!compatibleSeries(id,member,merge.continuity===true)||seen.has(member))throw Error('Merged series must have compatible runs, the same issue type and language and cannot belong to two groups.');seen.add(member);}
    output[id]={members:[...merge.members],title:merge.title.trim(),...(merge.continuity?{continuity:true}:{})};
  }return output;
}
export function addSeriesMerge(current,source,target,title,continuity=false){
  if(typeof continuity!=='boolean')throw Error('Invalid numbering continuity choice.');
  const merges=validateComicCoverageMerges(current);
  seriesScope(source);seriesScope(target);
  const sourceGroup=Object.entries(merges).find(([,value])=>value.members.includes(source)),targetGroup=Object.entries(merges).find(([,value])=>value.members.includes(target));
  if(source===target||sourceGroup&&sourceGroup[0]===targetGroup?.[0])throw Error('These series are already combined.');
  if(!compatibleSeries(source,target,continuity))throw Error('Choose a series with the same run, issue type and language, or explicitly confirm continuing numbering across eras.');
  const id=targetGroup?.[0]??target,members=[...new Set([...(targetGroup?.[1].members??[target]),...(sourceGroup?.[1].members??[source])])];
  if(sourceGroup)delete merges[sourceGroup[0]];if(targetGroup)delete merges[targetGroup[0]];
  merges[id]={members,title,...(continuity||sourceGroup?.[1].continuity||targetGroup?.[1].continuity?{continuity:true}:{})};return validateComicCoverageMerges(merges);
}
// Aliases affect this local view only. Original scopes and source records stay
// intact. Recount acquisitions from the union of sources, never sum old counts.
export function mergeCoverageGroups(groups,aliases,copiesForSources){
  const merges=validateComicCoverageMerges(aliases),owners=new Map();
  for(const [id,merge]of Object.entries(merges))for(const member of merge.members)owners.set(member,id);
  const output=new Map();
  for(const group of groups){
    const id=owners.get(group.id)??group.id,merge=merges[id];
    if(!merge){output.set(id,group);continue;}
    let combined=output.get(id);
    if(!combined){combined={...group,id,series:merge.title,...(merge.continuity?{run:'',continuity:true}:{}),members:merge.members,originalTitles:[],originalScopes:[],issues:[],units:new Map()};output.set(id,combined);}
    combined.originalTitles.push(group.series);combined.originalScopes.push({series:group.series,run:group.run});
    for(const issue of group.issues){
      const scoped={...issue,sources:issue.sources.map(source=>({...source,seriesScope:{series:group.series,run:group.run,unitType:group.unitType,language:group.language}}))};
      const fraction=/^(\d+)\/(\d+)$/u.exec(issue.number);
      const key=fraction?String(Number(fraction[1])/Number(fraction[2])):/^\d+(?:\.\d+)?$/u.test(issue.number)?String(Number(issue.number)):issue.number;
      const prior=combined.units.get(key);
      if(!prior){combined.units.set(key,scoped);continue;}
      const sources=new Map();
      const rank=confidence=>confidence==='verified'?3:confidence==='direct'?2:1;
      for(const source of [...prior.sources,...scoped.sources]){const key=JSON.stringify([source.id,source.completeness??'full',source.seriesScope.run]);if(!sources.has(key)||rank(source.confidence)>rank(sources.get(key).confidence))sources.set(key,source);}
      prior.sources=[...sources.values()];
      if(issue.confidence==='verified'||prior.confidence!=='verified'&&issue.confidence==='direct')prior.confidence=issue.confidence;
    }
  }
  for(const group of output.values())if(group.units){
    group.issues=[...group.units.values()].map(issue=>comicIssueEvidence(issue,records=>copiesForSources([...new Map(records.map(record=>[record.id,record])).values()]))).sort((a,b)=>{
      const n=value=>value.includes('/')?Number(value.split('/')[0])/Number(value.split('/')[1]):Number(value);
      return n(a.number)-n(b.number)||a.number.localeCompare(b.number,undefined,{numeric:true});
    });Object.assign(group,comicGroupCounts(group));delete group.units;
  }return [...output.values()];
}
