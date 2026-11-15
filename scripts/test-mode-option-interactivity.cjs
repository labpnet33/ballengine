'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const list=[
 'rhythmic','escape','glass-tower','wave-3d','ball-crush','magnet',
 'phase-bloom','phonk-drop','marble-run','ball-race','target-hit','falling-sand','plinko','color-match','spin-battle','lava-survival',
 'glass-slice','flood-fill','eulers-disk','drum-sort','plinko-3d','chladni','voxel','domino-3d','marble-race-3d','attractor','flow-field','metaballs','galaxy','fireflies','pendulum-basin','slime','crowd-evacuation'
];
const [start,end]=(process.env.MODE_RANGE||'0:33').split(':').map(Number);
const base=process.env.BALLENGINE_BASE||'https://ballengine.vercel.app';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage();
  let pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e).slice(0,350)));
  const failures=[];
  for(const slug of list.slice(start,end)){
   pageErrors=[];
   try{
    await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:42000});
    const active=page.locator('button[title="Change mode"]').first();
    await active.waitFor({state:'visible',timeout:24000});
    const sliders=page.locator('#root input[type="range"]:visible:not([disabled])');
    const n=await sliders.count();
    if(n<1){throw Error('No editable slider available');}
    const input=sliders.last();
    const before=await input.evaluate(e=>({value:e.value,min:e.min,max:e.max,step:e.step,label:e.closest('label')?.innerText?.slice(0,180)||e.parentElement?.parentElement?.innerText?.slice(0,180)}));
    await input.focus();
    let direction=Number(before.value)<Number(before.max)?'ArrowRight':'ArrowLeft';
    await input.press(direction,{timeout:8500});
    await page.waitForTimeout(180);
    let after=await input.inputValue();
    if(after===before.value){await input.press(direction,{timeout:8500});await page.waitForTimeout(160);after=await input.inputValue()}
    if(after===before.value){
      direction=direction==='ArrowRight'?'ArrowLeft':'ArrowRight';
      await input.press(direction,{timeout:8500});await page.waitForTimeout(180);after=await input.inputValue();
    }
    assert.notEqual(after,before.value,'Slider did not respond to keyboard change');
    const stillMode=(await active.innerText()).trim();
    assert.ok(stillMode.length>0);
    const record=await page.locator('button[title="Instantly record a clean clip (C)"]').first().count();
    assert.ok(record>0,'Record button vanished after changing setting');
    if(pageErrors.length)throw Error('Uncaught errors: '+pageErrors.join(' | '));
    console.log('MODE_SETTING_INTERACTIVE_PASS '+JSON.stringify({slug,stillMode,sliderCount:n,setting:before.label,before:before.value,after,step:before.step}));
   }catch(err){
    const e={slug,error:String(err).slice(0,350),pageErrors:pageErrors.slice(0,4)};
    failures.push(e);console.log('MODE_SETTING_INTERACTIVE_FAIL '+JSON.stringify(e));
   }
  }
  console.log('MODE_SETTING_INTERACTIVE_SUMMARY '+JSON.stringify({from:start,to:end,total:end-start,failures}));
  assert.equal(failures.length,0,'Some mode controls failed to update');
  await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('MODE_SETTING_INTERACTIVE_FATAL '+String(e.stack||e));process.exitCode=1;});
