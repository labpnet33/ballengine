'use strict';
// Verify the native Home simulation grid is preserved and the optional 27
// experimental links open their real captured simulation engines.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  let p=u.pathname==='/home'?'home/index.html':u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if(!p||p.endsWith('/'))p+='index.html';
  const full=path.resolve(root,p);
  if(!full.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(full,(err,b)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'}).end(b));
 }catch{res.writeHead(400).end();}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,220)));
   try{
    await page.goto(base+'/home',{waitUntil:'domcontentloaded',timeout:45000});
    const button=page.locator('[data-be-all-modes-button]');
    await button.waitFor({state:'visible',timeout:30000});
    const section=page.locator('#root section').filter({has:page.getByRole('heading',{name:'What do you want to make?',exact:true})}).first();
    let links=section.locator('ul.grid a[href^="/studio?mode="]');
    assert.equal(await links.count(),18,'Original 18 Home simulation cards changed');
    assert.equal(await section.locator('[data-be-extra-mode]').count(),0,'Experimental cards should start collapsed');
    await button.click({timeout:14000});
    await page.waitForFunction(()=>document.querySelectorAll('#root li[data-be-extra-mode]').length===27,{timeout:15000});
    assert.equal(await links.count(),45,'All simulation modes should show 18+27 original options');
    const extra=await section.locator('li[data-be-extra-mode]').evaluateAll(els=>els.map(e=>({slug:e.dataset.beExtraMode,href:e.querySelector('a')?.getAttribute('href'),text:e.innerText})));
    assert.equal(new Set(extra.map(e=>e.slug)).size,27,'Duplicate experimental mode');
    assert.ok(extra.every(e=>e.href==='/studio?mode='+e.slug&&e.text.includes('In development')),'Missing labels or broken experimental link');
    assert.ok(extra.some(e=>e.slug==='flow-field'),'Flow 3D must use its original flow-field slug');
    assert.ok(extra.some(e=>e.slug==='phase-bloom')&&extra.some(e=>e.slug==='domino-3d'));
    assert.equal(await section.locator('li:not([data-be-extra-mode])').count(),18,'Original Home links altered');
    console.log('ALL_MODES_EXPANDED '+JSON.stringify({viewport:viewport.width,original:18,experimental:extra.length,total:await links.count(),slugs:extra.map(e=>e.slug)}));
    await button.click({timeout:12000});
    await page.waitForFunction(()=>document.querySelectorAll('#root li[data-be-extra-mode]').length===0,{timeout:10000});
    assert.equal(await links.count(),18,'Collapse must restore exactly the original 18 cards');
    console.log('ALL_MODES_COLLAPSED '+JSON.stringify({viewport:viewport.width,total:await links.count(),errors:errors.slice(0,4)}));
    // Open one formerly development-only mode using the optional catalog.
    await button.click();
    await page.locator('li[data-be-extra-mode="flow-field"] a').click({timeout:15000});
    await page.waitForURL('**/studio?mode=flow-field',{timeout:16000});
    await page.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:30000});
    const selected=(await page.locator('button[title="Change mode"]').first().innerText()).trim();
    assert.equal(selected,'Flow 3D','Experimental link did not select its real renderer');
    assert.ok(await page.locator('canvas').count()>=1,'Experimental Flow 3D has no rendering canvas');
    assert.ok(!errors.some(e=>/Minified React error|Cannot read properties of undefined/i.test(e)),'Original React mode failed');
    console.log('ALL_MODES_EXPERIMENTAL_OPEN '+JSON.stringify({viewport:viewport.width,mode:selected,url:new URL(page.url()).pathname+new URL(page.url()).search,canvas:await page.locator('canvas').count(),errors:errors.slice(0,5)}));
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('ALL_MODES_CATALOG_FAIL',String(e.stack||e));process.exitCode=1;server.close();});