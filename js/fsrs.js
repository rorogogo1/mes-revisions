// Répétition espacée FSRS-5 (paramètres par défaut publiés par open-spaced-repetition),
// avec un plafond d'intervalle calé sur la date d'examen (Cepeda et al., 2008).

import { DAY, clamp } from './util.js';

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const RELEARN_DELAY = 10 * 60_000; // carte ratée : revue 10 min plus tard

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

export function newSchedule(now = Date.now()) {
  return { state: 'new', due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null };
}

export function retrievability(s, now = Date.now()) {
  if (!s || !s.lastReview || !s.stability) return null;
  const t = Math.max(0, (now - s.lastReview) / DAY);
  return Math.pow(1 + (FACTOR * t) / s.stability, DECAY);
}

const initStability = (g) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d, g) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === Rating.Hard ? W[15] : 1;
  const easy = g === Rating.Easy ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}

const shortTermStability = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

export function intervalDays(stability, retention = 0.9) {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

/**
 * Plafond d'intervalle selon le temps restant avant l'examen :
 * ~20 % du délai pour un examen à quelques semaines, ~5 % à un an.
 */
export function examCap(examTs, now = Date.now()) {
  if (!examTs || examTs <= now) return null;
  const days = (examTs - now) / DAY;
  let ratio;
  if (days <= 30) ratio = 0.2;
  else if (days >= 365) ratio = 0.05;
  else ratio = 0.2 - ((days - 30) / (365 - 30)) * 0.15;
  return { maxDays: Math.max(1, Math.round(days * ratio)), daysLeft: days };
}

/**
 * Calcule le nouvel état d'une carte après une réponse.
 * @param {object} s état FSRS courant
 * @param {number} g note 1..4
 * @param {object} opts { now, retention, examTs }
 */
export function schedule(s, g, { now = Date.now(), retention = 0.9, examTs = null } = {}) {
  const next = { ...s, reps: (s.reps || 0) + 1, lastReview: now };

  if (s.state === 'new' || !s.lastReview) {
    next.stability = initStability(g);
    next.difficulty = initDifficulty(g);
  } else {
    const elapsed = (now - s.lastReview) / DAY;
    if (elapsed < 1) {
      next.stability = shortTermStability(s.stability, g);
    } else {
      const r = retrievability(s, now) ?? 0.9;
      next.stability = g === Rating.Again ? forgetStability(s.difficulty, s.stability, r) : recallStability(s.difficulty, s.stability, r, g);
    }
    next.difficulty = nextDifficulty(s.difficulty, g);
  }
  next.stability = Math.max(0.1, next.stability);

  if (g === Rating.Again) {
    if (s.state === 'review') next.lapses = (s.lapses || 0) + 1;
    next.state = s.state === 'review' || s.state === 'relearning' ? 'relearning' : 'learning';
    next.due = now + RELEARN_DELAY;
    return next;
  }

  let days = Math.max(1, Math.round(intervalDays(next.stability, retention)));
  const cap = examCap(examTs, now);
  if (cap) {
    days = Math.min(days, cap.maxDays);
    // Toujours une dernière révision avant le jour de l'examen.
    if (cap.daysLeft >= 2) days = Math.min(days, Math.floor(cap.daysLeft) - 1 || 1);
  }
  next.state = 'review';
  next.due = now + days * DAY;
  next.intervalDays = days;
  return next;
}

/** Note FSRS déduite de la justesse, de la certitude et de l'aide utilisée. */
export function ratingFrom({ correct, sure, usedHint, score = 1, elapsedMs = 0 }) {
  if (!correct) return Rating.Again;
  if (usedHint || !sure) return Rating.Hard;
  if (score >= 0.95 && elapsedMs > 0 && elapsedMs < 12_000) return Rating.Easy;
  return Rating.Good;
}
