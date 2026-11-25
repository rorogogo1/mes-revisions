// Liste des cours.

import { html, plural } from '../util.js';
import { icon, emptyState } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, examLabel, editCourseDialog } from '../components.js';
import { readiness } from '../queue.js';

export default {
  async render() {
    const [courses, cards, sources] = await Promise.all([store.listCourses(), store.listCards(), store.listSources()]);
    const add = html`<button class="btn btn-primary" data-new-course>${icon('plus')} Nouveau cours</button>`;
    if (!courses.length) {
      return html`${pageHeader('Mes cours')}${emptyState({
        iconName: 'book', title: 'Aucun cours pour l\'instant', text: 'Un cours regroupe tes notes, tes cartes et la date de l\'examen.', action: add,
      })}`;
    }
    return html`
      ${pageHeader('Mes cours', { actions: add })}
      <div class="course-grid">${courses.map((c) => {
        const cc = cards.filter((x) => x.courseId === c.id);
        const r = readiness(cc);
        return html`<a class="course-card card" href="#/cours/${c.id}" style="--c:${c.color}">
          <div class="course-band"></div>
          <h3>${c.name}</h3>
          <p class="muted">${examLabel(c) || 'Pas de date d\'examen'}</p>
          <div class="course-meta">
            <span>${icon('file', 16)} ${plural(sources.filter((s) => s.courseId === c.id).length, 'note')}</span>
            <span>${icon('layers', 16)} ${plural(cc.filter((x) => x.status !== 'draft').length, 'carte')}</span>
            ${cc.some((x) => x.status === 'draft') ? html`<span class="warn-text">${icon('pen', 16)} ${cc.filter((x) => x.status === 'draft').length} à rédiger</span>` : ''}
          </div>
          <div class="meter"><span style="width:${Math.round((r ?? 0) * 100)}%"></span></div>
        </a>`;
      })}</div>`;
  },

  mount(root, ctx) {
    const create = async () => {
      const c = await editCourseDialog();
      if (c) location.hash = `#/cours/${c.id}`;
    };
    root.querySelector('[data-new-course]')?.addEventListener('click', create);
    if (ctx.query.nouveau) { history.replaceState(null, '', '#/cours'); create(); }
  },
};
