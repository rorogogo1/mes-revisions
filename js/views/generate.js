// Génération des questions : réglages (chapitre, difficulté, nombre, langue, formats) puis tri des propositions.

import { html, plural, shuffle, LANGUAGES, CARD_TYPES } from '../util.js';
import { icon, toast, withBusy, emptyState, badge } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, typeBadge } from '../components.js';
import { generateCards } from '../ai.js';
import { generateLocally } from '../local-ai.js';
import { locateQuote } from '../text.js';
import { getSettings, hasApiKey } from '../settings.js';

let proposals = null; // { courseId, items: [{ card, keep }] }

const FORMAT_HELP = {
  qa: 'définitions, dates, calculs',
  cloze: 'phrase des notes avec un mot caché',
  mcq: 'deux notions proches à distinguer',
  why: 'mécanismes, « explique avec tes mots »',
};

function toCard(raw, sourceMap, course) {
  // Les identifiants de paragraphes sont préfixés par le numéro de la note : « 2.p5 ».
  const ids = (raw.sourceIds || []).map((x) => String(x).replace(/[[\]]/g, ''));
  const firstKey = ids[0]?.split('.')[0];
  const source = sourceMap.get(firstKey) || [...sourceMap.values()][0];
  const localIds = ids.filter((x) => x.split('.')[0] === firstKey).map((x) => x.split('.').pop());
  const loc = locateQuote(source.paragraphs, raw.quote, localIds);
  const choices = (raw.distractors || []).length
    ? shuffle([
      { text: raw.shortAnswer || raw.answer, correct: true, why: raw.explanation },
      ...raw.distractors.slice(0, 4).map((d) => ({ text: d.text, correct: false, why: d.why })),
    ])
    : [];
  return store.newCard({
    courseId: course.id,
    sourceId: source.id,
    chapter: source.chapter || '',
    type: raw.type,
    concept: raw.concept || '',
    question: raw.question,
    refAnswer: raw.answer,
    shortAnswer: raw.shortAnswer || '',
    choices,
    explanation: raw.explanation || '',
    hint: raw.hint || '',
    quote: raw.quote || '',
    quoteMatch: loc.match,
    sourceIds: loc.paragraphId ? [loc.paragraphId] : localIds,
    origin: raw.id ? 'local' : 'ai',
  });
}

