import {mountLibraryRow} from '../src/ui/library-layout.js';

export async function checkCompactProviderLogos(assert){
 const list=document.querySelector('#library-items'),theme=document.documentElement.dataset.ghTheme;
 const wait=async(predicate,message='Compact provider artwork did not load')=>{const deadline=performance.now()+4000;while(!predicate()){if(performance.now()>deadline)throw Error(message);await new Promise(resolve=>setTimeout(resolve,10));}};
 const visible=image=>getComputedStyle(image).display!=='none';
 for(const [providers,title,ownership]of [
  [['steam'],'One provider','owned'],[['steam','humble'],'Two providers','owned'],
  [['steam','kindle','epic','gog'],'Several providers','unknown'],
  [['unmapped-provider'],'Unmapped provider','unknown'],
  [['humble','steam'],'A long collection title '.repeat(12),'owned']
 ]){
  const records=providers.map(provider=>({record:{provider,ownership,recordRef:provider,metadata:{}}})),row={canonical:{title,mediaType:'game'},records},before=JSON.stringify(row),host=document.createElement('li');host.className='library-item';list.append(host);
  let builds=0;mountLibraryRow(host,row,{}, {layout:'compact',onToggle(){}},body=>{builds++;body.textContent='Existing item actions';});
  const summary=host.querySelector('summary'),logos=[...summary.querySelectorAll('.provider-logo')];
  await wait(()=>logos.every(logo=>[...logo.querySelectorAll('img')].every(image=>image.complete&&image.naturalWidth===64)));
  assert(summary.querySelector('.library-compact-media').textContent==='Game'&&summary.querySelector('.library-compact-access').dataset.access===ownership,'Logos preserve media and ownership text');
  assert(summary.querySelectorAll('.library-compact-provider').length===providers.length,'Every distinct provider remains represented');
  for(const logo of logos){const rect=logo.getBoundingClientRect(),image=[...logo.querySelectorAll('img')].find(visible),art=image.getBoundingClientRect();assert(rect.width===24&&rect.height===24&&art.width===24&&art.height===24,'Compact provider artwork renders at 24px');assert(logo.title===logo.getAttribute('aria-label')&&logo.title.length>0&&logo.getAttribute('role')==='img'&&!logo.hasAttribute('aria-hidden'),'Provider tooltip and screen-reader name identify the icon');assert(rect.right<=summary.getBoundingClientRect().right&&rect.bottom<=summary.getBoundingClientRect().bottom,'Provider artwork stays inside its row');}
  const bounds=[summary.querySelector('.library-compact-media'),...summary.querySelectorAll('.library-compact-provider'),summary.querySelector('.library-compact-access')].map(node=>node.getBoundingClientRect());
  assert(bounds.every((rect,index)=>bounds.slice(index+1).every(other=>rect.right<=other.left||other.right<=rect.left||rect.bottom<=other.top||other.bottom<=rect.top)),'Media, providers and ownership indicators never overlap');
  assert(getComputedStyle(summary).gap==='6px','Adjacent provider indicators keep compact six-pixel spacing');
  if(providers.length===1&&providers[0]==='steam'){
   const clone=host.cloneNode(true),logo=clone.querySelector('.provider-logo'),badge=document.createElement('span');badge.className='library-compact-provider';badge.textContent='Steam';logo.replaceWith(badge);list.append(clone);assert(Math.abs(clone.getBoundingClientRect().height-host.getBoundingClientRect().height)<1,'A single provider logo preserves the previous text-row height');clone.remove();
  }
  if(providers.includes('epic')){
   const epic=logos.find(logo=>logo.title==='Epic Games'),sources=logos.flatMap(logo=>[...logo.querySelectorAll('img')].map(image=>image.src));
   assert(logos.map(logo=>logo.title).join('|')==='Epic Games|GOG|Kindle|Steam','Provider order is stable and independent of source observation order');
   for(const mode of ['light','dark']){document.documentElement.dataset.ghTheme=mode;assert(visible(epic.querySelector('[data-logo-theme="'+mode+'"]'))&&!visible(epic.querySelector('[data-logo-theme="'+(mode==='light'?'dark':'light')+'"]')),'Compact Epic follows the resolved '+mode+' theme immediately');assert(JSON.stringify(logos.flatMap(logo=>[...logo.querySelectorAll('img')].map(image=>image.src)))===JSON.stringify(sources),'Theme changes reuse the shared assets');}
   document.documentElement.dataset.ghTheme=theme;
   epic.querySelector('img').dispatchEvent(new Event('error'));assert([...summary.querySelectorAll('.library-compact-provider')].some(badge=>badge.textContent==='Epic Games'&&!badge.querySelector('img')),'Unavailable artwork falls back to a provider-name badge');
  }
  if(providers[0]==='unmapped-provider')assert(!logos.length&&summary.querySelector('.library-compact-provider').textContent==='unmapped-provider','Unmapped providers keep the existing text badge');
  assert(builds===0,'Provider artwork does not eagerly construct item details');summary.focus();assert(document.activeElement===summary&&!summary.querySelector('[tabindex],button,a[href],input'),'Provider indicators preserve keyboard focus on the native disclosure without extra tab stops');summary.click();await wait(()=>builds===1,'Compact row did not expand through its native summary');assert(host.querySelector('details').open&&host.textContent.includes('Existing item actions'),'Provider logos and tooltips do not block row expansion');
  assert(JSON.stringify(row)===before,'Provider display does not change source records or ownership');host.remove();
 }
}
