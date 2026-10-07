/** Composition root for cloud synchronization. */
'use strict';
(function(global){
  const GSP = global.GSP = global.GSP || {};
  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.services = GSP.application.services || {};

  function resolveService() {
    if (GSP.application.services.cloudSync && typeof GSP.application.services.cloudSync.fetchRow === 'function') return GSP.application.services.cloudSync;
    const factory = GSP.infrastructure && GSP.infrastructure.adapters && GSP.infrastructure.adapters.createSupabaseSyncAdapter;
    if (typeof factory !== 'function' || !global.supabaseClient) return null;
    const gateway = factory({
      client: global.supabaseClient,
      table: 'grade_system_state',
      bucket: global.WORKBOOK_STORAGE_BUCKET || (global.GSP && global.GSP.application && global.GSP.application.services && global.GSP.application.services.configuration && global.GSP.application.services.configuration.get('workbookStorageBucket')) || 'workbook-originals'
    });
    const queue = GSP.application.services.syncQueue || null;
    const status = GSP.application.services.syncStatus || null;
    const conflicts = GSP.application.services.conflictResolver || null;
    const recovery = GSP.application.services.errorRecovery || null;
    const reliabilityFactory = GSP.application.services.createOfflineSyncReliability;
    const reliability = (typeof reliabilityFactory === 'function' && queue && status) ? reliabilityFactory({queue, status}) : null;
    const online = () => !!global.navigator && navigator.onLine;
    const available = () => !!global.cloudAvailable;

    const service = {
      canSync: () => available() && online(),
      status: () => status ? status.get() : { pending: queue ? queue.ids().length : 0 },
      reliability: reliability,
      retryNow: callback => reliability ? reliability.retryNow(callback) : (typeof callback === 'function' ? callback() : null),
      enqueue: ids => { const out = reliability ? reliability.markQueued(ids) : (queue ? queue.enqueue(ids) : []); if (status && !reliability) status.setPending(out.length); return out; },
      pendingIds: () => queue ? queue.ids() : [],
      markAttempt: ids => reliability ? reliability.markAttempt(ids) : (queue && queue.markAttempt(ids)),
      complete: ids => reliability ? reliability.markSuccess(ids) : (() => { const out = queue ? queue.remove(ids) : []; if (status) status.setPending(out.length); return out; })(),
      recordFailure: (error, ids) => { if (reliability) reliability.markFailure(error, ids); else if (status) status.markFailure(error, queue ? queue.ids().length : 0); if (recovery && typeof recovery.handle === 'function') return recovery.handle(error, {operation:'cloud.sync', module:'cloud-sync', source:'supabase'}, {audit:GSP.application.services.audit, logger:global.console}); },
      errorRecovery: recovery,
      recordSuccess: () => { if (reliability) return reliability.markSuccess([]); if (status) status.markSuccess(queue ? queue.ids().length : 0); },
      recordConflictCount: count => { if (status) status.setConflicts(count); },
      conflictResolver: conflicts,
      fetchRow: id => gateway.fetchRow(id),
      upsertRows: rows => gateway.upsertRows(rows),
      listRowIds: () => gateway.listRowIds(),
      deleteRow: id => gateway.deleteRow(id),
      uploadWorkbook: (path, blob, options) => gateway.uploadWorkbook(path, blob, options),
      downloadWorkbook: path => gateway.downloadWorkbook(path),
      removeWorkbooks: paths => gateway.removeWorkbooks(paths),
      listStorage: (path, options) => gateway.listStorage(path, options)
    };
    GSP.application.services.cloudSync = Object.freeze(service);
    return GSP.application.services.cloudSync;
  }

  GSP.application.ports.cloudSync = Object.freeze({resolve: resolveService});
})(window);
