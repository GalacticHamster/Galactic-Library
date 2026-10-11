import {object,text,date} from './validation.js';

// Display metadata only. Source titles and identity keys remain authoritative.
export function validateDisplayTitlePreferences(value={}){
  object(value,'Preferred titles');
  if(Object.keys(value).length>500000)throw Error('Too many preferred titles.');
  return Object.fromEntries(Object.entries(value).map(([ref,choice])=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(ref))throw Error('Invalid preferred-title source.');
    object(choice,'Preferred title');
    const title=text(choice.title,1000,'Preferred title');
    if(!title.trim())throw Error('Choose a nonempty source title.');
    return [ref,{title,updatedAt:date(choice.updatedAt)}];
  }));
}

export function preferredDisplayTitle(groups){
  return groups.flatMap(group=>Object.entries(group.displayTitlePreferences??{}))
    .sort(([a,x],[b,y])=>(y.updatedAt??'').localeCompare(x.updatedAt??'')||a.localeCompare(b))[0]?.[1].title;
}
