import {seriesScope} from './comic-series-merges.js';
import {identityKey} from './identity.js';

// A combined group has its own name, separate from each original member.
// Sorted membership keeps the preference independent of which member owns it.
export function comicCoverageNameKey(group){
  return group.members?.length>1?JSON.stringify([...group.members].sort()):group.id;
}
export function validateComicCoverageNames(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10000)throw Error('Invalid comic series display names.');
  const output={};
  for(const [key,name]of Object.entries(value)){
    try{seriesScope(key);}catch{
      let members;try{members=JSON.parse(key);}catch{throw Error('Invalid named comic series group.');}
      if(key.length>100000||!Array.isArray(members)||members.length<2||members.length>100||new Set(members).size!==members.length||JSON.stringify([...members].sort())!==key)throw Error('Invalid named comic series group.');
      const scopes=members.map(seriesScope);if(scopes.some(scope=>scope[2]!==scopes[0][2]||scope[3]!==scopes[0][3]))throw Error('Named group members must have the same issue type and language.');
    }
    if(name!==null&&(typeof name!=='string'||!name.trim()||name.length>300||/[\u0000-\u001f\u007f]/u.test(name)))throw Error('Enter a series display name of 1–300 characters.');
    output[key]=name===null?null:name.trim();
  }return output;
}
export function defaultComicSeriesName(group){
  if(!group.originalScopes?.length)return group.series;
  const [series,run]=seriesScope(group.id);
  return (group.originalScopes.find(scope=>identityKey(scope.series)===series&&identityKey(scope.run)===run)??group.originalScopes[0]).series;
}
export function comicSeriesDisplayName(group,names={}){
  const key=comicCoverageNameKey(group);
  return Object.hasOwn(names,key)?names[key]??defaultComicSeriesName(group):group.series;
}
