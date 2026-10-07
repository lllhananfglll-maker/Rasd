/**
 * Infrastructure adapter for the cloud-sync boundary.
 * No UI, local DB, or business rules belong here.
 */
'use strict';

function createSupabaseSyncAdapter({client, table='grade_system_state', bucket=''} = {}) {
  if (!client) throw new Error('Supabase client is required');
  const state = () => client.from(table);
  const storage = () => client.storage.from(bucket);

  return Object.freeze({
    async fetchRow(id) {
      return state().select('data, updated_at').eq('id', id).maybeSingle();
    },
    async upsertRows(rows) {
      return state().upsert(rows);
    },
    async listRowIds() {
      return state().select('id');
    },
    async deleteRow(id) {
      return state().delete().eq('id', id);
    },
    async uploadWorkbook(path, blob, options) {
      return storage().upload(path, blob, options);
    },
    async downloadWorkbook(path) {
      return storage().download(path);
    },
    async removeWorkbooks(paths) {
      return storage().remove(paths);
    },
    async listStorage(path='', options={}) {
      return storage().list(path, options);
    }
  });
}

if (typeof window !== 'undefined') {
  window.GSP = window.GSP || {};
  window.GSP.infrastructure = window.GSP.infrastructure || {};
  window.GSP.infrastructure.adapters = window.GSP.infrastructure.adapters || {};
  window.GSP.infrastructure.adapters.createSupabaseSyncAdapter = createSupabaseSyncAdapter;
}

// Loaded as classic <script defer> — do not use ES module export.
