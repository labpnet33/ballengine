import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {seal,unseal,beginOAuth,providerReadiness,providerJSON} from '../cloud-saves/social-oauth.mjs';
import {guestSocial,isGuestSocialCallback,runSocialSchedule} from '../cloud-saves/guest-social.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const files=['../cloud-saves/worker.mjs','../cloud-saves/guest-social.mjs',
  '../cloud-saves/social-oauth.mjs','../cloud-saves/social-publish.mjs',
  '../scripts/ballengine-guest-social.js','../scripts/ballengine-cloud-saves.js',
  '../scripts/build-original-studio.cjs'];
class FakeDB {
  constructor(){this.sql=[];}
  prepare(sql){
    this.sql.push(sql);
    return {bind(...params){
      return {first:async()=>null,all:async()=>({results:[]}),
        run:async()=>({meta:{changes:1}})};
    }};
  }
}
const DB=new FakeDB();
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
const fail=(message,status)=>json({error:message},status);
const noLimit=async()=>{};

test('new worker entrypoints retain existing original site integrations',()=>{
  const worker=fs.readFileSync(resolve(here,files[0]),'utf8');
  const build=fs.readFileSync(resolve(here,files.at(-1)),'utf8');
  const proxy=fs.readFileSync(resolve(here,'../scripts/ballengine-cloud-saves.js'),'utf8');
  assert.match(worker,/isGuestPublishing/);
  assert.match(worker,/isGuestSocialCallback/);
  assert.match(worker,/async scheduled/);
  assert.match(worker,/isPrivateMusic/);
  assert.match(build,/ballengine-guest-publishing\.js/);
  assert.match(build,/ballengine-guest-social\.js/);
  assert.match(build,/autopilotEntitlementBefore/);
  assert.match(build,/autopilotLoadingBefore/);
  assert.match(build,/__BALLENGINE_LOCAL_GUEST__/);
  assert.match(proxy,/guest-social/);
  assert.ok(!build.includes("fs.writeFileSync(path.join(web,'new-automation.html')"));
});
test('guest status includes all platforms and never requires a subscription',async()=>{
  const req=new Request('https://worker.test/api/guest-social/status');
  const res=await guestSocial(req,{DB},'private-hash','',json,fail,noLimit);
  assert.equal(res.status,200);
  const status=await res.json();
  assert.equal(status.subscriptionRequired,false);
  assert.equal(status.guestAccess,true);
  assert.equal(status.schedulerConfigured,false);
  assert.equal(status.connectedAccounts,0);
  assert.deepEqual(Object.keys(status.providers).sort(),['facebook','instagram','tiktok','youtube']);
  for(const p of Object.values(status.providers))assert.equal(p.configured,false);
});
test('no OAuth credentials means no misleading connected-account success',async()=>{
  const res=await guestSocial(
    new Request('https://worker.test/api/guest-social/connect/youtube',{method:'POST'}),
    {DB},'guest-hash','',json,fail,noLimit);
  assert.equal(res.status,503);
});
test('automatic jobs cannot be silently queued without a scheduler',async()=>{
  const res=await guestSocial(
    new Request('https://worker.test/api/guest-social/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title:'Video',consent:true})}),
    {DB},'guest-hash','',json,fail,noLimit);
  assert.equal(res.status,503);
});
test('OAuth callback must have a known provider and one-time state',()=>{
  assert.equal(isGuestSocialCallback('/api/guest-social/oauth/callback/youtube'),true);
  assert.equal(isGuestSocialCallback('/api/guest-social/oauth/callback/instagram'),true);
  assert.equal(isGuestSocialCallback('/api/guest-social/oauth/callback/facebook'),true);
  assert.equal(isGuestSocialCallback('/api/guest-social/oauth/callback/tiktok'),true);
  assert.equal(isGuestSocialCallback('/api/guest-social/oauth/callback/evil'),false);
});
test('provider tokens encrypt with random IV and decrypt only using the correct key',async()=>{
  const key=crypto.getRandomValues(new Uint8Array(32));
  const base64=btoa(String.fromCharCode(...key)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const env={SOCIAL_TOKEN_SECRET:base64};
  const a=await seal(env,'token-MUST-NOT-BE-PLAINTEXT');
  const b=await seal(env,'token-MUST-NOT-BE-PLAINTEXT');
  assert.notEqual(a,b);
  assert.ok(!a.includes('PLAINTEXT'));
  assert.equal(await unseal(env,a),'token-MUST-NOT-BE-PLAINTEXT');
  await assert.rejects(()=>unseal({SOCIAL_TOKEN_SECRET:base64.replace(/.$/,'A')},a));
});
test('OAuth creates a server-side Google consent URL without exposing secrets',async()=>{
  const db=new FakeDB(),key=crypto.getRandomValues(new Uint8Array(32));
  const env={DB:db,SOCIAL_WORKER_URL:'https://social.example.workers.dev',
    GOOGLE_CLIENT_ID:'test-public-client',GOOGLE_CLIENT_SECRET:'never-leak-secret',
    SOCIAL_TOKEN_SECRET:btoa(String.fromCharCode(...key))};
  const result=await beginOAuth(new Request('https://social.example.workers.dev/api/guest-social/connect/youtube'),
    env,'guest-hash','youtube','https://ballengine.vercel.app');
  const u=new URL(result.authorizationUrl);
  assert.equal(u.hostname,'accounts.google.com');
  assert.ok(u.searchParams.get('scope').includes('youtube.upload'));
  assert.ok(!result.authorizationUrl.includes('never-leak-secret'));
  assert.ok(db.sql.some(x=>x.includes('guest_social_oauth_states')));
});
test('cron is opt-in and does no provider posting without authorization',async()=>{
  const result=await runSocialSchedule({DB});
  assert.equal(result.disabled,true);
  assert.equal(result.processed,0);
});
test('no hardcoded platform passwords or paid subscription bypasses',()=>{
  for(const p of files){
    const text=fs.readFileSync(resolve(here,p),'utf8');
    assert.doesNotMatch(text,/api_key\s*=\s*['"]AIza[a-z0-9_-]+/i);
  }
  const ui=fs.readFileSync(resolve(here,'../scripts/ballengine-guest-social.js'),'utf8');
  for(const word of ['authorizationUrl','TikTok','Autopilot','consent','Connected accounts','Queue automatic post'])
    assert.ok(ui.includes(word),'UI missing '+word);
});

test('TikTok uses an error envelope even for successful API responses',async()=>{
  const prior=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({
      data:{privacy_level_options:['SELF_ONLY']},
      error:{code:'ok',message:'',log_id:'example'}
    }),{status:200,headers:{'Content-Type':'application/json'}});
    const result=await providerJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/');
    assert.deepEqual(result.data.privacy_level_options,['SELF_ONLY']);
    globalThis.fetch=async()=>new Response(JSON.stringify({
      data:{},error:{code:'scope_not_authorized',message:'Permission not granted'}
    }),{status:200,headers:{'Content-Type':'application/json'}});
    await assert.rejects(()=>providerJSON('https://open.tiktokapis.com/v2/post/publish/creator_info/query/'),/Permission not granted/);
  }finally{globalThis.fetch=prior;}
});


test('captured Accounts tab never routes guest Connect through subscription Plan',()=>{
  const script=fs.readFileSync(resolve(here,'../scripts/ballengine-guest-social.js'),'utf8');
  assert.match(script,/native\.dataset\.beReplacedByGuestOAuth='1'/);
  assert.match(script,/native\.hidden=true;native\.style\.display='none'/);
  assert.match(script,/event\.stopImmediatePropagation\(\)/);
  assert.match(script,/data-tour="auto-accounts"/);
  assert.match(script,/window\.location\.replace\('\/automation\/accounts'\)/);
  assert.match(script,/action\.click\(\)/);
  assert.match(script,/if\(!configured\)\{/);
  assert.match(script,/SOCIAL_TOKEN_SECRET/);
  assert.ok(!script.includes("window.location.assign('/automation/plan')"));
});
