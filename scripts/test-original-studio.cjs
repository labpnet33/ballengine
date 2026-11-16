'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
// Verify that the consolidated public captures are served by the ORIGINAL
// website root. No alternate Studio app or new custom pages are generated.
const expectedPublicFiles=[
  'download/index.html',
  'de/download/index.html',
  'es/download/index.html',
  'fr/download/index.html',
  'ja/download/index.html',
  'zh-tw/download/index.html',
  'assets/physics.worker-DRvxAjdb.js',
  'assets/crush.worker-phV1EFRY.js',
  'assets/magnetic.worker-QnwGMRP0.js',
  'sfx/chirp-1-0-0.wav',
  'how-to-clips/mode-ball-crush.39d4f25a7d.jpg',
  'models/instruments/mallet_37d60d3c-4dde-4cdf-9847-81186b6afd8a_1786705098540.glb'
];
for (const rel of expectedPublicFiles) {
  const file=path.join(root,rel);
  assert.ok(fs.existsSync(file)&&fs.statSync(file).size>0,
    'Missing merged page or static resource: '+rel);
}
// Deep-link /home must reuse the original React homepage shell, not a new UI.
const rootHome=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(rootHome.includes('<base href="/">'),'Homepage must use root assets');
for(const route of ['index.html','home.html','home/index.html']){
  const html=fs.readFileSync(path.join(root,route),'utf8');
  assert.ok(html.includes('<base href="/">'),'Missing root asset base on '+route);
  assert.ok(/<script src="\/studio-guest-preview\.js\?v=[a-f0-9]{16}"><\/script>/.test(html),
    'Guest authentication adapter missing on '+route);
  assert.equal((html.match(/studio-guest-preview\.js/g)||[]).length,1,
    'Duplicate guest adapter on '+route);
  assert.equal(html,rootHome,'Homepage routes must use exactly the same original React shell');
}
const originalStudio=fs.readFileSync(path.join(root,'studio','index.html'),'utf8');
assert.ok(originalStudio.includes('index-3pf76ICO.js')&&originalStudio.includes('id="root"'),
  'Original captured React Studio replaced or damaged');
const directStudio=fs.readFileSync(path.join(root,'studio.html'),'utf8');
for (const [route,html] of [['/studio',originalStudio],['/studio.html',directStudio]]) {
  assert.ok(/<script src="\/studio-guest-preview\.js\?v=[a-f0-9]{16}"><\/script>/.test(html),
    'Agency / Max guest bootstrap missing on '+route);
  assert.equal((html.match(/studio-guest-preview\.js/g)||[]).length,1,
    'Guest profile adapter duplicated on '+route);
}
const patchedBundle=fs.readFileSync(path.join(root,'assets','index-3pf76ICO.js'),'utf8');
assert.ok(patchedBundle.includes('beAuthUser||window.__BALLENGINE_LOCAL_GUEST__||null'),
  'Original /home route is still dependent on a remote login session');
assert.ok(patchedBundle.includes('children:[s.jsxs("button",{type:"button",onClick:i,title:Xe("Reset to default")'),
  'Toolbar reset button is missing or no longer wired to original onReset callback');
assert.ok(patchedBundle.includes('children:Xe("Reset to default")})]}),s.jsxs("select",'),
  'Toolbar reset should appear directly before the duration selector');
assert.ok(patchedBundle.includes('const Wt=null,Xt=!1,Gt={raw:null,tid:"local-"+crypto.randomUUID(),res:uV(Ve,ke),wm:!1,stamp:null};'),
  'Native local MP4 export still requires the private upstream export ticket');
assert.ok(!patchedBundle.includes('let Ot=null,Wt=null,Xt=!1;try{const jt=crypto.randomUUID()'),
  'Original export ticket request is still present');
