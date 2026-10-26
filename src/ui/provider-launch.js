export async function openProviderPage(url,browser=chrome){
 const target=new URL(url);
 if(target.origin==='https://play.xbox.com'&&target.pathname==='/library'){
  const result=await browser.runtime.sendMessage({type:'OPEN_XBOX_IMPORT'});
  if(!result?.ok)throw Error(result?.error??'Could not open Xbox Library.');
  return result;
 }
 return browser.tabs.create({url});
}
