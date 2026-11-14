'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.wav':'audio/wav','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400).end();return}
  const relative=url.pathname==='/studio'?'studio/index.html':url.pathname.replace(/^\/+/, '')||'index.html';
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end();return}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
});
async function main(){
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  try{
    await page.goto('http://127.0.0.1:'+server.address().port+'/studio',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#scene').waitFor();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#exportSummary').innerText(),'720 × 1280 · 30 fps');
    await page.locator('[data-tab="video"]').click();
    await page.selectOption('#exportAspect','16:9');
    await page.selectOption('#exportQuality','1080');
    await page.selectOption('#exportFps','60');
    assert.equal(await page.locator('#exportSummary').innerText(),'1920 × 1080 · 60 fps');
    await page.selectOption('#exportAspect','1:1');
    assert.equal(await page.locator('#exportSummary').innerText(),'1080 × 1080 · 60 fps');
    await page.selectOption('#exportAspect','4:3');
    assert.equal(await page.locator('#exportSummary').innerText(),'1440 × 1080 · 60 fps');
    await page.locator('[data-tab="arts"]').click();
    await page.selectOption('#ballShape','star');
    await page.selectOption('#ballStyle','neon');
    await page.locator('#arenaSides').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input',{bubbles:true}))});
    assert.equal(await page.locator('#arenaSidesVal').innerText(),'9');
    await page.locator('#headerSave').click();
    assert.match(await page.locator('#status').innerText(),/saved in this browser/i);
    await page.screenshot({path:'free-studio-smoke.png'});
    await page.locator('[data-tab="video"]').click();
    await page.selectOption('#exportAspect','9:16');
    await page.selectOption('#exportQuality','720');
    await page.selectOption('#exportFps','30');
    await page.selectOption('#duration','10');
    await page.locator('#record').click();
    await page.waitForFunction(()=>/Saved WebM/i.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
    const result={
      status:await page.locator('#status').innerText(),
      frame:await page.locator('#exportSummary').innerText(),
      shape:await page.locator('#ballShape').inputValue(),
      style:await page.locator('#ballStyle').inputValue(),
      errors
    };
    assert.deepEqual(errors,[],'Browser console raised uncaught JS errors');
    fs.writeFileSync('free-studio-smoke.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{
    await browser.close();
    await new Promise(ok=>server.close(ok));
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;server.close()});