// Preview-quality optimization must affect only the live drawing buffers.
// Native frame-by-frame MP4 export continues using selected width/height.
assert.ok(patchedBundle.includes('return window.isOfflineRendering===!0?r:Math.max(.35,r*.75)'),
  '2D live preview is not scaled independently from offline rendering');
assert.ok(patchedBundle.includes('nCt()*(window.isOfflineRendering===!0?1:.75);return this.applied=i,i'),
  '3D adaptive preview lost its separate reduced pixel ratio');
assert.ok(patchedBundle.includes('d=Opt(t.width),u=Opt(t.height)'),
  'MP4 encoder no longer uses selected output width and height');
assert.ok(patchedBundle.includes('MWe(re>1?Math.max(te,Math.min(te*re,3)):te)'),
  'Offline high-resolution render DPR override missing');
const vm=require('node:vm');
const previewFnBody=patchedBundle.split('function a2(e)')[1]?.split('function hrn(')[0];
assert.ok(previewFnBody,'Preview DPR implementation missing');
const mockPreview=(isOfflineRendering)=>vm.runInNewContext(
  'const oie=null,ZTe=null,Bae=1;'+
  'function wc(){return false}function nCt(){return 1}function urn(){return 1}'+
  'function DP(){return false}function A0e(){return {dprCap:1}}'+
  'function a2(e)'+previewFnBody+';a2(false)',
  {window:{isOfflineRendering}}
);
assert.equal(mockPreview(false),0.75,'Live preview should render at 75% DPR');
assert.equal(mockPreview(true),1,'Offline export must not inherit reduced preview DPR');
const adapter=fs.readFileSync(path.join(root,'studio-guest-preview.js'),'utf8');
assert.ok(adapter.includes("plan:'ENTERPRISE'")&&adapter.includes("agency_plan:'AGENCY'")&&adapter.includes("automation_plan:'MAX'"),
  'Guest must use native unlocked Studio tier with Agency / Max local labels');
assert.ok(adapter.includes('window.__BALLENGINE_LOCAL_GUEST__=guest'),
  'Local guest fallback is missing from the shared homepage/Studio bootstrap');
assert.ok(adapter.includes("url.pathname==='/api/studio/video-export' && method==='POST'"),
  'Legacy local export telemetry is still calling the missing upstream API');
console.log('Original Studio intact; merged public routes and worker/CDN assets verified.');

