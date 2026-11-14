'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const url='https://ballengine-project-saves.labpnet33.workers.dev';
const origin='https://ballengine.vercel.app';
const key='be1_'+crypto.randomBytes(32).toString('base64url');
const other='be1_'+crypto.randomBytes(32).toString('base64url');
const createdAssets=new Set;
const createdSongs=new Set;
const createdMelodies=new Set;
async function req(path,method='GET',body,token=key){
  const r=await fetch(url+path,{
    method,signal:AbortSignal.timeout(45000),
    headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body instanceof FormData?{}:body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)
  });
  const b=await r.text();
  let data;try{data=JSON.parse(b);}catch{data={text:b.slice(0,200)};}
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin,'CORS denied for '+method+' '+path+' (HTTP '+r.status+', body='+b.slice(0,250)+')');
  return {status:r.status,data};
}
async function upload(bytes,filename,mime){
  const f=new FormData;
  f.append('file',new Blob([bytes],{type:mime}),filename);
  f.append('checksum',crypto.createHash('sha256').update(bytes).digest('hex'));
  return req('/api/upload','POST',f);
}
async function main(){
try{
  const songs=await req('/api/song-bank','GET',undefined,null);
  assert.equal(songs.status,200);
  assert.ok(songs.data.songs.length>=50,'Original MIDI song bank not populated');
  const item=songs.data.songs[7];
  const detail=await req('/api/song-bank/'+item.id,'GET',undefined,null);
  assert.equal(detail.status,200);
  assert.ok(detail.data.song.data.n.length>50,'Song bank arrangement lacks MIDI notes');
  const facets=await req('/api/xmidi/facets','GET',undefined,null);
  assert.ok(facets.data.total>=50&&facets.data.emotions.length>0&&facets.data.genres.length>0,'Online Mood Library facets unavailable');
  const listing=await req('/api/xmidi?limit=12','GET',undefined,null);
  assert.equal(listing.status,200);assert.equal(listing.data.tracks.length,12);
  const track=listing.data.tracks[0];
  const midiRes=await fetch(track.url,{signal:AbortSignal.timeout(20000)});
  assert.equal(midiRes.status,200);
  const midi=Buffer.from(await midiRes.arrayBuffer());
  assert.equal(midi.subarray(0,4).toString('ascii'),'MThd','Online MIDI is not a real MIDI file');
  assert.ok(midi.includes(Buffer.from('MTrk')),'Online MIDI file has no track chunk');
  const xmidi=await req('/api/xmidi/'+track.id,'GET',undefined,null);
  assert.equal(xmidi.data.track.id,track.id);
  const existing=await req('/api/songs');
  assert.deepEqual(existing.data,[]);
  const mp3=cp.execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=513:sample_rate=44100:duration=2','-c:a','libmp3lame','-b:a','96k','-f','mp3','pipe:1'],{timeout:30000,maxBuffer:2*1024*1024});
  assert.ok(mp3.length>5000,'Test MP3 unexpectedly small');
  const sha=crypto.createHash('sha256').update(mp3).digest('hex');
  const before=await req('/api/upload/check?checksum='+sha);
  assert.equal(before.data.exists,false);
  const uploaded=await upload(mp3,'test-original-song.mp3','audio/mpeg');
  assert.equal(uploaded.status,201,'MP3 upload failed: '+JSON.stringify(uploaded.data));
  createdAssets.add(uploaded.data.key);
  assert.ok(uploaded.data.url&&uploaded.data.size===mp3.length,'MP3 API response invalid');
  const after=await req('/api/upload/check?checksum='+sha);
  assert.equal(after.data.exists,true,'Uploaded MP3 cannot be deduplicated');
  const repeat=await upload(mp3,'test-original-song.mp3','audio/mpeg');
  assert.equal(repeat.data.key,uploaded.data.key,'MP3 deduplication did not reuse existing file');
  const playback=await fetch(uploaded.data.url,{signal:AbortSignal.timeout(20000)});
  assert.equal(playback.status,200,'Uploaded MP3 playback URL failed');
  const downloaded=Buffer.from(await playback.arrayBuffer());
  assert.equal(downloaded.toString('hex'),mp3.toString('hex'),'Uploaded MP3 data corrupted');
  const range=await fetch(uploaded.data.url,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(20000)});
  assert.equal(range.status,206,'Audio streaming range unsupported');
  assert.equal((await range.arrayBuffer()).byteLength,32);
  const withoutToken=await fetch(uploaded.data.url.split('?')[0],{signal:AbortSignal.timeout(20000)});
  assert.equal(withoutToken.status,403,'Music can be downloaded without its private link token');
  const created=await req('/api/songs','POST',{id:crypto.randomUUID(),name:'MP3 automated test',data:uploaded.data.url,size_bytes:uploaded.data.size});
  assert.equal(created.status,201,'Song registration failed: '+JSON.stringify(created.data));
  createdSongs.add(created.data.id);
  const listed=await req('/api/songs');
  assert.ok(listed.data.some(x=>x.id===created.data.id),'MP3 does not appear in uploaded songs list');
  const otherSongs=await req('/api/songs','GET',undefined,other);
  assert.equal(otherSongs.data.length,0,'Another guest can list uploaded songs');
  const otherFetch=await req('/api/songs/'+created.data.id,'GET',undefined,other);
  assert.equal(otherFetch.status,404,'Other guest can read a private song record');
  const bad=await upload(Buffer.from('This is not a valid mp3'.repeat(90)),'invalid.mp3','audio/mpeg');
  assert.equal(bad.status,415,'Wrong-content MP3 was accepted');
  const uploadedMidi=await upload(midi,'test-original-midi.mid','audio/midi');
  assert.equal(uploadedMidi.status,201,'MIDI file upload failed: '+JSON.stringify(uploadedMidi.data));
  createdAssets.add(uploadedMidi.data.key);
  const midRecord=await req('/api/melodies','POST',{id:'testmidi_'+crypto.randomBytes(6).toString('hex'),name:'MIDI automated test',data:{id:'testmidi',name:'MIDI automated test',format:'MIDI',midiData:detail.data.song.data,url:uploadedMidi.data.url}});
  assert.equal(midRecord.status,201,'MIDI registration failed: '+JSON.stringify(midRecord.data));
  createdMelodies.add(midRecord.data.id);
  const midiList=await req('/api/melodies');
  assert.ok(midiList.data.some(x=>x.id===midRecord.data.id),'MIDI missing from cloud library');
  const usage=await req('/api/storage/usage');
  assert.equal(usage.status,200);
  assert.ok(usage.data.total>=mp3.length+midi.length);
  console.log('MUSIC_API_PASS '+JSON.stringify({
    songbank:songs.data.songs.length,onlineMidi:listing.data.tracks.length,
    mp3Upload:true,midiUpload:true,playback:true,range:true,
    registration:true,libIsolation:true,dedup:true,mimeValidation:true,mediaBytes:mp3.length
  }));
}finally{
  for(const id of createdMelodies)await req('/api/melodies/'+id,'DELETE').catch(()=>{});
  for(const id of createdSongs)await req('/api/songs/'+id,'DELETE').catch(()=>{});
  for(const id of createdAssets)await req('/api/assets/'+id,'DELETE').catch(()=>{});
}
}
main().catch(e=>{console.error('MUSIC_API_FAILURE',e.stack||e);process.exitCode=1;});
