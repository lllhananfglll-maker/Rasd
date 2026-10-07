/** features/sql-export.js — تصدير SQL جاهز لإنشاء حسابات profiles في Supabase */
'use strict';

// يبني ملف SQL جاهز لإنشاء/تحديث صفوف profiles (وتعليقات لإرشاد إنشاء Auth users).
// لا يضمّن كلمات سر أو PIN — كلمات المرور تُضبط عبر Auth أو Edge Function.
GSP.exportSystemDirectorySQL = function() {
  if (currentAccountType !== 'superadmin') {
    alert('تصدير SQL متاح لرئيس الكنترول فقط.');
    return;
  }
  const root = getRootDB();
  const stamp = new Date().toISOString().slice(0, 10);
  const domain = (typeof CLOUD_LOGIN_DOMAIN !== 'undefined' && CLOUD_LOGIN_DOMAIN) ? CLOUD_LOGIN_DOMAIN : 'school.internal';

  function sqlStr(v) {
    return "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
  }
  function sqlStageIds(ids) {
    const arr = (ids || []).filter(Boolean).map(function(x) { return String(x); });
    if (!arr.length) return "'[]'::jsonb";
    return sqlStr(JSON.stringify(arr)) + '::jsonb';
  }
  function emailTeacher(id) {
    return (typeof teacherCloudEmail === 'function') ? teacherCloudEmail(id)
      : ('t_' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + domain);
  }
  function emailAdmin(id) {
    return (typeof stageAdminCloudEmail === 'function') ? stageAdminCloudEmail(id)
      : ('sa_' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + domain);
  }
  function emailMonitor(id) {
    return (typeof stageMonitorCloudEmail === 'function') ? stageMonitorCloudEmail(id)
      : ('mon_' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + domain);
  }

  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- دليل حسابات المنظومة → SQL (profiles)');
  lines.push('-- التاريخ: ' + stamp);
  lines.push('-- ملاحظة: لا يتضمن كلمات سر. أنشئ مستخدم Auth أولاً ثم اربط profiles.id = auth.users.id');
  lines.push('-- أو عدّل INSERT ليتوافق مع مخطط جدول profiles لديك.');
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('-- افترض جدولاً بالشكل التقريبي:');
  lines.push('--   profiles (');
  lines.push('--     id uuid primary key references auth.users(id),');
  lines.push('--     role text, full_name text, email text,');
  lines.push('--     stage_ids jsonb, teacher_id text, sections jsonb');
  lines.push('--   );');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  let nAdmin = 0, nMon = 0, nTeach = 0;

  (root.stageAdmins || []).forEach(function(a) {
    nAdmin++;
    const email = emailAdmin(a.id);
    lines.push('-- مسؤول حاسب: ' + (a.name || '') + ' / id=' + a.id);
    lines.push('-- TODO: أنشئ auth.users بالبريد ' + email + ' ثم ضع UUID الناتج مكان :auth_user_id');
    lines.push(
      "INSERT INTO profiles (id, role, full_name, email, stage_ids, teacher_id)"
    );
    lines.push(
      "VALUES (:auth_user_id, 'stageadmin', " + sqlStr(a.name || '') + ", " + sqlStr(email) + ", " +
      sqlStageIds(a.stageIds) + ", NULL)"
    );
    lines.push(
      "ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, email = EXCLUDED.email, stage_ids = EXCLUDED.stage_ids;"
    );
    lines.push('');
  });

  (root.stageMonitors || []).forEach(function(a) {
    nMon++;
    const email = emailMonitor(a.id);
    lines.push('-- مدير مرحلة: ' + (a.name || '') + ' / id=' + a.id);
    lines.push('-- TODO: أنشئ auth.users بالبريد ' + email + ' ثم ضع UUID الناتج مكان :auth_user_id');
    lines.push(
      "INSERT INTO profiles (id, role, full_name, email, stage_ids, teacher_id)"
    );
    lines.push(
      "VALUES (:auth_user_id, 'monitor', " + sqlStr(a.name || '') + ", " + sqlStr(email) + ", " +
      sqlStageIds(a.stageIds) + ", NULL)"
    );
    lines.push(
      "ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, email = EXCLUDED.email, stage_ids = EXCLUDED.stage_ids;"
    );
    lines.push('');
  });

  (root.stages || []).forEach(function(st) {
    ((st.data && st.data.teachers) || []).forEach(function(t) {
      nTeach++;
      const email = emailTeacher(t.id);
      lines.push('-- معلم: ' + (t.name || '') + ' / id=' + t.id + ' / مرحلة=' + (st.id || ''));
      lines.push('-- TODO: أنشئ auth.users بالبريد ' + email + ' ثم ضع UUID الناتج مكان :auth_user_id');
      lines.push(
        "INSERT INTO profiles (id, role, full_name, email, stage_ids, teacher_id)"
      );
      lines.push(
        "VALUES (:auth_user_id, 'teacher', " + sqlStr(t.name || '') + ", " + sqlStr(email) + ", " +
        sqlStageIds([st.id]) + ", " + sqlStr(t.id || '') + ")"
      );
      lines.push(
        "ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, email = EXCLUDED.email, stage_ids = EXCLUDED.stage_ids, teacher_id = EXCLUDED.teacher_id;"
      );
      lines.push('');
    });
  });

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- ملخص: مسؤولو حاسب=' + nAdmin + ' · مديرو مراحل=' + nMon + ' · معلمون=' + nTeach);
  lines.push('-- استبدل كل :auth_user_id بـ UUID الحقيقي من auth.users بعد الإنشاء.');

  const blob = new Blob([lines.join('\n')], { type: 'application/sql;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'profiles-accounts-' + stamp + '.sql';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
  try {
    recordAudit('تصدير SQL للحسابات', 'حاسب=' + nAdmin + ' مراقبون=' + nMon + ' معلمون=' + nTeach);
  } catch (e) {}
  alert(
    '✅ تم تنزيل ملف SQL\n' +
    '• مسؤولو الحاسب: ' + nAdmin + '\n' +
    '• مديرو المراحل: ' + nMon + '\n' +
    '• المعلمون: ' + nTeach + '\n' +
    'راجع التعليقات داخل الملف واستبدل :auth_user_id بعد إنشاء المستخدمين في Auth.'
  );
};

