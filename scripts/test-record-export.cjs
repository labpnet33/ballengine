'use strict';
// End-to-end verification of the original captured Studio's Record workflow.
// Uses local static files and never contacts third-party account/credit services.
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const artifacts=path.resolve(__dirname,'..','test-results','record-export');
fs.mkdirSync(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{
  let rel;
  try{
    const u=new URL(req.url,'http://localhost');
    rel=(u.pathname==='/studio'||u.pathname==='/studio/')?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if(!rel||rel.endsWith('/'))rel+='index.html';
    const full=path.resolve(root,rel);
    if(!full.startsWith(root+path.sep))return res.writeHead(403).end();
    fs.readFile(full,(err,buf)=>{
      if(err)return res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');
      res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});
      res.end(buf);
    });
  }catch{res.writeHead(400).end();}
});
const report={phase:'initial',started:false,downloaded:false,errors:[],responses:[],console:[],buttons:[],snapshots:[]};
const addError=(type,value)=>{report.errors.push({type,value:String(value).slice(0,600)});};
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',e=>addError('pageerror',e));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')report.console.push({type:m.type(),text:m.text().slice(0,400)});});
  page.on('requestfailed',r=>addError('requestfailed',r.url()+' '+r.failure()?.errorText));
  page.on('response',r=>{if(r.status()>=400)report.responses.push({status:r.status(),url:r.url().slice(0,250)});});
  page.on('dialog',async d=>{addError('dialog',d.message());await d.dismiss();});
  const port=server.address().port;
  let downloadPromise;
  try{
    report.phase='loading';
    const testMode=process.env.TEST_MODE||'rhythmic';
    await page.goto('http://127.0.0.1:'+port+'/studio?mode='+encodeURIComponent(testMode),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(10000);
    // Some original experimental 3D modes ask for explicit user confirmation.
    const load3d=page.getByRole('button',{name:'Load 3D',exact:true}).first();
    if(await load3d.isVisible().catch(()=>false)){
      await load3d.click({timeout:15000});
      await page.waitForTimeout(3500);
      report.accepted3DPrompt=true;
    }
    report.url=page.url();
    report.testMode=testMode;
    report.browserCapabilities=await page.evaluate(()=>({VideoEncoder:typeof VideoEncoder,MediaRecorder:typeof MediaRecorder,OffscreenCanvas:typeof OffscreenCanvas,WebAssembly:typeof WebAssembly}));
    report.buttons=await page.locator('button').evaluateAll(els=>els.map(e=>({text:(e.innerText||'').trim().slice(0,100),title:e.title||'',aria:e.getAttribute('aria-label')||'',disabled:e.disabled,visible:!!e.getClientRects().length})).filter(x=>x.visible).slice(0,100));
    await page.screenshot({path:path.join(artifacts,'studio-before-record.png')});
    const duration=page.locator('select[title="Clip / seed target duration"]');
    const requestedSeconds=Number(process.env.TEST_DURATION||15);
    report.requestedSeconds=requestedSeconds;
    if(await duration.count()){
      if(requestedSeconds===15||requestedSeconds===30||requestedSeconds===59)
        await duration.first().selectOption(String(requestedSeconds));
      else{
        await duration.first().selectOption('custom');
        const custom=page.locator('input[title="Custom clip length in seconds"]');
        await custom.first().fill(String(Math.min(600,Math.max(1,requestedSeconds))));
        await custom.first().blur();
      }
    }
    const candidate=page.locator('button').filter({visible:true}).filter({hasText:/\bRecord\b/i}).first();
    const alternate=page.locator('button[title*="Record" i],button[aria-label*="Record" i]').filter({visible:true}).first();
    const button=(await candidate.count())?candidate:alternate;
    assert.ok(await button.count(),'No visible Record button found. Buttons: '+JSON.stringify(report.buttons).slice(0,2500));
    report.recordButton=await button.evaluate(e=>({text:e.innerText,title:e.title,aria:e.getAttribute('aria-label')}));
    report.phase='record-clicked';
    downloadPromise=page.waitForEvent('download',{timeout:270000}).catch(()=>null);
    // Diagnose captured onboarding modals independently from the video pipeline.
    report.visibleModals=await page.locator('div.fixed').evaluateAll(els=>els
      .filter(e=>e.getClientRects().length&&typeof e.className==='string'&&e.className.includes('z-[2100]'))
      .map(e=>({className:e.className,text:(e.innerText||e.textContent||'').replace(/\s+/g,' ').slice(0,1700),html:e.outerHTML.slice(0,2500)})).slice(0,8));
    report.clickBlockedByModal=report.visibleModals.length>0;
    if(report.clickBlockedByModal){
      console.warn('RECORD_MODAL_DIAGNOSTICS '+JSON.stringify(report.visibleModals).slice(0,7000));
      // Bypass an unrelated overlay ONLY in this diagnostic test so the local
      // renderer can be exercised independently. Not a website workaround.
      await button.evaluate(el=>el.click());
    } else {
      await button.click({timeout:12000});
    }
    report.started=true;
    // The original UI normally prompts to generate a seed before a timed
    // capture. Choose its existing "Record without a seed" action so this
    // test exercises the real export path rather than waiting on that dialog.
    const noSeed=page.getByRole('button',{name:/^Record without a seed$/i}).first();
    if(await noSeed.isVisible({timeout:3000}).catch(()=>false)){
      report.seedPromptHandled=true;
      await noSeed.click({timeout:8000});
    }
    await page.waitForTimeout(5000);
    if(await noSeed.isVisible().catch(()=>false)){
      report.seedPromptStillVisible=true;
      await noSeed.click({timeout:8000});
    }
    report.after5Seconds=(await page.locator('body').innerText()).slice(-3000);
    await page.screenshot({path:path.join(artifacts,'studio-after-record.png')});
    if(/we couldn't start your export just now|no video frames were recorded|export failed/i.test(report.after5Seconds))
      throw Error('Record failed immediately: '+report.after5Seconds.slice(-1000));
    report.phase='waiting-for-export';
    const end=Date.now()+270000;
    let download=null;
    while(Date.now()<end){
      const outcome=await Promise.race([downloadPromise.then(d=>({download:d})),new Promise(res=>setTimeout(()=>res({tick:true}),4000))]);
      if(outcome.download){download=outcome.download;break;}
      const text=await page.locator('body').innerText().catch(()=>'');
      if(/we couldn't start your export just now|no video frames were recorded|export failed|render failed/i.test(text))
        throw Error('Export failed after recording started: '+text.slice(-1500));
      if(report.snapshots.length<15)report.snapshots.push({second:Math.round((270000-(end-Date.now()))/1000),lastText:text.slice(-600)});
    }
    report.finalVisibleText=(await page.locator('body').innerText()).slice(-3000);
    if(!download)throw Error('No completed downloadable MP4 within 270s; review video gallery / export progress and diagnostic screenshots');
    report.download={suggestedFilename:download.suggestedFilename(),failure:await download.failure()};
    const output=path.join(artifacts,path.basename(download.suggestedFilename()).replace(/[^A-Za-z0-9_.-]/g,'_'));
    await download.saveAs(output);
    const data=fs.readFileSync(output);
    report.download.size=data.length;
    report.download.header=data.subarray(0,32).toString('hex');
    report.download.fileType=data.subarray(4,8).toString('latin1');
    assert.ok(data.length>10000,'MP4 output too small to contain a usable video');
    assert.equal(report.download.fileType,'ftyp','Downloaded output is not an MP4 file');
    report.downloaded=true;
    report.phase='passed';
  }catch(e){report.phase='failed';addError('test',e.stack||e);throw e;}
  finally{
    try{await page.screenshot({path:path.join(artifacts,'studio-final.png')});}catch{}
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));
    console.log('RECORD_EXPORT_SUMMARY '+JSON.stringify({
      phase:report.phase,started:report.started,downloaded:report.downloaded,
      mode:report.url,clickBlockedByModal:report.clickBlockedByModal,
      modalTexts:report.visibleModals?.map(x=>x.text),
      recordButton:report.recordButton,browserCapabilities:report.browserCapabilities,
      errors:report.errors?.filter(e=>e.type==='test'||e.type==='pageerror'),
      after5Seconds:report.after5Seconds?.slice(-1700),
      finalVisibleText:report.finalVisibleText?.slice(-1900),
      snapshots:report.snapshots?.slice(-5),
      download:report.download
    }));
    console.log('RECORD_EXPORT_REPORT '+JSON.stringify(report).slice(0,20000));
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;server.close();});