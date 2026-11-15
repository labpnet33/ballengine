/**
 * Official social authorization for anonymous BallEngine guest libraries.
 * Each guest must grant their own OAuth consent. Provider tokens never
 * enter the browser or source control; AES-GCM ciphertext is stored in D1.
 */
const CHANNELS=new Set(['youtube','instagram','facebook','tiktok']);
const encoder=new TextEncoder();
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=value=>Uint8Array.from(atob(String(value).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(value).length/4)*4,'=')),c=>c.charCodeAt(0));
const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const META_VERSION='v25.0';
function config(env,platform){
  if(platform==='youtube')return !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
  if(platform==='tiktok')return !!(env.TIKTOK_CLIENT_KEY&&env.TIKTOK_CLIENT_SECRET);
  if(platform==='instagram'||platform==='facebook')return !!(env.META_APP_ID&&env.META_APP_SECRET);
  return false;
}
export function providerReadiness(env){
  const ready=!!env.SOCIAL_TOKEN_SECRET&&!!env.SOCIAL_WORKER_URL;
  return Object.fromEntries([...CHANNELS].map(x=>[x,{configured:ready&&config(env,x),requiresAuthorization:true}]));
}
function callbackURL(env,platform){
  const u=new URL(String(env.SOCIAL_WORKER_URL||''));
  if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw invalid('Worker HTTPS URL required',503);
  return u.origin+'/api/guest-social/oauth/callback/'+platform;
}
async function key(env){
  if(!env.SOCIAL_TOKEN_SECRET)throw invalid('OAuth token encryption not configured',503);
  const bytes=fromB64url(env.SOCIAL_TOKEN_SECRET);
  if(bytes.byteLength!==32)throw invalid('OAuth token encryption key must be 32 bytes',503);
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(env,text){
  if(!text)return null;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),encoder.encode(text)));
  return base64url(iv)+'.'+base64url(cipher);
}
export async function unseal(env,blob){
  if(!blob)throw invalid('Missing social token; reconnect the account',409);
  const [a,b]=blob.split('.');
  if(!a||!b)throw invalid('Invalid stored social token',500);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(a)},await key(env),fromB64url(b));
  return new TextDecoder().decode(data);
}
async function providerJSON(url,init={}){
  const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(30000)});
  const body=await r.json().catch(()=>({}));
  // TikTok always includes an {error:{code:'ok'}} envelope on success.
  // Google and Meta use an error object only when a call actually fails.
  const providerError=body.error;
  const providerFailed=!!providerError && (typeof providerError!=='object'||
    providerError.code!=='ok');
  if(!r.ok||providerFailed){
    const msg=body.error?.message||body.error_description||('Provider HTTP '+r.status);
    throw invalid('Social platform rejected this request: '+String(msg).slice(0,190),
      [400,401,403,422,429].includes(r.status)?r.status:502);
  }
  return body;
}
const postForm=(url,values)=>providerJSON(url,{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(values)
});
export async function beginOAuth(req,env,library,platform,origin){
  if(!CHANNELS.has(platform))throw invalid('Unknown social platform');
  if(!config(env,platform)||!env.SOCIAL_TOKEN_SECRET||!env.SOCIAL_WORKER_URL)
    throw invalid('Platform OAuth is not configured by the site administrator',503);
  const state=random(),expires=Date.now()+10*60000,callback=callbackURL(env,platform);
  const verifier=null; // TikTok Login Kit Web: confidential-client authorization code flow.
  await env.DB.prepare('DELETE FROM guest_social_oauth_states WHERE expires_at<?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO guest_social_oauth_states(id,library_id,platform,code_verifier,redirect_origin,expires_at) VALUES(?,?,?,?,?,?)')
    .bind(state,library,platform,verifier,origin||String(env.SOCIAL_APP_ORIGIN||'https://ballengine.vercel.app'),expires).run();
  let url;
  if(platform==='youtube'){
    url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',
      scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type:'offline',prompt:'consent',state}).forEach(([k,v])=>url.searchParams.set(k,v));
  }else if(platform==='tiktok'){
    url=new URL('https://www.tiktok.com/v2/auth/authorize/');
    Object.entries({client_key:env.TIKTOK_CLIENT_KEY,redirect_uri:callback,response_type:'code',
      scope:'user.info.basic,video.publish',state})
      .forEach(([k,v])=>url.searchParams.set(k,v));
  }else{
    url=new URL('https://www.facebook.com/'+(env.META_GRAPH_VERSION||META_VERSION)+'/dialog/oauth');
    Object.entries({client_id:env.META_APP_ID,redirect_uri:callback,response_type:'code',
      scope:'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
      state}).forEach(([k,v])=>url.searchParams.set(k,v));
  }
  return {authorizationUrl:url.toString(),expiresAt:new Date(expires).toISOString(),platform};
}
async function recordsFromOAuth(env,platform,code,verifier){
  const callback=callbackURL(env,platform);
  if(platform==='youtube'){
    const token=await postForm('https://oauth2.googleapis.com/token',{
      code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,
      redirect_uri:callback,grant_type:'authorization_code'});
    const user=await providerJSON('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{
      headers:{Authorization:'Bearer '+token.access_token}});
    const channel=user.items?.[0];
    if(!channel?.id)throw invalid('YouTube channel not found. Create a channel and reconnect.',422);
    return [{platform,providerId:channel.id,name:channel.snippet?.title||'YouTube channel',
      accessToken:token.access_token,refreshToken:token.refresh_token||null,
      expiresAt:Date.now()+Number(token.expires_in||3500)*1000}];
  }
  if(platform==='tiktok'){
    const token=await postForm('https://open.tiktokapis.com/v2/oauth/token/',{
      client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,
      code,grant_type:'authorization_code',redirect_uri:callback});
    const info=await providerJSON('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',{
      headers:{Authorization:'Bearer '+token.access_token}});
    const user=info.data?.user||{};
    const id=String(token.open_id||user.open_id||'');
    if(!id)throw invalid('TikTok did not return an account identifier',502);
    return [{platform,providerId:id,name:user.display_name||'TikTok account',
      accessToken:token.access_token,refreshToken:token.refresh_token||null,
      expiresAt:Date.now()+Number(token.expires_in||86400)*1000}];
  }
  const version=env.META_GRAPH_VERSION||META_VERSION;
  const short=await providerJSON('https://graph.facebook.com/'+version+'/oauth/access_token?'+new URLSearchParams({
    client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,
    redirect_uri:callback,code}));
  const long=await providerJSON('https://graph.facebook.com/'+version+'/oauth/access_token?'+new URLSearchParams({
    grant_type:'fb_exchange_token',client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,
    fb_exchange_token:short.access_token}));
  const pages=await providerJSON('https://graph.facebook.com/'+version+'/me/accounts?'+new URLSearchParams({
    fields:'id,name,access_token,instagram_business_account{id,username}',limit:'100',
    access_token:long.access_token}));
  const accounts=[];
  for(const page of pages.data||[]){
    if(!page.id||!page.access_token)continue;
    if(platform==='facebook')
      accounts.push({platform,providerId:String(page.id),name:page.name||'Facebook Page',
        accessToken:page.access_token,refreshToken:null,expiresAt:null});
    if(platform==='instagram'&&page.instagram_business_account?.id)
      accounts.push({platform,providerId:String(page.instagram_business_account.id),
        name:page.instagram_business_account.username||page.name||'Instagram professional account',
        accessToken:page.access_token,refreshToken:null,expiresAt:null});
  }
  if(!accounts.length)throw invalid(platform==='instagram'
    ? 'No authorized Instagram professional account linked to a Facebook Page'
    : 'No authorized Facebook Page with posting permissions',422);
  return accounts;
}
async function saveAccount(env,library,entry){
  const now=Date.now();
  const old=await env.DB.prepare(
    'SELECT id,refresh_cipher FROM guest_social_accounts WHERE library_id=? AND platform=? AND provider_id=?')
    .bind(library,entry.platform,entry.providerId).first();
  const token=await seal(env,entry.accessToken);
  const refresh=entry.refreshToken?await seal(env,entry.refreshToken):old?.refresh_cipher||null;
  if(old){
    await env.DB.prepare('UPDATE guest_social_accounts SET display_name=?,token_cipher=?,refresh_cipher=?,expires_at=?,status=?,updated_at=? WHERE id=? AND library_id=?')
      .bind(String(entry.name).slice(0,120),token,refresh,entry.expiresAt,'connected',now,old.id,library).run();
  }else{
    await env.DB.prepare('INSERT INTO guest_social_accounts(id,library_id,platform,provider_id,display_name,token_cipher,refresh_cipher,expires_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),library,entry.platform,entry.providerId,String(entry.name).slice(0,120),
        token,refresh,entry.expiresAt,'connected',now,now).run();
  }
}
export async function oauthCallback(req,env){
  const url=new URL(req.url),platform=url.pathname.split('/').pop(),id=url.searchParams.get('state')||'';
  if(!CHANNELS.has(platform)||!id||id.length>130)return new Response('Invalid OAuth callback',{status:400});
  const state=await env.DB.prepare('SELECT * FROM guest_social_oauth_states WHERE id=? AND platform=?')
    .bind(id,platform).first();
  if(!state||state.expires_at<Date.now())return new Response('Connection expired. Return to BallEngine and try again.',{status:400});
  // The one-time state is consumed BEFORE exchanging a provider authorization code.
  const deleted=await env.DB.prepare('DELETE FROM guest_social_oauth_states WHERE id=? AND platform=?')
    .bind(id,platform).run();
  if(!deleted.meta?.changes)return new Response('Authorization already used',{status:409});
  const destination=new URL('/automation/accounts',state.redirect_origin);
  if(url.searchParams.get('error')||!url.searchParams.get('code')){
    destination.searchParams.set('social','denied');
    return Response.redirect(destination,302);
  }
  try{
    const records=await recordsFromOAuth(env,platform,url.searchParams.get('code'),state.code_verifier);
    for(const record of records)await saveAccount(env,state.library_id,record);
    destination.searchParams.set('social','connected');
  }catch(e){
    // Never return provider credentials or raw provider responses in redirects.
    console.error('Social OAuth callback failed',platform,e?.status||500,e?.name||'Error');
    destination.searchParams.set('social','failed');
  }
  return Response.redirect(destination,302);
}
export async function listAccounts(env,library){
  const rows=await env.DB.prepare('SELECT id,platform,provider_id,display_name,expires_at,status,created_at,updated_at FROM guest_social_accounts WHERE library_id=? ORDER BY platform,display_name')
    .bind(library).all();
  return (rows.results||[]).map(x=>({id:x.id,platform:x.platform,providerId:x.provider_id,
    name:x.display_name,status:x.status,expiresAt:x.expires_at?new Date(x.expires_at).toISOString():null,
    createdAt:new Date(x.created_at).toISOString()}));
}
export async function disconnectAccount(env,library,id){
  const record=await env.DB.prepare('SELECT id FROM guest_social_accounts WHERE id=? AND library_id=?').bind(id,library).first();
  if(!record)throw invalid('Social account not found',404);
  await env.DB.prepare("UPDATE guest_social_deliveries SET status='cancelled',last_error='Account disconnected',updated_at=? WHERE library_id=? AND account_id=? AND status IN ('queued','retry')")
    .bind(Date.now(),library,id).run();
  await env.DB.prepare('DELETE FROM guest_social_accounts WHERE id=? AND library_id=?').bind(id,library).run();
  return {disconnected:true};
}
export async function accessToken(env,account){
  let value=await unseal(env,account.token_cipher);
  if(!account.expires_at||account.expires_at>Date.now()+300000)return value;
  const refresh=account.refresh_cipher?await unseal(env,account.refresh_cipher):null;
  if(!refresh)throw invalid('Social authorization expired. Reconnect your account.',401);
  let updated;
  if(account.platform==='youtube'){
    updated=await postForm('https://oauth2.googleapis.com/token',{
      client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,
      grant_type:'refresh_token',refresh_token:refresh});
  }else if(account.platform==='tiktok'){
    updated=await postForm('https://open.tiktokapis.com/v2/oauth/token/',{
      client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,
      grant_type:'refresh_token',refresh_token:refresh});
  }else throw invalid('Social authorization expired. Reconnect your account.',401);
  if(!updated.access_token)throw invalid('Unable to refresh social authorization',401);
  value=updated.access_token;
  const now=Date.now();
  await env.DB.prepare('UPDATE guest_social_accounts SET token_cipher=?,refresh_cipher=?,expires_at=?,updated_at=? WHERE id=?')
    .bind(await seal(env,value),updated.refresh_token?await seal(env,updated.refresh_token):account.refresh_cipher,
      now+Number(updated.expires_in||3600)*1000,now,account.id).run();
  return value;
}
export {providerJSON,invalid};
