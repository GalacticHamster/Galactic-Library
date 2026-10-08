export function onboardingState(database){
 if(!database)return {loading:true,empty:false,firstRun:false,unnamed:0};
 const profiles=Object.values(database.providerProfiles??{}),empty=Object.keys(database.providerItems??{}).length===0;
 return {loading:false,empty,firstRun:empty&&!profiles.length&&!Object.keys(database.providerHistory??{}).length,unnamed:profiles.filter(p=>!p.nickname).length};
}
export function renderOnboarding(database){
 const state=onboardingState(database),empty=document.querySelector('#empty-library');empty.hidden=!state.empty;
 document.querySelector('#empty-library-heading').textContent=state.firstRun?'Bring your libraries together':'No imported items to show yet';
 document.querySelector('#empty-library-description').textContent=state.firstRun?'Import titles from your signed-in stores and library accounts, then search them together here. Your library is stored in this browser.':'Your saved accounts are still available in Providers. Check their update status or add another library. Filters do not affect this message.';
 const unnamed=document.querySelector('#unnamed-accounts-help');unnamed.hidden=!state.unnamed;
 unnamed.textContent=`${state.unnamed} saved account${state.unnamed===1?' has':'s have'} no nickname yet. Open the provider below and choose Name this account. You can name existing imports without importing them again. Nicknames are labels you choose, not verified website logins.`;
 return state;
}
