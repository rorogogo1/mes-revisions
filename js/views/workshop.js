// Atelier : l'étudiant rédige la réponse de chaque carte avec ses mots, puis la compare à ses notes.

import { html, plural } from '../util.js';
import { icon, toast, withBusy, emptyState, badge, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, typeBadge, showSourceDialog, passageText, editCardDialog } from '../components.js';
import { compareWithNotes } from '../ai.js';
import { compareLocally, matchShort } from '../local-ai.js';
import { getSettings, hasApiKey } from '../settings.js';

let session = null; // { courseId, ids, index, comparisons: Map }

const VERDICT = {
  correct: { label: 'Conforme à tes notes', kind: 'success', icon: 'check' },
  partiel: { label: 'Incomplet', kind: 'warn', icon: 'help' },
  incorrect: { label: 'Différent de tes notes', kind: 'danger', icon: 'x' },
};

function comparisonView(cmp) {
  if (!cmp) return '';
  const v = VERDICT[cmp.verdict] || VERDICT.partiel;
  return html`<div class="feedback feedback-${v.kind}">
    <div class="feedback-head">${icon(v.icon, 18)} <strong>${v.label}</strong>${cmp.method === 'local' ? badge('hors ligne', '') : ''}</div>
    ${cmp.feedback ? html`<p>${cmp.feedback}</p>` : ''}
    ${cmp.missing?.length ? html`<p class="small"><strong>Il manque :</strong> ${cmp.missing.join(' · ')}</p>` : ''}
    ${cmp.errors?.length ? html`<p class="small"><strong>À corriger :</strong> ${cmp.errors.join(' · ')}</p>` : ''}
    ${cmp.improvedAnswer ? html`<div class="improved"><span class="small muted">Ta réponse complétée :</span><p>${cmp.improvedAnswer}</p>
      <button class="btn btn-ghost btn-sm" data-use-improved>${icon('edit', 16)} Reprendre cette version</button></div>` : ''}
  </div>`;
}

function cardView(card, index, total, cmp, draftText) {
  return html`
    <div class="progress thin"><span style="width:${(index / total) * 100}%"></span></div>
    <section class="card stack workshop-card">
      <div class="row between">
        <div class="row-badges">${typeBadge(card.type)} ${card.chapter ? html`<span class="muted small">${card.chapter}</span>` : ''}</div>
        <span class="muted small">${index + 1} / ${total}</span>
      </div>
      <h2 class="question">${card.question}</h2>
      <label class="field"><span>Ta réponse, avec tes mots</span>
        <textarea class="input answer-input" data-answer rows="${card.type === 'cloze' ? 2 : 5}" placeholder="${card.type === 'cloze' ? 'Le ou les mots manquants' : 'Écris ce que tu as compris, sans recopier tes notes…'}">${draftText}</textarea>
      </label>
      <div class="row wrap">
        <button class="btn btn-primary" data-compare>${icon('eye')} Comparer à mes notes</button>
        <button class="btn btn-ghost" data-show-source>${icon('bookOpen')} Voir le passage</button>
        <button class="icon-btn" data-edit aria-label="Modifier la question" title="Modifier la question">${icon('edit')}</button>
        <button class="icon-btn" data-delete aria-label="Supprimer la carte" title="Supprimer la carte">${icon('trash')}</button>
      </div>
      <div data-comparison>${comparisonView(cmp)}</div>
      <div class="row between wrap footer-row">
        <button class="btn btn-ghost" data-skip>Passer</button>
        <button class="btn btn-success" data-validate>${icon('check')} Valider la carte</button>
      </div>
    </section>`;
}

