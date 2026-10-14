import {namedBook} from './named-publications-fixture.js';
import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
export function coverageResolutionFixture(cases){
 const books=cases.map((c,i)=>namedBook(c,100+i)),db=coverageDatabase(...books,coverageBook('idw-run','Collects Teenage Mutant Ninja Turtles (2011) #1-30'),coverageBook('reset-run','Collects Teenage Mutant Ninja Turtles (2024) #1-3'));
 return {books,db,projection:comicCoverageForLibrary(db)};
}
