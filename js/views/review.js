// Séance de révision : question sans choix, réponse écrite, certitude, correction en quatre cas, planning FSRS.

import { html, plural, relativeDays, examTimestamp } from '../util.js';
import { icon, toast, emptyState, badge, spinner } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, typeBadge, showSourceDialog, passageText, flagCardDialog, courseDot } from '../components.js';
import { buildQueue, countDue } from '../queue.js';
import { schedule, ratingFrom, Rating } from '../fsrs.js';
import { gradeAnswer } from '../ai.js';
import { gradeLocally, matchShort } from '../local-ai.js';
import { getSettings, hasApiKey } from '../settings.js';
import { wikiSummary } from '../wiki.js';

let session = null;
let keyHandler = null;

const RATING_LABEL = { 1: 'À revoir', 2: 'Difficile', 3: 'Bien', 4: 'Facile' };

// ---------- Préparation ----------
function setupView({ courses, cards, reviews, selectedCourses, selectedChapters, limit }) {
  const s = getSettings();
  const single = selectedCourses.size === 1 ? courses.find((c) => selectedCourses.has(c.id)) : null;
  const chapters = single ? [...new Set(cards.filter((c) => c.courseId === single.id && c.status === 'active').map((c) => c.chapter || ''))] : [];
  const queue = buildQueue({
    cards, reviews, limit, newPerDay: s.newPerDay,
    courseIds: selectedCourses,
    chapters: single && selectedChapters.size ? new Set([...selectedChapters].map((ch) => `${single.id}|${ch}`)) : null,
  });
  const active = cards.filter((c) => c.status === 'active' && selectedCourses.has(c.courseId)).length;
  const drafts = cards.filter((c) => c.status === 'draft').length;

  return html`
    <section class="card stack">
      <h2 class="card-title">${icon('book', 18)} Que veux-tu réviser ?</h2>
      <p class="muted small">Coche plusieurs cours pour une séance mélangée.</p>
      <div class="check-list">${courses.map((c) => {
        const n = countDue(cards.filter((x) => x.courseId === c.id), reviews, s.newPerDay);
        return html`<label class="check"><input type="checkbox" data-course="${c.id}" ${selectedCourses.has(c.id) ? 'checked' : ''}>
          <span class="row grow between">${courseDot(c)}<strong class="grow">${c.name}</strong><span class="muted small">${n.due} à revoir · ${n.fresh} nouvelles</span></span></label>`;
      })}</div>
      ${single && chapters.length > 1 ? html`
        <fieldset class="field"><span>Chapitres <em class="muted">(aucun coché = tous)</em></span>
          <div class="chip-list">${chapters.map((ch) => html`
            <label class="chip"><input type="checkbox" data-chapter="${ch}" ${selectedChapters.has(ch) ? 'checked' : ''}><span>${ch || 'Sans chapitre'}</span></label>`)}</div>
        </fieldset>` : ''}
      <label class="field inline"><span>Taille de la séance</span>
        <select class="input" data-limit>${[10, 20, 30, 50, 9999].map((n) => html`<option value="${n}" ${n === limit ? 'selected' : ''}>${n === 9999 ? 'Toutes les cartes dues' : `${n} cartes max.`}</option>`)}</select></label>
    </section>
    ${queue.length ? html`
      <button class="btn btn-primary btn-lg block" data-start>${icon('review')} Commencer · ${plural(queue.length, 'carte')}</button>`
    : active ? html`
      <div class="notice notice-success">${icon('check', 18)}<span>Rien à revoir pour l'instant dans cette sélection. Tu peux réviser en avance les cartes les plus fragiles.</span></div>
      <button class="btn btn-primary btn-lg block" data-practice>${icon('review')} Réviser en avance</button>`
    : emptyState({
      iconName: 'layers', title: 'Aucune carte prête',
      text: drafts ? `${plural(drafts, 'carte attend', 'cartes attendent')} ta réponse avant de pouvoir être révisée.` : 'Importe des notes et crée des questions pour commencer.',
      action: drafts ? html`<a class="btn btn-primary" href="#/atelier">${icon('pen')} Rédiger mes réponses</a>` : html`<a class="btn btn-primary" href="#/importer">${icon('upload')} Importer des notes</a>`,
    })}`;
}

