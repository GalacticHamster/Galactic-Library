// BEGIN SHARED NATURAL TITLE SORT
// Presentation only: never use these keys for product or issue identity.
(function(global){
  'use strict';
  const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const ordinal=['zeroth','first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth'];
  const tens=['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const tensOrdinal=['twentieth','thirtieth','fortieth','fiftieth','sixtieth','seventieth','eightieth','ninetieth'];
  const atom=word=>{const a=small.indexOf(word),b=ordinal.indexOf(word),c=tens.indexOf(word),d=tensOrdinal.indexOf(word);return a>=0?a:b>=0?b:c>=0?(c+2)*10:d>=0?(d+2)*10:null;};
  function written(words){
    if(!words.length)return null;
    if(words.length===1)return atom(words[0]);
    if(words.length===2&&tens.includes(words[0])){const last=atom(words[1]);return last>0&&last<10?atom(words[0])+last:null;}
    if(words.length>=2&&small.indexOf(words[0])>0&&small.indexOf(words[0])<10&&['hundred','hundredth'].includes(words[1])){
      if(words[1]==='hundredth'&&words.length>2)return null;
      let rest=words.slice(2);if(rest[0]==='and')rest=rest.slice(1);
      const tail=rest.length?written(rest):0;return tail!==null&&tail<100?atom(words[0])*100+tail:null;
    }
    return null;
  }
  function key(title){
    return String(title??'').replace(/\b(book|volume|vol\.?|part)\s+(\d+(?:st|nd|rd|th)?\b|[a-z]+(?:[-\s]+[a-z]+){0,5})/giu,(raw,marker,phrase)=>{
      let value,used;
      if(/^\d/u.test(phrase)){value=Number.parseInt(phrase,10);used=phrase.length;}
      else{
        const tokens=[...phrase.toLowerCase().matchAll(/[a-z]+/gu)];
        for(let n=tokens.length;n>0;n--){value=written(tokens.slice(0,n).map(t=>t[0]));if(value!==null){used=tokens[n-1].index+tokens[n-1][0].length;break;}}
      }
      if(value===null||value===undefined)return raw;
      const label=/^vol/iu.test(marker)?'Volume':marker;
      return label+' '+value+phrase.slice(used);
    });
  }
  const compare=(left,right)=>collator.compare(key(left),key(right))||String(left??'').localeCompare(String(right??''));
  global.LibraryTitleSort=Object.freeze({compare,key});
})(globalThis);
// END SHARED NATURAL TITLE SORT
