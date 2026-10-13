import {mergeCoverageGroups} from '../lib/comic-series-merges.js';
import {comicCoverage} from '../lib/comic-coverage.js';
import {acquisitionHistory,consolidateLibraryRows} from './library-acquisitions.js';
// Existing acquisition groups prevent sync observations/free repeated claims
// from masquerading as additional copies of one product. Distinct supporting
// products can each contribute one copy of an included issue.
export function comicCoverageForLibrary(database,merges={}){
  const owners=new Map(),counts=new Map();
  const rows=Object.values(database.canonicalItems??{}).filter(canonical=>canonical.mediaType==='book'||canonical.providerItemIds.some(id=>database.providerItems[id]?.mediaType==='book')).map(canonical=>({canonical,records:canonical.providerItemIds.map(id=>({record:database.providerItems[id]})).filter(value=>value.record)}));
  for(const row of consolidateLibraryRows(rows,database))for(const {record}of row.records)owners.set(record.id,row.canonicalIds[0]);
  const copiesForSources=records=>{
    const key=JSON.stringify(records.map(record=>record.id).sort());if(counts.has(key))return counts.get(key);
    const products=new Map();for(const record of records){const id=owners.get(record.id)??record.id,rows=products.get(id)??[];rows.push(record);products.set(id,rows);}
    const count=[...products.values()].reduce((sum,rows)=>sum+Math.max(1,acquisitionHistory(rows,database).ownedGroups),0);counts.set(key,count);return count;
  };
  const result=comicCoverage(database,{copiesForSources});
  return {...result,groups:mergeCoverageGroups(result.groups,merges,copiesForSources)};
}
