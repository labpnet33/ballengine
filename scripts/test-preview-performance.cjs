'use strict';
// Validate the actual patched Stage3D controller in isolation and smoke-test
// the original 2D and 3D Studio in a real browser. No replacement UI.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'extra','wget','ballengine.app');
const bundle=fs.readFileSync(path.join(web,'assets','index-3pf76ICO.js'),'utf8');
const start=bundle.indexOf('const wfa={STANDARD:1,SHARP:1.5,MAX:2}');
const end=bundle.indexOf('const TO=new Mfa',start);
assert.ok(start>0&&end>start,'Native 3D FPS controller not found');
const state={
  now:2000,mobile:true,software:false,outputDpr:1.4,resizes:0,
  window:{devicePixelRatio:2,isRecording:false,isOfflineRendering:false,
    location:{search:''},dispatchEvent:()=>{state.resizes++;}}
};
const sandbox={
  Q:(obj,key,value)=>{obj[key]=value;},
  performance:{now:()=>state.now},
  window:state.window,Event:class{constructor(name){this.type=name;}},
  iie:()=>null,wc:()=>state.software,a2:()=>state.outputDpr,
  DP:()=>state.mobile,A0e:()=>({max3DDpr:1}),
  Jx:{light3D:()=>false},S8n:.75,nCt:()=>1
};
const {Mfa,Ree}=vm.runInNewContext(bundle.slice(start,end)+';({Mfa,Ree})',sandbox,{timeout:3000});
assert.equal(JSON.stringify([...Ree]),JSON.stringify([.75,1,1.25,1.5,1.75]));
const auto={scene3DPreviewSharpness:'AUTO'};
const m=new Mfa;
assert.equal(m.dprFor(auto),1,'AUTO must begin at original default 1x DPR');
assert.equal(m.autoActive(auto),true,'Mobile hardware should enable native FPS adaptation');
m.evaluate(35,auto,true);
state.now=3200;m.evaluate(35,auto,true);
assert.equal(m.dprFor(auto),.75,'Low FPS must decrease 3D preview resolution to 0.75x');
assert.equal(state.resizes,1,'Preview should resize exactly once at quality downgrade');
state.now=5200;m.evaluate(60,auto,true);
state.now=9500;m.evaluate(60,auto,true);
assert.equal(m.dprFor(auto),1,'Sustained healthy FPS must restore 1x quality');
assert.equal(state.resizes,2,'Preview should resize exactly once at quality recovery');

const beforeLevel=m.level;
state.window.isRecording=true;
assert.equal(m.autoActive(auto),false,'Record should stop preview quality auto-tuning');
assert.equal(m.dprFor(auto),state.outputDpr,'Record must use the original export resolution path');
state.now=14000;m.evaluate(20,auto,true);
assert.equal(m.level,beforeLevel,'Record must not degrade visual quality');
state.window.isRecording=false;
state.window.isOfflineRendering=true;
assert.equal(m.dprFor(auto),state.outputDpr,'Offline export must retain its original resolution');
assert.equal(m.autoActive(auto),false,'Offline export must not alter preview quality');
state.window.isOfflineRendering=false;
state.window.location.search='?isWorker=true';
assert.equal(m.autoActive(auto),false,'Export worker must never adaptive-tune');
state.window.location.search='';
state.mobile=false;
const manual=new Mfa;
const sharp={scene3DPreviewSharpness:'SHARP'};
assert.equal(manual.dprFor(sharp),1.5,'Explicit SHARP must be preserved');
assert.equal(manual.autoActive(sharp),false,'Manual preview setting must never auto-adjust');
state.now=17000;manual.evaluate(30,sharp,true);
state.now=22000;manual.evaluate(30,sharp,true);
assert.equal(manual.dprFor(sharp),1.5,'Slow FPS must not override selected SHARP');
const desktop=new Mfa;
state.now=25000;desktop.evaluate(35,auto,true);
state.now=26500;desktop.evaluate(35,auto,true);
assert.equal(desktop.dprFor(auto),.75,'Desktop Auto preview needs a low-FPS fallback');
state.software=true;
assert.equal(desktop.dprFor(auto),state.outputDpr,'Software renderer must retain its original resolution branch');
assert.equal(desktop.autoActive(auto),false,'Software renderer auto-adjustment must stay disabled');
// The original dynamic LOD controller already receives measured FPS; its
// visual-effect helper methods were previously no-ops. Validate that they
// reduce only preview overdraw at high-pressure tiers and reset for export.
const lodStart=bundle.indexOf('const qRt=1,YRt=2,RPe=3,$U=4,fre=5');
const lodEnd=bundle.indexOf('const Jx=new _8n',lodStart);
assert.ok(lodStart>0&&lodEnd>lodStart,'Native scene LOD controller not found');
const {Engine}=vm.runInNewContext(bundle.slice(lodStart,lodEnd)+';({Engine:_8n})',{
  Q:(obj,key,value)=>{obj[key]=value;},
  a0:()=>state.window.isRecording||state.window.isOfflineRendering===true
},{timeout:3000});
const lod=new Engine;
assert.equal(lod.trailStride(),1,'Normal FPS should preserve full trail detail');
assert.equal(lod.maxCollisionEffects(),Infinity,'Normal FPS should draw all collision effects');
assert.equal(lod.collisionParticleScale(),1,'Normal FPS should use full particle counts');
lod.live=4;
assert.equal(lod.trailStride(),2,'High pressure should draw every second trail point');
assert.equal(lod.maxCollisionEffects(),96,'High pressure should limit decorative effects');
assert.equal(lod.collisionParticleScale(),.75,'High pressure should reduce decorative particles');
lod.live=5;
assert.equal(lod.trailStride(),3,'Very low FPS should skip additional trail points');
assert.equal(lod.maxCollisionEffects(),36,'Very low FPS should further limit visual collisions');
assert.equal(lod.collisionParticleScale(),.5,'Very low FPS should use half as many particles');
state.window.isRecording=true;
assert.equal(lod.trailStride(),1,'Export must preserve every trail point');
assert.equal(lod.maxCollisionEffects(),Infinity,'Export must retain all collision effects');
assert.equal(lod.collisionParticleScale(),1,'Export must retain full particle density');
state.window.isRecording=false;
state.window.isOfflineRendering=true;
assert.equal(lod.trailStride(),1,'Offline MP4 rendering must retain full trail quality');
state.window.isOfflineRendering=false;
lod.live=0;
assert.equal(lod.maxCollisionEffects(),Infinity,'Recovered FPS must restore full effects');
console.log('ADAPTIVE_2D_EFFECTS_PASS '+JSON.stringify({
  collisionEffectCaps:[Infinity,96,36],trailStrides:[1,2,3],
  particleDensity:[1,.75,.5],exportUnaffected:true
}));

