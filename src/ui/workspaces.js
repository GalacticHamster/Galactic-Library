import { defaultUiPreferences, LIBRARY_WORKSPACES, workspaceTarget } from '../lib/ui-preferences.js';

export function createWorkspaceNavigation({ readView, applyView, save, changed }) {
  let preferences = defaultUiPreferences();
  let hydrated = false;
  let interacted = false;
  let saveTimer;
  const navigation = document.querySelector('#workspace-navigation');
  const secondary = document.querySelector('#library-navigation');
  const status = document.querySelector('#workspace-status');
  const viewKey = () => preferences.workspace === 'books' ? 'books' : 'library';
  const remember = () => {
    clearTimeout(saveTimer);
    const snapshot = structuredClone(preferences);
    saveTimer = setTimeout(() => save(snapshot).catch(() => { status.textContent = 'Could not remember this view. Your library is unchanged.'; }), 180);
  };
  function show() {
    for (const panel of document.querySelectorAll('[data-workspace-panel]')) panel.hidden = panel.dataset.workspacePanel !== preferences.workspace;
    const primary=LIBRARY_WORKSPACES.includes(preferences.workspace)?'library':preferences.workspace;
    for (const button of navigation.querySelectorAll('button')) {
      if (button.dataset.workspace === primary) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if(secondary){secondary.hidden=primary!=='library';for(const button of secondary.querySelectorAll('button')){
      if(button.dataset.workspace===preferences.workspace)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }}
    document.querySelector('#library-section').hidden = !['library', 'books'].includes(preferences.workspace);
    document.querySelector('#show-enrichment-actions').checked = preferences.workspace === 'books';
    document.querySelector('#library-heading').textContent = preferences.workspace === 'books' ? 'Choose a book to improve' : 'Library';
  }
  function select(workspace) {
    workspace=workspaceTarget(workspace);if(!workspace)return;
    interacted=true;
    if(['library','books'].includes(preferences.workspace))preferences[viewKey()] = readView();
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
  secondary?.addEventListener('click',event=>{const button=event.target.closest('button[data-workspace]');if(button)select(button.dataset.workspace);});
  document.addEventListener('click',event=>{const link=event.target.closest('[data-go-workspace]');if(link){event.preventDefault();select(link.dataset.goWorkspace);}});
  show();
  return {
    get workspace() { return preferences.workspace; },
    hydrate(value) {
      if (hydrated) return;
      hydrated = true;
      const selected=preferences.workspace;preferences = structuredClone(value);
      const target=workspaceTarget(globalThis.location?.hash);
      if(interacted)preferences.workspace=selected;else if(target)preferences.workspace=target;
      show();
      applyView(preferences[viewKey()]);
    },
    select,
    rememberView() { preferences[viewKey()] = readView(); remember(); },
    get savedView() { return preferences[viewKey()]; }
  };
}
