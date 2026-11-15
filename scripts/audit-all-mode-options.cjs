'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const base='http://127.0.0.1';
const http=require('node:http');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const initial=[
['rhythmic','Rhythmic'],['escape','Escape'],['drawer','Drawer'],['spawner','Accumulate'],
['ghost-escape','Ghost'],['breaker','Breaker'],['glass-tower','Glass'],['flag-battle','Flags'],
['weapon-battle','Battle'],['merge-evolution','Evolve'],['glass-rush','Glass Rush'],['grid-merge','Grid Merge'],
['wave-3d','Wave 3D'],['marble-run-3d','Marble 3D'],['ball-crush','Crush 3D'],
['jelly-3d','Jelly 3D'],['cut-count','Cuts 3D'],['magnet','Magnet 3D']];
const experimental=[
['phase-bloom','Bloom'],['phonk-drop','Phonk Drop'],['marble-run','Marble'],
['ball-race','Race'],['target-hit','Targets'],['falling-sand','Sand'],['plinko','Plinko'],
['color-match','Colors'],['spin-battle','Spin'],['lava-survival','Lava'],
['glass-slice','Slice 3D'],['flood-fill','Flood 3D'],['eulers-disk','Disks 3D'],
['drum-sort','Drum 3D'],['plinko-3d','Plinko 3D'],['chladni','Chladni 3D'],['voxel','Voxels 3D'],
['domino-3d','Domino 3D'],['marble-race-3d','Race 3D'],['attractor','Attractor 3D'],
['flow-field','Flow 3D'],['metaballs','Blobs 3D'],['galaxy','Galaxy 3D'],
['fireflies','Fireflies 3D'],['pendulum-basin','Basin 3D'],
['slime','Slime 3D'],['crowd-evacuation','Evacuate 3D']];
const all=initial.map(x=>[...x,'baseline']).concat(experimental.map(x=>[...x,'experimental']));
const range=(process.env.MODE_RANGE||'0:45').split(':').map(Number);
const modes=all.slice(range[0],range[1]);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,base);let p=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
  if(!p||p.endsWith('/'))p+='index.html';
  const file=path.resolve(root,p);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,b)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(b));
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const host='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await context.newPage();let errors=[],missing=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,220)));
  page.on('response',r=>{if(r.status()===404&&r.url().startsWith(host+'/assets/'))missing.push(new URL(r.url()).pathname);});
  const bundle=fs.readFileSync(path.join(root,'assets/index-3pf76ICO.js'),'utf8');
  const registry=[];
  for(const [slug,name,family] of all){
   const ix=bundle.indexOf('slug:"'+slug+'"');
   const snippet=ix>=0?bundle.slice(ix-100,ix+950):'';
   const status=snippet.match(/status:"([^"]+)"/)?.[1];
   const modeEnum=snippet.match(/mode:"([^"]+)"/)?.[1];
   registry.push({slug,name,family,status,modeEnum,metadata:snippet.slice(0,250)});
  }
  console.log('MODE_AUDIT_REGISTRY '+JSON.stringify(registry));
  for(const [slug,name,family] of modes){
   errors=[];missing=[];
   const started=Date.now();
   let issue=null,record={};
   try{
    await page.goto(host+'/studio?mode='+encodeURIComponent(slug),{waitUntil:'domcontentloaded',timeout:44000});
    await page.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:28000});
    await page.waitForTimeout(700);
    record=await page.evaluate(()=>{
     const main=document.querySelector('#root'),title=main?.querySelector('button[title="Change mode"]')?.textContent.trim()||'';
     const mark=main?.querySelector('button[title="Play (Space)"],button[title="Pause (Space)"]');
     const visible=e=>!!e.getClientRects().length;
     const text=main?.innerText||'';
     const start=text.indexOf('Mode settings'),end=text.indexOf('Replay tutorial',start);
     const settings=start>=0?text.slice(start,end>=0?end:start+3600):'';
     const opt=[...main.querySelectorAll('select')].filter(visible).map(e=>({title:e.title,options:[...e.options].map(x=>x.textContent.trim()).slice(0,30)}));
     const sliders=[...main.querySelectorAll('input[type="range"],input[type="number"]')].filter(visible).map(e=>({type:e.type,min:e.min,max:e.max,step:e.step,title:e.title,aria:e.getAttribute('aria-label'),value:e.value}));
     const checked=[...main.querySelectorAll('input[type="checkbox"]')].filter(visible).map(e=>({checked:e.checked,title:e.title,aria:e.getAttribute('aria-label')}));
     const buttons=[...main.querySelectorAll('button')].filter(visible).map(e=>({title:e.title,text:e.innerText?.trim().slice(0,45),disabled:e.disabled})).filter(x=>x.text||x.title);
     const c=[...main.querySelectorAll('canvas')].filter(visible).map(x=>({width:x.width,height:x.height}));
     return {selected:title,playingButton:mark?.title||null,settings:settings.slice(0,3600),options:opt.slice(0,10),sliders:sliders.slice(0,35),checkboxes:checked.slice(0,35),buttonTitles:buttons.slice(0,58),canvas:c.slice(0,8),modeSettingsVisible:settings.length>20};
    });
   }catch(e){issue=String(e).slice(0,260);}
   console.log('MODE_AUDIT_UI '+JSON.stringify({slug,name,family,...record,issue,jsErrors:errors.slice(0,4),assetsMissing:[...new Set(missing)].slice(0,7),durationMs:Date.now()-started}));
  }
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('MODE_AUDIT_FATAL '+String(e.stack||e));process.exitCode=1;}).finally(()=>{if(server.listening)server.close();});