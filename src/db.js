/* Aracnário storage — Phase 1.
   A tiny promise-based IndexedDB key/value store, with a one-time migration
   from the old localStorage data so existing logs are not lost.

   Exposed as window.AracnarioDB:
     await AracnarioDB.get(key)            -> value | undefined
     await AracnarioDB.set(key, value)     -> void
     await AracnarioDB.migrateFromLocal(key) -> 'migrated' | 'skipped' | 'none'
     AracnarioDB.available                 -> boolean (IndexedDB usable)
*/
(function () {
  const DB_NAME = 'aracnario';
  const DB_VERSION = 1;
  const STORE = 'kv';

  const available = (function () {
    try { return typeof indexedDB !== 'undefined'; } catch (e) { return false; }
  })();

  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      const r = fn(store);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function get(key) {
    if (!available) return Promise.resolve(undefined);
    return tx('readonly', (s) => s.get(key));
  }

  function set(key, value) {
    if (!available) return Promise.reject(new Error('IndexedDB unavailable'));
    return tx('readwrite', (s) => s.put(value, key));
  }

  /* Move an old localStorage JSON string into IndexedDB exactly once.
     Returns 'migrated' if it copied data, 'skipped' if IDB already had a
     value, 'none' if there was nothing to migrate. The localStorage copy is
     left in place as a safety net. */
  async function migrateFromLocal(key) {
    if (!available) return 'none';
    const existing = await get(key);
    if (existing !== undefined && existing !== null) return 'skipped';
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
    if (raw == null) return 'none';
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
    await set(key, parsed);
    return 'migrated';
  }

  window.AracnarioDB = { get, set, migrateFromLocal, available };
})();
