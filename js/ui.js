// Composants d'interface : icônes, notifications, fenêtres modales, chargement.

import { html, raw, $ } from './util.js';

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  review: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  text: '<path d="M17 10H3"/><path d="M21 6H3"/><path d="M21 14H3"/><path d="M17 18H3"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  wifiOff: '<path d="M1 1l22 22"/><path d="M16.7 11.1A11 11 0 0 1 19 12.6"/><path d="M5 12.6a11 11 0 0 1 5.2-2.5"/><path d="M10.7 5A16 16 0 0 1 22.6 9"/><path d="M1.4 9a16 16 0 0 1 4.4-2.8"/><path d="M8.5 16.1a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};

export function icon(name, size = 20, cls = '') {
  return raw(`<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`);
}

// ---------- Notifications ----------
export function toast(message, type = 'info', ms = 3500) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Fenêtres modales ----------
/**
 * Ouvre une fenêtre modale.
 * @param {object} o { title, body (html), actions: [{ label, value, kind }], wide, onMount(el, close) }
 * @returns {Promise<any>} valeur de l'action choisie (null si fermée)
 */
export function modal({ title, body, actions = [], wide = false, onMount }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = String(html`
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="modal-header">
          <h2>${title}</h2>
          <button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button>
        </header>
        <div class="modal-body">${raw(String(body ?? ''))}</div>
        ${actions.length ? html`<footer class="modal-footer">${actions.map((a, i) => html`
          <button class="btn ${a.kind ? `btn-${a.kind}` : 'btn-ghost'}" data-action="${i}">${a.label}</button>`)}</footer>` : ''}
      </div>`);
    const previousFocus = document.activeElement;
    const close = (value = null) => {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 200);
      previousFocus?.focus?.();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) close(null);
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = actions[Number(btn.dataset.action)];
        if (action.validate && !action.validate(backdrop)) return;
        close(typeof action.value === 'function' ? action.value(backdrop) : action.value);
      }
    });
    root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));
    onMount?.(backdrop, close);
    const focusable = backdrop.querySelector('input, textarea, select, .modal-footer .btn-primary');
    (focusable || backdrop.querySelector('[data-close]')).focus();
  });
}

export function confirmDialog(message, { title = 'Confirmer', confirmLabel = 'Confirmer', danger = false } = {}) {
  return modal({
    title,
    body: html`<p>${message}</p>`,
    actions: [
      { label: 'Annuler', value: false },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  }).then(Boolean);
}

export function promptDialog(label, { title = 'Saisir', value = '', placeholder = '' } = {}) {
  return modal({
    title,
    body: html`<label class="field"><span>${label}</span><input class="input" id="prompt-input" value="${value}" placeholder="${placeholder}"></label>`,
    actions: [
      { label: 'Annuler', value: null },
      { label: 'Valider', value: (el) => el.querySelector('#prompt-input').value.trim() || null, kind: 'primary' },
    ],
    onMount: (el, close) => {
      el.querySelector('#prompt-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(e.target.value.trim() || null);
      });
    },
  });
}

// ---------- Chargement ----------
export function spinner(label = 'Chargement…') {
  return html`<div class="loading" role="status"><span class="spinner"></span><span>${label}</span></div>`;
}

export function emptyState({ iconName = 'layers', title, text, action = '' }) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName, 28)}</div>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

/** Désactive un bouton pendant une action asynchrone et affiche un indicateur. */
export async function withBusy(button, fn, busyLabel) {
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add('busy');
  if (busyLabel) button.innerHTML = `<span class="spinner spinner-sm"></span> ${busyLabel}`;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove('busy');
    button.innerHTML = original;
  }
}

export function badge(text, kind = '') {
  return html`<span class="badge ${kind ? `badge-${kind}` : ''}">${text}</span>`;
}
