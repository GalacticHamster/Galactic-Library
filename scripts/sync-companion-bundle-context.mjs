import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('shared/bundle-match-context.js',root),'utf8').replace(/^\uFEFF/u,'').trim();
for(const target of [new URL('../HB/ownership.js',root),new URL('../Fanatical/src/shared.js',root)]){
 let text=fs.readFileSync(target,'utf8');
 if(process.argv.includes('--check')){const embedded=text.match(/\/\/ BEGIN SHARED BUNDLE MATCH CONTEXT[\s\S]*?\/\/ END SHARED BUNDLE MATCH CONTEXT/u)?.[0];if(embedded!==source)throw Error('Shared reconciliation drift: '+target.pathname);console.log('Identical shared reconciliation: '+target.pathname);continue;}
 if(text.includes('// BEGIN SHARED BUNDLE MATCH CONTEXT'))text=text.replace(/\/\/ BEGIN SHARED BUNDLE MATCH CONTEXT[\s\S]*?\/\/ END SHARED BUNDLE MATCH CONTEXT/u,source);
 else text=text.replace('/* Purchasing summary presentation only:',source+'\n\n/* Purchasing summary presentation only:');
 fs.writeFileSync(target,text);
 console.log('Synchronized '+target.pathname);
}
