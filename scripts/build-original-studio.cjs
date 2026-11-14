'use strict';

// Preview-only build of the original, captured BallEngine frontend.
// Do not overwrite the original React UI with a simplified replacement.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const web = path.join(repo, 'extra', 'wget', 'ballengine.app');
const staticCapture = path.join(repo, 'captures', 'studio-browser', 'ballengine.app');
const needed = [
  'assets/index-3pf76ICO.js',
  'assets/index-DoMKM56W.css',
  'assets/vendor-react-kqrIXDwM.js',
  'assets/vendor-motion-EOl-odwX.js',
  'assets/crush.worker-phV1EFRY.js',
  'assets/magnetic.worker-QnwGMRP0.js',
  'assets/physics.worker-DRvxAjdb.js'
];
function verify(name) {
  const file = path.join(web, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size < 1)
    throw new Error('Required original Studio resource missing: ' + file);
}
if (!fs.existsSync(path.join(web, 'studio.html')))
  throw new Error('Original studio.html not present. Refusing to replace it with a rebuilt interface.');
if (!fs.existsSync(staticCapture))
  throw new Error('Curated Studio static assets not present: ' + staticCapture);
const originalStudio = fs.readFileSync(path.join(web,'studio.html'),'utf8');
if (!originalStudio.includes('id="root"') ||
    !originalStudio.includes('index-3pf76ICO.js'))
  throw new Error('studio.html does not contain the expected original React entrypoint.');

let copied=0, already=0;
const protectedPaths=new Set(['studio.html','index.html']);
function walk(folder, relative='') {
  for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const from = path.join(folder,entry.name);
    const rel=path.join(relative,entry.name);
    const to=path.join(web,rel);
    if(entry.isDirectory()) {walk(from,rel);continue;}
    if(!entry.isFile())continue;
    // Curated static files only. Never include HAR, WACZ or captured API bodies.
    if (protectedPaths.has(rel) || rel.startsWith('api'+path.sep))continue;
    fs.mkdirSync(path.dirname(to),{recursive:true});
    if (fs.existsSync(to)) {already++;continue;}
    fs.copyFileSync(from,to);copied++;
  }
}
walk(staticCapture);

// Consolidate other public captures into the EXISTING site output directory.
// Original wget pages and the original Studio entrypoint always take priority.
// Canonical HTML routes are imported only when no equivalent wget page exists.
// Query snapshots, service workers, challenges and backend responses are excluded.
const supplementalCaptures = [
  {name:'full-site Playwright',root:path.join(repo,'captures','full-site','playwright','site')},
  {name:'first Playwright',root:path.join(repo,'playwright','site')},
  {name:'studio tutorial CDN assets',root:path.join(repo,'captures','studio-browser','cdn.ballengine.app')}
];
const allowedSupplemental = /\.(?:html?|m?js|css|json|webmanifest|txt|xml|svg|png|jpe?g|gif|webp|avif|ico|woff2?|otf|ttf|wav|mp3|ogg|m4a|mp4|webm|wasm|glb)$/i;
const deniedRoots = /^(?:api|_api|admin|cdn-cgi|_hosts)(?:\/|$)/i;
const imported = [];
function mergeMissingCapture({name,root}) {
  if (!fs.existsSync(root)) {
    console.warn('Supplemental capture not found (skipped):',name);
    return;
  }
  let added=0,existing=0,excluded=0,conflicts=0;
  function visit(dir,relative='') {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if (entry.name.startsWith('.')) {excluded++;continue;}
      const rel=relative?relative+'/'+entry.name:entry.name;
      if (deniedRoots.test(rel)) {excluded++;continue;}
      const source=path.join(dir,entry.name);
      if(entry.isDirectory()){visit(source,rel);continue;}
      if(!entry.isFile()||!allowedSupplemental.test(rel)||/__q_[a-z0-9]+\./i.test(rel)) {
        excluded++;continue;
      }
      if (['index.html','studio.html','studio/index.html','sw.js'].includes(rel)) {
        excluded++;continue;
      }
      // /about.html and /about/index.html represent the same public route.
      if (rel.endsWith('/index.html')) {
        const flat=rel.slice(0,-'/index.html'.length)+'.html';
        if(fs.existsSync(path.join(web,flat))) {existing++;continue;}
      }
      const target=path.join(web,rel);
      if(fs.existsSync(target)){
        existing++;
        if(fs.statSync(target).size!==fs.statSync(source).size) conflicts++;
        continue;
      }
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(source,target);
      added++;
      imported.push(rel);
    }
  }
  visit(root);
  console.log('Merged',name,':',added,'new assets/pages;',existing,'already covered;',excluded,'excluded;',conflicts,'size conflicts preserved');
}
for (const source of supplementalCaptures) mergeMissingCapture(source);
const requiredMergedPages=['download/index.html','es/download/index.html','fr/download/index.html','de/download/index.html','ja/download/index.html','zh-tw/download/index.html'];
for (const rel of requiredMergedPages) {
  if (!fs.existsSync(path.join(web,rel))) {
    throw new Error('Existing captured public page missing after consolidation: '+rel);
  }
}
console.log('Canonical download pages recovered:',requiredMergedPages.length);
console.log('Consolidation adds files to the existing original website, not a replacement Studio UI.');
needed.forEach(verify);
// Vercel's static output does not apply repository-root rewrites when the
// project Root Directory is nested. Publish /studio/index.html explicitly.
const studioDir=path.join(web,'studio');
fs.mkdirSync(studioDir,{recursive:true});
// /home is an existing client-side route, but this capture is deployed as static HTML.
// Reuse the original homepage shell for direct visits and reloads. Do not replace the UI.
// <base href="/"> keeps relative fonts, icons and JS/CSS rooted correctly at /home/.
const homeSource=path.join(web,'index.html');
const homeHTML=fs.readFileSync(homeSource,'utf8');
if(!homeHTML.includes('id="root"') || !homeHTML.includes('index-3pf76ICO.js'))
  throw new Error('Original homepage shell missing. Refusing to create /home from an incomplete page.');
