'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const modes=['phase-bloom','phonk-drop','marble-run','ball-race','target-hit','falling-sand','plinko','color-match','spin-battle','lava-survival','glass-slice','flood-fill','eulers-disk','drum-sort','plinko-3d','chladni','voxel','domino-3d','marble-race-3d','attractor','flow-field','metaballs','galaxy','fireflies','pendulum-basin','slime','crowd-evacuation'];
const [from,to]=(process.env.MODE_RANGE||'0:27').split(':').map(Number);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://localhost');let p=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^[/]+/,'');if(!p||p.endsWith('/'))p+='index.html';const f=path.resolve(root,p);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'}).end(b))}
 catch{res.writeHead(400).end()}
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage();let jsErrors=[];page.on('pageerror',e=>jsErrors.push(String(e).slice(0,320)));
  const failures=[];
  for(const slug of modes.slice(from,to)){
   jsErrors=[];let result={slug};
   try{
    await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:40000});
    const title=page.locator('button[title="Change mode"]').first();
    await title.waitFor({state:'visible',timeout:25000});
    const chosen=await title.innerText();
    const confirm=page.getByRole('button',{name:'Load 3D',exact:true}).first();
    if(await confirm.isVisible().catch(()=>false))await confirm.click({timeout:12000});
    // Capture what the actual Studio controls show: native Randomize must
    // change simulation options, not an unrelated publishing reminder.
    const controlSnapshot=()=>page.evaluate(()=>{
      const visible=e=>!!e.getClientRects().length;
      const all=[...document.querySelectorAll('#root select,#root input[type="range"],#root input[type="number"],#root input[type="checkbox"]')].filter(visible);
      return {
        controls:all.map((e,index)=>{
          const parent=e.closest('label')||e.parentElement?.parentElement;
          const label=(parent?.innerText||'').replace(/\\s+/g,' ').trim().slice(0,135);
          return {index,kind:e.tagName.toLowerCase()+':'+e.type,value:e.type==='checkbox'?String(e.checked):e.value,label,choices:e.tagName==='SELECT'?[...e.options].map(x=>x.textContent.trim()).slice(0,8):undefined};
        }),
        headings:[...document.querySelectorAll('#root h1,#root h2,#root h3,#root h4,#root h5')].filter(visible).map(x=>x.innerText.trim()).filter(x=>/mode settings|advanced|publish|reminder/i.test(x)).slice(0,16),
        modeHeading:[...document.querySelectorAll('#root *')].find(e=>e.childElementCount===0&&e.textContent?.trim()==='Mode settings')?.parentElement?.parentElement?.outerHTML.slice(0,650)
      };
    });
    const valuesBeforeRoll=await controlSnapshot();
    // First test native Randomize/history on an untouched initial mode.
    // Manual setting changes may intentionally clear roll history.
    const random=page.getByRole('button',{name:'Randomize',exact:true}).first();
    await random.waitFor({state:'visible',timeout:9000});
    assert.ok(await random.isEnabled(),'Native Randomize disabled');
    const priorMode=(await title.innerText()).trim();
    try {
      await random.click({timeout:14000});
    } catch(err) {
      // Animation-heavy WebGL may continuously move an otherwise enabled
      // button in software Chrome. Retry via a real DOM click, then require
      // the native undo state to change. Do not mask JS/handler failures.
      const hit=await random.evaluate(el=>{
        const box=el.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
        const unobstructed=top===el||el.contains(top);
        if(!el.disabled&&unobstructed)el.click();
        return {unobstructed,disabled:el.disabled,topTag:top?.tagName,topTitle:top?.getAttribute('title')};
      });
      if(!hit.unobstructed||hit.disabled)throw err;
      console.log('MODE_SOFTWARE_GL_CLICK_FALLBACK '+JSON.stringify({slug,hit,reason:String(err).slice(0,140)}));
    }
    const back=page.locator('button[title="Previous roll"]').first();
    // Native roll/history state is applied asynchronously after the first
    // render update; do not fail on a transient disabled button.
    await page.waitForFunction(()=>{
      const prev=document.querySelector('button[title="Previous roll"]');
      return !!prev&&!prev.disabled;
    },null,{timeout:9000}).catch(()=>{});
    if(!(await back.isEnabled())){
      // Some simulation schemas store the first generated roll as the
      // history baseline; a second native roll must permit undo.
      await random.waitFor({state:'visible',timeout:12000});
      try {
      await random.click({timeout:14000});
    } catch(err) {
      // Animation-heavy WebGL may continuously move an otherwise enabled
      // button in software Chrome. Retry via a real DOM click, then require
      // the native undo state to change. Do not mask JS/handler failures.
      const hit=await random.evaluate(el=>{
        const box=el.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
        const unobstructed=top===el||el.contains(top);
        if(!el.disabled&&unobstructed)el.click();
        return {unobstructed,disabled:el.disabled,topTag:top?.tagName,topTitle:top?.getAttribute('title')};
      });
      if(!hit.unobstructed||hit.disabled)throw err;
      console.log('MODE_SOFTWARE_GL_CLICK_FALLBACK '+JSON.stringify({slug,hit,reason:String(err).slice(0,140)}));
    }
      await page.waitForFunction(()=>{
        const prev=document.querySelector('button[title="Previous roll"]');
        return !!prev&&!prev.disabled;
      },null,{timeout:9000}).catch(()=>{});
    }
    assert.ok(await back.isEnabled(),'Randomize history unavailable even after two rolls');
    const valuesAfterRoll=await controlSnapshot();
    const changedControls=valuesAfterRoll.controls.filter((c,i)=>valuesBeforeRoll.controls[i]?.value!==c.value).map(c=>({label:c.label,kind:c.kind,before:valuesBeforeRoll.controls[c.index]?.value,after:c.value}));
    console.log('MODE_RANDOMIZE_BEHAVIOR_DIAGNOSTIC '+JSON.stringify({slug,changedCount:changedControls.length,changes:changedControls.slice(0,24),initialHeadings:valuesBeforeRoll.headings,modeHeading:valuesBeforeRoll.modeHeading,firstControls:valuesBeforeRoll.controls.slice(0,28)}));
    // Exercise an ORIGINAL alternate option, not an added demo control.
    const selectors=page.locator('#root select:visible:not([disabled])');
    const n=await selectors.count();
    let changed=false,editedLabel=null,before=null,after=null;
    for(let i=n-1;i>=0;i--){
      const sel=selectors.nth(i);
      const choices=await sel.evaluate(el=>[...el.options].map((o,i)=>({index:i,value:o.value,disabled:o.disabled})).filter(o=>!o.disabled&&o.value!==''));
      if(choices.length<2)continue;
      before=await sel.inputValue();
      const alternative=choices.find(o=>o.value!==before);
      if(!alternative)continue;
      const titleText=await sel.evaluate(el=>el.closest('label')?.innerText?.slice(0,110)||el.parentElement?.parentElement?.innerText?.slice(0,110));
      // The original React UI can replace <option> nodes between inspection
      // and input (notably GPU-heavy 3D scenes). Select the currently valid
      // index rather than asking Playwright to wait for an obsolete value.
      try{await sel.selectOption({index:alternative.index},{timeout:4000});}
      catch(err){
        const snapshot=await sel.evaluate(el=>({value:el.value,options:[...el.options].map((o,i)=>({i,value:o.value}))})).catch(()=>null);
        console.log('MODE_SELECT_TRANSIENT '+JSON.stringify({slug,title:titleText,attempt:alternative,snapshot,error:String(err).slice(0,180)}));
        continue;
      }
      await page.waitForTimeout(100);
      after=await sel.inputValue();changed=after!==before;editedLabel=titleText;if(changed)break;
    }
    assert.ok(changed,'No editable dropdown value changed');
    const recording=page.locator('button[title="Instantly record a clean clip (C)"]').first();
    assert.ok(await recording.isVisible().catch(()=>false),'Record button disappeared');
    assert.equal((await title.innerText()).trim(),priorMode,'Randomize moved to another mode unexpectedly');
    assert.equal(jsErrors.length,0,'Page script error '+JSON.stringify(jsErrors));
    result={slug,mode:chosen.trim(),changed,editedLabel,before,after,randomizeUndo:true,record:true,errors:[]};
    console.log('MODE_FULL_CONTROLS_PASS '+JSON.stringify(result));
   }catch(e){
      result.error=String(e).slice(0,1200);result.jsErrors=jsErrors.slice(0,5);
      result.ui=await page.evaluate(()=>{
        const random=document.querySelector('button[data-tour="randomize"]');
        const back=document.querySelector('button[title="Previous roll"]');
        const info=el=>!el?null:{text:el.textContent?.trim().slice(0,90),disabled:el.disabled,rect:(()=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()};
        let hit=null;if(random){const r=random.getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);hit=el?{tag:el.tagName,className:String(el.className).slice(0,160),title:el.getAttribute('title')}:null;}
        return{random:info(random),back:info(back),centerHit:hit,visibility:document.visibilityState};
      }).catch(err=>({diagnosticError:String(err).slice(0,150)}));
      failures.push(result);console.log('MODE_FULL_CONTROLS_FAIL '+JSON.stringify(result));}
  }
  console.log('MODE_FULL_CONTROLS_SUMMARY '+JSON.stringify({range:[from,to],checked:to-from,failures}));
  assert.equal(failures.length,0,'Experimental modes with broken native controls');
  await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('MODE_FULL_CONTROLS_FATAL '+String(e.stack||e));process.exitCode=1;}).finally(()=>server.listening?new Promise(ok=>server.close(ok)):undefined);