const mime={
 '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp',
 '.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm','.mp4':'video/mp4'
};
const server=http.createServer((req,res)=>{
 let url;
 try {url=new URL(req.url,'http://localhost');}catch {res.writeHead(400).end();return;}
 let rel=(url.pathname==='/studio'||url.pathname==='/studio/')?
   'studio/index.html':(url.pathname==='/home'||url.pathname==='/home/')?
   'home/index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
 if(!rel || rel.endsWith('/'))rel+='index.html';
 const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
 fs.readFile(file,(err,body)=>{
   if(err){res.writeHead(404,{'content-type':'text/plain'}).end('Not found');return;}
   res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
   res.end(body);
 });
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await context.newPage();
 const pageErrors=[],failedAssets=[],apiRequests=[];
 page.on('pageerror',err=>pageErrors.push(String(err).slice(0,280)));
 page.on('response',res=>{
   if(res.url().includes('/api/'))apiRequests.push({status:res.status(),path:new URL(res.url()).pathname});
   else if(res.status()===404)failedAssets.push(new URL(res.url()).pathname);
 });
 const base='http://127.0.0.1:'+port;
 try{
   await page.goto(base+'/studio?mode=ball-crush',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(9000);
   const currentUrl=new URL(page.url());
   const body=await page.locator('body').innerText();
   const rootHTML=await page.locator('#root').innerHTML();
   const guest=await page.evaluate(async()=>{
     const r=await fetch('/api/auth/me');const u=(await r.json()).user;return{status:r.status,id:u.id,plan:u.plan,allModes:u.can_use_all_modes};
   });
   const locks=await page.evaluate(async()=>{
     const r=await fetch('/api/ui-locks');return{status:r.status,data:await r.json()};
   });
   const localExportStatus=await page.evaluate(async()=>{
     const response=await fetch('/api/studio/video-export',{
       method:'POST',headers:{'Content-Type':'application/json'},body:'{"completed":true}'
     });
     return {status:response.status,json:await response.json()};
   });
   assert.equal(localExportStatus.status,200,'Local export telemetry did not resolve');
   const stuckOverlay=await page.getByText('Checking your plan and settings.',{exact:true}).count();
   const creatorLockButtons=await page.getByRole('button',{name:/Unlock Creator/i}).count();
   const tourPromptVisible=await page.getByText('Quick tour?',{exact:true}).isVisible();
   const randomizeTipVisible=await page.getByText('Shuffle just one part',{exact:true}).isVisible();
   const report={
     url:currentUrl.pathname+currentUrl.search,
     title:await page.title(),
     guest,
     locks,
     localExportStatus,
     stuckOverlay,
     creatorLockButtons,
     tourPromptVisible,
     randomizeTipVisible,
     reactDOMLength:rootHTML.length,
     bodyExcerpt:body.slice(0,900),
     missingAssets:[...new Set(failedAssets)].slice(0,25),
     apiRequests:apiRequests.slice(0,25),
     pageErrors:pageErrors.slice(0,12)
   };
   fs.mkdirSync(path.resolve(__dirname,'..','test-results'),{recursive:true});
   await page.screenshot({path:path.resolve(__dirname,'..','test-results','studio-original.png'),fullPage:false});
   fs.writeFileSync(path.resolve(__dirname,'..','test-results','report.json'),JSON.stringify(report,null,2));
   console.log(JSON.stringify(report,null,2));
   // Direct loads must retain the local session and avoid /login.
   await page.goto(base+'/home',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(2500);
   const homeAuth=await page.evaluate(async()=>{
     const response=await fetch('/api/auth/me');
     return (await response.json()).user;
   });
   assert.equal(homeAuth.plan,'ENTERPRISE','/home must use the native unlocked guest Studio plan');
   assert.equal(homeAuth.agency_plan,'AGENCY','/home lost Agency guest access');
   assert.equal(homeAuth.can_use_all_modes,true,'/home lost unrestricted local modes');
   assert.equal(homeAuth.automation_plan,'MAX','/home did not load Max automation tier');
   assert.equal(new URL(page.url()).pathname,'/home','/home redirected to login');

   assert.equal(guest.id,'local-preview-guest','guest preview adapter did not activate');
   assert.equal(guest.plan,'ENTERPRISE','local preview guest must use the native top Studio tier');
   assert.equal(guest.allModes,true,'all development modes must be selectable in local preview');
   const automationTier=await page.evaluate(async()=>(await(await fetch('/api/auth/me')).json()).user.automation_tier);
   assert.equal(automationTier,'MAX','Guest Max automation tier missing');
   assert.equal(locks.status,200,'local UI-lock configuration was not served');
   assert.deepEqual(locks.data,[],'local UI-lock configuration must contain no remote overrides');
   assert.equal(stuckOverlay,0,'Studio is still blocked on account and plan configuration');
   assert.equal(creatorLockButtons,0,'Creator paywall button is still visible in local preview');
   assert.equal(tourPromptVisible,false,'Quick tour popup is visible after loading Studio');
   assert.equal(randomizeTipVisible,false,'Randomization tip is visible after loading Studio');
   assert.ok(currentUrl.pathname.startsWith('/studio'),'original React app redirected to login or another page');
   assert.ok(rootHTML.length>1000,'React app did not render a substantial UI');
   assert.ok(!/(?:^|\/)(?:login|signup)(?:\/|$)/.test(currentUrl.pathname),'login route displayed instead of Studio');
   if(pageErrors.some(x=>x.includes('Minified React error'))) throw new Error('Uncaught React runtime error');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;server.close();});
