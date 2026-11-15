/**
 * Guest-owned social posting API for the existing BallEngine Automation tabs.
 * Intentionally distinct from the original manual guest planner so it never
 * changes or corrupts existing drafts, queue rows, or saved Studio projects.
 */
import {providerReadiness,beginOAuth,oauthCallback,listAccounts,disconnectAccount,accessToken,providerJSON,invalid} from './social-oauth.mjs';
import {runSocialSchedule} from './social-publish.mjs';
const ID=/^[0-9a-f-]{36}$/i;
const platforms=new Set(['youtube','instagram','facebook','tiktok']);
const repeats=new Set(['none','daily','weekly']);
const privacies=new Set(['SELF_ONLY','FOLLOWER_OF_CREATOR','MUTUAL_FOLLOW_FRIENDS','PUBLIC_TO_EVERYONE']);
const encoder=new TextEncoder();
export const isGuestSocial=path=>path==='/api/guest-social'||path.startsWith('/api/guest-social/');
export const isGuestSocialCallback=path=>/^\/api\/guest-social\/oauth\/callback\/(?:youtube|instagram|facebook|tiktok)$/.test(path);
export {oauthCallback,runSocialSchedule};
function str(input,max=2000){
  if(typeof input!=='string'||input.trim().length>max)return null;
  return input.trim();
}
async function body(req){
  if(Number(req.headers.get('Content-Length')||0)>12000)throw invalid('Social request too large',413);
  const t=await req.text();
  if(encoder.encode(t).length>12000)throw invalid('Social request too large',413);
  let parsed;
  try{parsed=JSON.parse(t||'{}');}catch{throw invalid('Invalid social JSON');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw invalid('Invalid social request');
  return parsed;
}
function scheduled(value){
  if(!value)return Date.now()+1000;
  const t=typeof value==='number'?value:Date.parse(value);
  if(!Number.isFinite(t)||t<Date.now()+120000||t>Date.now()+366*86400000)
    throw invalid('Schedule at least two minutes and at most one year in the future');
  return Math.round(t);
}
async function socialJobs(env,library){
  const jobs=(await env.DB.prepare('SELECT * FROM guest_social_jobs WHERE library_id=? ORDER BY created_at DESC LIMIT 70')
    .bind(library).all()).results||[];
  if(!jobs.length)return {jobs:[],total:0};
  const ids=jobs.map(x=>x.id);
  const deliveries=(await env.DB.prepare(
    'SELECT d.*,a.display_name FROM guest_social_deliveries d LEFT JOIN guest_social_accounts a ON a.id=d.account_id WHERE d.library_id=? ORDER BY d.created_at DESC LIMIT 300')
    .bind(library).all()).results||[];
  return {jobs:jobs.map(j=>({id:j.id,title:j.title,caption:j.caption,status:j.status,
    repeat:j.repeat_rule,scheduledAt:new Date(j.scheduled_at).toISOString(),
    createdAt:new Date(j.created_at).toISOString(),
    completedAt:j.completed_at?new Date(j.completed_at).toISOString():null,
    deliveries:deliveries.filter(d=>d.job_id===j.id).map(d=>({
      id:d.id,platform:d.platform,account:d.display_name||'Disconnected account',
      status:d.status,externalId:d.external_id,attempts:d.attempts,error:d.last_error,
      publishedAt:d.published_at?new Date(d.published_at).toISOString():null
    }))})),total:jobs.length};
}
async function createSocialJob(req,env,library){
  const input=await body(req);
  if(env.SOCIAL_CRON_ENABLED!=='true')throw invalid('Automatic posting scheduler is not enabled by the site administrator',503);
  if(input.consent!==true)throw invalid('Explicit consent is required before posting to social accounts',400);
  const title=str(input.title,120),caption=str(input.caption||'',2000);
  if(!title||caption===null)throw invalid('Valid video title and caption are required');
  if(!ID.test(input.videoAssetId||''))throw invalid('Upload an MP4 before scheduling');
  const media=await env.DB.prepare(
    "SELECT id FROM media_uploads WHERE library_id=? AND id=? AND mime='video/mp4'")
    .bind(library,input.videoAssetId).first();
  if(!media)throw invalid('Video is missing from the active guest cloud library',422);
  if(!Array.isArray(input.accountIds)||!input.accountIds.length||input.accountIds.length>8)
    throw invalid('Select between 1 and 8 connected social accounts');
  const ids=[...new Set(input.accountIds)];
  if(ids.length!==input.accountIds.length||ids.some(id=>typeof id!=='string'||!ID.test(id)))
    throw invalid('Invalid account selection');
  const accounts=[];
  for(const id of ids){
    const rec=await env.DB.prepare('SELECT id,platform,status,expires_at,refresh_cipher FROM guest_social_accounts WHERE library_id=? AND id=?')
      .bind(library,id).first();
    if(!rec||rec.status!=='connected')throw invalid('Selected social account is not connected',422);
    if(rec.expires_at&&rec.expires_at<Date.now()&&!rec.refresh_cipher)
      throw invalid('One selected social account must be reconnected',422);
    accounts.push(rec);
  }
  if(accounts.some(x=>!platforms.has(x.platform)))throw invalid('Unsupported social account',422);
  const yt=accounts.some(x=>x.platform==='youtube');
  if(yt&&title.length>100)throw invalid('YouTube titles are limited to 100 characters');
  if(yt&&typeof input.youtubeMadeForKids!=='boolean')
    throw invalid('Choose the YouTube audience: made for kids or not made for kids',400);
  const tk=accounts.some(x=>x.platform==='tiktok');
  if(tk&&!privacies.has(input.tiktokPrivacy))throw invalid('Choose a valid TikTok privacy level',400);
  if(tk&&['tiktokAllowComment','tiktokAllowDuet','tiktokAllowStitch'].some(k=>typeof input[k]!=='boolean'))
    throw invalid('Choose the TikTok interaction permissions',400);
  if(!repeats.has(input.repeat||'none'))throw invalid('Invalid Autopilot repeat setting');
  const count=(await env.DB.prepare('SELECT COUNT(*) n FROM guest_social_jobs WHERE library_id=?').bind(library).first())?.n||0;
  if(Number(count)>=60)throw invalid('Guest auto-publishing history is full (60 entries)',409);
  const at=scheduled(input.scheduleAt),now=Date.now(),jobId=crypto.randomUUID();
  const query=[env.DB.prepare(
    'INSERT INTO guest_social_jobs(id,library_id,title,caption,media_id,tiktok_privacy,tiktok_allow_comments,tiktok_allow_duet,tiktok_allow_stitch,youtube_made_for_kids,status,scheduled_at,repeat_rule,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(jobId,library,title,caption,media.id,
      tk?input.tiktokPrivacy:'SELF_ONLY',tk&&input.tiktokAllowComment?1:0,tk&&input.tiktokAllowDuet?1:0,
      tk&&input.tiktokAllowStitch?1:0,yt?(input.youtubeMadeForKids?1:0):null,
      'queued',at,input.repeat||'none',now,now)];
  for(const a of accounts)query.push(env.DB.prepare(
    'INSERT INTO guest_social_deliveries(id,job_id,library_id,account_id,platform,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),jobId,library,a.id,a.platform,'queued',at,now,now));
  await env.DB.batch(query);
  return {id:jobId,status:'queued',scheduledAt:new Date(at).toISOString(),
    accounts:accounts.map(a=>a.platform),repeat:input.repeat||'none',automatic:true};
}
async function jobAction(env,library,jobId,action){
  if(!ID.test(jobId))throw invalid('Invalid publish job ID');
  const job=await env.DB.prepare('SELECT * FROM guest_social_jobs WHERE library_id=? AND id=?').bind(library,jobId).first();
  if(!job)throw invalid('Posting job not found',404);
  const deliveries=(await env.DB.prepare('SELECT * FROM guest_social_deliveries WHERE library_id=? AND job_id=?')
    .bind(library,jobId).all()).results||[];
  if(action==='cancel'){
    if(deliveries.some(x=>['uploading','processing','published','unknown'].includes(x.status)))
      throw invalid('This job may already be on a social platform; cancel only before uploading begins',409);
    const time=Date.now();
    await env.DB.prepare("UPDATE guest_social_deliveries SET status='cancelled',updated_at=? WHERE library_id=? AND job_id=? AND status IN ('queued','retry','failed')")
      .bind(time,library,jobId).run();
    await env.DB.prepare("UPDATE guest_social_jobs SET status='cancelled',updated_at=?,completed_at=? WHERE id=? AND library_id=?")
      .bind(time,time,jobId,library).run();
    return {cancelled:true};
  }
  if(action==='retry'){
    if(env.SOCIAL_CRON_ENABLED!=='true')throw invalid('Automatic scheduler not configured',503);
    if(!['failed','partial'].includes(job.status))throw invalid('Only confirmed failures can be retried',409);
    const failed=deliveries.filter(x=>x.status==='failed'&&x.attempts<3);
    if(!failed.length)throw invalid('No retryable deliveries; reconnect the account or review the platform status',409);
    const time=Date.now();
    await env.DB.batch(failed.map(x=>env.DB.prepare(
      "UPDATE guest_social_deliveries SET status='retry',next_attempt_at=?,updated_at=?,last_error=NULL WHERE id=? AND library_id=? AND status='failed'")
      .bind(time+3000,time,x.id,library)));
    await env.DB.prepare("UPDATE guest_social_jobs SET status='queued',completed_at=NULL,updated_at=? WHERE id=? AND library_id=?")
      .bind(time,jobId,library).run();
    return {retrying:failed.length};
  }
  throw invalid('Unsupported job action',404);
}
export async function guestSocial(req,env,library,origin,json,fail,rateLimit){
  const url=new URL(req.url),p=url.pathname,method=req.method;
  try{
    if(['POST','PATCH','DELETE'].includes(method))await rateLimit(env.DB,req);
    if(p==='/api/guest-social/status'&&method==='GET'){
      const linked=await listAccounts(env,library);
      return json({guestAccess:true,subscriptionRequired:false,providers:providerReadiness(env),
        schedulerConfigured:env.SOCIAL_CRON_ENABLED==='true',connectedAccounts:linked.length,
        oauthRequired:true,notice:'Every account must authorize BallEngine through official OAuth. Automatic posting requires configured platform API apps and a Cloudflare Cron Trigger.'},200,origin);
    }
    if(p==='/api/guest-social/accounts'&&method==='GET')
      return json({accounts:await listAccounts(env,library)},200,origin);
    const creator=/^\/api\/guest-social\/tiktok\/creator-info\/([0-9a-f-]{36})$/.exec(p);
    if(creator&&method==='GET'){
      const a=await env.DB.prepare("SELECT * FROM guest_social_accounts WHERE id=? AND library_id=? AND platform='tiktok'")
        .bind(creator[1],library).first();
      if(!a)throw invalid('TikTok account is not connected',404);
      const result=await providerJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{
        method:'POST',headers:{Authorization:'Bearer '+await accessToken(env,a),'Content-Type':'application/json'},body:'{}'});
      const info=result.data||{};
      return json({name:info.creator_nickname||a.display_name,
        privacyOptions:info.privacy_level_options||[],
        commentDisabled:!!info.comment_disabled,duetDisabled:!!info.duet_disabled,
        stitchDisabled:!!info.stitch_disabled,
        maxVideoSeconds:info.max_video_post_duration_sec||null},200,origin);
    }
    const connect=/^\/api\/guest-social\/connect\/(youtube|instagram|facebook|tiktok)$/.exec(p);
    if(connect&&method==='POST')
      return json(await beginOAuth(req,env,library,connect[1],origin),200,origin);
    const account=/^\/api\/guest-social\/accounts\/([0-9a-f-]{36})$/.exec(p);
    if(account&&method==='DELETE')
      return json(await disconnectAccount(env,library,account[1]),200,origin);
    if(p==='/api/guest-social/jobs'){
      if(method==='GET')return json(await socialJobs(env,library),200,origin);
      if(method==='POST')return json(await createSocialJob(req,env,library),201,origin);
    }
    const action=/^\/api\/guest-social\/jobs\/([0-9a-f-]{36})\/(retry|cancel)$/.exec(p);
    if(action&&method==='POST')return json(await jobAction(env,library,action[1],action[2]),200,origin);
    return fail('Guest social publishing resource not found',404,origin);
  }catch(e){
    const status=[400,401,403,404,409,413,422,429,503].includes(e?.status)?e.status:500;
    console.error('Guest social route failed',status,e?.name||'Error');
    return fail(status>=500?'Guest social publishing backend is not configured or unavailable.':e.message,status,origin);
  }
}
