import {coverageBook} from './inferred-coverage-fixture.js';
export function excerptBook(c,index=0){
 const book=coverageBook('extent-'+index,c.source.statement,{title:c.title});
 book.metadata.enrichment.kindleProductComicContents=structuredClone(c.source);return book;
}