// Apply the same local guest profile on the homepage as in Studio, so
// returning from /studio never depends on an unavailable upstream login API.
const guestAdapter='<script src="/studio-guest-preview.js"></script>';
const cloudAdapter='<script src="/ballengine-cloud-saves.js"></script>';
const publishingAdapter='<script src="/ballengine-guest-publishing.js"></script>';
const homeDocument=homeHTML
  .replaceAll('<base href="/">','')
  .replaceAll(guestAdapter,'')
  .replaceAll(cloudAdapter,'')
  .replaceAll(publishingAdapter,'')
  .replace('</head>','<base href="/">'+guestAdapter+cloudAdapter+publishingAdapter+'</head>');
// The root entrypoint must behave the same as /home for fresh visitors.
fs.writeFileSync(homeSource,homeDocument,'utf8');
const homeDir=path.join(web,'home');
fs.mkdirSync(homeDir,{recursive:true});
fs.writeFileSync(path.join(web,'home.html'),homeDocument,'utf8');
fs.writeFileSync(path.join(homeDir,'index.html'),homeDocument,'utf8');
console.log('Homepage route /home prepared from original HTML shell.');

// Expose the EXISTING captured /automation React page on static Vercel.
// The Vercel project deploys a nested Root Directory, so repository-root
// rewrites alone do not apply. A physical /automation/index.html is required
// for direct navigation and browser refresh (just like /studio/index.html).
// This is not a replacement page; it is the original automation.html document.
const automationSource=path.join(web,'automation.html');
if(!fs.existsSync(automationSource))
  throw new Error('Original automation.html missing. Refusing to invent an Automation page.');
const automationHTML=fs.readFileSync(automationSource,'utf8');
if(!automationHTML.includes('id="root"') ||
   !automationHTML.includes('index-3pf76ICO.js') ||
   !automationHTML.includes('Automation: publishing, scheduling and Autopilot'))
  throw new Error('The original Automation page changed; review capture before routing.');
const automationDocument=automationHTML
  .replaceAll('<base href="/">','')
  .replaceAll(guestAdapter,'')
  .replaceAll(cloudAdapter,'')
  .replaceAll(publishingAdapter,'')
  .replaceAll('src="assets/','src="/assets/')
  .replaceAll('href="assets/','href="/assets/')
  .replaceAll("src='assets/","src='/assets/")
  .replaceAll("href='assets/","href='/assets/")
  .replace('</head>','<base href="/">'+guestAdapter+cloudAdapter+publishingAdapter+'</head>');
fs.writeFileSync(automationSource,automationDocument,'utf8');
// All three paths are original React Router routes. These static HTML files
// only bootstrap the SAME captured React application for deep links.
for(const route of ['automation','automation/queue','automation/brands']){
  const folder=path.join(web,route);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'index.html'),automationDocument,'utf8');
}
console.log('Original Automation route, Queue and Brands deep links prepared.');

