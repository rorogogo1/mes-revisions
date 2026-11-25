// Fragments d'interface réutilisés par plusieurs écrans.

import { html, esc, examTimestamp, daysUntil, formatDate, CARD_TYPES } from './util.js';
import { icon, modal, toast, confirmDialog, badge } from './ui.js';
import * as store from './store.js';
import { COURSE_COLORS } from './store.js';
import { passagesFor } from './text.js';

export function pageHeader(title, { subtitle = '', back = '', actions = '' } = {}) {
  return html`<header class="page-header">
    <div class="page-title">
      ${back ? html`<a class="icon-btn" href="${back}" aria-label="Retour">${icon('arrowLeft')}</a>` : ''}
      <div>
        <h1>${title}</h1>
        ${subtitle ? html`<p class="muted">${subtitle}</p>` : ''}
      </div>
    </div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function examLabel(course) {
  const ts = examTimestamp(course.examDate);
  if (!ts) return '';
  const d = daysUntil(ts);
  if (d < 0) return `Examen passé (${formatDate(ts, { day: 'numeric', month: 'short' })})`;
  if (d === 0) return "Examen aujourd'hui";
  return `Examen dans ${d} j · ${formatDate(ts, { day: 'numeric', month: 'short' })}`;
}

export function typeBadge(type) {
  return badge(CARD_TYPES[type] || type, `type-${type}`);
}

export function statusBadge(card) {
  if (card.status === 'draft') return badge('À rédiger', 'warn');
  if (card.status === 'flagged') return badge('Signalée', 'danger');
  if (card.fsrs.state === 'new') return badge('Nouvelle', 'info');
  return badge('Active', 'success');
}

/** Formulaire de cours (création ou modification). */
export async function editCourseDialog(course = null) {
  const c = course || { name: '', color: COURSE_COLORS[0], examDate: '', chapters: [] };
  const result = await modal({
    title: course ? 'Modifier le cours' : 'Nouveau cours',
    body: html`
      <form class="stack" id="course-form" onsubmit="return false">
        <label class="field"><span>Nom du cours</span>
          <input class="input" name="name" required maxlength="80" value="${c.name}" placeholder="Ex. Microéconomie"></label>
        <label class="field"><span>Date de l'examen <em class="muted">(facultatif, cale le planning)</em></span>
          <input class="input" type="date" name="examDate" value="${c.examDate}"></label>
        ${course ? '' : html`<label class="field"><span>Chapitres <em class="muted">(un par ligne, facultatif)</em></span>
          <textarea class="input" name="chapters" rows="3" placeholder="Chapitre 1 – L'offre et la demande"></textarea></label>`}
        <fieldset class="field"><span>Couleur</span>
          <div class="swatches">${COURSE_COLORS.map((col) => html`
            <label class="swatch" style="--c:${col}"><input type="radio" name="color" value="${col}" ${col === c.color ? 'checked' : ''}><span></span></label>`)}
          </div>
        </fieldset>
      </form>`,
    actions: [
      { label: 'Annuler', value: null },
      {
        label: course ? 'Enregistrer' : 'Créer le cours',
        kind: 'primary',
        validate: (el) => {
          const input = el.querySelector('[name=name]');
          if (!input.value.trim()) { input.focus(); input.classList.add('invalid'); return false; }
          return true;
        },
        value: (el) => {
          const f = new FormData(el.querySelector('#course-form'));
          return {
            name: f.get('name').trim(),
            examDate: f.get('examDate') || '',
            color: f.get('color') || COURSE_COLORS[0],
            chapters: course ? c.chapters : String(f.get('chapters') || '').split('\n'),
          };
        },
      },
    ],
  });
  if (!result) return null;
  const saved = await store.saveCourse({ ...c, ...result });
  toast(course ? 'Cours mis à jour' : 'Cours créé', 'success');
  return saved;
}

/** Affiche le passage des notes d'où vient une carte, surligné dans son contexte. */
export async function showSourceDialog(card) {
  const source = card.sourceId ? await store.getSource(card.sourceId) : null;
  if (!source) {
    await modal({ title: 'Passage des notes', body: html`<blockquote class="quote">${card.quote || 'Aucun passage lié.'}</blockquote>`, actions: [{ label: 'Fermer', value: null }] });
    return;
  }
  const ids = new Set(card.sourceIds);
  const index = source.paragraphs.findIndex((p) => ids.has(p.id));
  const from = Math.max(0, index - 1);
  const context = index >= 0 ? source.paragraphs.slice(from, index + 3) : source.paragraphs.slice(0, 3);
  await modal({
    title: source.title,
    wide: true,
    body: html`
      ${card.quoteMatch !== 'exact' && card.quote ? html`<p class="notice notice-warn">${icon('help', 16)} La citation n'a pas été retrouvée mot pour mot dans tes notes : vérifie l'explication.</p>` : ''}
      <div class="source-excerpt">${context.map((p) => html`
        <p class="${ids.has(p.id) ? 'hl' : ''}"><span class="pid">${p.page ? `p. ${p.page} · ` : ''}§${p.id.slice(1)}</span>${highlight(p.text, ids.has(p.id) ? card.quote : '')}</p>`)}
      </div>`,
    actions: [
      { label: 'Ouvrir toutes les notes', value: 'open' },
      { label: 'Fermer', value: null, kind: 'primary' },
    ],
  }).then((v) => { if (v === 'open') location.hash = `#/source/${source.id}?p=${card.sourceIds[0] || ''}`; });
}

