'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process');
const endpoint='https://ballengine-project-saves.labpnet33.workers.dev';
const origin='https://ballengine.vercel.app';
const key='be1_'+crypto.randomBytes(32).toString('base64url');
const other='be1_'+crypto.randomBytes(32).toString('base64url');
const jobs=new Set(),assets=new Set;
function parseJson(text){try{return JSON.parse(text);}catch{return {text:text.slice(0,200)};}}
async function call(p,method='GET',body,token=key){
 const r=await fetch(endpoint+p,{method,headers:{Origin:origin,Authorization:'Bearer '+token,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const raw=await r.text(),data=parseJson(raw);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin,'CORS failed: '+method+' '+p+' HTTP '+r.status+' '+raw.slice(0,150));
 return {status:r.status,data};
}
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'be-publish-'));
 try{
   const status=await call('/api/guest-publishing/status');
   assert.equal(status.status,200);assert.equal(status.data.autoPublishing,false);
   const list=await call('/api/guest-publishing/jobs');
   assert.equal(list.status,200);assert.equal(list.data.jobs.length,0);
   const draft=await call('/api/guest-publishing/jobs','POST',{
     title:'Private publishing test',caption:'A satisfying video #asmr',platforms:['youtube','instagram'],repeat:'none'});
   assert.equal(draft.status,201,'draft failed '+JSON.stringify(draft.data));
   jobs.add(draft.data.id);
   assert.equal(draft.data.status,'draft');
   const stranger=await call('/api/guest-publishing/jobs/'+draft.data.id,'GET',undefined,other);
   assert.equal(stranger.status,404,'Cross-library publishing draft visible');
   const at=new Date(Date.now()+5*60000).toISOString();
   const scheduled=await call('/api/guest-publishing/jobs/'+draft.data.id,'PATCH',{scheduleAt:at,repeat:'daily'});
   assert.equal(scheduled.status,200,'schedule failed '+JSON.stringify(scheduled.data));
   assert.equal(scheduled.data.status,'scheduled');
   assert.equal(scheduled.data.repeat,'daily');
   const invalid=await call('/api/guest-publishing/jobs','POST',{title:'Expired',platforms:['youtube'],scheduleAt:new Date(Date.now()-2000).toISOString()});
   assert.equal(invalid.status,400,'Past schedule not rejected');
   const badPlatforms=await call('/api/guest-publishing/jobs','POST',{title:'No fake platforms',platforms:['reddit']});
   assert.equal(badPlatforms.status,400,'Unknown social platform accepted');
   const mp4Path=path.join(tmp,'guest-test.mp4');
   cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=160x288:rate=12:duration=1.2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',mp4Path],{timeout:30000});
   const video=fs.readFileSync(mp4Path);assert.ok(video.subarray(4,8).toString('ascii')==='ftyp'&&video.length>2000);
   const form=new FormData();form.append('file',new Blob([video],{type:'video/mp4'}),'guest-test.mp4');
   const up=await call('/api/guest-publishing/videos','POST',form);
   assert.equal(up.status,201,'MP4 upload failed '+JSON.stringify(up.data));assets.add(up.data.key);
   const playback=await fetch(up.data.url,{signal:AbortSignal.timeout(30000)});
   assert.equal(playback.status,200,'Unable to access signed MP4');
   const read=Buffer.from(await playback.arrayBuffer());
   assert.equal(read.toString('hex'),video.toString('hex'),'Video bytes corrupted');
   const range=await fetch(up.data.url,{headers:{Range:'bytes=0-63'},signal:AbortSignal.timeout(30000)});
   assert.equal(range.status,206,'MP4 range playback failed');
   assert.equal(Buffer.from(await range.arrayBuffer()).length,64);
   const unsigned=await fetch(up.data.url.split('?')[0],{signal:AbortSignal.timeout(30000)});
   assert.equal(unsigned.status,403,'Unsigned video is readable');
   const attached=await call('/api/guest-publishing/jobs/'+draft.data.id,'PATCH',{videoAssetId:up.data.key});
   assert.equal(attached.status,200);assert.ok(attached.data.videoUrl);
   const copied=await call('/api/guest-publishing/jobs/'+draft.data.id,'GET',undefined,other);
   assert.equal(copied.status,404);
   const complete=await call('/api/guest-publishing/jobs/'+draft.data.id+'/complete','POST',{});
   assert.equal(complete.status,200);
   assert.equal(complete.data.manualConfirmation,true);
   assert.ok(complete.data.nextReminderId,'Daily reminder was not created');
   jobs.add(complete.data.nextReminderId);
   const all=await call('/api/guest-publishing/jobs');
   assert.ok(all.data.jobs.some(x=>x.id===draft.data.id&&x.status==='published'));
   assert.ok(all.data.jobs.some(x=>x.id===complete.data.nextReminderId&&x.status==='scheduled'));
   const second=await call('/api/guest-publishing/jobs/'+draft.data.id+'/complete','POST',{});
   assert.equal(second.status,409,'Duplicate manual publishing completion accepted');
   const bad=new FormData();bad.append('file',new Blob(['not a video'],{type:'video/mp4'}),'bad.mp4');
   const invalidVideo=await call('/api/guest-publishing/videos','POST',bad);
   assert.equal(invalidVideo.status,415,'Invalid MP4 accepted');
   console.log('GUEST_PUBLISH_API_PASS '+JSON.stringify({drafts:true,schedule:true,recur:true,tenantIsolation:true,
     invalidDates:true,platformValidation:true,mp4Upload:true,mp4Streaming:true,signedPlayback:true,
     noAutomaticSocialPosting:true,videoBytes:video.length}));
 }finally{
   for(const id of jobs)await call('/api/guest-publishing/jobs/'+id,'DELETE').catch(()=>{});
   for(const id of assets)await call('/api/assets/'+id,'DELETE').catch(()=>{});
   fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error('GUEST_PUBLISH_API_FAIL',String(e.stack||e));process.exitCode=1;});
