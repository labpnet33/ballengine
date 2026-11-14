// Private guest MIDI and song uploads. R2 is unavailable, so media is
// stored in bounded 192 KiB base64 chunks in this independent D1 database.
const MAX_FILE=10*1024*1024,MAX_TOTAL=40*1024*1024,CHUNK=192*1024;
const enc=new TextEncoder;
const isMediaId=id=>/^[0-9a-f-]{36}$/i.test(id||'');
const isRecordId=id=>/^[a-zA-Z0-9_-]{3,64}$/.test(id||'');
export const isPrivateMusic=path=>/^\/api\/(?:upload(?:\/|$)|assets\/|songs(?:\/|$)|melodies(?:\/|$))/.test(path);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
function decode(s){const v=atob(s),b=new Uint8Array(v.length);for(let i=0;i<v.length;i++)b[i]=v.charCodeAt(i);return b;}
async function mediaUrl(req,library,id){const u=new URL('/api/assets/'+id,req.url);u.searchParams.set('token',await hash(enc.encode(library+'|'+id+'|play-v1')));return u.href;}
function nameOf(v){const n=String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,90);if(!n)throw Object.assign(new Error('Name required'),{status:400});return n;}
async function usage(db,library){const r=await db.prepare('SELECT COALESCE(SUM(size_bytes),0) used,COUNT(*) count FROM media_uploads WHERE library_id=?').bind(library).first();return {used:Number(r?.used||0),count:Number(r?.count||0)};}
function mediaType(file,bytes){
  const name=String(file.name||'').toLowerCase(),head=bytes.subarray(0,Math.min(bytes.length,10000));
  if(/\.(mid|midi)$/.test(name)){if(head.length<14||String.fromCharCode(...head.subarray(0,4))!=='MThd')throw Object.assign(new Error('Invalid MIDI file'),{status:415});return 'audio/midi';}
  if(name.endsWith('.wav')){if(head.length<44||String.fromCharCode(...head.subarray(0,4))!=='RIFF'||String.fromCharCode(...head.subarray(8,12))!=='WAVE')throw Object.assign(new Error('Invalid WAV file'),{status:415});return 'audio/wav';}
  if(!name.endsWith('.mp3'))throw Object.assign(new Error('Upload MP3, WAV or MIDI only'),{status:415});
  if(head.length<800)throw Object.assign(new Error('MP3 file is empty or damaged'),{status:415});
  const id3=String.fromCharCode(...head.subarray(0,3))==='ID3';
  let frame=false;for(let i=0;i<head.length-1;i++)if(head[i]===255&&(head[i+1]&0xe0)===0xe0){frame=true;break;}
  if(!id3&&!frame)throw Object.assign(new Error('Invalid MP3 file content'),{status:415});return 'audio/mpeg';
}
async function upload(req,env,library,origin,json,fail){
  const db=env.DB;
  if(req.method==='GET'){
    const checksum=new URL(req.url).searchParams.get('checksum')||'';
    if(!/^[0-9a-f]{64}$/i.test(checksum))return fail('Checksum required',400,origin);
    const row=await db.prepare('SELECT * FROM media_uploads WHERE library_id=? AND checksum=?').bind(library,checksum.toLowerCase()).first();
    return json(row?{exists:true,url:await mediaUrl(req,library,row.id),key:row.id,size:row.size_bytes,type:row.mime}:{exists:false},200,origin);
  }
  if(req.method!=='POST')return fail('Method not allowed',405,origin);
  if(Number(req.headers.get('Content-Length')||0)>MAX_FILE+256000)return fail('Maximum audio upload is 10 MB.',413,origin);
  const form=await req.formData(),file=form.get('file');
  if(!(file instanceof File))return fail('No audio file selected',400,origin);
  if(file.size<14||file.size>MAX_FILE)return fail('Upload must be between 14 bytes and 10 MB.',413,origin);
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=mediaType(file,bytes),checksum=await hash(bytes);
  const supplied=String(form.get('checksum')||'');
  if(supplied&&supplied.toLowerCase()!==checksum)return fail('File checksum mismatch',422,origin);
  const found=await db.prepare('SELECT * FROM media_uploads WHERE library_id=? AND checksum=?').bind(library,checksum).first();
  if(found)return json({url:await mediaUrl(req,library,found.id),key:found.id,size:found.size_bytes,type:found.mime},200,origin);
  const u=await usage(db,library);
  if(u.used+bytes.length>MAX_TOTAL)return json({error:'Music library is full (40 MB). Delete an unused song to free space.',code:'QUOTA',limit:MAX_TOTAL,currentUsage:u.used},403,origin);
  const id=crypto.randomUUID();
  try{
    await db.prepare('INSERT INTO media_uploads(id,library_id,name,mime,size_bytes,checksum,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,library,nameOf(file.name),mime,bytes.length,checksum,Date.now()).run();
    const parts=[];for(let i=0,j=0;i<bytes.length;i+=CHUNK,j++)parts.push(db.prepare('INSERT INTO media_chunks(asset_id,library_id,chunk_index,data_b64) VALUES(?,?,?,?)').bind(id,library,j,base64(bytes.subarray(i,i+CHUNK))));
    await db.batch(parts);
    return json({url:await mediaUrl(req,library,id),key:id,size:bytes.length,type:mime},201,origin);
  }catch(e){
    console.warn('D1 audio upload failed',e?.name||'Error');
    await db.prepare('DELETE FROM media_chunks WHERE library_id=? AND asset_id=?').bind(library,id).run().catch(()=>{});
    await db.prepare('DELETE FROM media_uploads WHERE library_id=? AND id=?').bind(library,id).run().catch(()=>{});
    return fail('Media storage failed; try a smaller file.',503,origin);
  }
}
export async function serveAsset(req,env){
  const u=new URL(req.url),id=u.pathname.slice('/api/assets/'.length);
  if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});
  if(!isMediaId(id))return new Response('Not found',{status:404});
  const row=await env.DB.prepare('SELECT * FROM media_uploads WHERE id=?').bind(id).first();
  if(!row)return new Response('Not found',{status:404});
  const expected=await hash(enc.encode(row.library_id+'|'+id+'|play-v1'));
  if(u.searchParams.get('token')!==expected)return new Response('Forbidden',{status:403});
  const headers={'Content-Type':row.mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff',
    'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Cache-Control':'private,max-age=3600'};
  if(req.method==='HEAD')return new Response(null,{status:200,headers:{...headers,'Content-Length':String(row.size_bytes)}});
  const chunks=await env.DB.prepare('SELECT data_b64 FROM media_chunks WHERE asset_id=? AND library_id=? ORDER BY chunk_index').bind(id,row.library_id).all();
  const bytes=new Uint8Array(row.size_bytes);let offset=0;
  for(const chunk of chunks.results||[]){const p=decode(chunk.data_b64);if(offset+p.length>bytes.length)return new Response('Corrupt audio',{status:500});bytes.set(p,offset);offset+=p.length;}
  if(offset!==bytes.length)return new Response('Incomplete audio',{status:500});
  const range=req.headers.get('Range');
  if(range){
    const m=/^bytes=(\d+)-(\d*)$/.exec(range.trim());
    if(!m)return new Response('Invalid range',{status:416,headers:{...headers,'Content-Range':'bytes */'+bytes.length}});
    const begin=Number(m[1]),end=m[2]?Number(m[2]):bytes.length-1;
    if(begin>=bytes.length||end<begin||end>=bytes.length)return new Response('Range unavailable',{status:416,headers:{...headers,'Content-Range':'bytes */'+bytes.length}});
    return new Response(bytes.slice(begin,end+1),{status:206,headers:{...headers,'Content-Range':'bytes '+begin+'-'+end+'/'+bytes.length,'Content-Length':String(end-begin+1)}});
  }
  return new Response(bytes,{status:200,headers:{...headers,'Content-Length':String(bytes.length)}});
}
async function songs(req,db,library,origin,json,fail){
  const u=new URL(req.url),id=u.pathname.slice('/api/songs/'.length);
  if(u.pathname==='/api/songs'){
    if(req.method==='GET'){
      const q=await db.prepare('SELECT s.*,m.size_bytes FROM songs s JOIN media_uploads m ON m.id=s.media_id AND m.library_id=s.library_id WHERE s.library_id=? ORDER BY s.created_at DESC LIMIT 150').bind(library).all();
      return json(await Promise.all((q.results||[]).map(async r=>({id:r.id,name:r.name,data:await mediaUrl(req,library,r.media_id),size_bytes:r.size_bytes,format:'AUDIO',isOwner:true,synced:true}))),200,origin);
    }
    if(req.method!=='POST')return fail('Method not allowed',405,origin);
    const b=await req.json(),name=nameOf(b.name),sid=String(b.id||crypto.randomUUID());
    if(!isRecordId(sid))return fail('Invalid song ID',400,origin);
    let mid='';try{mid=new URL(String(b.data)).pathname.split('/api/assets/')[1]||'';}catch{}
    if(!isMediaId(mid))return fail('Upload your audio before adding a song',400,origin);
    const a=await db.prepare('SELECT * FROM media_uploads WHERE library_id=? AND id=?').bind(library,mid).first();
    if(!a||!['audio/mpeg','audio/wav'].includes(a.mime))return fail('Audio file does not belong to your library',404,origin);
    if(await db.prepare('SELECT id FROM songs WHERE library_id=? AND id=?').bind(library,sid).first())return fail('Song exists',409,origin);
    await db.prepare('INSERT INTO songs(id,library_id,name,media_id,created_at) VALUES(?,?,?,?,?)').bind(sid,library,name,mid,Date.now()).run();
    return json({id:sid,name,data:await mediaUrl(req,library,mid),size_bytes:a.size_bytes},201,origin);
  }
  if(!isRecordId(id))return fail('Song not found',404,origin);
  const row=await db.prepare('SELECT * FROM songs WHERE library_id=? AND id=?').bind(library,id).first();
  if(!row)return fail('Song not found',404,origin);
  if(req.method==='DELETE'){
    await db.prepare('DELETE FROM songs WHERE library_id=? AND id=?').bind(library,id).run();
    const other=await db.prepare('SELECT id FROM songs WHERE library_id=? AND media_id=? LIMIT 1').bind(library,row.media_id).first();
    if(!other){
      await db.prepare('DELETE FROM media_chunks WHERE library_id=? AND asset_id=?').bind(library,row.media_id).run();
      await db.prepare('DELETE FROM media_uploads WHERE library_id=? AND id=?').bind(library,row.media_id).run();
    }
    return json({deleted:true},200,origin);
  }
  if(req.method==='GET')return json({id:row.id,name:row.name,data:await mediaUrl(req,library,row.media_id)},200,origin);
  return fail('Method not allowed',405,origin);
}
async function melodies(req,db,library,origin,json,fail){
  const u=new URL(req.url),id=u.pathname.slice('/api/melodies/'.length);
  if(u.pathname==='/api/melodies'){
    if(req.method==='GET'){
      const rs=await db.prepare('SELECT * FROM melodies WHERE library_id=? ORDER BY created_at DESC LIMIT 60').bind(library).all();
      return json((rs.results||[]).map(x=>{let d={};try{d=JSON.parse(x.data);}catch{}return{id:x.id,name:x.name,url:d.url,midiData:d.midiData,format:'MIDI',hasCloudData:true,isOwner:true,synced:true};}),200,origin);
    }
    if(req.method!=='POST')return fail('Method not allowed',405,origin);
    const b=await req.json(),id=String(b.id||b.data?.id||crypto.randomUUID()),name=nameOf(b.name);
    if(!isRecordId(id)||!b.data||typeof b.data!=='object')return fail('Invalid MIDI arrangement',400,origin);
    const data=JSON.stringify(b.data);
    if(enc.encode(data).length>1400000)return fail('MIDI arrangement is too large (max 1.4 MB)',413,origin);
    if(b.data.url){
      let mediaId='';try{mediaId=new URL(String(b.data.url)).pathname.split('/api/assets/')[1]||'';}catch{}
      if(!isMediaId(mediaId))return fail('Invalid MIDI URL',400,origin);
      const file=await db.prepare('SELECT id FROM media_uploads WHERE library_id=? AND id=? AND mime=?').bind(library,mediaId,'audio/midi').first();
      if(!file)return fail('MIDI file not found in your cloud library',404,origin);
    }
    if(await db.prepare('SELECT id FROM melodies WHERE library_id=? AND id=?').bind(library,id).first())return fail('MIDI arrangement already registered',409,origin);
    await db.prepare('INSERT INTO melodies(id,library_id,name,data,created_at) VALUES(?,?,?,?,?)').bind(id,library,name,data,Date.now()).run();
    return json({id,name,format:'MIDI',hasCloudData:true},201,origin);
  }
  if(!isRecordId(id))return fail('MIDI arrangement not found',404,origin);
  const row=await db.prepare('SELECT * FROM melodies WHERE library_id=? AND id=?').bind(library,id).first();
  if(!row)return fail('MIDI arrangement not found',404,origin);
  if(req.method==='GET')return json({id:row.id,name:row.name,data:JSON.parse(row.data),version:1},200,origin);
  if(req.method==='DELETE'){await db.prepare('DELETE FROM melodies WHERE library_id=? AND id=?').bind(library,id).run();return json({deleted:true},200,origin);}
  return fail('Method not allowed',405,origin);
}
export async function privateMusic(req,env,library,origin,json,fail,rateLimit){
  const path=new URL(req.url).pathname;
  try{
    if(['POST','PUT','DELETE'].includes(req.method))await rateLimit(env.DB,req);
    if(path==='/api/upload/check'||path==='/api/upload')return upload(req,env,library,origin,json,fail);
    if(path.startsWith('/api/assets/')&&req.method==='DELETE'){
      const assetId=path.slice('/api/assets/'.length);
      if(!isMediaId(assetId))return fail('Media not found',404,origin);
      const row=await env.DB.prepare('SELECT id FROM media_uploads WHERE library_id=? AND id=?').bind(library,assetId).first();
      if(!row)return fail('Media not found',404,origin);
      await env.DB.prepare('DELETE FROM songs WHERE library_id=? AND media_id=?').bind(library,assetId).run();
      await env.DB.prepare('DELETE FROM media_chunks WHERE library_id=? AND asset_id=?').bind(library,assetId).run();
      await env.DB.prepare('DELETE FROM media_uploads WHERE library_id=? AND id=?').bind(library,assetId).run();
      return json({deleted:true},200,origin);
    }
    if(path==='/api/songs'||path.startsWith('/api/songs/'))return songs(req,env.DB,library,origin,json,fail);
    if(path==='/api/melodies'||path.startsWith('/api/melodies/'))return melodies(req,env.DB,library,origin,json,fail);
    return fail('Not found',404,origin);
  }catch(e){console.warn('Audio endpoint error',e?.name||'Error');return fail([400,413,415,422].includes(e?.status)?e.message:'Music storage operation failed',e?.status||500,origin);}
}
export async function musicUsage(db,library){const u=await usage(db,library);return {limit:MAX_TOTAL,total:u.used,media_count:u.count};}
