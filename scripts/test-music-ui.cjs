'use strict';
// Tests the ORIGINAL captured track picker, not an alternate upload page.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app');
const artifacts=path.resolve(__dirname,'..','test-results','music');
fs.mkdirSync(artifacts,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.woff2':'font/woff2','.wasm':'application/wasm','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    let rel=(url.pathname==='/studio'||url.pathname==='/studio/')?'studio/index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');
    if(!rel||rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    fs.readFile(file,(err,content)=>{
      if(err)return res.writeHead(404).end();
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      res.end(content);
    });
  }catch{res.writeHead(400).end();}
});
const report={phase:'initial',mp3InputFound:false,uploadCompleted:false,registered:false,playbackUrl:false,
  songLibraryVisible:false,midiUploadCompleted:false,problems:[],requests:[],screenshots:[],uiBefore:[]};
let libraryKey=null;
async function main(){
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage(),base='http://127.0.0.1:'+server.address().port;
  page.on('pageerror',e=>report.problems.push({kind:'pageerror',text:String(e).slice(0,280)}));
  page.on('dialog',async d=>{report.problems.push({kind:'dialog',text:d.message().slice(0,200)});await d.dismiss();});
  page.on('response',r=>{if(r.url().includes('ballengine-project-saves.labpnet33.workers.dev'))report.requests.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
  page.on('requestfailed',r=>{if(r.url().includes('ballengine-project-saves'))report.problems.push({kind:'network',text:r.url().slice(0,180)+' '+r.failure()?.errorText});});
  let newSongId=null,uploadedId=null,midiId=null,midiAssetId=null;
  async function screenshot(name){
    await page.screenshot({path:path.join(artifacts,name+'.png')}).catch(()=>{});
    report.screenshots.push(name);
  }
  async function openPicker(){
    const existing=page.locator('label').filter({hasText:'Upload MIDI or Song'}).locator('input[type="file"]');
    if(await existing.count())return existing.first();
    const active=page.locator('[data-setting="selectedMelody"] button').first();
    if(await active.count())await active.click({timeout:15000});
    else{
      const buttons=page.locator('button').filter({hasText:/Tap to browse/});
      report.browseButtonCount=await buttons.count();
      if(await buttons.count())await buttons.first().click({timeout:15000});
    }
    await page.waitForTimeout(1100);
    return page.locator('label').filter({hasText:'Upload MIDI or Song'}).locator('input[type="file"]').first();
  }
  async function api(path,method='GET'){
    const r=await fetch('https://ballengine-project-saves.labpnet33.workers.dev'+path,{method,headers:{Authorization:'Bearer '+libraryKey,Origin:base},signal:AbortSignal.timeout(20000)});
    return {status:r.status,data:await r.json().catch(()=>({}))};
  }
  try{
    report.phase='open-studio';
    await page.goto(base+'/studio?mode=rhythmic',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(6500);
    report.uiBefore=await page.locator('button').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>({text:(e.textContent||'').trim().slice(0,55),title:e.title||'',aria:e.getAttribute('aria-label')||''})).slice(0,60));
    await screenshot('before-upload');
    report.phase='open-track-picker';
    const input=await openPicker();
    report.mp3InputFound=await input.count()>0;
    report.pickerText=(await page.locator('body').innerText()).slice(-2600);
    await screenshot('track-picker');
    assert.ok(report.mp3InputFound,'Original Upload MIDI or Song input not visible in track picker');
    libraryKey=await page.evaluate(()=>localStorage.getItem('ballengine_cloud_recovery_v1'));
    assert.match(libraryKey||'',/^be1_[A-Za-z0-9_-]{43}$/);
    const songName='ui-mp3-'+crypto.randomBytes(4).toString('hex')+'.mp3';
    const mp3=cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=622:sample_rate=44100:duration=2','-c:a','libmp3lame','-b:a','96k','-f','mp3','pipe:1'],{timeout:30000,maxBuffer:1024*1024});
    report.phase='upload-mp3';
    await input.setInputFiles({name:songName,mimeType:'audio/mpeg',buffer:mp3});
    await page.waitForTimeout(7000);
    report.afterUploadText=(await page.locator('body').innerText()).slice(-2600);
    await screenshot('after-mp3-upload');
    const response=report.requests.filter(r=>r.path==='/api/upload'&&r.method==='POST');
    report.uploadCompleted=response.some(r=>r.status===201||r.status===200);
    const list=await api('/api/songs');
    assert.equal(list.status,200);
    const record=list.data.find(x=>x.name.includes(songName.replace(/\.mp3$/,'')));
    report.registered=!!record;
    if(record){newSongId=record.id;report.playbackUrl=typeof record.data==='string'&&record.data.includes('/api/assets/');}
    report.uploadResponse=response;
    assert.ok(report.uploadCompleted,'MP3 upload did not finish: '+JSON.stringify(report.requests));
    assert.ok(report.registered,'Uploaded MP3 did not appear in cloud Songs library: '+JSON.stringify(report.requests));
    assert.ok(report.playbackUrl,'Uploaded MP3 missing playable audio URL');
    report.phase='song-library';
    const otherPicker=await openPicker();
    const bank=page.locator('button').filter({hasText:/Song Library/}).first();
    report.bankButtonCount=await bank.count();
    if(await bank.count())await bank.click({timeout:12000});
    await page.waitForTimeout(1800);
    report.songLibraryVisible=/Dreamy|Uplifting|Mysterious|Energetic|Ambient|Orchestral/i.test((await page.locator('body').innerText()).slice(-6000));
    await screenshot('song-library');
    assert.ok(report.songLibraryVisible,'Song Bank has no selectable original MIDI tracks');
    report.phase='midi-upload';
    const midiUrl='https://ballengine-project-saves.labpnet33.workers.dev/api/xmidi/file/BM000001.mid';
    const sample=await fetch(midiUrl,{signal:AbortSignal.timeout(20000)});
    assert.equal(sample.status,200);
    const midi=Buffer.from(await sample.arrayBuffer());
    const midiInput=await openPicker();
    if(await midiInput.count()){
      await midiInput.setInputFiles({name:'ui-generated-midi.mid',mimeType:'audio/midi',buffer:midi});
      await page.waitForTimeout(5000);
      report.midiUploadCompleted=report.requests.some(r=>r.path==='/api/upload'&&r.method==='POST'&&[200,201].includes(r.status));
      const m=await api('/api/melodies');
      if(m.status===200){const item=m.data.find(x=>String(x.name).startsWith('ui-generated-midi'));if(item)midiId=item.id;}
      await screenshot('after-midi-upload');
    }
    report.phase='passed';
    assert.ok(report.midiUploadCompleted,'MIDI file was not uploaded successfully');
    assert.ok(midiId,'MIDI registration did not appear in cloud library');
  }catch(e){
    report.phase='failed';
    report.problems.push({kind:'test',text:String(e.stack||e).slice(0,1500)});
    throw e;
  }finally{
    if(libraryKey){
      try{if(midiId)await api('/api/melodies/'+midiId,'DELETE');}catch{}
      try{if(newSongId)await api('/api/songs/'+newSongId,'DELETE');}catch{}
      try{const usage=await api('/api/storage/usage');report.remainingMedia=usage.data.media_count;}catch{}
    }
    try{await screenshot('final');}catch{}
    fs.writeFileSync(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));
    console.log('MUSIC_UI_SUMMARY '+JSON.stringify(report).slice(0,14000));
    await browser.close();
    await new Promise(ok=>server.close(ok));
  }
}
main().catch(e=>{console.error('MUSIC_UI_FAILURE',String(e.stack||e).slice(0,2300));process.exitCode=1;server.close();});
