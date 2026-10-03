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
    relatedPresentationReason, relatedTitleKeys, personKey, authorRelation, authorNames, unitKey, ambiguousWorks });
}(globalThis));
// END SHARED MATCHING POLICY
