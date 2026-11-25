// Réglages du compte, conservés sur l'appareil (localStorage).

const KEY = 'mes-revisions:settings';

const DEFAULTS = {
  apiKey: '',
  model: '', // choisi automatiquement parmi les modèles disponibles pour la clé
  language: 'fr',
  retention: 0.9,
  newPerDay: 20,
  theme: 'auto',
  ocr: 'auto', // 'auto' : Gemini si clé, sinon sur l'appareil ; 'local' : toujours sur l'appareil
  onboardingDone: false,
};

let cache;

export function getSettings() {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  return cache;
}

export function setSettings(patch) {
  cache = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(cache));
  if ('theme' in patch) applyTheme();
  return cache;
}

export function hasApiKey() {
  return Boolean(getSettings().apiKey.trim());
}

export function applyTheme() {
  const { theme } = getSettings();
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14151f' : '#4f46e5');
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
