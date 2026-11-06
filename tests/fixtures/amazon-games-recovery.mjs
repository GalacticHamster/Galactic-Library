// Synthetic interactive My Collection. No accounts, provider requests or real codes.
export function mountGamesRecoveryFixture(scenario) {
  const doc=document,old=Array.from({length:19},(_,i)=>i+1),recent=99;
  const list=[...old,20];
  const ranges={'2024':list,'2026':[recent],'past-3-months':[recent]};
  if(scenario==='missing-year')delete ranges['2024'];
  if(scenario==='recent-bad')ranges['past-3-months'].push(37);
  if(scenario==='history')ranges['2024'].push(98);
  if(scenario==='stalled')ranges['2024']=old;
  if(scenario==='mixed')ranges['2024']=[1,30,31,32,33,34,35,36,37,38];
  doc.body.innerHTML='<main><div data-a-target="time-window-filter-dropdown"><p title="2024">2024</p></div><div data-a-target="time-window-filter-flyout"></div><div id="rows"></div><div id="continuation"></div></main>';
  let expansions=0,redemptions=0;const selected=[];
  const publish=()=>{doc.documentElement.dataset.fixtureWork=JSON.stringify({expansions,redemptions,selected});};
  function render(year){
    selected.push(year);const label=year==='past-3-months'?'Past 3 months':year,p=doc.querySelector('[data-a-target="time-window-filter-dropdown"] p');p.title=label;p.textContent=label+' ';
    const rows=doc.querySelector('#rows');rows.textContent='';doc.querySelector('#continuation').textContent='';
    for(const n of ranges[year]){
      const header=doc.createElement('section');header.dataset.aTarget='accordion-header';const button=doc.createElement('button');button.setAttribute('aria-controls',`claim-${year}-${n}-body`);button.setAttribute('aria-expanded','false');button.textContent='Details';
      const h=doc.createElement('h3');h.title='Synthetic game '+n;h.textContent=h.title;
      const status=doc.createElement('span');status.dataset.aTarget='claim-entry-list_label-text';status.textContent='Delivered';
      let destination='Amazon Games library';const date=n===99?'2026-11-01':'2024-07-29';
      const bad=(n===20&&scenario!=='recovered')||n===37;
      if(bad)status.textContent='Unrecognized';
      if(n===30)destination='';
      if([31,34,35].includes(n))status.textContent=n===31?'Claim Code':n===34?'Copy code':'Product key';
      if(n===32)destination='Epic Games Store library';if(n===33)destination='Xbox library';if(n===38)destination='GOG library';
      if(n===36){destination='';status.textContent='Not delivered';}
      const body=doc.createElement('pre');body.id=button.getAttribute('aria-controls');body.hidden=true;body.textContent=bad?'Unrecognized collection entry':`Collected on\n${date}${destination?'\nSent to\n'+destination:''}`;
      button.onclick=()=>{expansions++;body.hidden=!body.hidden;button.setAttribute('aria-expanded',String(!body.hidden));publish();};
      const code=doc.createElement('button');code.textContent='Redeem';code.onclick=()=>{redemptions++;publish();};body.append(doc.createTextNode('\n'),code);
      header.append(button,h,status,body);rows.append(header);
    }
    if(scenario==='stalled'&&year==='2026'){const more=doc.createElement('button');more.textContent='See 10 more';doc.querySelector('#continuation').append(more);}
    if(scenario==='auth'&&year==='2026')rows.insertAdjacentHTML('beforeend','<input type="password">');
    if(['401','403'].includes(scenario)&&year==='2026')rows.insertAdjacentHTML('beforeend',`<div role="alert">HTTP ${scenario}: Access denied</div>`);
    if(scenario==='broken'&&year==='2026')rows.textContent='Unrecognized collection response';
    publish();
  }
  for(const year of Object.keys(ranges)){const b=doc.createElement('button');b.dataset.type=year;b.textContent=year==='past-3-months'?'Past 3 months':year;b.onclick=()=>render(year);doc.querySelector('[data-a-target="time-window-filter-flyout"]').append(b);}
  render(Object.keys(ranges)[0]);
}
