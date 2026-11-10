// Hand-authored synthetic purchase: two populated bundles, two direct selections
// grouped by pickAndMix in summaries, and a non-product promotion. No live data.
export function multiBundlePurchase(){
  const bundle=n=>({_id:'synthetic-bundle-'+n,name:'Synthetic collection '+n,bundles:[{games:[{_id:'synthetic-comic-'+n,name:'Synthetic comic '+n,type:'book'}]}]});
  const selection=n=>({_id:'synthetic-selection-'+n,name:'Synthetic selection '+n,type:'book',bundles:[],pickAndMix:'Synthetic pick-and-mix'});
  const promotion={_id:'synthetic-promotion',name:'Synthetic mystery gift',type:'game',isFreeProduct:true,mystery:true,status:'fulfilled',bundles:[],drm:{steam:true}};
  const detail={_id:'synthetic-multi-order',status:'COMPLETE',date:'2026-11-01',items:[selection(1),bundle(1),selection(2),bundle(2),promotion]};
  const sparse={name:'Synthetic pick-and-mix',bundles:[]};
  const summaries=[
    {...detail,items:[detail.items[1],detail.items[3],sparse]},
    {...detail,items:[detail.items[1],detail.items[3],sparse,{name:promotion.name,bundles:[]}]},
    {...detail,items:detail.items.map(item=>item.bundles.length?item:{name:item.name,bundles:[]})}
  ];
  return {detail,summaries};
}