// ---------- Séance ----------
function questionText(card) {
  return card.type === 'cloze' ? card.question.replace(/_{2,}/g, '＿＿＿＿') : card.question;
}

function answerPhase(card, cur) {
  const isShort = card.type === 'cloze';
  return html`
    <label class="field"><span class="sr-only">Ta réponse</span>
      ${isShort
        ? html`<input class="input answer-input" data-given value="${cur.given}" placeholder="Le mot manquant" autocomplete="off" ${cur.selected != null ? 'readonly' : ''}>`
        : html`<textarea class="input answer-input" data-given rows="4" placeholder="Réponds avec tes mots…" ${cur.selected != null ? 'readonly' : ''}>${cur.given}</textarea>`}
    </label>
    ${cur.showChoices && card.choices.length ? html`<div class="choices">${card.choices.map((ch, i) => html`
      <button class="choice ${cur.selected === i ? 'selected' : ''}" data-choice="${i}"><span class="choice-letter">${'ABCDE'[i]}</span>${ch.text}</button>`)}</div>` : ''}
    ${cur.showHint && card.hint ? html`<p class="hint">${icon('bulb', 16)} ${card.hint}</p>` : ''}
    <div class="row between wrap">
      <div class="row wrap">
        ${(!cur.showChoices && card.choices.length) || (!cur.showHint && card.hint && !card.choices.length)
          ? html`<button class="btn btn-ghost" data-stuck>${icon('help')} Je bloque</button>` : ''}
        <button class="btn btn-ghost" data-dontknow>Je ne sais pas</button>
      </div>
      <button class="btn btn-primary" data-submit>Valider ${icon('chevronRight', 18)}</button>
    </div>`;
}

function confidencePhase(cur) {
  return html`
    <div class="given-preview"><span class="muted small">Ta réponse</span><p>${cur.given}</p></div>
    <div class="confidence">
      <p><strong>Avant de voir la correction : es-tu sûr de ta réponse ?</strong></p>
      <div class="row">
        <button class="btn btn-lg grow btn-confident" data-sure="1">${icon('check')} Sûr <kbd>1</kbd></button>
        <button class="btn btn-lg grow btn-unsure" data-sure="0">${icon('help')} Pas sûr <kbd>2</kbd></button>
      </div>
    </div>`;
}

const CASES = {
  'true-true': { kind: 'success', title: 'Juste, et tu en étais sûr.', text: 'L\'explication reste disponible si tu veux la relire.', showExplanation: false },
  'true-false': { kind: 'success', title: 'Juste !', text: 'Tu hésitais : voici pourquoi c\'est la bonne réponse, pour consolider.', showExplanation: true },
  'false-true': { kind: 'danger', title: 'Erreur commise avec assurance', text: 'C\'est le type d\'erreur que la correction aide le plus à rectifier. La carte reviendra plus tôt.', showExplanation: true },
  'false-false': { kind: 'warn', title: 'Pas tout à fait', text: 'Voici la bonne réponse et pourquoi.', showExplanation: true },
};

