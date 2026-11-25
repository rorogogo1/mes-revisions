// Consultation et correction d'une note importée, avec le passage cité surligné.

import { html, formatDate, plural } from '../util.js';
import { icon, toast, emptyState, confirmDialog, withBusy, modal } from '../ui.js';
import * as store from '../store.js';
import { pageHeader } from '../components.js';

export default {
  async render(ctx) {
    const source = await store.getSource(ctx.params.id);
    if (!source) return emptyState({ iconName: 'help', title: 'Notes introuvables', action: html`<a class="btn btn-primary" href="#/cours">Mes cours</a>` });
    const [course, cards] = await Promise.all([store.getCourse(source.courseId), store.listCards({ sourceId: source.id })]);
    const urls = (source.images || []).map((b) => URL.createObjectURL(b));
    const cited = new Map();
    cards.forEach((c) => c.sourceIds.forEach((id) => cited.set(id, (cited.get(id) || 0) + 1)));
    ctx.state = { source, course, cards, urls, editing: ctx.query.edit === '1' };
    const target = ctx.query.p;

    return html`
      ${pageHeader(source.title, {
        subtitle: `${course?.name || ''}${source.chapter ? ` · ${source.chapter}` : ''} · ${formatDate(source.createdAt)}`,
        back: `#/cours/${source.courseId}`,
        actions: html`
          <a class="btn btn-ghost btn-sm" href="#/generer?source=${source.id}">${icon('sparkles', 16)} <span class="hide-sm">Générer</span></a>
          <button class="icon-btn" data-edit-text aria-label="Corriger le texte" title="Corriger le texte">${icon('edit')}</button>
          <button class="icon-btn" data-rename aria-label="Renommer ou changer de chapitre" title="Renommer">${icon('text')}</button>
          <button class="icon-btn" data-delete aria-label="Supprimer" title="Supprimer">${icon('trash')}</button>`,
      })}
      ${urls.length ? html`<div class="previews row-scroll">${urls.map((u, i) => html`<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Page ${i + 1}"></a>`)}</div>` : ''}
      <p class="muted small">${plural(source.paragraphs.length, 'paragraphe')} · ${plural(cards.length, 'carte')} liée${cards.length > 1 ? 's' : ''}. Les paragraphes surlignés en marge servent de source à des cartes.</p>
      <article class="card source-text">${source.paragraphs.map((p) => html`
        <p id="${p.id}" class="${p.id === target ? 'hl target' : ''} ${cited.has(p.id) ? 'cited' : ''}">
          <span class="pid">${p.page ? `p. ${p.page} · ` : ''}§${p.id.slice(1)}${cited.has(p.id) ? html` · ${cited.get(p.id)} carte${cited.get(p.id) > 1 ? 's' : ''}` : ''}</span>${p.text}</p>`)}
      </article>`;
  },

  mount(root, ctx) {
    const st = ctx.state;
    if (!st) return;
    const { source } = st;
    root.querySelector('.target')?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    root.querySelector('[data-edit-text]')?.addEventListener('click', async () => {
      const text = await modal({
        title: 'Corriger le texte des notes',
        wide: true,
        body: html`<p class="muted small">Après correction, chaque carte est reliée à nouveau à son passage. Garde une ligne vide entre deux paragraphes.</p>
          <textarea class="input mono" id="src-text" rows="18">${source.text}</textarea>`,
        actions: [{ label: 'Annuler', value: null }, { label: 'Enregistrer', kind: 'primary', value: (el) => el.querySelector('#src-text').value }],
      });
      if (text == null) return;
      if (!text.trim()) return toast('Le texte ne peut pas être vide.', 'error');
      const saved = await store.saveSource({ ...source, text });
      await store.relinkCards(saved);
      toast('Notes mises à jour', 'success');
      ctx.rerender();
    });

    root.querySelector('[data-rename]')?.addEventListener('click', async () => {
      const chapters = st.course?.chapters || [];
      const res = await modal({
        title: 'Titre et chapitre',
        body: html`<label class="field"><span>Titre</span><input class="input" id="src-title" value="${source.title}"></label>
          <label class="field"><span>Chapitre</span><select class="input" id="src-chapter"><option value="">Sans chapitre</option>
          ${chapters.map((c) => html`<option ${c === source.chapter ? 'selected' : ''}>${c}</option>`)}</select></label>
          <p class="muted small">Les cartes issues de ces notes changent aussi de chapitre.</p>`,
        actions: [{ label: 'Annuler', value: null }, { label: 'Enregistrer', kind: 'primary', value: (el) => ({ title: el.querySelector('#src-title').value.trim(), chapter: el.querySelector('#src-chapter').value }) }],
      });
      if (!res) return;
      await store.saveSource({ ...source, title: res.title || source.title, chapter: res.chapter });
      st.cards.forEach((c) => { c.chapter = res.chapter; });
      await store.saveCards(st.cards);
      toast('Enregistré', 'success');
      ctx.rerender();
    });

    root.querySelector('[data-delete]')?.addEventListener('click', async (e) => {
      const ok = await confirmDialog(`Supprimer ces notes${st.cards.length ? ` et les ${st.cards.length} cartes qui en viennent` : ''} ? Cette action est définitive.`, { danger: true, confirmLabel: 'Supprimer' });
      if (!ok) return;
      await withBusy(e.currentTarget, () => store.deleteSource(source.id));
      toast('Notes supprimées');
      location.hash = `#/cours/${source.courseId}`;
    });
  },

  unmount(ctx) {
    ctx.state?.urls?.forEach((u) => URL.revokeObjectURL(u));
  },
};
