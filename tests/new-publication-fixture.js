import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
export function newPublicationFixture(){
 const first=coverageBook('lucifer-book-one','Collects Lucifer #1-8; Hellblazer (1988) #1.',{title:'Lucifer: Book One'});
 const second=coverageBook('lucifer-book-two','Collects Lucifer #9-12.',{title:'Lucifer: Book Two'});
 const later=coverageBook('lucifer-later','Collects Lucifer (2015-2017) #1-13.',{title:'Lucifer: Later Collection'});
 const newest=coverageBook('lucifer-newest','Collects Lucifer (2018) #1-12.',{title:'Lucifer: New Collection'});
 const database=coverageDatabase(first,second,later,newest),projection=comicCoverageForLibrary(database);
 const row=projection.dispositions.find(r=>r.recordRef===first.recordRef),ids=row.observations.filter(o=>o.resolved.series==='Lucifer').map(o=>o.id);
 return {first,second,later,newest,database,projection,row,ids,definition:{series:'Lucifer',startYear:'2000',endYear:'2006'}};
}
