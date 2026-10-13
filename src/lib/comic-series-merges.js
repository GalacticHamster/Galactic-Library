export function seriesScope(id){
  let scope;try{scope=JSON.parse(id);}catch{throw Error('Invalid comic series.');}
  if(typeof id!=='string'||id.length>800||!Array.isArray(scope)||scope.length!==4||scope.some(part=>typeof part!=='string')||!scope[0]||!['issue','annual','special'].includes(scope[2])||!scope[3])throw Error('Invalid comic series.');
  return scope;
}
export function compatibleSeries(a,b){
  const left=seriesScope(a),right=seriesScope(b);
  return left.slice(1).every((value,index)=>value===right[index+1]);
}
export function validateComicCoverageMerges(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>1000)throw Error('Invalid comic series merges.');
  const output={},seen=new Set();
  for(const [id,merge]of Object.entries(value)){
    seriesScope(id);
    if(!merge||typeof merge!=='object'||Object.keys(merge).some(key=>!['members','title'].includes(key))||!Array.isArray(merge.members)||merge.members.length<2||merge.members.length>100||!merge.members.includes(id)||typeof merge.title!=='string'||!merge.title.trim()||merge.title.length>300)throw Error('Invalid comic series merge.');
    for(const member of merge.members){if(!compatibleSeries(id,member)||seen.has(member))throw Error('Merged series must have the same run, issue type and language and cannot belong to two groups.');seen.add(member);}
    output[id]={members:[...merge.members],title:merge.title.trim()};
  }return output;
}
export function addSeriesMerge(current,source,target,title){
  const merges=validateComicCoverageMerges(current);
  seriesScope(source);seriesScope(target);
  const sourceGroup=Object.entries(merges).find(([,value])=>value.members.includes(source)),targetGroup=Object.entries(merges).find(([,value])=>value.members.includes(target));
  if(source===target||sourceGroup&&sourceGroup[0]===targetGroup?.[0])throw Error('These series are already combined.');
  if(!compatibleSeries(source,target))throw Error('Choose a series with the same run, issue type and language.');
  const id=targetGroup?.[0]??target,members=[...new Set([...(targetGroup?.[1].members??[target]),...(sourceGroup?.[1].members??[source])])];
  if(sourceGroup)delete merges[sourceGroup[0]];if(targetGroup)delete merges[targetGroup[0]];
  merges[id]={members,title};return validateComicCoverageMerges(merges);
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
    if(!combined){combined={...group,id,series:merge.title,members:merge.members,originalTitles:[],issues:[],units:new Map()};output.set(id,combined);}
    combined.originalTitles.push(group.series);
    for(const issue of group.issues){
      const fraction=/^(\d+)\/(\d+)$/u.exec(issue.number);
      const key=fraction?String(Number(fraction[1])/Number(fraction[2])):/^\d+(?:\.\d+)?$/u.test(issue.number)?String(Number(issue.number)):issue.number;
      const prior=combined.units.get(key);
      if(!prior){combined.units.set(key,{...issue,sources:[...issue.sources]});continue;}
      const sources=new Map();
      const rank=confidence=>confidence==='verified'?3:confidence==='direct'?2:1;
      for(const source of [...prior.sources,...issue.sources])if(!sources.has(source.id)||rank(source.confidence)>rank(sources.get(source.id).confidence))sources.set(source.id,source);
      prior.sources=[...sources.values()];
      if(issue.confidence==='verified'||prior.confidence!=='verified'&&issue.confidence==='direct')prior.confidence=issue.confidence;
    }
  }
  for(const group of output.values())if(group.units){
    group.issues=[...group.units.values()].map(issue=>({...issue,copies:Math.max(1,copiesForSources(issue.sources.map(source=>source.record)))})).sort((a,b)=>{
      const n=value=>value.includes('/')?Number(value.split('/')[0])/Number(value.split('/')[1]):Number(value);
      return n(a.number)-n(b.number)||a.number.localeCompare(b.number,undefined,{numeric:true});
    });group.duplicates=group.issues.filter(issue=>issue.copies>1).length;delete group.units;
  }return [...output.values()];
}
