// Bounded, reviewed bibliographic facts. No ownership or collection membership.
// Sources and maintenance contract: docs/architecture/publication-resolution.md.
export const PUBLICATION_REFERENCE_VERSION=1;
const idw=['IDW','IDW Publishing'],dc=['DC','DC Comics','Vertigo'],marvel=['Marvel','Marvel Entertainment'];
const family=['Teenage Mutant Ninja Turtles: The IDW Collection'];
const tmnt='Teenage Mutant Ninja Turtles';
const finite=(id,title,run,last,aliases,url)=>({id,title,run,publishers:idw,contexts:family,kind:'miniseries',numbers:Array.from({length:last},(_,n)=>String(n+1)),complete:true,aliases,sources:[url]});
const installment=(id,title,run,number,aliases,url)=>({id,title,run,publishers:idw,contexts:family,kind:'installment',numbers:[number],complete:false,aliases,sources:[url]});
const single=(id,title,run,aliases,url,publishers=dc,contexts=[])=>({id,title,run,publishers,contexts,kind:'one-shot',numbers:['unnumbered'],complete:true,aliases,sources:[url]});
export const PUBLICATION_REFERENCES=[
 finite('idw-utrom-2014',tmnt+': Utrom Empire','2014',3,['Utrom Empire'],'https://obnb.uk/p16714965-utrom-empire'),
 finite('idw-time-2014',tmnt+': Turtles in Time','2014',4,['Turtles in Time'],'https://www.comics.org/series/81960/'),
 finite('idw-ghostbusters-2014',tmnt+'/Ghostbusters','2014',4,['TMNT/Ghostbusters'],'https://www.comics.org/series/83902/'),
 finite('idw-mutanimals-2015',tmnt+': Mutanimals','2015',4,['Mutanimals'],'https://www.comics.org/series/86854/'),
 finite('idw-casey-april-2015',tmnt+': Casey & April','2015',4,['Casey & April'],'https://www.comics.org/series/90114/'),
 finite('idw-dimension-2017',tmnt+': Dimension X','2017',5,['Dimension X'],'https://www.comics.org/series/120223/'),
 finite('idw-ghostbusters-2017',tmnt+'/Ghostbusters 2','2017',5,['TMNT/Ghostbusters 2'],'https://www.comics.org/series/118115/covers/'),
 finite('idw-hit-road-2018',tmnt+': Bebop & Rocksteady Hit the Road','2018',5,[tmnt+': Bebop and Rocksteady Hit the Road','Bebop and Rocksteady Hit the Road'],'https://www.comics.org/series/140074/'),
 installment('idw-villains-old-hob',tmnt+' Villains Micro-Series','2013','3',['Old Hob Micro-Series','Micro-Series: Old Hob'],'https://www.comics.org/issue/1120945/'),
 installment('idw-villains-alopex',tmnt+' Villains Micro-Series','2013','4',['Alopex Micro-Series','Micro-Series: Alopex'],'https://www.comics.org/issue/2622473/'),
 installment('idw-villains-karai',tmnt+' Villains Micro-Series','2013','5',['Karai Micro-Series','Micro-Series: Karai'],'https://www.comics.org/issue/1137627/'),
 installment('idw-villains-hun',tmnt+' Villains Micro-Series','2013','6',['Hun Micro-Series','Micro-Series: Hun'],'https://www.comics.org/issue/2560961/'),
 installment('idw-villains-bebop',tmnt+' Villains Micro-Series','2013','7',['Bebop and Rocksteady Micro-Series','Micro-Series: Bebop and Rocksteady'],'https://www.comics.org/issue/2560961/'),
 installment('idw-villains-shredder',tmnt+' Villains Micro-Series','2013','8',['Shredder Micro-Series','Micro-Series: Shredder'],'https://www.comics.org/issue/2138794/'),
 installment('idw-macro-michelangelo',tmnt+' Macro-Series','2018','2',[tmnt+': Macro-Series: Michelangelo','Macro-Series: Michelangelo'],'https://www.comics.org/series/134770/details/'),
 installment('idw-macro-leonardo',tmnt+' Macro-Series','2018','3',[tmnt+': Macro-Series: Leonardo','Macro-Series: Leonardo'],'https://www.comics.org/series/134770/details/'),
 single('idw-usagi-2017',tmnt+'/Usagi Yojimbo','2017',['TMNT/Usagi Yojimbo'],'https://www.comics.org/issue/1724014/',idw,family),
 ...[
  ['holy-terror','Batman: Holy Terror','1991',[]],
  ['blue-grey','Batman: The Blue, the Grey, and the Bat','1992',[]],
  ['dark-joker','Batman: Dark Joker - The Wild','1993',['Batman/Dark Joker: The Wild']],
  ['houdini',"Batman/Houdini: The Devil's Workshop",'1993',[]],
  ['castle','Batman: Castle of the Bat','1994',[]],
  ['darkest-knight','Batman: In Darkest Knight','1994',[]],
  ['allegiances','Batman: Dark Allegiances','1996',[]]
 ].map(([id,title,run,aliases])=>single('dc-'+id,title,run,aliases,'https://www.comics.org/issue/1559057/')),
 {...single('dc-heartland','Heartland','1997',[],'https://www.comics.org/issue/60004/',dc,['Hellblazer']),numbers:['1'],requiresType:true},
 {...single('marvel-confession','Civil War: The Confession','2007',[],'https://www.marvel.com/comics/issue/20777/civil_war_the_confession_1_2007_1',marvel),numbers:['1']},
 {id:'idw-universe-2016',title:tmnt+' Universe',run:'2016',publishers:idw,contexts:family,kind:'ongoing',numbers:Array.from({length:25},(_,n)=>String(n+1)),complete:false,aliases:[],sources:['https://www.comics.org/series/105889/']},
 {id:'idw-ongoing-2011',title:tmnt,run:'2011',publishers:idw,contexts:family,kind:'ongoing',numbers:Array.from({length:150},(_,n)=>String(n+1)),complete:false,aliases:[],sources:['https://www.comics.org/series/60636/']}
];

