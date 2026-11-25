// Accueil : cartes du jour, examens à venir, progression.

import { html, DAY, startOfDay, examTimestamp, daysUntil, plural } from '../util.js';
import { icon } from '../ui.js';
import * as store from '../store.js';
import { getSettings, hasApiKey } from '../settings.js';
import { countDue, readiness } from '../queue.js';
import { pageHeader, examLabel, courseDot } from '../components.js';

function streak(reviews) {
  const days = new Set(reviews.map((r) => startOfDay(r.ts)));
  let day = startOfDay();
  if (!days.has(day)) day -= DAY;
  let n = 0;
  while (days.has(day)) { n++; day -= DAY; }
  return n;
}

function lastDays(reviews, n = 14) {
  const today = startOfDay();
  return Array.from({ length: n }, (_, i) => {
    const start = today - (n - 1 - i) * DAY;
    const list = reviews.filter((r) => r.ts >= start && r.ts < start + DAY);
    return { start, total: list.length, correct: list.filter((r) => r.correct).length };
  });
}

function onboarding() {
  const steps = [
    ['book', 'Crée un cours', 'avec la date de l\'examen pour caler le planning.'],
    ['camera', 'Importe tes notes', 'photo, PDF ou texte, puis vérifie le texte lu.'],
    ['pen', 'Rédige tes réponses', 'avec tes mots : l\'appli les compare à tes notes.'],
    ['review', 'Révise chaque jour', 'aux intervalles fixés par la répétition espacée.'],
  ];
  return html`
    <section class="hero card">
      <div>
        <h2>Bienvenue dans Mes révisions</h2>
        <p class="muted">Transforme tes notes de cours en questions, réponds avec tes mots, et révise au bon moment jusqu'à l'examen.</p>
      </div>
      <ol class="steps">${steps.map(([ic, t, d], i) => html`
        <li><span class="step-icon">${icon(ic)}</span><div><strong>${i + 1}. ${t}</strong><p class="muted">${d}</p></div></li>`)}
      </ol>
      <div class="row">
        <a class="btn btn-primary" href="#/cours?nouveau=1">${icon('plus')} Créer mon premier cours</a>
        ${hasApiKey() ? '' : html`<a class="btn btn-ghost" href="#/reglages">${icon('key')} Ajouter ma clé Gemini</a>`}
      </div>
    </section>`;
}

