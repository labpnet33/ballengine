/**
 * Unattended guest publishing worker. This is OUR backend, not BallEngine's
 * upstream paid service. No post is attempted without OAuth + a scheduled job
 * for accounts the guest explicitly selected. Never retry ambiguous uploads:
 * double-posting is worse than a visible "needs review" status.
 */
import {accessToken,providerJSON,invalid} from './social-oauth.mjs';
import {signedMediaUrl} from './music-media.mjs';
const version=env=>env.META_GRAPH_VERSION||'v25.0';
const now=()=>Date.now();
const asB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function videoBytes(db,library,id){
  const item=await db.prepare("SELECT size_bytes FROM media_uploads WHERE library_id=? AND id=? AND mime='video/mp4'")
    .bind(library,id).first();
  if(!item||item.size_bytes>10*1024*1024)throw invalid('MP4 missing or over the 10 MB guest upload limit',422);
  const list=await db.prepare('SELECT data_b64 FROM media_chunks WHERE library_id=? AND asset_id=? ORDER BY chunk_index')
    .bind(library,id).all();
  const data=new Uint8Array(item.size_bytes);let offset=0;
  for(const row of list.results||[]){
    const part=asB64(row.data_b64);
    if(offset+part.length>data.length)throw invalid('Media content is invalid',422);
    data.set(part,offset);offset+=part.length;
  }
  if(offset!==data.length)throw invalid('Media content is incomplete',422);
  return data;
}
async function mark(db,row,status,external=null,error=null,pause=0){
  const timestamp=now();
  await db.prepare("UPDATE guest_social_deliveries SET status=?,external_id=COALESCE(?,external_id),last_error=?,next_attempt_at=?,updated_at=?,published_at=CASE WHEN ?='published' THEN ? ELSE published_at END WHERE id=?")
    .bind(status,external,error?String(error).replace(/(?:Bearer\s+|access_token[=:]\s*)\S+/gi,'[redacted]').slice(0,250):null,
      timestamp+pause,timestamp,status,timestamp,row.id).run();
}
function textError(error){
  if(error?.status===401)return 'Account authorization expired. Reconnect in Accounts.';
  return String(error?.message||'Social platform request failed').slice(0,210);
}
async function sendYoutube(env,job,account,token,bytes){
  // Multipart uploads are supported by videos.insert for our current <=10 MB files.
  const boundary='ballengine_'+crypto.randomUUID().replace(/-/g,'');
  const metadata={snippet:{title:job.title,description:job.caption,categoryId:'22'},
    status:{privacyStatus:'public',selfDeclaredMadeForKids:!!job.youtube_made_for_kids}};
  const start='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
    +JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: video/mp4\r\n\r\n';
  const end='\r\n--'+boundary+'--\r\n';
  const r=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},
    body:new Blob([start,bytes,end]),redirect:'error',signal:AbortSignal.timeout(90000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw invalid('YouTube: '+String(data.error?.message||r.status).slice(0,150),r.status===429?429:502);
  if(!data.id)throw invalid('YouTube upload response could not be verified',502);
  return String(data.id);
}
async function sendFacebook(env,job,account,token,bytes){
  const form=new FormData();
  form.set('access_token',token);
  form.set('title',job.title);
  form.set('description',job.caption);
  form.set('source',new Blob([bytes],{type:'video/mp4'}),'video.mp4');
  const r=await providerJSON('https://graph.facebook.com/'+version(env)+'/'+encodeURIComponent(account.provider_id)+'/videos',{
    method:'POST',body:form});
  if(!r.id)throw invalid('Facebook did not provide a video identifier',502);
  return String(r.id);
}
async function sendInstagram(env,job,account,token){
  const publicWorker=String(env.SOCIAL_WORKER_URL||'');
  if(!publicWorker.startsWith('https://'))throw invalid('Public HTTPS media URL is not configured',503);
  // The existing Cloud Saves media access signature is an unguessable bearer
  // URL, so do not log it or expose it in the social queue. The provider needs
  // fetchable HTTP(S) video bytes to create its Reel container.
  const video=await signedMediaUrl(new Request(publicWorker+'/api/assets/'+job.media_id),job.library_id,job.media_id);
  const url='https://graph.facebook.com/'+version(env)+'/'+encodeURIComponent(account.provider_id)+'/media';
  const result=await providerJSON(url,{method:'POST',
    body:new URLSearchParams({access_token:token,media_type:'REELS',video_url:video,
      caption:job.caption||job.title,share_to_feed:'true'})});
  if(!result.id)throw invalid('Instagram did not create a Reel container',502);
  return String(result.id);
}
async function sendTikTok(env,job,account,token,bytes,db,row){
  const creator=await providerJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
  const options=creator.data?.privacy_level_options||[];
  const privacy=job.tiktok_privacy||'SELF_ONLY';
  if(!options.includes(privacy))throw invalid('TikTok privacy level unavailable for this account; edit and retry',422);
  const initial=await providerJSON('https://open.tiktokapis.com/v2/post/publish/video/init/',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({
      post_info:{title:(job.caption||job.title).slice(0,2200),privacy_level:privacy,
        disable_comment:!job.tiktok_allow_comments,disable_duet:!job.tiktok_allow_duet,
        disable_stitch:!job.tiktok_allow_stitch,video_cover_timestamp_ms:1000},
      source_info:{source:'FILE_UPLOAD',video_size:bytes.length,chunk_size:bytes.length,total_chunk_count:1}
    })});
  const publishId=initial.data?.publish_id,uploadURL=initial.data?.upload_url;
  if(!publishId||!uploadURL)throw invalid('TikTok did not return an upload session',502);
  const check=new URL(uploadURL);
  if(check.protocol!=='https:'||!check.hostname.endsWith('.tiktokapis.com'))
    throw invalid('Unexpected TikTok upload host',502);
  // Save the provider operation ID BEFORE putting the bytes. If the upload
  // times out, cron polls the same operation instead of posting twice.
  await mark(db,row,'processing',publishId,null,60000);
  const r=await fetch(uploadURL,{method:'PUT',
    headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-'+(bytes.length-1)+'/'+bytes.length},
    body:bytes,redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!r.ok)throw invalid('TikTok upload returned HTTP '+r.status,502);
}
async function pollInstagram(env,job,delivery,account,token){
  const result=await providerJSON('https://graph.facebook.com/'+version(env)+'/'+encodeURIComponent(delivery.external_id)+'?'+new URLSearchParams({
    fields:'status_code',access_token:token}));
  if(result.status_code==='ERROR'||result.status_code==='EXPIRED')
    throw invalid('Instagram media processing failed: '+result.status_code,422);
  if(result.status_code!=='FINISHED')return false;
  // media_publish has side effects. Never retry it after ambiguous failure.
  const resultPost=await providerJSON('https://graph.facebook.com/'+version(env)+'/'+encodeURIComponent(account.provider_id)+'/media_publish',{
    method:'POST',body:new URLSearchParams({creation_id:delivery.external_id,access_token:token})});
  if(!resultPost.id)throw invalid('Instagram publish confirmation unavailable',502);
  await mark(env.DB,delivery,'published',String(resultPost.id));
  return true;
}
async function pollTikTok(env,delivery,token){
  const result=await providerJSON('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({publish_id:delivery.external_id})});
  const state=result.data?.status;
  if(state==='FAILED')throw invalid('TikTok rejected upload: '+String(result.data?.fail_reason||'unknown'),422);
  if(state!=='PUBLISH_COMPLETE')return false;
  await mark(env.DB,delivery,'published',delivery.external_id);
  return true;
}
async function finalize(env,id){
  const db=env.DB,job=await db.prepare('SELECT * FROM guest_social_jobs WHERE id=?').bind(id).first();
  if(!job||!['queued','running'].includes(job.status))return;
  const rows=(await db.prepare('SELECT * FROM guest_social_deliveries WHERE job_id=?').bind(id).all()).results||[];
  if(!rows.length)return;
  if(rows.some(r=>['queued','retry','processing','uploading'].includes(r.status)))return;
  const uncertain=rows.some(r=>r.status==='unknown');
  const result=uncertain?'needs_review':rows.every(r=>r.status==='published')?'published':
    rows.some(r=>r.status==='published')?'partial':'failed';
  const t=now();
  const updated=await db.prepare("UPDATE guest_social_jobs SET status=?,completed_at=?,updated_at=?,recurrence_spawned=CASE WHEN repeat_rule!='none' AND ?!='needs_review' THEN 1 ELSE recurrence_spawned END WHERE id=? AND status IN ('queued','running')")
    .bind(result,t,t,result,id).run();
  if(!updated.meta?.changes||job.repeat_rule==='none'||job.recurrence_spawned||uncertain)return;
  const step=job.repeat_rule==='daily'?86400000:604800000;
  let next=job.scheduled_at;
  for(let i=0;i<400&&next<=t+60000;i++)next+=step;
  if(next>t+366*86400000)return;
  const total=await db.prepare('SELECT COUNT(*) n FROM guest_social_jobs WHERE library_id=?').bind(job.library_id).first();
  if(Number(total.n)>=60)return;
  const nextId=crypto.randomUUID(),valid=[];
  for(const row of rows){
    const current=await db.prepare('SELECT id,platform FROM guest_social_accounts WHERE id=? AND library_id=?')
      .bind(row.account_id,job.library_id).first();
    if(current)valid.push(current);
  }
  if(!valid.length)return;
  const actions=[db.prepare('INSERT INTO guest_social_jobs(id,library_id,title,caption,media_id,tiktok_privacy,tiktok_allow_comments,tiktok_allow_duet,tiktok_allow_stitch,youtube_made_for_kids,status,scheduled_at,repeat_rule,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(nextId,job.library_id,job.title,job.caption,job.media_id,job.tiktok_privacy,
      job.tiktok_allow_comments,job.tiktok_allow_duet,job.tiktok_allow_stitch,job.youtube_made_for_kids,
      'queued',next,job.repeat_rule,t,t)];
  for(const a of valid)actions.push(db.prepare('INSERT INTO guest_social_deliveries(id,job_id,library_id,account_id,platform,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),nextId,job.library_id,a.id,a.platform,'queued',next,t,t));
  await db.batch(actions);
}
async function processOne(env,delivery){
  const db=env.DB;
  const job=await db.prepare('SELECT * FROM guest_social_jobs WHERE id=?').bind(delivery.job_id).first();
  const account=await db.prepare('SELECT * FROM guest_social_accounts WHERE id=? AND library_id=?')
    .bind(delivery.account_id,delivery.library_id).first();
  if(!job||!account){
    await mark(db,delivery,'failed',null,'Social account or publishing job was removed');
    if(job)await finalize(env,job.id);
    return;
  }
  if(delivery.status==='uploading'){
    // Worker was terminated after beginning an upload. Destination may have
    // accepted the bytes; leave for human review instead of duplicating.
    await mark(db,delivery,'unknown',null,'Upload interrupted; check your social account before retrying');
    await finalize(env,job.id);return;
  }
  if(delivery.status==='processing'){
    try{
      const token=await accessToken(env,account);
      const done=delivery.platform==='instagram'
        ?await pollInstagram(env,job,delivery,account,token)
        :delivery.platform==='tiktok'?await pollTikTok(env,delivery,token):false;
      if(!done)await mark(db,delivery,'processing',null,null,60000);
    }catch(e){
      // Keep the provider operation ID for investigating delayed processing.
      if([429,502,503].includes(e?.status))await mark(db,delivery,'processing',null,textError(e),180000);
      else await mark(db,delivery,'failed',null,textError(e));
    }
    await finalize(env,job.id);return;
  }
  if(!['queued','retry'].includes(delivery.status))return;
  const timestamp=now();
  const claim=await db.prepare("UPDATE guest_social_deliveries SET status='uploading',attempts=attempts+1,next_attempt_at=?,updated_at=? WHERE id=? AND status IN ('queued','retry')")
    .bind(timestamp+180000,timestamp,delivery.id).run();
  if(!claim.meta?.changes)return;
  let madeCall=false;
  try{
    const token=await accessToken(env,account);
    const bytes=account.platform==='instagram'?null:await videoBytes(db,job.library_id,job.media_id);
    if(account.platform==='youtube'){
      madeCall=true;
      const postId=await sendYoutube(env,job,account,token,bytes);
      await mark(db,delivery,'published',postId);
    }else if(account.platform==='facebook'){
      madeCall=true;
      const postId=await sendFacebook(env,job,account,token,bytes);
      await mark(db,delivery,'published',postId);
    }else if(account.platform==='instagram'){
      madeCall=true;
      const container=await sendInstagram(env,job,account,token);
      await mark(db,delivery,'processing',container,null,60000);
    }else if(account.platform==='tiktok'){
      madeCall=true;
      await sendTikTok(env,job,account,token,bytes,db,delivery);
    }else throw invalid('Unsupported platform',422);
  }catch(e){
    // A request may have reached a provider even when the response is lost.
    // Automatic retries are allowed only for failures before ANY posting call.
    const problem=textError(e);
    const wasSaved=await db.prepare('SELECT status,external_id FROM guest_social_deliveries WHERE id=?')
      .bind(delivery.id).first();
    if(wasSaved?.status==='processing'){
      await mark(db,delivery,'processing',null,problem,60000);
    }else if(!madeCall&&e?.status===429&&delivery.attempts<3){
      await mark(db,delivery,'retry',null,problem,300000);
    }else await mark(db,delivery,madeCall&&!([400,401,403,422].includes(e?.status))?'unknown':'failed',null,problem);
  }
  await finalize(env,job.id);
}
/** Call this from a Cloudflare Cron Trigger every minute, with a separate
 * SOCIAL_CRON_ENABLED=true flag after validation and OAuth setup. */
export async function runSocialSchedule(env){
  if(env.SOCIAL_CRON_ENABLED!=='true'||!env.DB||!env.SOCIAL_TOKEN_SECRET)return {processed:0,disabled:true};
  const queue=(await env.DB.prepare(
    "SELECT * FROM guest_social_deliveries WHERE status IN ('queued','retry','processing','uploading') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 8")
    .bind(now()).all()).results||[];
  for(const row of queue){
    try{await processOne(env,row);}
    catch(e){console.error('Guest social queue unexpected exception',row.platform,e?.name||'Error');}
  }
  return {processed:queue.length,disabled:false};
}
