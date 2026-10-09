function compactText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * Humble's purchase name is preserved with each entitlement. When it plainly
 * identifies a book/comic bundle, it is stronger evidence for a broad genre
 * than a partial title match from an outside catalogue. This is derived at
 * display time, so existing imports gain the hint without another sync.
 */
export function humbleBundleGenreHints(record) {
  if (record?.provider !== 'humble' || record?.mediaType !== 'book') return [];
  const bundle = compactText(record.metadata?.sourceBundle);
  if (!bundle || !/\b(?:comic(?:s| books?)?|manga|graphic novels?)\b/iu.test(bundle)) return [];
  return [{
    source: 'humble-bundle-name',
    confidence: 'explicit-bundle-name',
    category: 'Comics & Graphic Novels',
    evidence: bundle
  }];
}

function explicitBundleComicHint(record, provider, field, source) {
  if (record?.provider !== provider || record?.mediaType !== 'book') return [];
  const bundle = compactText(record.metadata?.[field]);
  if (!bundle || !/\b(?:comic(?:s| books?)?|manga|graphic novels?)\b/iu.test(bundle)) return [];
  return [{ source, confidence: 'explicit-bundle-name', category: 'Comics & Graphic Novels', evidence: bundle }];
}

export function fanaticalBundleGenreHints(record) {
  return explicitBundleComicHint(record, 'fanatical', 'bundleTitle', 'fanatical-bundle-name');
}

export function kindleComicMangaHints(record) {
  if (record?.provider !== 'kindle' || record?.mediaType !== 'book') return [];
  const originType = compactText(record.metadata?.originType);
  const contentType = compactText(record.metadata?.contentType);
  if (!/\b(?:comixology|comicsunlimited)\b/iu.test(originType) && !/\b(?:comic(?:s| books?)?|manga|graphic novels?)\b/iu.test(contentType)) return [];
  return [{
    source: 'kindle-library-type',
    confidence: 'provider-explicit',
    category: 'Comics & Graphic Novels',
    evidence: originType || contentType
  }];
}

function catalogueComicMangaHints(record) {
  if (record?.mediaType !== 'book') return [];
  const sources = [
    ['open-library-subject', record.metadata?.enrichment?.openLibrary?.subjects],
    ['google-books-category', record.metadata?.enrichment?.googleBooks?.categories],
    ['google-books-genre-hint', record.metadata?.enrichment?.googleBooksGenreHint?.categories],
    ['approved-local-metadata',record.metadata?.enrichment?.localMetadata?.approved?record.metadata.enrichment.localMetadata.categories:[]]
  ];
  return sources.flatMap(([source, values]) => distinctText(values)
    .filter((value) => /\b(?:comic(?:s| books?)?|manga|graphic novels?)\b/iu.test(value))
    .map((evidence) => ({ source, confidence: 'catalogue-explicit-category', category: 'Comics & Graphic Novels', evidence })));
}

// This deliberately excludes title/character-name guesses. It is the strict
// classification evidence for display and optional discovery priority.
export function comicMangaEvidence(record) {
  return [
    ...kindleComicMangaHints(record),
    ...humbleBundleGenreHints(record),
    ...fanaticalBundleGenreHints(record),
    ...catalogueComicMangaHints(record)
  ];
}

export function isConfirmedComicManga(record) {
  return comicMangaEvidence(record).length > 0;
}

