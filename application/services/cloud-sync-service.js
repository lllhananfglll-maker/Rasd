/** Application service boundary for cloud synchronization. */
'use strict';

function createCloudSyncService({gateway, isAvailable, isOnline} = {}) {
  if (!gateway) throw new Error('Cloud sync gateway is required');
  const available = () => typeof isAvailable === 'function' ? !!isAvailable() : true;
  const online = () => typeof isOnline === 'function' ? !!isOnline() : true;

  return Object.freeze({
    canSync() { return available() && online(); },
    fetchRow(id) { return gateway.fetchRow(id); },
    upsertRows(rows) { return gateway.upsertRows(rows); },
    listRowIds() { return gateway.listRowIds(); },
    deleteRow(id) { return gateway.deleteRow(id); },
    uploadWorkbook(path, blob, options) { return gateway.uploadWorkbook(path, blob, options); },
    downloadWorkbook(path) { return gateway.downloadWorkbook(path); },
    removeWorkbooks(paths) { return gateway.removeWorkbooks(paths); },
    listStorage(path, options) { return gateway.listStorage(path, options); }
  });
}

export {createCloudSyncService};
