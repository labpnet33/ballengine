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
for(const route of ['automation','automation/accounts','automation/publish','automation/autopilot','automation/plan','automation/queue','automation/brands']){
  const folder=path.join(web,route);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'index.html'),automationDocument,'utf8');
}
console.log('Original Automation dashboard and existing tab deep links prepared.');

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

// QA-gated release of native experimental simulation controls. The captured
// engines exist already; do not promote them to live until independently
// verifying animation, controls, and MP4 export on this exact build.
const experimentalSlugs=[
  'phase-bloom','phonk-drop','marble-run','ball-race','target-hit','falling-sand',
  'plinko','color-match','spin-battle','lava-survival','glass-slice','flood-fill',
  'eulers-disk','drum-sort','plinko-3d','chladni','voxel','domino-3d',
  'marble-race-3d','attractor','flow-field','metaballs','galaxy','fireflies',
  'pendulum-basin','slime','crowd-evacuation'
];
// This feature branch is a testable release candidate; set the variable to
// '0' to revert to the original metadata without editing the captured app.
if(process.env.BALLENGINE_RELEASE_EXPERIMENTAL!=='0'){
  let released=0;
  for(const slug of experimentalSlugs){
    const re=new RegExp('(\{mode:"[A-Z0-9_]+",slug:"'+slug+'",[^{}]{0,800},status:)"development"','g');
    const matches=[...capturedApp.matchAll(re)];
    if(matches.length!==1)
      throw new Error('Expected exactly one experimental mode registry entry for '+slug+'; got '+matches.length);
    capturedApp=capturedApp.replace(re,'$1"live"');
    released++;
  }
  const remaining=(capturedApp.match(/status:"development"/g)||[]).length;
  if(released!==27||remaining!==0)
    throw new Error('Mode release incomplete: '+released+' promoted, '+remaining+' still under development');
  console.log('QA-gated native release enabled for',released,'simulation engines.');
}


// 2D MODE-PARITY FIX: Phonk Drop shares Rhythmic's physics/audio runner, but
// upstream omitted PHONK_DROP from the curated QP randomizer schema, leaving
// its Randomize toolbar button disabled despite working mode settings.
// Extend the ORIGINAL randomizer rather than injecting a fake UI action.
// The curated ranges respect the original mode's settings and avoid the
// missing realistic-face images (use bundled illustrated faces instead).
const randomizeGuard='function Ape(e){return!!e.randomizeChangeMode||!!QP[e.mode]}';
const phonkSchema=[
  'QP.PHONK_DROP={...QP.RHYTHMIC,weight:2,supportsSeed:!1,sound:"MELODY",',
  'fields:{...QP.RHYTHMIC.fields,',
  'phonkDropBuildLength:{kind:"int",min:10,max:35},',
  'phonkDropFaceScale:{kind:"range",min:.35,max:.68},',
  'phonkDropEyeGlow:{kind:"range",min:.4,max:1},',
  'phonkDropClimaxBurst:{kind:"bool",chance:.85},',
  'phonkDropEyeColor:{kind:"choice",options:["#ff2b2b","#fb7185","#a855f7","#22d3ee"]},',
  'phonkDropFace:{kind:"choice",options:["grinface","watcher","oni","cyclops","cinder_imp","hollow_jester"]}',
  '}};'
].join('');
if(capturedApp.split(randomizeGuard).length!==2)
  throw new Error('Original randomizer guard changed: review native code before patching Phonk Drop.');
if(capturedApp.includes('QP.PHONK_DROP='))
  throw new Error('Phonk Drop already has a randomizer schema; update this patch.');
capturedApp=capturedApp.replace(randomizeGuard,phonkSchema+randomizeGuard);
// The capture's mode preset defaults to "bloodshot", whose WEBP face and
// hands images were never captured. Start with a real bundled illustrated
// skin so preview & export don't render missing image layers.
const missingDefault='phonkDropFace:"bloodshot",phonkDropFaceScale:.45';
if(capturedApp.split(missingDefault).length!==2)
  throw new Error('Phonk Drop missing-image default changed; review capture.');
capturedApp=capturedApp.replace(missingDefault,'phonkDropFace:"grinface",phonkDropFaceScale:.45');
console.log('Phonk Drop native randomization and image-safe illustrated default enabled.');

// Experimental Domino 3D ships with 1,600 physics bodies at startup.
// On CPU/software-GPU export runners, even two seconds of output can take
// several minutes. Use a moderate default for NEW simulations while keeping
// the original settings UI's full count range available to existing projects.
const dominoDefault='domino3DCount:1600,domino3DLayout:"CIRCUIT_ROUND"';
if(capturedApp.split(dominoDefault).length!==2)
  throw new Error('Domino 3D count default changed; review source before applying performance fix.');
capturedApp=capturedApp.replace(dominoDefault,'domino3DCount:540,domino3DLayout:"CIRCUIT_ROUND"');
console.log('Domino 3D new-project default reduced to 540 bodies; full control remains available.');

