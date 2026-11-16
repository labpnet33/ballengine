'use strict';
// Black-box visual/behavior audit. This is NOT a numerical physics proof.
// Tests the real captured 27 engines, on the actual Studio UI, with screenshots.
// Captures comparative visual evidence for manual review of collision behavior.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const out=path.resolve(process.env.AUDIT_OUTPUT||path.join(process.cwd(),'visual-physics-audit'));
const modes=[
 ['phase-bloom','Bloom'],['phonk-drop','Phonk Drop'],['marble-run','Marble'],
 ['ball-race','Race'],['target-hit','Targets'],['falling-sand','Sand'],
 ['plinko','Plinko'],['color-match','Colors'],['spin-battle','Spin'],
 ['lava-survival','Lava'],['glass-slice','Slice 3D'],['flood-fill','Flood 3D'],
 ['eulers-disk','Disks 3D'],['drum-sort','Drum 3D'],['plinko-3d','Plinko 3D'],
 ['chladni','Chladni 3D'],['voxel','Voxels 3D'],['domino-3d','Domino 3D'],
 ['marble-race-3d','Race 3D'],['attractor','Attractor 3D'],['flow-field','Flow 3D'],
 ['metaballs','Blobs 3D'],['galaxy','Galaxy 3D'],['fireflies','Fireflies 3D'],
 ['pendulum-basin','Basin 3D'],['slime','Slime 3D'],['crowd-evacuation','Evacuate 3D']
];
const [from,to]=(process.env.MODE_RANGE||'0:27').split(':').map(Number);
assert.ok(Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to<=27&&from<to);
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.mp3':'audio/mpeg','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  let rel=u.pathname==='/studio'?'studio/index.html':decodeURIComponent(u.pathname).replace(/^\/+/,'');
  if(!rel||rel.endsWith('/'))rel+='index.html';
  const abs=path.resolve(root,rel);
  if(!abs.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(abs,(err,buf)=>err?res.writeHead(404).end():res.writeHead(200,{'content-type':mime[path.extname(abs)]||'application/octet-stream'}).end(buf));
 }catch{return res.writeHead(400).end();}
});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,16);
function pixelStats(buf){
 const p=PNG.sync.read(buf),n=p.width*p.height;
 let dark=0,light=0,alpha=0,sum=0,sumSq=0,colored=0;
 for(let i=0;i<n;i+=4){
  const z=4*i,r=p.data[z],g=p.data[z+1],b=p.data[z+2],a=p.data[z+3];
  const gray=(r+g+b)/3;
  sum+=gray;sumSq+=gray*gray;
  dark+=gray<10?1:0;light+=gray>245?1:0;
  alpha+=a<4?1:0;
  colored+=(Math.max(r,g,b)-Math.min(r,g,b))>30?1:0;
 }
 const samples=Math.ceil(n/4),avg=sum/samples;
 return {width:p.width,height:p.height,brightness:+avg.toFixed(1),spread:+Math.sqrt(Math.max(0,sumSq/samples-avg*avg)).toFixed(1),nearBlack:+(dark/samples).toFixed(3),nearWhite:+(light/samples).toFixed(3),colored:+(colored/samples).toFixed(3),transparent:+(alpha/samples).toFixed(3)};
}
function frameDiff(a,b){
 const A=PNG.sync.read(a),B=PNG.sync.read(b);
 if(A.width!==B.width||A.height!==B.height)return {geometryChanged:true,ratio:1,mad:255};
 let changed=0,sum=0,total=0;
 const n=A.width*A.height;
 for(let i=0;i<n;i+=4){
  const j=4*i;
  const d=(Math.abs(A.data[j]-B.data[j])+Math.abs(A.data[j+1]-B.data[j+1])+Math.abs(A.data[j+2]-B.data[j+2]))/3;
  changed+=d>14?1:0;sum+=d;total++;
 }
 return {geometryChanged:false,ratio:+(changed/total).toFixed(5),mad:+(sum/total).toFixed(3)};
}
async function state(page){
 return page.evaluate(()=>{
  const yes=e=>!!e.getClientRects().length&&!e.disabled;
  const root=document.querySelector('#root');
  const result={};
  if(!root)return result;
  for(const e of [...root.querySelectorAll('select')].filter(yes)){
   const values=[...e.options].map(o=>o.value).join('|');
   if(values.includes('none|daily|weekly')||values.includes('15|30|59')||values.includes('tiktok')||values.includes('instagram_reels'))continue;
   const key='select:'+values;
   result[key]=e.value;
  }
  const ranges=[...root.querySelectorAll('input[type="range"]')].filter(yes).slice(1);
  ranges.forEach((e,i)=>result['range:'+i]=e.value);
  return result;
 });
}
async function clickRandom(page){
 const b=page.getByRole('button',{name:'Randomize',exact:true}).first();
 await b.waitFor({state:'visible',timeout:11000});
 assert.ok(await b.isEnabled(),'Randomize disabled');
 try{await b.click({timeout:8500});}catch(e){
  const hit=await b.evaluate(el=>{
   const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
   if(el.disabled||!(top===el||el.contains(top)))return false;
   el.click();return true;
  });
  if(!hit)throw e;
 }
}
async function screenshot(page,slug,label){
 const candidates=page.locator('canvas:visible');
 let best=null,area=0;
 for(let i=0;i<await candidates.count();i++){
  const el=candidates.nth(i);
  const d=await el.evaluate(e=>({w:e.width,h:e.height,clientW:e.clientWidth,clientH:e.clientHeight}));
  if(d.w>=80&&d.h>=80&&d.clientW*d.clientH>area){best=el;area=d.clientW*d.clientH;}
 }
 if(!best)throw Error('No visible simulation canvas with usable size');
 const file=path.join(out,slug+'-'+label+'.png');
 const png=await best.screenshot({timeout:20000,animations:'disabled'});
 fs.writeFileSync(file,png);
 return {buf:png,file:path.basename(file),hash:hash(png),stats:pixelStats(png)};
}
async function setPlaying(page){
 const load=page.getByRole('button',{name:'Load 3D',exact:true}).first();
 if(await load.isVisible().catch(()=>false))await load.click({timeout:12000});
 const play=page.locator('button[title="Play (Space)"]').first();
 if(await play.isVisible().catch(()=>false))await play.click({timeout:11000});
 else assert.ok(await page.locator('button[title="Pause (Space)"]').first().isVisible(),'Neither Play nor Pause present');
}
async function pauseIfPlaying(page){
 const pause=page.locator('button[title="Pause (Space)"]').first();
 if(await pause.isVisible().catch(()=>false))await pause.click({timeout:11000});
}
const records=[];
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await ctx.newPage();
  let errors=[],missing=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,230)));
  page.on('response',r=>{if(r.status()===404&&r.url().includes('/assets/'))missing.push(new URL(r.url()).pathname)});
  for(const [slug,title] of modes.slice(from,to)){
   errors=[];missing=[];let result={slug,title,checks:{},warnings:[],errors:[]};
   console.log('VISUAL_AUDIT_START '+slug);
   const begin=Date.now();
   try{
    await page.goto(base+'/studio?mode='+slug,{waitUntil:'domcontentloaded',timeout:45000});
    const titleEl=page.locator('button[title="Change mode"]').first();
    await titleEl.waitFor({state:'visible',timeout:28000});
    assert.equal((await titleEl.innerText()).trim(),title,'Incorrect simulation selected');
    await setPlaying(page);
    await page.waitForTimeout(350);
    const f0=await screenshot(page,slug,'play-0');
    await page.waitForTimeout(850);
    const f1=await screenshot(page,slug,'play-1');
    await page.waitForTimeout(850);
    const f2=await screenshot(page,slug,'play-2');
    const a=frameDiff(f0.buf,f1.buf),b=frameDiff(f1.buf,f2.buf);
    result.checks={visibleCanvas:true,motionDiff:[a,b],visualStats:[f0.stats,f1.stats,f2.stats],
      moving:a.ratio>0.0005||b.ratio>0.0005,nonFlat:[f0,f1,f2].some(x=>x.stats.spread>4)};
    if(!result.checks.nonFlat)result.warnings.push('All captured frames nearly flat/blank');
    if(!result.checks.moving)result.warnings.push('No substantial canvas motion detected over ~1.7s');
    await pauseIfPlaying(page);
    await page.waitForTimeout(250);
    const stable0=await screenshot(page,slug,'paused');
    const conf0=await state(page);
    await clickRandom(page);
    await page.waitForTimeout(450);
    const conf1=await state(page);
    const roll1=await screenshot(page,slug,'random-1');
    const delta1=Object.keys({...conf0,...conf1}).filter(k=>conf0[k]!==conf1[k]);
    await clickRandom(page);
    await page.waitForTimeout(450);
    const conf2=await state(page);
    const roll2=await screenshot(page,slug,'random-2');
    const delta2=Object.keys({...conf1,...conf2}).filter(k=>conf1[k]!==conf2[k]);
    result.checks.randomizeChangedControls=[delta1.length,delta2.length];
    result.checks.visualRollDiff=[frameDiff(stable0.buf,roll1.buf),frameDiff(roll1.buf,roll2.buf)];
    if(!delta1.length||!delta2.length)result.warnings.push('Randomize made no recognized native setting change on at least one roll');
    if(result.checks.visualRollDiff.every(x=>x.ratio<0.005))
      result.warnings.push('Randomize produced little immediate visible difference while paused; investigate dynamics when played');
    const back=page.locator('button[title="Previous roll"]').first();
    assert.ok(await back.isEnabled(),'Previous roll disabled after two randomizations');
    await back.click({timeout:11000});
    await page.waitForTimeout(350);
    const confUndo=await state(page);
    const undoMatch=JSON.stringify(confUndo)===JSON.stringify(conf1);
    const next=page.locator('button[title="Next roll"]').first();
    assert.ok(await next.isEnabled(),'Next roll disabled after undo');
    await next.click({timeout:11000});
    await page.waitForTimeout(350);
    const confRedo=await state(page);
    const redoMatch=JSON.stringify(confRedo)===JSON.stringify(conf2);
    result.checks.undoMatch=undoMatch;
    result.checks.redoMatch=redoMatch;
    if(!undoMatch)result.warnings.push('Previous Roll did not restore exact visible settings');
    if(!redoMatch)result.warnings.push('Next Roll did not restore exact visible settings');
    await setPlaying(page);
    await page.waitForTimeout(750);
    const finalFrame=await screenshot(page,slug,'post-roll-play');
    result.checks.postRollMotion=frameDiff(roll2.buf,finalFrame.buf);
    if(result.checks.postRollMotion.ratio<0.0005)result.warnings.push('Post-randomize scene appears static');
    const bodyText=await page.locator('#root').innerText();
    if(/\\bNaN\\b|Infinity|Uncaught|Cannot read properties/i.test(bodyText))
      result.warnings.push('Visible UI contains numerical or JS error marker');
    result.checks.jsErrors=errors.slice(0,6);
    result.checks.missingAssets=[...new Set(missing)].slice(0,6);
    if(errors.length)result.warnings.push('Page JavaScript errors occurred');
    if(missing.length)result.warnings.push('Missing captured assets');
    result.metrics={hashes:[f0,f1,f2,stable0,roll1,roll2,finalFrame].map(x=>({file:x.file,hash:x.hash}))};
   }catch(err){result.errors.push(String(err).slice(0,900));}
   result.durationMs=Date.now()-begin;
   result.status=result.errors.length?'FAIL':result.warnings.length?'REVIEW':'PASS';
   records.push(result);
   console.log('VISUAL_AUDIT_RESULT '+JSON.stringify(result));
   fs.writeFileSync(path.join(out,'results-'+from+'-'+to+'.json'),JSON.stringify({range:[from,to],records},null,2));
  }
  await ctx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error('VISUAL_AUDIT_FATAL',e.stack||String(e));process.exitCode=1;}).finally(async()=>{
 if(server.listening)await new Promise(ok=>server.close(ok));
 const fail=records.filter(r=>r.status==='FAIL');
 console.log('VISUAL_AUDIT_SUMMARY '+JSON.stringify({range:[from,to],modes:records.length,fail:fail.length,review:records.filter(r=>r.status==='REVIEW').length,pass:records.filter(r=>r.status==='PASS').length}));
 if(fail.length||records.length!==to-from)process.exitCode=1;
});