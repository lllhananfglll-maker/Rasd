(function(global){
  'use strict';

  function relevantComps(sub){
    return (sub && sub.components || []).filter(c => !c.isMonthlyGrade && c.type !== 'attendance');
  }

  function studentSubjectScore(db, st, sub){
    const comps = relevantComps(sub);
    let scoreSum = 0, maxSum = 0, done = 0;
    comps.forEach(c => {
      const realIdx = sub.components.indexOf(c);
      const g = (db.grades||[]).find(x =>
        String(x.studentId)===String(st.id) && x.subjectName===sub.name &&
        x.componentIndex===realIdx && x.score!==undefined && x.score!==''
      );
      const mx = Number(c.maxScore)||0;
      maxSum += mx;
      if (g) {
        const sc = parseFloat(g.score);
        if (Number.isFinite(sc)) { scoreSum += sc; done++; }
      }
    });
    return { scoreSum, maxSum, done, expected: comps.length };
  }

  function computeTeacherMetrics(db, teacher){
    let expected = 0, done = 0, valid = 0, invalid = 0;
    (teacher.assignments||[]).forEach(a => {
      const sub = (db.subjects||[]).find(s => s.name === a.subjectName);
      if (!sub) return;
      const comps = relevantComps(sub);
      (a.classes||[]).forEach(key => {
        const sts = (db.students||[]).filter(st => {
          const k = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'');
          if (k !== key) return false;
          if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(a.subjectName, st)) return false;
          return true;
        });
        sts.forEach(st => {
          comps.forEach(c => {
            expected++;
            const realIdx = sub.components.indexOf(c);
            const g = (db.grades||[]).find(x =>
              String(x.studentId)===String(st.id) && x.subjectName===sub.name &&
              x.componentIndex===realIdx && x.score!==undefined && x.score!==''
            );
            if (g) {
              done++;
              const sc = parseFloat(g.score);
              const mx = Number(c.maxScore);
              if (Number.isFinite(sc) && (mx==null || isNaN(mx) || (sc>=0 && sc<=mx))) valid++;
              else invalid++;
            }
          });
        });
      });
    });
    const pct = expected ? Math.round(done/expected*100) : 100;
    const accuracy = (valid+invalid) ? Math.round(valid/(valid+invalid)*100) : 100;
    const day = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
    const expectedPace = Math.max(1, Math.round((day/daysInMonth)*100));
    const speedPct = Math.min(100, Math.round((pct / expectedPace) * 100));
    return { expected, done, missing: Math.max(0, expected-done), pct, accuracy, speedPct };
  }

  function classMetrics(db){
    const map = {};
    (db.classes||[]).forEach(k => {
      map[k] = { key:k, students:0, expected:0, done:0, scoreSum:0, maxSum:0 };
    });
    (db.students||[]).forEach(st => {
      const k = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'');
      if (!map[k]) map[k] = { key:k, students:0, expected:0, done:0, scoreSum:0, maxSum:0 };
      map[k].students++;
      (db.subjects||[]).forEach(sub => {
        if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(sub.name, st)) return;
        const r = studentSubjectScore(db, st, sub);
        map[k].expected += r.expected;
        map[k].done += r.done;
        map[k].scoreSum += r.scoreSum;
        map[k].maxSum += r.maxSum;
      });
    });
    return Object.values(map).map(m => ({
      ...m,
      label: typeof classSectionLabel==='function' ? classSectionLabel(m.key) : m.key,
      pct: m.expected ? Math.round(m.done/m.expected*100) : 100,
      avg: m.maxSum ? Math.round(m.scoreSum/m.maxSum*1000)/10 : null
    })).sort((a,b)=> (a.label||'').localeCompare(b.label||'','ar'));
  }

  global.GSP = global.GSP || {};
  global.GSP.monitorAnalytics = Object.freeze({
    studentSubjectScore,
    computeTeacherMetrics,
    classMetrics
  });
})(window);
