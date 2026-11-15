'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra/wget/ballengine.app');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://localhost');let p=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');if(!p||p.endsWith('/'))p+='index.html';const file=path.resolve(root,p);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(b))}
 catch{res.writeHead(400).end()}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const base='http://127.0.0.1:'+server.address().port;
  const missing=[],errors=[];
  page.on('response',r=>{if(r.status()===404 && r.url().includes('/assets/'))missing.push(new URL(r.url()).pathname)});
  page.on('pageerror',e=>errors.push(String(e)));
  const samples=[];
  for(const [slug,name] of [['rhythmic','Rhythmic'],['phase-bloom','Bloom'],['phonk-drop','Phonk Drop']]){
   await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:45000});
   const modeButton=page.locator('button[title="Change mode"]').first();
   await modeButton.waitFor({state:'visible',timeout:30000});
   assert.equal((await modeButton.innerText()).trim(),name,'Incorrect mode selection '+slug);
   const randomize=page.getByRole('button',{name:'Randomize',exact:true}).first();
   await randomize.waitFor({state:'visible',timeout:10000});
   assert.ok(await randomize.isEnabled(),'Original randomizer is still disabled for '+slug);
   const tooltip=await randomize.getAttribute('title');
   assert.ok(!tooltip.includes("doesn't support"),'Unsupported Randomize tooltip persists');
   const before=await page.evaluate(()=>[...document.querySelectorAll('#root input,#root select')].filter(x=>x.getClientRects().length).map(x=>x.value));
   await randomize.click({timeout:12000});
   await page.waitForTimeout(600);
   const after=await page.evaluate(()=>[...document.querySelectorAll('#root input,#root select')].filter(x=>x.getClientRects().length).map(x=>x.value));
   const changed=before.filter((x,i)=>x!==after[i]).length;
   assert.ok(changed>0,'Native randomization did not modify real settings for '+slug);
   const prior=page.locator('button[title="Previous roll"]').first();
   assert.ok(await prior.isEnabled(),'No Randomize history for '+slug);
   const overlayInfo=await page.evaluate(()=>[...document.querySelectorAll('.fixed.inset-0')].filter(e=>e.getClientRects().length).map(e=>e.innerText.slice(0,750)));
   console.log('PARITY_RANDOMIZE_OVERLAY '+JSON.stringify({slug,overlays:overlayInfo}));
   if(overlayInfo.length){
     await page.keyboard.press('Escape');
     await page.waitForTimeout(400);
     const close=page.locator('.fixed.inset-0 button').filter({hasText:/Close|Got it|Skip|Done|Continue|Not now/i}).first();
     if(await close.isVisible().catch(()=>false))await close.click({timeout:3000}).catch(()=>{});
   }
   await prior.click({timeout:12000});
   await page.waitForTimeout(400);
   const next=page.locator('button[title="Next roll"]').first();
   assert.ok(await next.isEnabled(),'Randomize redo history broken for '+slug);
   const record=page.locator('button[title="Instantly record a clean clip (C)"]').first();
   assert.ok(await record.isVisible(),'Recording controls missing for '+slug);
   const modeAfter=(await modeButton.innerText()).trim();
   assert.equal(modeAfter,name,'Randomizing switched away from current mode');
   const result={slug,mode:name,settingsChanged:changed,previousRoll:true,nextRoll:true,record:true,modeStays:name,errors:errors.slice(-5),missing:[...new Set(missing)]};
   samples.push(result);
   console.log('PARITY_RANDOMIZER_PASS '+JSON.stringify(result));
  }
  assert.ok(!errors.length,'JavaScript errors in native mode randomization: '+JSON.stringify(errors.slice(0,5)));
  // Default face was changed from missing bloodshot WEBPs to illustrated
  // Grinface. Do not confuse optional user-selected skins with the default.
  assert.ok(!missing.some(p=>p.includes('bloodshot.face')||p.includes('bloodshot.hands')),'Missing bloodshot assets still requested by default');
  console.log('PHONK_PARITY_VERIFIED '+JSON.stringify({modes:samples.length,noMissingDefaultImages:true,errors:errors.length}));
 }finally{await browser.close();}
})().finally(()=>server.listening?new Promise(ok=>server.close(ok)):undefined).catch(e=>{console.error('PHONK_PARITY_FAILED '+String(e.stack||e));process.exitCode=1;});
