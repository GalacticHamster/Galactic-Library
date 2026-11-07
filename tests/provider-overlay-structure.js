// Content and DOM contract shared by the installed-browser overlay fixtures.
// Expectations describe provider behavior, independently of the renderer's copy.
const expectations={
  steam:[/games and DLC/u,/newly added or previously unidentified/u,/Full rescan.*complete supported Steam/u,/Earlier saved titles stay/u],
  gog:[/hidden games/u,/Quick update.*newest-first/u,/until.*page already saved/u,/Full rescan.*every available.*hidden-games/u],
  epic:[/games and add-ons/u,/Sync Epic library.*each time/u,/does not stop at previously saved/u],
  'amazon-games':[/other stores are excluded/u,/Quick update.*past three months/u,/Full rescan.*calendar years/u,/initial import.*70 days.*automatically checks all years/u],
  audible:[/Owned, subscription, expired and unconfirmed/u,/Quick update.*previously saved/u,/current and previous calendar years/u,/Full rescan.*all available history years/u,/ownership evidence and acquisition dates/u],
  kindle:[/Kindle library/u,/Quick update.*newest Kindle pages.*already saved/u,/Full rescan.*supported library/u],
  'amazon-video':[/movies and TV/u,/Quick update.*already saved group/u,/Full rescan.*purchase labels/u,/Earlier saved titles stay.*complete listing/u],
  'fandango-at-home':[/movies and TV shows/u,/Quick update.*Recently Purchased.*known titles/u,/Full rescan.*reported counts/u,/no replacement library is saved/u],
  kobo:[/Library presence alone does not confirm ownership/u,/Quick update.*My Books/u,/Full rescan.*Archive and Audiobooks/u,/preference and manual corrections remain separate/u],
  fanatical:[/completed Fanatical orders/u,/Quick update.*new completed orders/u,/Full rescan.*all completed orders/u],
  humble:[/books, audiobooks, games and entitlements/u,/Quick update.*pending key-status/u,/Full rescan.*all supported purchases.*previously saved/u],
  xbox:[/web-visible Xbox Owned.*not your complete/u,/both inspect the entire supported web list/u,/Quick update does not traverse less/u,/Full rescan records a complete supported-list check/u,/Both keep earlier saved items/u],
  playstation:[/PS4\/PS5 Purchased.*lifetime purchase history/u,/both inspect the entire supported listing/u,/Quick update does not traverse less/u,/Full rescan records a complete supported-list check/u,/Both keep earlier saved items/u],
  nintendo:[/complete non-hidden.*loaded by Nintendo/u,/Both actions require.*complete loaded Nintendo list/u,/Quick update validates every loaded card/u,/Full rescan refreshes all loaded cards/u,/earlier saved cards are retained/u]
};
export function checkProviderOverlayStructure(root,provider){
  const check=(ok,message)=>{if(!ok)throw Error(provider+': '+message);};
  const before=(a,b)=>Boolean(a&&b&&(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING));
  const intro=root.querySelector('[data-import-description]'),account=root.querySelector('[data-provider-account]');
  const helps=root.querySelectorAll('[data-import-help]'),help=helps[0],status=root.querySelector('.status,[data-import-status]');
  const actions=[...root.querySelectorAll('[data-mode="incremental"],[data-mode="full"],[data-import-action]')];
  check(intro&&intro.textContent.trim()&&!intro.closest('details'),'visible introduction missing or nested in help');
  check(!/Quick update|Full rescan|baseline|pagination/u.test(intro.textContent),'process details in introduction');
  check(helps.length===1&&[...root.querySelectorAll('summary')].filter(e=>e.textContent==='How importing works').length===1,'exactly one import help required');
  check(!help.hidden&&!help.open&&help.querySelector('summary').textContent==='How importing works','help must start collapsed');
  check(before(intro,account)&&before(account,actions[0])&&actions.every(a=>before(a,status))&&before(status,help),'intro/account/actions/status/help order');
  const [introPattern,...helpPatterns]=expectations[provider];
  check(introPattern.test(intro.textContent),'supported content description missing');
  for(const pattern of helpPatterns)check(pattern.test(help.textContent),'operational explanation missing: '+pattern);
  // Detect copied sentences and near-identical text, rather than only an exact clone.
  const words=text=>text.toLowerCase().match(/[a-z0-9]+/gu)??[];
  const grams=text=>{const w=words(text);return new Set(w.slice(1).map((v,i)=>w[i]+' '+v));};
  const a=grams(intro.textContent),b=grams(help.querySelector('p').textContent);
  const intersection=[...a].filter(v=>b.has(v)).length;
  check(intersection/Math.min(a.size,b.size)<0.65,'introduction and help are near-duplicates');
  for(const sentence of intro.textContent.split(/[.!?]/u).map(s=>s.trim()).filter(s=>s.length>25))check(!help.textContent.includes(sentence),'copied introductory sentence');
  if(provider==='epic'){
    check(actions.length===1&&!/Quick update|Full rescan/u.test(help.textContent),'unsupported incremental/full action');
    check(actions[0].textContent===(provider==='epic'?'Sync Epic library':'Import Nintendo cards'),'single action changed');
  }else check(actions.map(a=>a.textContent).join('|')==='Quick update|Full rescan','two-action order changed');
  const contents=root.querySelector('[data-book-contents-workflow]');
  if(provider==='kindle'){
    check(contents&&before(help,contents)&&help.parentNode===contents.parentNode,'Kindle import help must precede contents');
    check(!contents.contains(status)&&!contents.contains(help),'import status/help mixed with contents');
    check([...contents.querySelectorAll('summary')].some(s=>s.textContent==='How contents discovery works'),'contents help missing');
    check(root.querySelector('.contents-controls [data-action="comic-contents"]'),'stable contents footer missing');
  }
  for(const diagnostic of root.querySelectorAll('details[data-provider-diagnostic]'))check(before(contents??help,diagnostic),'diagnostics precede normal workflows');
  help.querySelector('summary').click();check(help.open,'help does not expand');
  help.querySelector('summary').click();check(!help.open,'help does not collapse');
  check(root.querySelector('[data-profile-summary] p').textContent==='Using a different account on this site? Select Change account first.','account reminder mismatch');
}
