const text = (tag, value) => Object.assign(document.createElement(tag), {textContent: value});

export const sourceLabel = value => ({googleBooks:'Google Books',googleBooksGenreHint:'Google Books genre hint',openLibrary:'Open Library work',localMetadata:'File or publisher metadata',kindleProductComicContents:'Kindle contents',comicinfo:'ComicInfo file',epub:'EPUB file',publisher:'Publisher page','google-books':'Google Books','open-library':'Open Library'}[value] ?? value);
export const fieldLabel = value => ({title:'Title',subtitle:'Subtitle',authors:'Authors',contributors:'Other creators',publisher:'Publisher',publishers:'Publishers',isbn:'ISBN',language:'Language',series:'Series',volume:'Volume',issue:'Issue',unitType:'Unit type',run:'Series run',edition:'Edition',format:'Format',publishedDate:'Publication date',firstPublishYear:'First publication year',pageCount:'Page count',subjects:'Subjects',categories:'Genres',statement:'Contents statement'}[value] ?? value);
const format = value => Array.isArray(value) ? value.map(entry => typeof entry === 'object' ? `${entry.role}: ${entry.name}` : entry).join(', ') : String(value ?? '');

export function bookToolHelp({purpose,input,saves,review,example}) {
  const root = document.createElement('div'); root.className = 'book-tool-help';
  root.append(text('p', purpose));
  const details = document.createElement('details'); details.append(text('summary','How this works'));
  for (const [label,value] of [['Uses',input],['Saves',saves],['Your review',review],['Example',example]]) {
    if (!value) continue;
    const paragraph = document.createElement('p'); paragraph.append(text('strong',`${label}: `),document.createTextNode(value)); details.append(paragraph);
  }
  root.append(details); return root;
}

// A preview of a proposed source selection, not a replacement of provider data.
export function metadataPreview(records,candidate,kind) {
  const root = document.createElement('details'); root.className = 'metadata-preview';
  root.append(text('summary','Preview information to save'),text('p','This saves a source alongside your library details. Purchase status and original provider details stay intact. Undo is available under Sources and undo.'));
  const fields = ['title','subtitle','authors','contributors','publisher','publishers','isbn','language','series','volume','issue','unitType','run','edition','format','publishedDate','firstPublishYear','pageCount','subjects','categories','statement'];
  for (const record of records) {
    root.append(text('strong',`${record.title} · ${record.provider}`));
    const table = document.createElement('table'),head = document.createElement('tr');
    for (const label of ['Field','Provider details','Saved source','Suggestion']) head.append(text('th',label)); table.append(head);
    const current = record.metadata?.enrichment?.[kind] ?? {};
    for (const field of fields) {
      const proposed = format(candidate[field]); if (!proposed) continue;
      const row = document.createElement('tr');
      for (const value of [fieldLabel(field),format(field==='title'?record.title:record.metadata?.[field])||'—',format(current[field])||'—',proposed]) row.append(text('td',value)); table.append(row);
    }
    root.append(table);
  }
  return root;
}
