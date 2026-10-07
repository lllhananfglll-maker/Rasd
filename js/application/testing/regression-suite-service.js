/**
 * STEP 40 — Automated Regression Suite.
 *
 * A small, browser-independent scenario runner for critical Grade System Pro
 * workflows. It deliberately works through injected application boundaries so
 * tests never touch real school data or Supabase.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const testing = application.testing = application.testing || {};

  function clone(value) {
    if (typeof root.structuredClone === 'function') return root.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Regression assertion failed');
  }

  async function step(log, name, action) {
    const started = Date.now();
    try {
      const value = await action();
      log.push({ name, ok: true, ms: Date.now() - started });
      return value;
    } catch (error) {
      log.push({ name, ok: false, ms: Date.now() - started, error: String(error && error.message || error) });
      throw error;
    }
  }

  function requireFn(harness, name) {
    assert(harness && typeof harness[name] === 'function', `Missing regression harness operation: ${name}`);
    return harness[name].bind(harness);
  }

  async function teacherWorkflow(harness, log) {
    await step(log, 'teacher.login', () => requireFn(harness, 'login')({ role: 'teacher' }));
    await step(log, 'teacher.selectClass', () => requireFn(harness, 'selectClass')('1/أ'));
    await step(log, 'teacher.selectSubject', () => requireFn(harness, 'selectSubject')('رياضيات'));
    await step(log, 'teacher.enterGrade', () => requireFn(harness, 'enterGrade')('student-1', 9.5));
    await step(log, 'teacher.save', () => requireFn(harness, 'saveGrades')());
    await step(log, 'teacher.refresh', () => requireFn(harness, 'refresh')());
    const value = await step(log, 'teacher.verify', () => requireFn(harness, 'readGrade')('student-1'));
    assert(Number(value) === 9.5, `Teacher grade did not survive refresh (got ${value})`);
    return { grade: value };
  }

  async function attendanceWorkflow(harness, log) {
    await step(log, 'attendance.open', () => requireFn(harness, 'openAttendance')());
    await step(log, 'attendance.selectWorkingDay', () => requireFn(harness, 'selectWorkingDay')('2026-09-10'));
    await step(log, 'attendance.markStudents', () => requireFn(harness, 'markStudents')({ 'student-1': 'present', 'student-2': 'absent' }));
    await step(log, 'attendance.save', () => requireFn(harness, 'saveAttendance')());
    await step(log, 'attendance.refresh', () => requireFn(harness, 'refresh')());
    const value = await step(log, 'attendance.verify', () => requireFn(harness, 'readAttendance')('2026-09-10'));
    assert(value && value['student-1'] === 'present' && value['student-2'] === 'absent', 'Attendance did not survive refresh');
    return { attendance: clone(value) };
  }

  async function offlineWorkflow(harness, log) {
    await step(log, 'offline.disconnect', () => requireFn(harness, 'setOnline')(false));
    await step(log, 'offline.edit', () => requireFn(harness, 'editOffline')('student-1', 8));
    await step(log, 'offline.save', () => requireFn(harness, 'saveGrades')());
    const pending = await step(log, 'offline.assertQueued', () => requireFn(harness, 'pendingSyncCount')());
    assert(Number(pending) > 0, 'Offline save did not create pending sync work');
    await step(log, 'offline.reconnect', () => requireFn(harness, 'setOnline')(true));
    await step(log, 'offline.sync', () => requireFn(harness, 'sync')());
    const remaining = await step(log, 'offline.assertQueueDrained', () => requireFn(harness, 'pendingSyncCount')());
    assert(Number(remaining) === 0, `Sync queue was not drained (remaining ${remaining})`);
    const cloud = await step(log, 'offline.verifyCloud', () => requireFn(harness, 'readCloudGrade')('student-1'));
    assert(Number(cloud) === 8, `Offline change did not reach cloud boundary (got ${cloud})`);
    return { cloudGrade: cloud };
  }

  async function safetyWorkflow(harness, log) {
    if (typeof harness.runTransactionRollback === 'function') {
      await step(log, 'safety.transactionRollback', () => harness.runTransactionRollback());
    }
    if (typeof harness.runErrorRecovery === 'function') {
      await step(log, 'safety.errorRecovery', () => harness.runErrorRecovery());
    }
    if (typeof harness.readAuditSummary === 'function') {
      const audit = await step(log, 'safety.audit', () => harness.readAuditSummary());
      assert(audit && Number(audit.events) >= 0, 'Audit summary is invalid');
    }
    return { optionalChecks: log.filter(x => x.name.startsWith('safety.')).length };
  }

  const scenarios = Object.freeze({
    teacher: teacherWorkflow,
    attendance: attendanceWorkflow,
    offline: offlineWorkflow,
    safety: safetyWorkflow
  });

  async function run({ harness, selected = Object.keys(scenarios), failFast = false } = {}) {
    assert(harness, 'Regression harness is required');
    const names = Array.from(new Set(selected)).filter(name => scenarios[name]);
    const results = [];
    const started = Date.now();
    for (const name of names) {
      const log = [];
      const scenarioStarted = Date.now();
      try {
        const data = await scenarios[name](harness, log);
        results.push({ name, ok: true, ms: Date.now() - scenarioStarted, steps: log, data });
      } catch (error) {
        results.push({ name, ok: false, ms: Date.now() - scenarioStarted, steps: log, error: String(error && error.message || error) });
        if (failFast) break;
      }
    }
    return {
      ok: results.length === names.length && results.every(x => x.ok),
      scenarios: results,
      requested: names.length,
      passed: results.filter(x => x.ok).length,
      failed: results.filter(x => !x.ok).length,
      elapsedMs: Date.now() - started
    };
  }

  const api = Object.freeze({ scenarios, run });
  testing.regressionSuite = api;
  GSP.regressionSuite = api;
})(window);
