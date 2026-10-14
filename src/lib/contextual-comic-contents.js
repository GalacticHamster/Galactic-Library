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
  const observedTitle=clean(context.subjectSeries);
  if(observedTitle&&name.startsWith(observedTitle)&&/^:\s*(?:the\s+)?deluxe edition$/iu.test(name.slice(observedTitle.length)))name=observedTitle;
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
 const retain=(text,kind)=>{if(text.trim())unparsed.push(text.trim());changed=true;evidence.push({kind});};
 // Only a labelled issue/range can use 'to'. Years and story-part counts
 // elsewhere in a description are never rewritten into issue numbering.
 body=body.replace(/(#\s*\d+)\s+(?:to|through)\s+#?(\d+)\b/giu,(all,a,b)=>{changed=true;evidence.push({kind:'explicit-range'});return a+'-'+b;});
 // An explicit issue ordinal remains a regular issue even if its size is
 // described as special. It does not identify a separate Special publication.
 body=body.replace(/\b(?:the\s+)?(?:special\s+)?(?:oversized\s+)?(\d+)(?:st|nd|rd|th)\s+issue\b/giu,(all,n)=>{changed=true;evidence.push({kind:'issue-ordinal',number:n});return '#'+n;});
 // These are bounded grammatical suffixes following an enumerated claim.
 // Retain their literal text; do not accept arbitrary trailing prose.
 const adjectives='(?:(?:classic|ongoing|hit|smash-hit|acclaimed|original|celebrated|Vertigo|seminal|comic|book|Eisner[- ]Award-winning|Award-winning|\\d+-time)\\s+)*';
 body=body.replace(new RegExp('(?<=\\d)\\s+(of\\s+(?:this|the)\\s+'+adjectives+'(?:series|title)\\b|of\\s+creator\\s+[^#;,]{1,100}[\'’]s\\s+'+adjectives+'series\\b|in\\s+[^#;,]{1,100}[\'’]s\\s+'+adjectives+'series\\b)(?=\\s*(?:[.!?]|$|as well as|and\\b|by\\b))','giu'),(all,tail)=>{retain(tail,'series-attribution');return '';});
 if(evidence.some(e=>e.kind==='series-attribution'))body=body.replace(/\s+by\s+[\p{Lu}][\s\S]*$/u,tail=>{retain(tail,'creator-tail');return '';});
 body=body.replace(/\s+(?:the pivotal|the acclaimed)\s+(?=[\p{Lu}][^#;]{1,150}#)/gu,()=>{changed=true;return ' ';});
 const tail=/(?<=\d)\s+(?:Select praise\s*:|There (?:are|is)\b)[\s\S]*$/iu.exec(body);
 if(tail){retain(tail[0],'promotional-tail');body=body.slice(0,tail.index);}
 // A creator/publisher attribution before an explicit series is grammar,
 // not part of its title. Limit removal to an adjective + Comics credit.
 body=body.replace(/^(classic\s+[^#;]{1,60}\bComics\s+)(?=[\p{Lu}][^#;]{1,100}#)/u,(all)=>{retain(all,'publisher-attribution');return '';});
 // Named works preceding a numbered constituent remain reviewable. Only
 // separate at an explicit new title/# boundary, never at title commas.
 const mixed=/^([^#;]+),\s*([\p{Lu}][^#;,]{1,100}\s+#\s*\d[\s\S]*)$/u.exec(body);
 if(mixed&&(mixed[1].match(/:/gu)?.length??0)>=2&&!/\b(?:issues?|annuals?|volumes?|collects?|collecting|material|excerpts?|selections?|stories|pages|portions|backup|selected)\b/iu.test(mixed[1])){
   retain(mixed[1],'named-material');body=mixed[2];
   // Explicitly enumerated named works use the existing PARENT-SCOPED
   // component type. A title is not a made-up #1 or a globally identified
   // comic issue. Preserve commas inside a title; only a fresh title/colon
   // boundary separates these works.
   const names=text=>text.split(/(?:,\s*|\s+and\s+)(?=[\p{Lu}][\p{L}\d /'’&-]{1,80}:)/u).map(clean);
   const tail=/^(.+?#\s*\d+(?:\s*[-–—]\s*#?\d+)?)\s*,\s*([^#]+)$/u.exec(body);
   const labels=[...names(mixed[1]),...(tail?names(tail[2]):[])].map(s=>s.replace(/[.!?]+$/u,''));
   if(title&&labels.every(s=>s.length<=80&&/^[\p{Lu}][\p{L}\d /'’&-]{1,80}:\s*\S/u.test(s)&&!/\b(?:introduction|sketchbook|credits|interview|written by|illustrated by)\b/iu.test(s))){
     for(const label of labels)named.push({series:title,run:'',unitType:'component',number:label,language:'',completeness:'full'});
     if(tail)body=tail[1];
   }
 }
 // Story completeness and host-issue completeness are separate. Keep the
 // original feature wording unresolved, and enumerate only partial hosts.
 const features=/^(stories?\s+(?:starring\s+[^#;]{1,100}?\s+)?from\s+issues?\s+)(#?\d+(?:\s*[-–—]\s*#?\d+)?)([\s\S]*)$/iu.exec(body);
 if(features&&anchor){retain(features[1],'story-feature');body='material from '+anchor+' '+features[2]+features[3];
   body=body.replace(/\s+and\s+(the\s+(?:full-length|complete)\s+(?:tale|story)\s+from\s+#\s*(\d+))\s*[.!]?$/iu,(all,feature,number)=>{retain(feature,'complete-story-not-host');return '; material from '+anchor+' #'+number;});
 }
 // A conventional collection's own explicitly stated story arc can precede
 // a deictic issue list. Its literal source subject must corroborate the book.
 const arc=/^([^#;]{1,180}\s+in\s+)issues?\s+(#\s*\d[\s\S]*)$/iu.exec(body);
 if(arc&&context.subjectSeries&&/^collects?\b/iu.test(raw)&&/\b(?:road|story|arc)\b/iu.test(arc[1])&&title.startsWith(context.subjectSeries)){
   retain(arc[1],'collection-arc');anchor=context.subjectSeries;body=anchor+' '+arc[2];
 }
 // Here the series is literally stated AFTER its issue numbers. Do not
 // mistake that name for a promotional adjective or reuse a previous host.
 body=body.replace(/\bissues?\s+(#?\d+(?:\s*[-–—]\s*#?\d+)?)\s+of\s+(?:the(?: ongoing)?\s+)?([\p{Lu}][^#;,]{1,140}?)\s+(?:ongoing\s+)?series\b/gu,(all,numbers,name)=>{
   const series=literalSeries(name);if(!series||/\b(?:award[- ](?:nominated|winning)|Eisner|acclaimed|classic|celebrated|smash-hit)\b/iu.test(series))return all;changed=true;evidence.push({kind:'postposed-series',series});return series+' '+numbers;
 });
 if(evidence.some(e=>e.kind==='postposed-series')){
   const lead=/^([^#;]+),\s*([\p{Lu}][^#;,]{1,150}\s+#?\d[\s\S]*)$/u.exec(body);
   if(lead&&!/\b(?:issues?|volumes?|material|excerpts?|selections?|stories|pages|portions|backup|selected)\b/iu.test(lead[1])){retain(lead[1],'named-material');body=lead[2];}
 }
 // A deictic 'ongoing series' in a publisher collection can use its literal
 // franchise heading only when the captured product-series label agrees.
 if(!anchor&&/\bissues?\s+#\d[^;]*\bof the ongoing series\b/iu.test(raw)){
   const label=clean(context.subjectSeries),root=/^(.+?):\s+The [\p{L} -]+ Collection$/u.exec(label);
   if(root&&title.startsWith(label+' Vol.'))anchor=root[1];
 }
 if(anchor&&/\bof the ongoing series\b/iu.test(raw)){
   body=body.replace(/(?:^|,\s*)(issues?\s+#\d+(?:\s*[-–—]\s*#?\d+)?)(?:\s+of the ongoing series\b)?/giu,(all,range,index)=>{changed=true;evidence.push({kind:'implicit-series',series:anchor});return (index?'; ':'')+anchor+' '+range;});
 }
 // Complete named saga counts require the exact captured series label to
 // occur in the collection title AND the claim. A trade volume cannot supply
 // an implicit miniseries or a #1 start through this path.
 const saga=/^the complete ([\w-]+)-issue ([^#;,]{1,100}) saga\b/iu.exec(body);
 if(saga&&context.subjectSeries){
   const label=clean(context.subjectSeries),base=label.replace(/\s*\(\d{4}(?:[-–—]\d{0,4})?\)$/u,''),n=count(saga[1]);
   if(n>0&&n<500&&title.startsWith(label)&&(saga[2]===base||saga[2].endsWith(' '+base))&&!/(?<!\p{L})(?:vol(?:ume)?\.?|book)\s+\d/iu.test(title)){retain(saga[0],'complete-named-saga');body=label+' #1-'+n+body.slice(saga[0].length);}
 }
 const explicit=/^(.{2,160}?)\s+(?:issues?\s*)?#\s*\d/u.exec(body);
 if(explicit&&literalSeries(explicit[1]))anchor=explicit[1];
 // Bind a complete SERIES count, never an arbitrary N-issue trade or a count
 // of stories/pages/chapters. The exact product title supplies missing names.
 const counted=/^(?:all\s+([\w-]+(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s+issues|the\s+(?:(?:complete|entire|full|acclaimed|fast-paced)\s+)?([\w-]+)[-–—]issue\s+(?:(\d{4})\s+)?(?:miniseries|mini-series|series))\b/iu.exec(body);
 if(counted){
   const n=count(counted[1]??counted[2]);let tail=body.slice(counted[0].length),series=subject(title,context,true);
   // A stated start/range beats the conventional #1 start of a complete
   // miniseries. Do not replace #0-based (or otherwise numbered) evidence.
   if(/^\s*[,;]?\s*#\s*\d|^\s+(?:from|starting(?: at| with)?|beginning(?: at| with)?)\s+#?\d/iu.test(tail))return null;
   const of=/^\s+of\s+(.+?)(?=\s*[,;.!?]|$)/iu.exec(tail);
   if(of&&!/^(?:the|this)\s+(?:(?:thrilling|complete|entire|original|acclaimed)\s+)*(?:mini-?series|series)\b/iu.test(of[1])){series=literalSeries(of[1]);if(series)tail=tail.slice(of[0].length);}
   const existingYear=/\((\d{4})/u.exec(series??'')?.[1];if(counted[3]&&existingYear&&counted[3]!==existingYear)return null;
   if(n>0&&n<=499&&series){if(counted[3]&&!existingYear)series+=' ('+counted[3]+')';body=series+' #1-'+n;anchor=series;changed=true;evidence.push({kind:'complete-series-count',count:n,series,basis:of&&literalSeries(of[1])?'explicit-series':'collection-title'});
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
 const range=/^(?:(?:the\s+)?issues?\s+|(?=\d+\s*[-–—]))(#?\d+(?:\s*(?:[-–—]|through)\s*#?\d+)?(?:\s*(?:,|and)\s*#?\d+(?:\s*[-–—]\s*#?\d+)?)*)/iu.exec(body);
 // Unlabelled numbers alone could refer to volumes or other units. Require
 // explicit comic/issue context in this captured description, not merely a
 // product title that happens to contain a volume number.
 if(range&&!/^(?:the\s+)?issues?\b/iu.test(body)&&!/\b(?:single[- ]issue|comics?|comic book|issues)\b/iu.test(context.extentDescription??''))return null;
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
 body=body.replace(/(?:^|[,;]\s*(?:(?:and|plus)\s+)?|\s+(?:and|plus|as well as)\s+)(?:the\s+)?((?:19|20)\d{2}(?:\s+and\s+(?:19|20)\d{2})*)\s+Annuals?\b(?!\s*#?\d)/giu,(all,years,index)=>{
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
