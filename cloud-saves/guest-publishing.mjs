/**
 * BallEngine guest publishing planner. Stores manual publishing drafts and
 * scheduled reminders only. NEVER claims a social post was automatically
 * delivered; real posting requires each platform's OAuth/API permissions.
 *
 * Private tenant key: the same 256-bit bearer capability as Cloud Saves.
 * MP4s are limited to 10 MiB, stored in the existing private D1 media table.
 */
import {uploadGuestVideo,signedMediaUrl} from './music-media.mjs';
const MAX_JOBS=60;
const MAX_YEAR_MS=366*86400000;
const PLATFORMS=new Set(['youtube','tiktok','instagram','facebook']);
const REPEATS=new Set(['none','daily','weekly']);
const RE_ID=/^[0-9a-f-]{36}$/i;
const enc=new TextEncoder();
export const isGuestPublishing=path=>path==='/api/guest-publishing'||path.startsWith('/api/guest-publishing/');
function err(message,status=400){return Object.assign(new Error(message),{status});}
function string(v,max,label,required=false){
  const val=String(v??'').trim();
  if(required&&!val)throw err(label+' is required');
  if(val.length>max)throw err(label+' must be '+max+' characters or fewer');
  return val;
}
function platforms(value){
  if(!Array.isArray(value))throw err('Platforms must be an array');
  const uniq=[...new Set(value)];
  if(uniq.length>4||uniq.some(x=>!PLATFORMS.has(x)))throw err('Invalid platform selection');
  return uniq;
}
function when(value){
  if(value===undefined||value===null||value==='')return null;
  const ms=typeof value==='number'?value:Date.parse(String(value));
  if(!Number.isFinite(ms))throw err('Invalid date/time');
  if(ms<=Date.now()+60000)throw err('Schedule at least two minutes from now');
  if(ms>Date.now()+MAX_YEAR_MS)throw err('Scheduling is limited to one year ahead');
  return Math.round(ms);
}
function repeat(value){
  const v=String(value||'none');
  if(!REPEATS.has(v))throw err('Invalid repetition setting');
  return v;
}
async function parseBody(req){
  if(Number(req.headers.get('Content-Length')||0)>12000)throw err('Publishing request too large',413);
  const s=await req.text();
  if(enc.encode(s).byteLength>12000)throw err('Publishing request too large',413);
  try{return JSON.parse(s||'{}');}catch{throw err('Invalid JSON');}
}
function statusOf(row,now=Date.now()){
  if(row.status==='published')return 'published';
  if(row.status==='cancelled')return 'cancelled';
  if(row.status==='draft')return 'draft';
  return row.scheduled_at!==null&&row.scheduled_at<=now?'ready':'scheduled';
}
async function rowPublic(row,req,library){
  return {
    id:row.id,title:row.title,caption:row.caption,
    platforms:JSON.parse(row.platforms_json||'[]'),
    status:statusOf(row),scheduleAt:row.scheduled_at?new Date(row.scheduled_at).toISOString():null,
    repeat:row.repeat_rule,
    videoUrl:row.media_id?await signedMediaUrl(req,library,row.media_id):null,
    videoAssetId:row.media_id,
    createdAt:new Date(row.created_at).toISOString(),
    updatedAt:new Date(row.updated_at).toISOString(),
    completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
    autoPublished:false,
    delivery:'manual'
  };
}
async function videoId(db,library,id){
  if(id===null||id===undefined||id==='')return null;
  if(typeof id!=='string'||!RE_ID.test(id))throw err('Invalid video ID');
  const row=await db.prepare('SELECT id FROM media_uploads WHERE id=? AND library_id=? AND mime=?').bind(id,library,'video/mp4').first();
  if(!row)throw err('Video not found in this cloud library',404);
  return id;
}
async function cleanupVideo(db,library,id){
  if(!id)return;
  const stillUsed=await db.prepare('SELECT id FROM guest_publish_jobs WHERE library_id=? AND media_id=? LIMIT 1').bind(library,id).first();
  const song=await db.prepare('SELECT id FROM songs WHERE library_id=? AND media_id=? LIMIT 1').bind(library,id).first();
  if(stillUsed||song)return;
  await db.prepare('DELETE FROM media_chunks WHERE library_id=? AND asset_id=?').bind(library,id).run();
  await db.prepare('DELETE FROM media_uploads WHERE library_id=? AND id=?').bind(library,id).run();
}
async function list(db,library,req,url){
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||60));
  const offset=Math.min(1000,Math.max(0,Number(url.searchParams.get('offset'))||0));
  const rows=await db.prepare('SELECT * FROM guest_publish_jobs WHERE library_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(library,limit+1,offset).all();
  const all=rows.results||[];
  return {jobs:await Promise.all(all.slice(0,limit).map(row=>rowPublic(row,req,library))),
    hasMore:all.length>limit,total:(await db.prepare('SELECT COUNT(*) c FROM guest_publish_jobs WHERE library_id=?').bind(library).first())?.c||0,
    mode:'manual',automaticSocialPosting:false};
}
async function create(req,db,library){
  const body=await parseBody(req);
  const title=string(body.title,120,'Title',true);
  const caption=string(body.caption,2000,'Caption');
  const platformsValue=platforms(body.platforms||[]);
  const at=when(body.scheduleAt);
  const recurrence=repeat(body.repeat);
  if(recurrence!=='none'&&!at)throw err('A scheduled time is required for recurring reminders');
  const media=await videoId(db,library,body.videoAssetId);
  const total=(await db.prepare('SELECT COUNT(*) c FROM guest_publish_jobs WHERE library_id=?').bind(library).first())?.c||0;
  if(total>=MAX_JOBS)throw err('Guest planner limit: 60 active and historical entries.',409);
  const id=crypto.randomUUID(),now=Date.now(),status=at?'scheduled':'draft';
  await db.prepare('INSERT INTO guest_publish_jobs(id,library_id,title,caption,platforms_json,status,scheduled_at,repeat_rule,media_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,library,title,caption,JSON.stringify(platformsValue),status,at,recurrence,media,now,now).run();
  return db.prepare('SELECT * FROM guest_publish_jobs WHERE library_id=? AND id=?').bind(library,id).first();
}
async function update(req,db,library,row){
  if(row.status==='published'||row.status==='cancelled')throw err('Completed or cancelled items cannot be edited',409);
  const body=await parseBody(req);
  if(Object.keys(body).some(k=>!['title','caption','platforms','scheduleAt','repeat','videoAssetId'].includes(k)))
    throw err('Unsupported publishing field');
  const title=body.title===undefined?row.title:string(body.title,120,'Title',true);
  const caption=body.caption===undefined?row.caption:string(body.caption,2000,'Caption');
  const platformsValue=body.platforms===undefined?JSON.parse(row.platforms_json):platforms(body.platforms);
  const at=body.scheduleAt===undefined?row.scheduled_at:when(body.scheduleAt);
  const recurrence=body.repeat===undefined?row.repeat_rule:repeat(body.repeat);
  if(recurrence!=='none'&&!at)throw err('Recurring reminders need a scheduled time');
  const media=body.videoAssetId===undefined?row.media_id:await videoId(db,library,body.videoAssetId);
  const now=Date.now();
  await db.prepare('UPDATE guest_publish_jobs SET title=?,caption=?,platforms_json=?,status=?,scheduled_at=?,repeat_rule=?,media_id=?,updated_at=? WHERE library_id=? AND id=?')
    .bind(title,caption,JSON.stringify(platformsValue),at?'scheduled':'draft',at,recurrence,media,now,library,row.id).run();
  if(row.media_id!==media)await cleanupVideo(db,library,row.media_id);
  return db.prepare('SELECT * FROM guest_publish_jobs WHERE library_id=? AND id=?').bind(library,row.id).first();
}
async function complete(db,library,row){
  if(row.status==='published'||row.status==='cancelled')throw err('Already completed or cancelled',409);
  const now=Date.now();
  await db.prepare('UPDATE guest_publish_jobs SET status=?,completed_at=?,updated_at=? WHERE library_id=? AND id=?')
    .bind('published',now,now,library,row.id).run();
  // "Repeat" automatically prepares the next reminder. It does not publish.
  let nextId=null;
  if(row.repeat_rule!=='none'&&row.scheduled_at){
    const count=(await db.prepare('SELECT COUNT(*) c FROM guest_publish_jobs WHERE library_id=?').bind(library).first())?.c||0;
    if(count<MAX_JOBS){
      const step=row.repeat_rule==='daily'?86400000:604800000;
      let next=row.scheduled_at;
      for(let i=0;i<370&&next<=now+60000;i++)next+=step;
      if(next<=now+MAX_YEAR_MS){
        nextId=crypto.randomUUID();
        await db.prepare('INSERT INTO guest_publish_jobs(id,library_id,title,caption,platforms_json,status,scheduled_at,repeat_rule,media_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .bind(nextId,library,row.title,row.caption,row.platforms_json,'scheduled',next,row.repeat_rule,row.media_id,now,now).run();
      }
    }
  }
  return {ok:true,manualConfirmation:true,nextReminderId:nextId};
}
export async function guestPublishing(req,env,library,origin,json,fail,rateLimit){
  const db=env.DB,url=new URL(req.url),pathname=url.pathname;
  try{
    if(['POST','PUT','PATCH','DELETE'].includes(req.method))await rateLimit(db,req);
    if(pathname==='/api/guest-publishing/status'&&req.method==='GET')
      return json({mode:'manual',autoPublishing:false,socialAccountsConnected:false,
        requiresOAuth:true,maxVideoBytes:10*1024*1024,
        notice:'Connected social account OAuth is not configured. Scheduling creates a durable reminder, not an automatic social upload.'},200,origin);
    if(pathname==='/api/guest-publishing/videos'&&req.method==='POST')
      return uploadGuestVideo(req,env,library,origin,json,fail);
    if(pathname==='/api/guest-publishing/jobs'){
      if(req.method==='GET')return json(await list(db,library,req,url),200,origin);
      if(req.method==='POST'){
        const row=await create(req,db,library);
        return json(await rowPublic(row,req,library),201,origin);
      }
    }
    const match=/^\/api\/guest-publishing\/jobs\/([0-9a-f-]{36})(?:\/(complete))?$/.exec(pathname);
    if(!match)return fail('Guest publishing resource not found',404,origin);
    const row=await db.prepare('SELECT * FROM guest_publish_jobs WHERE library_id=? AND id=?').bind(library,match[1]).first();
    if(!row)return fail('Publishing item not found',404,origin);
    if(match[2]==='complete'){
      if(req.method!=='POST')return fail('Method not allowed',405,origin);
      return json(await complete(db,library,row),200,origin);
    }
    if(req.method==='GET')return json(await rowPublic(row,req,library),200,origin);
    if(req.method==='PATCH')return json(await rowPublic(await update(req,db,library,row),req,library),200,origin);
    if(req.method==='DELETE'){
      await db.prepare('DELETE FROM guest_publish_jobs WHERE id=? AND library_id=?').bind(row.id,library).run();
      await cleanupVideo(db,library,row.media_id);
      return json({deleted:true},200,origin);
    }
    return fail('Method not allowed',405,origin);
  }catch(e){
    const status=[400,401,403,404,409,413,415,422,429,503].includes(e?.status)?e.status:500;
    console.warn('Guest publishing error',status,e?.name||'Error');
    return fail(status>=500?'Unable to complete publishing planner operation.':e.message,status,origin);
  }
}
