// Utilitaires partagés : gabarits HTML échappés, dates, texte.

class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Marque une chaîne comme HTML sûr (pas d'échappement). */
export const raw = (value) => new Raw(String(value ?? ''));

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderValue(value) {
  if (value == null || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return esc(value);
}

/** Gabarit HTML : les valeurs interpolées sont échappées sauf si raw()/html(). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
  return new Raw(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const DAY = 86_400_000;

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Date d'examen 'AAAA-MM-JJ' → timestamp (9 h du matin, heure locale). */
export function examTimestamp(dateStr) {
  if (!dateStr) return null;
  const ts = new Date(`${dateStr}T09:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function daysUntil(ts, now = Date.now()) {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
}

export function formatDate(ts, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(ts).toLocaleDateString('fr-FR', opts);
}

export function relativeDays(ts, now = Date.now()) {
  if (ts - now < 3_600_000 && ts - now > -60_000) {
    const min = Math.max(1, Math.round((ts - now) / 60_000));
    return ts <= now ? 'maintenant' : `dans ${min} min`;
  }
  const d = daysUntil(ts, now);
  if (d < -1) return `il y a ${-d} jours`;
  if (d === -1) return 'hier';
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  if (d < 31) return `dans ${d} jours`;
  const months = Math.round(d / 30);
  if (months < 12) return `dans ${months} mois`;
  return `dans ${Math.round(d / 365)} an(s)`;
}

export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Minuscules, sans accents ni ponctuation, espaces normalisés. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9%€$.,]+/g, ' ')
    .replace(/(\D)[.,]|[.,](\D)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

export const LANGUAGES = {
  fr: 'Français',
  en: 'Anglais',
  es: 'Espagnol',
  de: 'Allemand',
  it: 'Italien',
};

export const CARD_TYPES = {
  qa: 'Question-réponse',
  cloze: 'Texte à trou',
  mcq: 'Notions proches',
  why: 'Pourquoi ?',
};
