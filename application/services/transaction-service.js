/**
 * STEP 37 — Transaction Safety.
 *
 * Provides an application-level transaction boundary for the legacy synchronous
 * UI over the asynchronous durable storage layer. Work is always performed on
 * a deep-cloned draft; the live database is replaced only at commit time.
 * A failed durable commit triggers an in-memory rollback to the original
 * snapshot. The durable old version remains authoritative if IndexedDB rejects
 * the new write.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const services = GSP.application = GSP.application || {};
  services.services = services.services || {};

  function defaultClone(value) {
    if (typeof root.structuredClone === 'function') return root.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function createTransactionService({ clone, logger, audit, recovery } = {}) {
    const copy = typeof clone === 'function' ? clone : defaultClone;
    const log = logger || root.console || { error() {} };
    const auditService = audit || (GSP.application && GSP.application.services && GSP.application.services.audit) || null;
    const recoveryService = recovery || (GSP.application && GSP.application.services && GSP.application.services.errorRecovery) || null;

    function recoverTx(label, error, phase) {
      if (!recoveryService || typeof recoveryService.handle !== 'function') return null;
      return recoveryService.handle(error, { operation: label, module: 'transaction', phase, source: 'transaction-service' }, { audit: auditService, logger: log });
    }

    function auditTx(label, outcome, original, draft, error) {
      if (!auditService || typeof auditService.recordChange !== 'function') return;
      try {
        auditService.recordChange({
          action: label, module: String(label || '').split('.')[0] || 'transaction',
          record: { transaction: label }, before: original,
          after: draft, reason: error ? String(error.message || error) : '',
          outcome, level: outcome === 'failure' ? 'error' : 'info', transactionId: label + ':' + Date.now().toString(36)
        });
      } catch (_) {}
    }

    function executeSync({ label = 'transaction', load, save, rollback, work }) {
      if (typeof load !== 'function') throw new Error('Transaction: load is required');
      if (typeof save !== 'function') throw new Error('Transaction: save is required');
      if (typeof work !== 'function') throw new Error('Transaction: work is required');

      const original = copy(load());
      const draft = copy(original);
      let result;
      try {
        result = work(draft);
      } catch (error) {
        auditTx(label, 'failure', original, draft, error);
        const recovery = recoverTx(label, error, 'work');
        return { ok: false, phase: 'work', label, error, recovery };
      }

      let persistence;
      try {
        persistence = Promise.resolve(save(draft)).then((saved) => {
          if (saved === false) throw new Error('Durable local commit failed');
          auditTx(label, 'success', original, draft, null);
          return { ok: true, label, result, draft };
        }).catch((error) => {
          try {
            if (typeof rollback === 'function') rollback(copy(original));
          } catch (rollbackError) {
            log.error('Transaction rollback failed:', rollbackError);
          }
          auditTx(label, 'failure', original, draft, error);
          const recovery = recoverTx(label, error, 'commit');
          return { ok: false, phase: 'commit', label, error, rolledBack: true, recovery };
        });
      } catch (error) {
        try {
          if (typeof rollback === 'function') rollback(copy(original));
        } catch (rollbackError) {
          log.error('Transaction rollback failed:', rollbackError);
        }
        auditTx(label, 'failure', original, draft, error);
        const recovery = recoverTx(label, error, 'commit');
        return { ok: false, phase: 'commit', label, error, rolledBack: true, recovery };
      }

      return Object.assign({ ok: true, label, result, draft }, {
        persistence,
        committed: persistence.then(x => !!x.ok)
      });
    }

    return Object.freeze({ clone: copy, executeSync });
  }

  services.createTransactionService = createTransactionService;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createTransactionService = createTransactionService;
})(window);
