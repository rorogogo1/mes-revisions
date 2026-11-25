// Lecture des notes : photos (Gemini ou Tesseract sur l'appareil) et PDF (pdf.js).

import { getSettings, hasApiKey } from './settings.js';
import { transcribeImage } from './ai.js';
import { pageMarker } from './text.js';

const PDFJS_VERSION = '4.10.38';
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESS_LANG = { fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita' };

let pdfjsPromise;
let tesseractPromise;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib;
    }).catch((e) => { pdfjsPromise = null; throw new Error(`Lecteur PDF indisponible (connexion requise au premier usage). ${e.message}`); });
  }
  return pdfjsPromise;
}

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve(window.Tesseract);
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => { tesseractPromise = null; reject(new Error('Lecture sur l\'appareil indisponible : connexion requise au premier usage.')); };
      document.head.appendChild(script);
    });
  }
  return tesseractPromise;
}

/** Réduit une image (photo de téléphone) pour l'envoi et le stockage. */
export async function resizeImage(blob, maxSide = 2000, quality = 0.85) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const useGemini = () => getSettings().ocr !== 'local' && hasApiKey() && navigator.onLine;

/**
 * Lit le texte d'une image.
 * @param {Blob} blob image (déjà redimensionnée de préférence)
 * @param {(p: number, label: string) => void} onProgress
 * @returns {Promise<{ text: string, engine: 'gemini'|'tesseract' }>}
 */
export async function imageToText(blob, onProgress = () => {}) {
  if (useGemini()) {
    onProgress(0.3, 'Lecture par Gemini…');
    try {
      const text = await transcribeImage({ base64: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' });
      onProgress(1, 'Terminé');
      return { text, engine: 'gemini' };
    } catch (err) {
      if (err.code === 'nokey' || err.code === 'offline') { /* repli local */ } else throw err;
    }
  }
  const Tesseract = await loadTesseract();
  const lang = TESS_LANG[getSettings().language] || 'fra';
  const result = await Tesseract.recognize(blob, lang, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress, 'Lecture sur l\'appareil…');
      else onProgress(0.05, 'Préparation de la lecture…');
    },
  });
  return { text: result.data.text.replace(/\n{3,}/g, '\n\n').trim(), engine: 'tesseract' };
}

/**
 * Extrait le texte d'un PDF, page par page ; les pages scannées passent par la lecture d'image.
 * @returns {Promise<{ text: string, pages: number, scannedPages: number, previews: Blob[] }>}
 */
export async function pdfToText(file, onProgress = () => {}) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const chunks = [];
  const previews = [];
  let scannedPages = 0;

  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress((n - 1) / pdf.numPages, `Page ${n} / ${pdf.numPages}`);
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    let lastY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > (item.height || 10) * 1.8) text += '\n\n';
      else if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      lastY = y;
    }
    text = text.replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    const needsOcr = text.replace(/\s/g, '').length < 40;
    if (needsOcr || n <= 3) {
      const viewport = page.getViewport({ scale: needsOcr ? 2 : 1 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (needsOcr) {
        scannedPages++;
        const res = await imageToText(blob, (p, label) => onProgress((n - 1 + p) / pdf.numPages, `Page ${n} : ${label}`));
        text = res.text;
      }
      if (previews.length < 3) previews.push(await resizeImage(blob, 1400, 0.75));
    }
    chunks.push(`${pageMarker(n)}\n${text}`);
  }
  onProgress(1, 'Terminé');
  return { text: chunks.join('\n\n'), pages: pdf.numPages, scannedPages, previews };
}