function formView(course, sources, selected) {
  const s = getSettings();
  const chapters = [...new Set(sources.map((x) => x.chapter).filter(Boolean))];
  return html`
    <form class="stack" data-form onsubmit="return false">
      <section class="card stack">
        <h2 class="card-title">${icon('file', 18)} Notes à utiliser</h2>
        ${chapters.length > 1 ? html`<label class="field"><span>Chapitre</span>
          <select class="input" data-chapter><option value="">Tous les chapitres</option>${chapters.map((c) => html`<option>${c}</option>`)}</select></label>` : ''}
        <div class="check-list">${sources.map((src) => html`
          <label class="check"><input type="checkbox" name="source" value="${src.id}" data-chapter-of="${src.chapter}" ${selected.has(src.id) ? 'checked' : ''}>
            <span><strong>${src.title}</strong> <span class="muted small">${src.chapter || 'Sans chapitre'} · ${plural(src.paragraphs.length, 'paragraphe')}</span></span></label>`)}
        </div>
      </section>
      <section class="card stack">
        <h2 class="card-title">${icon('settings', 18)} Réglages de la série</h2>
        <div class="grid-2">
          <fieldset class="field"><span>Difficulté</span>
            <div class="segmented">${['facile', 'moyen', 'difficile'].map((d) => html`
              <label><input type="radio" name="difficulty" value="${d}" ${d === 'moyen' ? 'checked' : ''}><span>${d[0].toUpperCase() + d.slice(1)}</span></label>`)}</div>
          </fieldset>
          <label class="field"><span>Nombre de questions : <strong data-count-label>10</strong></span>
            <input type="range" name="count" min="3" max="30" value="10" data-count></label>
          <label class="field"><span>Langue des questions</span>
            <select class="input" name="language">${Object.entries(LANGUAGES).map(([k, v]) => html`<option value="${k}" ${k === s.language ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="field"><span>Consigne <em class="muted">(facultatif)</em></span>
            <input class="input" name="focus" placeholder="Ex. insiste sur les formules"></label>
        </div>
        <fieldset class="field"><span>Formats autorisés <em class="muted">(l'appli choisit selon le contenu)</em></span>
          <div class="format-grid">${Object.entries(CARD_TYPES).map(([k, v]) => html`
            <label class="check format"><input type="checkbox" name="formats" value="${k}" checked><span><strong>${v}</strong><span class="muted small">${FORMAT_HELP[k]}</span></span></label>`)}
          </div>
        </fieldset>
      </section>
      ${hasApiKey() ? html`
        <button class="btn btn-primary btn-lg" data-generate>${icon('sparkles')} Générer les questions</button>`
      : html`
        <div class="notice notice-info">${icon('key', 18)}<span>Sans clé Gemini, seules des questions simples (définitions « X : … », « X est … », dates) peuvent être créées.
          <a href="#/reglages">Ajouter une clé</a></span></div>
        <button class="btn btn-primary btn-lg" data-generate-local>${icon('sparkles')} Créer des questions simples</button>`}
    </form>`;
}

function resultsView() {
  const kept = proposals.items.filter((x) => x.keep).length;
  return html`
    <section class="card stack">
      <div class="row between wrap">
        <h2 class="card-title">${icon('layers', 18)} ${plural(proposals.items.length, 'question proposée', 'questions proposées')}</h2>
        <button class="btn btn-ghost btn-sm" data-restart>${icon('arrowLeft', 16)} Changer les réglages</button>
      </div>
      <p class="muted">Décoche celles qui ne t'intéressent pas. Tu rédigeras ensuite toi-même la réponse de chaque carte : la réponse n'est donc pas affichée ici.</p>
      <ul class="list">${proposals.items.map((x, i) => html`
        <li><label class="list-item proposal ${x.keep ? '' : 'off'}">
          <input type="checkbox" data-keep="${i}" ${x.keep ? 'checked' : ''}>
          <div class="grow">
            <div class="row-badges">${typeBadge(x.card.type)}
              ${x.card.quoteMatch === 'exact' ? badge('Source vérifiée', 'success') : x.card.quoteMatch === 'approx' ? badge('Source approchée', 'warn') : badge('Source à vérifier', 'danger')}
              ${x.card.concept ? html`<span class="muted small">${x.card.concept}</span>` : ''}</div>
            <strong>${x.card.question}</strong>
          </div>
        </label></li>`)}
      </ul>
      <div class="row end wrap">
        <button class="btn btn-ghost" data-discard>Tout abandonner</button>
        <button class="btn btn-primary" data-keep-all ${kept ? '' : 'disabled'}>${icon('pen')} Garder ${kept} et rédiger mes réponses</button>
      </div>
    </section>`;
}

export default {
  async render(ctx) {
    let course; let sources; let selected;
    if (ctx.query.source) {
      const src = await store.getSource(ctx.query.source);
      if (!src) return emptyState({ title: 'Notes introuvables', action: html`<a class="btn btn-primary" href="#/cours">Mes cours</a>` });
      course = await store.getCourse(src.courseId);
      sources = await store.listSources(course.id);
      selected = new Set([src.id]);
    } else {
      course = await store.getCourse(ctx.query.cours);
      if (!course) return emptyState({ title: 'Cours introuvable', action: html`<a class="btn btn-primary" href="#/cours">Mes cours</a>` });
      sources = await store.listSources(course.id);
      selected = new Set(sources.map((s) => s.id));
    }
    if (!sources.length) {
      return html`${pageHeader('Générer des questions', { back: `#/cours/${course.id}` })}${emptyState({
        iconName: 'camera', title: 'Importe d\'abord des notes', action: html`<a class="btn btn-primary" href="#/importer?cours=${course.id}">Importer</a>`,
      })}`;
    }
    if (proposals && proposals.courseId !== course.id) proposals = null;
    ctx.state = { course, sources };
    return html`${pageHeader('Générer des questions', { subtitle: course.name, back: `#/cours/${course.id}` })}
      ${proposals ? resultsView() : formView(course, sources, selected)}`;
  },

  mount(root, ctx) {
    const { course, sources } = ctx.state || {};
    if (!course) return;
    const form = root.querySelector('[data-form]');

    if (form) {
      const count = form.querySelector('[data-count]');
      count.addEventListener('input', () => { form.querySelector('[data-count-label]').textContent = count.value; });
      form.querySelector('[data-chapter]')?.addEventListener('change', (e) => {
        form.querySelectorAll('[name=source]').forEach((cb) => { cb.checked = !e.target.value || cb.dataset.chapterOf === e.target.value; });
      });

      const readForm = () => {
        const f = new FormData(form);
        const chosen = sources.filter((s) => f.getAll('source').includes(s.id));
        return {
          chosen,
          count: Number(f.get('count')),
          difficulty: f.get('difficulty'),
          language: f.get('language'),
          focus: String(f.get('focus') || '').trim(),
          formats: f.getAll('formats'),
        };
      };

      form.querySelector('[data-generate]')?.addEventListener('click', async (e) => {
        const opts = readForm();
        if (!opts.chosen.length) return toast('Coche au moins une note.', 'error');
        if (!opts.formats.length) return toast('Choisis au moins un format.', 'error');
        await withBusy(e.currentTarget, async () => {
          try {
            const sourceMap = new Map();
            const paragraphs = [];
            opts.chosen.forEach((s, i) => {
              sourceMap.set(String(i + 1), s);
              s.paragraphs.forEach((p) => paragraphs.push({ ...p, id: `${i + 1}.${p.id}` }));
            });
            const existing = (await store.listCards({ courseId: course.id })).map((c) => c.question);
            const raws = await generateCards({ ...opts, paragraphs, existing });
            if (!raws.length) { toast('Aucune question n\'a pu être créée à partir de ces notes.', 'warn'); return; }
            proposals = { courseId: course.id, items: raws.map((r) => ({ card: toCard(r, sourceMap, course), keep: true })) };
            ctx.rerender();
          } catch (err) {
            console.error(err);
            toast(err.message, 'error', 6000);
          }
        }, 'Génération en cours…');
      });

      form.querySelector('[data-generate-local]')?.addEventListener('click', () => {
        const opts = readForm();
        if (!opts.chosen.length) return toast('Coche au moins une note.', 'error');
        const items = [];
        opts.chosen.forEach((s, i) => {
          const sourceMap = new Map([[String(i + 1), s]]);
          generateLocally(s.paragraphs, opts.count).forEach((r) => {
            r.sourceIds = r.sourceIds.map((id) => `${i + 1}.${id}`);
            items.push({ card: toCard(r, sourceMap, course), keep: true });
          });
        });
        if (!items.length) return toast('Aucune définition ou date repérée. Ajoute une clé Gemini pour des questions plus riches.', 'warn', 6000);
        proposals = { courseId: course.id, items: items.slice(0, opts.count) };
        ctx.rerender();
      });
      return;
    }

    root.querySelectorAll('[data-keep]').forEach((cb) => cb.addEventListener('change', () => {
      proposals.items[Number(cb.dataset.keep)].keep = cb.checked;
      cb.closest('.proposal').classList.toggle('off', !cb.checked);
      const kept = proposals.items.filter((x) => x.keep).length;
      const btn = root.querySelector('[data-keep-all]');
      btn.disabled = !kept;
      btn.lastChild.textContent = ` Garder ${kept} et rédiger mes réponses`;
    }));
    root.querySelector('[data-restart]')?.addEventListener('click', () => { proposals = null; ctx.rerender(); });
    root.querySelector('[data-discard]')?.addEventListener('click', () => { proposals = null; location.hash = `#/cours/${course.id}`; });
    root.querySelector('[data-keep-all]')?.addEventListener('click', async () => {
      const now = Date.now();
      const cards = proposals.items.filter((x) => x.keep).map((x, i) => Object.assign(x.card, { createdAt: now + i }));
      await store.saveCards(cards);
      proposals = null;
      toast(`${plural(cards.length, 'carte créée', 'cartes créées')} : à toi d'écrire les réponses`, 'success');
      location.hash = `#/atelier?cours=${course.id}`;
    });
  },
};
