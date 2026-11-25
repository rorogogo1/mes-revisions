// Opérations métier sur les cours, notes, cartes et révisions.

import * as db from './db.js';
import { uid, startOfDay } from './util.js';
import { newSchedule } from './fsrs.js';
import { toParagraphs, locateQuote } from './text.js';

export const COURSE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569'];

// ---------- Cours ----------
export async function listCourses() {
  const courses = await db.getAll('courses');
  return courses.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export const getCourse = (id) => db.get('courses', id);

export async function saveCourse(course) {
  const now = Date.now();
  const c = { chapters: [], color: COURSE_COLORS[0], examDate: '', ...course, updatedAt: now };
  if (!c.id) { c.id = uid(); c.createdAt = now; }
  c.chapters = [...new Set(c.chapters.map((x) => x.trim()).filter(Boolean))];
  await db.put('courses', c);
  return c;
}

export async function deleteCourse(id) {
  const [sources, cards] = await Promise.all([db.getByIndex('sources', 'courseId', id), db.getByIndex('cards', 'courseId', id)]);
  const cardIds = new Set(cards.map((c) => c.id));
  const reviews = (await db.getAll('reviews')).filter((r) => cardIds.has(r.cardId));
  await db.delMany('reviews', reviews.map((r) => r.id));
  await db.delMany('cards', [...cardIds]);
  await db.delMany('sources', sources.map((s) => s.id));
  await db.del('courses', id);
}

export async function addChapter(courseId, name) {
  const course = await getCourse(courseId);
  if (!course || !name.trim()) return course;
  course.chapters = [...(course.chapters || []), name.trim()];
  return saveCourse(course);
}

export async function renameChapter(courseId, oldName, newName) {
  const course = await getCourse(courseId);
  course.chapters = course.chapters.map((c) => (c === oldName ? newName.trim() : c));
  await saveCourse(course);
  const [sources, cards] = await Promise.all([listSources(courseId), listCards({ courseId })]);
  await db.putMany('sources', sources.filter((s) => s.chapter === oldName).map((s) => ({ ...s, chapter: newName.trim() })));
  await db.putMany('cards', cards.filter((c) => c.chapter === oldName).map((c) => ({ ...c, chapter: newName.trim() })));
}

export async function removeChapter(courseId, name) {
  const course = await getCourse(courseId);
  course.chapters = course.chapters.filter((c) => c !== name);
  return saveCourse(course);
}

// ---------- Notes (sources) ----------
export async function listSources(courseId) {
  const list = courseId ? await db.getByIndex('sources', 'courseId', courseId) : await db.getAll('sources');
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export const getSource = (id) => db.get('sources', id);

export async function saveSource(source) {
  const now = Date.now();
  const s = { images: [], ...source, updatedAt: now };
  if (!s.id) { s.id = uid(); s.createdAt = now; }
  s.paragraphs = toParagraphs(s.text);
  await db.put('sources', s);
  return s;
}

/** Après correction du texte, relie à nouveau chaque carte à son passage. */
export async function relinkCards(source) {
  const cards = await db.getByIndex('cards', 'sourceId', source.id);
  const updated = cards.map((c) => {
    const loc = locateQuote(source.paragraphs, c.quote, c.sourceIds);
    return { ...c, quoteMatch: loc.match, sourceIds: loc.paragraphId ? [loc.paragraphId] : [] };
  });
  await db.putMany('cards', updated);
}

export async function deleteSource(id) {
  const cards = await db.getByIndex('cards', 'sourceId', id);
  await deleteCards(cards.map((c) => c.id));
  await db.del('sources', id);
}

// ---------- Cartes ----------
export function newCard(partial) {
  const now = Date.now();
  return {
    id: uid(),
    type: 'qa',
    concept: '',
    question: '',
    answer: '',
    refAnswer: '',
    shortAnswer: '',
    choices: [],
    explanation: '',
    hint: '',
    sourceIds: [],
    quote: '',
    quoteMatch: 'none',
    status: 'draft',
    flagReason: '',
    origin: 'ai',
    fsrs: newSchedule(now),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function listCards({ courseId, sourceId, status } = {}) {
  let list;
  if (sourceId) list = await db.getByIndex('cards', 'sourceId', sourceId);
  else if (courseId) list = await db.getByIndex('cards', 'courseId', courseId);
  else list = await db.getAll('cards');
  return status ? list.filter((c) => c.status === status) : list;
}

export const getCard = (id) => db.get('cards', id);

export async function saveCard(card) {
  card.updatedAt = Date.now();
  await db.put('cards', card);
  return card;
}

export async function saveCards(cards) {
  const now = Date.now();
  cards.forEach((c) => { c.updatedAt = now; });
  await db.putMany('cards', cards);
}

export async function deleteCards(ids) {
  if (!ids.length) return;
  const set = new Set(ids);
  const reviews = (await db.getAll('reviews')).filter((r) => set.has(r.cardId));
  await db.delMany('reviews', reviews.map((r) => r.id));
  await db.delMany('cards', ids);
}

// ---------- Révisions ----------
export async function addReview(review) {
  const r = { id: uid(), ts: Date.now(), ...review };
  await db.put('reviews', r);
  return r;
}

export const listReviews = () => db.getAll('reviews');

export function newCardsToday(reviews, now = Date.now()) {
  const start = startOfDay(now);
  return reviews.filter((r) => r.ts >= start && r.wasNew).length;
}