export default {
  async render(ctx) {
    const courseId = ctx.query.cours || '';
    const drafts = (await store.listCards({ courseId: courseId || undefined, status: 'draft' })).sort((a, b) => a.createdAt - b.createdAt);
    if (!session || session.courseId !== courseId) session = { courseId, ids: drafts.map((c) => c.id), index: 0, comparisons: new Map(), texts: new Map() };
    session.ids = session.ids.filter((id) => drafts.some((c) => c.id === id));
    drafts.forEach((c) => { if (!session.ids.includes(c.id)) session.ids.push(c.id); });
    const course = courseId ? await store.getCourse(courseId) : null;
    const back = courseId ? `#/cours/${courseId}` : '#/';
    const header = pageHeader('Rédiger mes réponses', {
      subtitle: course ? course.name : 'Tous les cours',
      back,
    });

    if (!session.ids.length) {
      session = null;
      return html`${header}${emptyState({
        iconName: 'check', title: 'Aucune réponse à rédiger',
        text: 'Toutes tes cartes ont une réponse. Elles sont prêtes pour la révision.',
        action: html`<a class="btn btn-primary" href="#/reviser${courseId ? `?cours=${courseId}` : ''}">${icon('review')} Réviser</a>`,
      })}`;
    }
    if (session.index >= session.ids.length) session.index = 0;
    const card = drafts.find((c) => c.id === session.ids[session.index]);
    ctx.state = { card, course: course || await store.getCourse(card.courseId) };
    return html`${header}
      <p class="notice notice-info">${icon('bulb', 18)}<span>Rédiger toi-même la réponse t'aide à mieux retenir que lire une réponse toute faite. ${plural(session.ids.length, 'carte attend', 'cartes attendent')} ta réponse.</span></p>
      ${cardView(card, session.index, session.ids.length, session.comparisons.get(card.id), session.texts.get(card.id) || card.answer || '')}`;
  },

  mount(root, ctx) {
    if (!ctx.state?.card) return;
    const { card, course } = ctx.state;
    const textarea = root.querySelector('[data-answer]');
    textarea.focus();
    textarea.addEventListener('input', () => session.texts.set(card.id, textarea.value));

    const next = () => {
      session.index = (session.index + 1) % Math.max(1, session.ids.length);
      ctx.rerender();
    };

    root.querySelector('[data-compare]').addEventListener('click', async (e) => {
      const answer = textarea.value.trim();
      if (!answer) { textarea.focus(); return toast('Écris d\'abord ta réponse.', 'warn'); }
      await withBusy(e.currentTarget, async () => {
        const passages = await passageText(card);
        let cmp;
        if (card.type === 'cloze' && card.refAnswer) {
          const ok = matchShort(answer, card.refAnswer);
          cmp = { verdict: ok ? 'correct' : 'incorrect', feedback: ok ? 'C\'est bien le mot des notes.' : `Tes notes indiquent : « ${card.refAnswer} ».`, missing: [], errors: [], improvedAnswer: ok ? '' : card.refAnswer, method: 'local' };
        } else if (hasApiKey() && navigator.onLine) {
          try {
            cmp = await compareWithNotes({ question: card.question, studentAnswer: answer, passages: passages || card.refAnswer, language: getSettings().language });
          } catch (err) {
            toast(`${err.message} Comparaison hors ligne utilisée.`, 'warn', 5000);
            cmp = compareLocally(answer, passages || card.refAnswer);
          }
        } else {
          cmp = compareLocally(answer, passages || card.refAnswer);
        }
        session.comparisons.set(card.id, cmp);
        root.querySelector('[data-comparison]').innerHTML = String(comparisonView(cmp));
      }, 'Comparaison…');
    });

    root.querySelector('[data-comparison]').addEventListener('click', (e) => {
      if (e.target.closest('[data-use-improved]')) {
        textarea.value = session.comparisons.get(card.id).improvedAnswer;
        session.texts.set(card.id, textarea.value);
        textarea.focus();
      }
    });

    root.querySelector('[data-show-source]').addEventListener('click', () => showSourceDialog(card));
    root.querySelector('[data-edit]').addEventListener('click', async () => {
      const res = await editCardDialog(card, course);
      if (res) ctx.rerender();
    });
    root.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!await confirmDialog('Supprimer cette carte ?', { danger: true, confirmLabel: 'Supprimer' })) return;
      await store.deleteCards([card.id]);
      session.ids.splice(session.index, 1);
      ctx.rerender();
    });
    root.querySelector('[data-skip]').addEventListener('click', next);
    root.querySelector('[data-validate]').addEventListener('click', async () => {
      const answer = textarea.value.trim();
      if (!answer) { textarea.focus(); return toast('Écris ta réponse avant de valider la carte.', 'warn'); }
      if (!session.comparisons.has(card.id)
        && !await confirmDialog('Tu n\'as pas comparé ta réponse à tes notes. Valider quand même ?', { confirmLabel: 'Valider' })) return;
      card.answer = answer;
      card.status = 'active';
      await store.saveCard(card);
      session.ids.splice(session.index, 1);
      session.comparisons.delete(card.id);
      session.texts.delete(card.id);
      toast('Carte prête pour la révision', 'success', 1800);
      ctx.rerender();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) root.querySelector('[data-compare]').click();
    });
  },
};
