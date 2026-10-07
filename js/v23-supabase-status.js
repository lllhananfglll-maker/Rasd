(function(){
  GSP.GRADE_SYSTEM_SUPABASE = GSP.GRADE_SYSTEM_SUPABASE || {};
  GSP.GRADE_SYSTEM_SUPABASE.check = async function(){
    const cfg = GSP.GRADE_SYSTEM_SUPABASE;
    if(!cfg.url || !cfg.publishableKey) return {ok:false, reason:'missing-config'};

    // The state table is protected by RLS and requires a real Supabase session.
    // Do not issue an anonymous REST request just to discover that fact (401).
    // This keeps the console/network clean while preserving the correct security model.
    try{
      const client = GSP.supabaseClient;
      if (client && client.auth && typeof client.auth.getSession === 'function') {
        const sessionResult = await client.auth.getSession();
        const session = sessionResult && sessionResult.data && sessionResult.data.session;
        if (!session) {
          return {ok:false, reachable:true, authorized:false, status:401, reason:'not-authenticated'};
        }
        const r = await fetch(cfg.url + '/rest/v1/grade_system_state?select=id&limit=1', {
          headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + session.access_token }
        });
        return {ok:r.ok, reachable:true, authorized:r.status !== 401 && r.status !== 403, status:r.status};
      }

      return {ok:false, reachable:true, authorized:false, status:401, reason:'not-authenticated'};
    }catch(e){
      return {ok:false, reachable:false, authorized:false, reason:e.message};
    }
  };
  document.addEventListener('DOMContentLoaded', async function(){
    // اللوحة مخفية افتراضياً؛ تُظهرها applyRoleUI لرئيس الكنترول فقط
    const p=document.getElementById('v23SupabasePanel');
    if(p) p.style.display='none';
    const result=await GSP.GRADE_SYSTEM_SUPABASE.check();
    const badge=p && p.querySelector('.v22-sec-grid > div:nth-child(1) .v22-badge');
    if (typeof GSP.ensureCloudSession === 'function') {
      try { await GSP.ensureCloudSession({force:true}); } catch(e) {}
    }
    const sessionState = typeof GSP.getCloudSessionState === 'function' ? GSP.getCloudSessionState() : null;
    if(badge && result.ok && (!sessionState || sessionState.authenticated)){
      badge.textContent='متصل ومصادق عليه';
      badge.className='v22-badge v22-ok';
    }else if(badge && result.reachable){
      badge.textContent = 'الخادم متاح — يلزم تسجيل الدخول السحابي للمزامنة';
      badge.className='v22-badge v22-warn';
    }else if(badge){
      badge.textContent='تعذر اختبار الاتصال';
      badge.className='v22-badge v22-warn';
    }
  });
})();
