/*
 * IndexedDB gateway — STEP 33.
 *
 * Infrastructure-only boundary around the browser IndexedDB API.  It deliberately
 * knows nothing about grades, attendance, stages, or UI.  Legacy storage keeps
 * its synchronous cache contract while delegating the physical async I/O here.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  function createIndexedDBGateway(options) {
    const opts = options || {};
    const indexedDBApi = Object.prototype.hasOwnProperty.call(opts, 'indexedDB') ? opts.indexedDB : root.indexedDB;
    const dbName = opts.dbName || 'gradeSystemProDB';
    const storeName = opts.storeName || 'kv';
    let connectionPromise = null;

    function open() {
      if (connectionPromise) return connectionPromise;
      connectionPromise = new Promise((resolve, reject) => {
        if (!indexedDBApi) {
          reject(new Error('IndexedDB غير مدعوم في هذا المتصفح'));
          return;
        }
        const request = indexedDBApi.open(dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return connectionPromise;
    }

    function get(key) {
      return open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }));
    }

    function set(key, value) {
      return open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }

    return Object.freeze({ open, get, set, dbName, storeName });
  }

  GSP.infrastructure = GSP.infrastructure || {};
  GSP.infrastructure.database = GSP.infrastructure.database || {};
  GSP.infrastructure.database.createIndexedDBGateway = createIndexedDBGateway;
  GSP.infrastructure.database.gateway = createIndexedDBGateway({
    indexedDB: root.indexedDB,
    dbName: 'gradeSystemProDB',
    storeName: 'kv'
  });
})(window);
