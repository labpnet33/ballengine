'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const content=fs.readFileSync(path.join(web,'assets/index-3pf76ICO.js'),'utf8');
const devCount=(content.match(/status:"development"/g)||[]).length;
assert.equal(devCount,0,'Experimental modes not promoted in built entrypoint: '+devCount);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');let rel=u.pathname==='/home'?'home/index.html':u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
  if(!rel||rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(web,rel);
  if(!file.startsWith(web+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,body)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(body));
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  let errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,250)));
  await page.goto(base+'/home',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(3500);
  const normal=page.locator('#root section:has(h2:text-is("What do you want to make?")) a[href^="/studio?mode="]');
  const homeLinks=await normal.count();
  console.log('RELEASED_MODE_HOME '+JSON.stringify({links:homeLinks,errors:errors.slice(0,8)}));
  assert.equal(homeLinks,45,'All 45 built-in mode links should appear in the original live Home registry');
  for(const [slug,title] of [['phase-bloom','Bloom'],['flow-field','Flow 3D'],['domino-3d','Domino 3D']]){
   errors=[];
   await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(2400);
   const mode=await page.locator('button[title="Change mode"]').first().innerText().catch(()=>'');
   assert.equal(mode,title,'Released native mode failed to select '+title);
   const dev=await page.getByRole('button',{name:/^In development/}).count();
   const canvas=await page.locator('canvas').count();
   const details=await page.locator('#root').innerText();
   assert.ok(canvas>0,'No mode rendering canvas '+slug);
   assert.equal(dev,0,'Released modes still marked in development for '+slug);
   assert.ok(!details.includes('This mode is still being built.'),'Obsolete unfinished notice shown');
   console.log('RELEASED_MODE_STUDIO '+JSON.stringify({slug,mode,canvas,devCount:dev,errors:errors.slice(0,8)}));
  }
 }finally{await browser.close();}
})().finally(()=>new Promise(ok=>server.close(ok))).catch(e=>{console.error('RELEASED_MODE_QA_FAIL '+String(e.stack||e));process.exitCode=1;});