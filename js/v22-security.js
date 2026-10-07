(function(){
  const V22_KEY = 'gradeSystemV22Security';
  function readState(){ try{return JSON.parse(localStorage.getItem(V22_KEY)||'{}')}catch(e){return {}} }
  function writeState(s){ localStorage.setItem(V22_KEY, JSON.stringify(s)); }
  function setMsg(msg, cls){
    const el=document.getElementById('v22SecurityMessage');
    if(el){el.textContent=msg; el.className=cls||'';}
  }
  GSP.v22CheckSecurity=function(){
    const s=readState();
    const auth=document.getElementById('v22AuthStatus');
    const sync=document.getElementById('v22SyncStatus');
    const conflict=document.getElementById('v22ConflictCount');
    if(auth){
      // V22 intentionally reports the current client-side auth architecture honestly.
      const hasSupabaseAuth = !!(GSP.supabase && GSP.supabase.auth);
      auth.textContent = hasSupabaseAuth ? 'Supabase Auth متاح' : 'مصادقة العميل الحالية';
      auth.className='v22-badge '+(hasSupabaseAuth?'v22-ok':'v22-warn');
    }
    if(sync){
      sync.textContent = navigator.onLine ? 'متصل' : 'غير متصل — الحفظ المحلي فعال';
      sync.className='v22-badge '+(navigator.onLine?'v22-ok':'v22-warn');
    }
    if(conflict){
      const n=Number(s.conflicts||0);
      conflict.textContent=String(n);
      conflict.className='v22-badge '+(n?'v22-danger':'v22-ok');
    }
    const b=document.getElementById('v22BackupStatus');
    if(b) b.textContent=s.lastBackup ? new Date(s.lastBackup).toLocaleString() : 'لم يتم التحقق';
    setMsg('اكتمل فحص الحالة الحالية دون تغيير البيانات.');
  };
  GSP.v22ExportSecuritySnapshot=function(){
    const snapshot={
      version:APP_VERSION,
      exportedAt:new Date().toISOString(),
      online:navigator.onLine,
      localStorageKeys:Object.keys(localStorage).length,
      securityState:readState()
    };
    const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='GradeSystem_Security_Snapshot.json';
    a.click();
    URL.revokeObjectURL(a.href);
    const s=readState(); s.lastBackup=new Date().toISOString(); writeState(s);
    v22CheckSecurity();
  };
  GSP.v22RegisterConflict=function(){
    const s=readState(); s.conflicts=Number(s.conflicts||0)+1;
    s.lastConflict=new Date().toISOString(); writeState(s); v22CheckSecurity();
  };
  window.addEventListener('online',v22CheckSecurity);
  window.addEventListener('offline',v22CheckSecurity);
  document.addEventListener('DOMContentLoaded',function(){
    // اللوحة تُعرض فقط لرئيس الكنترول عبر applyRoleUI / updateSecurityPanelsForRole
    const c=document.getElementById('v22SecurityCenter');
    if(c) c.style.display='none';
    v22CheckSecurity();
  });
})();
