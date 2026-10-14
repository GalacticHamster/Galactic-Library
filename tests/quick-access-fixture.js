import {coverageBook,coverageDatabase} from './inferred-coverage-fixture.js';
import {normalizeProviderItem} from '../src/lib/models.js';
import {newProviderProfile} from '../src/lib/provider-profiles.js';

export function quickAccessFixture(){
  const personal=newProviderProfile('kindle','Personal'),family=newProviderProfile('kindle','Family'),kobo=newProviderProfile('kobo','Kobo');
  const add=(id,title,statement,profile=personal)=>normalizeProviderItem({...coverageBook(id,statement,{title}),provider:profile.provider,profileId:profile.profileId});
  const miles=[
    add('miles-one','Miles Morales: Spider-Man (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man (2011) #1-10'),
    add('miles-two','Miles Morales: With Great Power (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man (2011) #11-22 and #16.1'),
    add('miles-three','Miles Morales: Great Responsibility (Ultimate Comics Spider-Man (2011-2013))','Collects Ultimate Comics Spider-Man (2011) #23-28')
  ];
  const other=add('another-collection','Another owned Spider-Man collection','Collects Ultimate Comics Spider-Man (2011) #1-10'),otherAccount=add('miles-one',miles[0].title,'Collects Ultimate Comics Spider-Man (2011) #1-10',family),otherProvider=add('kobo-copy','Kobo comic collection','Collects Alpha (2001) #1',kobo);
  const database=coverageDatabase(...miles,other,otherAccount,otherProvider);
  database.providerProfiles=Object.fromEntries([personal,family,kobo].map(p=>[p.profileId,p]));
  database.providers={kindle:{activeProfileId:personal.profileId,profileLabel:'Personal'},kobo:{activeProfileId:kobo.profileId,profileLabel:'Kobo'}};
  return {database,miles,other,otherAccount,otherProvider,personal,family,kobo};
}
