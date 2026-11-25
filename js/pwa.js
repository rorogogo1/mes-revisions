// Installation de l'application et mode hors ligne (service worker).

let deferredPrompt = null;
let installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.dispatchEvent(new CustomEvent('install-available'));
});
window.addEventListener('appinstalled', () => { installed = true; deferredPrompt = null; });

/** @returns {'installed'|'available'|'unavailable'} */
export function installState() {
  if (installed) return 'installed';
  return deferredPrompt ? 'available' : 'unavailable';
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function registerServiceWorker(onUpdate) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.();
      });
    });
  }).catch((err) => console.warn('Service worker non enregistré :', err));
}
