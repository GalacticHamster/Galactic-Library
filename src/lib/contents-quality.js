/** Discovery quality is independent of bibliographic identity and ownership. */
import {identityKey} from './identity.js';
export const CONTENTS_FILTER_VERSION = 1;
const introduction = /^(?:collects?|collecting|contains?|containing|includes?|including|comprises?)\b\s*[:\-]?\s*/iu;
const units = /#\s*-?\d|\b(?:issues?|volumes?|vols?\.?|books?|chapters?|parts?)\s*#?\d|\b\d+\s*[-–—]\s*\d+\s+of\b/iu;
const works = /\b(?:novels?|stories|story|tales?|antholog(?:y|ies)|omnibus|trilog(?:y|ies)|miniseries|maxiseries|serial|poems?|manifesto|autobiograph\w*|primers?|excerpts?|ending|eulogy|chapters?|one.shots?|issues?|adventures?|appearances?|debuts?|battles|work|republished)\b/iu;

// Positive reprint grammar followed by a finite, explicitly named issue list.
// A bare "from the pages of" or "originally published in" is not a claim.
export function naturalContentsClaims(text,title=''){
  text=String(text??'').slice(0,12000);const claims=[];
  const cue=/\b(?:in these (?:final\s+|\d{4}s\s+)?(?:stories|tales|adventures) from (?:the pages of\s+)?|series with (?:tales|stories) from\s+|these (?:stories|tales|issues) (?:were )?originally published in\s+|(?:this|the) (?:volume|collection) (?:reprints|collects|presents) (?:the )?(?:stories|issues) originally published in\s+|(?:is|are) (?:now )?collected in (?:a single|this|one|a) (?:volume|collection) from the pages of\s+)/giu;
  const number='\\d+(?:/\\d+|\\.\\d+)?(?:\\s*[-–—]\\s*#?\\d+)?';
  const named=new RegExp('^([\\p{L}][^#;,!?\\n]{0,160}?)\\s*#\\s*'+number,'u'),bare=new RegExp('^#\\s*'+number,'u');
  for(const match of text.matchAll(cue)){
    const prefix=text.slice(Math.max(0,match.index-300),match.index).split(/[.!?]\s+/u).at(-1);
    if(/\b(?:not included|not reprinted|does not|also available|first appear\w*|historical references?|recommend\w*|promot\w*)\b/iu.test(prefix))continue;
    let end=match.index+match[0].length,count=0;
    while(end<text.length&&end-match.index<2000){
      const tail=text.slice(end),token=named.exec(tail)??(count?bare.exec(tail):null);if(!token)break;
      if(token[1]&&/\b(?:chapter|first appear\w*|references?|mentions?|was|were|fights?|recalls?|inspired|debuts?|bestsell\w*)\b/iu.test(token[1]))break;
      end+=token[0].length;count++;
      const separator=/^(?:,\s*(?:and\s+)?|;\s*(?:and\s+)?|\s+and\s+)/iu.exec(text.slice(end));
      if(!separator)break;
      const next=text.slice(end+separator[0].length);if(!named.test(next)&&!bare.test(next))break;
      end+=separator[0].length;
    }
    if(count){const raw=text.slice(match.index,end),payload=raw.slice(match[0].length),feature=/^series with|\bfinal (?:tales|stories)\b/iu.test(match[0]);
      if(/^series with/iu.test(match[0])&&!/\b(?:volume|vol\.?|book|collection)\b/iu.test(prefix))continue;
      claims.push({raw,input:'Collects '+(feature?'stories from ':'')+payload,start:match.index,end});}
  }
  // Explicit product/issue equivalence, not an arbitrary marketing mention.
  // A complete issue is stated to double as this volume in the next sentence.
  const equivalence=/\b([\p{Lu}][\p{L}\d &'’:\-]{1,120})\s+#(\d+)\s+is here!\s+Doubling as the (?:final )?volume of the series\b/gu;
  const product=/^(.+?)\s+(?:vol(?:ume)?\.?|book)\s+(?:\d+|one|two|three|four|five)\b/iu.exec(title);
  for(const m of text.matchAll(equivalence))if(product&&identityKey(product[1])===identityKey(m[1])&&!/\b(?:also available|not included|not reprinted)\b/iu.test(text.slice(Math.max(0,m.index-100),m.index)))claims.push({raw:m[0],input:'Collects '+m[1]+' #'+m[2],start:m.index,end:m.index+m[0].length});
  return claims;
}
export function recoveredNaturalContents(saved){
  if(saved?.statement||!Array.isArray(saved?.manifest?.blocks)||saved.manifest.blocks.length>8)return null;
  const claims=[...new Map(saved.manifest.blocks.flatMap(block=>naturalContentsClaims(block.text,saved.manifest.title)).map(claim=>[claim.raw,claim])).values()];
  // Independent descriptions are never blindly combined or silently selected.
  return claims.length===1?claims[0]:null;
}

export function normalizeContentsInput(statement,collectionTitle='') {
  // Never replace the saved evidence with this parsing-only copy.
  let input=String(statement ?? '').replace(/\s+/gu,' ').trim();
  input=input.replace(/^(?:reprints?|reprinting)\b/iu,'Collects');
  // A captured header can lose its separating DOM whitespace. Repair only
  // the parsing copy of a numbered claim at a capitalized title boundary.
  if(/#\s*\d/u.test(input))input=input.replace(/^(Collects|Collecting)(?=\p{Lu})/u,'$1 ');
  const natural=naturalContentsClaims(input,collectionTitle).find(claim=>claim.start===0);
  if(natural)input=natural.input;
  // Only locally parse an already-captured numbered claim. The marker may
  // indicate an unhydrated description; removing it never establishes source
  // completeness and cannot recover omitted later candidate sentences.
  if(/\s+Read more\s*$/iu.test(input) && units.test(input))input=input.replace(/\s+Read more\s*$/iu,'');
  return input
    .replace(/(\d)\.["”]$/u,'$1')
    .replace(/(\d)[.!?](?=\p{Lu})[\s\S]*$/u,'$1')
    .replace(/^(collects?)\s+collects?\s+/iu,'$1 ');
}

export function assessContentsQuality(statement, collectionTitle = '') {
  const normalizedInput=normalizeContentsInput(statement,collectionTitle),body=normalizedInput.replace(introduction,'');
  const descriptionMayBeIncomplete=/\s+Read more\s*$/iu.test(String(statement??''));
  const result=(quality,qualityReason)=>({quality,qualityReason,normalizedInput,descriptionMayBeIncomplete,filterVersion:CONTENTS_FILTER_VERSION});
  if(descriptionMayBeIncomplete && /\s+Read more\s*$/iu.test(normalizedInput))return result('uncertain','The description may be incomplete; no captured numbered claim can safely be normalized.');
  if(!body || /^(?:Ms|Sgt|Gen|Ft)\.?$/iu.test(body))return result('uncertain','The saved fragment is incomplete.');
  // A later explicit work clause survives an earlier credit/plot prelude.
  if(/\bcollect(?:s|ing)?\s+[\s\S]*(?:#\s*\d|\bissues?\s+\d)/iu.test(body))return result('containment','Contains an explicit numbered-work clause.');
  if(/\b(?:to be released|as it[’']s released|reviews\/ratings|collect all[\s\S]*reviews|also available)\b/iu.test(normalizedInput))return result('filtered','Promotes other or future products, not included works.');
  if(/\b(?:box[ -]?set|omnibus|collection|antholog\w*)\b/iu.test(collectionTitle) && /\b(?:Recipes|Processes)\b/u.test(body))return result('uncertain','Possible collection information mixed with feature prose.');
  if(/^(?:(?:his|her|their) own|plenty of them)\b/iu.test(body) || /\b(?:interviews?|correspondence|lineup of our favorites)\b/iu.test(body))return result('uncertain','Potential contained material, but identity or extent is not established.');
  if(/^\d+\)\s+/u.test(body) && !works.test(body))return result('filtered','Enumerates topics rather than identified works.');
  if(/^(?:a |an |the )?(?:description|recap|information|list of characters|look at)\b/iu.test(body))return result('filtered','Describes topics or apparatus rather than contained units.');
  const numbered=units.test(body);
  const identified=works.test(body);
  const nonWorkHead=/^(?:\d+[^,;]{0,80}\b(?:recipes|days|rules|patterns)|more than [^,;]+ pages|(?:new \d+ )?data|how to|characters from|bonus reading group|the pieces of|and governing data|coupons|books about|this novel|either much longer|many examples|any graphic violence|the situation|a colorful history|thirty.plus full.page shots|twenty.nine chapters describing|a company|no card indicating|video signals|generating your own energy|what is|who is)\b/iu;
  if(nonWorkHead.test(body))return result('filtered','Topic, feature, plot or apparatus context rather than an identified contained work.');
  if(!/\bcollect(?:s|ing)?\s+issues?\b|^\s*(?:stories|material|excerpts?|selections?)\s+from\b/iu.test(body)
    && /\b(?:comes the newest volume|come[s]? the newest volume|is here, in|—present|—is here|for the penultimate chapter|takes readers deep|brought [\s\S]*to a new generation)\b/iu.test(body))return result('filtered','Credits or narrative introduction to the product, not a contents list.');
  if(!numbered && /^(?:(?:an?|the|more than|over|newly|original|numerous|a selection of)\s+)*(?:introduction|foreword|maps?|photos?|illustrations?|images?|tables? of contents|wireless delivery|editorial revisions|cross.references|recipes?|step.by.step|how to|characters?|concept designs|concept designs|plot changes)\b/iu.test(body)
    && !/\b(?:original ending|sample chapter|excerpt|tales?|stories|novels?)\b/iu.test(body))return result('filtered','The inclusion concerns apparatus, features or topics, not contained works.');
  if(numbered)return result('containment','Explicit numbered units; series/extent still require parsing.');
  if(identified && !/\b(?:bestsellers for|books on|his first novel|her first novel|but he|plot changes|concept designs|character glossary|recap of|stories told with|story[’']s inherent)\b/iu.test(body))return result('containment','Describes included works or units; interpretation remains unverified.');
  if(/^(?:collects?|collecting)\b/iu.test(normalizedInput) && !/\b(?:women|severed heads|maps|mushrooms|his due|seeds|bounty|tips|information)\b/iu.test(body))return result('containment','Collection claim; explicit structure and scope still need review.');
  if(/["“][^"”]+["”]/u.test(body) && /\b(?:rare|collaboration|tale|story|stories|from)\b/iu.test(body))return result('uncertain','A named work may be included, but surrounding prose needs review.');
  if(/\b(?:rise|encounters|against)\b/iu.test(body))return result('uncertain','A narrative fragment may describe included stories, but does not identify units.');
  if(/^(?:includes?|contains?|comprises?)\b/iu.test(normalizedInput) && /^["“\p{Lu}\d]/u.test(body)
    && /[,;]|\s+and\s+/u.test(body) && !/\b(?:by|his|her|their|is|are|comes|present|himself|description|characters)\b/iu.test(body)){
    const names=body.split(/\s*[,;]\s*|\s+and\s+/u);
    if(names.every(name=>/^[\p{Lu}][\p{L}]+\s+[\p{Lu}][\p{L}]+$/u.test(name) && !/^(?:The|A|An)\s/u.test(name)))return result('uncertain','This list may name contributors rather than contained titles.');
    if(body.split(/[,;]|\s+and\s+/u).length<3 && !/\b(?:collection|omnibus|antholog\w*|box[ -]?set)\b/iu.test(collectionTitle) && !/^["“]/u.test(body))return result('uncertain','A pair of names may be included works or promotion; the subject is unclear.');
    return result('containment','Enumerated inclusion candidate, subject to structural checks.');
  }
  const negative=/\b(?:wireless delivery|information|instructions?|techniques?|strategies|steps|topics?|features?|tips|advice|methods?|problems|pitfalls|facts|tools|skills|secrets|recipes?|smoothies|meals?|foods?|nutritional|ingredients?|vegetables?|gluten|chemicals|vitamins|minerals|charts?|maps?|photos?|photographs?|illustrations?|images?|engravings?|woodcuts?|diagrams?|concept designs|page breakdowns|remastered artwork|original art|character glossary|tables? of contents|cross.references|editorial revisions|plot changes|bonus lessons|reading group guide|introduction by|foreword by|awards?|award.winning|best cover|best holiday|best Christian|first place|reviews|ratings|itinerar\w*|sights|neighborhoods|locations|directions|walking|entrance fees|transportation costs|food places|rail|picket|productivity|communication|management|file sharing|networking|outsourcing|human remains|severed heads|untraceable gun|proof of the deed|graphic content|graphic violence|strong language|sexual encounters|characters?|partner in crime|adversaries|villains?|prot[eé]g[eé]|exgirlfriend|deaths?|murder|blood|seeds of their|contain the situation|contain either|secret code|candy|family|marriage|crime.fighting|activist|missions|working as|dimension|surprises|shocks|poison gases|fights|explosive situation|allergic|digestive|browser|applications?|software|websites?|email|social web|bestsellers for|books on|his first novel|her first novel)\b/iu;
  if(negative.test(body))return result('filtered','Describes credits, topics, plot, apparatus, features or promotion rather than identified contained works.');
  if(/\b(?:writers?|artists?|creators?|contributors?|art by|written by|illustrated by)\b/iu.test(body))return result('filtered','Contributor information without an included-work clause.');
  if(/\b(?:[\p{Lu}\d][\p{L}\d]*:)/u.test(body) || /["“][^"”]+["”]/u.test(body))return result('uncertain','Named text appears in an incomplete context; review before interpreting it.');
  // Finite inclusion lists can be titles; participial fragments lose their subject.
  // Do not decide that short capitalized names are people or works from spelling alone.
  if(/^["“]/u.test(body))return result('containment','Named-work syntax; punctuation and scope still need review.');
  if(/^(?:include|includes|including|contain|contains|containing|comprise|comprises)\b/iu.test(normalizedInput)
    && /^[a-z]/u.test(body) && !identified && !numbered && !/["“]/u.test(body))return result('filtered','Descriptive prose without identifiable contained works or units.');
  return result('uncertain','The saved text lacks sufficient work, subject or extent context.');
}
