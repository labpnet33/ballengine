/* Preview-only local guest adapter for the captured BallEngine frontend.
 * Does not authenticate against ballengine.app or unlock subscriptions.
 * All requests other than the local GET /api/auth/me are left untouched.
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
    return nativeFetch(input,init);
  };
  console.info('[BallEngine preview] Local FREE guest identity enabled. Cloud APIs and premium features are not emulated.');
})();
