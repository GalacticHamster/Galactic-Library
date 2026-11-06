// Minimal synthetic section responses, shared by DOM and installed tests.
// No account data or captured provider responses.
export function koboSectionFixture(scenario, value) {
  const {pathname:path,origin} = new URL(value, 'https://www.kobo.com');
  const card = (id, audio = false) => `<article data-is-purchased="true"><a data-book-title="Synthetic ${audio ? 'Audio' : 'Book'} ${id}" href="https://www.kobo.com/${audio ? 'audiobook' : 'ebook'}/${id}">Read Now</a><span class="book-author">Synthetic Writer</span></article>`;
  const page = (cards, links = '', count = cards.length) => `<main><button>All Items (${count})</button><div class="filter-btn"></div>${cards.join('')}${cards.length ? '' : '<p>No items</p>'}</main>${links}`;
  const audio = `<a href="${origin}/library/audiobooks">Audiobooks</a>`;
  const archive = `<a href="${origin}/library/archive">Archive</a>`;
  if (path.includes('/audiobooks')) return {status: 200, html: page(scenario === 'all-empty' ? [] : [card('audio', true), ...(scenario === 'both' ? [card('shared')] : [])])};
  if (path.includes('/archive')) {
    if (['401', '403', '503'].includes(scenario)) return {status: Number(scenario), html: ''};
    if (scenario === 'malformed') return {status: 200, html: '<main>Unrecognized library</main>'};
    if (scenario === 'unreadable') return {status: 200, html: '<div class="filter-btn"></div><p>All Items</p>'};
    if (scenario === 'count-mismatch') return {status: 200, html: page([card('archive')], '', 2)};
    if (scenario === 'pagination') return {status: 200, html: page([card('archive')], '<button class="page-link" data-page="2">2</button>')};
    return {status: 200, html: page(scenario === 'all-empty' ? [] : [card('archive'), ...(scenario === 'both' ? [card('shared')] : [])])};
  }
  if (scenario === 'ordinary') return {status: 200, html: page([card('root')])};
  if (scenario === 'quick-known') return {status: 200, html: page([card('root')], audio + archive + '<a class="page-link" data-page="2">2</a>', 2)};
  if (scenario === 'invalid-link') return {status: 200, html: page([], '<a href="http://[">Archive</a>')};
  return {status: 200, html: page([], scenario === 'audio' ? audio : scenario === 'archive' ? archive : scenario === 'both' || scenario === 'all-empty' ? archive + audio : archive)};
}
