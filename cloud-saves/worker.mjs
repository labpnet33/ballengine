/**
 * BallEngine guest cloud saves API.
 * Private per-library capabilities: possession of a 256-bit recovery key
 * grants access to that library. No account or third-party entitlement API.
 * The key is NEVER stored; only its SHA-256 digest indexes records.
 *
 * Configuration snapshots only; uploads/audio/video are not stored here.
 */
import {isPublicMusic,publicMusic} from './music-bank.mjs';
import {isPrivateMusic,privateMusic,serveAsset,musicUsage} from './music-media.mjs';
import {isGuestPublishing,guestPublishing} from './guest-publishing.mjs';
import {GUEST_PUBLISHING_CLIENT_SCRIPT} from './guest-publishing-client.mjs';
import {isGuestSocial,isGuestSocialCallback,guestSocial,oauthCallback,runSocialSchedule} from './guest-social.mjs';
const MAX_CONFIG_BYTES=250000;
const MAX_SAVES=50;
const MAX_LIBRARY_BYTES=10000000;
const MAX_WRITES_PER_IP_DAY=500;
const ALLOW_ORIGIN=(origin)=>{
  if(!origin)return false;
  try{
    const u=new URL(origin);
    if(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))return true;
    if(u.protocol!=='https:')return false;
    return u.hostname==='ballengine.vercel.app' ||
      (u.hostname.startsWith('ballengine-')&&u.hostname.endsWith('.vercel.app')) ||
      (u.hostname.startsWith('ballengine-git-')&&u.hostname.endsWith('.vercel.app'));
  }catch{return false;}
};
const encode=new TextEncoder();
async function sha256(value){
  const data=await crypto.subtle.digest('SHA-256',encode.encode(value));
  return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('');
}
function json(value,status=200,origin=''){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(origin&&ALLOW_ORIGIN(origin)){
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Credentials']='false';
    headers['Vary']='Origin';
  }
  return new Response(JSON.stringify(value),{status,headers});
}
function options(origin){
  return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Request-Id',
    'Access-Control-Max-Age':'3600','Vary':'Origin'
  }});
}
function publicRow(row){
  return {
    id:row.id,name:row.name,isDefault:!!row.is_default,
    scope:row.scope||'personal',isOwner:true,ownerName:null,
    hasCloudData:true,revision:row.version||1,version:row.version||1,
    createdAt:row.created_at,updatedAt:row.updated_at,
    checksum:row.checksum||null,config:null
  };
}
async function bodyJson(req){
  if(Number(req.headers.get('Content-Length')||0)>MAX_CONFIG_BYTES+30000)
    throw Object.assign(new Error('Project exceeds the 250 KB configuration limit.'),{status:413});
  const s=await req.text();
  if(encode.encode(s).byteLength>MAX_CONFIG_BYTES+30000)
    throw Object.assign(new Error('Project exceeds the 250 KB configuration limit.'),{status:413});
  try{return JSON.parse(s||'{}');}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
function validateConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Object.assign(new Error('Missing project configuration'),{status:400});
  const content=JSON.stringify(config);
  if(encode.encode(content).length>MAX_CONFIG_BYTES)
    throw Object.assign(new Error('Project exceeds the 250 KB configuration limit.'),{status:413});
  return content;
}
function cleanName(v){
  const name=String(v||'').trim().slice(0,100);
  if(!name)throw Object.assign(new Error('Project name is required'),{status:400});
  return name;
}
async function rateLimit(db,req){
  const ip=(req.headers.get('CF-Connecting-IP')||'not-provided').slice(0,64);
  const day=new Date().toISOString().slice(0,10);
  const digest=await sha256(day+'|'+ip);
  await db.prepare('INSERT INTO write_limits (day_ip_hash, day, count) VALUES (?, ?, 1) ON CONFLICT(day_ip_hash) DO UPDATE SET count=count+1')
    .bind(digest,day).run();
  const count=(await db.prepare('SELECT count FROM write_limits WHERE day_ip_hash=?').bind(digest).first())?.count||0;
  if(count>MAX_WRITES_PER_IP_DAY)throw Object.assign(new Error('Daily write limit reached; try again tomorrow.'),{status:429});
}
async function currentRow(db,library,id){
  if(!/^[0-9a-f-]{36}$/i.test(id||''))return null;
  return db.prepare('SELECT * FROM saves WHERE library_id=? AND id=?').bind(library,id).first();
}
function fail(message,status,origin){
  return json({error:String(message||'Request failed')},status||500,origin);
}
export default {
  async fetch(req,env){
    const url=new URL(req.url),origin=req.headers.get('Origin')||'';
    // OAuth provider redirects are top-level navigations, not CORS API calls.
    // Their one-time D1 state supplies the authorization instead of Origin.
    if(req.method==='GET'&&isGuestSocialCallback(url.pathname))
      return env.DB?oauthCallback(req,env):fail('Cloud database is not configured',503);
    if(req.method==='OPTIONS')return ALLOW_ORIGIN(origin)?options(origin):fail('Origin is not allowed',403);
    if(origin&&!ALLOW_ORIGIN(origin))return fail('Origin is not allowed',403);
    // Public script used by the existing BallEngine frontend while Vercel
    // has no deployment capacity. Serve with a strict JavaScript MIME type.
    if(url.pathname==='/guest-publishing-client.js'&&req.method==='GET')
      return new Response(GUEST_PUBLISHING_CLIENT_SCRIPT,{status:200,headers:{
        'Content-Type':'text/javascript; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      }});
    if(url.pathname==='/health'&&req.method==='GET')return json({ok:true,service:'ballengine-guest-saves',version:1},200,origin);
    if(isPublicMusic(url.pathname))return publicMusic(req);
    if(url.pathname.startsWith('/api/assets/')&&(req.method==='GET'||req.method==='HEAD'))return env.DB?serveAsset(req,env):fail('Cloud database is not configured',503,origin);
    if(!env.DB)return fail('Cloud database is not configured',503,origin);
    const auth=req.headers.get('Authorization')||'';
    const key=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!/^be1_[A-Za-z0-9_-]{43}$/.test(key))return fail('Missing or invalid cloud recovery key',401,origin);
    const library=await sha256(key);
    if(isGuestSocial(url.pathname))return guestSocial(req,env,library,origin,json,fail,rateLimit);
    if(isGuestPublishing(url.pathname))return guestPublishing(req,env,library,origin,json,fail,rateLimit);
    if(isPrivateMusic(url.pathname))return privateMusic(req,env,library,origin,json,fail,rateLimit);
    const db=env.DB;
    const parts=url.pathname.split('/').filter(Boolean);
    const base=parts[0]==='api';
    if(!base)return fail('Not found',404,origin);
    const resource=parts[1],id=parts[2];
    try{
      if(['POST','PUT','DELETE'].includes(req.method))await rateLimit(db,req);
      if(resource==='storage'&&parts[2]==='usage'&&req.method==='GET'){
        const usage=await db.prepare('SELECT COUNT(*) total, COALESCE(SUM(size_bytes),0) used FROM saves WHERE library_id=?').bind(library).first();
        const media=await musicUsage(db,library);
        return json({used_bytes:usage.used,limit_bytes:MAX_LIBRARY_BYTES,total_saves:usage.total,...media},200,origin);
      }
      if(resource!=='saves')return fail('Not found',404,origin);
      if(!id&&req.method==='GET'){
        const limitParam=url.searchParams.get('limit');
        const limit=Math.min(MAX_SAVES,Math.max(1,Number(limitParam||MAX_SAVES)||MAX_SAVES));
        const before=Number(url.searchParams.get('before')||0);
        const beforeId=url.searchParams.get('beforeId')||'';
        const where=before>0?'AND (updated_at < ? OR (updated_at = ? AND id < ?))':'';
        const stmt=db.prepare('SELECT * FROM saves WHERE library_id=? '+where+' ORDER BY updated_at DESC,id DESC LIMIT ?');
        const rs=before>0?await stmt.bind(library,before,before,beforeId,limit+1).all():await stmt.bind(library,limit+1).all();
        const rows=rs.results||[];
        const total=(await db.prepare('SELECT COUNT(*) total FROM saves WHERE library_id=?').bind(library).first()).total||0;
        const saves=rows.slice(0,limit).map(row=>{
          const val=publicRow(row);
          if(!limitParam)val.config=JSON.parse(row.config);
          return val;
        });
        if(!limitParam)return json(saves,200,origin);
        return json({saves,total,hasMore:rows.length>limit},200,origin);
      }
      if(!id&&req.method==='POST'){
        const body=await bodyJson(req);
        const name=cleanName(body.name);
        const config=validateConfig(body.config);
        if(body.scope&&body.scope!=='personal')return fail('Shared saves require an account',400,origin);
        const size=encode.encode(config).length;
        const stats=await db.prepare('SELECT COUNT(*) total, COALESCE(SUM(size_bytes),0) used FROM saves WHERE library_id=?').bind(library).first();
        if(stats.total>=MAX_SAVES)return fail('Cloud library limit: maximum 50 projects.',409,origin);
        if(stats.used+size>MAX_LIBRARY_BYTES)return fail('Cloud library is full (10 MB).',413,origin);
        const now=Date.now(),newId=crypto.randomUUID(),isDefault=body.isDefault?1:0;
        const checksum=/^[a-f0-9]{64}$/i.test(body.checksum||'')?body.checksum:await sha256(config);
        if(isDefault)await db.prepare('UPDATE saves SET is_default=0 WHERE library_id=?').bind(library).run();
        await db.prepare('INSERT INTO saves (id,library_id,name,config,checksum,scope,is_default,created_at,updated_at,version,size_bytes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .bind(newId,library,name,config,checksum,'personal',isDefault,now,now,1,size).run();
        return json({...publicRow({id:newId,name,scope:'personal',is_default:isDefault,version:1,created_at:now,updated_at:now,checksum}),config:body.config},201,origin);
      }
      if(id==='check-version'&&req.method==='GET'){
        const r=await currentRow(db,library,url.searchParams.get('id'));
        return r?json({version:r.version,checksum:r.checksum,name:r.name,isDefault:!!r.is_default,updatedAt:r.updated_at},200,origin):fail('Project not found',404,origin);
      }
      if(id==='versions'&&parts[3]){
        const row=await currentRow(db,library,parts[3]);
        if(!row)return fail('Project not found',404,origin);
        if(req.method==='GET'){
          const x=await db.prepare('SELECT id,version,created_at,checksum FROM save_versions WHERE library_id=? AND save_id=? ORDER BY version DESC LIMIT 10').bind(library,row.id).all();
          return json({versions:(x.results||[]).map(v=>({id:v.id,version:v.version,createdAt:v.created_at,checksum:v.checksum}))},200,origin);
        }
        if(req.method==='POST'){
          const body=await bodyJson(req);
          const version=await db.prepare('SELECT * FROM save_versions WHERE library_id=? AND save_id=? AND id=?').bind(library,row.id,String(body.versionId||'')).first();
          if(!version)return fail('Revision not found',404,origin);
          const now=Date.now();
          await db.prepare('INSERT INTO save_versions(id,save_id,library_id,version,config,checksum,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),row.id,library,row.version,row.config,row.checksum,now).run();
          await db.prepare('UPDATE saves SET config=?,checksum=?,size_bytes=?,version=version+1,updated_at=? WHERE library_id=? AND id=?').bind(version.config,version.checksum,encode.encode(version.config).length,now,library,row.id).run();
          return json({version:row.version+1,updatedAt:now},200,origin);
        }
      }
      if(id&&!parts[3]){
        const row=await currentRow(db,library,id);
        if(!row)return fail('Project not found',404,origin);
        if(req.method==='GET')return json({...publicRow(row),config:JSON.parse(row.config)},200,origin);
        if(req.method==='DELETE'){
          await db.prepare('DELETE FROM save_versions WHERE library_id=? AND save_id=?').bind(library,id).run();
          await db.prepare('DELETE FROM saves WHERE library_id=? AND id=?').bind(library,id).run();
          return json({deleted:true},200,origin);
        }
        if(req.method==='PUT'){
          const body=await bodyJson(req);
          const name=body.name!==undefined?cleanName(body.name):row.name;
          const config=body.config!==undefined?validateConfig(body.config):row.config;
          const size=encode.encode(config).length,now=Date.now();
          const isDefault=body.isDefault!==undefined?(body.isDefault?1:0):row.is_default;
          const total=await db.prepare('SELECT COALESCE(SUM(size_bytes),0) used FROM saves WHERE library_id=?').bind(library).first();
          if(total.used-row.size_bytes+size>MAX_LIBRARY_BYTES)return fail('Cloud library is full (10 MB).',413,origin);
          const changed=body.config!==undefined&&config!==row.config;
          const checksum=changed?(/^[a-f0-9]{64}$/i.test(body.checksum||'')?body.checksum:await sha256(config)):row.checksum;
          if(changed){
            await db.prepare('INSERT INTO save_versions (id,save_id,library_id,version,config,checksum,created_at) VALUES (?,?,?,?,?,?,?)')
              .bind(crypto.randomUUID(),id,library,row.version,row.config,row.checksum,now).run();
          }
          if(isDefault)await db.prepare('UPDATE saves SET is_default=0 WHERE library_id=?').bind(library).run();
          await db.prepare('UPDATE saves SET name=?,config=?,checksum=?,is_default=?,updated_at=?,version=?,size_bytes=? WHERE library_id=? AND id=?')
            .bind(name,config,checksum,isDefault,now,row.version+(changed?1:0),size,library,id).run();
          return json({id,name,isDefault:!!isDefault,updatedAt:now,version:row.version+(changed?1:0),checksum},200,origin);
        }
      }
      return fail('Not found',404,origin);
    }catch(error){
      const status=error&&Number.isInteger(error.status)?error.status:500;
      console.error('Cloud saves request failed:',status,error?.name||'Error');
      return fail(status===500?'Cloud database operation failed':error.message,status,origin);
    }
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(runSocialSchedule(env));
  }
};
