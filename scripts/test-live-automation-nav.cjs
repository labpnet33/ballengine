'use strict';
const { chromium }=require('playwright-core');
const assert=require('node:assert/strict');
const base='https://ballengine.vercel.app';
const paths=['/automation','/automation/accounts','/automation/publish','/automation/autopilot'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 let failures=[];
 try{
  for(const device of [{name:'desktop',viewport:{width:1440,height:900},isMobile:false}]){
   const ctx=await browser.newContext({viewport:device.viewport,isMobile:device.isMobile,deviceScaleFactor:device.deviceScaleFactor||1,hasTouch:device.hasTouch||false,serviceWorkers:'block'});
   const page=await ctx.newPage();
   const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,350)));
   page.on('response',r=>{if(r.status()>=400){try{const u=new URL(r.url());if(u.hostname==='ballengine.vercel.app')requests.push({status:r.status(),path:u.pathname});}catch{}}});
   for(const path of paths){
    const t=Date.now();let status='error',loaded=false,planner=false,exception=null;
    try{
     const r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000});
     status=r.status();
     await page.getByRole('heading',{name:'Automation',exact:true}).first().waitFor({state:'visible',timeout:30000});
     await page.locator('[data-be-guest-publisher]').first().waitFor({state:'visible',timeout:30000});
     loaded=true;planner=true;
     await page.waitForTimeout(800);
    }catch(e){exception=String(e).slice(0,320); failures.push({device:device.name,path,exception});}
    const state=await page.evaluate(()=>({
     url:location.href,
     title:document.title,
     readyState:document.readyState,
     h1:[...document.querySelectorAll('h1')].map(x=>x.innerText).slice(0,4),
     bodyText:document.querySelector('#root main')?.innerText?.slice(0,1350)||document.body?.innerText?.slice(0,1000),
     isReady:!!document.querySelector('[data-be-guest-publisher]'),
     inertButtons:[...document.querySelectorAll('#root main button')].filter(x=>x.disabled).map(x=>x.textContent?.trim()).filter(Boolean).slice(0,12),
     links:[...document.querySelectorAll('#root main a')].filter(x=>/Accounts|Publish|Autopilot|Overview/.test(x.textContent)).map(x=>({text:x.textContent.trim().slice(0,60),href:x.getAttribute('href')})).slice(0,15),
     loadingCount:[...document.querySelectorAll('#root main *')].filter(e=>e.children.length===0&&/^(Loading|Connecting|Checking your plan)/i.test(e.textContent?.trim()||'')).slice(0,20).map(e=>e.textContent.trim().slice(0,100))
    }));
    console.log('AUTOMATION_NAV_DIAG '+JSON.stringify({device:device.name,path,status,loaded,planner,elapsedMs:Date.now()-t,exception,state,errors:errors.slice(-12),recent404:requests.slice(-25)}));
   }
   if(device.name==='desktop'){
    await page.goto(base+'/automation',{waitUntil:'domcontentloaded',timeout:35000});
    await page.getByRole('heading',{name:'Automation',exact:true}).first().waitFor({state:'visible',timeout:30000});
    for(const label of ['Accounts','Publish','Autopilot']){
     const controls=await page.evaluate((label)=>{
       const els=[...document.querySelectorAll('#root *')].filter(x=>x.children.length===0&&x.textContent?.trim()===label);
       return els.slice(0,5).map(x=>({
         tag:x.tagName,
         parent:x.parentElement?.outerHTML?.slice(0,1200),
         grandparent:x.parentElement?.parentElement?.outerHTML?.slice(0,1200)
       }));
     },label);
     console.log('AUTOMATION_TAB_CONTROL '+JSON.stringify({label,controls}));
     const button=page.getByRole('button',{name:label,exact:true}).first();
     const count=await button.count();
     if(!count){failures.push({device:'desktop',action:label,error:'no tab button',controls});continue;}
     try{
      await button.click({timeout:15000});
      await page.waitForTimeout(5000);
      const view=await page.evaluate(()=>({url:location.pathname,title:document.title,main:document.querySelector('#root main')?.innerText?.slice(0,950),planner:!!document.querySelector('[data-be-guest-publisher]'),h1:document.querySelector('h1')?.innerText}));
      console.log('AUTOMATION_CLICK_DIAG '+JSON.stringify({label,view}));
      if(!view.url.includes('/'+label.toLowerCase())||!view.h1?.includes('Automation'))failures.push({action:label,error:'tab did not navigate',view});
     }catch(e){failures.push({action:label,error:String(e).slice(0,350)});}
    }
   }
   await ctx.close();
  }
  console.log('AUTOMATION_DIAG_SUMMARY '+JSON.stringify({failures,count:failures.length}));
  assert.equal(failures.length,0,'Direct routes or in-app navigation broken');
 }finally{await browser.close();}
})().catch(e=>{console.error('AUTOMATION_NAV_FAIL',String(e.stack||e).slice(0,1500));process.exitCode=1;});