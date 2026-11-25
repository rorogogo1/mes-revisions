// Construction de la file de révision : cartes dues, nouvelles cartes, mélange des chapitres.

import { retrievability } from './fsrs.js';
import { newCardsToday } from './store.js';

export const isActive = (c) => c.status === 'active';
export const isDue = (c, now = Date.now()) => isActive(c) && c.fsrs.state !== 'new' && c.fsrs.due <= now;
export const isNew = (c) => isActive(c) && c.fsrs.state === 'new';

/** Entrelace les cartes de groupes différents (cours/chapitre) : pratique entrelacée. */
function interleave(cards) {
  const groups = new Map();
  for (const c of cards) {
    const key = `${c.courseId}|${c.chapter || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const lists = [...groups.values()];
  const out = [];
  while (lists.some((l) => l.length)) {
    for (const l of lists) if (l.length) out.push(l.shift());
  }
  return out;
}

export function countDue(cards, reviews, newPerDay, now = Date.now()) {
  const due = cards.filter((c) => isDue(c, now)).length;
  const newLeft = Math.max(0, newPerDay - newCardsToday(reviews, now));
  const fresh = Math.min(newLeft, cards.filter(isNew).length);
  return { due, fresh, total: due + fresh };
}

/**
 * @param {object} p
 * @param {Array} p.cards toutes les cartes candidates
 * @param {Array} p.reviews historique (pour le quota de nouvelles cartes)
 * @param {Set<string>|null} p.courseIds cours retenus (null = tous)
 * @param {Set<string>|null} p.chapters chapitres retenus « courseId|chapitre » (null = tous)
 * @param {number} p.limit nombre maximal de cartes
 * @param {number} p.newPerDay quota quotidien de nouvelles cartes
 * @param {boolean} p.practice réviser en avance des cartes non dues
 */
export function buildQueue({ cards, reviews, courseIds = null, chapters = null, limit = 20, newPerDay = 20, practice = false, now = Date.now() }) {
  const pool = cards.filter((c) => isActive(c)
    && (!courseIds || courseIds.has(c.courseId))
    && (!chapters || chapters.has(`${c.courseId}|${c.chapter || ''}`)));

  if (practice) {
    const sorted = pool
      .filter((c) => c.fsrs.state !== 'new')
      .sort((a, b) => (retrievability(a.fsrs, now) ?? 0) - (retrievability(b.fsrs, now) ?? 0));
    return interleave(sorted.slice(0, limit));
  }

  const due = pool.filter((c) => isDue(c, now)).sort((a, b) => a.fsrs.due - b.fsrs.due);
  const newLeft = Math.max(0, newPerDay - newCardsToday(reviews, now));
  const fresh = pool.filter(isNew).sort((a, b) => a.createdAt - b.createdAt).slice(0, newLeft);

  const learning = due.filter((c) => c.fsrs.state !== 'review');
  const reviewCards = due.filter((c) => c.fsrs.state === 'review');
  const ordered = [...learning, ...reviewCards, ...fresh].slice(0, limit);
  return interleave(ordered);
}

/** Préparation moyenne d'un ensemble de cartes (probabilité de rappel, nouvelles = 0). */
export function readiness(cards, now = Date.now()) {
  const active = cards.filter(isActive);
  if (!active.length) return null;
  const sum = active.reduce((acc, c) => acc + (retrievability(c.fsrs, now) ?? 0), 0);
  return sum / active.length;
}
