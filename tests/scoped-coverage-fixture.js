import {coverageBook,coverageDatabase,confirmed,issue} from './inferred-coverage-fixture.js';
// Minimal public contents statement captured from Round Robin; no inventory IDs.
export const roundRobinStatement='Collects Amazing Spider-Man (1963) #351-360, Amazing Spider-Man Annual #25, Spectacular Spider-Man Annual #11, Web of Spider-Man Annual #7, and Spider-Man: Fear Itself (1992)';
export function scopedCoverageFixture(){
 const book=coverageBook('round-robin',roundRobinStatement,{title:'Amazing Spider-Man Epic Collection: Round Robin'});
 book.metadata.enrichment.kindleProductComicContents.sourceUrl='https://www.amazon.com/dp/B000000777';
 book.metadata.enrichment.kindleProductComicContents.productDetailsEvidence={version:1,asin:'B000000777',sourceUrl:'https://www.amazon.com/dp/B000000777',observations:[{field:'publisher',label:'Publisher',raw:'Marvel',status:'observed',value:'Marvel',selector:'#detailBullets_feature_div'},{field:'series',label:'Series',raw:'Part of: Amazing Spider-Man Epic Collection',status:'observed',value:'Part of: Amazing Spider-Man Epic Collection',selector:'#seriesBulletWidget_feature_div'}]};
 const alias=coverageBook('alias','Collects Amazing Spider-Man (1963) #350',{title:'Amazing Spider-Man (1963-1998) Vol. 1'}),annual=coverageBook('annual','Collects Spectacular Spider-Man (1976) Annual #10'),reset=coverageBook('annual-reset','Collects Spectacular Spider-Man (2003) Annual #1');
 const db=coverageDatabase(book,alias,annual,reset);db.contentReviews[annual.id]=confirmed([issue('10',{series:'Spectacular Spider-Man',run:'1976',unitType:'annual'})]);db.contentReviews[reset.id]=confirmed([issue('1',{series:'Spectacular Spider-Man',run:'2003',unitType:'annual'})]);
 return {book,alias,annual,reset,db};
}
