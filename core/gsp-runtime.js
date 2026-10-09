/** GSP compatibility namespace: the only bridge allowed to proxy application globals. */
(function(global){
  if(global.GSP&&global.GSP.__gspRuntime)return;
  const bridge=new Proxy(global,{get:(t,k)=>t[k],set:(t,k,v)=>(t[k]=v,true),has:(t,k)=>k in t});
  bridge.__gspRuntime=true; global.GSP=bridge;
})(window);
