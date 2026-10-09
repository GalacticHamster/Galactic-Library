import {kindleBroadCategory,validateKindleCategoryPaths} from '../src/lib/kindle-categories.js';
import {libraryBroadGenreValues} from '../src/lib/genre-hints.js';
import '../src/providers/kindle.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const path=labels=>'<div id="wayfinding-breadcrumbs_feature_div"><ul>'+labels.map((label,i)=>'<li><a href="/b/?node='+[133140011,154606011,156104011,156107011,7290674011,900][i]+'">'+label+'</a></li>').join('')+'</ul></div>';
export const breadcrumbFixtures=[
 {name:'three levels',html:path(['Kindle Store','Kindle eBooks','Comics, Manga & Graphic Novels']),broad:'Comics, Manga & Graphic Novels',genre:'Comics & Graphic Novels',count:3},
 {name:'six levels',html:path(['Kindle Store','Kindle eBooks','Literature & Fiction','Genre Fiction','Family Life','Multigenerational']),broad:'Literature & Fiction',genre:'Fiction & Literature',count:6},
 {name:'mystery excludes deep Animals',html:path(['Kindle Store','Kindle eBooks','Mystery, Thriller & Suspense','Mystery','Cozy','Animals']),broad:'Mystery, Thriller & Suspense',genre:'Mystery & Thriller',count:6},
 {name:'comic excludes deep Seasonal',html:path(['Kindle Store','Kindle eBooks','Comics, Manga & Graphic Novels','Graphic Novels','Seasonal']),broad:'Comics, Manga & Graphic Novels',genre:'Comics & Graphic Novels',count:5},
 {name:'partial eBooks anchor',html:path(['Kindle eBooks','History']),broad:'History',genre:'History',count:2},
 {name:'missing eBooks',html:path(['Kindle Store','Comics, Manga & Graphic Novels']),broad:'',count:2},
 {name:'reordered roots',html:path(['Kindle eBooks','Kindle Store','Comics, Manga & Graphic Novels']),broad:'',count:3},
 {name:'navigation outside breadcrumb',html:'<nav><ul><li><a href="/b/?node=1">Kindle eBooks</a></li><li><a href="/b/?node=2">Comics</a></li></ul></nav><div id="zg_browseRoot">Comics Bestseller</div>',empty:true},
 {name:'malformed ID',html:path(['Kindle Store','Kindle eBooks','History']).replace('node=156104011','node=invalid'),empty:true},
 {name:'foreign category link',html:path(['Kindle Store','Kindle eBooks','History']).replace('/b/?node=156104011','https://example.com/b/?node=156104011'),empty:true},
 {name:'product recommendations in breadcrumb rejected',html:path(['Kindle Store','Kindle eBooks','History']).replace('/b/?node=156104011','/dp/B000000001'),empty:true},
 {name:'missing category',html:path(['Kindle Store','Kindle eBooks']),broad:'',count:2},
 {name:'hierarchical search node IDs',html:path(['Kindle Store','Kindle eBooks','History']).replace('/b/?node=156104011','/s?rh=n%3A154606011%2Cn%3A156104011'),broad:'History',genre:'History',count:3},
 {name:'absent breadcrumb',html:'<p>A product description.</p>',empty:true}
];
export function checkKindleCategoryCapture(parse){
 const checks=[];
 for(const fixture of breadcrumbFixtures){
   const paths=globalThis.GalacticKindle.kindleCategoryPaths(parse(fixture.html));
   if(fixture.empty)assert(paths.length===0,fixture.name+' captured noise');
   else{
     assert(paths.length===1,fixture.name+' path count');assert(paths[0].nodes.length===fixture.count,fixture.name+' lost nodes');
     assert(paths[0].nodes[0].nodeId==='133140011',fixture.name+' lost provider node ID');
     assert(kindleBroadCategory(paths[0])===fixture.broad,fixture.name+' incorrect broad level');
     assert(JSON.stringify(validateKindleCategoryPaths(paths))===JSON.stringify(paths),fixture.name+' failed validation');
     const genres=libraryBroadGenreValues({provider:'kindle',mediaType:'book',title:'Unknown story',metadata:{enrichment:{kindleProductComicContents:{categoryPaths:paths}}}});
     assert(fixture.genre?genres.length===1&&genres[0]===fixture.genre:genres.length===0,fixture.name+' classified a deep or malformed category');
   }
   checks.push('Kindle category capture: '+fixture.name);
 }
 return checks;
}
