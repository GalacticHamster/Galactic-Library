import '../src/providers/kindle.js';
const page=body=>'<h1 id="productTitle">A Kindle book</h1>'+body;
const bullets=rows=>'<div id="detailBullets_feature_div"><ul>'+rows.map(([label,value])=>`<li><span class="a-text-bold">${label}:</span> ${value}</li>`).join('')+'</ul></div>';
const table=rows=>'<table id="productDetails_detailBullets_sections1">'+rows.map(([label,value])=>`<tr><th>${label}</th><td>${value}</td></tr>`).join('')+'</table>';
export const productDetailsFixtures=[
 {name:'SIKTC supplied bibliographic example',html:page(bullets([['ASIN','B08KHXKTKQ'],['Publisher','BOOM! Studios (December 1, 2020)'],['Language','English'],['ISBN-13','9781646680450'],['Print length','118 pages'],['Series','<a href="/kindle-dbs/product/B08KHXKTKQ">Something is Killing the Children</a>']])),expected:{publisher:'BOOM! Studios',publicationDate:'2020-12-01',isbn13:'9781646680450',pageCount:'118',series:'Something is Killing the Children'}},
 {name:'table unicode and ISBN10',html:page(table([['\u200eISBN-10\u200f','0-306-40615-2'],['Publication date','1 December 2020'],['Language','English&nbsp;'],['Edition','2nd edition'],['File size','10 MB'],['Price','$10'],['Customer rating','5']])),expected:{isbn10:'0306406152',publicationDate:'2020-12-01',edition:'2nd edition',fileSize:'10 MB'}},
 {name:'partial and duplicate labels',html:page(bullets([['Language','English'],['Language','English']])),expected:{language:'English'},count:1},
 {name:'localized date retained without guess',html:page(table([['Publication date','1 Dezember 2020']])),expected:{publicationDate:''}},
 {name:'invalid ISBN retained',html:page(bullets([['ISBN-13','9781646680451']])),expected:{isbn13:''}},
 {name:'conflicting multiple ISBNs',html:page(bullets([['ISBN-13','9781646680450; 9780306406157']])),expected:{isbn13:'9781646680450'},count:2},
 {name:'RPI responsive layout',html:page('<div id="rpi-attribute-book_details-print_length"><span class="rpi-attribute-value">1,118 pages</span></div>'),expected:{pageCount:'1118'}},
 {name:'multiple series and unsafe link',html:page('<div id="seriesBulletWidget_feature_div"><a href="/kindle-dbs/product/B08KHXKTKQ">First series</a><a href="https://evil.example/series/1">Second series</a></div>'),expected:{series:'First series'},count:2},
 {name:'scoped JSONLD',html:page('<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'Book',sku:'B08KHXKTKQ',publisher:{name:'Publisher'},numberOfPages:99,isbn:'9780306406157'},{'@type':'Book',sku:'B000000001',publisher:'Wrong recommendation'}]})+'</script>'),expected:{publisher:'Publisher',pageCount:'99',isbn13:'9780306406157'}},
 {name:'malformed JSON',html:page('<script type="application/ld+json">{bad</script>'),empty:true},
 {name:'no details',html:page('<p>Description only</p>'),empty:true},
 {name:'nonproduct page',html:bullets([['Publisher','Should not be captured']]),empty:true},
 {name:'series without link and breadcrumb',html:page(bullets([['Series','A series']])+'<div id="wayfinding-breadcrumbs_feature_div"><ul><li>Kindle Store</li><li>Kindle eBooks</li><li>History</li></ul></div>'),expected:{series:'A series'}},
 {name:'conflicting ASIN remains evidence',html:page(bullets([['ASIN','B000000001']])),expected:{asin:'B000000001'}},
 {name:'unknown technical and commercial omitted',html:page(table([['Best Sellers Rank','100'],['Review count','100'],['Accessibility','Screen reader supported'],['Guided View','Enabled']])),expected:{accessibility:'Screen reader supported',guidedView:'Enabled'},count:2},
 {name:'publisher duplicates across representations',html:page(bullets([['Publisher','BOOM! Studios (December 1, 2020)'],['Publisher','BOOM! Studios']])),expected:{publisher:'BOOM! Studios',publicationDate:'2020-12-01'},count:2},
 {name:'malformed table without value',html:page('<table id="productDetails_detailBullets_sections1"><tr><th>Language</table>'),empty:true},
 {name:'impossible date',html:page(table([['Publication date','February 30, 2020']])),expected:{publicationDate:''}}
];
export function checkProductDetailsCapture(parse){
 const checks=[];for(const fixture of productDetailsFixtures){
  const result=globalThis.GalacticKindle.kindleProductDetails(parse(fixture.html),'https://www.amazon.com/dp/B08KHXKTKQ');
  if(fixture.empty){if(result!==null)throw Error(fixture.name+' captured unsupported evidence');}
  else{if(result?.asin!=='B08KHXKTKQ')throw Error(fixture.name+' lost product association');for(const [field,value]of Object.entries(fixture.expected))if(!result.observations.some(o=>o.field===field&&o.value===value))throw Error(fixture.name+' incorrect '+field);if(fixture.count&&result.observations.length!==fixture.count)throw Error(fixture.name+' incorrect count');if(result.observations.some(o=>o.url?.includes('evil')||['price','rating','rank'].includes(o.field)))throw Error('Unsafe field/link');}
  checks.push('Product Details: '+fixture.name);
 }return checks;
}

export async function checkProductDetailsUi(parse){
 const {createProductDetails}=await import('../src/ui/product-details.js');
 const evidence=globalThis.GalacticKindle.kindleProductDetails(parse(productDetailsFixtures[0].html),'https://www.amazon.com/dp/B08KHXKTKQ');
 const record={provider:'kindle',mediaType:'book',title:'Example',metadata:{isbn:'9780306406157',enrichment:{kindleProductComicContents:{productDetailsEvidence:evidence}}}};
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../src/ui/ui.css',import.meta.url).href;await new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=reject;document.head.append(css);});
 const before=JSON.stringify(record),started=performance.now(),section=createProductDetails([record],{});document.body.append(section);section.style.maxWidth='300px';
 if(!section.textContent.includes('unverified edition relationship')||!section.textContent.includes('Saved edition:')||section.querySelector('details').open||!section.textContent.includes('118 pages'))throw Error('Product Details UX/provenance incomplete');
 if(JSON.stringify(record)!==before)throw Error('Presentation mutated source');
 if(section.scrollWidth>section.clientWidth+2)throw Error('Product Details overflow');const milliseconds=performance.now()-started;section.remove();
 const long=structuredClone(record);long.metadata.enrichment.kindleProductComicContents.productDetailsEvidence.observations.find(o=>o.field==='publisher').value='LongPublisher'.repeat(30);const wrapped=createProductDetails([long],{});document.body.append(wrapped);wrapped.style.maxWidth='300px';if(wrapped.scrollWidth>wrapped.clientWidth+2)throw Error('Long publisher overflow');wrapped.remove();css.remove();
 return ['Product Details UI: observational ISBN, conflicts, collapsed source evidence and long narrow wrapping; render '+milliseconds.toFixed(2)+' ms'];
}
