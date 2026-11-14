/* Preview-only local guest adapter for the captured BallEngine frontend.
 * Does not authenticate against ballengine.app or unlock subscriptions.
 * The local guest profile and optional UI lock configuration are resolved locally.
 * This does not grant paid entitlements, credits, or access to third-party APIs.
 */
(()=>{
  'use strict';
  const guest=Object.freeze({
    id:'local-preview-guest',
    username:'Preview Guest',
    email:'guest@preview.invalid',
    public_id:'local-preview-guest',
    plan:'FREE',
    is_guest:true,
    can_use_all_modes:false,
    legacy_music_catalog:false,
    is_suspended:false
  });
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
    // the frontend's built-in FREE/Creator/Pro plan rules remain in place.
    if(url.origin===window.location.origin &&
       url.pathname==='/api/ui-locks' && method==='GET'){
      return Promise.resolve(new Response('[]',{
        status:200,
        headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
      }));
    }
    return nativeFetch(input,init);
  };
  console.info('[BallEngine preview] Local FREE guest and empty UI-lock configuration enabled; premium/server features are not emulated.');
})();
