'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const base='http://127.0.0.1:8765';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForServer(){
 for(let i=0;i<60;i++){
  try{const r=await fetch(base+'/automation/autopilot/');if(r.ok)return;}catch{}
  await pause(250);
 }
 throw Error('Local BallEngine web server failed to start');
}
async function main(){
 await waitForServer();
 const browser=await chromium.launch({headless:true,
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  for(const route of ['/automation/autopilot/','/automation/']){
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:40000});
   assert.equal(response.status(),200,'Route '+route+' must work on direct navigation');
   await page.locator('nav[aria-label="Automation"]').waitFor({state:'visible',timeout:30000});
   if(route==='/automation/'){
    await page.locator('nav[aria-label="Automation"] button').filter({hasText:'Autopilot'}).click();
    await page.waitForURL(url=>url.pathname==='/automation/autopilot', {timeout:15000});
   }
   await page.locator('#root main [data-tour="autopilot-times"]').waitFor({state:'visible',timeout:25000});
   assert.equal(await page.locator('#root main [aria-label="Loading Autopilot"]').count(),0,
     'Native Autopilot is still stuck on skeleton after loading the existing route');
   await page.locator('#root main [data-be-social-panel]').waitFor({state:'visible',timeout:15000});
   const details=await page.evaluate(()=>({
     url:location.pathname,
     nativeSchedule:!!document.querySelector('#root main [data-tour="autopilot-times"]'),
     socialPanel:document.querySelector('#root main [data-be-social-panel]')?.textContent?.slice(0,180),
     skeletons:document.querySelectorAll('#root main [aria-label="Loading Autopilot"]').length
   }));
   console.log('AUTOPILOT_BROWSER_PASS '+JSON.stringify(details));
  }
  if(errors.length)console.log('AUTOPILOT_BROWSER_JS_WARNINGS '+JSON.stringify(errors.slice(0,6)));
 }finally{await browser.close();}
}
main().catch(e=>{console.error('AUTOPILOT_BROWSER_FAIL',String(e.stack||e));process.exitCode=1;});
