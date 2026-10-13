import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {comicCoverageForLibrary} from '../src/ui/comic-coverage-projection.js';
import {proposeContentsForReview} from '../src/lib/contents.js';

const check=(value,message)=>{if(!value)throw Error(message);};
const book=(id,volume,statement)=>coverageBook(id,statement,{title:`Uncanny X-Men Masterworks Vol. ${volume} (Uncanny X-Men (1963-2011))`});
export function annualCoverageFixture(){
  return coverageDatabase(
    book('mw7',7,'Collects Uncanny X-Men #151-159, Avengers Annual #10, X-Men Annual #5.'),
    book('mw8',8,'Collects Uncanny X-Men #160-167 & X-Men Annual #6.'),
    book('mw9',9,'Collects Uncanny X-Men (1981) #168-175, X-Men Annual (1970) #7, Marvel Graphic Novel (1982) #5, Wolverine (1982) #1-4.'),
    book('mw11',11,'Collects Uncanny X-Men (1981) #189-193, X-Men Annual (1970) #8, X-Men and Alpha Flight (1985) #1-2, Kitty Pryde and Wolverine (1984) #1-6.'),
    book('mw12',12,'Collects Uncanny X-Men (1981) #194-200, Annual (1970) #9; New Mutants Special Edition (1985) #1; Nightcrawler (1985) #1-4; material from Bizarre Adventures (1981) #27.'),
    book('mw14',14,'Collects Uncanny X-Men (1981) #210-219, Annual (1970) #10; New Mutants Annual (1984) #2; Fantastic Four vs X-Men (1987) #1-4.'),
    book('mw15',15,'Collects UNCANNY X-MEN (1981) #220-231, X-MEN ANNUAL (1970) #11, X-MEN VS. AVENGERS #1-4 and material from BEST OF MARVEL COMICS.'),
    book('mw16',16,'Collects Uncanny X-Men (1981) #232-243, X-Men Annual (1970) #12, X-Factor (1986) #37-39.'),
    coverageBook('proteus','Collects Uncanny X-Men (1963) #111-128, Annual (1970) #3; Marvel Team-Up (1972) #89; Incredible Hulk Annual (1968) #7.',{title:'X-Men Epic Collection: Proteus'}),
    coverageBook('phoenix','Collects Uncanny X-Men (1963) #129-143, Uncanny X-Men Annual (1970) #4.',{title:'X-Men Epic Collection: The Fate Of The Phoenix'}),
    coverageBook('bishop','Collects Uncanny X-Men (1981) #281-288, Uncanny X-Men Annual (1992) #16, X-Men (1991) #4-9, X-Men Annual (1992) #1, Ghost Rider (1990) #26-27.',{title:"X-Men Epic Collection: Bishop's Crossing"}),
    coverageBook('legacies','Collects Uncanny X-Men (1981) #297-300, Uncanny X-Men Annual (1992) #17, X-Men (1991) #17-23.',{title:'X-Men Epic Collection: Legacies'}),
    coverageBook('cable','Collects New Mutants (1983) #86-94, New Mutants Annual (1984) #5-6, material from X-Men Annual (1970) #14.',{title:'New Mutants Epic Collection: Cable'}));
}
export function checkAnnualCoverageFixture(){
  const database=annualCoverageFixture(),before=JSON.stringify(database),result=comicCoverageForLibrary(database);
  const annual=result.groups.find(group=>group.series.toLowerCase()==='uncanny x-men'&&group.unitType==='annual');
  check(annual?.run==='1963','Original annual sequence unresolved');
  check(JSON.stringify(annual.issues.map(issue=>issue.number))===JSON.stringify(['3','4','5','6','7','8','9','10','11','12','14','16','17']),'Annual contents lost or invented');
  check(annual.covered===12&&annual.partial===1&&annual.duplicates===0,'Partial material became full or duplicates inflated');
  check(annual.issues.find(issue=>issue.number==='14').partial,'Annual #14 must stay partial');
  const separate=result.groups.find(group=>group.series==='X-Men'&&group.unitType==='annual');
  check(separate?.run==='1991'&&separate.issues.length===1&&separate.issues[0].number==='1','Separate 1992 annual series conflated');
  check(JSON.stringify(database)===before,'Annual projection mutated source records');
  const contextual=proposeContentsForReview('Collects Alpha (1981) #168-175, Annual (1970) #7');
  check(contextual.annualRunHints[0].year==='1970'&&!contextual.entries.at(-1).run,'Annual date overwritten by regular title label');
  return {database,annual,separate};
}
