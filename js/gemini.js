// Client minimal de l'API Gemini (Google AI Studio). La clé reste sur l'appareil.

import { getSettings, setSettings } from './settings.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class AIError extends Error {
  constructor(message, code = 'error', detail = '') {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function explain(status, body) {
  const msg = body?.error?.message || '';
  if (status === 400 && /API key|API_KEY/i.test(msg)) return new AIError('Clé API Gemini invalide. Vérifie-la dans les réglages.', 'key', msg);
  if (status === 401 || status === 403) return new AIError('Clé API refusée par Google. Vérifie-la dans les réglages.', 'key', msg);
  // Modèle retiré, réservé, ou sans quota gratuit (« limit: 0 ») : on pourra en essayer un autre.
  if (status === 404 || (status === 400 && /model/i.test(msg)) || (status === 429 && /limit:\s*0\b/i.test(msg))) {
    return new AIError("Ce modèle Gemini n'est pas disponible pour ta clé.", 'model', msg);
  }
  if (status === 429) return new AIError('Quota gratuit Gemini atteint. Patiente une minute puis réessaie.', 'quota', msg);
  if (status >= 500) return new AIError('Le service Gemini est surchargé. Réessaie dans un instant.', 'server', msg);
  return new AIError(`Erreur Gemini (${status}) : ${msg || 'réponse inattendue'}`, 'error', msg);
}

async function call(path, { method = 'GET', body, key, signal } = {}) {
  const apiKey = (key ?? getSettings().apiKey).trim();
  if (!apiKey) throw new AIError('Ajoute ta clé API Gemini dans les réglages pour utiliser cette fonction.', 'nokey');
  if (!navigator.onLine) throw new AIError('Pas de connexion internet : cette fonction a besoin de Gemini.', 'offline');

  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new AIError('Impossible de joindre Gemini. Vérifie ta connexion.', 'offline');
    }
    if (res.ok) return res.json();
    const data = await res.json().catch(() => null);
    const error = explain(res.status, data);
    const retryable = error.code === 'server' || (error.code === 'quota' && attempt === 0);
    if (!retryable || attempt === 2) throw error;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) ** 2));
  }
  throw new AIError('Erreur Gemini inconnue.');
}

const EXCLUDED = /embedding|tts|image|live|audio|computer|robotics|research|aqa|learnlm|gemma/i;

function version(id) {
  const m = id.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Classe les modèles du plus adapté au moins adapté :
 * « flash » d'abord (rapide, quota gratuit généreux), puis « flash-lite », puis « pro » ;
 * version la plus récente d'abord ; version stable avant préversion.
 */
export function rankModels(models) {
  const family = (id) => (/flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3);
  const unstable = (id) => (/preview|exp|latest/.test(id) ? 1 : 0);
  return [...models].sort((a, b) => family(a.id) - family(b.id)
    || version(b.id) - version(a.id)
    || unstable(a.id) - unstable(b.id)
    || a.id.localeCompare(b.id));
}

let modelsCache = null; // { key, models }

/** Liste des modèles capables de générer du contenu (sert aussi à tester la clé). */
export async function listModels(key) {
  const apiKey = (key ?? getSettings().apiKey).trim();
  if (modelsCache?.key === apiKey) return modelsCache.models;
  const data = await call('/models?pageSize=1000', { key: apiKey });
  const models = rankModels((data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .filter((m) => /^gemini-/i.test(m.id) && !EXCLUDED.test(m.id)));
  modelsCache = { key: apiKey, models };
  return models;
}

/** Choisit le meilleur modèle disponible pour la clé et l'enregistre. */
export async function pickBestModel(key) {
  const models = await listModels(key);
  if (!models.length) throw new AIError('Aucun modèle Gemini n\'est disponible pour cette clé.', 'model');
  setSettings({ model: models[0].id });
  return models[0].id;
}

function extractText(data) {
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new AIError(reason ? `Gemini a refusé la demande (${reason}).` : 'Gemini n\'a rien renvoyé.');
  }
  const text = (candidate.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  if (!text && candidate.finishReason) throw new AIError(`Réponse interrompue (${candidate.finishReason}).`);
  return text;
}

async function generateWith(model, body, signal) {
  const data = await call(`/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body, signal });
  return extractText(data);
}

/**
 * @param {object} o
 * @param {string} o.system consignes système
 * @param {Array} o.parts parties du message : { text } ou { inline_data: { mime_type, data } }
 * @param {object} [o.schema] schéma JSON de la réponse
 */
export async function generate({ system, parts, schema, temperature = 0.4, signal }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }

  // Modèle enregistré d'abord ; s'il est refusé, on essaie les autres modèles de la clé, dans l'ordre.
  const tried = new Set();
  let model = getSettings().model || await pickBestModel();
  let text;
  let lastError;
  for (let i = 0; i < 5 && model; i++) {
    tried.add(model);
    try {
      text = await generateWith(model, body, signal);
      if (getSettings().model !== model) setSettings({ model });
      break;
    } catch (err) {
      if (err.code !== 'model') throw err;
      console.warn(`Modèle ${model} refusé :`, err.detail);
      lastError = err;
      const models = await listModels();
      model = models.find((m) => !tried.has(m.id))?.id;
    }
  }
  if (text === undefined) {
    throw new AIError(`Aucun modèle Gemini n'a accepté la demande (${[...tried].join(', ')}). ${lastError?.detail || ''}`.trim(), 'model');
  }

  if (!schema) return text.trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AIError('Réponse de Gemini illisible. Réessaie.');
  }
}
