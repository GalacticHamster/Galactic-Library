import {selectManifest} from '../src/lib/kindle-manifest.js';
import {coverageBook} from './inferred-coverage-fixture.js';
// Minimal saved public contents and product-series context; no account data.
export const perezStatement='George Pérez’s storied run on Wonder Woman continues in these tales from Wonder Woman #36-45 and Wonder Woman Annual #2!';
export function wonderBook(id,title,statement,subject='Wonder Woman (1987-2006)'){
 const source=selectManifest([{selector:'description',text:statement}],title),book=coverageBook(id,source.statement,{title});
 const asin='B'+String([...id].reduce((n,c)=>(n*31+c.charCodeAt(0))%1000000000,0)).padStart(9,'0'),sourceUrl='https://www.amazon.com/dp/'+asin;
 book.metadata.enrichment.kindleProductComicContents={...source,sourceUrl,productDetailsEvidence:{version:1,asin,sourceUrl,observations:[{field:'series',label:'Series',raw:'Part of: '+subject,status:'observed',value:'Part of: '+subject,selector:'#seriesBulletWidget_feature_div'}]}};return book;
}
