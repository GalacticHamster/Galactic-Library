import fs from 'node:fs';
const root=new URL('../',import.meta.url),source=fs.readFileSync(new URL('shared/natural-title-sort.js',root),'utf8').replace(/\r\n?/gu,'\n').trim();
for(const target of [new URL('../HB/shared.js',root),new URL('../Fanatical/src/shared.js',root)]){
  let text=fs.readFileSync(target,'utf8');const block=/\/\/ BEGIN SHARED NATURAL TITLE SORT[\s\S]*?\/\/ END SHARED NATURAL TITLE SORT/u;
  if(process.argv.includes('--check')){if(text.match(block)?.[0]?.replace(/\r\n?/gu,'\n')!==source)throw Error('Title sorting drift: '+target.pathname);}
  else{fs.writeFileSync(target,block.test(text)?text.replace(block,source):text+'\n'+source+'\n');}
}
