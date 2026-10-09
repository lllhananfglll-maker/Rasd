/** Pure conflict/version helpers. UI decisions remain in the feature boundary. */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  function isRemoteNewer(localUpdatedAt, remoteUpdatedAt) {
    if (!remoteUpdatedAt) return false;
    if (!localUpdatedAt) return true;
    const local = Date.parse(localUpdatedAt), remote = Date.parse(remoteUpdatedAt);
    return Number.isFinite(remote) && (!Number.isFinite(local) || remote > local);
  }
  function normalize(value) { return value === undefined ? null : value; }
  function findFieldConflict(localBaseline, remoteValue, proposedValue) {
    const baseline = normalize(localBaseline), remote = normalize(remoteValue), proposed = normalize(proposedValue);
    return remote !== baseline && remote !== proposed ? { baseline, remote, proposed } : null;
  }
  function summarize(conflicts) { return { count: Array.isArray(conflicts) ? conflicts.length : 0, hasConflicts: Array.isArray(conflicts) && conflicts.length > 0 }; }
  const api = Object.freeze({ isRemoteNewer, findFieldConflict, summarize });
  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.conflictResolver = api;
  GSP.conflictResolver = api;
})(window);
