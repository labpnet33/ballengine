/* Preview-only launch panel for two opt-in modes.
 * This is attached outside React's #root. No original 45-mode card,
 * route, handler, or JSX subtree is changed. */
(()=>{
 const enable=()=> {
  if(!document.getElementById('root')||!document.querySelector('[data-be-all-modes-button]'))return;
  if(document.getElementById('be-new-mode-launch'))return;
  const toggle=document.createElement('button');
  toggle.id='be-new-mode-launch';toggle.type='button';toggle.className='be-float';
  toggle.textContent='✦ 2 New Physics Modes';toggle.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');panel.className='be-new-panel';panel.hidden=true;panel.id='be-new-mode-panel';
  panel.innerHTML='<button type="button" aria-label="Close new mode menu">✕</button>'+
    '<h3>New playable modes</h3>'+
    '<a href="/studio?mode=neon-zigzag">✨ Neon Zigzag Beat Rail <small>• Planck 2D</small></a>'+
    '<a href="/studio?mode=prism-chain">💎 Prism Chain Reaction <small>• Rapier 3D</small></a>'+
    '<small>Separate physics engines. Your existing modes stay unchanged.</small>';
  const setOpen=open=>{panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
  toggle.addEventListener('click',()=>setOpen(panel.hidden));
  panel.querySelector('button').addEventListener('click',()=>setOpen(false));
  document.body.append(toggle,panel);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enable,{once:true});else enable();
 const observer=new MutationObserver(()=>{if(!document.getElementById('be-new-mode-launch'))enable();});
 const attach=()=>{const root=document.getElementById('root');if(root)observer.observe(root,{childList:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();
