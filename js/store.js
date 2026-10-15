/*
 * On-device storage. Songs, setlists and settings live in IndexedDB so the app
 * works offline. If IndexedDB is unavailable (private browsing, some previews)
 * everything still works for the session, held in memory.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'stage-tabs';
  const DB_VERSION = 1;
  const STORES = ['songs', 'setlists', 'meta'];
  const KEYS = { songs: 'id', setlists: 'id', meta: 'key' };

  let dbPromise = null;
  let persistent = false;
  const memory = { songs: new Map(), setlists: new Map(), meta: new Map() };

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let done = false;
      const finish = (db) => { if (!done) { done = true; resolve(db); } };
      try {
        if (!root.indexedDB) return finish(null);
        const req = root.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: KEYS[s] });
        };
        req.onsuccess = () => { persistent = true; finish(req.result); };
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
        setTimeout(() => finish(null), 3000);
      } catch (e) {
        finish(null);
      }
    });
    return dbPromise;
  }

  function tx(db, store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function getAll(store) {
    const db = await open();
    if (!db) return [...memory[store].values()];
    try { return await tx(db, store, 'readonly', (s) => s.getAll()); }
    catch (e) { return [...memory[store].values()]; }
  }

  async function put(store, obj) {
    memory[store].set(obj[KEYS[store]], obj);
    const db = await open();
    if (!db) return obj;
    try { await tx(db, store, 'readwrite', (s) => s.put(obj)); } catch (e) { /* kept in memory */ }
    return obj;
  }

  async function putMany(store, list) {
    for (const o of list) memory[store].set(o[KEYS[store]], o);
    const db = await open();
    if (!db) return;
    try { await tx(db, store, 'readwrite', (s) => { list.forEach((o) => s.put(o)); }); } catch (e) { /* kept in memory */ }
  }

  async function remove(store, id) {
    memory[store].delete(id);
    const db = await open();
    if (!db) return;
    try { await tx(db, store, 'readwrite', (s) => s.delete(id)); } catch (e) { /* ignore */ }
  }

  async function getMeta(key, fallback) {
    const db = await open();
    let row;
    if (db) { try { row = await tx(db, 'meta', 'readonly', (s) => s.get(key)); } catch (e) { /* ignore */ } }
    if (!row) row = memory.meta.get(key);
    return row ? row.value : fallback;
  }

  function setMeta(key, value) {
    return put('meta', { key, value });
  }

  // Ask the browser not to clear our data when space runs low.
  async function requestPersistence() {
    try {
      if (root.navigator && navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
    } catch (e) { /* ignore */ }
    return false;
  }

  root.Store = {
    open, getAll, put, putMany, remove, getMeta, setMeta, requestPersistence,
    isPersistent: () => persistent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
