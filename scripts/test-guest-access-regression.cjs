'use strict';
// Regression guard for the original captured BallEngine guest UI.
// Run after build-original-studio.cjs with local HTTP server on port 8765.
// Set BALLENGINE_BASE_URL=https://ballengine.vercel.app for production checks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const repo=path.resolve(__dirname,'..');
const out=path.join(repo,'extra','wget','ballengine.app');
const base=(process.env.BALLENGINE_BASE_URL||'http://127.0.0.1:8765').replace(/\/+$/,'');
const live=base.startsWith('https://');
const source=fs.readFileSync(path.join(repo,'scripts','studio-guest-preview.js'),'utf8');
const version=crypto.createHash('sha256').update(source).digest('hex').slice(0,16);
const guestSrc='/studio-guest-preview.js?v='+version;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const norm=s=>s.replace(/\/+$/,'')||'/';

function sourceGuard(){
 assert.match(source,/plan:'ENTERPRISE'/,'Native Studio tier ENTERPRISE was lost; AGENCY is downgraded to FREE');
 assert.match(source,/agency_plan:'AGENCY'/,'Guest Agency label missing');
 assert.match(source,/automation_plan:'MAX'/,'Guest Max automation plan missing');
 assert.match(source,/automation_tier:'MAX'/,'Guest Max automation tier missing');
 assert.match(source,/can_use_all_modes:true/,'Guest all-modes access missing');
 assert.match(source,/window\.__BALLENGINE_LOCAL_GUEST__=guest/,'Local guest bootstrap missing');
 const build=fs.readFileSync(path.join(repo,'scripts','build-original-studio.cjs'),'utf8');
 assert.match(build,/localAgencyNormalizerAfter/,'Native Studio Agency normalization safeguard missing');
 assert.match(build,/localAgencyEffectiveAfter/,'Guest effective plan safeguard missing');
 assert.match(build,/agencyGuestVersion/,'Versioned guest cache safeguard missing');
 assert.match(build,/beAuthUser\|\|window\.__BALLENGINE_LOCAL_GUEST__\|\|null/,'Home login fallback missing');
}
function localGuard(){
 const bundle=fs.readFileSync(path.join(out,'assets','index-3pf76ICO.js'),'utf8');
 assert.ok(bundle.includes('return t==="AGENCY"?"ENTERPRISE":t.startsWith("AUTO_")?'),
   'Agency is no longer normalized to native Enterprise');
 assert.ok(bundle.includes('if(window.__BALLENGINE_LOCAL_GUEST__?.automation_tier==="MAX")return"ENTERPRISE";'),
   'Effective Studio tier can still downgrade Agency Max guests');
 assert.ok(bundle.includes('beAuthUser||window.__BALLENGINE_LOCAL_GUEST__||null'),
   'Home can redirect guests to login');
 const served=fs.readFileSync(path.join(out,'studio-guest-preview.js'),'utf8');
 assert.equal(served,source,'Built guest JS differs from reviewed source');
 for(const rel of ['home/index.html','studio/index.html','automation/index.html',
   'automation/accounts/index.html','automation/publish/index.html','automation/autopilot/index.html']){
   assert.ok(fs.readFileSync(path.join(out,rel),'utf8').includes('src="'+guestSrc+'"'),
     'Guest script missing or stale on '+rel);
 }
}
async function liveGuard(){
 const timeout=Math.max(0,Number(process.env.BALLENGINE_WAIT_SECONDS||0))*1000;
 const until=Date.now()+timeout;
 while(true){
   const r=await fetch(base+'/studio',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
   assert.equal(r.status,200,'Production Studio returned non-200');
   const html=await r.text();
   if(html.includes('src="'+guestSrc+'"'))break;
   if(Date.now()>=until)throw Error('Deployed Studio guest version mismatches tested source: expected '+guestSrc);
   await pause(5000);
 }
 const r=await fetch(base+guestSrc,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Production guest JS missing');
 const served=crypto.createHash('sha256').update(await r.text()).digest('hex').slice(0,16);
 assert.equal(served,version,'Deployed guest JS differs from tested source');
}
async function main(){
 sourceGuard();
 if(live)await liveGuard();else localGuard();
 const browser=await chromium.launch({headless:true,
   executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
   args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
 const page=await context.newPage();
 let route='';
 try{
   const routes=['/home','/studio?mode=ball-crush','/automation',
     '/automation/accounts','/automation/publish','/automation/autopilot'];
   for(route of routes){
     const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
     assert.equal(response.status(),200,'Route not accessible to guests: '+route);
     await page.waitForFunction(()=>!!window.__BALLENGINE_LOCAL_GUEST__,null,{timeout:15000});
     await page.locator('#root').waitFor({state:'attached',timeout:25000});
     const result=await page.evaluate(async()=>{
       const r=await fetch('/api/auth/me',{cache:'no-store'});
       return {status:r.status,user:(await r.json()).user};
     });
     assert.equal(result.status,200,'Guest session request failed');
     const guest=result.user;
     assert.equal(guest.is_guest,true,'Guest session not active');
     assert.equal(guest.plan,'ENTERPRISE','Studio guest plan downgraded');
     assert.equal(guest.agency_plan,'AGENCY','Agency local guest setting lost');
     assert.equal(guest.automation_plan,'MAX','Max automation plan lost');
     assert.equal(guest.automation_tier,'MAX','Max automation tier lost');
     assert.equal(guest.can_use_all_modes,true,'Guest simulation modes locked');
     assert.equal(norm(new URL(page.url()).pathname),norm(route.split('?')[0]),
       'Guest redirected to login or subscription page: '+route);
     if(route.startsWith('/automation')){
       await page.locator('nav[aria-label="Automation"]').waitFor({state:'visible',timeout:30000});
       if(route==='/automation/autopilot'){
         await page.locator('#root main [data-tour="autopilot-times"]')
           .waitFor({state:'visible',timeout:30000});
         assert.equal(await page.locator('#root main [aria-label="Loading Autopilot"]').count(),0,
           'Native Autopilot stuck loading');
       }
     }
     if(route.startsWith('/studio')){
       await page.waitForFunction(()=>document.querySelector('#root')?.innerText.length>500,
         null,{timeout:35000});
       await pause(1800);
       assert.equal(await page.getByRole('button',{name:/Unlock Creator/i}).count(),0,
         'Studio Unlock Creator paywall reappeared');
       assert.equal(await page.getByText('Feature locked',{exact:true}).count(),0,
         'Studio Feature locked paywall reappeared');
       const locks=await page.evaluate(async()=>{
         const r=await fetch('/api/ui-locks');return {status:r.status,value:await r.json()};
       });
       assert.equal(locks.status,200,'UI lock config endpoint failed');
       assert.deepEqual(locks.value,[],'Guest-specific UI locks reappeared');
     }
     console.log('GUEST_ACCESS_PASS '+JSON.stringify({route,plan:guest.plan,
       agency:guest.agency_plan,automation:guest.automation_tier}));
   }
   console.log('GUEST_ACCESS_REGRESSION_PASS '+JSON.stringify({
     environment:live?'production':'local',guestScriptVersion:version,
     routes:routes.length}));
 }catch(error){
   fs.mkdirSync(path.join(repo,'test-results'),{recursive:true});
   try{await page.screenshot({path:path.join(repo,'test-results','guest-access-failure.png')});}catch{}
   throw Error('Guest regression on '+route+': '+String(error.stack||error));
 }finally{await browser.close();}
}
main().catch(error=>{console.error('GUEST_ACCESS_REGRESSION_FAIL '+String(error.stack||error));process.exitCode=1;});
