/* BallEngine independent cloud project storage (guest recovery-key model).
 * Save configs are persisted to our own Cloudflare Worker/D1; the browser
 * capture's original private account APIs are never used.
 * A recovery key is a bearer capability. Treat it like a password.
 */
(()=>{
  'use strict';
  const KEY_NAME='ballengine_cloud_recovery_v1';
  const ENDPOINT='https://ballengine-project-saves.labpnet33.workers.dev';
  const RE_KEY=/^be1_[A-Za-z0-9_-]{43}$/;
  function validKey(value){return typeof value==='string'&&RE_KEY.test(value);}
  function newKey(){
    if(!window.crypto?.getRandomValues)throw new Error('Secure cloud key generation is unavailable.');
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    let raw='';
    for(const byte of bytes)raw+=String.fromCharCode(byte);
    return 'be1_'+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  }
  function recoveryKey(){
    let key=localStorage.getItem(KEY_NAME);
    if(validKey(key))return key;
    key=newKey();
    localStorage.setItem(KEY_NAME,key);
    return key;
  }
  async function clearPreviousCloudIndex(){
    // Project local saves (keys "local_*") MUST NOT be touched.
    try{
      await new Promise(resolve=>{
        const request=indexedDB.open('hypnotic_app_data');
        request.onerror=()=>resolve();
        request.onsuccess=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('simulation_saves')){db.close();resolve();return;}
          const tx=db.transaction('simulation_saves','readwrite');
          const store=tx.objectStore('simulation_saves');
          store.delete('cloud_index');
          store.delete('cloud_index_total');
          tx.oncomplete=()=>{db.close();resolve();};
          tx.onerror=()=>{db.close();resolve();};
          tx.onabort=()=>{db.close();resolve();};
        };
      });
    }catch(err){console.warn('[BallEngine cloud] Could not clear outdated cloud index',err);}
  }
  // The captured frontend calls /api/saves, /api/saves/:id and
  // /api/saves/check-version. Route only these to our independent API.
  // Preserve method/body and expose HTTP failures so the original UI reports
  // failures rather than falsely claiming a project was saved.
  const delegate=window.fetch.bind(window);
  window.fetch=function(input,init){
    let url,method;
    try{
      url=new URL(typeof input==='string'?input:input.url,window.location.href);
      method=String((init&&init.method)||(input instanceof Request&&input.method)||'GET').toUpperCase();
    }catch{return delegate(input,init);}
    // The original capture has no server-side audio catalog or /api/upload.
    // Send only these supported endpoints to our independent Worker and keep
    // all the existing React UI, MIDI parser, audio slicer and file picker.
    const isCloudApi=url.origin===location.origin &&
      (/^\/api\/(?:saves|upload|songs|melodies|song-bank|xmidi|guest-publishing|guest-social)(?:\/|$)/.test(url.pathname)||url.pathname==='/api/storage/usage');
    if(!isCloudApi)return delegate(input,init);
    try{
      const headers=new Headers((init&&init.headers)||(input instanceof Request?input.headers:undefined));
      const isPublicCatalog=/^\/api\/(?:song-bank|xmidi)(?:\/|$)/.test(url.pathname);
      if(!isPublicCatalog)headers.set('Authorization','Bearer '+recoveryKey());
      // A library is identified only by the capability key; never forward
      // the captured site's cookies or any auth headers to our Worker.
      const requestOptions={...init,method,headers,credentials:'omit',mode:'cors',cache:'no-store'};
      const target=ENDPOINT+url.pathname+url.search;
      return delegate(target,requestOptions);
    }catch(error){
      return Promise.reject(error);
    }
  };
  function attachRecoveryActions(){
    const headings=[...document.querySelectorAll('#root h1,#root h2,#root h3,#root h4,#root p,#root span,#root div')]
      .filter(e=>e.childElementCount===0&&e.textContent?.trim()==='Save system');
    for(const heading of headings){
      let parent=heading;
      let host=null;
      for(let i=0;i<5&&parent;i++,parent=parent.parentElement){
        if(parent.matches?.('div.flex.flex-col.gap-3')){host=parent;break;}
      }
      if(!host||host.querySelector('[data-be-cloud-recovery]'))continue;
      const bar=document.createElement('div');
      bar.setAttribute('data-be-cloud-recovery','1');
      bar.className='rounded-lg border border-white/10 bg-white/5 p-2.5 text-xs flex flex-col gap-2';
      const label=document.createElement('div');
      label.className='font-semibold text-zinc-300';
      label.textContent='Cloud library · Recovery key';
      const actions=document.createElement('div');
      actions.className='flex gap-2 flex-wrap';
      const copy=document.createElement('button');
      copy.type='button';copy.className='btn btn-sm border border-white/10 px-2';copy.textContent='Copy cloud key';
      const restore=document.createElement('button');
      restore.type='button';restore.className='btn btn-sm border border-white/10 px-2';restore.textContent='Use existing key';
      const note=document.createElement('p');
      note.className='text-zinc-500 leading-relaxed';
      note.textContent='Cloud projects, uploaded music and guest publishing drafts/reminders sync by this private key. Local-only settings stay on this device.';
      copy.addEventListener('click',async()=>{
        try{
          const key=recoveryKey();
          if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(key);
          copy.textContent='Copied!';
          setTimeout(()=>{if(copy.isConnected)copy.textContent='Copy cloud key';},2000);
        }catch{
          window.prompt('Copy this cloud recovery key and store it safely:',recoveryKey());
        }
      });
      restore.addEventListener('click',async()=>{
        const provided=window.prompt('Paste your cloud recovery key from another device:');
        if(provided===null)return;
        const key=provided.trim();
        if(!validKey(key)){window.alert('Invalid recovery key. Expected a be1_ key.');return;}
        const previous=recoveryKey();
        if(key===previous){window.alert('This cloud library is already active.');return;}
        if(!window.confirm('Switch cloud libraries? Your local project saves stay on this device. Copy your current cloud key first if you need this library later.'))return;
        try{
          localStorage.setItem(KEY_NAME,key);
          await clearPreviousCloudIndex();
          window.location.reload();
        }catch(error){window.alert('Unable to switch cloud library: '+(error?.message||error));}
      });
      actions.append(copy,restore);
      bar.append(label,actions,note);
      host.insertBefore(bar,host.children[1]||null);
    }
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('button');
    if(button&&/^(Saves|Cloud|Local|Preset)$/i.test((button.textContent||'').trim()))
      setTimeout(attachRecoveryActions,120);
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachRecoveryActions,{once:true});
  else attachRecoveryActions();
  // Restore the control after React remounts the existing Saves tab.
  setInterval(()=>{if(document.visibilityState!=='hidden')attachRecoveryActions();},2500);
  console.info('[BallEngine cloud] Guest project sync, private MP3/MIDI uploads and original MIDI catalog available.');
})();