export default {
  async render() {
    const [courses, cards, reviews] = await Promise.all([store.listCourses(), store.listCards(), store.listReviews()]);
    const settings = getSettings();
    if (!courses.length) return html`${pageHeader('Accueil')}${onboarding()}`;

    const counts = countDue(cards, reviews, settings.newPerDay);
    const drafts = cards.filter((c) => c.status === 'draft');
    const flagged = cards.filter((c) => c.status === 'flagged');
    const days = lastDays(reviews);
    const max = Math.max(1, ...days.map((d) => d.total));
    const month = reviews.filter((r) => r.ts > Date.now() - 30 * DAY);
    const retention = month.length ? Math.round((month.filter((r) => r.correct).length / month.length) * 100) : null;
    const todayCount = days[days.length - 1].total;

    const upcoming = courses
      .map((c) => ({ c, ts: examTimestamp(c.examDate) }))
      .filter((x) => x.ts && daysUntil(x.ts) >= 0)
      .sort((a, b) => a.ts - b.ts);

    return html`
      ${pageHeader('Accueil', { subtitle: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) })}

      ${hasApiKey() ? '' : html`<a class="notice notice-info" href="#/reglages">${icon('key', 18)}
        <span>Ajoute ta clé API Gemini gratuite pour générer les questions et corriger tes réponses.</span>${icon('chevronRight', 18)}</a>`}

      <section class="today card">
        <div class="today-main">
          <span class="eyebrow">Aujourd'hui</span>
          <div class="big-number">${counts.total}</div>
          <p class="muted">${counts.total ? html`${plural(counts.due, 'carte à revoir', 'cartes à revoir')} · ${plural(counts.fresh, 'nouvelle', 'nouvelles')}` : 'Tout est à jour. Reviens demain, ou révise en avance.'}</p>
        </div>
        <div class="today-actions">
          <a class="btn btn-primary btn-lg" href="#/reviser">${icon('review')} ${counts.total ? 'Commencer la séance' : 'Réviser en avance'}</a>
          ${drafts.length ? html`<a class="btn btn-ghost" href="#/atelier">${icon('pen')} ${plural(drafts.length, 'réponse à rédiger', 'réponses à rédiger')}</a>` : ''}
        </div>
      </section>

      <section class="stats-grid">
        <div class="stat card"><span class="stat-icon">${icon('flame')}</span><div><strong>${streak(reviews)}</strong><span class="muted">jours d'affilée</span></div></div>
        <div class="stat card"><span class="stat-icon">${icon('check')}</span><div><strong>${todayCount}</strong><span class="muted">réponses aujourd'hui</span></div></div>
        <div class="stat card"><span class="stat-icon">${icon('target')}</span><div><strong>${retention == null ? '–' : `${retention} %`}</strong><span class="muted">réussite sur 30 jours</span></div></div>
        <div class="stat card"><span class="stat-icon">${icon('layers')}</span><div><strong>${cards.filter((c) => c.status === 'active').length}</strong><span class="muted">cartes actives</span></div></div>
      </section>

      <div class="grid-2 home-grid">
        <section class="card">
          <h2 class="card-title">${icon('calendar', 18)} Examens</h2>
          ${upcoming.length ? html`<ul class="list">${upcoming.map(({ c, ts }) => {
            const courseCards = cards.filter((x) => x.courseId === c.id);
            const r = readiness(courseCards);
            const d = daysUntil(ts);
            return html`<li><a class="list-item" href="#/cours/${c.id}">
              ${courseDot(c)}
              <div class="grow"><strong>${c.name}</strong><span class="muted">${examLabel(c)}</span>
                <div class="meter" title="Probabilité moyenne de te souvenir des cartes"><span style="width:${Math.round((r ?? 0) * 100)}%;background:${c.color}"></span></div>
              </div>
              <span class="countdown ${d <= 7 ? 'soon' : ''}">${d === 0 ? 'Jour J' : `J-${d}`}</span>
            </a></li>`;
          })}</ul>` : html`<p class="muted">Aucune date d'examen. Ajoute-la dans un cours pour que le planning s'y adapte.</p>`}
        </section>

        <section class="card">
          <h2 class="card-title">${icon('target', 18)} Activité des 14 derniers jours</h2>
          <div class="bars" role="img" aria-label="Nombre de réponses par jour">
            ${days.map((d) => html`<div class="bar" title="${new Date(d.start).toLocaleDateString('fr-FR')} : ${d.total} réponses, ${d.correct} justes">
              <span class="bar-fill" style="height:${(d.total / max) * 100}%"><span class="bar-ok" style="height:${d.total ? (d.correct / d.total) * 100 : 0}%"></span></span>
              <span class="bar-label">${new Date(d.start).toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>
            </div>`)}
          </div>
          <p class="legend"><span class="key key-ok"></span> justes <span class="key key-all"></span> total</p>
        </section>
      </div>

      ${flagged.length ? html`<a class="notice notice-danger" href="#/cours/${flagged[0].courseId}?onglet=cartes&filtre=flagged">${icon('flag', 18)}
        <span>${plural(flagged.length, 'carte signalée attend', 'cartes signalées attendent')} ta correction.</span>${icon('chevronRight', 18)}</a>` : ''}

      <section class="card">
        <h2 class="card-title">${icon('book', 18)} Mes cours</h2>
        <ul class="list">${courses.map((c) => {
          const cc = cards.filter((x) => x.courseId === c.id);
          const n = countDue(cc, [], Infinity);
          return html`<li><a class="list-item" href="#/cours/${c.id}">${courseDot(c)}
            <div class="grow"><strong>${c.name}</strong><span class="muted">${plural(cc.filter((x) => x.status === 'active').length, 'carte')} · ${n.due} à revoir</span></div>
            ${icon('chevronRight', 18)}</a></li>`;
        })}</ul>
      </section>`;
  },
};
