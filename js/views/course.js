// Détail d'un cours : notes importées, cartes, chapitres.

import { html, formatDate, relativeDays, plural, normalize, debounce } from '../util.js';
import { icon, emptyState, confirmDialog, promptDialog, toast, modal } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, examLabel, editCourseDialog, editCardDialog, typeBadge, cardStatusBadge } from '../components.js';
import { countDue, readiness } from '../queue.js';
import { exportCSV, exportAnki } from '../export.js';

const TABS = { notes: 'Notes', cartes: 'Cartes', chapitres: 'Chapitres' };
const FILTERS = { all: 'Toutes', draft: 'À rédiger', active: 'Actives', flagged: 'Signalées' };

function notesTab(course, sources, cards) {
  if (!sources.length) {
    return emptyState({
      iconName: 'camera', title: 'Aucune note importée',
      text: 'Prends en photo tes notes ou importe un PDF : l\'appli en tire des questions de révision.',
      action: html`<a class="btn btn-primary" href="#/importer?cours=${course.id}">${icon('upload')} Importer des notes</a>`,
    });
  }
  const groups = new Map();
  for (const s of sources) {
    const k = s.chapter || 'Sans chapitre';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return html`${[...groups].map(([chapter, list]) => html`
    <h3 class="group-title">${chapter}</h3>
    <ul class="list card">${list.map((s) => {
      const n = cards.filter((c) => c.sourceId === s.id).length;
      return html`<li class="list-item">
        <span class="list-icon">${icon(s.kind === 'pdf' ? 'file' : s.kind === 'text' ? 'text' : 'image')}</span>
        <a class="grow" href="#/source/${s.id}"><strong>${s.title}</strong>
          <span class="muted">${formatDate(s.createdAt, { day: 'numeric', month: 'short' })} · ${plural(s.paragraphs.length, 'paragraphe')} · ${plural(n, 'carte')}</span></a>
        <a class="btn btn-ghost btn-sm" href="#/generer?source=${s.id}">${icon('sparkles', 16)} <span class="hide-sm">Générer</span></a>
        <button class="icon-btn" data-delete-source="${s.id}" aria-label="Supprimer ${s.title}">${icon('trash', 18)}</button>
      </li>`;
    })}</ul>`)}`;
}

function cardsList(cards, filter, search) {
  const q = normalize(search);
  const list = cards
    .filter((c) => filter === 'all' || c.status === filter)
    .filter((c) => !q || normalize(`${c.question} ${c.answer} ${c.concept}`).includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return html`<p class="muted center pad">Aucune carte ${filter !== 'all' ? `« ${FILTERS[filter].toLowerCase()} »` : ''}.</p>`;
  return html`<ul class="list card">${list.map((c) => html`
    <li><button class="list-item card-row" data-card="${c.id}">
      <div class="grow">
        <div class="row-badges">${typeBadge(c.type)} ${cardStatusBadge(c)} ${c.chapter ? html`<span class="muted small">${c.chapter}</span>` : ''}</div>
        <strong class="clamp-2">${c.question}</strong>
        ${c.status === 'flagged' ? html`<span class="danger-text small">${c.flagReason}</span>`
          : c.status === 'active' && c.fsrs.state !== 'new' ? html`<span class="muted small">Prochaine révision ${relativeDays(c.fsrs.due)}</span>` : ''}
      </div>
      ${icon('edit', 18)}
    </button></li>`)}</ul>`;
}

function cardsTab(course, cards, filter, search) {
  return html`
    <div class="toolbar">
      <div class="segmented" role="tablist">${Object.entries(FILTERS).map(([k, v]) => html`
        <button class="${filter === k ? 'active' : ''}" data-filter="${k}">${v} <span class="count">${k === 'all' ? cards.length : cards.filter((c) => c.status === k).length}</span></button>`)}
      </div>
      <input class="input search" type="search" placeholder="Rechercher une carte…" value="${search}" data-search>
    </div>
    <div data-cards-list>${cardsList(cards, filter, search)}</div>`;
}

function chaptersTab(course, sources, cards) {
  return html`
    <div class="toolbar"><button class="btn btn-primary btn-sm" data-add-chapter>${icon('plus', 16)} Ajouter un chapitre</button></div>
    ${course.chapters.length ? html`<ul class="list card">${course.chapters.map((ch) => html`
      <li class="list-item">
        <div class="grow"><strong>${ch}</strong>
          <span class="muted">${plural(sources.filter((s) => s.chapter === ch).length, 'note')} · ${plural(cards.filter((c) => c.chapter === ch).length, 'carte')}</span></div>
        <a class="btn btn-ghost btn-sm" href="#/reviser?cours=${course.id}&chapitre=${encodeURIComponent(ch)}">${icon('review', 16)} <span class="hide-sm">Réviser</span></a>
        <button class="icon-btn" data-rename-chapter="${ch}" aria-label="Renommer">${icon('edit', 18)}</button>
        <button class="icon-btn" data-remove-chapter="${ch}" aria-label="Retirer">${icon('trash', 18)}</button>
      </li>`)}</ul>` : html`<p class="muted">Aucun chapitre. Les chapitres servent à cibler la génération et les séances.</p>`}`;
}

export default {
  async render(ctx) {
    const course = await store.getCourse(ctx.params.id);
    if (!course) return emptyState({ iconName: 'help', title: 'Cours introuvable', action: html`<a class="btn btn-primary" href="#/cours">Retour aux cours</a>` });
    const [sources, cards] = await Promise.all([store.listSources(course.id), store.listCards({ courseId: course.id })]);
    const tab = TABS[ctx.query.onglet] ? ctx.query.onglet : 'notes';
    const filter = FILTERS[ctx.query.filtre] ? ctx.query.filtre : 'all';
    ctx.state = { course, sources, cards, tab, filter, search: '' };

    const counts = countDue(cards, [], Infinity);
    const drafts = cards.filter((c) => c.status === 'draft').length;
    const r = readiness(cards);

    return html`
      ${pageHeader(course.name, {
        subtitle: examLabel(course) || 'Pas de date d\'examen',
        back: '#/cours',
        actions: html`
          <button class="icon-btn" data-export aria-label="Exporter les cartes" title="Exporter">${icon('download')}</button>
          <button class="icon-btn" data-edit-course aria-label="Modifier le cours" title="Modifier">${icon('edit')}</button>
          <button class="icon-btn" data-delete-course aria-label="Supprimer le cours" title="Supprimer">${icon('trash')}</button>`,
      })}
      <section class="course-summary card" style="--c:${course.color}">
        <div class="summary-stats">
          <div><strong>${cards.filter((c) => c.status === 'active').length}</strong><span class="muted">cartes actives</span></div>
          <div><strong>${counts.due}</strong><span class="muted">à revoir</span></div>
          <div><strong>${r == null ? '–' : `${Math.round(r * 100)} %`}</strong><span class="muted">mémorisé</span></div>
        </div>
        <div class="row wrap">
          <a class="btn btn-primary" href="#/reviser?cours=${course.id}">${icon('review')} Réviser</a>
          <a class="btn btn-ghost" href="#/importer?cours=${course.id}">${icon('upload')} Importer</a>
          ${sources.length ? html`<a class="btn btn-ghost" href="#/generer?cours=${course.id}">${icon('sparkles')} Générer</a>` : ''}
          ${drafts ? html`<a class="btn btn-warn" href="#/atelier?cours=${course.id}">${icon('pen')} Rédiger (${drafts})</a>` : ''}
        </div>
      </section>
      <nav class="tabs" role="tablist">${Object.entries(TABS).map(([k, v]) => html`
        <a role="tab" class="${tab === k ? 'active' : ''}" href="#/cours/${course.id}?onglet=${k}" aria-selected="${tab === k}">${v}</a>`)}
      </nav>
      <div data-tab>
        ${tab === 'notes' ? notesTab(course, sources, cards) : ''}
        ${tab === 'cartes' ? cardsTab(course, cards, filter, '') : ''}
        ${tab === 'chapitres' ? chaptersTab(course, sources, cards) : ''}
      </div>`;
  },

  mount(root, ctx) {
    const st = ctx.state;
    if (!st) return;
    const { course } = st;

    root.querySelector('[data-edit-course]')?.addEventListener('click', async () => {
      if (await editCourseDialog(course)) ctx.rerender();
    });
    root.querySelector('[data-delete-course]')?.addEventListener('click', async () => {
      const ok = await confirmDialog(`Supprimer « ${course.name} », ses notes, ses ${st.cards.length} cartes et tout leur historique ? Cette action est définitive.`, { danger: true, confirmLabel: 'Supprimer le cours' });
      if (!ok) return;
      await store.deleteCourse(course.id);
      toast('Cours supprimé');
      location.hash = '#/cours';
    });
    root.querySelector('[data-export]')?.addEventListener('click', async () => {
      const format = await modal({
        title: 'Exporter les cartes du cours',
        body: html`<p class="muted">Les cartes rédigées et signalées sont exportées ; les brouillons non.</p>`,
        actions: [{ label: 'CSV (tableur)', value: 'csv' }, { label: 'Anki (.txt)', value: 'anki', kind: 'primary' }],
      });
      if (!format) return;
      const n = format === 'csv' ? await exportCSV(course.id) : await exportAnki(course.id);
      toast(`${plural(n, 'carte exportée', 'cartes exportées')}`, 'success');
    });

    // Notes
    root.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delete-source]');
      if (del) {
        const source = st.sources.find((s) => s.id === del.dataset.deleteSource);
        const n = st.cards.filter((c) => c.sourceId === source.id).length;
        if (await confirmDialog(`Supprimer « ${source.title} »${n ? ` et les ${n} cartes qui en viennent` : ''} ?`, { danger: true, confirmLabel: 'Supprimer' })) {
          await store.deleteSource(source.id);
          toast('Note supprimée');
          ctx.rerender();
        }
      }
      const cardBtn = e.target.closest('[data-card]');
      if (cardBtn) {
        const card = st.cards.find((c) => c.id === cardBtn.dataset.card);
        const res = await editCardDialog(card, course);
        if (res) ctx.rerender();
      }
      const filterBtn = e.target.closest('[data-filter]');
      if (filterBtn) {
        st.filter = filterBtn.dataset.filter;
        history.replaceState(null, '', `#/cours/${course.id}?onglet=cartes&filtre=${st.filter}`);
        root.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b === filterBtn));
        root.querySelector('[data-cards-list]').innerHTML = String(cardsList(st.cards, st.filter, st.search));
      }
      if (e.target.closest('[data-add-chapter]')) {
        const name = await promptDialog('Nom du chapitre', { title: 'Nouveau chapitre' });
        if (name) { await store.addChapter(course.id, name); ctx.rerender(); }
      }
      const rename = e.target.closest('[data-rename-chapter]');
      if (rename) {
        const old = rename.dataset.renameChapter;
        const name = await promptDialog('Nouveau nom', { title: 'Renommer le chapitre', value: old });
        if (name && name !== old) { await store.renameChapter(course.id, old, name); toast('Chapitre renommé', 'success'); ctx.rerender(); }
      }
      const remove = e.target.closest('[data-remove-chapter]');
      if (remove) {
        const ok = await confirmDialog(`Retirer le chapitre « ${remove.dataset.removeChapter} » de la liste ? Les notes et cartes sont conservées.`);
        if (ok) { await store.removeChapter(course.id, remove.dataset.removeChapter); ctx.rerender(); }
      }
    });

    const search = root.querySelector('[data-search]');
    search?.addEventListener('input', debounce(() => {
      st.search = search.value;
      root.querySelector('[data-cards-list]').innerHTML = String(cardsList(st.cards, st.filter, st.search));
    }, 200));
  },
};
