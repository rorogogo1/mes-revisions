// Traitements sans connexion : correction par mots-clés et génération simple de cartes.

import { normalize, uid } from './util.js';

const STOPWORDS = new Set(`
a au aux avec ce ces cet cette dans de des du elle elles en est et etre eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sont sur ta te tes toi ton tu un une vos votre vous y ont fait plus moins tres peut donc car comme ainsi alors aussi entre lorsque quand sans sous tout tous toute toutes
the of and to in is are be by for with on at as an or that this these those it its from was were which not but
`.split(/\s+/).filter(Boolean));

function stem(word) {
  return word.replace(/(ements|ement|ations|ation|ments|ment|euses|euse|eurs|eur|ives|ive|ifs|if|es|s|x|e)$/, '');
}

export function keyTokens(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
    .filter(Boolean);
}

function levenshtein(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Réponse courte (texte à trou, choix) : égalité tolérante aux fautes de frappe. */
export function matchShort(given, expected) {
  const g = normalize(given); const e = normalize(expected);
  if (!g || !e) return false;
  if (g === e) return true;
  const tolerance = Math.max(1, Math.floor(e.length / 6));
  return levenshtein(g, e) <= tolerance;
}

/**
 * Correction approximative par recouvrement des mots-clés.
 * @returns {{ correct: boolean, score: number, feedback: string, method: 'local' }}
 */
export function gradeLocally(given, expected, type = 'qa') {
  if (type === 'cloze' || expected.split(/\s+/).length <= 3) {
    const ok = matchShort(given, expected);
    return { correct: ok, score: ok ? 1 : 0, feedback: ok ? 'Réponse identique à celle attendue.' : 'La réponse ne correspond pas aux mots attendus.', method: 'local' };
  }
  const exp = [...new Set(keyTokens(expected))];
  const giv = new Set(keyTokens(given));
  if (!exp.length) return { correct: false, score: 0, feedback: '', method: 'local' };
  const found = exp.filter((w) => giv.has(w) || [...giv].some((g) => g.length > 4 && (g.startsWith(w) || w.startsWith(g))));
  const score = found.length / exp.length;
  const correct = score >= 0.55;
  return {
    correct,
    score,
    feedback: `Correction hors ligne par mots-clés : ${Math.round(score * 100)} % des termes importants retrouvés. Vérifie toi-même et corrige le verdict si besoin.`,
    method: 'local',
  };
}

/** Comparaison hors ligne de la réponse rédigée avec le passage des notes. */
export function compareLocally(studentAnswer, passage) {
  const result = gradeLocally(studentAnswer, passage);
  const passageTokens = [...new Set(keyTokens(passage))];
  const given = new Set(keyTokens(studentAnswer));
  const originalWords = String(passage).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  const missing = passageTokens
    .filter((t) => !given.has(t) && t.length > 4)
    .slice(0, 6)
    .map((t) => originalWords.find((w) => stem(normalize(w)) === t) || t);
  const verdict = result.score >= 0.6 ? 'correct' : result.score >= 0.3 ? 'partiel' : 'incorrect';
  return {
    verdict,
    feedback: `Comparaison hors ligne : ta réponse reprend ${Math.round(result.score * 100)} % des termes clés du passage.`,
    missing,
    errors: [],
    improvedAnswer: '',
    method: 'local',
  };
}

// ---------- Génération simple de cartes (sans IA) ----------
const DEF_VERBS = /^(.{3,80}?)\s+(est|sont|désigne|désignent|correspond à|correspondent à|se définit comme|signifie|représente)\s+(.{8,})$/i;
const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/;

function sentences(text) {
  return text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
}

/**
 * Crée des cartes question-réponse et textes à trou à partir de motifs simples :
 * « Terme : définition », « X est … », dates.
 */
export function generateLocally(paragraphs, count = 10) {
  const out = [];
  const seen = new Set();
  const push = (card) => {
    const key = normalize(card.question);
    if (seen.has(key) || out.length >= count) return;
    seen.add(key);
    out.push({ id: uid(), hint: '', distractors: [], shortAnswer: card.answer.slice(0, 80), ...card });
  };

  for (const p of paragraphs) {
    for (const line of p.text.split('\n')) {
      const m = line.match(/^\s*[-•*]?\s*([^:]{2,60})\s*:\s*(.{8,})$/);
      if (m) {
        push({
          type: 'qa', concept: m[1].trim(), question: `Que signifie « ${m[1].trim()} » ?`, answer: m[2].trim(),
          explanation: `D'après tes notes : ${line.trim()}`, sourceIds: [p.id], quote: line.trim(),
        });
      }
    }
    for (const s of sentences(p.text)) {
      const d = s.match(DEF_VERBS);
      if (d && d[1].split(' ').length <= 8) {
        const subject = d[1].replace(/^(le|la|les|l'|un|une|des)\s*/i, '').trim();
        push({
          type: 'qa', concept: subject, question: `Que ${/sont|désignent|correspondent/.test(d[2]) ? 'désignent' : 'désigne'} « ${d[1].trim()} » ?`,
          answer: `${d[2]} ${d[3]}`.trim(), explanation: `D'après tes notes : ${s}`, sourceIds: [p.id], quote: s,
        });
      }
      const y = s.match(YEAR);
      if (y) {
        push({
          type: 'cloze', concept: s.slice(0, 40), question: s.replace(y[0], '____'), answer: y[0],
          explanation: `D'après tes notes : ${s}`, sourceIds: [p.id], quote: s,
        });
      }
    }
  }
  return out;
}
