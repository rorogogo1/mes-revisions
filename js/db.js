// Accès IndexedDB : tout est stocké sur l'appareil.

const DB_NAME = 'mes-revisions';
const DB_VERSION = 1;
export const STORES = ['courses', 'sources', 'cards', 'reviews'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sources')) {
          db.createObjectStore('sources', { keyPath: 'id' }).createIndex('courseId', 'courseId');
        }
        if (!db.objectStoreNames.contains('cards')) {
          const s = db.createObjectStore('cards', { keyPath: 'id' });
          s.createIndex('courseId', 'courseId');
          s.createIndex('sourceId', 'sourceId');
        }
        if (!db.objectStoreNames.contains('reviews')) {
          const s = db.createObjectStore('reviews', { keyPath: 'id' });
          s.createIndex('cardId', 'cardId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export async function getAll(store) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).get(id));
}

export async function getByIndex(store, index, value) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function put(store, value) {
  return putMany(store, [value]);
}

export async function putMany(store, values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  values.forEach((v) => s.put(v));
  return done(tx);
}

export async function del(store, id) {
  return delMany(store, [id]);
}

export async function delMany(store, ids) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  ids.forEach((id) => s.delete(id));
  return done(tx);
}

export async function clear(store) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return done(tx);
}
