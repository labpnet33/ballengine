import {Muxer,ArrayBufferTarget} from 'mp4-muxer';
export async function recordMode({slug,config,seconds,width,height,createWorld,createRenderer,signal,onProgress}){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const world=await createWorld(config);let view=null,encoder=null,recorded=false;
 try{
  view=await createRenderer(canvas,world,config);
  const fps=30,total=fps*seconds,settings={codec:'avc1.42001f',width,height,bitrate:3200000,framerate:fps};
  const supported=typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined'&&
    (await VideoEncoder.isConfigSupported(settings).catch(()=>({supported:false}))).supported;
  if(supported){
   let error=null;const target=new ArrayBufferTarget();
   const mux=new Muxer({target,video:{codec:'avc',width,height,frameRate:fps},fastStart:'in-memory'});
   encoder=new VideoEncoder({output:(chunk,meta)=>mux.addVideoChunk(chunk,meta),error:e=>{error=e;}});
   encoder.configure(settings);
   for(let i=0;i<total;i++){
    if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');
    for(let j=0;j<4;j++)world.step();
    view.render(world.snapshot(),i/fps);
    const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
    encoder.encode(frame,{keyFrame:i%30===0});frame.close();
    if(error)throw error;
    if(i%6===0){onProgress(Math.round((i+1)*100/total));await new Promise(ok=>setTimeout(ok,0));}
    if(encoder.encodeQueueSize>12)await encoder.flush();
   }
   await encoder.flush();if(error)throw error;mux.finalize();
   const blob=new Blob([target.buffer],{type:'video/mp4'});
   if(blob.size<2000||String.fromCharCode(...new Uint8Array(await blob.slice(4,8).arrayBuffer()))!=='ftyp')throw Error('Invalid MP4 result');
   download(blob,slug+'.mp4');recorded=true;return {mime:'MP4',bytes:blob.size};
  }
  if(typeof MediaRecorder==='undefined'||typeof canvas.captureStream!=='function')throw Error('Video recording is unsupported here. Try Chrome.');
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  if(!MediaRecorder.isTypeSupported(mime))throw Error('No compatible video codec');
  const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],chunks=[];
  const rec=new MediaRecorder(stream,{mimeType:mime});
  const complete=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>resolve(new Blob(chunks,{type:mime}));rec.onerror=e=>reject(e.error||Error('Video recorder failed'));});
  try{
   rec.start();
   for(let i=0;i<total;i++){
    if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');
    for(let j=0;j<4;j++)world.step();
    view.render(world.snapshot(),i/fps);track.requestFrame?.();
    await new Promise(ok=>setTimeout(ok,34));
    if(i%6===0)onProgress(Math.round((i+1)*100/total));
   }
   rec.stop();const blob=await complete;if(blob.size<2000)throw Error('Empty video output');
   download(blob,slug+'.webm');recorded=true;return {mime:'WebM',bytes:blob.size};
  }finally{if(rec.state!=='inactive')rec.stop();stream.getTracks().forEach(t=>t.stop());}
 }finally{try{encoder?.close()}catch{}try{view?.dispose()}catch{}try{world.dispose()}catch{}}
}
function download(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);}
