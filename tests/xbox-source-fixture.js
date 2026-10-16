// Synthetic website cache shared by VM and installed-extension tests. No account data.
export function installXboxFixture(root){
  const actor='private-local-account',data=new Map(),generators={};
  function add(name,value,scoped=true){
    const key=scoped?['user',actor,name]:[name];data.set(JSON.stringify(key),{status:'success',fetchStatus:'idle',isInvalidated:false,dataUpdatedAt:1000,dataUpdateCount:1,value});
    const options={getOptions:()=>({queryKey:key})};
    generators[name]=scoped?{getUserQuery:id=>({getOptions:()=>({queryKey:['user',id,name]})}),getActiveUserQuery(){throw Error('Do not inspect disposable active aliases');}}:options;
  }
  const rows=Array.from({length:37},(_,i)=>({productId:'X'+String(i).padStart(11,'0'),providerId:'grts-catalog-provider',basicProductInfo:{title:'Synthetic Xbox game '+i,...(i===0?{edition:'Deluxe Edition'}:{})}}));
  const access=new Map(rows.map(row=>[row.productId,{userAccessTypes:new Set([1]),staticMetadata:{productKind:2,supportedPlatforms:new Set([1,2,4])}}]));
  add('active',actor,false);add('profile',{xuid:'1234567890123456'});add('assembled',rows);add('access',access);add('catalogs',[{id:'owned',totalCount:37,previewEntries:rows.slice(0,14).map(row=>({productId:row.productId}))}]);
  const extra=[{productId:'Y00000000000',providerId:'grts-catalog-provider',basicProductInfo:{title:'Bundle container',bundleChildren:['X00000000000']}},{productId:'Y00000000001',providerId:'grts-catalog-provider',basicProductInfo:{title:'Subscription only'}},{productId:'Y00000000002',providerId:'steam',basicProductInfo:{title:'Other provider'}}];
  rows.push(...extra);for(const [i,row]of extra.entries())access.set(row.productId,{userAccessTypes:new Set(i===1?[2]:[1])});
  for(let i=0;access.size<264;i++)access.set('Z'+String(i).padStart(11,'0'),{userAccessTypes:new Set([1])});
  const env={queryClient:{getQueryState:key=>data.get(JSON.stringify(key)),getQueryData:key=>data.get(JSON.stringify(key))?.value},systems:{authentication:{queries:{activeUserId:generators.active,userInfo:generators.profile}},library:{queries:{assembledItems:generators.assembled,resolveCatalogs:generators.catalogs}},contentAccess:{queries:{allProductAccess:generators.access}}}};
  root.__SW_MANAGER__={env};
  root.fixtureXbox={env,data,generators,rows,access,get:name=>data.get(JSON.stringify(name==='active'?[name]:['user',actor,name]))};
}
