import { defaultUiPreferences, LIBRARY_WORKSPACES, workspaceTarget, browseView, rememberBrowseView, validateUiPreferences,validPageSize } from '../lib/ui-preferences.js';

export function createWorkspaceNavigation({ readView, applyView, save, changed, beforeSelect, navigated }) {
  let preferences = defaultUiPreferences();
  let hydrated = false;
  let interacted = false;
  let saveTimer;
  const navigation = document.querySelector('#workspace-navigation');
  const secondary = document.querySelector('#library-navigation');
  const status = document.querySelector('#workspace-status');
  const view = () => browseView(preferences,preferences.workspace);
  const remember = () => {
    clearTimeout(saveTimer);
    // View navigation must not overwrite a newer page-size choice from another
    // page. Only the explicit selector saves the shared pageSize field.
    const {pageSize,appearance,...snapshot} = structuredClone(preferences);
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
    const catalog=document.querySelector('#library-section'),disclosure=document.querySelector('#book-catalog-disclosure');
    if(disclosure){if(!catalog.homeSlot){catalog.homeSlot=document.createElement('div');catalog.before(catalog.homeSlot);}if(preferences.workspace==='books')disclosure.append(catalog);else catalog.homeSlot.after(catalog);}
    document.querySelector('#library-section').hidden = !['library', 'books'].includes(preferences.workspace);
    document.querySelector('#show-enrichment-actions').checked = preferences.workspace === 'books';
    document.querySelector('#library-heading').textContent = preferences.workspace === 'books' ? 'Choose a book to improve' : 'Library';
  }
  function select(workspace,{view:nextView,history=true}={}) {
    workspace=workspaceTarget(workspace);if(!workspace)return false;
    if(beforeSelect?.(workspace)===false)return false;
    interacted=true;
    rememberBrowseView(preferences,preferences.workspace,readView(preferences.workspace));
    preferences.workspace = workspace;
    if(nextView)rememberBrowseView(preferences,workspace,nextView);
    if(history&&!navigated)globalThis.history?.replaceState(null,'',`#${workspace}`);
    show();
    applyView(view(),preferences.workspace);
    remember();
    changed();
    if(history)navigated?.(workspace);
    return true;
  }
  navigation.addEventListener('click', event => {
    const button = event.target.closest('button[data-workspace]');
    if (button) select(button.dataset.workspace);
  });
  secondary?.addEventListener('click',event=>{const button=event.target.closest('button[data-workspace]');if(button)select(button.dataset.workspace);});
  document.addEventListener('click',event=>{const link=event.target.closest('[data-go-workspace]');if(link){event.preventDefault();if(select(link.dataset.goWorkspace)&&['humble','fanatical'].includes(link.dataset.purchaseProvider)){const section=document.querySelector('#purchase-sharing-'+link.dataset.purchaseProvider);if(section){section.open=true;section.querySelector('summary')?.focus();section.scrollIntoView?.({block:'start'});}}}});
  show();
  return {
    get workspace() { return preferences.workspace; },
    hydrate(value) {
      if (hydrated) return;
      hydrated = true;
      const selected=preferences.workspace;preferences = validateUiPreferences(value);
      const target=workspaceTarget(globalThis.location?.hash);
      if(interacted)preferences.workspace=selected;else if(target)preferences.workspace=target;
      show();
      applyView(view(),preferences.workspace);
    },
    select,
    get pageSize(){return preferences.pageSize;},
    setPageSize(size){
      if(!validPageSize(size))return false;
      rememberBrowseView(preferences,preferences.workspace,readView(preferences.workspace));
      preferences.pageSize=size;preferences.browse.page=0;preferences.browse.anchor='';preferences.books.page=0;
      applyView(view(),preferences.workspace);changed();
      // Persist this deliberate preference immediately, even if the page closes
      // before the existing view debounce. The queued writer merges the patch.
      save({pageSize:size}).catch(()=>{status.textContent='Could not remember items per page. Your library is unchanged.';});
      remember();return true;
    },
    rememberView() { rememberBrowseView(preferences,preferences.workspace,readView(preferences.workspace)); remember(); },
    get savedView() { return view(); }
  };
}
