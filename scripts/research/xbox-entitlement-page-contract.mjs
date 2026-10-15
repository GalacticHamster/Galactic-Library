// Offline research contract, not a provider or authentication implementation.
// fetchPage is injected by synthetic tests. This module makes no network calls,
// exports no credentials and changes neither input pages nor library data.
export async function inspectTraversal(fetchPage,{source='collections',maxPages=40}={}) {
  if(!['collections','inventory'].includes(source))throw Error('Unknown source');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>1000)throw Error('Invalid page bound');
  const items=[],seen=new Set();let continuationToken=null,pages=0;
  const result=(reason,traversalComplete=false)=>({source,pages,items,reason,traversalComplete,
    accountLibraryComplete:false,ownershipEstablished:false});
  while(pages<maxPages) {
    let page;
    try {page=await fetchPage({source,continuationToken});}catch{return result('transport-failure');}
    pages++;
    if(!page||page.status!==200)return result('http-failure');
    const body=page.body;
    if(!body||!Array.isArray(body.items)||body.items.some(x=>!x||typeof x!=='object'||Array.isArray(x)))
      return result('invalid-page');
    // Validate continuation shape before accepting this page. Preserve every
    // observation/SKU, including inactive and unrecognized legacy identifiers.
    let next;
    if(source==='inventory') {
      if(!body.pagingInfo||typeof body.pagingInfo!=='object')return result('missing-paging-info');
      next=body.pagingInfo.continuationToken;
    } else next=body.continuationToken;
    if(next!=null&&typeof next!=='string')return result('invalid-continuation');
    items.push(...body.items);
    if(next==null||next==='')return result('source-exhausted',true);
    if(seen.has(next))return result('continuation-cycle');
    seen.add(next);continuationToken=next;
  }
  return result('page-bound');
}