function feedbackPhase(card, cur, preview) {
  const c = CASES[`${cur.correct}-${cur.sure}`];
  const showExp = c.showExplanation || cur.expandExplanation;
  const expected = card.type === 'cloze' ? card.question.replace(/_{2,}/, `【${card.answer || card.refAnswer}】`) : (card.answer || card.refAnswer);
  const showChoicesWhy = card.choices.length && (cur.showChoices || card.type === 'mcq');
  return html`
    <div class="verdict verdict-${c.kind}">
      <div class="verdict-icon">${icon(cur.correct ? 'check' : 'x', 22)}</div>
      <div><strong>${c.title}</strong><p>${c.text}</p></div>
    </div>
    <div class="answers">
      <div><span class="muted small">Ta réponse</span><p>${cur.given || '—'}</p></div>
      <div><span class="muted small">Réponse attendue</span><p><strong>${expected}</strong></p></div>
    </div>
    ${cur.feedback ? html`<p class="ai-feedback">${cur.feedback}</p>` : ''}
    ${showExp ? html`
      <div class="explanation">
        <h3>${icon('bulb', 18)} Pourquoi</h3>
        <p>${card.explanation || 'Pas d\'explication enregistrée pour cette carte.'}</p>
        ${showChoicesWhy ? html`<ul class="choice-why">${card.choices.map((ch, i) => html`
          <li class="${ch.correct ? 'ok' : 'ko'} ${cur.selected === i ? 'picked' : ''}">${icon(ch.correct ? 'check' : 'x', 16)}<div><strong>${ch.text}</strong>${ch.why && !ch.correct ? html` — ${ch.why}` : ''}</div></li>`)}</ul>` : ''}
        ${card.quote ? html`<blockquote class="quote">« ${card.quote} »
          ${card.quoteMatch !== 'exact' ? html`<span class="small warn-text">(citation non retrouvée mot pour mot)</span>` : ''}</blockquote>` : ''}
        <div class="row wrap">
          <button class="btn btn-ghost btn-sm" data-source>${icon('bookOpen', 16)} Voir dans mes notes</button>
          ${card.concept && navigator.onLine ? html`<button class="btn btn-ghost btn-sm" data-wiki>${icon('globe', 16)} Pour aller plus loin</button>` : ''}
        </div>
        <div data-wiki-box></div>
      </div>`
    : html`<button class="btn btn-ghost btn-sm" data-expand>${icon('bulb', 16)} Voir l'explication</button>`}
    <div class="row between wrap footer-row">
      <div class="row wrap">
        <button class="btn btn-ghost btn-sm" data-override>${cur.correct ? 'Compter comme faux' : 'En fait, j\'avais juste'}</button>
        <button class="btn btn-ghost btn-sm" data-flag>${icon('flag', 16)} Signaler une erreur</button>
      </div>
      <button class="btn btn-primary" data-next>Continuer ${icon('chevronRight', 18)}</button>
    </div>
    <p class="muted small right">${RATING_LABEL[preview.rating]} · prochaine révision ${relativeDays(preview.next.due)}</p>`;
}

function summaryView() {
  const r = session.results;
  const unique = new Map(r.map((x) => [x.card.id, x]));
  const first = new Map();
  r.forEach((x) => { if (!first.has(x.card.id)) first.set(x.card.id, x); });
  const firstTry = [...first.values()];
  const right = firstTry.filter((x) => x.correct).length;
  const confidentErrors = firstTry.filter((x) => !x.correct && x.sure);
  const missed = firstTry.filter((x) => !x.correct);
  return html`
    <section class="card stack center pad summary">
      <div class="summary-icon">${icon('check', 32)}</div>
      <h2>Séance terminée</h2>
      <div class="summary-stats">
        <div><strong>${unique.size}</strong><span class="muted">cartes</span></div>
        <div><strong>${firstTry.length ? Math.round((right / firstTry.length) * 100) : 0} %</strong><span class="muted">justes du premier coup</span></div>
        <div><strong>${confidentErrors.length}</strong><span class="muted">erreurs avec assurance</span></div>
      </div>
    </section>
    ${missed.length ? html`<section class="card stack">
      <h3 class="card-title">${icon('target', 18)} À retenir</h3>
      <ul class="list">${missed.map((x) => html`<li class="list-item"><div class="grow"><strong>${x.card.question}</strong>
        <span class="muted">${x.card.answer || x.card.refAnswer}</span></div>${x.sure ? badge('sûr', 'danger') : ''}</li>`)}</ul>
    </section>` : ''}
    <div class="row wrap center">
      <a class="btn btn-ghost" href="#/">${icon('home')} Accueil</a>
      <button class="btn btn-primary" data-again>${icon('review')} Nouvelle séance</button>
    </div>`;
}

function sessionView() {
  if (session.pos >= session.queue.length) return summaryView();
  const card = session.queue[session.pos];
  const cur = session.cur;
  const course = session.courses.get(card.courseId);
  const progress = (session.pos / session.queue.length) * 100;
  let body;
  if (cur.phase === 'answer') body = answerPhase(card, cur);
  else if (cur.phase === 'confidence') body = confidencePhase(cur);
  else if (cur.phase === 'grading') body = spinner('Correction en cours…');
  else body = feedbackPhase(card, cur, previewRating(card, cur));
  return html`
    <div class="session-top">
      <button class="icon-btn" data-quit aria-label="Arrêter la séance">${icon('x')}</button>
      <div class="progress grow"><span style="width:${progress}%"></span></div>
      <span class="muted small">${session.pos + 1} / ${session.queue.length}</span>
    </div>
    <section class="card stack review-card" style="--c:${course?.color || '#4f46e5'}">
      <div class="row between wrap">
        <div class="row-badges">${courseDot(course)} <span class="small">${course?.name || ''}${card.chapter ? ` · ${card.chapter}` : ''}</span></div>
        <div class="row-badges">${typeBadge(card.type)}${card.fsrs.state === 'new' ? badge('Nouvelle', 'info') : ''}</div>
      </div>
      <h2 class="question">${questionText(card)}</h2>
      <div data-phase>${body}</div>
    </section>`;
}

function previewRating(card, cur) {
  const rating = ratingFrom({ correct: cur.correct, sure: cur.sure, usedHint: cur.usedHint, score: cur.score, elapsedMs: cur.elapsedMs });
  const course = session.courses.get(card.courseId);
  const next = schedule(card.fsrs, rating, { retention: getSettings().retention, examTs: examTimestamp(course?.examDate) });
  return { rating, next };
}

const newCur = () => ({ phase: 'answer', given: '', selected: null, showChoices: false, showHint: false, usedHint: false, startedAt: Date.now() });

async function grade(card, cur) {
  const expected = card.answer || card.refAnswer;
  if (cur.selected != null) {
    cur.correct = Boolean(card.choices[cur.selected]?.correct);
    cur.score = cur.correct ? 1 : 0;
    return;
  }
  if (!cur.given.trim()) { cur.correct = false; cur.score = 0; return; }
  const candidates = [expected, card.refAnswer, card.shortAnswer].filter(Boolean);
  if (candidates.some((c) => matchShort(cur.given, c))) { cur.correct = true; cur.score = 1; return; }
  if (card.type !== 'cloze' && hasApiKey() && navigator.onLine) {
    try {
      const res = await gradeAnswer({ question: card.question, expected, given: cur.given, passages: await passageText(card), language: getSettings().language });
      Object.assign(cur, { correct: Boolean(res.correct), score: Number(res.score) || (res.correct ? 1 : 0), feedback: res.feedback });
      return;
    } catch (err) {
      toast(`${err.message} Correction hors ligne utilisée.`, 'warn', 4000);
    }
  }
  const local = gradeLocally(cur.given, expected, card.type);
  Object.assign(cur, { correct: local.correct, score: local.score, feedback: local.feedback });
}

async function finishCard() {
  const card = session.queue[session.pos];
  const cur = session.cur;
  const { rating, next } = previewRating(card, cur);
  const wasNew = card.fsrs.state === 'new';
  card.fsrs = next;
  await store.saveCard(card);
  await store.addReview({ cardId: card.id, courseId: card.courseId, correct: cur.correct, sure: cur.sure, usedHint: cur.usedHint, rating, wasNew, elapsedMs: cur.elapsedMs });
  session.results.push({ card, correct: cur.correct, sure: cur.sure });

  if (rating === Rating.Again) {
    const times = session.requeued.get(card.id) || 0;
    if (times < 2) {
      session.requeued.set(card.id, times + 1);
      const offset = cur.sure ? 2 : 4; // erreur avec assurance : revue plus tôt
      session.queue.splice(Math.min(session.queue.length, session.pos + 1 + offset), 0, card);
    }
  }
  session.pos++;
  session.cur = newCur();
}

export default {
  async render(ctx) {
    const [courses, cards, reviews] = await Promise.all([store.listCourses(), store.listCards(), store.listReviews()]);
    if (session) {
      return html`<div data-session>${sessionView()}</div>`;
    }
    const prev = ctx.setup || {};
    const selectedCourses = prev.selectedCourses || new Set(ctx.query.cours ? [ctx.query.cours] : courses.map((c) => c.id));
    const selectedChapters = prev.selectedChapters || new Set(ctx.query.chapitre != null ? [ctx.query.chapitre] : []);
    const limit = prev.limit || 20;
    ctx.state = { courses, cards, reviews, selectedCourses, selectedChapters, limit };
    if (!courses.length) {
      return html`${pageHeader('Réviser')}${emptyState({ iconName: 'book', title: 'Aucun cours', action: html`<a class="btn btn-primary" href="#/cours?nouveau=1">Créer un cours</a>` })}`;
    }
    return html`${pageHeader('Réviser', { subtitle: 'Séance du jour' })}<div data-setup>${setupView(ctx.state)}</div>`;
  },

  mount(root, ctx) {
    const paint = () => {
      const box = root.querySelector('[data-session]');
      if (!box) return ctx.rerender();
      box.innerHTML = String(sessionView());
      const input = box.querySelector('[data-given]:not([readonly])');
      if (input) { input.focus(); input.setSelectionRange?.(input.value.length, input.value.length); }
      window.scrollTo({ top: 0 });
    };

    // --- Écran de préparation ---
    const setup = root.querySelector('[data-setup]');
    if (setup) {
      const st = ctx.state;
      const repaint = () => { ctx.setup = st; setup.innerHTML = String(setupView(st)); };
      setup.addEventListener('change', (e) => {
        if (e.target.dataset.course) {
          e.target.checked ? st.selectedCourses.add(e.target.dataset.course) : st.selectedCourses.delete(e.target.dataset.course);
          st.selectedChapters.clear();
        }
        if (e.target.dataset.chapter != null) {
          e.target.checked ? st.selectedChapters.add(e.target.dataset.chapter) : st.selectedChapters.delete(e.target.dataset.chapter);
        }
        if (e.target.matches('[data-limit]')) st.limit = Number(e.target.value);
        repaint();
      });
      setup.addEventListener('click', (e) => {
        const practice = e.target.closest('[data-practice]');
        if (!e.target.closest('[data-start]') && !practice) return;
        const single = st.selectedCourses.size === 1 ? [...st.selectedCourses][0] : null;
        const queue = buildQueue({
          cards: st.cards, reviews: st.reviews, limit: st.limit, newPerDay: getSettings().newPerDay,
          courseIds: st.selectedCourses, practice: Boolean(practice),
          chapters: single && st.selectedChapters.size ? new Set([...st.selectedChapters].map((ch) => `${single}|${ch}`)) : null,
        });
        if (!queue.length) return toast('Aucune carte dans cette sélection.', 'warn');
        session = { queue, pos: 0, cur: newCur(), results: [], requeued: new Map(), courses: new Map(st.courses.map((c) => [c.id, c])) };
        ctx.rerender();
      });
      return;
    }

    // --- Séance ---
    const box = root.querySelector('[data-session]');
    if (!box) return;
    if (box.querySelector('[data-given]')) box.querySelector('[data-given]').focus();

    const submit = () => {
      const cur = session.cur;
      const input = box.querySelector('[data-given]');
      if (input && cur.selected == null) cur.given = input.value.trim();
      if (!cur.given) { input?.focus(); return toast('Écris une réponse, ou choisis « Je ne sais pas ».', 'warn'); }
      cur.elapsedMs = Date.now() - cur.startedAt;
      cur.phase = 'confidence';
      paint();
    };

    const chooseSure = async (sure) => {
      const cur = session.cur;
      const card = session.queue[session.pos];
      cur.sure = sure;
      cur.phase = 'grading';
      paint();
      await grade(card, cur);
      cur.phase = 'feedback';
      paint();
    };

    box.addEventListener('input', (e) => {
      if (e.target.matches('[data-given]')) session.cur.given = e.target.value;
    });

    box.addEventListener('click', async (e) => {
      const t = (sel) => e.target.closest(sel);
      const cur = session?.cur;
      const card = session?.queue[session.pos];

      if (t('[data-quit]')) {
        if (session.results.length) { session.queue = session.queue.slice(0, session.pos); paint(); } // affiche le bilan
        else { session = null; ctx.rerender(); }
        return;
      }
      if (t('[data-again]')) { session = null; ctx.rerender(); return; }
      if (!card) return;

      if (t('[data-stuck]')) {
        cur.usedHint = true;
        if (card.choices.length) cur.showChoices = true; else cur.showHint = true;
        cur.given = box.querySelector('[data-given]')?.value || '';
        paint();
      }
      const choice = t('[data-choice]');
      if (choice) {
        const i = Number(choice.dataset.choice);
        cur.selected = cur.selected === i ? null : i;
        cur.given = cur.selected == null ? '' : card.choices[i].text;
        paint();
      }
      if (t('[data-dontknow]')) {
        Object.assign(cur, { given: '', sure: false, elapsedMs: Date.now() - cur.startedAt, phase: 'grading' });
        await grade(card, cur);
        cur.phase = 'feedback';
        paint();
      }
      if (t('[data-submit]')) submit();
      const sure = t('[data-sure]');
      if (sure) chooseSure(sure.dataset.sure === '1');
      if (t('[data-expand]')) { cur.expandExplanation = true; paint(); }
      if (t('[data-override]')) {
        cur.correct = !cur.correct;
        cur.score = cur.correct ? Math.max(cur.score || 0, 0.8) : 0;
        cur.feedback = cur.correct ? 'Verdict corrigé par toi : réponse comptée comme juste.' : 'Verdict corrigé par toi : réponse comptée comme fausse.';
        paint();
      }
      if (t('[data-source]')) showSourceDialog(card);
      if (t('[data-wiki]')) {
        const btn = t('[data-wiki]');
        const wbox = box.querySelector('[data-wiki-box]');
        btn.disabled = true;
        wbox.innerHTML = String(spinner('Recherche sur Wikipédia…'));
        try {
          const lang = getSettings().language;
          const w = await wikiSummary(card.concept, lang);
          wbox.innerHTML = String(w
            ? html`<div class="wiki"><p class="small muted">Wikipédia (hors de tes notes) · <a href="${w.url}" target="_blank" rel="noopener">${w.title}</a></p><p>${w.extract}</p></div>`
            : html`<p class="muted small">Aucun article trouvé.</p>`);
        } catch (err) {
          wbox.innerHTML = String(html`<p class="muted small">${err.message}</p>`);
        }
      }
      if (t('[data-flag]')) {
        if (await flagCardDialog(card)) {
          session.queue = session.queue.filter((c, i) => i < session.pos || c.id !== card.id);
          session.cur = newCur();
          paint();
        }
      }
      if (t('[data-next]')) {
        t('[data-next]').disabled = true;
        await finishCard();
        paint();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (!e.target.matches('[data-given]')) return;
      const single = e.target.tagName === 'INPUT';
      if (e.key === 'Enter' && (single || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });

    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = (e) => {
      if (!session || e.target.matches('input, textarea, select') || document.querySelector('.modal-backdrop')) return;
      const phase = session.cur.phase;
      if (phase === 'confidence' && (e.key === '1' || e.key === '2')) chooseSure(e.key === '1');
      if (phase === 'feedback' && e.key === 'Enter') { e.preventDefault(); box.querySelector('[data-next]')?.click(); }
    };
    document.addEventListener('keydown', keyHandler);
  },

  unmount() {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  },
};
