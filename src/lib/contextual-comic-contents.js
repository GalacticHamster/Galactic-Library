import {identityKey} from './identity.js';

const intro=/^(?:collects?|collecting|includes?|including|contains?|containing)\b\s*:?\s*/iu;
const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
function count(value){
  value=value.toLowerCase();if(/^\d{1,3}$/u.test(value))return Number(value);
  const small=words.indexOf(value);if(small>=0)return small;
  const [ten,one]=value.split(/[- ]/u),tens={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
  return tens[ten]&&(one===undefined||words.indexOf(one)>0&&words.indexOf(one)<10)?tens[ten]+(one?words.indexOf(one):0):0;
}
const clean=value=>String(value??'').replace(/\s+/gu,' ').trim();
function subject(title,context,whole=false){
  if(context.allowTitleBinding===false)return null;
  let qualifier='';
  let name=clean(title).replace(/\s+\((?:[^()]|\([^()]*\))*\)$/u,match=>{if(/^\s+\(\d{4}(?:[-–—]\d{0,4})?\)$/u.test(match))return match;qualifier=match.trim().slice(1,-1);return '';});
  const volume=/\s*[:,-]?\s+\b(?:vol(?:ume)?\.?|book)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.exec(name);
  if(whole&&volume)return null; // A trade's count does not identify a #1 start.
  if(volume)name=name.slice(0,volume.index).trim();
  name=name.replace(/^(.*?\(\d{4}(?:[-–—]\d{0,4})?\))\s*:[\s\S]+$/u,'$1');
  if(!name||/\b(?:omnibus|anthology|box set|collection|collected works|anniversary|retrospective|by)\b|^(?:unknown|unidentified|unspecified)(?:\s+(?:series|book|title))?$/iu.test(name))return null;
  const observed=clean(context.subjectSeries),plain=s=>identityKey(s.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,''));
  const labels=Array.isArray(context.series)?[...new Set(context.series.map(clean).filter(Boolean))]:[];
  if(labels.length>1||labels.length===1&&![plain(name),plain(observed),plain(qualifier)].includes(plain(labels[0])))return null;
  const year=s=>/\((\d{4})(?:[-–—]\d{0,4})?\)/u.exec(s)?.[1];
  if([observed,...labels].some(label=>year(label)&&year(name)&&year(label)!==year(name)))return null;
  const related=observed&&(plain(name)===plain(observed)||plain(name).startsWith(plain(observed)+' ')||plain(qualifier)===plain(observed));
  if(/\b(?:deluxe|edition)\b/iu.test(name)&&!(whole&&qualifier&&plain(qualifier)===plain(observed)))return null;
  if(observed&&!related)return null;
  // Complete standalone products retain their subtitles/sequels even when
  // Amazon's parent series widget names a broader franchise.
  if(whole&&qualifier&&plain(qualifier)===plain(observed))return observed;
  return !whole&&plain(name)===plain(observed)?observed:name;
}
function literalSeries(value){
  const s=clean(value).replace(/[.!?]+$/u,'');
  return s&&s.length<=200&&!/^(?:this|these|a|an)\b/iu.test(s)&&!/[#;]|\b(?:by|issues?|miniseries|series|which|that|from|and the|story arc|storyline|volume|collection|event|published|presented|written|creators?|features?)\b/iu.test(s)?s:null;
}
function expandInitialism(name,anchor){
  const base=anchor?.split(':')[0]?.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,'');
  if(!base)return name;
  const acronym=base.split(/\s+/u).map(w=>w[0]).join('');
  const hit=/^([A-Z]{3,8})(?=\b|:)/u.exec(name);
  return hit&&hit[1]===acronym?base+name.slice(hit[1].length):name;
}

