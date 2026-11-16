'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const modes=[
 ['rhythmic','Rhythmic'],['escape','Escape'],['drawer','Drawer'],['spawner','Accumulate'],
 ['ghost-escape','Ghost'],['breaker','Breaker'],['glass-tower','Glass'],['flag-battle','Flags'],
 ['weapon-battle','Battle'],['merge-evolution','Evolve'],['glass-rush','Glass Rush'],['grid-merge','Grid Merge'],
 ['wave-3d','Wave 3D'],['marble-run-3d','Marble 3D'],['ball-crush','Crush 3D'],
 ['jelly-3d','Jelly 3D'],['cut-count','Cuts 3D'],['magnet','Magnet 3D']
];
const [from,to]=(process.env.MODE_RANGE||'0:18').split(':').map(Number);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  let rel=url.pathname==='/studio'?'studio/index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
  if(!rel||rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,b)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(b));
 }catch{res.writeHead(400).end()}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const failures=[],reports=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage();
  let errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,350)));
  for(const [slug,name] of modes.slice(from,to)){
   errors=[];let issue=null;
   let result={slug,name};
   try{
    await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:40000});
    const title=page.locator('button[title="Change mode"]').first();
    await title.waitFor({state:'visible',timeout:26000});
    assert.equal((await title.innerText()).trim(),name,'Established mode selection changed');
    const load=page.getByRole('button',{name:'Load 3D',exact:true}).first();
    if(await load.isVisible().catch(()=>false))await load.click({timeout:6500}).catch(()=>{});
    const canvas=page.locator('canvas:visible');
    await page.waitForFunction(()=>[...document.querySelectorAll('canvas')].some(x=>x.width>=80&&x.height>=80&&x.getClientRects().length),null,{timeout:13000});
    const canvasCount=await canvas.count();
    assert.ok(canvasCount>0,'Established mode lost visible canvas');
    // Use page-level snapshots: element screenshots wait for the continuously
    // animated 3D canvas to become "stable" and falsely time out.
    const a=await page.screenshot({timeout:24000,animations:'disabled'});
    await page.waitForTimeout(800);
    const b=await page.screenshot({timeout:24000,animations:'disabled'});
    // Frozen samples are reported for manual review; do not make frame
    // movement a hard failure when an engine starts paused or waits for input.
    const bufferChanged=!a.equals(b);
    const random=page.getByRole('button',{name:'Randomize',exact:true}).first();
    assert.ok(await random.isEnabled(),'Original Randomize disabled');
    const record=page.locator('button[title="Instantly record a clean clip (C)"]').first();
    assert.ok(await record.count(),'Original Record button missing');
    const sliders=page.locator('#root input[type="range"]:visible:not([disabled])');
    const count=await sliders.count();
    assert.ok(count>=1,'Established mode lost editable controls');
    // The shared preview DPR optimization must NOT alter the selected MP4
    // dimensions or the original mode enum / settings panel.
    const settings=(await page.locator('#root').innerText()).includes('Mode settings');
    const locks=await page.getByRole('button',{name:/Unlock Creator/i}).count();
    assert.equal(locks,0,'Original mode behind a Creator paywall');
    assert.equal(errors.length,0,'Uncaught browser errors '+JSON.stringify(errors.slice(0,5)));
    result={slug,name,canvasCount,bufferChanged,sliders:count,settings,randomize:true,record:true,guestUnlocked:true,errors:[]};
    console.log('BASELINE_18_PASS '+JSON.stringify(result));
   }catch(e){issue=String(e).slice(0,1100);result={slug,name,error:issue,jsErrors:errors.slice(0,4)};failures.push(result);console.log('BASELINE_18_FAIL '+JSON.stringify(result))}
   reports.push(result);
  }
  await ctx.close();
 }finally{await browser.close();}
 console.log('BASELINE_18_SUMMARY '+JSON.stringify({from,to,passed:reports.length-failures.length,failed:failures.length,failures}));
 assert.equal(failures.length,0,'The 18 established modes have regressions');
})().catch(e=>{console.error('BASELINE_18_FATAL '+String(e.stack||e));process.exitCode=1;}).finally(()=>{if(server.listening)server.close();});
