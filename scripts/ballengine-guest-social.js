/* Add real guest-owned social publishing tools INSIDE the captured Automation tabs.
 * No new pages, no paid-plan spoofing, and no direct provider calls from the
 * browser. OAuth, tokens, scheduling and uploads are handled by our Worker.
 */
(()=>{
  'use strict';
  const BASE='/api/guest-social',MEDIA='/api/guest-publishing/videos';
  const PLATFORMS={youtube:'YouTube',instagram:'Instagram',facebook:'Facebook Page',tiktok:'TikTok'};
  const css={
    panel:'box-sizing:border-box;margin:18px 0;padding:18px;border:1px solid rgba(148,163,184,.25);border-radius:16px;background:rgba(24,24,27,.8);color:#e4e4e7;font:inherit;line-height:1.5;',
    card:'padding:12px;border:1px solid rgba(148,163,184,.2);border-radius:10px;margin:10px 0;background:rgba(255,255,255,.025);',
    row:'display:flex;gap:10px;align-items:center;flex-wrap:wrap;',
    input:'width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(148,163,184,.4);border-radius:9px;background:#18181b;color:#fff;font-size:13px;',
    button:'padding:9px 13px;border-radius:9px;border:1px solid rgba(148,163,184,.4);background:#27272a;color:#f4f4f5;cursor:pointer;font:inherit;font-size:12px;font-weight:650;',
    primary:'padding:9px 13px;border-radius:9px;border:1px solid #0891b2;background:#0891b2;color:white;cursor:pointer;font:inherit;font-size:12px;font-weight:700;',
    small:'font-size:12px;color:#a1a1aa;margin:7px 0;',
    label:'display:block;font-size:12px;font-weight:650;margin:12px 0 5px;'
  };
  const create=(tag,text,style)=>{
    const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);
    if(style)e.style.cssText=style;return e;
  };
  const heading=(v)=>create('h3',v,'font-size:17px;font-weight:750;margin:0 0 8px;');
  const line=(v)=>create('p',v,css.small);
  const btn=(title,fn,primary=false)=>{
    const el=create('button',title,primary?css.primary:css.button);el.type='button';el.addEventListener('click',fn);return el;
  };
  const link=(href,title)=>{
    const a=create('a',title,'color:#22d3ee;text-decoration:underline;font-size:12px;');
    a.href=href;return a;
  };
  const field=(label,tag='input',type='text',placeholder='')=>{
    const wrap=create('label',null,css.label),text=create('span',label);
    const input=create(tag,null,css.input);if(tag==='input')input.type=type;
    if(placeholder)input.placeholder=placeholder;
    input.style.marginTop='6px';wrap.append(text,input);return {wrap,input};
  };
  async function request(path,method='GET',data){
    const config={method,credentials:'same-origin',cache:'no-store'};
    if(data instanceof FormData)config.body=data;
    else if(data!==undefined){config.headers={'Content-Type':'application/json'};config.body=JSON.stringify(data);}
    const r=await fetch(path.startsWith('/api/')?path:BASE+path,config);
    const result=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(result.error||result.message||'HTTP '+r.status);
    return result;
  }
  const state={accounts:[],jobs:[],status:null,active:'',busy:false};
  const standardError=e=>String(e?.message||e||'Unknown error').slice(0,220);
  function route(){
    const p=location.pathname.replace(/\/+$/,'');
    if(p==='/automation')return 'overview';
    const hit=/^\/automation\/(accounts|publish|autopilot)$/.exec(p);
    return hit?hit[1]:'';
  }
  function host(){
    return document.querySelector('#root main');
  }
  async function refresh(){
    const [status,accounts,jobs]=await Promise.all([
      request('/status'),request('/accounts'),request('/jobs')
    ]);
    state.status=status;state.accounts=accounts.accounts||[];state.jobs=jobs.jobs||[];
  }
  function banner(){
    const card=document.querySelector('#root main [data-be-legacy-automation-warning]');
    if(!card||!state.status)return;
    const msg=[...card.querySelectorAll('div,p,span')]
      .find(x=>x.children.length===0&&/Guest draft scheduling is available|Guest social publishing is available/.test(x.textContent||''));
    if(!msg)return;
    if(state.accounts.length&&state.status.schedulerConfigured)
      msg.textContent='Guest social publishing is enabled for your connected accounts. Your scheduled jobs will be processed by the publishing worker.';
    else if(state.status.schedulerConfigured)
      msg.textContent='Guest publishing is free. Connect and authorize a social account to enable automatic posting and Autopilot.';
    else msg.textContent='Guest publishing access is free. Automatic posting requires OAuth app configuration and an enabled scheduling worker.';
    card.dataset.beGuestStatus=state.status.schedulerConfigured?'automation':'setup';
  }
  function summary(parent){
    const pending=state.jobs.filter(j=>['queued','running'].includes(j.status)).length;
    const success=state.jobs.filter(j=>j.status==='published').length;
    const failed=state.jobs.filter(j=>['partial','failed','needs_review'].includes(j.status)).length;
    const bar=create('div',null,css.row);
    for(const [label,count] of [['Connected accounts',state.accounts.length],['Queued',pending],['Published',success],['Needs attention',failed]]){
      const tile=create('div',null,'flex:1 1 105px;padding:12px;border:1px solid #3f3f46;border-radius:10px;min-width:95px;');
      tile.append(create('div',String(count),'font-size:22px;font-weight:750;'),line(label));bar.append(tile);
    }
    parent.append(bar);
    const actions=create('div',null,css.row+';margin-top:12px;');
    actions.append(link('/automation/accounts','Manage accounts'),link('/automation/publish','Publish a video'),link('/automation/autopilot','View Autopilot'));
    parent.append(actions);
    parent.append(line('Social publishing is guest-accessible; each platform account still needs its own OAuth permission.'));
    if(!state.status?.schedulerConfigured)
      parent.append(line('Setup required: the cloud publishing backend or scheduler is not enabled yet. Scheduled videos will not be delivered until configured.'));
    const recent=state.jobs.slice(0,6);if(recent.length){
      parent.append(create('h4','Recent publishing activity','font-weight:700;margin:16px 0 8px;'));
      for(const j of recent){
        const item=create('div',null,css.card);
        item.append(create('div',j.title+' · '+j.status,'font-size:13px;font-weight:650;'));
        item.append(line(new Date(j.scheduledAt).toLocaleString()+' · '+j.deliveries.map(d=>d.platform+': '+d.status).join(' | ')));
        parent.append(item);
      }
    }
  }
  function accounts(parent){
    parent.append(heading('Connect your own social accounts'));
    parent.append(line('No subscription is required. Sign in through the official platform consent page. BallEngine never asks for your social password.'));
    for(const [platform,label] of Object.entries(PLATFORMS)){
      const card=create('div',null,css.card),top=create('div',null,css.row);
      top.append(create('strong',label,'font-size:13px;flex:1 1 110px;'));
      const configured=state.status?.providers?.[platform]?.configured;
      const connect=btn('Connect '+label,async()=>{
        if(!configured){
          const keys={youtube:'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',instagram:'META_APP_ID and META_APP_SECRET',facebook:'META_APP_ID and META_APP_SECRET',tiktok:'TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET'};
          const message='Guest access is free. '+label+' requires official OAuth authorization. Configure '+keys[platform]+' and SOCIAL_TOKEN_SECRET in your Cloudflare Worker, then reconnect.';
          card.querySelector('[data-be-connect-help]')?.remove();
          const help=line(message);help.dataset.beConnectHelp='1';help.setAttribute('role','status');card.append(help);
          return;
        }
        try{
          connect.disabled=true;connect.textContent='Opening authorization…';
          const data=await request('/connect/'+platform,'POST',{});
          if(!data.authorizationUrl)throw new Error('Missing platform authorization link');
          window.location.assign(data.authorizationUrl);
        }catch(e){window.alert('Could not connect '+label+': '+standardError(e));connect.disabled=false;connect.textContent='Connect '+label;}
      },true);
      if(!configured)connect.title='Click for official OAuth configuration requirements; guests do not need a subscription.';
      top.append(connect);card.append(top);
      const linked=state.accounts.filter(a=>a.platform===platform);
      if(!linked.length)card.append(line(configured?'No account connected':'Platform application credentials need to be configured.'));
      for(const account of linked){
        const entry=create('div',null,css.row+';margin-top:10px;');
        entry.append(create('span',account.name+' · '+account.status,'font-size:12px;flex:1 1 140px;'));
        entry.append(btn('Disconnect',async()=>{
          if(!window.confirm('Disconnect '+account.name+'? Unsent jobs to this account will be cancelled.'))return;
          try{await request('/accounts/'+account.id,'DELETE');await reloadPanel();}
          catch(e){window.alert(standardError(e));}
        }));
        card.append(entry);
      }
      parent.append(card);
    }
    if(new URLSearchParams(location.search).get('social')==='failed')
      parent.append(line('Last authorization failed. Check that platform app permissions and callback URLs are configured.'));
    if(new URLSearchParams(location.search).get('social')==='connected')
      parent.append(line('Account authorization completed. You can now select it under Publish.'));
  }
  // The captured React Accounts tab still uses the original subscription
  // backend. Its platform cards lead to /automation/plan. Hide those cards
  // when OUR guest OAuth controls render and keep the existing page shell.
  function retireNativePlanControls(tab,main,panel){
    const nav=main?.querySelector('nav[aria-label="Automation"]');
    if(nav)for(const button of nav.querySelectorAll('button')){
      if(button.getAttribute('data-tour')==='auto-tab-plan'||button.textContent.trim()==='Plan'){
        button.hidden=true;button.style.display='none';
      }
    }
    for(const button of main?.querySelectorAll('header button')||[]){
      if(/^(See plans|Change plan)$/i.test(button.textContent.trim())){
        button.hidden=true;button.style.display='none';
      }
    }
    if(tab!=='accounts')return;
    const native=main.querySelector('[data-tour="auto-accounts"]');
    if(native){
      native.hidden=true;native.style.display='none';
      native.setAttribute('aria-hidden','true');
      native.dataset.beReplacedByGuestOAuth='1';
      if(native.parentElement&&panel!==native.previousElementSibling)
        native.insertAdjacentElement('beforebegin',panel);
    }
    for(const el of main.querySelectorAll('p,div,span')){
      if(el.children.length||el.closest('[data-be-social-panel]'))continue;
      if(/^(Connecting an account is part of an automation plan|Social account connections require official authorization and a publishing backend)/.test(el.textContent.trim()))
        el.textContent='Guest accounts are free. Connect platforms below using official OAuth authorization.';
    }
  }
  // Capture-phase fallback: an original Connect click must not reach the
  // upstream React subscription navigation before our panel replaces it.
  document.addEventListener('click',event=>{
    if(location.pathname.replace(/\/+$/,'')!=='/automation/accounts')return;
    const target=event.target;
    if(!(target instanceof Element))return;
    const native=target.closest('[data-tour="auto-accounts"]');
    const originalButton=target.closest('button');
    if(!native||!originalButton||!/^(Connect|Reconnect|No slots left)$/i.test(originalButton.textContent.trim()))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const row=[...native.children].find(el=>el.contains(originalButton));
    const name=(row?.querySelector('p.t-h4')?.textContent||'').toLowerCase();
    const platform=Object.keys(PLATFORMS).find(key=>name.includes(key));
    const panel=document.querySelector('#root main [data-be-social-panel]');
    const action=platform&&[...(panel?.querySelectorAll('button')||[])]
      .find(b=>b.textContent.trim()==='Connect '+PLATFORMS[platform]);
    if(action)action.click();
    else panel?.scrollIntoView({behavior:'smooth',block:'start'});
  },true);
  function publish(parent){
    parent.append(heading('Publish directly or schedule automatically'));
    parent.append(line('Upload an MP4 (up to 10 MB), select your connected accounts, and explicitly approve publishing. The existing manual draft planner remains available below.'));
    const linked=state.accounts.filter(a=>a.status==='connected');
    if(!state.status?.schedulerConfigured)
      parent.append(line('Automatic posting is not ready yet: the administrator must activate the Cloudflare publishing scheduler and platform integrations.'));
    if(!linked.length){
      parent.append(link('/automation/accounts','Connect an account to enable publishing'));return;
    }
    const form=create('div',null,css.card);
    const title=field('Video title'),caption=field('Description / caption','textarea');
    caption.input.rows=3;
    const video=field('MP4 video (max 10 MB)','input','file');
    video.input.accept='.mp4,video/mp4';
    const accountsLabel=create('p','Select destination accounts',css.label),options=create('div',null,css.row),checks=[];
    for(const a of linked){
      const label=create('label',null,'font-size:12px;display:flex;align-items:center;gap:5px;');
      const checkbox=create('input');checkbox.type='checkbox';checkbox.value=a.id;
      label.append(checkbox,create('span',PLATFORMS[a.platform]+': '+a.name));checks.push({input:checkbox,account:a});options.append(label);
    }
    const sched=field('Schedule at (leave empty to publish on the next queue run)','input','datetime-local');
    const repeat=field('Autopilot recurrence','select');
    for(const [val,text] of [['none','One time'],['daily','Every day'],['weekly','Every week']]){
      const op=create('option',text);op.value=val;repeat.input.append(op);
    }
    const privacy=field('TikTok visibility (choose explicitly)','select');
    const creatorInfo=line('Select a TikTok account to load its latest posting permissions.');
    const effects=create('div',null,css.row+';margin:10px 0;');
    const interactions={};
    for(const key of ['comment','duet','stitch']){
      const label=create('label',null,'font-size:12px;display:flex;gap:6px;align-items:center;');
      const input=create('input');input.type='checkbox';input.checked=false;
      label.append(input,create('span','Allow '+key));effects.append(label);interactions[key]=input;
    }
    const made=field('YouTube audience','select');
    for(const [val,text] of [['','Select the audience'],['no','Not made for kids'],['yes','Made for kids']]){
      const op=create('option',text);op.value=val;made.input.append(op);
    }
    privacy.wrap.hidden=true;effects.hidden=true;creatorInfo.hidden=true;made.wrap.hidden=true;
    let activeTikTokInfo=[],lookupVersion=0;
    const fillPrivacy=(values)=>{
      privacy.input.replaceChildren();
      const empty=create('option','Choose visibility');empty.value='';privacy.input.append(empty);
      for(const value of values){
        const label={SELF_ONLY:'Only me',PUBLIC_TO_EVERYONE:'Public',FOLLOWER_OF_CREATOR:'Followers',MUTUAL_FOLLOW_FRIENDS:'Friends'}[value]||value;
        const op=create('option',label);op.value=value;privacy.input.append(op);
      }
      privacy.input.value='';
    };
    fillPrivacy([]);
    const updateDestinations=async()=>{
      const tik=checks.filter(c=>c.input.checked&&c.account.platform==='tiktok');
      const on=!!tik.length;
      privacy.wrap.hidden=!on;effects.hidden=!on;creatorInfo.hidden=!on;
      made.wrap.hidden=!checks.some(c=>c.input.checked&&c.account.platform==='youtube');
      for(const control of Object.values(interactions))control.checked=false;
      const version=++lookupVersion;
      activeTikTokInfo=[];fillPrivacy([]);
      if(!on)return;
      creatorInfo.textContent='Checking latest TikTok creator settings…';
      try{
        const infos=await Promise.all(tik.map(c=>request('/tiktok/creator-info/'+c.account.id)));
        if(version!==lookupVersion)return;
        activeTikTokInfo=infos;
        const options=infos.map(x=>x.privacyOptions||[]);
        const shared=options[0].filter(x=>options.every(array=>array.includes(x)));
        fillPrivacy(shared);
        interactions.comment.disabled=infos.some(x=>x.commentDisabled);
        interactions.duet.disabled=infos.some(x=>x.duetDisabled);
        interactions.stitch.disabled=infos.some(x=>x.stitchDisabled);
        creatorInfo.textContent='TikTok creator: '+infos.map(x=>x.name).join(', ')+'. Choose a visibility level and optional interactions; none are selected by default.';
      }catch(e){if(version===lookupVersion){creatorInfo.textContent='Could not retrieve creator permissions: '+standardError(e);activeTikTokInfo=[];}}
    };
    for(const c of checks)c.input.addEventListener('change',()=>{void updateDestinations();});
    const approval=create('label',null,'display:flex;align-items:start;gap:9px;font-size:12px;margin:16px 0;');
    const consent=create('input');consent.type='checkbox';
    approval.append(consent,create('span','I authorize BallEngine to post this video to the selected social accounts at the requested time and recurrence.'));
    const submit=btn('Queue automatic post',async()=>{
      const chosen=checks.filter(c=>c.input.checked);
      try{
        if(!state.status?.schedulerConfigured)throw new Error('Publishing scheduler is not configured');
        if(!chosen.length)throw new Error('Select at least one connected account');
        if(!video.input.files?.[0])throw new Error('Select an MP4 video file');
        if(!/\.mp4$/i.test(video.input.files[0].name)||video.input.files[0].size>10*1024*1024)
          throw new Error('Select an MP4 video smaller than 10 MB');
        if(!title.input.value.trim())throw new Error('Enter a video title');
        if(chosen.some(c=>c.account.platform==='youtube')&&!made.input.value)
          throw new Error('Choose the YouTube audience');
        const tk=chosen.some(c=>c.account.platform==='tiktok');
        if(tk&&(!activeTikTokInfo.length||!privacy.input.value))
          throw new Error('Choose TikTok visibility from the latest creator settings');
        if(tk){
          const maxDuration=Math.min(...activeTikTokInfo.map(x=>Number(x.maxVideoSeconds)||Infinity));
          if(Number.isFinite(maxDuration)){
            const duration=await new Promise(resolve=>{
              const v=document.createElement('video'),url=URL.createObjectURL(video.input.files[0]);
              let settled=false;
              const done=value=>{if(settled)return;settled=true;URL.revokeObjectURL(url);v.removeAttribute('src');v.load();resolve(value);};
              v.preload='metadata';v.onloadedmetadata=()=>done(v.duration);v.onerror=()=>done(null);
              setTimeout(()=>done(null),8000);v.src=url;
            });
            if(Number.isFinite(duration)&&duration>maxDuration)
              throw new Error('Video exceeds the TikTok creator duration limit of '+maxDuration+' seconds');
          }
        }
        if(!consent.checked)throw new Error('Approve direct publishing before continuing');
        submit.disabled=true;submit.textContent='Uploading and scheduling…';
        const upload=new FormData();upload.set('file',video.input.files[0]);
        const asset=await request(MEDIA,'POST',upload);
        const scheduleAt=sched.input.value?new Date(sched.input.value).toISOString():null;
        const job=await request('/jobs','POST',{
          title:title.input.value.trim(),caption:caption.input.value,
          videoAssetId:asset.key,accountIds:chosen.map(c=>c.account.id),scheduleAt,
          repeat:repeat.input.value,tiktokPrivacy:privacy.input.value,
          tiktokAllowComment:!!interactions.comment.checked,tiktokAllowDuet:!!interactions.duet.checked,
          tiktokAllowStitch:!!interactions.stitch.checked,
          youtubeMadeForKids:made.input.value==='yes',consent:true
        });
        window.alert('Video added to the automatic posting queue for '+new Date(job.scheduledAt).toLocaleString()+'.');
        await reloadPanel();
      }catch(e){window.alert('Could not queue video: '+standardError(e));}
      finally{submit.disabled=false;submit.textContent='Queue automatic post';}
    },true);
    for(const part of [title.wrap,caption.wrap,video.wrap,accountsLabel,options,sched.wrap,repeat.wrap,creatorInfo,privacy.wrap,effects,made.wrap,approval,submit])form.append(part);
    parent.append(form);
  }
  function queue(parent,onlyRecurring=false){
    parent.append(heading(onlyRecurring?'Autopilot · Recurring social posts':'Automatic publishing history'));
    parent.append(line('Automatic posts run on the cloud scheduler after account authorization. An uncertain upload is flagged for review rather than uploaded twice.'));
    if(onlyRecurring)parent.append(link('/automation/publish','Configure a daily or weekly post from Publish'));
    const jobs=state.jobs.filter(x=>!onlyRecurring||x.repeat!=='none');
    if(!jobs.length){parent.append(line('No '+(onlyRecurring?'recurring':'automatic')+' publishing jobs yet.'));return;}
    for(const j of jobs.slice(0,40)){
      const box=create('div',null,css.card);
      box.append(create('div',j.title+' · '+j.status,'font-weight:700;font-size:13px;'));
      box.append(line('Scheduled '+new Date(j.scheduledAt).toLocaleString()+' · '+j.repeat));
      for(const d of j.deliveries){
        box.append(line(PLATFORMS[d.platform]+': '+d.account+' — '+d.status+
          (d.error?' · '+d.error:'')+(d.externalId?' · provider ID '+d.externalId:'')));
      }
      const actions=create('div',null,css.row);
      if(['queued','running'].includes(j.status)&&!j.deliveries.some(x=>['uploading','processing','published','unknown'].includes(x.status))){
        actions.append(btn('Cancel queued job',async()=>{
          if(!window.confirm('Cancel this queued publication?'))return;
          try{await request('/jobs/'+j.id+'/cancel','POST',{});await reloadPanel();}
          catch(e){window.alert(standardError(e));}
        }));
      }
      if(['failed','partial'].includes(j.status)){
        actions.append(btn('Retry confirmed failures',async()=>{
          try{await request('/jobs/'+j.id+'/retry','POST',{});await reloadPanel();}
          catch(e){window.alert(standardError(e));}
        }));
      }
      if(j.deliveries.some(x=>x.status==='unknown'))
        box.append(line('Review the destination account before retrying manually. The provider response could not be verified.'));
      box.append(actions);parent.append(box);
    }
  }
  function render(panel,tab){
    panel.replaceChildren();
    panel.append(heading('Guest social publishing · Full access'));
    if(tab==='accounts')accounts(panel);
    else if(tab==='publish'){publish(panel);queue(panel);}
    else if(tab==='autopilot')queue(panel,true);
    else{summary(panel);queue(panel);}
    retireNativePlanControls(tab,host(),panel);
    banner();
  }
  async function reloadPanel(){
    const tab=route(),main=host();if(!tab||!main)return;
    let panel=main.querySelector('[data-be-social-panel]');
    if(!panel){panel=create('section',null,css.panel);panel.dataset.beSocialPanel='1';main.append(panel);}
    retireNativePlanControls(tab,main,panel);
    try{
      await refresh();
      if(!panel.isConnected||route()!==tab)return;
      render(panel,tab);
    }catch(e){
      retireNativePlanControls(tab,main,panel);
      panel.replaceChildren(heading('Guest social publishing'));
      panel.append(line('Publishing backend is not ready: '+standardError(e)));
      panel.append(line('The existing manual draft and reminder functionality remains available.'));
    }
  }
  let prev='',loading=false;
  async function check(){
    if(location.pathname.replace(/\/+$/,'')==='/automation/plan'){
      window.location.replace('/automation/accounts');
      return;
    }
    const tab=route(),main=host();
    if(!tab||!main){prev='';return;}
    const panel=main.querySelector('[data-be-social-panel]');
    if(panel)retireNativePlanControls(tab,main,panel);
    const key=tab+'|'+(main.querySelector('[data-be-social-panel]')?'ready':'missing');
    if(key===prev||loading)return;
    prev=key;loading=true;
    try{await reloadPanel();}finally{loading=false;prev=tab+'|ready';}
  }
  document.addEventListener('DOMContentLoaded',check);
  window.addEventListener('popstate',()=>{prev='';check();});
  // Original React Router uses history.pushState without a popstate event.
  // Lightweight route detection only; no mutation observer on the 3D canvas.
  setInterval(check,900);
  check();
  console.info('[BallEngine] Guest OAuth publishing UI loaded; no subscription required, provider consent is mandatory.');
})();
