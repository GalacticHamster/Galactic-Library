import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
export function ownershipCoverageFixture(){
  const gods=coverageBook('gods','Collects Wonder Woman #1-7',{title:'Wonder Woman (1987-2006) Vol. 1: Gods and Mortals',ownership:'unknown'});
  Object.assign(gods.metadata,{source:'amazon-kindle-content-library',libraryCategory:'books',originType:'Comixology'});
  const perez=coverageBook('perez','Collects Wonder Woman #1-14',{title:'Wonder Woman by George Perez Vol. 1 (Wonder Woman (1987-2006))'});
  const access=(id,ownership,origin)=>{
    const book=coverageBook(id,'Collects Alpha (2001) #1-3',{title:'Access fixture '+id,ownership});
    Object.assign(book.metadata,{source:'amazon-kindle-content-library',libraryCategory:'books',originType:origin});return book;
  };
  const subscription=access('subscription','subscription','ComicsUnlimited'),unknown=access('unknown','unknown',''),borrowed=access('borrowed','borrowed','PublicLibraryLending');
  return {gods,perez,subscription,unknown,borrowed,database:coverageDatabase(gods,perez,subscription,unknown,borrowed)};
}
