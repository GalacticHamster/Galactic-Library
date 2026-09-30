/* Shared collapse/restore control for Galactic Library's provider panels. */
(function attachFloatingPanelControls(global) {
  'use strict';
  function attach(shadow) {
    const panel = shadow?.querySelector?.('.panel');
    if (!panel || shadow.querySelector('[data-galactic-floating-panel-control]')) return;
    const style = document.createElement('style');
    style.textContent = '.panel { position:relative; } .galactic-panel-minimize { position:absolute; right:9px; top:9px; padding:3px 7px; font-size:12px; } .galactic-panel-restore { border:1px solid #a78bfa; border-radius:7px; background:#312e81; box-shadow:0 8px 30px #0008; color:#f5f3ff; cursor:pointer; font:14px/1.4 system-ui,sans-serif; padding:7px 10px; }';
    const minimize = document.createElement('button');
    minimize.type = 'button';
    minimize.className = 'galactic-panel-minimize';
    minimize.dataset.galacticFloatingPanelControl = 'minimize';
    minimize.textContent = 'Minimize';
    minimize.setAttribute('aria-label', 'Minimize Galactic Library panel');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'galactic-panel-restore';
    restore.dataset.galacticFloatingPanelControl = 'restore';
    restore.textContent = 'Galactic Library — Expand';
    restore.hidden = true;
    restore.addEventListener('click', () => {
      panel.hidden = false;
      restore.hidden = true;
      minimize.focus();
    });
    minimize.addEventListener('click', () => {
      panel.hidden = true;
      restore.hidden = false;
      restore.focus();
    });
    panel.append(minimize);
    shadow.append(style, restore);
  }
  global.GalacticFloatingPanel = { attach };
}(globalThis));
