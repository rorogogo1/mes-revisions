// Export CSV / Anki et sauvegarde complète (JSON) des données.

import * as db from './db.js';
import { STORES } from './db.js';
import { blobToDataURL, dataURLToBlob, download, slug, CARD_TYPES } from './util.js';

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const ankiCell = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
const escHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function exportable(courseId) {
  const [courses, cards] = await Promise.all([db.getAll('courses'), db.getAll('cards')]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const list = cards.filter((c) => c.status !== 'draft' && (!courseId || c.courseId === courseId));
  return { list, byId, courseName: courseId ? byId.get(courseId)?.name : null };
}

export async function exportCSV(courseId) {
  const { list, byId, courseName } = await exportable(courseId);
  const header = ['Cours', 'Chapitre', 'Type', 'Question', 'Réponse', 'Explication', 'Passage des notes', 'Choix (correct en premier)', 'Statut', 'Prochaine révision'];
  const rows = list.map((c) => [
    byId.get(c.courseId)?.name, c.chapter, CARD_TYPES[c.type] || c.type, c.question, c.answer || c.refAnswer, c.explanation, c.quote,
    c.choices.slice().sort((a, b) => b.correct - a.correct).map((x) => x.text).join(' | '),
    c.status === 'flagged' ? 'Signalée' : 'Active', new Date(c.fsrs.due).toISOString().slice(0, 10),
  ]);
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  download(`mes-revisions-${slug(courseName || 'tous-les-cours')}.csv`, csv, 'text/csv;charset=utf-8');
  return list.length;
}

/** Fichier texte importable par Anki (Fichier › Importer), un paquet par cours et chapitre. */
export async function exportAnki(courseId) {
  const { list, byId, courseName } = await exportable(courseId);
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#deck column:3',
    '#tags column:4',
  ];
  for (const c of list) {
    const course = byId.get(c.courseId)?.name || 'Cours';
    const deck = ['Mes révisions', course, c.chapter].filter(Boolean).join('::');
    const back = [
      `<b>${escHtml(c.answer || c.refAnswer)}</b>`,
      c.explanation ? `<br><br>${escHtml(c.explanation)}` : '',
      c.quote ? `<br><br><i>Notes : « ${escHtml(c.quote)} »</i>` : '',
    ].join('');
    const tags = [`type::${c.type}`, c.concept ? c.concept.replace(/\s+/g, '_') : ''].filter(Boolean).join(' ');
    lines.push([escHtml(c.question), back, deck, tags].map(ankiCell).join('\t'));
  }
  download(`mes-revisions-anki-${slug(courseName || 'tous-les-cours')}.txt`, lines.join('\n'));
  return list.length;
}

export async function exportBackup() {
  const data = { app: 'mes-revisions', version: 1, exportedAt: new Date().toISOString() };
  for (const store of STORES) data[store] = await db.getAll(store);
  for (const s of data.sources) {
    s.images = await Promise.all((s.images || []).map((b) => (b instanceof Blob ? blobToDataURL(b) : b)));
  }
  download(`mes-revisions-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
}

/**
 * Restaure une sauvegarde.
 * @param {File} file
 * @param {'merge'|'replace'} mode
 */
export async function importBackup(file, mode = 'merge') {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Ce fichier n\'est pas une sauvegarde valide.');
  }
  if (data.app !== 'mes-revisions') throw new Error('Ce fichier ne vient pas de « Mes révisions ».');
  for (const s of data.sources || []) {
    s.images = await Promise.all((s.images || []).map((d) => (typeof d === 'string' ? dataURLToBlob(d) : d)));
  }
  if (mode === 'replace') for (const store of STORES) await db.clear(store);
  const counts = {};
  for (const store of STORES) {
    const items = Array.isArray(data[store]) ? data[store] : [];
    await db.putMany(store, items);
    counts[store] = items.length;
  }
  return counts;
}

export async function wipeAll() {
  for (const store of STORES) await db.clear(store);
}
