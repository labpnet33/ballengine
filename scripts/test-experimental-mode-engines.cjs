'use strict';
const crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const modes=[
['phase-bloom','Bloom'],['phonk-drop','Phonk Drop'],['marble-run','Marble'],['ball-race','Race'],['target-hit','Targets'],
['falling-sand','Sand'],['plinko','Plinko'],['color-match','Colors'],['spin-battle','Spin'],['lava-survival','Lava'],
['glass-slice','Slice 3D'],['flood-fill','Flood 3D'],['eulers-disk','Disks 3D'],['drum-sort','Drum 3D'],
['plinko-3d','Plinko 3D'],['chladni','Chladni 3D'],['voxel','Voxels 3D'],['domino-3d','Domino 3D'],
['marble-race-3d','Race 3D'],['attractor','Attractor 3D'],['flow-field','Flow 3D'],['metaballs','Blobs 3D'],
['galaxy','Galaxy 3D'],['fireflies','Fireflies 3D'],['pendulum-basin','Basin 3D'],['slime','Slime 3D'],
['crowd-evacuation','Evacuate 3D']];
const base=process.env.BALLENGINE_BASE||'https://ballengine.vercel.app';
const range=process.env.MODE_RANGE?process.env.MODE_RANGE.split(':').map(Number):[0,modes.length];
const chosen=modes.slice(range[0],range[1]);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:900,height:1000},serviceWorkers:'block'});
  const page=await context.newPage();
  let errors=[],missing=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('response',r=>{if(r.status()===404&&r.url().includes('/assets/'))missing.push(new URL(r.url()).pathname);});
  for(const [slug,label] of chosen){
   errors=[];missing=[];
   const started=Date.now();
   let exception=null,first=[],last=[],selected='',playing=false,buttonTitle='',canvasCount=0,hasDialog=false;
   try{
    await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:40000});
    await page.waitForTimeout(1700);
    selected=await page.locator('button[title="Change mode"]').first().innerText().catch(()=>null);
    const canvas=page.locator('canvas').filter({visible:true});
    canvasCount=await canvas.count();
    for(let i=0;i<canvasCount;i++){
     const el=canvas.nth(i);
     const size=await el.evaluate(x=>({w:x.width,h:x.height}));
     if(size.w<60||size.h<60)continue;
     const b=await el.screenshot({timeout:8000});
     first.push({index:i,w:size.w,h:size.h,hash:crypto.createHash('sha1').update(b).digest('hex')});
    }
    let play=page.locator('button[title="Play (Space)"]').first();
    hasDialog=(await page.locator('[role="alertdialog"],[role="dialog"]').filter({visible:true}).count())>0;
    if(hasDialog){
      const accept=page.getByRole('button',{name:/^Load 3D$/}).first();
      if(await accept.count())await accept.click({timeout:10000});
      await page.waitForTimeout(600);
    }
    if(await play.count()){
      buttonTitle=await play.getAttribute('title');
      await play.click({timeout:9000});
      playing=true;
    }else{
      const pause=page.locator('button[title="Pause (Space)"]').first();
      buttonTitle=await pause.count()?'Already playing':'Play button absent';
      playing=(await pause.count())>0;
    }
    await page.waitForTimeout(1600);
    const lateCanvas=page.locator('canvas').filter({visible:true});
    const count=await lateCanvas.count();
    for(let i=0;i<count;i++){
     const el=lateCanvas.nth(i);
     const sz=await el.evaluate(x=>({w:x.width,h:x.height}));
     if(sz.w<60||sz.h<60)continue;
     const b=await el.screenshot({timeout:8000});
     last.push({index:i,w:sz.w,h:sz.h,hash:crypto.createHash('sha1').update(b).digest('hex')});
    }
   }catch(e){exception=String(e).slice(0,450);}
   const changes=last.filter(v=>first.some(f=>f.index===v.index&&f.hash!==v.hash)).map(x=>x.index);
   const result={slug,label,selected,canvasCount,playing,buttonTitle,hasDialog,changes,frameChanged:changes.length>0,exceptions:exception,errors:errors.slice(0,5),missing:[...new Set(missing)].slice(0,8),ms:Date.now()-started};
   console.log('MODE_ENGINE_READINESS '+JSON.stringify(result));
  }
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('MODE_ENGINE_READINESS_FATAL '+String(e.stack||e));process.exitCode=1;});