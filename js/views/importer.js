// Import des notes : photo, image, PDF ou texte, puis écran de contrôle du texte lu.

import { html, plural } from '../util.js';
import { icon, toast, withBusy } from '../ui.js';
import * as store from '../store.js';
import { pageHeader, editCourseDialog } from '../components.js';
import { imageToText, pdfToText, resizeImage } from '../ocr.js';
import { pageMarker, toParagraphs } from '../text.js';
import { hasApiKey, getSettings } from '../settings.js';

const METHODS = [
  { id: 'camera', icon: 'camera', label: 'Prendre une photo', hint: 'Appareil photo du téléphone', accept: 'image/*', capture: true, multiple: false },
  { id: 'images', icon: 'image', label: 'Images', hint: 'Une ou plusieurs pages', accept: 'image/*', multiple: true },
  { id: 'pdf', icon: 'file', label: 'PDF', hint: 'Cours, polycopié, scan', accept: 'application/pdf,.pdf', multiple: false },
  { id: 'text', icon: 'text', label: 'Texte', hint: 'Coller ou fichier .txt / .md', accept: '.txt,.md,text/plain,text/markdown', multiple: false },
];

let state = null;

function resetState(query) {
  state = { step: 'choose', courseId: query.cours || '', chapter: query.chapitre || '', title: '', kind: '', text: '', images: [], previews: [], info: '' };
}

function chooseStep(courses) {
  const course = courses.find((c) => c.id === state.courseId);
  return html`
    <section class="card stack">
      <h2 class="card-title">1. Où ranger ces notes ?</h2>
      <div class="grid-2">
        <label class="field"><span>Cours</span>
          <div class="row">
            <select class="input grow" data-course>
              <option value="">Choisir un cours…</option>
              ${courses.map((c) => html`<option value="${c.id}" ${c.id === state.courseId ? 'selected' : ''}>${c.name}</option>`)}
            </select>
            <button class="btn btn-ghost" data-new-course title="Nouveau cours">${icon('plus', 18)}</button>
          </div>
        </label>
        <label class="field"><span>Chapitre</span>
          <input class="input" data-chapter list="chapters" value="${state.chapter}" placeholder="Ex. Chapitre 2 – Les coûts">
          <datalist id="chapters">${(course?.chapters || []).map((ch) => html`<option value="${ch}">`)}</datalist>
        </label>
      </div>
      <label class="field"><span>Titre <em class="muted">(facultatif)</em></span>
        <input class="input" data-title value="${state.title}" placeholder="Ex. Cours du 12 novembre"></label>
    </section>
    <section class="card stack">
      <h2 class="card-title">2. Importer</h2>
      <div class="method-grid">${METHODS.map((m) => html`
        <label class="method ${state.courseId ? '' : 'disabled'}">
          <input type="file" hidden data-method="${m.id}" accept="${m.accept}" ${m.multiple ? 'multiple' : ''} ${m.capture ? 'capture="environment"' : ''} ${state.courseId ? '' : 'disabled'}>
          <span class="method-icon">${icon(m.icon, 26)}</span><strong>${m.label}</strong><span class="muted small">${m.hint}</span>
        </label>`)}
      </div>
      <button class="btn btn-ghost" data-paste ${state.courseId ? '' : 'disabled'}>${icon('text')} Coller du texte directement</button>
      ${state.courseId ? '' : html`<p class="muted small">Choisis d'abord un cours.</p>`}
      <p class="muted small">${hasApiKey() && getSettings().ocr !== 'local'
        ? 'Les photos sont lues par Gemini (écriture manuscrite comprise).'
        : 'Les photos sont lues sur l\'appareil (texte imprimé surtout). Ajoute une clé Gemini pour lire l\'écriture manuscrite.'}</p>
    </section>`;
}

function processingStep() {
  return html`<section class="card stack center pad">
    <span class="spinner spinner-lg"></span>
    <h2 data-progress-label>Lecture des notes…</h2>
    <div class="progress"><span data-progress style="width:2%"></span></div>
    <p class="muted small">Garde cette page ouverte pendant la lecture.</p>
  </section>`;
}

function reviewStep() {
  const paragraphs = toParagraphs(state.text);
  return html`
    <section class="card stack">
      <div class="row between wrap">
        <h2 class="card-title">${icon('eye', 18)} Contrôle du texte lu</h2>
        <span class="badge" data-para-count>${plural(paragraphs.length, 'paragraphe')}</span>
      </div>
      <p class="muted">Vérifie et corrige le texte : toutes les questions en découleront. Laisse une ligne vide entre deux paragraphes.${state.info ? ` ${state.info}` : ''}</p>
      <div class="control-grid ${state.previews.length ? '' : 'single'}">
        ${state.previews.length ? html`<div class="previews">${state.previews.map((url, i) => html`
          <a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Page ${i + 1} importée" loading="lazy"></a>`)}</div>` : ''}
        <textarea class="input mono" data-text rows="18" spellcheck="true" placeholder="Colle ou tape ici le texte de tes notes…">${state.text}</textarea>
      </div>
      <div class="row wrap end">
        <button class="btn btn-ghost" data-cancel>Annuler</button>
        <button class="btn btn-ghost" data-save>${icon('check')} Enregistrer</button>
        <button class="btn btn-primary" data-save-generate>${icon('sparkles')} Enregistrer et créer les questions</button>
      </div>
    </section>`;
}

async function readFiles(kind, files, root) {
  const label = root.querySelector('[data-progress-label]');
  const bar = root.querySelector('[data-progress]');
  const setProgress = (p, text) => { bar.style.width = `${Math.max(2, Math.round(p * 100))}%`; if (text) label.textContent = text; };

  if (kind === 'text') {
    state.text = (await files[0].text()).trim();
    state.title ||= files[0].name.replace(/\.[^.]+$/, '');
    return;
  }
  if (kind === 'pdf') {
    const res = await pdfToText(files[0], setProgress);
    state.text = res.text;
    state.previews = res.previews.map((b) => URL.createObjectURL(b));
    state.images = res.previews;
    state.title ||= files[0].name.replace(/\.pdf$/i, '');
    state.info = res.scannedPages ? `${plural(res.scannedPages, 'page scannée a été lue', 'pages scannées ont été lues')} comme une image : vérifie-les bien.` : '';
    return;
  }
  // Photos / images
  const chunks = [];
  const engines = new Set();
  for (let i = 0; i < files.length; i++) {
    const base = i / files.length;
    setProgress(base, `Préparation de l'image ${i + 1} / ${files.length}…`);
    const resized = await resizeImage(files[i], 2000, 0.85);
    const thumb = await resizeImage(files[i], 1400, 0.75);
    state.images.push(thumb);
    state.previews.push(URL.createObjectURL(thumb));
    const res = await imageToText(resized, (p, l) => setProgress(base + p / files.length, `Image ${i + 1} / ${files.length} : ${l}`));
    engines.add(res.engine);
    chunks.push(files.length > 1 ? `${pageMarker(i + 1)}\n${res.text}` : res.text);
  }
  state.text = chunks.join('\n\n');
  state.title ||= files.length > 1 ? `Notes (${files.length} pages)` : 'Photo de notes';
  if (engines.has('tesseract')) state.info = 'Lecture faite sur l\'appareil : relis attentivement, les erreurs sont plus fréquentes.';
}

