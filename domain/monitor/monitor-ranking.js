(function (global) {
  'use strict';
  const api = Object.freeze({
    assignDenseRanks(sortedRows) {
      const rows = Array.isArray(sortedRows) ? sortedRows : [];
      let rank = 0, prevPts = null;
      for (let i = 0; i < rows.length; i++) {
        const p = rows[i].points;
        if (prevPts === null || p !== prevPts) { rank += 1; prevPts = p; }
        rows[i].rank = rank;
      }
      const byRank = {};
      rows.forEach(r => { byRank[r.rank] = (byRank[r.rank] || 0) + 1; });
      rows.forEach(r => { r.rankTied = byRank[r.rank] > 1; });
      return rows;
    }
  });
  global.GSP_DOMAIN = global.GSP_DOMAIN || {};
  global.GSP_DOMAIN.monitorRanking = api;
})(typeof window !== 'undefined' ? window : globalThis);
