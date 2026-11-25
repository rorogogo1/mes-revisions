// Découpage des notes en paragraphes numérotés et vérification des citations.

import { normalize } from './util.js';

const PAGE_MARK = /^=+\s*page\s+(\d+)\s*=+$/i;

export const pageMarker = (n) => `=== Page ${n} ===`;

/** Texte contrôlé → paragraphes [{ id, page, text }]. */
export function toParagraphs(text) {
  const paragraphs = [];
  let page = null;
  let buffer = [];
  const flush = () => {
    const t = buffer.join('\n').trim();
    if (t) paragraphs.push({ id: `p${paragraphs.length + 1}`, page, text: t });
    buffer = [];
  };
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const mark = line.trim().match(PAGE_MARK);
    if (mark) { flush(); page = Number(mark[1]); continue; }
    if (!line.trim()) { flush(); continue; }
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

/** Paragraphes formatés pour le modèle : « [p3] (page 2) texte ». */
export function paragraphsForPrompt(paragraphs, maxChars = 60_000) {
  let out = '';
  for (const p of paragraphs) {
    const line = `[${p.id}]${p.page ? ` (page ${p.page})` : ''} ${p.text}\n\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

const tokens = (t) => normalize(t).split(' ').filter((w) => w.length > 2);

/**
 * Cherche une citation dans les paragraphes.
 * @returns {{ match: 'exact'|'approx'|'none', paragraphId: string|null }}
 */
export function locateQuote(paragraphs, quote, hintIds = []) {
  const q = normalize(quote);
  if (!q) return { match: 'none', paragraphId: hintIds[0] || null };
  for (const p of paragraphs) {
    if (normalize(p.text).includes(q)) return { match: 'exact', paragraphId: p.id };
  }
  const qTokens = tokens(quote);
  let best = { score: 0, id: null };
  for (const p of paragraphs) {
    const set = new Set(tokens(p.text));
    const score = qTokens.filter((w) => set.has(w)).length / (qTokens.length || 1);
    if (score > best.score) best = { score, id: p.id };
  }
  if (best.score >= 0.75) return { match: 'approx', paragraphId: best.id };
  return { match: 'none', paragraphId: hintIds[0] || best.id };
}

export function passagesFor(source, ids = []) {
  if (!source) return [];
  const wanted = new Set(ids);
  return source.paragraphs.filter((p) => wanted.has(p.id));
}