export default {
  async render(ctx) {
    if (!state || ctx.query.nouveau || (ctx.query.cours && ctx.query.cours !== state.courseId && state.step === 'choose')) resetState(ctx.query);
    if (ctx.query.nouveau) {
      delete ctx.query.nouveau;
      history.replaceState(null, '', '#/importer');
    }
    if (state.step === 'processing' && !state.busy) state.step = state.text ? 'review' : 'choose';
    const courses = await store.listCourses();
    ctx.state = { courses };
    const body = state.step === 'choose' ? chooseStep(courses) : state.step === 'processing' ? processingStep() : reviewStep();
    return html`${pageHeader('Importer des notes', { back: state.courseId ? `#/cours/${state.courseId}` : '#/' })}<div data-step>${body}</div>`;
  },

  mount(root, ctx) {
    const rerenderStep = () => ctx.rerender();

    root.querySelector('[data-course]')?.addEventListener('change', (e) => { state.courseId = e.target.value; rerenderStep(); });
    root.querySelector('[data-chapter]')?.addEventListener('input', (e) => { state.chapter = e.target.value; });
    root.querySelector('[data-title]')?.addEventListener('input', (e) => { state.title = e.target.value; });
    root.querySelector('[data-new-course]')?.addEventListener('click', async () => {
      const c = await editCourseDialog();
      if (c) { state.courseId = c.id; rerenderStep(); }
    });

    root.querySelectorAll('[data-method]').forEach((input) => input.addEventListener('change', async () => {
      const files = [...input.files];
      if (!files.length) return;
      const kind = input.dataset.method === 'pdf' ? 'pdf' : input.dataset.method === 'text' ? 'text' : 'photo';
      state.kind = kind;
      state.step = 'processing';
      state.busy = true;
      await ctx.rerender();
      const container = document.querySelector('#view');
      try {
        await readFiles(kind, files, container);
        if (!state.text.trim()) toast('Aucun texte n\'a été trouvé. Tu peux le saisir à la main.', 'warn', 5000);
      } catch (err) {
        console.error(err);
        toast(err.message || 'La lecture a échoué.', 'error', 6000);
      } finally {
        state.busy = false;
      }
      state.step = 'review';
      if (!location.hash.startsWith('#/importer')) return;
      ctx.rerender();
    }));

    root.querySelector('[data-paste]')?.addEventListener('click', () => {
      state.kind = 'text';
      state.step = 'review';
      state.title ||= 'Notes collées';
      rerenderStep();
    });

    const textarea = root.querySelector('[data-text]');
    textarea?.addEventListener('input', () => {
      state.text = textarea.value;
      root.querySelector('[data-para-count]').textContent = plural(toParagraphs(state.text).length, 'paragraphe');
    });
    root.querySelector('[data-cancel]')?.addEventListener('click', () => {
      const back = state.courseId;
      resetState({ cours: back });
      location.hash = back ? `#/cours/${back}` : '#/';
    });

    const save = async (btn, thenGenerate) => {
      state.text = textarea.value;
      if (toParagraphs(state.text).length === 0) { toast('Le texte est vide.', 'error'); return; }
      await withBusy(btn, async () => {
        const course = await store.getCourse(state.courseId);
        const chapter = state.chapter.trim();
        if (chapter && !course.chapters.includes(chapter)) await store.addChapter(course.id, chapter);
        const source = await store.saveSource({
          courseId: course.id,
          chapter,
          title: state.title.trim() || `Notes du ${new Date().toLocaleDateString('fr-FR')}`,
          kind: state.kind || 'text',
          text: state.text,
          images: state.images,
        });
        state.previews.forEach((u) => URL.revokeObjectURL(u));
        resetState({ cours: course.id });
        toast('Notes enregistrées', 'success');
        location.hash = thenGenerate ? `#/generer?source=${source.id}` : `#/cours/${course.id}`;
      }, 'Enregistrement…');
    };
    root.querySelector('[data-save]')?.addEventListener('click', (e) => save(e.currentTarget, false));
    root.querySelector('[data-save-generate]')?.addEventListener('click', (e) => save(e.currentTarget, true));
  },
};
