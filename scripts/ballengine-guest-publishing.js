/**
 * Extends the ORIGINAL BallEngine Studio Publish tab and /automation overview.
 * No new route/page and no imitation of upstream social OAuth or subscription.
 * Drafts and scheduled reminders are real, durable guest-library records.
 * Actual social posting is manual until the user connects authorized accounts.
 */
(()=>{
  'use strict';
  const API='/api/guest-publishing';
  const DEST={
    youtube:{label:'YouTube Studio',url:'https://studio.youtube.com/'},
    tiktok:{label:'TikTok Upload',url:'https://www.tiktok.com/upload'},
    instagram:{label:'Instagram',url:'https://www.instagram.com/'},
    facebook:{label:'Facebook',url:'https://business.facebook.com/'}
  };
  const css={
    box:'border:1px solid var(--border,#3f3f46);border-radius:14px;padding:16px;margin-top:16px;background:var(--card,rgba(110,110,110,.06));color:var(--foreground,inherit);font:inherit;',
    input:'display:block;box-sizing:border-box;width:100%;border-radius:8px;border:1px solid var(--border,#52525b);padding:9px 10px;background:var(--background,#18181b);color:var(--foreground,#fff);font:inherit;font-size:13px;',
    label:'display:block;font-size:12px;font-weight:600;margin:10px 0 4px;',
    btn:'font:inherit;font-size:12px;font-weight:600;border-radius:8px;padding:8px 12px;border:1px solid var(--border,#52525b);cursor:pointer;color:inherit;background:transparent;',
    line:'display:flex;align-items:center;flex-wrap:wrap;gap:8px;',
    note:'font-size:12px;opacity:.77;line-height:1.55;margin:5px 0 10px;',
    headline:'font-size:15px;font-weight:750;margin:0 0 5px;'
  };

  // Enhance the EXISTING Home mode grid, not a second route or a replacement
  // screen. The original 18 normal cards remain untouched; users can opt in
  // to seeing the 27 experimental cards already present in the Studio menu.
  // This does not claim unfinished features are production ready.
  const experimentalModes=[
    ['Bloom','phase-bloom','phase-bloom','2D','Balls sync their individual rhythms'],
    ['Phonk Drop','phonk-drop','phonk-drop','2D','The ball grows until the beat drops'],
    ['Marble','marble-run','marble-run','2D','Roll through a marble course'],
    ['Race','ball-race','ball-race','2D','Race down a long track'],
    ['Targets','target-hit','target-hit','2D','Hit every target'],
    ['Sand','falling-sand','falling-sand','2D','Sand, water and fire particles'],
    ['Plinko','plinko','plinko','2D','Drop through pegs into scoring bins'],
    ['Colors','color-match','color-match','2D','Shatter matching colors'],
    ['Spin','spin-battle','spin-battle','2D','Spin and stack to fill the silo'],
    ['Lava','lava-survival','lava-survival','2D','Escape the rising hazard'],
    ['Slice 3D','glass-slice','glass-slice','3D','Slice a fruit to each note'],
    ['Flood 3D','flood-fill','flood-fill','3D','Fill a room with rising particles'],
    ['Disks 3D','eulers-disk','eulers-disk','3D','Spinning disks move with the beat'],
    ['Drum 3D','drum-sort','drum-sort','3D','Sort tumbling balls into color bands'],
    ['Plinko 3D','plinko-3d','plinko-3d','3D','Drop through a three-dimensional peg board'],
    ['Chladni 3D','chladni','chladni','3D','Sand patterns follow musical notes'],
    ['Voxels 3D','voxel','voxel','3D','Cube clusters bloom on the beat'],
    ['Domino 3D','domino-3d','domino-3d','3D','Create a domino chain reaction'],
    ['Race 3D','marble-race-3d','marble-race-3d','3D','Marbles compete on a 3D track'],
    ['Attractor 3D','attractor','attractor','3D','Explore a chaotic particle attractor'],
    ['Flow 3D','flow-field',null,'3D','Particle motion and smoke-like streams'],
    ['Blobs 3D','metaballs','metaballs','3D','Liquid blobs merge and split'],
    ['Galaxy 3D','galaxy','galaxy','3D','Stars form a spinning galaxy'],
    ['Fireflies 3D','fireflies','fireflies','3D','Lights synchronize with music'],
    ['Basin 3D','pendulum-basin','pendulum-basin','3D','Magnetic basins form fractals'],
    ['Slime 3D','slime','slime','3D','A living network finds its food'],
    ['Evacuate 3D','crowd-evacuation','crowd-evacuation','3D','Crowds race for the exits']
  ];
  let allModesExpanded=false;
  function homeModeGrid(){
    if(!['/home','/',''].includes(location.pathname.replace(/\/+$/,'')))return null;
    const main=document.querySelector('#root');
    if(!main)return null;
    const title=[...main.querySelectorAll('h2')].find(e=>e.textContent?.trim()==='What do you want to make?');
    const section=title?.closest('section');
    const grid=section?.querySelector('ul.grid');
    if(!grid||grid.querySelectorAll(':scope > li:not([data-be-extra-mode]) a[href^="/studio?mode="]').length!==18)return null;
    return {title,section,grid};
  }
  function extraModeCard(entry){
    const [label,slug,thumb,kind,description]=entry;
    const li=node('li');li.dataset.beExtraMode=slug;
    const a=node('a',null,null,'group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-white/20');
    a.href='/studio?mode='+encodeURIComponent(slug);
    a.setAttribute('aria-label',label+' — experimental mode');
    const media=node('div',null,'position:relative;overflow:hidden;aspect-ratio:4/5;background:linear-gradient(150deg,#111827,#0f172a 55%,#164e63);');
    if(thumb){
      const img=node('img');img.src='/mode-thumbs/'+thumb+'.webp';
      img.alt='';img.loading='lazy';img.decoding='async';
      img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      img.addEventListener('error',()=>{img.remove();});
      media.append(img);
    }else{
      media.append(node('div',label,'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#e2e8f0;font-size:20px;padding:18px;text-align:center;'));
    }
    const mark=node('span','Experimental','position:absolute;z-index:2;top:9px;right:9px;background:rgba(9,9,11,.87);border:1px solid rgba(255,255,255,.2);color:#f4f4f5;border-radius:6px;padding:3px 6px;font-size:10px;font-weight:600;');
    media.append(mark);
    const details=node('div',null,'padding:12px;');
    details.append(node('h3',label,'font-size:14px;font-weight:700;line-height:1.3;'));
    details.append(node('p',description,'font-size:12px;line-height:1.5;opacity:.72;margin-top:5px;'));
    details.append(node('p','In development · '+kind,'font-size:11px;opacity:.67;margin-top:6px;'));
    a.append(media,details);li.append(a);
    return li;
  }
  function enhanceHomeModeCatalog(){
    const view=homeModeGrid();if(!view)return;
    const {section,grid}=view;
    let controls=section.querySelector('[data-be-all-modes-toggle]');
    if(!controls){
      controls=node('div',null,'display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:-3px 0 16px;');
      controls.dataset.beAllModesToggle='1';
      const toggle=button('Show all 45 simulation modes',()=>{
        allModesExpanded=!allModesExpanded;
        enhanceHomeModeCatalog();
      });
      toggle.dataset.beAllModesButton='1';
      toggle.setAttribute('aria-expanded','false');
      controls.append(toggle,node('span','18 regular modes · 27 in development','font-size:12px;opacity:.7;'));
      section.insertBefore(controls,grid);
    }
    const toggle=controls.querySelector('[data-be-all-modes-button]');
    if(toggle){
      toggle.textContent=allModesExpanded?'Show only 18 regular modes':'Show all 45 simulation modes';
      toggle.setAttribute('aria-expanded',String(allModesExpanded));
    }
    const extra=grid.querySelectorAll(':scope > li[data-be-extra-mode]');
    if(!allModesExpanded){
      for(const item of extra)item.remove();
    }else if(extra.length!==experimentalModes.length){
      for(const item of extra)item.remove();
      const fragment=document.createDocumentFragment();
      for(const mode of experimentalModes)fragment.append(extraModeCard(mode));
      grid.append(fragment);
    }
  }
  function node(tag,text,style,cls){
    const e=document.createElement(tag);
    if(text!==null&&text!==undefined)e.textContent=String(text);
    if(style)e.style.cssText=style;
    if(cls)e.className=cls;
    return e;
  }
  function field(label,type,value,placeholder,attrs){
    const outer=node('div');
    const name=node('label',label,css.label);
    const input=node(type==='textarea'?'textarea':'input',null,css.input);
    if(type!=='textarea')input.type=type;
    if(value!==undefined&&value!==null)input.value=value;
    if(placeholder)input.placeholder=placeholder;
    for(const [k,v] of Object.entries(attrs||{}))input[k]=v;
    name.appendChild(input);outer.appendChild(name);
    return {outer,input};
  }
  function button(text,fn,primary=false){
    const e=node('button',text,css.btn+(primary?'background:#0891b2;border-color:#0891b2;color:#fff;':''));
    e.type='button';e.addEventListener('click',fn);return e;
  }
  async function request(path,method='GET',body){
    const options={method,credentials:'same-origin'};
    if(body instanceof FormData)options.body=body;
    else if(body!==undefined){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body);}
    const response=await fetch(API+path,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.message||('HTTP '+response.status));
    return data;
  }
  function readableDate(iso){
    if(!iso)return 'Unscheduled';
    const d=new Date(iso);
    return isNaN(d.getTime())?String(iso):d.toLocaleString();
  }
  function localInput(iso){
    const d=iso?new Date(iso):new Date(Date.now()+3600000);
    const t=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString();
    return t.slice(0,16);
  }
  async function mediaUpload(file){
    if(!file)return null;
    if(!/\.mp4$/i.test(file.name))throw new Error('Select an MP4 (.mp4) video.');
    if(file.size>10*1024*1024)throw new Error('Maximum video size is 10 MB until Cloudflare R2 storage is enabled.');
    const form=new FormData();form.set('file',file);
    return request('/videos','POST',form);
  }
  function findStudioHost(){
    if(!/^\/studio(?:\/|$)/.test(location.pathname))return null;
    const root=document.querySelector('#root');
    if(!root)return null;
    const texts=[...root.querySelectorAll('h1,h2,h3,h4,h5,p,span,div')].filter(e=>e.children.length===0&&e.textContent?.trim()==='Publish a render'&&e.getClientRects().length);
    const heading=texts[0];
    if(!heading)return null;
    let host=heading.parentElement;
    for(let depth=0;host&&depth<8;depth++,host=host.parentElement){
      if(host.tagName==='FORM'||host.tagName==='MAIN')break;
      const s=(host.innerText||'').slice(0,2400);
      if(s.includes('Video source')&&s.includes('Caption / Title')&&s.includes('When')&&host.getBoundingClientRect().width>=265)
        return host;
    }
    return heading.parentElement?.parentElement||null;
  }
  const obsoleteAutomationWarning='Automation is not active on this account, so connecting accounts, scheduling and Autopilot are all switched off. Every plan covers every platform.';
  function automationMain(){
    // All original Automation tabs share the same captured React layout.
    // Only Overview and Publish contain our guest manual posting composer.
    if(!/^\/automation(?:\/(?:accounts|publish|autopilot))?\/?$/.test(location.pathname))return null;
    return document.querySelector('#root main');
  }
  function automationWarning(){
    const main=automationMain();
    if(!main)return null;
    const marked=main.querySelector('[data-be-legacy-automation-warning]');
    if(marked)return marked;
    const message=[...main.querySelectorAll('div,p,span')]
      .find(e=>e.children.length===0&&e.textContent?.trim()===obsoleteAutomationWarning);
    if(!message)return null;
    // This is the original amber subscription-status card, not the
    // surrounding page content or the guest planner.
    const card=message.parentElement?.parentElement?.parentElement;
    if(!card||!card.classList.contains('border'))return null;
    card.dataset.beLegacyAutomationWarning='1';
    return card;
  }
  function findAutomationHost(){
    const main=automationMain();
    if(!main)return null;
    const route=location.pathname.replace(/\/+$/,'');
    // Accounts and Autopilot are DIFFERENT native tabs. Previously the large
    // repeated guest form appeared before their content, making them seem
    // stuck on the Overview screen. Preserve their original content first.
    if(route!=='/automation'&&route!=='/automation/publish')return null;
    return automationWarning()?.parentElement||main;
  }
  function clarifyAutomationStatus(){
    const main=automationMain();
    if(!main)return;
    // The disabled subscription banner still needs accurate guest-mode
    // wording on Accounts and Autopilot, where no planner is rendered.
    // The captured original paid-plan backend doesn't exist on this hosted
    // guest copy. Don't falsely activate that subscription, social OAuth,
    // or automatic delivery. Show the real working manual planner instead.
    const replacements=new Map([
      [obsoleteAutomationWarning,
       'Guest draft scheduling is available in Overview and Publish. Automatic social posting and Autopilot require separately authorized account connections.'],
      ['Connect your socials, schedule ahead and let Autopilot post for you. Included with Creator, Pro, Elite and Agency.',
       'Save publishing drafts and plan when to post videos. Direct social connections and unattended Autopilot posting are not configured in guest mode.'],
      ['No automation on this account','Guest drafts and reminders are available'],
      ['Not active','Auto-publishing off'],
      ['Connecting an account is part of an automation plan. Every plan covers every platform.',
       'Social account connections require official authorization and a publishing backend. Prepare manual posting drafts under Overview or Publish.'],
      ['Autopilot is not part of your current plan.',
       'Automatic posting is not configured. Set manual posting reminders under Overview or Publish.'],
      ['Autopilot posts for you on a rhythm you set once. Growth, Scale and Max include it, and so do Pro, Elite and Agency.',
       'Recurring manual posting reminders are available: choose a video, platforms, and a daily or weekly schedule. Your queue saves the next posting dates, but videos are not uploaded automatically.']
    ]);
    for(const e of main.querySelectorAll('div,p,span')){
      if(e.children.length!==0||e.closest('[data-be-guest-publisher]'))continue;
      const updated=replacements.get(e.textContent?.trim());
      if(updated)e.textContent=updated;
    }
    // Offer a real, working action from the original Autopilot tab, without
    // misrepresenting the unavailable social-account authorization backend.
    if(location.pathname.replace(/\/+$/,'')==='/automation/autopilot'){
      const nativeDescription='Recurring manual posting reminders are available: choose a video, platforms, and a daily or weekly schedule. Your queue saves the next posting dates, but videos are not uploaded automatically.';
      const intro=[...main.querySelectorAll('p,div,span')]
        .find(e=>e.children.length===0&&e.textContent?.trim()===nativeDescription);
      if(intro&&!main.querySelector('[data-be-autopilot-reminder-link]')){
        const go=button('Set recurring posting reminder',()=>{
          const publish=[...main.querySelectorAll('nav[aria-label="Automation"] button')]
            .find(e=>e.textContent?.trim()==='Publish');
          if(publish)publish.click();
          else window.location.assign('/automation/publish');
          window.setTimeout(()=>{
            document.querySelector('#root main [data-be-guest-publisher]')
              ?.scrollIntoView({behavior:'smooth',block:'start'});
          },450);
        },true);
        go.dataset.beAutopilotReminderLink='1';
        go.style.marginTop='12px';
        intro.insertAdjacentElement('afterend',go);
      }
    }
    const card=automationWarning();
    if(card){
      card.dataset.beGuestStatus='manual';
      // The old "See plans" action belongs to the original uncaptured
      // subscription backend. Hide it in the guest-only status banner.
      for(const control of card.querySelectorAll('a,button')){
        if(control.textContent?.trim()==='See plans')control.hidden=true;
      }
    }
  }
  function mount(){
    const studioHost=findStudioHost();
    const host=studioHost||findAutomationHost();
    const route=location.pathname.replace(/\/+$/,'');
    if(!host){
      // When the original React tabs navigate without a full reload, remove
      // a stale form from Accounts/Autopilot instead of covering their UI.
      if(automationMain()){
        for(const item of document.querySelectorAll('#root main [data-be-guest-publisher]'))item.remove();
        clarifyAutomationStatus();
      }
      return;
    }
    const existing=host.querySelector('[data-be-guest-publisher]');
    if(existing){
      const warning=!studioHost?automationWarning():null;
      if(route==='/automation/publish'&&existing.nextElementSibling)host.appendChild(existing);
      else if(route==='/automation'&&warning?.parentElement===host&&existing.nextElementSibling!==warning)
        host.insertBefore(existing,warning);
      clarifyAutomationStatus();return;
    }
    // An existing form might be in the original Publish composer. This is
    // a DIV with buttons type=button, never a nested HTML form.
    const root=node('section',null,css.box);
    root.dataset.beGuestPublisher='1';
    root.setAttribute('aria-label','Guest publishing planner');
    const heading=node('h3','Guest publishing planner · Manual delivery',css.headline);
    const notice=node('p','Save video drafts, schedule real reminders and organize a posting queue. No social accounts are connected to this guest library, so scheduled videos are NOT automatically posted to YouTube, TikTok, Instagram or Facebook.',css.note);
    const form=node('div');
    const title=field('Video title','text','','Title for your video',{maxLength:120});
    const caption=field('Caption','textarea','','Description and hashtags',{maxLength:2000,rows:3});
    const input=field('Optional MP4 upload · max 10 MB','file',undefined,undefined,{accept:'video/mp4,.mp4'});
    const date=field('Posting reminder (your local time)','datetime-local',localInput());
    const rec=node('div');
    const recLabel=node('label','Repeat reminder',css.label);
    const repeat=node('select',null,css.input);
    [['none','Once'],['daily','Daily'],['weekly','Weekly']].forEach(([v,label])=>{const x=node('option',label);x.value=v;repeat.append(x);});
    recLabel.append(repeat);rec.append(recLabel);
    const plat=node('div');
    plat.append(node('div','Platforms to prepare for',css.label));
    const choices=new Map(),platformRow=node('div',null,css.line);
    for(const [id,config] of Object.entries(DEST)){
      const label=node('label',null,'font-size:12px;display:inline-flex;align-items:center;gap:6px;padding:3px 5px;cursor:pointer;');
      const cb=node('input');cb.type='checkbox';cb.value=id;choices.set(id,cb);
      label.append(cb,document.createTextNode(config.label.split(' ')[0]));
      platformRow.append(label);
    }
    plat.append(platformRow);
    form.append(title.outer,caption.outer,plat,input.outer,date.outer,rec);
    const actions=node('div',null,css.line+'margin-top:12px;');
    const message=node('div','',css.note);message.setAttribute('role','status');
    const queue=node('div');
    const queueHeader=node('div',null,css.line+'justify-content:space-between;margin-top:20px;');
    queueHeader.append(node('h4','Your guest posting queue',css.headline));
    let busy=false;
    async function runSave(schedule){
      if(busy)return;busy=true;const initial=[draftBtn,scheduleBtn];
      initial.forEach(b=>b.disabled=true);
      message.textContent='Saving to your private guest library…';
      try{
        const file=input.input.files?.[0];
        const uploaded=file?await mediaUpload(file):null;
        const selected=[...choices.entries()].filter(([id,cb])=>cb.checked).map(([id])=>id);
        if(schedule&&!date.input.value)throw new Error('Choose a time for your reminder.');
        if(schedule&&selected.length===0)throw new Error('Choose at least one platform.');
        const saved=await request('/jobs','POST',{
          title:title.input.value,caption:caption.input.value,
          platforms:selected,scheduleAt:schedule?new Date(date.input.value).toISOString():null,
          repeat:schedule?repeat.value:'none',
          videoAssetId:uploaded?.key??null
        });
        message.textContent=schedule?'Reminder scheduled. Upload the video manually when it becomes ready.':'Draft saved to your private cloud library.';
        title.input.value='';caption.input.value='';input.input.value='';
        await refresh();
      }catch(e){message.textContent='Could not save: '+(e.message||e);}
      finally{busy=false;initial.forEach(b=>b.disabled=false);}
    }
    const draftBtn=button('Save draft',()=>runSave(false));
    const scheduleBtn=button('Schedule reminder',()=>runSave(true),true);
    actions.append(draftBtn,scheduleBtn);
    async function refresh(){
      if(!queue.isConnected)return;
      queue.replaceChildren(node('p','Loading queue…',css.note));
      try{
        const data=await request('/jobs');
        queue.replaceChildren();
        if(!data.jobs.length){queue.append(node('p','No drafts or reminders yet.',css.note));return;}
        for(const job of data.jobs)queue.append(renderJob(job));
      }catch(e){queue.replaceChildren(node('p','Queue unavailable: '+(e.message||e),css.note));}
    }
    function renderJob(job){
      const item=node('article',null,'padding:11px 0;border-bottom:1px solid var(--border,#52525b);display:flex;flex-direction:column;gap:7px;');
      const top=node('div',null,css.line+'justify-content:space-between;');
      const heading=node('strong',job.title,'font-size:13px;overflow-wrap:anywhere;');
      const displayStatus=job.status==='ready'?'Ready to post manually':job.status==='published'?'Manually marked posted':job.status==='scheduled'?'Reminder scheduled':'Draft';
      const status=node('span',displayStatus,'font-size:11px;opacity:.9;');
      top.append(heading,status);
      const secondary=node('p',(job.platforms.join(' / ')||'No platform selected')+' · '+readableDate(job.scheduleAt)+(job.repeat!=='none'?' · '+job.repeat:''),
        'font-size:12px;opacity:.7;');
      const controls=node('div',null,css.line);
      if(job.videoUrl){
        const a=node('a','Download MP4',css.btn+'display:inline-block;text-decoration:none;');
        a.href=job.videoUrl;a.target='_blank';a.rel='noopener noreferrer';a.download=job.title.replace(/[^a-z0-9_-]/gi,'_').slice(0,50)+'.mp4';
        controls.append(a);
      }else if(job.status!=='published'){
        const attach=button('Attach MP4',()=>filePicker.click());
        const filePicker=node('input');filePicker.type='file';filePicker.accept='video/mp4,.mp4';filePicker.hidden=true;
        filePicker.addEventListener('change',async()=>{
          if(!filePicker.files?.length)return;
          try{
            const asset=await mediaUpload(filePicker.files[0]);
            await request('/jobs/'+job.id,'PATCH',{videoAssetId:asset.key});
            await refresh();
          }catch(e){message.textContent='Could not attach video: '+(e.message||e);}
        });
        controls.append(attach,filePicker);
      }
      if(job.caption){
        controls.append(button('Copy caption',async()=>{
          try{
            if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(job.caption);
            message.textContent='Caption copied for manual posting.';
          }catch{
            window.prompt('Copy this caption:',job.caption);
          }
        }));
      }
      for(const p of job.platforms){
        if(!DEST[p])continue;
        const a=node('a','Open '+DEST[p].label,
          css.btn+'display:inline-block;text-decoration:none;');
        a.href=DEST[p].url;a.target='_blank';a.rel='noopener noreferrer';
        a.title='Open this platform; upload your MP4 there manually.';
        controls.append(a);
      }
      if(job.status!=='published'){
        controls.append(button('Change time',async()=>{
          const value=window.prompt('Enter a new date and time (your local timezone):',localInput(job.scheduleAt));
          if(value===null)return;
          try{
            const at=new Date(value);
            if(!Number.isFinite(at.getTime()))throw new Error('Invalid date');
            await request('/jobs/'+job.id,'PATCH',{scheduleAt:at.toISOString()});
            message.textContent='Posting reminder updated.';
            await refresh();
          }catch(e){message.textContent='Cannot change time: '+(e.message||e);}
        }));
        controls.append(button('Mark posted',async()=>{
          if(!window.confirm('Only mark this complete after you have manually uploaded the video to the selected social platforms. This will NOT send the video to those platforms.'))return;
          try{
            const result=await request('/jobs/'+job.id+'/complete','POST',{});
            message.textContent=result.nextReminderId?'Marked complete; next recurring reminder created.':'Manually marked as posted.';
            await refresh();
          }catch(e){message.textContent='Could not mark posted: '+(e.message||e);}
        }));
      }
      controls.append(button('Delete',async()=>{
        if(!window.confirm('Delete this draft/reminder and its unreferenced video from your guest library?'))return;
        try{
          await request('/jobs/'+job.id,'DELETE');
          message.textContent='Posting item deleted.';
          await refresh();
        }catch(e){message.textContent='Could not delete: '+(e.message||e);}
      }));
      item.append(top,secondary,controls);
      return item;
    }
    const refreshBtn=button('Refresh queue',refresh);
    queueHeader.append(refreshBtn);
    root.append(heading,notice,form,actions,message,queueHeader,queue);
    // Insert only inside the existing view. React may remount it; remount
    // is detected without mutating its original components.
    const originalGate=!studioHost?automationWarning():null;
    // On Overview, provide the guest planner immediately. On Publish, show
    // the native original publishing tab FIRST and its guest planner BELOW.
    // Accounts/Autopilot contain no duplicate composer at all.
    if(route==='/automation'&&originalGate?.parentElement===host)host.insertBefore(root,originalGate);
    else host.appendChild(root);
    clarifyAutomationStatus();
    refresh();
  }
  // The original simulation modifies the React tree many times per second;
  // a subtree MutationObserver would waste CPU during exports. Poll lightly
  // only when this page is visible and install promptly after tab clicks.
  function start(){
    mount();
    enhanceHomeModeCatalog();
    document.addEventListener('click',()=>setTimeout(()=>{mount();enhanceHomeModeCatalog();},150),{capture:true});
    setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      if(location.pathname.startsWith('/studio')||automationMain()){
        mount();
        clarifyAutomationStatus();
      }else enhanceHomeModeCatalog();
    },1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  console.info('[BallEngine publishing] Cloud drafts and scheduled manual-posting reminders active; no automatic social delivery.');
})();
