'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const base='https://ballengine.vercel.app';
async function main(){
  const r=await fetch(base+'/ballengine-guest-publishing.js',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
  const type=r.headers.get('content-type')||'';
  const body=await r.text();
  assert.equal(r.status,200,'Production publishing JS HTTP status');
  assert.match(type,/(?:application|text)\/javascript/,'Production publishing JS wrong MIME type');
  assert.ok(body.includes('function clarifyAutomationStatus()'),'Production still serves the stale guest JS bundle');
  console.log('LIVE_GUEST_SCRIPT_OK '+JSON.stringify({status:r.status,type,bytes:body.length}));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const jsErrors=[];
    page.on('pageerror',e=>jsErrors.push(String(e).slice(0,220)));
    await page.goto(base+'/automation',{waitUntil:'domcontentloaded',timeout:40000});
    await page.locator('[data-be-guest-publisher]').waitFor({state:'visible',timeout:30000});
    await page.getByText('Guest draft scheduling is available in the publishing planner.',{exact:false}).waitFor({state:'visible',timeout:15000});
    const data=await page.evaluate(()=>{
      const main=document.querySelector('#root main');
      const planner=main?.querySelector('[data-be-guest-publisher]');
      const card=main?.querySelector('[data-be-legacy-automation-warning]');
      const oldText='Automation is not active on this account, so connecting accounts, scheduling and Autopilot are all switched off. Every plan covers every platform.';
      const inactive=[...main.querySelectorAll('div,p,span')].some(e=>e.children.length===0&&e.textContent?.trim()===oldText);
      return {
        pageTitle:document.title,
        plannerVisible:!!planner&&!!planner.getClientRects().length,
        plannerInsideDashboard:!!planner&&planner.parentElement!==main,
        oldWarningVisible:inactive,
        manualStatus:card?.dataset.beGuestStatus,
        scheduleButton:!!planner?.querySelector('button')&&planner.innerText.includes('Schedule reminder'),
        cloudLibraryKey:!!localStorage.getItem('ballengine_cloud_recovery_v1')
      };
    });
    assert.ok(data.pageTitle.includes('Automation'));
    assert.ok(data.plannerVisible&&data.plannerInsideDashboard);
    assert.equal(data.oldWarningVisible,false);
    assert.equal(data.manualStatus,'manual');
    assert.ok(data.scheduleButton);
    assert.ok(data.cloudLibraryKey);
    console.log('LIVE_AUTOMATION_GUEST_STATUS_PASS '+JSON.stringify({...data,jsErrors}));

    // Verify all existing Automation tabs as real deep links, including
    // direct navigation and browser reload. These are not new pages:
    // original React route content must render behind their Vercel rewrites.
    for(const slug of ['accounts','publish','autopilot']){
      for(const trailing of ['', '/']){
        const route='/automation/'+slug+trailing;
        const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:40000});
        assert.equal(response.status(),200,route+' returned 404');
        await page.locator('#root main').waitFor({state:'visible',timeout:30000});
        await page.waitForTimeout(5000);
        console.log('LIVE_AUTOMATION_ASSET_DEBUG '+JSON.stringify(await page.evaluate(()=>({
          route:location.pathname,base:document.baseURI,
          scripts:[...document.querySelectorAll('script[src]')].map(s=>({raw:s.getAttribute('src'),resolved:s.src})).slice(0,12),
          styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(s=>({raw:s.getAttribute('href'),resolved:s.href})).slice(0,8),
          title:document.title,
          h1:[...document.querySelectorAll('h1')].map(x=>x.textContent).slice(0,8),
          rootText:document.querySelector('#root main')?.innerText.slice(0,400),
          resourceErrors:performance.getEntriesByType('resource').filter(x=>x.responseStatus>=400).map(x=>({url:x.name,status:x.responseStatus})).slice(0,15)
        }))));
        // /index.html has captured homepage SSR markup; wait for the ORIGINAL
        // React Router to hydrate and render the requested Automation tab.
        await page.locator('h1').filter({hasText:/Automation/i}).first().waitFor({state:'visible',timeout:25000});
        const state=await page.evaluate(()=>({
          title:document.title,
          text:document.querySelector('#root main')?.innerText?.slice(0,600)||'',
          pathname:location.pathname,
          hasReactRoot:!!document.querySelector('#root main'),
          has404:document.body.innerText.includes('404_NOT_FOUND')||document.body.innerText.includes('This page doesn’t exist')
        }));
        assert.equal(state.pathname,route,'Navigation unexpectedly redirected');
        assert.ok(state.hasReactRoot&&!state.has404,'React Automation route did not render at '+route);
        assert.ok(state.text.includes('Automation'),'Original Automation tab not rendered at '+route);
        console.log('LIVE_AUTOMATION_DEEP_ROUTE_OK '+JSON.stringify({route,status:response.status(),...state}));
      }
    }
  }finally{await browser.close();}
}
main().catch(e=>{console.error('LIVE_AUTOMATION_GUEST_STATUS_FAIL',String(e.stack||e));process.exitCode=1;});
