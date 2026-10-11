// BEGIN SHARED MATCHING POLICY
(function installLibraryMatchingPolicy(global) {
  'use strict';
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  function presentationTitle(value, kind = 'book') {
    let title = String(value ?? '').normalize('NFKC').toLowerCase().trim();
    if (kind === 'book') {
      const format = /\s+(?:[\[(]\s*)?(?:pdf|cbz|cbr|epub|mobi|kindle|tp|tpb|hc|hardcover|paperback|trade paperback|digital edition)(?:\s*[\])])?\s*$/iu;
      while (format.test(title)) title = title.replace(format, '').trim();
    }
    return title.replace(/&/gu, ' and ').replace(/\bvolume\b|\bvol\.?\b/giu, ' vol ')
      .replace(/['\u2018\u2019\u0060]/gu, '')
      .replace(/\d+(?:[.\-\u2013\u2014]\d+)+|[^\p{L}\p{N}\p{M}+#/]+/gu,
        part => /^\d/u.test(part) ? part.replace(/[\u2013\u2014]/gu, '-') : ' ')
      .replace(/\b(vol|issue)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gu, (_match, unit, number) => unit + ' ' + roman[number])
      .replace(/\s+/gu, ' ').trim();
  }
  function ownershipTitleKeys(title, kind = 'book') {
    const keys = [presentationTitle(title, kind)];
    if (kind === 'book' && /\s*\(plus extra content\)\s*$/iu.test(title)) {
      keys.push(presentationTitle(String(title).replace(/\s*\(plus extra content\)\s*$/iu, ''), kind));
    }
    return [...new Set(keys.filter(Boolean))];
  }
  function fullTitleMatches(offered, stored, kind = 'book') {
    const key = presentationTitle(offered, kind);
    return Boolean(key && ownershipTitleKeys(stored, kind).includes(key));
  }
  function relatedPresentationReason(left, right, kind = 'book') {
    const a = presentationTitle(left, kind), b = presentationTitle(right, kind);
    if (!a || !b || a === b) return '';
    const articles = value => value.replace(/\b(?:the|a|an)\b/gu, ' ').replace(/\s+/gu, ' ').trim();
    if (articles(a) && articles(a) === articles(b)) return 'The titles differ by an article; compare the library title.';
    const accents = value => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').normalize('NFC');
    if (accents(a) === accents(b)) return 'The titles differ in accents; identity needs review.';
    const numbering = value => value.replace(/(?<=\d)[.\-/](?=\d)/gu, ' ');
    if (numbering(a) === numbering(b)) return 'Numbering punctuation differs; review the library item.';
    const numerals = value => value.replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gu, word => roman[word]);
    if (numerals(a) === numerals(b)) return 'The titles differ in general Roman numeral wording; identity needs review.';
    return '';
  }
  function relatedTitleKeys(value, kind = 'book') {
    const title = presentationTitle(value, kind);
    return [...new Set([
      title.replace(/\b(?:the|a|an)\b/gu, ' ').replace(/\s+/gu, ' ').trim(),
      title.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').normalize('NFC'),
      title.replace(/(?<=\d)[.\-/](?=\d)/gu, ' '),
      title.replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gu, word => roman[word])
    ].filter(Boolean))].map(key => 'presentation:' + key);
  }
  // Discovery only: these parts never supply exact-title or edition identity.
  // Prefer explicit structure/semantic markers to a list of accepted titles.
  function revisionTitleParts(value, kind = 'book') {
    const title = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const result = (base, qualifier = '') => ({base, qualifier});
    if (!['book', 'audiobook', 'software'].includes(kind)) return result(title);
    const marker = /\b(?:edition|ed\.?|revision|rev\.?|revised|updated|expanded|annotated|abridged|unabridged|version|release|printing|print|reprint|format|paperback|hardcover|hardback|softcover|ebook|e-book|digital|pdf|epub|mobi|cbz|cbr)\b|\b\d+e\b|\bv\d+(?:\.\d+)*\b/iu;
    // Delimiters identify the base even when an edition description is new.
    const bracket = /^(.*?)\s*[([]([^()[\]]+)[)\]]\s*$/u.exec(title);
    if (bracket?.[1]?.trim() && marker.test(bracket[2])) return result(bracket[1].trim(), bracket[2]);
    const structured = /^(.*?)\s*(?:[,;:]\s*|\s+[\-\u2013\u2014]\s+)(.+)$/u.exec(title);
    if (structured?.[1]?.trim() && marker.test(structured[2])) return result(structured[1].trim(), structured[2]);
    // Numeric shorthand and bare revision/access/format labels.
    const tail = /\s+((?:(?:edition|ed\.?|revision|rev\.?|version|release|printing)\s+\d+(?:\.\d+)*|\d+e|v(?:ersion)?\.?\s*\d+(?:\.\d+)*|(?:revised|updated|expanded|annotated)(?:\s*(?:and|&)\s*(?:revised|updated|expanded|annotated))*(?:\s+(?:edition|ed\.?|version))?|(?:abridged|unabridged|paperback|hardcover|hardback|softcover|ebook|e-book|digital|pdf|epub|mobi|cbz|cbr)))\s*$/iu.exec(title);
    if (tail) return result(title.slice(0, tail.index).trim(), tail[1]);
    // English ordinals are compositional: twenty-first, one hundred and first,
    // eleventh and hundredth use the same rule; numeric ordinals are unbounded.
    const ordinal = '(?:first|second|third|(?:four|fif|six|seven|eigh|nin|ten|eleven|twelf|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|hundred|thousand|million|billion)th|(?:twent|thirt|fort|fift|sixt|sevent|eight|ninet)ieth)';
    const tens = '(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)';
    const compound = '(?:(?:one|two|three|four|five|six|seven|eight|nine) (?:hundred|thousand|million|billion)(?: and)? )?(?:'+tens+'[- ])?'+ordinal;
    const ordinalTail = new RegExp('\\s+('+compound+'|\\d+(?:st|nd|rd|th)?)$', 'iu');
    const ending = /\s+(?:(?:revised|updated|expanded|annotated|anniversary)\s+)*(?:edition|ed\.?|revision|version|printing)\s*$/iu.exec(title);
    if (ending) {
      const prefix = title.slice(0, ending.index).trim();
      const number = ordinalTail.exec(prefix);
      if (number) return result(prefix.slice(0, number.index).trim(), title.slice(number.index).trim());
    }
    return result(title);
  }
  function revisionWordingConflict(left, right, kind = 'book') {
    if (!['book', 'audiobook', 'software'].includes(kind)) return false;
    const a = revisionTitleParts(left, kind), b = revisionTitleParts(right, kind);
    const revision = /\b(?:edition|ed\.?|revision|rev\.?|revised|updated|expanded|annotated|abridged|unabridged|version|release|printing|reprint)\b|\b\d+e\b|\bv\d+(?:\.\d+)*\b/iu;
    const titles = [presentationTitle(left, kind), presentationTitle(right, kind)];
    // Pairwise fallback: an unfamiliar trailing descriptor can still warn
    // when it explicitly labels a revision of the complete shorter title.
    for (const [base, longer] of [titles, [...titles].reverse()]) {
      if (base.replace(/\s/gu, '').length >= (kind === 'software' ? 8 : 4)
        && longer.startsWith(base+' ') && revision.test(longer.slice(base.length+1))) return true;
    }
    return Boolean((revision.test(a.qualifier) || revision.test(b.qualifier))
      && presentationTitle(a.base, kind).replace(/\s/gu, '').length >= (kind === 'software' ? 8 : 4)
      && presentationTitle(a.base, kind) === presentationTitle(b.base, kind)
      && presentationTitle(a.qualifier, kind) !== presentationTitle(b.qualifier, kind));
  }
  // Review-only collection structure. Never used for full-title identity.
  function numberedCollectionRelation(left, right, kind = 'book') {
    if (!['book', 'audiobook'].includes(kind)) return null;
    const parts = value => {
      let title = String(value ?? '').normalize('NFKC').trim();
      const format = /\s+(?:[\[(]\s*)?(?:digital|digital edition|tp|tpb|hc|paperback|hardcover|trade paperback|pdf|epub|cbz|cbr)(?:\s*[\])])?\s*$/iu;
      while (format.test(title)) title = title.replace(format, '').trim();
      const match = /^(.*?)\b(?:vol(?:ume)?\.?|book)\s*(\d+(?:\.\d+)?)(?=$|\s|:)/iu.exec(title);
      if (!match) return { series: presentationTitle(title, kind), unit: '', subtitle: '', run: '' };
      const tail = title.slice(match[0].length).trim();
      // Do not reinterpret ranges, unlabeled prose, or multiple units.
      if (tail && !tail.startsWith(':')) return null;
      const run = /\((\d{4}(?:\s*[-\u2013\u2014]\s*\d{4})?)\)/u.exec(match[1]);
      let series = match[1].replace(/\(\d{4}(?:\s*[-\u2013\u2014]\s*\d{4})?\)/gu, '').replace(/[,;:\s]+$/u, '');
      series = series.replace(/\s+(?:deluxe|new|revised|updated|expanded|\d+(?:st|nd|rd|th)?)\s+edition$/iu, '');
      const text = tail.replace(/^:\s*/u, '');
      const editionOnly = /^(?:(?:new|deluxe|revised|updated|expanded|annotated|\d+(?:st|nd|rd|th)?)\s+)*(?:edition|ed\.?)$/iu.test(text);
      const subtitle = revisionTitleParts(editionOnly ? '' : text, kind);
      return { series: presentationTitle(series, kind), unit: unitKey(match[2]),
        subtitle: presentationTitle(subtitle.base, kind), run: run ? presentationTitle(run[1], 'unit') : '' };
    };
    const a = parts(left), b = parts(right);
    if (!a || !b || !(a.unit || b.unit)) return null;
    if (a.unit && b.unit && a.unit !== b.unit) return '';
    if (a.series !== b.series) return null;
    if (a.run && b.run && a.run !== b.run) return '';
    const generic = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'to', 'for', 'with', 'book', 'books', 'guide', 'complete', 'collection', 'introduction', 'manual']);
    const distinctive = new Set(a.series.split(' ').filter(word => /\p{L}/u.test(word) && word.length >= 3 && !generic.has(word)));
    if (distinctive.size < 2) return null;
    if (a.subtitle && b.subtitle && a.subtitle !== b.subtitle) return '';
    return 'Related distinctive series with compatible or unspecified volume; subtitle, run or edition identity needs review.';
  }
  function personKey(value) {
    let name = String(value ?? '').normalize('NFKC').toLowerCase().trim();
    name = name.replace(/\s*\((?:author|writer|artist|illustrator|editor|translator|pencill?er|inker|colorist|colourist|letterer)\)\s*$/u, '').trim();
    const comma = /^([^,]+),\s*([^,]+)$/u.exec(name);
    if (comma) name = comma[2] + ' ' + comma[1];
    return name.replace(/['\u2018\u2019]/gu, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  }
  function authorNameVariant(left, right) {
    const a = personKey(left), b = personKey(right);
    if (!a || !b) return false;
    const accent = name => name.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').normalize('NFC');
    if (accent(a) === accent(b)) return true;
    const l = a.split(' '), r = b.split(' ');
    if (l.length < 2 || r.length < 2) return false;
    if ([...l].sort().join(' ') === [...r].sort().join(' ')) return true;
    if (l.at(-1) !== r.at(-1)) return false;
    const given = (x, y) => x === y || x.length === 1 && y.startsWith(x) || y.length === 1 && x.startsWith(y);
    if (!given(l[0], r[0])) return false;
    // An omitted middle name is missing information; two explicit incompatible
    // middle names are not silently equivalent. Initials remain review-only.
    const lm = l.slice(1, -1), rm = r.slice(1, -1);
    return !lm.length || !rm.length || lm.length === rm.length && lm.every((name, index) => given(name, rm[index]));
  }
  function authorRelation(left = [], right = []) {
    const a = (Array.isArray(left) ? left : [left]).map(personKey).filter(Boolean);
    const b = (Array.isArray(right) ? right : [right]).map(personKey).filter(Boolean);
    if (!a.length || !b.length) return 'missing';
    if (a.some(name => b.includes(name))) return 'same';
    if (a.some(name => b.some(other => authorNameVariant(name, other)))) return 'variant';
    return 'different';
  }
  function authorNames(authors, contributors = []) {
    const rows = Array.isArray(contributors) ? contributors : [];
    const writers = rows.filter(row => /^(?:author|writer|story|story writer)$/iu.test(String(row?.role ?? '').trim()))
      .map(row => row?.name).filter(name => typeof name === 'string' && name.trim());
    // Known writer roles take precedence over a mixed creator list. An artist
    // shared by two books must not conceal explicitly different writers.
    const values = writers.length ? writers : Array.isArray(authors) ? authors : [authors];
    return [...new Set(values.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))];
  }
  function ambiguousWorks(records, fields, barrier = () => false) {
    return records.some((left, index) => records.slice(index + 1).some(right => {
      if (barrier(left, right)) return true;
      const a = fields(left), b = fields(right);
      if (authorRelation(a.authors, b.authors) === 'different') return true;
      return ['run', 'unitType', 'unit', 'volume', 'issue'].some(field => a[field] && b[field]
        && (['unit', 'volume', 'issue'].includes(field) ? unitKey(a[field]) !== unitKey(b[field]) : personKey(a[field]) !== personKey(b[field])));
    }));
  }
  function unitKey(value) {
    const text = String(value ?? '').trim();
    const fraction = /^(\d+)\/(\d+)$/u.exec(text);
    if (fraction && Number(fraction[2])) return String(Number(fraction[1]) / Number(fraction[2]));
    return /^\d+(?:\.\d+)?$/u.test(text) ? String(Number(text)) : presentationTitle(text, 'unit');
  }
  global.LibraryMatchingPolicy = Object.freeze({ presentationTitle, ownershipTitleKeys, fullTitleMatches,
    relatedPresentationReason, relatedTitleKeys, revisionTitleParts, revisionWordingConflict, numberedCollectionRelation, personKey, authorRelation, authorNames, unitKey, ambiguousWorks });
}(globalThis));
// END SHARED MATCHING POLICY
