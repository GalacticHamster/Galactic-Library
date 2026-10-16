// Synthetic disposable-profile checks, serialized into installed extension
// pages by the existing Chrome/Firefox runners. Never run in a personal profile.
export async function seedConsoleCompanionLibrary() {
  const S=await import('./src/lib/storage.js'),M=await import('./src/lib/models.js'),P=await import('./src/lib/provider-profiles.js');
  const db=await S.getDatabase();
  for(const [provider,source]of [['nintendo','nintendo-virtual-game-cards'],['playstation','playstation-web-purchased-library'],['xbox','xbox-web-library']]){
    const profile=P.newProviderProfile(provider,'Synthetic companion');
    db.providerProfiles[profile.profileId]=profile;db.providers[provider]={activeProfileId:profile.profileId};
    for(const ownership of ['owned','unknown','subscription','returned']){
      const item=M.normalizeProviderItem({provider,profileId:profile.profileId,providerItemId:'synthetic-native-'+ownership,
        title:'Synthetic native '+provider+' '+ownership,mediaType:'game',ownership,metadata:{source}});
      db.providerItems[item.id]=item;
    }
  }
  await S.restoreDatabase(S.parseBackup(S.createBackup(db)));
}

export async function checkConsoleCompanionResults(send,F=null) {
  const products=[];
  for(const provider of ['nintendo','playstation','xbox'])for(const ownership of ['owned','unknown','subscription','returned'])
    products.push({sourceItemId:provider+'-'+ownership,title:'Synthetic native '+provider+' '+ownership,mediaType:'game',provider,ownership});
  products.push({sourceItemId:'wishlist-only',title:'Synthetic native wishlist-only',mediaType:'game',ownership:'unknown'});
  if(F){
    const saved=await chrome.runtime.sendMessage({type:'FANATICAL_STORE',operation:'wishlist',args:['add',[products[products.length-1]]]});
    if(!saved.ok)throw Error('Could not seed disposable wishlist');
  }
  const items=F?F.galacticRequestItems(products):products.map(product=>({requestId:product.sourceItemId,title:product.title,mediaType:'game',excludeProviders:['humble']}));
  const lookup=F?await F.queryGalacticItems(items,send):null;
  if(lookup?.failed.size)throw Error('Console companion validation failed: '+[...lookup.failures]);
  const results=lookup?.results??new Map((await send({type:'MATCH_ITEMS',apiVersion:1,items})).results.map(row=>[row.requestId,row]));
  for(const product of products){
    const result=results.get(product.sourceItemId),owned=product.ownership==='owned';
    if(!result||result.owned!==owned)throw Error('Incorrect console ownership: '+product.sourceItemId);
    if(product.provider){
      if(result.matches.length!==1||result.matches[0].provider!==product.provider||result.matches[0].ownership!==product.ownership)throw Error('Console identity/access lost');
      if(!result.matches[0].evidence.source.startsWith(product.provider+'-'))throw Error('Console importer provenance lost');
    }else if(result.matches.length)throw Error('Wishlist-only title became a provider match');
    if(F&&F.resolveProduct(product,[],[],()=>result).state!==(owned?'owned-elsewhere':product.provider?'possible':'new'))throw Error('Incorrect FAN console classification');
  }
  const excluded=await send({type:'MATCH_ITEMS',apiVersion:1,items:[{requestId:'excluded',title:products[0].title,mediaType:'game',excludeProviders:['nintendo']}]});
  if(!excluded.ok||excluded.results[0].owned||excluded.results[0].matches.length)throw Error('Native console provider exclusion failed');
  return true;
}
