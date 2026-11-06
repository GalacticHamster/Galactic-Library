// Minimal synthetic acquisition inputs shared by DOM and installed tests.
export function koboRecoveryFixture(scenario,value){
  const url=new URL(value,'https://www.kobo.com'),n=Number(url.searchParams.get('pageNumber')??1),archive=url.pathname.includes('archive'),audio=url.pathname.includes('audiobooks');
  const card=(id,extra='')=>`<article data-is-purchased="true"><a data-book-title="Synthetic ${id}" href="https://www.kobo.com/${audio?'audiobook':'ebook'}/${id}">Read Now</a><span class="book-author">Synthetic Writer</span>${extra}</article>`;
  const link=(label,path)=>`<a href="${url.origin}${path}">${label}</a>`;
  const page=(ids,count,next=false,links='')=>`<main><button>All Items (${count})</button><div class="filter-btn"></div>${ids.map(id=>card(id)).join('')}${ids.length?'':'<p>No items</p>'}</main>${next?`<nav class="pagination"><a class="page-link" data-page="2" href="${url.origin}${url.pathname}?pageNumber=2" rel="next">Next</a></nav>`:''}${links}`;
  if(scenario==='root-failure'&&!archive)return {status:503,html:''};
  const failure=scenario==='later-library'&&!archive&&n===2||scenario==='archive-first'&&archive||scenario==='archive-later'&&archive&&n===2||scenario==='empty-root-fail'&&archive;
  if(failure)return {status:503,html:''};
  if(scenario==='auth-later'&&!archive&&n===2)return {status:401,html:''};
  if(scenario==='malformed-archive'&&archive)return {status:200,html:'<main>Unrecognized</main>'};
  if(scenario==='missing-archive'&&!archive)return {status:200,html:page(['root-1'],1)};
  if(scenario==='all-empty')return {status:200,html:page([],0,false,!archive&&!audio?link('Archive','/library/archive')+link('Audiobooks','/library/audiobooks'):'')};
  if(scenario.startsWith('empty-root')&&audio)return {status:200,html:page([],0)};
  if(scenario.startsWith('empty-root')&&!archive&&!audio)return {status:200,html:page([],0,false,link('Archive','/library/archive')+link('Audiobooks','/library/audiobooks'))};
  if(scenario.startsWith('empty-root')&&archive)return {status:200,html:page(['archive-1'],1)};
  if(audio)return {status:200,html:page(['audio-1'],1)};
  if(archive)return {status:200,html:page([n===1?'archive-1':'archive-2'],2,n===1)};
  let html=page(n===1?Array.from({length:24},(_,i)=>'root-'+(i+1)):['root-25'],25,n===1,link('Archive','/library/archive')+link('Audiobooks','/library/audiobooks'));
  if(scenario==='malformed-row'&&n===1)html=html.replace('data-book-title="Synthetic root-2"','data-book-title="!!!"');
  return {status:200,html};
}
