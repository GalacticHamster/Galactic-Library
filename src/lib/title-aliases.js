import {object,strings,text,date} from './validation.js';

export function validateTitleAliases(value={}){
  object(value,'Title aliases');if(Object.keys(value).length>50000)throw new Error('Too many title aliases.');
  return Object.fromEntries(Object.entries(value).map(([ref,entry])=>{
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(ref))throw new Error('Invalid alias record reference.');object(entry,'Title alias');
    const titles=strings(entry.titles,20,500,'Alternate titles').map(title=>title.trim()).filter(Boolean);
    if(!titles.length)throw new Error('An alias needs an alternate title.');
    return [ref,{titles:[...new Set(titles)],note:text(entry.note??'',1000,'Alias evidence'),updatedAt:date(entry.updatedAt)}];
  }));
}
