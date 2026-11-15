import {PhysicsClock} from './core.mjs';
import {launchPrototype,findPrototype} from './registry.mjs';
import {drawZigzag,drawPrismFallback,makePrismRenderer} from './renderers.mjs';
import {recordMode} from './record.mjs';
import './live.css';

const slug=new URLSearchParams(location.search).get('mode');
const descriptor=findPrototype(slug);
if(!descriptor)throw Error('Unknown studio mode: '+slug);
const initial=()=>Object.fromEntries(Object.entries(descriptor.options).map(([k,v])=>[k,v.default]));
let cfg={...initial(),glow:true,sound:true,orbit:false,bpm:120,volume:45,seconds:5,resolution:'720x1280'};
let world=null,view=null,clock=new PhysicsClock(),raf=0,last=0,time=0,playing=true,closed=false,sequence=0;
let recorderSignal=null,audio=null;
const root=document.getElementById('root');
root.innerHTML=[
'<main class="be-app"><header class="be-top"><a class="be-logo" href="/home">◉ BallEngine</a>',
'<span class="be-crumb">Studio / <strong id="be-name"></strong></span>',
'<nav><a href="/studio?mode=neon-zigzag">Neon Zigzag</a><a href="/studio?mode=prism-chain">Prism Chain</a><a href="/studio?mode=rhythmic">Original Studio</a></nav></header>',
'<div class="be-layout"><section class="be-main">',
'<div class="be-tools"><button id="be-play">⏸ Pause</button><button id="be-reset">↻ Reset</button><button id="be-shuffle">⤨ Randomize</button><button id="be-audio">♫ Sound on</button>',
'<button id="be-record" class="be-primary">● Record MP4</button><button id="be-cancel" hidden>Cancel</button></div>',
'<div class="be-stage"><canvas id="be-canvas" width="720" height="1280" aria-label="Simulation preview"></canvas><span class="be-live-badge">● LIVE PREVIEW</span></div>',
'<div id="be-message" class="be-message" role="status">Initializing physics…</div></section>',
'<aside class="be-panel"><div class="be-panel-title"><span>Mode settings</span><small id="be-engine"></small></div>',
'<h2 id="be-heading"></h2><p class="be-desc" id="be-description"></p><div id="be-mode-fields"></div>',
'<div class="be-panel-title">Effects & Recording</div><div id="be-common-fields"></div>',
'<p class="be-help">Impact sounds play live after interacting with the page. Offline MP4 clips currently include video only. On browsers without H.264 WebCodecs, the recording is saved as WebM.</p></aside></div></main>'
].join('');
const el=id=>document.getElementById(id);
el('be-name').textContent=descriptor.title;
el('be-heading').textContent=descriptor.title;
el('be-engine').textContent=descriptor.backend==='planck'?'Planck • 2D':'Rapier • 3D';
el('be-description').textContent=slug==='neon-zigzag'?'Glowing marbles bounce on a zigzag rail. Adjust gravity, bounce, rail layout and beat-pulsed lighting.':'A rainbow chain reaction of physical 3D prisms. Adjust body count, spacing, gravity and restitution.';
const canvas=el('be-canvas');
const controls={
 ballCount:['Marbles',1,24,1],
 gravity:['Gravity',0,30,.5],
 bounce:['Bounce',0,1,.05],
 railCount:['Rail count',2,16,1],
 tilt:['Rail slope',.03,.5,.01],
 prismCount:['Prism count',4,120,1],
 restitution:['Restitution',0,.9,.05],
 spacing:['Spacing',.3,1.6,.05],
 volume:['Ding volume',0,100,1]
};
function say(message,error=false){el('be-message').textContent=message;el('be-message').classList.toggle('error',error);}
function sync(){el('be-play').textContent=playing?'⏸ Pause':'▶ Play';el('be-audio').textContent=cfg.sound?'♫ Sound on':'♫ Sound off';}
function slider(name,rule){
 const [label,min,max,step]=controls[name];
 const row=document.createElement('label');row.className='be-field';
 const title=document.createElement('span');title.className='be-field-head';
 const text=document.createElement('strong');text.textContent=label;
 const value=document.createElement('output');value.textContent=cfg[name];title.append(text,value);
 const input=document.createElement('input');input.type='range';input.id='be-option-'+name;input.min=min;input.max=max;input.step=step;input.value=cfg[name];
 input.addEventListener('input',()=>{cfg[name]=Number(input.value);value.textContent=input.value;});
 input.addEventListener('change',()=>{if(name==='volume')return;restart(true);});
 row.append(title,input);return row;
}
function choose(id,label,items,value,callback){
 const row=document.createElement('label');row.className='be-field';row.append(document.createTextNode(label));
 const sel=document.createElement('select');sel.id=id;
 for(const [v,n] of items){const o=document.createElement('option');o.value=v;o.textContent=n;sel.append(o);}
 sel.value=String(value);sel.addEventListener('change',()=>callback(sel.value));row.append(sel);return row;
}
function check(name,title){
 const row=document.createElement('label');row.className='be-check';
 const input=document.createElement('input');input.id='be-check-'+name;input.type='checkbox';input.checked=cfg[name];
 input.addEventListener('change',()=>{cfg[name]=input.checked;sync();});
 const span=document.createElement('span');span.textContent=title;row.append(input,span);return row;
}
function drawControls(){
 const holder=el('be-mode-fields');holder.replaceChildren();
 for(const [name,rule] of Object.entries(descriptor.options))holder.append(slider(name,rule));
 const common=el('be-common-fields');common.replaceChildren(check('glow','Glow and highlights'),check('sound','Impact ding effects'));
 if(slug==='prism-chain')common.append(check('orbit','Slow camera orbit'));
 if(slug==='neon-zigzag')common.append(choose('be-bpm','Visual pulse tempo',[60,90,120,140,160,180].map(n=>[n,n+' BPM']),cfg.bpm,v=>{cfg.bpm=Number(v);}));
 common.append(choose('be-duration','Clip duration',[2,5,10,15,30].map(n=>[n,n+' seconds']),cfg.seconds,v=>{cfg.seconds=Number(v);}));
 common.append(choose('be-resolution','Video size',[['360x640','360 × 640 quick test'],['720x1280','720 × 1280 portrait'],['1080x1920','1080 × 1920 Shorts']],cfg.resolution,v=>{cfg.resolution=v;}));
 common.append(slider('volume',{type:'integer'}));
}
async function createRenderer(target,scene,options){
 if(slug==='neon-zigzag')return {render:(_snapshot,t)=>drawZigzag(target,scene,options,t),dispose(){}};
 try{return await makePrismRenderer(target,scene,options);}
 catch(e){console.warn('3D WebGL renderer unavailable, showing physical 2D projection',e);return {render:()=>drawPrismFallback(target,scene,options),dispose(){}};}
}
async function restart(preservePlay=false){
 const current=++sequence,wasPlaying=playing;
 playing=false;cancelAnimationFrame(raf);
 try{view?.dispose();world?.dispose();}catch(e){console.warn('Old scene cleanup:',e);}
 view=null;world=null;clock.reset();time=0;
 say('Loading '+descriptor.title+'…');
 try{
  const newWorld=await launchPrototype(slug,cfg,{enabled:true});
  if(current!==sequence){newWorld.dispose();return;}
  const newView=await createRenderer(canvas,newWorld,cfg);
  if(current!==sequence){newView.dispose();newWorld.dispose();return;}
  world=newWorld;view=newView;view.render(world.snapshot(),0);
  playing=preservePlay?wasPlaying:true;last=0;sync();
  say('Ready • '+descriptor.title+' • '+(slug==='neon-zigzag'?'Planck 2D':'Rapier 3D')+' collision simulation');
  raf=requestAnimationFrame(loop);
 }catch(e){console.error(e);say('Simulation error: '+e.message,true);}
}
function unlockAudio(){
 try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}audio?.resume?.().catch(()=>{});}catch{}
}
function ding(impulse){
 if(!cfg.sound||!audio||audio.state!=='running')return;
 try{
  const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(650+Math.min(1050,impulse*90),now);
  osc.frequency.exponentialRampToValueAtTime(390,now+.15);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001,cfg.volume/100*.12),now+.006);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.16);
  osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+.17);
 }catch(e){console.warn('Impact audio unavailable',e);}
}
function loop(timestamp){
 if(closed||!world||!view)return;
 const delta=last?Math.min(.05,(timestamp-last)/1000):0;last=timestamp;
 if(playing){
  clock.advance(delta,step=>{world.step();time+=step;});
  for(const contact of world.drainContacts().slice(0,3))ding(contact.impulse);
 }
 view.render(world.snapshot(),time);
 raf=requestAnimationFrame(loop);
}
el('be-play').addEventListener('click',()=>{unlockAudio();playing=!playing;last=0;sync();});
el('be-reset').addEventListener('click',()=>restart(false));
el('be-audio').addEventListener('click',()=>{cfg.sound=!cfg.sound;unlockAudio();drawControls();sync();});
el('be-shuffle').addEventListener('click',()=>{
 const next={...cfg};
 for(const [name,rule] of Object.entries(descriptor.options)){
  const n=rule.min+Math.random()*(rule.max-rule.min);
  next[name]=rule.type==='integer'?Math.round(n):Math.round(n*100)/100;
 }
 cfg=next;drawControls();restart(false);
});
el('be-record').addEventListener('click',async()=>{
 if(recorderSignal)return;
 const abort=new AbortController();recorderSignal=abort;
 el('be-record').disabled=true;el('be-cancel').hidden=false;
 const copy={...cfg},seconds=copy.seconds,[width,height]=copy.resolution.split('x').map(Number);
 try{
  say('Preparing offline recording…');
  const result=await recordMode({slug,config:copy,seconds,width,height,signal:abort.signal,
   createWorld:configuration=>launchPrototype(slug,configuration,{enabled:true}),
   createRenderer:(target,sim,configuration)=>createRenderer(target,sim,configuration),
   onProgress:p=>say('Rendering '+seconds+' second clip… '+p+'%')});
  say(result.mime+' downloaded ('+(result.bytes/1048576).toFixed(2)+' MB) • video-only');
 }catch(e){say(e.name==='AbortError'?'Recording cancelled':'Recording failed: '+e.message,true);}
 finally{recorderSignal=null;el('be-record').disabled=false;el('be-cancel').hidden=true;}
});
el('be-cancel').addEventListener('click',()=>recorderSignal?.abort());
window.addEventListener('pagehide',()=>{closed=true;cancelAnimationFrame(raf);recorderSignal?.abort();try{view?.dispose();world?.dispose();audio?.close();}catch{}});
drawControls();sync();restart(false);
