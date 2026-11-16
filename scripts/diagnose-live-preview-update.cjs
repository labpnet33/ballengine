'use strict';
const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const out=path.resolve(process.env.DIAG_OUTPUT||path.join(process.cwd(),'test-results','live-preview'));
fs.mkdirSync(out,{recursive:true});
const modes=['rhythmic','phase-bloom','wave-3d','flood-fill','slime','ball-crush'];
const [start,end]=(process.env.MODE_RANGE||'0:6').split(':').map(Number);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://localhost');let p=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
 if(!p||p.endsWith('/'))p+='index.html';const f=path.resolve(root,p);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(f,(err,b)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'}).end(b))}catch{res.writeHead(400).end()}
});
const snapshot=async page=>page.evaluate(()=>{
 const root=document.querySelector('#root'),vis=e=>!!e.getClientRects().length;
 return {controls:[...root.querySelectorAll('input[type=range],select,input[type=checkbox],input[type=number]')].filter(vis).map((e,i)=>{
 const parent=e.closest('label')||e.parentElement?.parentElement||e.parentElement;
 return {i,type:e.type,value:e.type==='checkbox'?e.checked:e.value,min:e.min,max:e.max,step:e.step,title:e.title,aria:e.getAttribute('aria-label'),name:e.name,text:(parent?.innerText||'').replace(/\s+/g,' ').slice(0,140),options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent.trim()).slice(0,16):undefined}
 }),playing:!!root.querySelector('button[title="Pause (Space)"]'),loading:root.innerText.match(/Loading (?:3D )?scene[^\n]*/gi)?.slice(0,4),mode:root.querySelector('button[title="Change mode"]')?.innerText};});
async function canvasScreenshot(page,slug,stage){
 const canvases=page.locator('canvas:visible');let best=null,max=0;
 for(let i=0;i<await canvases.count();i++){let b=await canvases.nth(i).boundingBox();if(b&&b.width*b.height>max&&b.width>=90&&b.height>=90){best=b;max=b.width*b.height;}}
 if(!best)throw Error('No canvas region');
 const clip={x:Math.max(0,Math.floor(best.x)),y:Math.max(0,Math.floor(best.y)),width:Math.floor(best.width),height:Math.floor(best.height)};
 const b=await page.screenshot({clip,timeout:18000,animations:'disabled'});
 fs.writeFileSync(path.join(out,slug+'-'+stage+'.png'),b);
 return {sha:crypto.createHash('sha256').update(b).digest('hex').slice(0,12),bytes:b.length,clip};
}
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage();let errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,220)));
  for(const slug of modes.slice(start,end)){
   errors=[];const result={slug};try{
    await page.goto('http://127.0.0.1:'+server.address().port+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:40000});
    await page.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:25000});
    const load=page.getByRole('button',{name:'Load 3D',exact:true}).first();
    if(await load.isVisible().catch(()=>false))await load.click({timeout:8000});
    await page.waitForTimeout(1400);
    const pause=page.locator('button[title="Pause (Space)"]').first();
    if(await pause.isVisible().catch(()=>false)){await pause.evaluate(x=>x.click());await page.waitForTimeout(250);}
    const before=await snapshot(page);
    result.controls=before.controls;
    const ranges=page.locator('#root input[type=range]:visible:not([disabled])');
    const count=await ranges.count(); if(count<2)throw Error('Not enough sliders');
    const target=ranges.last();
    const old=await target.inputValue(),max=Number(await target.getAttribute('max')),min=Number(await target.getAttribute('min'));
    const step=Number(await target.getAttribute('step'))||1;
    const desired=old===String(max)?Math.max(min,max-step*10):Math.min(max,Number(old)+step*10);
    result.setting={old,desired,step,label:before.controls.slice(-1)[0]?.text};
    result.imageBefore=await canvasScreenshot(page,slug,'before');
    // React tracks the input value; use the native setter so onChange is
    // actually fired. Plain e.value=... would suppress React's change handler.
    await target.evaluate((e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},desired);
    await page.waitForTimeout(900);
    const after=await snapshot(page); result.setting.actual=after.controls.map(x=>x.value).slice(-1)[0];
    result.imageLive=await canvasScreenshot(page,slug,'live');
    await page.reload({waitUntil:'domcontentloaded',timeout:40000});
    await page.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:20000});
    await page.waitForTimeout(1500);
    const reload=await snapshot(page);result.setting.afterReload=reload.controls.map(x=>x.value).slice(-1)[0];
    result.imageReload=await canvasScreenshot(page,slug,'reload');
    result.errors=errors;
   }catch(e){result.error=String(e).slice(0,500);result.errors=errors;}
   console.log('LIVE_PREVIEW_DIAG '+JSON.stringify(result));fs.writeFileSync(path.join(out,'diag-'+slug+'.json'),JSON.stringify(result,null,2));
  }
  await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('LIVE_PREVIEW_FATAL',e.stack||String(e));process.exitCode=1;}).finally(()=>{if(server.listening)server.close()});
