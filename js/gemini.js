// Client minimal de l'API Gemini (Google AI Studio). La clé reste sur l'appareil.

import { getSettings } from './settings.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class AIError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.code = code;
  }
}

function explain(status, body) {
  const msg = body?.error?.message || '';
  if (status === 400 && /API key|API_KEY/i.test(msg)) return new AIError('Clé API Gemini invalide. Vérifie-la dans les réglages.', 'key');
  if (status === 401 || status === 403) return new AIError('Clé API refusée par Google. Vérifie-la dans les réglages.', 'key');
  if (status === 404) return new AIError("Ce modèle Gemini n'est pas disponible pour ta clé. Choisis-en un autre dans les réglages.", 'model');
  if (status === 429) return new AIError('Quota gratuit Gemini atteint. Patiente une minute puis réessaie.', 'quota');
  if (status >= 500) return new AIError('Le service Gemini est surchargé. Réessaie dans un instant.', 'server');
  return new AIError(`Erreur Gemini (${status}) : ${msg || 'réponse inattendue'}`);
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
    const retryable = res.status >= 500 || (res.status === 429 && attempt === 0);
    if (!retryable || attempt === 2) throw error;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) ** 2));
  }
  throw new AIError('Erreur Gemini inconnue.');
}

/** Liste des modèles capables de générer du contenu (pour tester la clé). */
export async function listModels(key) {
  const data = await call('/models?pageSize=200', { key });
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .filter((m) => /gemini/i.test(m.id) && !/embedding|tts|image|live|audio/i.test(m.id));
}

function extractText(data) {
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new AIError(reason ? `Gemini a refusé la demande (${reason}).` : 'Gemini n\'a rien renvoyé.');
  }
  const text = (candidate.content?.parts || []).map((p) => p.text || '').join('');
  if (!text && candidate.finishReason) throw new AIError(`Réponse interrompue (${candidate.finishReason}).`);
  return text;
}

/**
 * @param {object} o
 * @param {string} o.system consignes système
 * @param {Array} o.parts parties du message : { text } ou { inline_data: { mime_type, data } }
 * @param {object} [o.schema] schéma JSON de la réponse
 */
export async function generate({ system, parts, schema, temperature = 0.4, signal }) {
  const { model } = getSettings();
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }
  const data = await call(`/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body, signal });
  const text = extractText(data);
  if (!schema) return text.trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AIError('Réponse de Gemini illisible. Réessaie.');
  }
}
