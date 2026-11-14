'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
// Verify that the consolidated public captures are served by the ORIGINAL
// website root. No alternate Studio app or new custom pages are generated.
const expectedPublicFiles=[
  'download/index.html',
  'de/download/index.html',
  'es/download/index.html',
  'fr/download/index.html',
  'ja/download/index.html',
  'zh-tw/download/index.html',
  'assets/physics.worker-DRvxAjdb.js',
  'assets/crush.worker-phV1EFRY.js',
  'assets/magnetic.worker-QnwGMRP0.js',
  'sfx/chirp-1-0-0.wav',
  'how-to-clips/mode-ball-crush.39d4f25a7d.jpg',
  'models/instruments/mallet_37d60d3c-4dde-4cdf-9847-81186b6afd8a_1786705098540.glb'
];
for (const rel of expectedPublicFiles) {
  const file=path.join(root,rel);
  assert.ok(fs.existsSync(file)&&fs.statSync(file).size>0,
    'Missing merged page or static resource: '+rel);
}
const originalStudio=fs.readFileSync(path.join(root,'studio','index.html'),'utf8');
assert.ok(originalStudio.includes('index-3pf76ICO.js')&&originalStudio.includes('id="root"'),
  'Original captured React Studio replaced or damaged');
console.log('Original Studio intact; merged public routes and worker/CDN assets verified.');

const mime={
 '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp',
 '.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm','.mp4':'video/mp4'
};
const server=http.createServer((req,res)=>{
 let url;
 try {url=new URL(req.url,'http://localhost');}catch {res.writeHead(400).end();return;}
 let rel=url.pathname==='/studio'||url.pathname==='/studio/'?
   'studio/index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
 if(!rel || rel.endsWith('/'))rel+='index.html';
 const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
 fs.readFile(file,(err,body)=>{
   if(err){res.writeHead(404,{'content-type':'text/plain'}).end('Not found');return;}
   res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
   res.end(body);
 });
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await context.newPage();
 const pageErrors=[],failedAssets=[],apiRequests=[];
 page.on('pageerror',err=>pageErrors.push(String(err).slice(0,280)));
 page.on('response',res=>{
   if(res.url().includes('/api/'))apiRequests.push({status:res.status(),path:new URL(res.url()).pathname});
   else if(res.status()===404)failedAssets.push(new URL(res.url()).pathname);
 });
 const base='http://127.0.0.1:'+port;
 try{
   await page.goto(base+'/studio?mode=ball-crush',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(9000);
   const currentUrl=new URL(page.url());
   const body=await page.locator('body').innerText();
   const rootHTML=await page.locator('#root').innerHTML();
   const guest=await page.evaluate(async()=>{
     const r=await fetch('/api/auth/me');return{status:r.status,id:(await r.json()).user.id};
   });
   const report={
     url:currentUrl.pathname+currentUrl.search,
     title:await page.title(),
     guest,
     reactDOMLength:rootHTML.length,
     bodyExcerpt:body.slice(0,900),
     missingAssets:[...new Set(failedAssets)].slice(0,25),
     apiRequests:apiRequests.slice(0,25),
     pageErrors:pageErrors.slice(0,12)
   };
   fs.mkdirSync(path.resolve(__dirname,'..','test-results'),{recursive:true});
   await page.screenshot({path:path.resolve(__dirname,'..','test-results','studio-original.png'),fullPage:false});
   fs.writeFileSync(path.resolve(__dirname,'..','test-results','report.json'),JSON.stringify(report,null,2));
   console.log(JSON.stringify(report,null,2));
   assert.equal(guest.id,'local-preview-guest','guest preview adapter did not activate');
   assert.ok(currentUrl.pathname.startsWith('/studio'),'original React app redirected to login or another page');
   assert.ok(rootHTML.length>1000,'React app did not render a substantial UI');
   assert.ok(!/(?:^|\/)(?:login|signup)(?:\/|$)/.test(currentUrl.pathname),'login route displayed instead of Studio');
   if(pageErrors.some(x=>x.includes('Minified React error'))) throw new Error('Uncaught React runtime error');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;server.close();});
