export const UI_PREFERENCES_KEY = 'galacticLibraryUiPreferences';
export const PRIMARY_WORKSPACES = ['library', 'providers', 'contents', 'settings'];
export const LIBRARY_WORKSPACES = ['library', 'books', 'reading', 'ownership'];
// Old saved views remain valid secondary Library destinations.
export const WORKSPACES = [...PRIMARY_WORKSPACES, 'books', 'reading', 'ownership'];
export function workspaceTarget(value) {
  const name=String(value??'').replace(/^#/u,'').replace(/-workspace$/u,'');
  return WORKSPACES.includes(name)?name:({libraries:'providers',kindle:'contents','library-section':'library'})[name]??null;
}
export const emptyLibraryView = () => ({ search: '', provider: 'all', mediaType: 'all', genre: 'all', ownership: 'all', dlc: 'all', page: 0 });
export const defaultUiPreferences = () => ({ workspace: 'library', library: emptyLibraryView(), books: emptyLibraryView() });

export function validateUiPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['workspace', 'library', 'books'].includes(key))) throw Error('Invalid library display preferences.');
  const output = defaultUiPreferences();
  if (value.workspace !== undefined) {
    if (!WORKSPACES.includes(value.workspace)) throw Error('Unknown library workspace.');
    output.workspace = value.workspace;
  }
  for (const key of ['library', 'books']) {
    if (value[key] === undefined) continue;
    const view = value[key];
    if (!view || typeof view !== 'object' || Array.isArray(view) || Object.keys(view).some(field => !Object.hasOwn(output[key], field))) throw Error('Invalid library filters.');
    for (const [field, entry] of Object.entries(view)) {
      if (field === 'page') {
        if (!Number.isSafeInteger(entry) || entry < 0 || entry > 1000000) throw Error('Invalid library page.');
      } else if (typeof entry !== 'string' || entry.length > (field === 'search' ? 500 : 200)) throw Error('Invalid library filter.');
      output[key][field] = entry;
    }
    if (!['all', 'game', 'software', 'book', 'audiobook', 'movie', 'tv'].includes(output[key].mediaType)
      || !['all', 'owned', 'claimed', 'unknown', 'rental', 'borrowed', 'subscription'].includes(output[key].ownership)
      || !['all', 'with', 'without'].includes(output[key].dlc)) throw Error('Unknown library filter.');
  }
  return output;
}
