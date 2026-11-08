export async function openProviderPage(url,browser=chrome){
 const target=new URL(url);
 const provider=target.origin==='https://www.humblebundle.com'&&target.pathname.startsWith('/home/purchases')?'humble':target.origin==='https://www.fanatical.com'&&/\/orders\/?$/u.test(target.pathname)?'fanatical':null;
 if(provider){const result=await browser.runtime.sendMessage({type:'OPEN_PURCHASE_IMPORTER',provider});if(!result?.ok)throw Error(result?.error??'Could not open the purchase importer.');return result;}
 if(target.origin==='https://play.xbox.com'&&target.pathname==='/library'){
  const result=await browser.runtime.sendMessage({type:'OPEN_XBOX_IMPORT'});
  if(!result?.ok)throw Error(result?.error??'Could not open Xbox Library.');
  return result;
 }
 return browser.tabs.create({url});
}
