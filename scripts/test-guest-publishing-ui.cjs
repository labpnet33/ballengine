'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const web=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const dir=path.resolve(__dirname,'..','test-results','publishing');fs.mkdirSync(dir,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
   const u=new URL(req.url,'http://localhost');
   let rel=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
   if(!rel||rel==='automation'||rel==='automation/')rel='index.html';
   const file=path.resolve(web,rel);
   if(!file.startsWith(web+path.sep))return res.writeHead(403).end();
   fs.readFile(file,(err,buf)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(buf));
 }catch{res.writeHead(400).end();}
});
const report={stage:'init',studioPlanner:false,automationPlanner:false,mp4Upload:false,scheduled:false,
  recurring:false,manualCompletion:false,queueCleared:false,errors:[],api:[]};
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await context.newPage(),base='http://127.0.0.1:'+server.address().port;
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ballengine-publish-ui-'));
 let token=null;let jobIds=new Set,mediaId=null;
 page.on('pageerror',e=>report.errors.push({kind:'page',message:String(e).slice(0,270)}));
 page.on('response',r=>{if(r.url().includes('ballengine-project-saves.labpnet33.workers.dev'))report.api.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
 page.on('dialog',async d=>{if(d.type()==='confirm')await d.accept();else await d.dismiss();});
 async function direct(path,method='GET'){
   const r=await fetch('https://ballengine-project-saves.labpnet33.workers.dev'+path,{
     method,headers:{Origin:base,Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
   return {status:r.status,data:await r.json().catch(()=>({}))};
 }
 async function screenshot(name){await page.screenshot({path:path.join(dir,name+'.png')}).catch(()=>{});}
 try{
   report.stage='studio';
   await page.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(6500);
   await page.locator('button[title="Publish (7)"]').first().click({timeout:20000});
   const planner=page.locator('[data-be-guest-publisher]').first();
   await planner.waitFor({state:'visible',timeout:15000});report.studioPlanner=true;
   assert.ok((await planner.innerText()).includes('NOT automatically posted'),'Planner misrepresents manual posting.');
   token=await page.evaluate(()=>localStorage.getItem('ballengine_cloud_recovery_v1'));
   assert.match(token||'',/^be1_[a-zA-Z0-9_-]{43}$/);
   const mp4=path.join(tmp,'sample.mp4');
   cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=160x288:rate=12:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',mp4],{timeout:30000});
   const input=planner.locator('input[type="file"]').first();
   await input.setInputFiles(mp4);
   await planner.locator('input[type="text"]').first().fill('Studio publishing UI test '+crypto.randomBytes(4).toString('hex'));
   await planner.locator('textarea').first().fill('Vertical short #satisfying');
   await planner.locator('input[type="checkbox"][value="youtube"]').check();
   await planner.locator('input[type="datetime-local"]').first().fill(
     await page.evaluate(()=>{
       const d=new Date(Date.now()+900000);
       return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
     })
   );
   await planner.locator('select').first().selectOption('weekly');
   report.stage='schedule';
   await planner.getByRole('button',{name:'Schedule reminder'}).click({timeout:15000});
   await planner.getByText(/Reminder scheduled\./).waitFor({timeout:60000});
   report.scheduled=true;
   await screenshot('studio-scheduled');
   const list=await direct('/api/guest-publishing/jobs');
   assert.equal(list.status,200);
   assert.equal(list.data.jobs.length,1,'Browser did not store one scheduled draft');
   const job=list.data.jobs[0];jobIds.add(job.id);mediaId=job.videoAssetId;
   assert.equal(job.status,'scheduled');assert.equal(job.repeat,'weekly');
   assert.ok(job.videoUrl,'MP4 upload not stored in cloud queue');
   report.mp4Upload=true;
   report.stage='automation';
   await page.goto(base+'/automation',{waitUntil:'domcontentloaded',timeout:45000});
   const second=page.locator('[data-be-guest-publisher]').first();
   await second.waitFor({state:'visible',timeout:20000});
   await second.getByText(job.title,{exact:true}).waitFor({timeout:20000});
   report.automationPlanner=true;
   await screenshot('automation-queue');
   report.stage='mark-posted';
   await second.getByRole('button',{name:'Mark posted'}).first().click({timeout:15000});
   await second.getByText(/next recurring reminder created/i).waitFor({timeout:25000});
   const after=await direct('/api/guest-publishing/jobs');
   assert.equal(after.data.jobs.length,2,'Weekly reminder was not generated');
   for(const x of after.data.jobs)jobIds.add(x.id);
   assert.ok(after.data.jobs.some(x=>x.status==='published'));
   assert.ok(after.data.jobs.some(x=>x.status==='scheduled'));
   report.manualCompletion=true;report.recurring=true;
   await screenshot('recurring-ready');
   report.stage='cleanup';
   for(const id of jobIds){
     const done=await direct('/api/guest-publishing/jobs/'+id,'DELETE');
     assert.equal(done.status,200);
   }
   jobIds.clear();
   const empty=await direct('/api/guest-publishing/jobs');
   assert.equal(empty.data.jobs.length,0,'Temporary test jobs not cleaned up');
   report.queueCleared=true;report.stage='passed';
   console.log('GUEST_PUBLISH_UI_PASS '+JSON.stringify({studioPlanner:report.studioPlanner,automationPlanner:report.automationPlanner,
     mp4Upload:report.mp4Upload,scheduled:report.scheduled,recurring:report.recurring,
     manualCompletion:report.manualCompletion,queueCleared:report.queueCleared}));
 }catch(e){
   report.stage='failed';
   report.errors.push({kind:'test',message:String(e.stack||e).slice(0,1600)});
   throw e;
 }finally{
   if(token){
     for(const id of jobIds)await direct('/api/guest-publishing/jobs/'+id,'DELETE').catch(()=>{});
     if(mediaId)await direct('/api/assets/'+mediaId,'DELETE').catch(()=>{});
   }
   await screenshot('final');fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
   console.log('GUEST_PUBLISH_UI_SUMMARY '+JSON.stringify({...report,api:report.api.slice(-40)}).slice(0,10000));
   fs.rmSync(tmp,{recursive:true,force:true});
   await browser.close();await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error('GUEST_PUBLISH_UI_FAIL',String(e.stack||e).slice(0,1500));process.exitCode=1;server.close();});