console.log('ADAPTIVE_3D_CONTROLLER_PASS '+JSON.stringify({
  initialDpr:1,slowSceneDpr:.75,restoredDpr:1,
  pixelFillReductionPct:43.75,
  originalManualQuality:true,originalExportSizing:true,softwareFallback:true
}));

if(process.env.PERF_BROWSER_SMOKE!=='1')process.exit(0);
const {chromium}=require('playwright-core');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2',
  '.wasm':'application/wasm','.wav':'audio/wav','.webp':'image/webp'};
const server=http.createServer((request,response)=>{
  try{
    let rel=new URL(request.url,'http://localhost').pathname.replace(/^\/+/,'');
    if(rel==='studio'||rel==='studio/')rel='studio/index.html';
    else if(!rel||rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(web,decodeURIComponent(rel));
    if(!file.startsWith(web+path.sep))return response.writeHead(403).end();
    fs.readFile(file,(err,content)=>err?response.writeHead(404).end():
      response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(content));
  }catch{response.writeHead(400).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const results=[];
  try{
    for(const options of [
      {mode:'ball-crush',width:390,height:844,mobile:true},
      {mode:'wave-3d',width:1366,height:900,mobile:false}
    ]){
      const context=await browser.newContext({
        viewport:{width:options.width,height:options.height},
        isMobile:options.mobile,hasTouch:options.mobile,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e).slice(0,250)));
      const started=Date.now();
      const response=await page.goto(base+'/studio?mode='+options.mode,{
        waitUntil:'domcontentloaded',timeout:50000});
      assert.equal(response.status(),200,'Original Studio route not served');
      // The original mobile Studio collapses or hides some desktop toolbar
      // controls. An attached native canvas + populated React root is the
      // stable cross-device signal that the actual simulation has mounted.
      try{
        await page.waitForFunction(()=>{
          const root=document.querySelector('#root');
          return !!root&&root.innerHTML.length>1500;
        },null,{timeout:30000});
      }catch(error){
        const diag=await page.evaluate(()=>({
          route:location.pathname+location.search,
          rootHtmlLength:document.querySelector('#root')?.innerHTML.length,
          bodyExcerpt:document.body?.innerText.slice(0,700),
          canvasCount:document.querySelectorAll('#root canvas').length
        })).catch(()=>({}));
        throw Error('Original Studio did not mount on '+options.mode+
          ' / '+options.width+': '+JSON.stringify(diag)+' '+String(error));
      }
      const load3D=page.getByRole('button',{name:'Load 3D',exact:true}).first();
      if(await load3D.isVisible().catch(()=>false))
        await load3D.click({timeout:15000});
      await page.waitForTimeout(1800);
      const snapshot=await page.evaluate(()=>({
        canvasCount:[...document.querySelectorAll('#root canvas')].length,
        lockButtons:[...document.querySelectorAll('button')].filter(e=>/Unlock Creator/i.test(e.textContent||'')).length,
        route:location.pathname,cssWidth:innerWidth
      }));
      assert.ok(snapshot.canvasCount>0,'Original 2D/3D canvas missing');
      assert.equal(snapshot.lockButtons,0,'Guest lock returned in optimized Studio');
      assert.ok(!errors.some(e=>/Minified React error|Cannot read properties|Maximum call stack/i.test(e)),
        'Unexpected browser crash: '+errors.slice(0,3).join(' | '));
      results.push({...options,...snapshot,initialRenderMs:Date.now()-started,errors:errors.slice(0,3)});
      await context.close();
    }
    console.log('PREVIEW_2D_3D_SMOKE_PASS '+JSON.stringify(results));
  }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(error=>{
  console.error('PREVIEW_2D_3D_SMOKE_FAIL '+String(error.stack||error));
  if(server.listening)server.close();
  process.exitCode=1;
});
