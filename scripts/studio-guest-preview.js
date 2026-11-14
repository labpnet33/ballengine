/* Preview-only local guest adapter for the captured BallEngine frontend.
 * Does not authenticate against ballengine.app or unlock subscriptions.
 * The local preview grants UI-only access to captured controls on this independent site.
 * This does not grant paid entitlements, credits, or access to third-party APIs.
 * Features that require missing private services still need independent implementations.
 */
(()=>{
  'use strict';
  const guest=Object.freeze({
    id:'local-preview-guest',
    username:'Local Studio Guest',
    email:'guest@preview.invalid',
    public_id:'local-preview-guest',
    plan:'ENTERPRISE',
    is_guest:true,
    can_use_all_modes:true,
    legacy_music_catalog:true,
    is_suspended:false
  });
  // Discard previously cached FREE profile so existing preview visitors see the new local settings.
  try { window.localStorage.removeItem('user_profile_cache'); } catch {}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    let url,method;
    try {
      url=new URL(typeof input==='string'?input:input.url,window.location.href);
      method=String((init&&init.method)||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    } catch {return nativeFetch(input,init);}
    if(url.origin===window.location.origin &&
       url.pathname==='/api/auth/me' && method==='GET'){
      return Promise.resolve(new Response(JSON.stringify({user:guest}),{
        status:200,
        headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
      }));
    }
    // Studio's settings panel waits for its UI-lock configuration request to
    // complete. The original private endpoint is not part of the public capture.
    // An empty local configuration means no additional server-defined overrides;
    // the captured frontend now sees a local preview tier for client-only controls.
    if(url.origin===window.location.origin &&
       url.pathname==='/api/ui-locks' && method==='GET'){
      return Promise.resolve(new Response('[]',{
        status:200,
        headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
      }));
    }
    return nativeFetch(input,init);
  };
  console.info('[BallEngine preview] Local unrestricted UI guest enabled; backend-dependent premium services are not available from this static capture.');
})();