// The original public capture omitted all realistic Phonk Drop WEBP skins.
// In the independent deployed site, substitute small self-contained vector
// textures rather than leaving broken/blank faces in a live simulation.
// The original illustrated skins and custom face/hand uploads remain intact.
const offlineFaceColours={
  classic_red:['#f87171','#991b1b','#fff1f2'],
  crimson_ink:['#fb7185','#4c0519','#ffe4e6'],
  void_purple:['#c084fc','#581c87','#f3e8ff'],
  cryo_cyan:['#67e8f9','#155e75','#ecfeff'],
  acid_yellow:['#fde047','#854d0e','#fef9c3'],
  hellfire:['#fb923c','#9a3412','#ffedd5'],
  bloodshot:['#fda4af','#881337','#fff1f2'],
  shadow_static:['#a1a1aa','#27272a','#f4f4f5'],
  golden_cursed:['#facc15','#a16207','#fef9c3'],
  ghost_blue:['#93c5fd','#1e40af','#eff6ff']
};
function offlinePhonkVector(skin,part){
  const palette=offlineFaceColours[skin]||offlineFaceColours.classic_red;
  const [base,dark,bright]=palette;
  const seed=Object.keys(offlineFaceColours).indexOf(skin);
  const eyes=seed%3===0?'#fef9c3':seed%3===1?'#e0f2fe':'#ffffff';
  if(part==='hands')return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<g fill="'+base+'" stroke="'+dark+'" stroke-width="15" stroke-linejoin="round">',
    '<path d="M83 475L33 390Q15 355 47 341Q66 331 87 351L58 281Q45 247 72 236Q96 230 112 265L116 205Q117 170 146 173Q166 178 167 208L180 254Q189 222 214 231Q236 245 224 273L217 363Q219 438 179 472Z"/>',
    '<path d="M429 475L479 390Q497 355 465 341Q446 331 425 351L454 281Q467 247 440 236Q416 230 400 265L396 205Q395 170 366 173Q346 178 345 208L332 254Q323 222 298 231Q276 245 288 273L295 363Q293 438 333 472Z"/>',
    '</g><path d="M109 395L172 420M403 395L340 420" stroke="'+bright+'" stroke-width="9" stroke-linecap="round"/></svg>'
  ].join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<defs><radialGradient id="skin" cx="43%" cy="30%" r="73%">',
    '<stop offset="0" stop-color="'+bright+'"/><stop offset=".48" stop-color="'+base+'"/>',
    '<stop offset="1" stop-color="'+dark+'"/></radialGradient></defs>',
    '<ellipse cx="256" cy="251" rx="202" ry="222" fill="url(#skin)" stroke="'+dark+'" stroke-width="15"/>',
    '<path d="M97 201Q151 155 205 194M307 193Q363 149 415 204" fill="none" stroke="'+dark+'" stroke-width="22" stroke-linecap="round"/>',
    '<ellipse cx="174" cy="241" rx="54" ry="60" fill="'+eyes+'" stroke="'+dark+'" stroke-width="11"/>',
    '<ellipse cx="338" cy="241" rx="54" ry="60" fill="'+eyes+'" stroke="'+dark+'" stroke-width="11"/>',
    '<ellipse cx="180" cy="252" rx="15" ry="30" fill="'+dark+'"/>',
    '<ellipse cx="333" cy="252" rx="15" ry="30" fill="'+dark+'"/>',
    '<path d="M116 334Q253 442 396 331Q378 443 257 453Q141 447 116 334Z" fill="'+dark+'" stroke="'+dark+'" stroke-width="8"/>',
    '<path d="M129 347Q258 400 383 345Q358 405 258 413Q166 405 129 347Z" fill="#fff"/>',
    '<path d="M178 369V395M224 381V407M275 384V407M324 371V397" fill="none" stroke="'+dark+'" stroke-width="6"/>',
    '<path d="M77 322Q98 314 112 319M395 319Q414 315 435 325" fill="none" stroke="'+bright+'" stroke-width="9" stroke-linecap="round"/>',
    '</svg>'
  ].join('');
}
const uncapturedRealisticAssets=new Map();
for(const match of capturedApp.matchAll(/\/assets\/([a-z_]+)\.(face|hands)-[A-Za-z0-9_-]+\.webp/g)){
  if(offlineFaceColours[match[1]]&&!fs.existsSync(path.join(web,match[0].slice(1))))
    uncapturedRealisticAssets.set(match[0],{skin:match[1],part:match[2]});
}
if(uncapturedRealisticAssets.size!==20)
  throw new Error('Expected 20 missing realistic Phonk skins; discovered '+uncapturedRealisticAssets.size);
for(const [asset,{skin,part}] of uncapturedRealisticAssets){
  const dataUri='data:image/svg+xml,'+encodeURIComponent(offlinePhonkVector(skin,part));
  capturedApp=capturedApp.replaceAll('"'+asset+'"','"'+dataUri+'"');
}
capturedApp=capturedApp.replace('title:"Realistic trollface"','title:"Offline vector face packs"');
console.log('Restored',uncapturedRealisticAssets.size,'uncaptured Phonk face/hand assets as independent vector fallbacks.');



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