// Absolute asset paths work both at /studio and /studio/.
// All original Studio URLs must use the same local preview user entitlement.
// Keep this idempotent when Vercel retries or reuses a build directory.
const studioDocument=originalStudio
  .replaceAll('src="assets/', 'src="/assets/')
  .replaceAll('href="assets/', 'href="/assets/')
  .replaceAll("src='assets/", "src='/assets/")
  .replaceAll("href='assets/", "href='/assets/")
  .replace('</head>', (originalStudio.includes(guestAdapter)?'':guestAdapter)+(originalStudio.includes(cloudAdapter)?'':cloudAdapter)+(originalStudio.includes(publishingAdapter)?'':publishingAdapter)+'</head>');
// /studio.html is also reachable directly and via the Vercel /studio rewrite.
fs.writeFileSync(path.join(web,'studio.html'),studioDocument,'utf8');
fs.writeFileSync(path.join(studioDir,'index.html'),studioDocument,'utf8');
fs.copyFileSync(path.join(repo,'scripts','studio-guest-preview.js'),path.join(web,'studio-guest-preview.js'));
fs.copyFileSync(path.join(repo,'scripts','ballengine-cloud-saves.js'),path.join(web,'ballengine-cloud-saves.js'));
fs.copyFileSync(path.join(repo,'scripts','ballengine-guest-publishing.js'),path.join(web,'ballengine-guest-publishing.js'));
// Keep the existing pricing page and UI, but load the shared adapter there too
// so the missing private plan API's retry panel is suppressed on direct visits.
const plansPath=path.join(web,'plans.html');
const plansHTML=fs.readFileSync(plansPath,'utf8');
if(!plansHTML.includes('</head>'))throw new Error('Original plans page head missing.');
fs.writeFileSync(plansPath,
  plansHTML.replaceAll(guestAdapter,'').replace('</head>',guestAdapter+'</head>'),
  'utf8');

const originalBundle=path.join(web,'assets','index-3pf76ICO.js');
const newBundle=path.join(staticCapture,'assets','index-3pf76ICO.js');
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (digest(originalBundle)!==digest(newBundle))
  throw new Error('Main app bundle differs between original HTML capture and logged-in resources. Review before publishing.');
// The original captured React /home page redirects to /login while its
// authentication context has no current user. This independently hosted
// preview provides a local guest session rather than upstream authentication.
// Use it as a fallback for the existing /home component only; leave all other
// React routes and the original layout untouched.
const homeRouteBefore='dys=()=>{var k;const{user:e,loading:t}=Na(),{tDynamic:n,locale:a}=We()';
const homeRouteAfter='dys=()=>{var k;const{user:beAuthUser,loading:t}=Na(),e=beAuthUser||window.__BALLENGINE_LOCAL_GUEST__||null,{tDynamic:n,locale:a}=We()';
let capturedApp=fs.readFileSync(originalBundle,'utf8');
if (capturedApp.split(homeRouteBefore).length!==2)
  throw new Error('Expected exactly one original /home auth guard. Review frontend version before changing routes.');
capturedApp=capturedApp.replace(homeRouteBefore,homeRouteAfter);
// The existing Studio duration selector is rendered by qda(), which already
// receives onReset:i from the same parent as the original Saves-section button.
// Reuse that exact React callback in the top toolbar (not a DOM-cloned click),
// keeping the reset's undo/history behavior and all existing Studio controls.
const durationToolbarBefore='const Hr=s.jsxs("div",{"data-tour":"capture-duration","data-tour-exact-length":!0,className:"flex items-center gap-1.5 shrink-0",children:[s.jsxs("select",';
const durationToolbarAfter='const Hr=s.jsxs("div",{"data-tour":"capture-duration","data-tour-exact-length":!0,className:"flex items-center gap-1.5 shrink-0",children:[s.jsxs("button",{type:"button",onClick:i,title:Xe("Reset to default"),"aria-label":Xe("Reset to default"),className:"btn btn-sm h-8 sm:h-10 px-2 sm:px-2.5 border border-white/10 bg-white/5 text-zinc-100 hover:border-white/20 hover:bg-white/10 shrink-0 inline-flex items-center gap-1.5",children:[s.jsx(Di,{className:"w-3.5 h-3.5 shrink-0","aria-hidden":"true"}),s.jsx("span",{className:"hidden sm:inline",children:Xe("Reset to default")})]}),s.jsxs("select",';
if(capturedApp.split(durationToolbarBefore).length!==2)
  throw new Error('Expected one original duration toolbar. Review the captured bundle before adding reset.');
