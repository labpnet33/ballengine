'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.wasm':'application/wasm'};
const srv=http.createServer((req,res)=>{
 let rel;try{const u=new URL(req.url,'http://localhost');rel=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
 if(!rel||rel==='automation'||rel==='automation/queue'||rel==='automation/brands'||rel==='publish'||rel==='publish/youtube')rel='index.html';
 const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,buf)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(buf);});
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await context.newPage();const base='http://127.0.0.1:'+srv.address().port;
 const events=[];page.on('pageerror',e=>events.push('PAGEERROR '+String(e).slice(0,200)));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('/api/'))events.push('API '+r.status()+' '+new URL(r.url()).pathname)});
 async function snap(route){
 await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(4000);
 if(route==='/studio'){
   const pub=page.locator('button[title="Publish (7)"]').first();
   if(await pub.isVisible())await pub.click();
   await page.waitForTimeout(1000);
 }
 const info=await page.evaluate(()=>({
   url:location.pathname,body:document.body.innerText.slice(0,11000),
   buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText.trim().slice(0,100),title:e.title,disabled:e.disabled})).filter(x=>x.text||x.title).slice(0,110),
   inputs:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,type:e.type,placeholder:e.placeholder,label:e.closest('label')?.innerText?.slice(0,90)})).slice(0,60)
 }));
 console.log('PUBLISH_UI '+JSON.stringify({route,info,events:events.slice(-20)}));
 }
 try{for(const route of ['/studio','/automation','/automation/queue','/automation/brands'])await snap(route);}
 finally{await browser.close();await new Promise(ok=>srv.close(ok));}
})().catch(e=>{console.error('PUBLISH_UI_ERROR',e.stack);process.exitCode=1;srv.close();});
