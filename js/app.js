// Point d'entrée : routage par hash, navigation, démarrage.

import { html, $, $$ } from './util.js';
import { icon, toast } from './ui.js';
import { applyTheme } from './settings.js';
import { registerServiceWorker } from './pwa.js';
import home from './views/home.js';
import courses from './views/courses.js';
import course from './views/course.js';
import importer from './views/importer.js';
import generate from './views/generate.js';
import workshop from './views/workshop.js';
import review from './views/review.js';
import source from './views/source.js';
import settings from './views/settings.js';

const ROUTES = [
  { pattern: /^\/$/, view: home, nav: 'home' },
  { pattern: /^\/reviser$/, view: review, nav: 'review' },
  { pattern: /^\/cours$/, view: courses, nav: 'courses' },
  { pattern: /^\/cours\/([^/]+)$/, view: course, keys: ['id'], nav: 'courses' },
  { pattern: /^\/importer$/, view: importer, nav: 'import' },
  { pattern: /^\/generer$/, view: generate, nav: 'courses' },
  { pattern: /^\/atelier$/, view: workshop, nav: 'courses' },
  { pattern: /^\/source\/([^/]+)$/, view: source, keys: ['id'], nav: 'courses' },
  { pattern: /^\/reglages$/, view: settings, nav: 'settings' },
];

const NAV = [
  { id: 'home', href: '#/', label: 'Accueil', icon: 'home' },
  { id: 'review', href: '#/reviser', label: 'Réviser', icon: 'review' },
  { id: 'import', href: '#/importer?nouveau=1', label: 'Importer', icon: 'camera' },
  { id: 'courses', href: '#/cours', label: 'Cours', icon: 'book' },
  { id: 'settings', href: '#/reglages', label: 'Réglages', icon: 'settings' },
];

let current = null; // { route, ctx }
let renderToken = 0;

function renderNav() {
  const links = NAV.map((n) => html`<a href="${n.href}" data-nav="${n.id}">${icon(n.icon, 22)}<span>${n.label}</span></a>`);
  $('#sidebar-nav').innerHTML = String(html`${links}`);
  $('#bottom-nav').innerHTML = String(html`${links}`);
}

function parseHash() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function route(sameCtx = false) {
  const token = ++renderToken;
  const { path, query } = parseHash();
  let match = null;
  let found = ROUTES.find((r) => (match = path.match(r.pattern)));
  if (!found) { found = ROUTES[0]; match = []; }

  if (current && !sameCtx) current.route.view.unmount?.(current.ctx);
  const params = Object.fromEntries((found.keys || []).map((k, i) => [k, decodeURIComponent(match[i + 1])]));
  const ctx = sameCtx && current?.route === found ? Object.assign(current.ctx, { params, query }) : { params, query };
  ctx.rerender = () => route(true);
  ctx.state = null;
  current = { route: found, ctx };

  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === found.nav));
  const view = $('#view');
  try {
    const out = await found.view.render(ctx);
    if (token !== renderToken) return;
    // Un conteneur neuf à chaque rendu : les écouteurs de l'écran précédent disparaissent avec lui.
    const container = document.createElement('div');
    container.className = 'view-inner';
    container.innerHTML = String(out);
    view.replaceChildren(container);
    found.view.mount?.(container, ctx);
    if (!sameCtx) window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    view.innerHTML = String(html`<div class="empty"><div class="empty-icon">${icon('help', 28)}</div>
      <h3>Une erreur est survenue</h3><p class="muted">${err.message}</p><a class="btn btn-primary" href="#/">Retour à l'accueil</a></div>`);
  }
}

function updateOnlineStatus() {
  document.body.classList.toggle('offline', !navigator.onLine);
}

function start() {
  applyTheme();
  renderNav();
  updateOnlineStatus();
  window.addEventListener('hashchange', () => route());
  window.addEventListener('online', () => { updateOnlineStatus(); toast('Connexion rétablie', 'success', 2000); });
  window.addEventListener('offline', () => { updateOnlineStatus(); toast('Hors ligne : la révision continue de fonctionner.', 'info'); });
  registerServiceWorker(() => toast('Nouvelle version disponible : recharge la page pour en profiter.', 'info', 8000));
  route();
}

start();