// Choices for explicit user confirmation only. Never used by automatic parsing
// or resolvePublicationRun. A run denotes the continuing numbering identity,
// not the publication date of every issue/reprint in that sequence.
export const COVERAGE_RESOLUTION_REFERENCES=[
 {id:'mirage-tmnt-1984',title:tmnt,run:'1984',label:'Mirage Volume 1 (1984)',publishers:idw,contexts:['Teenage Mutant Ninja Turtles: The Ultimate B&W Collection'],kind:'ongoing',numbers:Array.from({length:62},(_,n)=>String(n+1)),complete:false,aliases:[],sources:['https://www.comics.org/series/13912/'],note:'The original Mirage publication begins in 1984. The saved Ultimate B&W family and Mirage description support this choice.'},
 {id:'image-tmnt-1996',title:tmnt,run:'1996',label:'Image Volume 3 (1996), with Urban Legends conclusion',publishers:idw,contexts:['Teenage Mutant Ninja Turtles: Urban Legends'],kind:'ongoing',numbers:Array.from({length:26},(_,n)=>String(n+1)),complete:false,aliases:[],sources:['https://www.comics.org/series/12901/','https://www.comics.org/issue/2138395/'],note:'Image originally published #1–23. Urban Legends reprints that sequence and adds the later #24–26 conclusion. This user-confirmed coverage choice keeps the continuing numbering together; it does not date those three issues to 1996.'},
 {...single('mirage-raphael-1985','Raphael, Teenage Mutant Ninja Turtle','1985',['Raphael'],'https://www.comics.org/series/43495/',idw,['Teenage Mutant Ninja Turtles: The Ultimate B&W Collection']),numbers:['1'],label:'Raphael, Teenage Mutant Ninja Turtle (1985) #1',note:'The Mirage one-shot is actually numbered #1. Later reprintings are not additional issue numbers.'}
];