// A parsing copy of ONE selected inclusion statement. Never scans a whole
// description, unions independent claims, guesses publication runs or writes
// source evidence. Unsupported supplements are returned verbatim for review.
export function contextualComicInput(statement,title,context={}){
 const raw=clean(statement).replace(/(?<=\d|[.!?])\s+Read more\s*$/iu,'');if(!intro.test(raw))return null;
 let body=raw.replace(intro,''),changed=false,anchor=subject(title,context),named=[],unparsed=[],evidence=[];
 const explicit=/^(.{2,160}?)\s+(?:issues?\s*)?#\s*\d/u.exec(body);
 if(explicit&&literalSeries(explicit[1]))anchor=explicit[1];
 // Bind a complete SERIES count, never an arbitrary N-issue trade or a count
 // of stories/pages/chapters. The exact product title supplies missing names.
 const counted=/^(?:all\s+([\w-]+(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s+issues|the\s+(?:(?:complete|entire|full|acclaimed|fast-paced)\s+)?([\w-]+)[-–—]issue\s+(?:miniseries|mini-series|series))\b/iu.exec(body);
 if(counted){
   const n=count(counted[1]??counted[2]);let tail=body.slice(counted[0].length),series=subject(title,context,true);
   // A stated start/range beats the conventional #1 start of a complete
   // miniseries. Do not replace #0-based (or otherwise numbered) evidence.
   if(/^\s*[,;]?\s*#\s*\d|^\s+(?:from|starting(?: at| with)?|beginning(?: at| with)?)\s+#?\d/iu.test(tail))return null;
   const of=/^\s+of\s+(.+?)(?=\s*[,;.!?]|$)/iu.exec(tail);
   if(of&&!/^(?:the|this)\s+(?:(?:thrilling|complete|entire|original|acclaimed)\s+)*(?:mini-?series|series)\b/iu.test(of[1])){series=literalSeries(of[1]);if(series)tail=tail.slice(of[0].length);}
   if(n>0&&n<=499&&series){body=series+' #1-'+n;anchor=series;changed=true;evidence.push({kind:'complete-series-count',count:n,series,basis:of&&literalSeries(of[1])?'explicit-series':'collection-title'});
     if(tail.trim()&&!/^[.!?]+$/u.test(tail.trim()))unparsed.push(tail.trim());
     // A named supplementary publication remains part of this claim, not a
     // reason to treat every creator or number in the tail as another issue.
     if(/^\s+and\s+(?:the\s+)?[^#;.!?]{2,160}\b(?:Special|one-shot)\s*[.!?]?$/iu.test(tail)){body+='; '+tail.replace(/^\s+and\s+/iu,'');unparsed.pop();}
     else if(/^\s+(?:and|plus|as well as|along with)\s+(?:the\s+)?[\p{Lu}][^#;]{1,160}#\s*\d/u.test(tail)){body+='; '+tail.replace(/^\s+(?:and|plus|as well as|along with)\s+/iu,'');unparsed.pop();}
   }else return null;
 }
 // Postposed explicit names apply to the WHOLE list before splitting 'and'.
 body=body.replace(/\bissues?\s+(#?\d+(?:\s*(?:[-–—]|through)\s*#?\d+)?(?:\s*(?:and|,)\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*)\s+of\s+([\p{Lu}][^,;.!?]{1,160})/gu,(all,numbers,name)=>{
   const literal=literalSeries(name);if(!literal||!/(?:and|,)\s*#?\d/u.test(numbers))return all;anchor=literal;changed=true;evidence.push({kind:'postposed-series',series:literal});return literal+' '+numbers.replace(/\s+through\s+/giu,'-');
 });
 // Count-independent issue ranges can inherit an unambiguous product subject.
 const range=/^issues?\s+(#?\d+(?:\s*(?:[-–—]|through)\s*#?\d+)?(?:\s*(?:,|and)\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*)/iu.exec(body);
 if(range&&!anchor&&context.allowTitleBinding!==false&&!/^\s+of\b/iu.test(body.slice(range[0].length))){
   const single=/^#?(\d+)(?:\s*(?:[-–—]|through)\s*#?(\d+))?$/iu.exec(range[1]);
   if(single&&Number(single[2]??single[1])>=Number(single[1])&&Number(single[2]??single[1])-Number(single[1])<500)return {input:raw,named:[],unparsed:[],evidence:[{kind:'unresolved-series-range'}],provisionalRanges:[{unitType:'issue',first:single[1],last:single[2]??single[1],reason:'The description supplies issue numbers but does not identify one series.'}]};
 }
 if(range&&/^\s+in\b/iu.test(body.slice(range[0].length)))return null;
 if(range&&anchor&&!/^\s+of\b/iu.test(body.slice(range[0].length))){
   body=anchor+' '+range[1].replace(/\s+through\s+/giu,'-')+body.slice(range[0].length);changed=true;evidence.push({kind:'implicit-series',series:anchor,basis:'captured-product-series-or-volume-title'});
 }
 // A finite promotional tail does not erase the preceding explicit range.
 const promo=/\s+which\s+(?:serve|serves|are|is)\b[\s\S]*$/iu.exec(body);
 if(promo&&/#\s*\d/u.test(body.slice(0,promo.index))){unparsed.push(promo[0].trim());body=body.slice(0,promo.index);changed=true;}
 const extentAt=index=>/\b(?:material|excerpts?|selected (?:stories|pages|material)|backup stories|portions)\s+from\b/iu.test(body.slice(0,index))?'excerpt':'full';
 const plainHost=s=>identityKey(s.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,''));
 const otherHostBefore=index=>[...body.slice(0,index).matchAll(/(?:^|[,;]\s*|\s+and\s+)([\p{Lu}][^#;,]{1,180}?)\s+(?:issues?\s*)?#\s*\d/gu)].some(m=>plainHost(m[1])!==plainHost(anchor??''));
 // A date identifies an annual PUBLICATION, not annual #2022 or regular #1.
 body=body.replace(/(?:^|[,;]\s*(?:and\s+)?|\s+(?:and|as well as)\s+)(?:the\s+)?((?:19|20)\d{2}(?:\s+and\s+(?:19|20)\d{2})*)\s+Annuals?\b(?!\s*#?\d)/giu,(all,years,index)=>{
   if(!anchor||otherHostBefore(index))return all;const observed=clean(context.subjectSeries),parent=observed&&!/\bcollection\b/iu.test(observed)&&identityKey(anchor).startsWith(identityKey(observed)+' ')?observed:anchor;
   for(const year of years.match(/\d{4}/gu))named.push({series:parent.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,'')+' Annual',run:'publication '+year,unitType:'annual',number:'unnumbered',language:'',completeness:extentAt(index)});
   changed=true;evidence.push({kind:'dated-annual',years});return '; ';
 });
 body=body.replace(/(?:^|[,;]\s*(?:and\s+)?|\s+and\s+)(?:the\s+)?((?:19|20)\d{2})\s+Free Comic Book Day\s*(.*?)\s+issue\b(?!\s*#?\d)/giu,(all,year,label,index)=>{
   if(otherHostBefore(index))return all;
   const series=label?expandInitialism(clean(label),anchor):anchor?.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,'');
   if(!series||!anchor||identityKey(series)!==identityKey(anchor.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,'')))return all;
   named.push({series:series+' Free Comic Book Day',run:'publication '+year,unitType:'special',number:'unnumbered',language:'',completeness:extentAt(index)});changed=true;evidence.push({kind:'dated-fcbd',year,series});return '; ';
 });
 body=body.replace(/(?:^|;\s*)(?:the\s+)?([^#;.!?]{2,160}\b(?:Special|one-shot))\s*[.!?]?$/iu,(all,label,index)=>{
   if(!changed||!anchor||/\b(?:by|story|stories|pages|excerpts?)\b/iu.test(label))return all;
   named.push({series:expandInitialism(clean(label),anchor),run:'',unitType:'special',number:'unnumbered',language:'',completeness:extentAt(index)});evidence.push({kind:'named-special',title:label});return '';
 });
 if(!changed)return null;
 return {input:'Collects '+body.replace(/^[\s;,]+|[\s;,.!?]+$/gu,'').replace(/;\s*;/gu,';').replace(/;\s*,?\s*and\s+/giu,'; '),named,unparsed,evidence};
}
