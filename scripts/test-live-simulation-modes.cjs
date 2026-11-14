'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const base=process.env.BALLENGINE_BASE||'https://ballengine.vercel.app';
const names=['phase-bloom','phonk-drop','marble-run','ball-race','target-hit','falling-sand','plinko','color-match','spin-battle','lava-survival','glass-slice','flood-fill','eulers-disk','drum-sort','plinko-3d','chladni','voxel','domino-3d','marble-race-3d','attractor','flow-3d','metaballs','galaxy','fireflies','pendulum-basin','slime','crowd-evacuation','illusions'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 try{
   const page=await ctx.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,350)));
   page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push({status:r.status(),path:new URL(r.url()).pathname});});
   await page.goto(base+'/home',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(3300);
   console.log('SIMULATION_HOME_CATALOG '+JSON.stringify(await page.evaluate(()=>({
      path:location.pathname,
      headings:[...document.querySelectorAll('h1,h2,h3,h4')].filter(e=>e.getClientRects().length).map(e=>e.innerText.trim()).slice(0,45),
      matching:[...document.querySelectorAll('button,a,h1,h2,h3,h4')].filter(e=>e.getClientRects().length&&/All simulation modes|simulation modes|Explore.*modes/i.test(e.textContent||'')).map(e=>({tag:e.tagName,text:e.innerText.trim().slice(0,120),href:e.getAttribute('href'),html:e.outerHTML.slice(0,700)})).slice(0,25),
      modeLinks:[...document.querySelectorAll('a[href*="mode="]')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText.trim().slice(0,100),href:e.getAttribute('href')})).slice(0,70)
   }))));
   await page.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(5500);
   const init=await page.evaluate(()=>({
    title:document.title,pathname:location.pathname,search:location.search,
    text:document.querySelector('#root')?.innerText?.slice(0,5400),
    h:[...document.querySelectorAll('h1,h2,h3')].filter(e=>e.getClientRects().length).map(x=>x.innerText.slice(0,100)).slice(0,20),
    buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText.trim().slice(0,70),title:e.title,aria:e.getAttribute('aria-label'),disabled:e.disabled,cls:e.className?.toString().slice(0,160)})).filter(e=>e.text||e.title||e.aria).slice(0,100),
    modeElements:[...document.querySelectorAll('button,a,select,input')].filter(e=>/mode|simulation|all modes/i.test([e.title,e.getAttribute('aria-label'),e.textContent?.trim(),e.name].join(' '))).filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,text:e.textContent?.trim().slice(0,85),title:e.title,aria:e.getAttribute('aria-label'),html:e.outerHTML.slice(0,850)})).slice(0,40),
    canvas:[...document.querySelectorAll('canvas')].map(e=>({w:e.width,h:e.height,visible:!!e.getClientRects().length})).slice(0,8),
    planNotices:[...document.querySelectorAll('#root *')].filter(e=>e.children.length===0&&/Unlock|locked|plan required|subscribe/i.test(e.textContent?.trim()||'')).filter(e=>e.getClientRects().length).map(e=>e.textContent.trim().slice(0,150)).slice(0,25)
   }));
   console.log('SIMULATION_MODE_INITIAL '+JSON.stringify({init,errors:errors.slice(-12),failed:failed.slice(-20)}));
   const changeMode=page.locator('button[title="Change mode"]').first();
   console.log('SIMULATION_CHANGE_BUTTON '+await changeMode.count());
   if(await changeMode.count()){
     await changeMode.click({timeout:15000});
     await page.waitForTimeout(1600);
     console.log('SIMULATION_CHANGE_MENU '+JSON.stringify(await page.evaluate(()=>({
       dialogs:[...document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"]')].filter(x=>x.getClientRects().length).map(x=>({role:x.getAttribute('role'),text:x.innerText.slice(0,9000)})).slice(0,6),
       buttons:[...document.querySelectorAll('button')].filter(x=>x.getClientRects().length).map(x=>({
         text:x.innerText.trim().slice(0,85),title:x.title,disabled:x.disabled,ariaDisabled:x.getAttribute('aria-disabled'),aria:x.getAttribute('aria-label'),
         parentText:x.parentElement?.innerText.slice(0,160)
       })).filter(x=>x.text||x.title).slice(-120),
       modeImages:[...document.querySelectorAll('img[src*="/mode-thumbs/"]')].filter(x=>x.getClientRects().length)
         .map(x=>({src:x.getAttribute('src'),alt:x.alt,parent:x.parentElement?.parentElement?.innerText.slice(0,200)})).slice(0,75),
       text:document.body.innerText.slice(-8000)
     }))));
   }
   // Inspect the native In development panel without overriding entitlements.
   const panel=page.getByRole('button',{name:/In development.*27/i}).first();
   console.log('SIMULATION_DEVELOPMENT_PANEL_BUTTON '+await panel.count());
   if(await panel.count()){
     // Close the top menu before opening the development panel in the sidebar.
     await page.locator('button[title="Change mode"]').first().click({timeout:8000}).catch(()=>{});
     await panel.click({timeout:10000}).catch(e=>console.log('SIMULATION_DEVELOPMENT_OPEN_ERR '+String(e).slice(0,500)));
     await page.waitForTimeout(900);
     console.log('SIMULATION_DEVELOPMENT_PANEL '+JSON.stringify(await page.evaluate(()=>({
       text:document.querySelector('#root')?.innerText?.slice(-7000),
       controls:[...document.querySelectorAll('button,[role="button"],a')].filter(x=>x.getClientRects().length).map(x=>({
         text:x.innerText?.trim().slice(0,85),disabled:x.disabled,ariaDisabled:x.getAttribute('aria-disabled'),title:x.title,
         css:x.className?.toString().slice(0,110),testid:x.getAttribute('data-testid')
       })).filter(x=>x.text).slice(-100),
       img:[...document.querySelectorAll('img[src*="/mode-thumbs/"]')].filter(x=>x.getClientRects().length)
         .map(x=>({src:x.getAttribute('src'),parent:x.parentElement?.parentElement?.innerText.slice(0,140)})).slice(-80)
     }))));
   }
   // Try the actual original development entries, without forcing clicks or
   // manufacturing a "working" result for unfinished engines.
   for(const [title,label] of [
     ['Every ball keeps its own beat until they all line up. In development.','Bloom'],
     ['Racers sprint down a long track. In development.','Race'],
     ['A chain reaction ending in a giant. In development.','Domino 3D'],
     ['Reverse-the-spin, hidden shapes, afterimages and stereograms','Illusions']
   ]){
      const candidate=page.locator('[title="'+title.replaceAll('"','\\"')+'"]').first();
      const count=await candidate.count();let click=null;
      const before=page.url();
      if(count){
        try{await candidate.click({timeout:7000});await page.waitForTimeout(1300);click='clicked';}
        catch(e){click=String(e).slice(0,260);}
      }
      const state=await page.evaluate(()=>({
        url:location.pathname+location.search,
        selected:document.querySelector('button[title="Change mode"]')?.innerText,
        text:document.querySelector('#root')?.innerText.slice(0,650),
        dialog:[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(e=>e.getClientRects().length).map(e=>e.innerText.slice(0,400)),
        toast:[...document.querySelectorAll('[role="alert"],[role="status"]')].filter(e=>e.getClientRects().length).map(e=>e.innerText.slice(0,300))
      }));
      console.log('SIMULATION_DEV_CLICK '+JSON.stringify({label,count,click,before,state}));
      if(state.url!==new URL(before).pathname+new URL(before).search){
        await page.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(1300);
        await page.getByRole('button',{name:/In development.*27/i}).first().click({timeout:8000});
        await page.waitForTimeout(400);
      }
   }
   const pickers=page.getByText(/All simulation modes/i);
   console.log('SIMULATION_PICKER_COUNT '+await pickers.count());
   if(await pickers.count()){
     await pickers.first().click({timeout:12000}).catch(e=>console.log('SIMULATION_PICKER_CLICK_FAILURE '+String(e).slice(0,300)));
     await page.waitForTimeout(1300);
     console.log('SIMULATION_PICKER_OPEN '+JSON.stringify(await page.evaluate(()=>({
       heading:[...document.querySelectorAll('h1,h2,h3')].filter(e=>e.getClientRects().length).map(x=>x.innerText.trim()).slice(0,25),
       modes:[...document.querySelectorAll('button,[role="button"],a')].filter(e=>e.getClientRects().length).map(e=>({text:e.innerText?.trim().slice(0,100),title:e.title,disabled:e.disabled,aria:e.getAttribute('aria-label')})).filter(x=>x.text).slice(-100),
       text:document.body.innerText.slice(-4500)
     }))));
   }
   for(const mode of names){
    const at=Date.now();errors.length=0;failed.length=0;
    let status=0;let pageError=null;
    try{
      const res=await page.goto(base+'/studio?mode='+mode,{waitUntil:'domcontentloaded',timeout:45000});status=res.status();
      await page.waitForTimeout(2100);
    }catch(e){pageError=String(e).slice(0,300);}
    const s=await page.evaluate(()=>({
      url:location.pathname+location.search,
      title:document.title,
      text:document.querySelector('#root')?.innerText?.slice(0,2200),
      visibleCanvases:[...document.querySelectorAll('canvas')].filter(x=>x.getClientRects().length).map(x=>({width:x.width,height:x.height})).slice(0,4),
      selected:[...document.querySelectorAll('button,[role="button"],option')].filter(x=>x.getAttribute('aria-current')==='true'||x.getAttribute('aria-selected')==='true'||x.getAttribute('data-state')==='active').filter(x=>x.getClientRects().length).map(x=>({text:x.textContent.trim().slice(0,50),title:x.title})).slice(0,15),
      activeMode:document.querySelector('button[title="Change mode"]')?.textContent.trim(),
      lockedText:[...document.querySelectorAll('#root *')].filter(e=>e.children.length===0&&/Unlock|Feature locked|Select a plan|Upgrade|mode unavailable/i.test(e.textContent?.trim()||'')).filter(e=>e.getClientRects().length).map(e=>e.textContent.trim().slice(0,130)).slice(0,8),
      loading:[...document.querySelectorAll('#root *')].filter(e=>e.children.length===0&&/^(Loading|Waiting for|Checking your plan|Connecting to)/i.test(e.textContent?.trim()||'')).filter(e=>e.getClientRects().length).map(e=>e.textContent.trim().slice(0,110)).slice(0,6)
    }));
    console.log('SIMULATION_MODE_PROBE '+JSON.stringify({mode,status,seconds:((Date.now()-at)/1000).toFixed(1),pageError,state:s,errors:errors.slice(-8),failed:failed.slice(-15)}));
   }
 }finally{await ctx.close();await browser.close();}
})().catch(e=>{console.error('SIMULATION_MODE_FATAL',String(e.stack||e).slice(0,1800));process.exitCode=1;});