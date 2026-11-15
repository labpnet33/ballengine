'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const modes=[
 ['rhythmic','Established'],['escape','Established'],['drawer','Established'],['spawner','Established'],['ghost-escape','Established'],['breaker','Established'],['glass-tower','Established'],['flag-battle','Established'],['weapon-battle','Established'],
 ['merge-evolution','Established'],['glass-rush','Established'],['grid-merge','Established'],['wave-3d','Established'],['marble-run-3d','Established'],['ball-crush','Established'],['jelly-3d','Established'],['cut-count','Established'],['magnet','Established'],
 ['phase-bloom','Experimental'],['phonk-drop','Experimental'],['marble-run','Experimental'],['ball-race','Experimental'],['target-hit','Experimental'],['falling-sand','Experimental'],['plinko','Experimental'],['color-match','Experimental'],['spin-battle','Experimental'],['lava-survival','Experimental'],
 ['glass-slice','Experimental'],['flood-fill','Experimental'],['eulers-disk','Experimental'],['drum-sort','Experimental'],['plinko-3d','Experimental'],['chladni','Experimental'],['voxel','Experimental'],['domino-3d','Experimental'],['marble-race-3d','Experimental'],['attractor','Experimental'],
 ['flow-field','Experimental'],['metaballs','Experimental'],['galaxy','Experimental'],['fireflies','Experimental'],['pendulum-basin','Experimental'],['slime','Experimental'],['crowd-evacuation','Experimental']
];
const [start,end]=(process.env.MODE_RANGE||'0:45').split(':').map(Number);
const base=process.env.BALLENGINE_BASE||'https://ballengine.vercel.app';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
   const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
   const page=await context.newPage();
   let errors=[],missing=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,240)));
   page.on('response',r=>{if(r.status()===404 && r.url().includes('/assets/'))missing.push(new URL(r.url()).pathname);});
   const results=[];
   for(const [slug,category] of modes.slice(start,end)){
     errors=[];missing=[];
     const started=Date.now(); let clicked=false,uncaught=null;
     try{
       await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:45000});
       await page.locator('button[title="Change mode"]').first().waitFor({state:'visible',timeout:22000});
       const load3D=page.getByRole('button',{name:'Load 3D',exact:true}).first();
       if(await load3D.isVisible().catch(()=>false)){
         await load3D.click({timeout:12000});
         await page.waitForTimeout(500);
       }
       const gotIt=page.getByRole('button',{name:'Got it',exact:true}).first();
       if(await gotIt.isVisible().catch(()=>false))await gotIt.click({timeout:8000});
       await page.waitForTimeout(300);
       const before=await page.evaluate(()=>{
         const root=document.querySelector('#root');
         const body=root?.innerText||'';
         const mark=body.lastIndexOf('Mode settings');
         const tutorial=body.indexOf('Replay tutorial',mark);
         const detail=mark<0?'':body.slice(mark,tutorial>mark?tutorial:mark+3800).slice(0,4000);
         const visible=e=>!!e.getClientRects().length;
         const controls=[...root.querySelectorAll('input,select,textarea,[role="slider"],[role="switch"]')].filter(visible)
           .map(e=>({tag:e.tagName,type:e.getAttribute('type'),title:e.getAttribute('title'),name:e.getAttribute('name'),aria:e.getAttribute('aria-label'),value:e.value??e.getAttribute('aria-valuenow'),min:e.min,max:e.max,disabled:e.disabled,outer:e.outerHTML.slice(0,170)}));
         const buttons=[...root.querySelectorAll('button')].filter(visible).map(e=>({text:e.textContent.trim().slice(0,80),title:e.title,disabled:e.disabled,aria:e.getAttribute('aria-label')}));
         const canvas=[...root.querySelectorAll('canvas')].filter(visible).map(e=>({w:e.width,h:e.height,visible:visible(e)}));
         return {activeMode:root.querySelector('button[title="Change mode"]')?.textContent?.trim(),settings:detail,controls,buttons,canvas:canvas.slice(0,12)};
       });
       const randomize=page.getByRole('button',{name:'Randomize',exact:true}).first();
       let after=null;
       const randomizeVisible=await randomize.isVisible().catch(()=>false);
       const randomizeEnabled=randomizeVisible&&await randomize.isEnabled().catch(()=>false);
       const randomizeTooltip=randomizeVisible?await randomize.getAttribute('title'):null;
       if(randomizeEnabled){
         await randomize.click({timeout:11000});
         clicked=true;await page.waitForTimeout(350);
         if(await gotIt.isVisible().catch(()=>false))await gotIt.click({timeout:8000});
         after=await page.evaluate(()=>({
           settings:document.querySelector('#root')?.innerText?.split('Mode settings').pop()?.slice(0,1200),
           controls:[...document.querySelectorAll('#root input,#root select,#root [role="slider"]')].filter(e=>e.getClientRects().length).map(e=>e.value??e.getAttribute('aria-valuenow'))
         }));
       }
       const first=before.controls.map(x=>x.value);
       const changed=after?first.some((x,i)=>x!==after.controls[i]):false;
       const result={slug,category,mode:before.activeMode,settings:before.settings,inputs:before.controls.map(x=>({type:x.type,title:x.title,aria:x.aria,name:x.name,min:x.min,max:x.max,disabled:x.disabled})),inputCount:before.controls.length,disabledInputs:before.controls.filter(x=>x.disabled).length,buttonTitles:before.buttons.filter(x=>x.title).map(x=>x.title).slice(0,50),disabledButtons:before.buttons.filter(x=>x.disabled).map(x=>x.text||x.title).slice(0,35),canvas:before.canvas,randomizePresent:randomizeVisible,randomizeEnabled,randomizeTooltip,randomizeControlChanged:changed,errors:errors.slice(0,6),missing:[...new Set(missing)].slice(0,16),ms:Date.now()-started};
       results.push(result);console.log('MODE_PARITY_UI '+JSON.stringify(result));
     }catch(e){uncaught=String(e.stack||e).slice(0,500);const result={slug,category,error:uncaught,errors};results.push(result);console.log('MODE_PARITY_UI '+JSON.stringify(result));}
   }
   const rollup={range:[start,end],count:results.length,groups:Object.entries(Object.groupBy(results,r=>r.category)).map(([category,rs])=>({
    category,count:rs.length,avgInputs:rs.reduce((s,r)=>s+(r.inputCount||0),0)/rs.length,missing:rs.filter(r=>r.missing?.length).map(r=>({slug:r.slug,paths:r.missing})),disabled:rs.filter(r=>r.disabledInputs).map(r=>({slug:r.slug,count:r.disabledInputs})),errors:rs.filter(r=>r.error||r.errors?.length).map(r=>({slug:r.slug,error:r.error,errors:r.errors}))}))};
   console.log('MODE_PARITY_SUMMARY '+JSON.stringify(rollup));
   await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('MODE_PARITY_FATAL '+String(e.stack||e));process.exitCode=1;});
