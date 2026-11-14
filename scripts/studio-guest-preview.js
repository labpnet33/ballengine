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

  // The archived Studio shows its onboarding tour and randomization tip on
  // repeat visits because this standalone preview has no upstream user state.
  // Dismiss only these two identifiable popups; leave Studio controls intact.
  const walkthroughPrompts=[
    {title:/^Quick tour\??$/i,detail:/We show you the main buttons\./i},
    {title:/^Shuffle just one part$/i,detail:/Like your video but not the trails\?/i}
  ];
  const suppressedWalkthroughs=new WeakSet();
  function suppressWalkthrough(scope) {
    if(!scope || !scope.querySelectorAll)return;
    const nodes=[];
    if(scope.matches?.('h1,h2,h3,h4,h5,p,span,strong,b,div'))nodes.push(scope);
    nodes.push(...scope.querySelectorAll('h1,h2,h3,h4,h5,p,span,strong,b,div'));
    for(const node of nodes) {
      const title=node.textContent?.trim().replace(/\\s+/g,' ');
      if(!title || title.length>80)continue;
      const prompt=walkthroughPrompts.find(p=>p.title.test(title));
      if(!prompt)continue;
      let card=node;
      for(let depth=0;depth<9&&card.parentElement;depth++) {
        card=card.parentElement;
        if(card===document.body||card.id==='root')break;
        const content=card.textContent||'';
        if(content.length>2500)break;
        if(!prompt.detail.test(content))continue;
        const panel=card.closest('[role="dialog"],[role="tooltip"],[aria-modal="true"],[data-radix-popper-content-wrapper]')||card;
        if(suppressedWalkthroughs.has(panel))break;
        suppressedWalkthroughs.add(panel);
        const buttons=Array.from(panel.querySelectorAll('button,[role="button"]'));
        const dismiss=buttons.find(button=>{
          const label=(button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent||'').trim();
          return /^(?:skip(?: tour)?|close(?: tour)?|dismiss|not now|no thanks|got it|end tour|finish tour|×|✕)$/i.test(label);
        });
        // Hide the targeted tour overlay immediately, before the next paint.
        const overlay=panel.closest('[data-radix-portal],[data-headlessui-portal]')||
          panel.closest('[class*="fixed"][class*="inset-0"]')||panel;
        overlay.style.setProperty('display','none','important');
        overlay.style.setProperty('pointer-events','none','important');
        try {dismiss?.click();}catch {}
        break;
      }
    }
  }
  let walkthroughQueued=false;
  const scheduledScopes=new Set();
  function scheduleWalkthroughCheck(scope) {
    if(scope?.nodeType===1)scheduledScopes.add(scope);
    if(walkthroughQueued)return;
    walkthroughQueued=true;
    queueMicrotask(()=>{
      walkthroughQueued=false;
      for(const node of scheduledScopes)suppressWalkthrough(node);
      scheduledScopes.clear();
    });
  }
  const walkthroughObserver=new MutationObserver(records=>{
    for(const record of records) {
      for(const node of record.addedNodes) {
        if(node.nodeType===1)scheduleWalkthroughCheck(node);
        else if(node.nodeType===3)scheduleWalkthroughCheck(node.parentElement);
      }
    }
  });
  walkthroughObserver.observe(document.documentElement,{childList:true,subtree:true});
  if(document.body)scheduleWalkthroughCheck(document.body);
  else document.addEventListener('DOMContentLoaded',()=>scheduleWalkthroughCheck(document.body),{once:true});
  console.info('[BallEngine preview] Local unrestricted UI guest enabled; backend-dependent premium services are not available from this static capture.');
})();
