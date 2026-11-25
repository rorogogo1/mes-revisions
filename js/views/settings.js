// Réglages : clé Gemini, planning, lecture des notes, apparence, données, installation.

import { html, plural, LANGUAGES } from '../util.js';
import { icon, toast, withBusy, confirmDialog, modal } from '../ui.js';
import * as store from '../store.js';
import { pageHeader } from '../components.js';
import { getSettings, setSettings } from '../settings.js';
import { listModels } from '../gemini.js';
import { exportCSV, exportAnki, exportBackup, importBackup, wipeAll } from '../export.js';
import { installState, promptInstall } from '../pwa.js';

async function storageInfo() {
  if (!navigator.storage?.estimate) return '';
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.();
  const mb = (n) => `${(n / 1_048_576).toFixed(1)} Mo`;
  return `${mb(usage)} utilisés sur ${mb(quota)} disponibles${persisted ? ' · stockage protégé' : ''}`;
}

export default {
  async render(ctx) {
    const s = getSettings();
    const courses = await store.listCourses();
    const info = await storageInfo();
    const install = installState();
    ctx.state = { courses };
    return html`
      ${pageHeader('Réglages')}

      <section class="card stack">
        <h2 class="card-title">${icon('key', 18)} Intelligence artificielle (Gemini)</h2>
        <p class="muted">Gemini lit tes photos de notes, crée les questions et compare tes réponses à tes notes.
          Crée une clé gratuite sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>, puis colle-la ici.
          Elle reste enregistrée sur cet appareil et n'est envoyée qu'à Google.</p>
        <label class="field"><span>Clé API</span>
          <div class="row">
            <input class="input grow mono" type="password" data-key value="${s.apiKey}" placeholder="AIza…" autocomplete="off" spellcheck="false">
            <button class="icon-btn" data-toggle-key aria-label="Afficher la clé">${icon('eye')}</button>
          </div>
        </label>
        <label class="field"><span>Modèle</span>
          <select class="input" data-model><option value="${s.model}">${s.model}</option></select>
        </label>
        <div class="row wrap">
          <button class="btn btn-primary" data-test-key>${icon('check')} Enregistrer et tester</button>
          ${s.apiKey ? html`<button class="btn btn-ghost" data-remove-key>Retirer la clé</button>` : ''}
        </div>
        <p class="small muted" data-key-status></p>
      </section>

      <section class="card stack">
        <h2 class="card-title">${icon('review', 18)} Révisions</h2>
        <label class="field"><span>Taux de rappel visé : <strong data-ret-label>${Math.round(s.retention * 100)} %</strong></span>
          <input type="range" min="0.8" max="0.97" step="0.01" value="${s.retention}" data-retention>
          <span class="muted small">Plus il est élevé, plus les révisions sont rapprochées. 90 % est un bon équilibre. Avec une date d'examen, les intervalles sont aussi plafonnés selon le temps restant.</span></label>
        <div class="grid-2">
          <label class="field"><span>Nouvelles cartes par jour</span>
            <input class="input" type="number" min="1" max="200" value="${s.newPerDay}" data-new-per-day></label>
          <label class="field"><span>Langue par défaut</span>
            <select class="input" data-language>${Object.entries(LANGUAGES).map(([k, v]) => html`<option value="${k}" ${k === s.language ? 'selected' : ''}>${v}</option>`)}</select></label>
        </div>
        <label class="field"><span>Lecture des photos</span>
          <select class="input" data-ocr>
            <option value="auto" ${s.ocr === 'auto' ? 'selected' : ''}>Gemini si disponible, sinon sur l'appareil</option>
            <option value="local" ${s.ocr === 'local' ? 'selected' : ''}>Toujours sur l'appareil (hors ligne, texte imprimé)</option>
          </select></label>
      </section>

      <section class="card stack">
        <h2 class="card-title">${icon('eye', 18)} Apparence</h2>
        <div class="segmented">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, v]) => html`
          <label><input type="radio" name="theme" value="${k}" ${s.theme === k ? 'checked' : ''} data-theme><span>${v}</span></label>`)}</div>
      </section>

      <section class="card stack">
        <h2 class="card-title">${icon('download', 18)} Exporter et sauvegarder</h2>
        <label class="field"><span>Cours à exporter</span>
          <select class="input" data-export-course><option value="">Tous les cours</option>${courses.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
        <div class="row wrap">
          <button class="btn btn-ghost" data-export-anki>${icon('layers')} Anki (.txt)</button>
          <button class="btn btn-ghost" data-export-csv>${icon('file')} CSV (tableur)</button>
        </div>
        <p class="muted small">Dans Anki : Fichier › Importer, puis choisis le fichier. Les paquets sont créés par cours et par chapitre.</p>
        <hr>
        <p class="muted">La sauvegarde complète contient cours, notes, photos, cartes et historique. Elle sert à passer de l'ordinateur au téléphone, ou à garder une copie.</p>
        <div class="row wrap">
          <button class="btn btn-primary" data-backup>${icon('download')} Télécharger une sauvegarde</button>
          <label class="btn btn-ghost">${icon('upload')} Restaurer<input type="file" accept="application/json,.json" hidden data-restore></label>
        </div>
        <p class="muted small">${info}</p>
      </section>

      <section class="card stack">
        <h2 class="card-title">${icon('home', 18)} Application</h2>
        ${install === 'available' ? html`<button class="btn btn-primary" data-install>${icon('download')} Installer « Mes révisions » sur cet appareil</button>`
          : install === 'installed' ? html`<p class="muted">${icon('check', 16)} Application installée.</p>`
          : html`<p class="muted small">Pour l'installer : menu du navigateur › « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p>`}
        <p class="muted small">${navigator.onLine ? 'En ligne' : 'Hors ligne'} · la révision, la rédaction et la lecture sur l'appareil fonctionnent sans connexion ; la génération par Gemini demande internet.</p>
        <hr>
        <button class="btn btn-danger-ghost" data-wipe>${icon('trash')} Effacer toutes les données</button>
      </section>`;
  },

  mount(root, ctx) {
    const s = getSettings();
    const keyInput = root.querySelector('[data-key]');
    const modelSelect = root.querySelector('[data-model]');
    const status = root.querySelector('[data-key-status]');

    const fillModels = (models) => {
      const current = getSettings().model;
      const ids = models.map((m) => m.id);
      const preferred = ids.includes(current) ? current : ids.find((id) => /flash/.test(id) && !/lite|preview|exp/.test(id)) || ids[0];
      modelSelect.innerHTML = String(html`${models.map((m) => html`<option value="${m.id}" ${m.id === preferred ? 'selected' : ''}>${m.label} (${m.id})</option>`)}`);
      if (preferred && preferred !== current) setSettings({ model: preferred });
    };

    if (s.apiKey && navigator.onLine) {
      listModels().then(fillModels).catch(() => {});
    }

    root.querySelector('[data-toggle-key]').addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });
    modelSelect.addEventListener('change', () => { setSettings({ model: modelSelect.value }); toast('Modèle enregistré', 'success'); });

    root.querySelector('[data-test-key]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      const key = keyInput.value.trim();
      if (!key) { keyInput.focus(); return toast('Colle d\'abord ta clé.', 'warn'); }
      try {
        const models = await listModels(key);
        setSettings({ apiKey: key });
        fillModels(models);
        status.textContent = `Clé valide · ${plural(models.length, 'modèle disponible', 'modèles disponibles')}.`;
        toast('Clé Gemini enregistrée', 'success');
      } catch (err) {
        status.textContent = err.message;
        toast(err.message, 'error', 6000);
      }
    }, 'Test…'));
    root.querySelector('[data-remove-key]')?.addEventListener('click', async () => {
      if (!await confirmDialog('Retirer la clé Gemini de cet appareil ?')) return;
      setSettings({ apiKey: '' });
      ctx.rerender();
    });

    const retention = root.querySelector('[data-retention]');
    retention.addEventListener('input', () => { root.querySelector('[data-ret-label]').textContent = `${Math.round(retention.value * 100)} %`; });
    retention.addEventListener('change', () => { setSettings({ retention: Number(retention.value) }); toast('Enregistré', 'success', 1500); });
    root.querySelector('[data-new-per-day]').addEventListener('change', (e) => {
      const n = Math.min(200, Math.max(1, Number(e.target.value) || 20));
      e.target.value = n;
      setSettings({ newPerDay: n });
      toast('Enregistré', 'success', 1500);
    });
    root.querySelector('[data-language]').addEventListener('change', (e) => { setSettings({ language: e.target.value }); toast('Enregistré', 'success', 1500); });
    root.querySelector('[data-ocr]').addEventListener('change', (e) => { setSettings({ ocr: e.target.value }); toast('Enregistré', 'success', 1500); });
    root.querySelectorAll('[data-theme]').forEach((r) => r.addEventListener('change', () => setSettings({ theme: r.value })));

    const exportCourse = () => root.querySelector('[data-export-course]').value || undefined;
    root.querySelector('[data-export-anki]').addEventListener('click', async () => {
      const n = await exportAnki(exportCourse());
      toast(n ? `${plural(n, 'carte exportée', 'cartes exportées')}` : 'Aucune carte à exporter.', n ? 'success' : 'warn');
    });
    root.querySelector('[data-export-csv]').addEventListener('click', async () => {
      const n = await exportCSV(exportCourse());
      toast(n ? `${plural(n, 'carte exportée', 'cartes exportées')}` : 'Aucune carte à exporter.', n ? 'success' : 'warn');
    });
    root.querySelector('[data-backup]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      await exportBackup();
      navigator.storage?.persist?.();
      toast('Sauvegarde téléchargée', 'success');
    }, 'Préparation…'));
    root.querySelector('[data-restore]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const mode = await modal({
        title: 'Restaurer une sauvegarde',
        body: html`<p>Fusionner ajoute les éléments de la sauvegarde à tes données actuelles (les éléments identiques sont mis à jour).</p>
          <p>Remplacer efface d'abord toutes les données de cet appareil.</p>`,
        actions: [{ label: 'Annuler', value: null }, { label: 'Remplacer', value: 'replace', kind: 'danger' }, { label: 'Fusionner', value: 'merge', kind: 'primary' }],
      });
      if (!mode) return;
      try {
        const counts = await importBackup(file, mode);
        toast(`Restauré : ${plural(counts.courses, 'cours', 'cours')}, ${plural(counts.cards, 'carte')}`, 'success');
        ctx.rerender();
      } catch (err) {
        toast(err.message, 'error', 6000);
      }
    });

    root.querySelector('[data-install]')?.addEventListener('click', async () => {
      if (await promptInstall()) ctx.rerender();
    });
    root.querySelector('[data-wipe]').addEventListener('click', async () => {
      const ok = await confirmDialog('Effacer définitivement tous les cours, notes, cartes et l\'historique de cet appareil ? Télécharge une sauvegarde avant si tu veux les garder.', { danger: true, confirmLabel: 'Tout effacer', title: 'Effacer toutes les données' });
      if (!ok) return;
      await wipeAll();
      toast('Données effacées');
      location.hash = '#/';
    });
  },
};
