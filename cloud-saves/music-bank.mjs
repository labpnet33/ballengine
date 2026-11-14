/**
 * 128 deterministic, original MIDI arrangements for the independent Studio.
 * These are generated from interval patterns; no third-party music catalog,
 * commercial song copies or locked upstream assets are redistributed.
 */
const MOODS=['Dreamy','Uplifting','Mysterious','Energetic','Calm','Dark','Playful','Cinematic'];
const GENRES=['Ambient','Electronic','Orchestral','Piano','Synthwave','Lo-Fi','Chiptune','Percussive'];
const BASES=[48,53,45,55,50,43,60,52];
const CHORDS=[[0,3,5,4],[0,5,3,4],[0,4,1,5],[0,3,4,2],[0,5,4,3],[0,6,5,4],[0,3,5,1],[0,4,5,3]];
const BANK=Array.from({length:128},(_,i)=>{
  const mood=MOODS[i%8],genre=GENRES[Math.floor(i/8)%8],variation=Math.floor(i/64)+1;
  return {id:'bank_'+String(i+1).padStart(3,'0'),xmidiId:'BM'+String(i+1).padStart(6,'0'),
    name:mood+' '+genre+' '+variation,mood,genre,variation,seed:i+1};
});
const CACHE=new Map;
const ALLOW=(origin)=>!origin||(()=>{try{const url=new URL(origin);return (url.protocol==='https:'&& (url.hostname==='ballengine.vercel.app'||url.hostname.startsWith('ballengine-')&&url.hostname.endsWith('.vercel.app')))||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);}catch{return false;}})();
function headers(origin,contentType){
  return {'Content-Type':contentType,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff',
    ...(origin&&ALLOW(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
}
function result(data,origin,status=200){return new Response(JSON.stringify(data),{status,headers:headers(origin,'application/json;charset=utf-8')});}
function melody(item){
  const existing=CACHE.get(item.id);
  if(existing)return existing;
  const mode=MOODS.indexOf(item.mood),genre=GENRES.indexOf(item.genre),variation=item.variation;
  const bpm=82+((mode*11+genre*7+variation*5)%58);
  const beat=60/bpm;
  const scale=(mode===2||mode===5||genre===6)?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const root=BASES[mode]+(variation===2?2:0);
  const chord=CHORDS[(mode+genre)%CHORDS.length];
  const events=[];
  let phase=(item.seed*37)%37;
  const add=(pitch,time,duration,velocity,track)=>events.push([Math.max(36,Math.min(96,pitch)),Math.max(0,time),duration,velocity,track]);
  for(let bar=0;bar<16;bar++){
    const progression=chord[bar%4],base=root+scale[progression];
    for(let b=0;b<4;b++){
      const start=(bar*4+b)*beat;
      const interval=scale[(phase+b+bar*3)%7];
      const octave=((bar+b+genre)%7===0?12:0);
      add(base+12+interval+octave,start,beat*(genre===0?.87:.58),.52+((bar+b)%5)*.075,0);
      if(genre===7&&b%2===0)add(root-12+scale[(bar+3)%7],start,beat*.21,.29,1);
    }
    if(genre===2||genre===3||genre===0||genre===5){
      for(const semitone of [0,scale[2],scale[4]]){
        add(base+semitone-12,bar*4*beat,3.6*beat,.28,1);
      }
    }else{
      add(base-12,bar*4*beat,.78*beat,.4,1);
      add(base-12,(bar*4+2)*beat,.65*beat,.29,1);
    }
    phase=(phase+5+bar+variation)%41;
  }
  const seconds=Math.round(16*4*beat*100)/100;
  const data={n:events,h:{bpm,tracks:[{index:0,instrument:'GRAND_PIANO'},{index:1,instrument:'SYNTH'}]},d:seconds};
  const output={...item,seconds,tempo:bpm,data};
  CACHE.set(item.id,output);
  return output;
}
function byte32(value){return [(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];}
function varlen(value){
  let n=Math.max(0,Math.floor(value));const bytes=[n&0x7f];
  while((n>>=7)>0)bytes.unshift((n&0x7f)|0x80);
  return bytes;
}
function toMidi(item){
  const song=melody(item),ppq=480,secToTicks=ppq*song.tempo/60;
  const tempo=Math.round(60000000/song.tempo);
  const ticks=[];
  for(const [pitch,time,duration,velocity,track] of song.data.n){
    const start=Math.max(0,Math.round(time*secToTicks));
    const end=start+Math.max(20,Math.round(duration*secToTicks));
    const note= Math.round(pitch);
    const channel=track===0?0:1;
    ticks.push({t:start,sort:1,bytes:[0x90|channel,note,Math.max(1,Math.round(velocity*115))]});
    ticks.push({t:end,sort:0,bytes:[0x80|channel,note,0]});
  }
  ticks.sort((a,b)=>a.t-b.t||a.sort-b.sort);
  const track=[0,0xff,0x51,3,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255];
  let cursor=0;
  for(const event of ticks){track.push(...varlen(event.t-cursor),...event.bytes);cursor=event.t;}
  track.push(0,0xff,0x2f,0);
  return new Uint8Array([...BufferMThd(),...byte32(track.length),...track]);
}
function BufferMThd(){return [77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107];}
function toXmidiTrack(item,request){
  const song=melody(item);
  return {id:item.xmidiId,emotion:item.mood,genre:item.genre,seconds:song.seconds,
    hasDrums:false,leadTrack:0,
    url:new URL('/api/xmidi/file/'+item.xmidiId+'.mid',request.url).href};
}
function filtered(url){
  return BANK.filter(item=>(!url.searchParams.get('emotion')||url.searchParams.get('emotion')===item.mood)&&
    (!url.searchParams.get('genre')||url.searchParams.get('genre')===item.genre));
}
export function isPublicMusic(path){
  return path==='/api/song-bank'||path.startsWith('/api/song-bank/')||path==='/api/xmidi'||path.startsWith('/api/xmidi/');
}
export async function publicMusic(req){
  const url=new URL(req.url),origin=req.headers.get('Origin')||'';
  if(!ALLOW(origin))return result({error:'Origin is not allowed'},'',403);
  if(req.method!=='GET'&&req.method!=='HEAD')return result({error:'Method not allowed'},origin,405);
  if(url.pathname==='/api/song-bank'){
    return result({songs:BANK.map(item=>({id:item.id,name:item.name,genre:item.genre,seconds:melody(item).seconds}))},origin);
  }
  if(url.pathname.startsWith('/api/song-bank/')){
    const id=decodeURIComponent(url.pathname.slice('/api/song-bank/'.length));
    const item=BANK.find(x=>x.id===id);
    if(!item)return result({error:'Song not found'},origin,404);
    const song=melody(item);
    return result({song:{id:item.id,name:item.name,genre:item.genre,data:song.data}},origin);
  }
  if(url.pathname==='/api/xmidi/facets'){
    const emotions=MOODS.map(key=>({key,count:BANK.filter(x=>x.mood===key).length}));
    const genres=GENRES.map(key=>({key,count:BANK.filter(x=>x.genre===key).length}));
    const buckets={};
    for(const item of BANK)buckets[item.mood+'/'+item.genre]=(buckets[item.mood+'/'+item.genre]||0)+1;
    return result({total:BANK.length,emotions,genres,buckets},origin);
  }
  if(url.pathname==='/api/xmidi'){
    const all=filtered(url),start=Math.max(0,Number(url.searchParams.get('cursor'))||0);
    const limit=Math.max(1,Math.min(60,Number(url.searchParams.get('limit'))||60));
    const list=all.slice(start,start+limit);
    return result({tracks:list.map(i=>toXmidiTrack(i,req)),
      nextCursor:start+limit<all.length?start+limit:null},origin);
  }
  if(url.pathname==='/api/xmidi/pick'){
    const all=filtered(url),n=Math.min(60,Math.max(1,Number(url.searchParams.get('n'))||1));
    const pivot=Math.abs(Number(url.searchParams.get('i'))||0);
    const tracks=[];
    for(let i=0;i<Math.min(n,all.length);i++)tracks.push(toXmidiTrack(all[(pivot+i*13)%all.length],req));
    return result({tracks},origin);
  }
  const file=/^\/api\/xmidi\/file\/([A-Z0-9]{8})\.mid$/.exec(url.pathname);
  if(file){
    const item=BANK.find(x=>x.xmidiId===file[1]);
    if(!item)return result({error:'MIDI not found'},origin,404);
    const bytes=toMidi(item);
    return new Response(req.method==='HEAD'?null:bytes,{headers:{...headers(origin,'audio/midi'),'Content-Length':String(bytes.byteLength)}});
  }
  const detail=/^\/api\/xmidi\/([A-Z0-9]{8})$/.exec(url.pathname);
  if(detail){
    const item=BANK.find(x=>x.xmidiId===detail[1]);
    return item?result({track:toXmidiTrack(item,req)},origin):result({error:'Track not found'},origin,404);
  }
  return result({error:'Not found'},origin,404);
}