capturedApp=capturedApp.replace(durationToolbarBefore,durationToolbarAfter);
// This is an independently hosted static capture: it has no original private
// /api/studio/video-export backend to issue the remote signed export ticket.
// Keep the ORIGINAL in-browser, frame-by-frame MP4 renderer (Gpt) and Record UI,
// but remove only its initial server-ticket dependency for LOCAL exports.
// Do not call or imitate the upstream entitlement service.
const remoteExportStart='let Ot=null,Wt=null,Xt=!1;try{const jt=crypto.randomUUID()';
const remoteExportEnd='if(!Ot)return;const Gt=Ot;';
const exportBegin=capturedApp.indexOf(remoteExportStart);
const exportFinish=exportBegin<0?-1:capturedApp.indexOf(remoteExportEnd,exportBegin);
if(exportBegin<0||exportFinish<0||
    capturedApp.indexOf(remoteExportStart,exportBegin+1)!==-1)
  throw new Error('Original local-export ticket gate changed; review before patching.');
const standaloneExport='const Wt=null,Xt=!1,Gt={raw:null,tid:"local-"+crypto.randomUUID(),res:uV(Ve,ke),wm:!1,stamp:null};';
capturedApp=capturedApp.slice(0,exportBegin)+standaloneExport+
  capturedApp.slice(exportFinish+remoteExportEnd.length);
console.log('Standalone local MP4 export enabled using original frame renderer; upstream ticket not requested.');
fs.writeFileSync(originalBundle,capturedApp,'utf8');
// Vercel's static build would otherwise report READY even if the edited 14MB
// browser bundle had a JavaScript syntax error.
require('node:child_process').execFileSync(process.execPath,
  ['--check',originalBundle],{stdio:'pipe',timeout:30000,maxBuffer:1024*1024});
console.log('Patched original Studio JavaScript syntax checked.');
console.log('Local guest fallback enabled in original /home React route.');


const soundsDir=path.join(web,'sfx');
const soundCount=fs.readdirSync(soundsDir).filter(n=>n.endsWith('.wav')).length;
if(soundCount<100)throw new Error('Only '+soundCount+' Studio sound effects found; expected over 100.');
const modeDir=path.join(web,'mode-thumbs');
const modeCount=fs.readdirSync(modeDir).filter(n=>n.endsWith('.webp')).length;
if(modeCount<18)throw new Error('Missing Studio mode thumbnail assets.');
console.log('Original Studio build completed (frontend assets only).');
console.log('Additional public static assets copied:',copied);
console.log('Already present:',already);
console.log('Sound effects:',soundCount,'Mode thumbnails:',modeCount);
console.log('Runtime note: authenticated APIs and server-side rendering are not part of this capture.');


// Vite's entrypoint references extra dynamic JS chunks and simulation workers.
// Collect only publicly served, hashed /assets/*.js resources. Never request
// authenticated APIs, account data, or any original /studio page here.
async function collectPublicLazyModules() {
  const bundle=fs.readFileSync(originalBundle,'utf8');
  const paths=[...new Set(bundle.match(/assets\/[A-Za-z0-9._-]+\.js/g)||[])]
    .filter(rel=>!fs.existsSync(path.join(web,rel)));
  if(!paths.length){console.log('All referenced Studio JS modules available.');return;}
  console.log('Missing Vite JS modules and workers:',paths.length);
  const pending=paths.slice();
  let added=0;
  const failed=[];
  async function worker() {
    while(pending.length) {
      const rel=pending.shift();
      const url='https://ballengine.app/'+rel;
      try {
        const response=await fetch(url,{
          redirect:'manual',signal:AbortSignal.timeout(15000),
          headers:{Accept:'application/javascript, text/javascript;q=0.9, */*;q=0.1'}
        });
        if(!response.ok || new URL(response.url).origin!=='https://ballengine.app')
          throw new Error('HTTP '+response.status);
        const mime=(response.headers.get('content-type')||'').toLowerCase();
        if(mime.includes('html') || (!mime.includes('javascript') && !mime.includes('text/plain') && !mime.includes('octet-stream')))
          throw new Error('Unexpected MIME '+mime);
        const body=Buffer.from(await response.arrayBuffer());
        if(!body.length || body.length>25*1024*1024 || /^\\s*<!doctype|^\\s*<html/i.test(body.subarray(0,256).toString('utf8')))
          throw new Error('Invalid or oversized script');
        const file=path.join(web,rel);
        fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file,body);
        added++;
        console.log('Fetched original public JS:',rel,'('+body.length+' bytes)');
      } catch(e) {
        failed.push(rel+' ('+String(e.message||e)+')');
      }
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  console.log('Public JS modules recovered:',added,'Still missing:',failed.length);
  if(failed.length) {
    console.warn('Unavailable modules:');
    for(const line of failed)console.warn(' - '+line);
  }
}
collectPublicLazyModules().catch(e=>{
  console.error('Original asset collection failed:',e);
  process.exitCode=1;
});
