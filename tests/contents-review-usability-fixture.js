import {coverageBook} from './inferred-coverage-fixture.js';
export const batmanReviewStatement='Collecting the first six issues of the hit series!';
export function batmanReviewBook(){const book=coverageBook('review-batman',batmanReviewStatement,{title:'Batman and Robin (2009-2011) Vol. 1: Batman Reborn (Batman by Grant Morrison series Book 7)'});book.metadata.enrichment.kindleProductComicContents.sourceUrl='https://www.amazon.com/dp/B000000001';return book;}
