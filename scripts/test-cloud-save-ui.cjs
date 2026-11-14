'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const out=path.resolve(__dirname,'..','test-results','cloud-saves');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
  let relative;
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    relative=url.pathname==='/studio'?'studio/index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
    if(!relative||relative.endsWith('/'))relative+='index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,body)=>{
      if(err){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      res.end(body);
    });
  }catch{res.writeHead(400).end();}
});
const report={phase:'initial',cloudApi:[],errors:[],cloudRecoveryWidget:false,localSave:false,cloudSave:false,secondBrowser:false,cleaned:false};
let key,cloudId;
async function run(){
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({kind:'page',message:String(e).slice(0,250)}));
  page.on('response',r=>{if(r.url().includes('ballengine-project-saves.labpnet33.workers.dev'))report.cloudApi.push({method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()});});
  const base='http://127.0.0.1:'+server.address().port;
  async function openSaves(){
    const button=page.locator('button[title="Saves (6)"]').first();
    await button.waitFor({state:'visible',timeout:30000});
    await button.click({timeout:15000});
    await page.getByText('Save system',{exact:true}).first().waitFor({state:'visible',timeout:15000});
    return page.locator('div.flex.flex-col.gap-3').filter({has:page.getByText('Save system',{exact:true})}).last();
  }
  async function getData(endpoint,method='GET',body){
    const r=await fetch('https://ballengine-project-saves.labpnet33.workers.dev'+endpoint,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+key,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json().catch(()=>({}))};
  }
  try{
    report.phase='load-studio';
    await page.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(7500);
    let panel=await openSaves();
    report.phase='local-save';
    await page.screenshot({path:path.join(out,'saves-before.png')});
    report.before=(await panel.innerText()).slice(0,3200);
    const localTab=panel.getByRole('button',{name:'Local',exact:true}).first();
    await localTab.click();
    await panel.locator('input[placeholder="Save name..."]').first().fill('CI browser local save');
    await panel.getByRole('button',{name:'Save',exact:true}).first().click();
    await page.waitForTimeout(1200);
    report.localSave=(await panel.innerText()).includes('CI browser local save');
    assert.ok(report.localSave,'Local save did not appear in Saves panel');
    report.phase='cloud-save';
    await panel.getByRole('button',{name:'Cloud',exact:true}).first().click();
    await page.waitForTimeout(1100);
    report.cloudRecoveryWidget=(await panel.getByRole('button',{name:'Copy cloud key'}).count())>0;
    assert.ok(report.cloudRecoveryWidget,'Recovery key controls not found in original Saves panel');
    key=await page.evaluate(()=>localStorage.getItem('ballengine_cloud_recovery_v1'));
    assert.match(key||'',/^be1_[A-Za-z0-9_-]{43}$/,'Cloud key not generated');
    await panel.locator('input[placeholder="Save name..."]').first().fill('CI browser cloud save');
    await panel.getByRole('button',{name:'Save',exact:true}).first().click();
    await page.waitForTimeout(1800);
    const data=await getData('/api/saves?limit=20');
    assert.equal(data.status,200,'Cloud list HTTP failure');
    const item=data.data.saves.find(x=>x.name==='CI browser cloud save');
    assert.ok(item,'Original Cloud save button did not write a project to D1');
    cloudId=item.id;
    report.cloudSave=true;
    report.phase='reload-cloud';
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(7000);
    panel=await openSaves();
    await panel.getByRole('button',{name:'Cloud',exact:true}).first().click();
    await page.waitForTimeout(1200);
    report.afterReload=(await panel.innerText()).slice(0,3200);
    assert.ok(report.afterReload.includes('CI browser cloud save'),'Cloud save not visible after reload');
    await page.screenshot({path:path.join(out,'saves-cloud-reloaded.png')});
    const beforeLoadRequests=report.cloudApi.length;
    await panel.getByRole('button',{name:'Load',exact:true}).first().click();
    await page.waitForTimeout(1800);
    report.loadRequestObserved=report.cloudApi.slice(beforeLoadRequests).some(r=>r.status===200&&r.path.includes('/api/saves/'));
    report.lastUsed=await page.evaluate(()=>{try{const x=JSON.parse(localStorage.getItem('studio_last_used_save')||'null');return x?{scope:x.scope,action:x.action,key:x.key}:null;}catch{return null;}});
    report.cloudLoaded=report.lastUsed?.scope==='CLOUD'&&report.lastUsed.key===cloudId;
    assert.ok(report.cloudLoaded||report.loadRequestObserved,'Cloud save Load action did not restore the selected project');
    await panel.getByRole('button',{name:'Local',exact:true}).first().click();
    await page.waitForTimeout(800);
    assert.ok((await panel.innerText()).includes('CI browser local save'),'Local browser save was lost');
    report.phase='second-device';
    const newContext=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const device=await newContext.newPage();
    // Exercise the actual "Use existing key" flow instead of pre-seeding
    // localStorage in the test; the second device should start with its own key.
    device.on('dialog',async dialog=>{
      if(dialog.type()==='prompt')await dialog.accept(key);
      else if(dialog.type()==='confirm')await dialog.accept();
      else await dialog.dismiss();
    });
    await device.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
    await device.waitForTimeout(6000);
    await device.locator('button[title="Saves (6)"]').first().click();
    const panel2=device.locator('div.flex.flex-col.gap-3').filter({has:device.getByText('Save system',{exact:true})}).last();
    await panel2.getByRole('button',{name:'Cloud',exact:true}).first().click();
    await device.waitForTimeout(800);
    await panel2.getByRole('button',{name:'Use existing key',exact:true}).click();
    await device.waitForTimeout(2700);
    if(await device.locator('button[title="Saves (6)"]').count()){
      await device.locator('button[title="Saves (6)"]').first().click();
    }
    const restoredPanel=device.locator('div.flex.flex-col.gap-3').filter({has:device.getByText('Save system',{exact:true})}).last();
    await restoredPanel.getByRole('button',{name:'Cloud',exact:true}).first().click();
    await device.waitForTimeout(1300);
    report.secondBrowser=(await restoredPanel.innerText()).includes('CI browser cloud save');
    report.recoveryKeySwitched=await device.evaluate((expected)=>localStorage.getItem('ballengine_cloud_recovery_v1')===expected,key);
    assert.ok(report.recoveryKeySwitched,'Use existing key did not activate the chosen recovery key');
    assert.ok(report.secondBrowser,'Same recovery key did not restore cloud save in another browser');
    await newContext.close();
    report.phase='passed';
  }catch(e){
    report.phase='failed';
    report.errors.push({kind:'test',message:String(e.stack||e).slice(0,1800)});
    throw e;
  }finally{
    if(key&&cloudId){
      try{
        const result=await getData('/api/saves/'+cloudId,'DELETE');
        report.cleaned=result.status===200;
      }catch(e){report.errors.push({kind:'cleanup',message:String(e)});}
    }
    try{await page.screenshot({path:path.join(out,'saves-final.png')});}catch{}
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('CLOUD_UI_SUMMARY '+JSON.stringify(report).slice(0,10500));
    await browser.close();
    await new Promise(ok=>server.close(ok));
  }
}
run().catch(err=>{console.error('CLOUD_UI_FAILURE',String(err.stack||err).slice(0,1500));process.exitCode=1;server.close();});
