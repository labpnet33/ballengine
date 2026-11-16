'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const out=path.resolve(__dirname,'..','test-results','domino-realism');
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://localhost');let rel=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
 if(!rel||rel.endsWith('/'))rel+='index.html';const f=path.resolve(root,rel);
 if(!f.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(f,(err,bytes)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}).end(bytes));
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const url='http://127.0.0.1:'+server.address().port+'/studio?mode=domino-3d';
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('button[title="Change mode"]').waitFor({state:'visible',timeout:35000});
 await page.waitForTimeout(3500);
 const mode=await page.locator('button[title="Change mode"]').first().innerText();
 assert.equal(mode.trim(),'Domino 3D');
 const load=page.getByRole('button',{name:'Load 3D',exact:true}).first();
 if(await load.isVisible().catch(()=>false))await load.click({timeout:9000}).catch(()=>{});
 console.log('DOMINO_UI_DEBUG '+JSON.stringify(await page.evaluate(()=>{
 const root=document.querySelector('#root');
 return {url:location.href,mode:document.querySelector('button[title="Change mode"]')?.innerText,
 titles:[...root.querySelectorAll('button')].filter(x=>/zoom|camera/i.test(x.title||'')).map(x=>({title:x.title,visible:!!x.getClientRects().length,html:x.outerHTML.slice(0,150)})).slice(0,25),
 headings:[...root.querySelectorAll('button,span,div')].filter(x=>x.children.length===0&&/^(Camera|Zoom|Domino 3D settings)$/i.test(x.textContent?.trim()||'')).slice(0,12).map(x=>({tag:x.tagName,text:x.textContent?.trim(),parent:x.parentElement?.outerHTML.slice(0,500)})),
 range:[...root.querySelectorAll('input[type="range"]')].map(x=>({min:x.min,max:x.max,value:x.value,visible:!!x.getClientRects().length})).slice(-20),
 bodyEnd:root.innerText.slice(-1300)};
 })));
 await page.getByRole('button',{name:/Zoom in/i}).first().waitFor({timeout:25000});
 const zoomIn=page.locator('button[title="Zoom in"]').first(),zoomOut=page.locator('button[title="Zoom out"]').first(),reset=page.locator('button[title="Reset camera zoom"]').first();
 assert.equal(await zoomIn.count(),1);assert.equal(await zoomOut.count(),1);assert.equal(await reset.count(),1);
 const zoom=page.locator('input[type="range"][min="0.3"][max="2.2"]').first();
 assert.equal(await zoom.count(),1,'Domino zoom slider missing');
 const starting=await zoom.inputValue();assert.equal(Number(starting),1);
 await zoomIn.click({timeout:10000});
 assert.equal(Number(await zoom.inputValue()),.85,'Zoom in button must change native config');
 await zoomOut.click({timeout:10000});
 assert.equal(Number(await zoom.inputValue()),1,'Zoom out must undo zoom in');
 await reset.click({timeout:10000});
 assert.equal(Number(await zoom.inputValue()),1,'Reset zoom must restore native camera distance');
 const pause=page.locator('button[title="Pause (Space)"]').first();
 if(await pause.isVisible().catch(()=>false))await pause.evaluate(e=>e.click());
 async function snap(name){
   await page.waitForTimeout(2100);
   const region=await page.evaluate(()=>{
     const b=[...document.querySelectorAll('canvas')].filter(x=>x.getClientRects().length).map(x=>x.getBoundingClientRect()).sort((x,y)=>y.width*y.height-x.width*x.height)[0];
     if(!b)return null;return {x:Math.max(0,Math.floor(b.x)),y:Math.max(0,Math.floor(b.y)),width:Math.floor(b.width),height:Math.floor(b.height)};
   });
   assert.ok(region&&region.width>100&&region.height>100,'Domino canvas missing');
   const bytes=await page.screenshot({clip:region,timeout:25000,animations:'disabled'});
   fs.writeFileSync(path.join(out,name+'.png'),bytes);
   return crypto.createHash('sha256').update(bytes).digest('hex');
 }
 // Native React input updates configuration; zoom should redraw the actual
 // WebGL scene without a full page refresh or any secondary page.
 const original=await snap('zoom-1x');
 for(let n=0;n<4;n++)await zoomIn.click({timeout:9000});
 assert.equal(Number(await zoom.inputValue()),.4);
 const zoomed=await snap('zoom-2_5x');
 assert.notEqual(original,zoomed,'Zoom did not change the canvas appearance');
 await reset.click({timeout:9000});
 assert.equal(Number(await zoom.inputValue()),1);
 await page.waitForTimeout(1600);
 const state={mode,starting,zoomedValue:.4,afterReset:await zoom.inputValue(),originalScreenshot:original.slice(0,14),zoomedScreenshot:zoomed.slice(0,14),jsErrors:errors,href:page.url()};
 assert.equal(errors.length,0,'Uncaught browser error during Domino zoom');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(state,null,2));
 console.log('DOMINO_REALISM_ZOOM_PASS '+JSON.stringify(state));
 }finally{await browser.close()}
})().catch(e=>{console.error('DOMINO_REALISM_ZOOM_FAIL',e.stack||String(e));process.exitCode=1}).finally(()=>{if(server.listening)server.close()});
