import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function fakeIndexedDB() {
  const values = new Map();
  const api = {
    open(name) {
      const req = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => false },
          createObjectStore() {},
          transaction(_store, mode) {
            const tx = { mode, error: null, oncomplete: null, onerror: null };
            const store = {
              get(key) {
                const r = {};
                queueMicrotask(() => { r.result = values.get(key); if (r.onsuccess) r.onsuccess(); });
                return r;
              },
              put(value, key) {
                values.set(key, value);
                queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
              }
            };
            tx.objectStore = () => store;
            return tx;
          }
        };
        req.result = db;
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };
  return api;
}

const ctx = { console };
ctx.window = ctx;
ctx.indexedDB = fakeIndexedDB();
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/infrastructure/database-gateway.js'), 'utf8'), ctx);
const gateway = ctx.GSP.infrastructure.database.createIndexedDBGateway({ indexedDB: ctx.indexedDB, dbName: 'test-db', storeName: 'test' });
assert.equal(gateway.dbName, 'test-db');
assert.equal(gateway.storeName, 'test');
await gateway.set('alpha', { value: 42 });
assert.deepEqual(await gateway.get('alpha'), { value: 42 });
assert.strictEqual(await gateway.open(), await gateway.open(), 'connection is cached');
assert.equal(Object.isFrozen(gateway), true);

const unsupported = ctx.GSP.infrastructure.database.createIndexedDBGateway({ indexedDB: null });
await assert.rejects(() => unsupported.open(), /IndexedDB/);
console.log('Database gateway: 5 passed / 0 failed');
