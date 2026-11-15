'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');let file=u.pathname.replace(/^\/+/,'');
  if(file==='studio'||file==='studio/')file='studio/index.html';
  if(file==='home'||file==='home/')file='home/index.html';
  if(!file||file.endsWith('/'))file+='index.html';
  const abs=path.resolve(root,file);
  if(!abs.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(abs,(err,bytes)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(abs)]||'application/octet-stream'}).end(bytes));
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  // Home launcher must not modify original cards or replace the React tree.
  const home=await browser.newPage({viewport:{width:1440,height:900}});
  await home.goto(base+'/home',{waitUntil:'domcontentloaded'});
  const launcher=home.locator('#be-new-mode-launch');
  await launcher.waitFor({state:'visible',timeout:40000});
  await launcher.click();
  const panel=home.locator('#be-new-mode-panel');
  assert.ok(await panel.locator('a[href="/studio?mode=neon-zigzag"]').isVisible());
  assert.ok(await panel.locator('a[href="/studio?mode=prism-chain"]').isVisible());
  assert.equal(await home.locator('li[data-be-extra-mode]').count(),0,'Original cards initially collapsed');
  await home.close();
  const modes=[
   {slug:'neon-zigzag',label:'Neon Zigzag Beat Rail',setting:'ballCount'},
   {slug:'prism-chain',label:'Prism Chain Reaction',setting:'prismCount'}
  ];
  for(const mode of modes){
   const page=await browser.newPage({viewport:{width:1270,height:820},acceptDownloads:true});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   page.on('console',msg=>{if(msg.type()==='error')console.log('MODE_CONSOLE '+mode.slug+' '+msg.text().slice(0,190));});
   await page.goto(base+'/studio?mode='+mode.slug,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#be-play').waitFor({state:'visible',timeout:40000});
   await page.waitForFunction(()=>document.getElementById('be-message')?.textContent?.startsWith('Ready'),null,{timeout:45000});
   assert.ok((await page.locator('#be-heading').innerText()).includes(mode.label));
   const image=await page.locator('#be-canvas').evaluate(e=>e.toDataURL().slice(0,40));
   assert.ok(image.startsWith('data:image/png'),'Canvas did not render');
   await page.locator('#be-play').click();
   assert.match(await page.locator('#be-play').innerText(),/Play/);
   await page.locator('#be-play').click();
   assert.match(await page.locator('#be-play').innerText(),/Pause/);
   const input=page.locator('#be-option-'+mode.setting),before=await input.inputValue();
   await input.fill(mode.slug==='prism-chain'?'12':'5');
   await input.dispatchEvent('change');
   await page.waitForFunction(()=>document.getElementById('be-message')?.textContent?.startsWith('Ready'),null,{timeout:45000});
   assert.notEqual(await page.locator('#be-option-'+mode.setting).inputValue(),before);
   await page.locator('#be-shuffle').click();
   await page.waitForFunction(()=>document.getElementById('be-message')?.textContent?.startsWith('Ready'),null,{timeout:45000});
   // Low-res 2s video exercises WebCodecs, H.264 muxing or real WebM fallback.
   await page.locator('#be-duration').selectOption('2');
   await page.locator('#be-resolution').selectOption('360x640');
   const downloadPromise=page.waitForEvent('download',{timeout:150000});
   await page.locator('#be-record').click();
   const download=await downloadPromise;
   assert.ok(/\.(mp4|webm)$/.test(download.suggestedFilename()),'Unexpected video extension');
   const output=path.join('/tmp',mode.slug+'-'+Date.now()+path.extname(download.suggestedFilename()));
   await download.saveAs(output);const data=fs.readFileSync(output);
   assert.ok(data.length>2000,'Empty recording');
   if(download.suggestedFilename().endsWith('.mp4'))assert.equal(data.subarray(4,8).toString(),'ftyp','Invalid MP4');
   fs.unlinkSync(output);
   assert.equal(errors.length,0,'Browser errors: '+errors.join(' | '));
   console.log('PLAYABLE_MODE_PASS '+JSON.stringify({slug:mode.slug,label:mode.label,settingChanged:true,download:download.suggestedFilename(),bytes:data.length}));
   await page.close();
  }
  // Existing Studio remains its original React app, not the extension.
  const original=await browser.newPage();
  await original.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded'});
  await original.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:40000});
  assert.equal(await original.locator('#be-play').count(),0,'Legacy mode incorrectly loaded extension');
  assert.ok(await original.locator('canvas').count()>0,'Original canvas missing');
  console.log('EXISTING_STUDIO_PRESERVED');
  await original.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('PLAYABLE_MODE_FATAL '+String(e.stack||e));process.exitCode=1;}).finally(()=>server.listening?new Promise(ok=>server.close(ok)):undefined);
