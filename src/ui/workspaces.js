import { defaultUiPreferences, WORKSPACES } from '../lib/ui-preferences.js';

export function createWorkspaceNavigation({ readView, applyView, save, changed }) {
  let preferences = defaultUiPreferences();
  let hydrated = false;
  let saveTimer;
  const navigation = document.querySelector('#workspace-navigation');
  const status = document.querySelector('#workspace-status');
  const viewKey = () => preferences.workspace === 'books' ? 'books' : 'library';
  const remember = () => {
    clearTimeout(saveTimer);
    const snapshot = structuredClone(preferences);
    saveTimer = setTimeout(() => save(snapshot).catch(() => { status.textContent = 'Could not remember this view. Your library is unchanged.'; }), 180);
  };
  function show() {
    for (const panel of document.querySelectorAll('[data-workspace-panel]')) panel.hidden = panel.dataset.workspacePanel !== preferences.workspace;
    for (const button of navigation.querySelectorAll('button')) {
      if (button.dataset.workspace === preferences.workspace) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    document.querySelector('#library-section').hidden = !['library', 'books'].includes(preferences.workspace);
    document.querySelector('#show-enrichment-actions').checked = preferences.workspace === 'books';
    document.querySelector('#library-heading').textContent = preferences.workspace === 'books' ? 'Choose a book to improve' : 'Library';
  }
  function select(workspace) {
    if (!WORKSPACES.includes(workspace)) return;
    preferences[viewKey()] = readView();
    preferences.workspace = workspace;
    show();
    applyView(preferences[viewKey()]);
    remember();
    changed();
  }
  navigation.addEventListener('click', event => {
    const button = event.target.closest('button[data-workspace]');
    if (button) select(button.dataset.workspace);
  });
  show();
  return {
    get workspace() { return preferences.workspace; },
    hydrate(value) {
      if (hydrated) return;
      hydrated = true;
      preferences = value;
      show();
      applyView(preferences[viewKey()]);
    },
    select,
    rememberView() { preferences[viewKey()] = readView(); remember(); },
    get savedView() { return preferences[viewKey()]; }
  };
}
