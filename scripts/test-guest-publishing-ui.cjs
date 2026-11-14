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
   if(!rel)rel='index.html';
   // Serve the ORIGINAL Automation HTML through its physical static route.
   if(rel==='automation'||rel==='automation/')rel='automation/index.html';
   if(rel==='automation/queue'||rel==='automation/queue/')rel='automation/queue/index.html';
   if(rel==='automation/brands'||rel==='automation/brands/')rel='automation/brands/index.html';
   for(const tab of ['accounts','publish','autopilot','plan'])if(rel==='automation/'+tab||rel==='automation/'+tab+'/')rel='automation/'+tab+'/index.html';
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
   const response=await page.goto(base+'/automation',{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response.status(),200,'Original /automation route returned 404');
   const pageTitle=await page.title();
   assert.ok(pageTitle.includes('Automation'),'The page served was not the original captured Automation screen');
   assert.ok((await page.locator('script[src="/ballengine-guest-publishing.js"]').count())===1,'Guest publishing adapter missing from Automation page');
   const second=page.locator('[data-be-guest-publisher]').first();
   await second.waitFor({state:'visible',timeout:20000});
   await second.getByText(job.title,{exact:true}).waitFor({timeout:20000});
   await page.getByText('Guest draft scheduling is available in Overview and Publish.',{exact:false}).waitFor({state:'visible',timeout:12000});
   const dashboard=await page.evaluate(()=>{
     const original='Automation is not active on this account, so connecting accounts, scheduling and Autopilot are all switched off. Every plan covers every platform.';
     const main=document.querySelector('#root main');
     const planner=main?.querySelector('[data-be-guest-publisher]');
     const gate=main?.querySelector('[data-be-legacy-automation-warning]');
     return {oldWarningVisible:[...main.querySelectorAll('div,p,span')].some(el=>el.children.length===0&&el.textContent?.trim()===original&&!!el.getClientRects().length),
       plannerInsideOriginalContent:!!planner&&planner.parentElement!==main,
       guestStatus:gate?.dataset.beGuestStatus,
       plannerTop:planner?.getBoundingClientRect().top??null,
       originalGateTop:gate?.getBoundingClientRect().top??null};
   });
   assert.equal(dashboard.oldWarningVisible,false,'Original misleading inactive-plan warning still displayed');
   assert.equal(dashboard.plannerInsideOriginalContent,true,'Planner outside original Automation dashboard layout');
   assert.equal(dashboard.guestStatus,'manual','Guest manual status not applied');
   assert.ok(dashboard.plannerTop<=dashboard.originalGateTop,'Planner should be placed above legacy subscription gate');
   console.log('GUEST_AUTOMATION_STATUS_PASS '+JSON.stringify(dashboard));

   console.log('AUTOMATION_LAYOUT_AUDIT '+JSON.stringify(await page.evaluate(()=>{
     const warning='Automation is not active on this account, so connecting accounts, scheduling and Autopilot are all switched off. Every plan covers every platform.';
     const main=document.querySelector('#root main');
     const messages=[...document.querySelectorAll('#root main *')].filter(e=>e.children.length===0&&e.textContent?.trim()===warning);
     function desc(e){if(!e)return null;return {tag:e.tagName,cls:e.className,childCount:e.children.length,text:e.innerText?.slice(0,350)};}
     const target=messages[0];
     return {
       main:desc(main),
       mainChildren:[...main.children].map(desc).slice(0,10),
       mainGrandchildren:[...main.children].flatMap(e=>[...e.children]).map(desc).slice(0,12),
       message:desc(target),
       ancestry:target?[target,target.parentElement,target.parentElement?.parentElement,target.parentElement?.parentElement?.parentElement].map(desc):[],
       headings:[...main.querySelectorAll('h1,h2,h3')].map(desc).slice(0,16),
       plannerParent:desc(document.querySelector('[data-be-guest-publisher]')?.parentElement)
     };
   })));

   report.automationPlanner=true;
   await screenshot('automation-queue');
   for(const tab of ['accounts','publish','autopilot']){
     report.stage='automation-'+tab;
     const response=await page.goto(base+'/automation/'+tab,{waitUntil:'domcontentloaded',timeout:45000});
     assert.equal(response.status(),200,'Existing Automation '+tab+' route missing');
     await page.locator('h1').filter({hasText:'Automation'}).first().waitFor({state:'visible',timeout:30000});
     await page.getByText('Guest draft scheduling is available in Overview and Publish.',{exact:false})
       .waitFor({state:'visible',timeout:12000});
     const manualPlanner=page.locator('[data-be-guest-publisher]');
     if(tab==='publish'){
       await manualPlanner.first().waitFor({state:'visible',timeout:30000});
       await page.getByText('Choose the video',{exact:true}).first().waitFor({state:'visible',timeout:15000});
       const placement=await page.evaluate(()=>{
         const p=document.querySelector('#root main [data-be-guest-publisher]');
         const n=[...document.querySelectorAll('#root main *')].find(e=>e.children.length===0&&e.textContent?.trim()==='Choose the video');
         return {originalBeforePlanner:!!n&&!!p&&!!(n.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)};
       });
       assert.ok(placement.originalBeforePlanner,'Original Publish step must be visible before the guest planner');
     }else{
       await page.waitForTimeout(1600);
       assert.equal(await manualPlanner.count(),0,'Duplicate guest composer hides original '+tab+' content');
       const original=await page.locator('#root main').innerText();
       assert.ok(tab==='accounts'?original.includes('Posting as'):original.includes('Automatic posting is not configured.'),
         'Original '+tab+' content did not render');
     }
     assert.equal(await page.getByText('Automation is not active on this account, so connecting accounts, scheduling and Autopilot are all switched off. Every plan covers every platform.',{exact:true}).count(),0,
       'Obsolete subscription warning is still shown on '+tab);
     console.log('GUEST_AUTOMATION_TAB_PASS '+JSON.stringify({tab,url:page.url(),title:await page.title(),plannerCount:await manualPlanner.count()}));
   }
   // Return to the shared queue before using its Mark posted action.
   await page.goto(base+'/automation',{waitUntil:'domcontentloaded',timeout:45000});
   const queueAgain=page.locator('[data-be-guest-publisher]').first();
   await queueAgain.getByText(job.title,{exact:true}).waitFor({timeout:25000});
   report.stage='mark-posted';
   await queueAgain.getByRole('button',{name:'Mark posted'}).first().click({timeout:15000});
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