/** Surligne la citation exacte dans un paragraphe (si trouvée). */
export function highlight(text, quote) {
  if (!quote) return html`${text}`;
  const i = text.toLowerCase().indexOf(quote.toLowerCase().trim());
  if (i < 0) return html`${text}`;
  const end = i + quote.trim().length;
  return html`${text.slice(0, i)}<mark>${text.slice(i, end)}</mark>${text.slice(end)}`;
}

export async function passageText(card) {
  const source = card.sourceId ? await store.getSource(card.sourceId) : null;
  const passages = passagesFor(source, card.sourceIds).map((p) => p.text).join('\n\n');
  return passages || card.quote || '';
}

/** Éditeur complet d'une carte (corrige aussi une carte signalée). */
export async function editCardDialog(card, course) {
  const chapters = course?.chapters || [];
  const choiceRow = (ch = { text: '', correct: false, why: '' }, i = 0) => html`
    <div class="choice-row">
      <input type="radio" name="correct" value="${i}" ${ch.correct ? 'checked' : ''} aria-label="Bonne réponse">
      <input class="input" name="ctext" value="${ch.text}" placeholder="Choix">
      <input class="input" name="cwhy" value="${ch.why}" placeholder="Pourquoi juste / faux">
      <button type="button" class="icon-btn" data-remove-choice aria-label="Retirer">${icon('x', 16)}</button>
    </div>`;

  const result = await modal({
    title: 'Modifier la carte',
    wide: true,
    body: html`
      ${card.status === 'flagged' ? html`<p class="notice notice-danger">${icon('flag', 16)} Signalée : ${card.flagReason || 'sans précision'}. Corrige-la puis enregistre pour la remettre en révision.</p>` : ''}
      <form class="stack" id="card-form" onsubmit="return false">
        <div class="grid-2">
          <label class="field"><span>Format</span>
            <select class="input" name="type">${Object.entries({ qa: 'Question-réponse', cloze: 'Texte à trou', mcq: 'Notions proches (QCM)', why: 'Pourquoi ? / Explique' })
              .map(([k, v]) => html`<option value="${k}" ${card.type === k ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="field"><span>Chapitre</span>
            <select class="input" name="chapter"><option value="">Sans chapitre</option>${chapters.map((ch) => html`<option ${card.chapter === ch ? 'selected' : ''}>${ch}</option>`)}</select></label>
        </div>
        <label class="field"><span>Question</span><textarea class="input" name="question" rows="2" required>${card.question}</textarea></label>
        <label class="field"><span>Ta réponse</span><textarea class="input" name="answer" rows="3">${card.answer}</textarea></label>
        <label class="field"><span>Explication</span><textarea class="input" name="explanation" rows="3">${card.explanation}</textarea></label>
        <div class="grid-2">
          <label class="field"><span>Indice</span><input class="input" name="hint" value="${card.hint}"></label>
          <label class="field"><span>Notion</span><input class="input" name="concept" value="${card.concept}"></label>
        </div>
        <label class="field"><span>Passage des notes cité</span><textarea class="input" name="quote" rows="2">${card.quote}</textarea></label>
        <fieldset class="field"><span>Choix proposés si l'étudiant bloque <em class="muted">(cocher la bonne réponse)</em></span>
          <div id="choices">${card.choices.map((ch, i) => choiceRow(ch, i))}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="add-choice">${icon('plus', 16)} Ajouter un choix</button>
        </fieldset>
      </form>`,
    actions: [
      { label: 'Supprimer', value: 'delete', kind: 'danger-ghost' },
      { label: 'Annuler', value: null },
      {
        label: 'Enregistrer',
        kind: 'primary',
        value: (el) => {
          const f = el.querySelector('#card-form');
          const get = (n) => f.elements[n].value.trim();
          const correctIndex = Number(f.querySelector('[name=correct]:checked')?.value ?? -1);
          const choices = [...f.querySelectorAll('.choice-row')].map((row, i) => ({
            text: row.querySelector('[name=ctext]').value.trim(),
            why: row.querySelector('[name=cwhy]').value.trim(),
            correct: i === correctIndex,
          })).filter((c) => c.text);
          return {
            type: get('type'), chapter: get('chapter'), question: get('question'), answer: get('answer'),
            explanation: get('explanation'), hint: get('hint'), concept: get('concept'), quote: get('quote'), choices,
          };
        },
      },
    ],
    onMount: (el) => {
      const list = el.querySelector('#choices');
      el.querySelector('#add-choice').addEventListener('click', () => {
        list.insertAdjacentHTML('beforeend', String(choiceRow(undefined, list.children.length)));
      });
      list.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-choice]')) {
          e.target.closest('.choice-row').remove();
          [...list.querySelectorAll('[name=correct]')].forEach((r, i) => { r.value = i; });
        }
      });
    },
  });

  if (result === 'delete') {
    if (await confirmDialog('Supprimer définitivement cette carte et son historique ?', { danger: true, confirmLabel: 'Supprimer' })) {
      await store.deleteCards([card.id]);
      toast('Carte supprimée');
      return 'deleted';
    }
    return null;
  }
  if (!result) return null;
  if (!result.question) { toast('La question ne peut pas être vide.', 'error'); return null; }
  Object.assign(card, result);
  if (card.status === 'flagged') { card.status = card.answer ? 'active' : 'draft'; card.flagReason = ''; }
  await store.saveCard(card);
  toast('Carte enregistrée', 'success');
  return card;
}

export async function flagCardDialog(card) {
  const reason = await modal({
    title: 'Signaler une carte erronée',
    body: html`<p class="muted">La carte sort des révisions jusqu'à ce que tu la corriges (Cours › Cartes › Signalées).</p>
      <label class="field"><span>Qu'est-ce qui ne va pas ?</span>
      <select class="input" id="flag-kind">
        <option>La réponse attendue est fausse</option>
        <option>L'explication est fausse</option>
        <option>La question est ambiguë</option>
        <option>Ne correspond pas à mes notes</option>
        <option>Autre</option>
      </select></label>
      <label class="field"><span>Précision <em class="muted">(facultatif)</em></span><input class="input" id="flag-note"></label>`,
    actions: [
      { label: 'Annuler', value: null },
      { label: 'Signaler', kind: 'danger', value: (el) => [el.querySelector('#flag-kind').value, el.querySelector('#flag-note').value.trim()].filter(Boolean).join(' – ') },
    ],
  });
  if (!reason) return false;
  card.status = 'flagged';
  card.flagReason = reason;
  await store.saveCard(card);
  toast('Carte signalée et retirée des révisions', 'success');
  return true;
}

export function courseDot(course) {
  return html`<span class="dot" style="background:${esc(course?.color || '#888')}"></span>`;
}

export { statusBadge as cardStatusBadge };