function distinctText(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values]).flatMap((value) => Array.isArray(value) ? value : [value]).flatMap((value) => {
    const text = compactText(value);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

export function libraryGenreSubjectValues(record) {
  return distinctText([
    record?.metadata?.enrichment?.openLibrary?.subjects,
    record?.metadata?.enrichment?.googleBooks?.categories,
    record?.metadata?.enrichment?.googleBooksGenreHint?.categories,
    record?.metadata?.enrichment?.localMetadata?.approved?record.metadata.enrichment.localMetadata.categories:[],
    comicMangaEvidence(record).map((hint) => hint.category)
  ]);
}

export const BROAD_GENRE_RULES = [
  ['Comics & Graphic Novels', /\b(?:comics?|manga|graphic novels?)\b/iu],
  ['Science Fiction & Fantasy', /\b(?:science fiction|sci[ -]?fi|fantasy|space opera|cyberpunk|dystopi[acn])\b/iu],
  ['History', /\b(?:history|historical|military history|world war|ancient history|medieval)\b/iu],
  ['Mystery & Thriller', /\b(?:mystery|thriller|crime|detective|suspense)\b/iu],
  ['Romance', /\b(?:romance|love stories?)\b/iu],
  ['Horror', /\b(?:horror|ghost stories?|occult)\b/iu],
  ['Biography & Memoir', /\b(?:biograph(?:y|ies)|memoir|autobiograph(?:y|ies))\b/iu],
  ['Business & Finance', /\b(?:business|finance|economics|investing|management)\b/iu],
  ['Technology & Computing', /\b(?:computers?|programming|software|technology|internet)\b/iu],
  ['Cooking & Food', /\b(?:cook(?:ing|books?)?|food|recipes?|culinary)\b/iu],
  ['Health & Fitness', /\b(?:health|fitness|diet|nutrition|wellness)\b/iu],
  ['Religion & Spirituality', /\b(?:religion|spirituality|christian|bible|theology)\b/iu],
  ['Children & Young Adult', /\b(?:juvenile|young adult|children|kids)\b/iu],
  ['Arts & Photography', /\b(?:art|photography|music|performing arts)\b/iu],
  ['Fiction & Literature', /(?:^(?:prose )?fiction$|\bliterature\b|\bliterary\b|^fiction\s*\/)/iu],
  ['Nonfiction', /\b(?:nonfiction|non-fiction)\b/iu],
  ['Science', /\b(?:science(?! fiction)|mathematics|physics|chemistry|biology|astronomy)\b/iu],
  ['Education & Reference', /\b(?:education|reference|encyclopedi[ae]|dictionaries|study aids)\b/iu],
  ['Philosophy', /\bphilosophy\b/iu],
  ['Travel', /\btravel\b/iu],
  ['Sports & Recreation', /\b(?:sports?|recreation)\b/iu],
  ['Law', /\blaw\b/iu],
  ['Poetry', /\bpoetry\b/iu]
];

const COMICS='Comics & Graphic Novels';
// Retrieval vocabulary, never identity, ownership or scan-eligibility evidence.
const COMIC_SERIES=/\b(?:batman|superman|spider[ -]?man|x[ -]?men|avengers|fantastic four|hulk|iron man|thor|daredevil|moon knight|teenage mutant ninja turtles|tmnt|spawn|hellboy|hellblazer|judge dredd|the walking dead|something is killing the children|transformers)\b/iu;
const COMIC_PUBLISHER=/^(?:marvel(?: comics| entertainment)?|dc(?: comics)?|image(?: comics)?|dark horse(?: comics)?|idw(?: publishing)?|valiant(?: entertainment)?|boom!? studios|dynamite(?: entertainment)?|archie(?: comics)?|oni press|fantagraphics(?: books)?|first second)$/iu;
const COMIC_STRUCTURE=/(?:#\s*\d|\b(?:annual|one[ -]shot|miniseries|trade paperback|tpb|omnibus|collected edition)\b)/iu;
const VOLUME=/\b(?:vol(?:ume)?\.?\s*\d|collected\s+(?:issues?|volumes?))\b/iu;
const NON_COMIC=/\b(?:prose|novelization|a novel|art ?books?|art of|encyclopedi[ae]|reference|film guides?|movie guides?|history of comics|comics history|behind the scenes)\b/iu;
const negativeLabel=value=>NON_COMIC.test(value)||/^(?:novels?|prose fiction)$/iu.test(value);

export function normalizedLibraryCategories(label) {
  const value=compactText(label);
  return BROAD_GENRE_RULES.filter(([genre,pattern])=>pattern.test(value)&&!(genre===COMICS&&/\b(?:history of comics|comics history)\b/iu.test(value))).map(([genre])=>genre);
}

/** Display-only projection. Original source labels and contradictions stay intact.
 * Explicit categories coexist; only inferred comic format is blocked by stronger
 * contrary format evidence. Approved local categories can explicitly reject it. */
export function libraryCategoryEvidence(record) {
  if(!['book','audiobook'].includes(record?.mediaType))return [];
  const metadata=record.metadata??{},enrichment=metadata.enrichment??{},entries=[];
  const add=(source,authority,confidence,values)=>{
    for(const evidence of distinctText(values))entries.push({source,authority,confidence,evidence,categories:normalizedLibraryCategories(evidence)});
  };
  const manual=enrichment.localMetadata?.approved?enrichment.localMetadata.categories:[];
  add('approved-local-metadata',1,'user-reviewed',manual);
  add('provider-format',2,'provider-explicit',[metadata.format,metadata.contentType]);
  if(record.mediaType==='book')for(const hint of kindleComicMangaHints(record))add(hint.source,2,hint.confidence,hint.evidence);
  // Comixology/ComicsUnlimited is explicit source-format evidence even though
  // the origin string itself is not a literary category.
  for(const entry of entries)if(entry.source==='kindle-library-type')entry.categories=[COMICS];
  add('google-books-category',3,'catalogue-category',enrichment.googleBooks?.categories);
  add('google-books-genre-hint',3,'related-work-hint',enrichment.googleBooksGenreHint?.categories);
  add('open-library-subject',3,'catalogue-subject',enrichment.openLibrary?.subjects);
  const manualRejects=distinctText(manual).some(negativeLabel);
  const contrary=NON_COMIC.test(record.title)||entries.some(entry=>negativeLabel(entry.evidence));
  const explicitComic=entries.some(entry=>entry.categories.includes(COMICS));
  if(manualRejects)for(const entry of entries)if(entry.authority>1&&entry.categories.includes(COMICS)){
    entry.categories=entry.categories.filter(category=>category!==COMICS);entry.conflict='Reviewed non-comic format takes precedence.';
  }
  if(record.mediaType==='book'){
    const bundle=compactText(record.provider==='humble'?metadata.sourceBundle:record.provider==='fanatical'?metadata.bundleTitle:'');
    if(bundle){
      const categories=[];
      if(/\b(?:comics?|manga|graphic novels?)\b/iu.test(bundle)&&!contrary)categories.push(COMICS);
      if(/\b(?:programming|computers?|computing|technology)\b/iu.test(bundle)&&/\bbooks?\s+bundle\b/iu.test(bundle))categories.push('Technology & Computing');
      if(/\b(?:science fiction|sci[ -]?fi|fantasy)\b/iu.test(bundle)&&/\bbooks?\s+bundle\b/iu.test(bundle))categories.push('Science Fiction & Fantasy');
      if(categories.length||/\b(?:comics?|manga|graphic novels?)\b/iu.test(bundle))entries.push({source:record.provider+'-bundle-name',authority:4,confidence:'acquisition-context',evidence:bundle,categories,...(contrary?{conflict:'Item-level non-comic evidence blocks comic bundle inference.'}:{})});
    }
    const names=[record.title,...distinctText(metadata.series)].join(' · '),publisher=compactText(metadata.publisher||enrichment.googleBooks?.publisher||(enrichment.localMetadata?.approved?enrichment.localMetadata.publisher:'')||enrichment.openLibrary?.publishers?.[0]);
    const knownSeries=COMIC_SERIES.test(names),knownPublisher=COMIC_PUBLISHER.test(publisher);
    const structural=COMIC_STRUCTURE.test(record.title)||(knownPublisher||knownSeries)&&(VOLUME.test(record.title)||/^\d+(?:\.\d+)?$/u.test(String(metadata.volume??metadata.issue??'')));
    if(!contrary&&/\b(?:graphic novel|comic book|manga)\b/iu.test(record.title))entries.push({source:'explicit-title-format',authority:5,confidence:'explicit-format-label',evidence:record.title,categories:[COMICS]});
    if(!contrary&&!explicitComic&&structural&&(knownSeries||knownPublisher))entries.push({source:'comic-publication-pattern',authority:5,confidence:'corroborated-inference',evidence:[record.title,publisher,...distinctText(metadata.series)].filter(Boolean).join(' · '),categories:[COMICS]});
    else if(!explicitComic&&knownSeries&&!contrary&&!entries.some(entry=>entry.categories.includes(COMICS)))entries.push({source:'comic-series-suggestion',authority:6,confidence:'uncertain',evidence:record.title,categories:[]});
  }
  if(contrary&&explicitComic&&!manualRejects)for(const entry of entries)if(entry.categories.includes(COMICS))entry.conflict='Comic classification and non-comic format evidence disagree; source values are retained.';
  return entries.filter(entry=>entry.evidence);
}

export function libraryBroadGenreValues(record) {
  const found=new Set(libraryCategoryEvidence(record).flatMap(entry=>entry.categories));
  return BROAD_GENRE_RULES.map(([genre])=>genre).filter(genre=>found.has(genre));
}
