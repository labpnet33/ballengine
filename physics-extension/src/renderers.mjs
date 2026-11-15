const TAU=Math.PI*2;
export function drawZigzag(canvas,world,options,time=0){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#061026');bg.addColorStop(.6,'#0b1635');bg.addColorStop(1,'#210825');c.fillStyle=bg;c.fillRect(0,0,w,h);
 const bpm=options.bpm||120,pulse=(1+Math.sin(time*bpm/60*TAU))/2;
 for(let i=0;i<65;i++){c.fillStyle='rgba(135,226,255,'+(.08+.18*Math.sin(i*20+time*.2)**2)+')';c.fillRect((i*71.37)%w,(i*271.7)%h,2,2);}
 const scale=Math.min(w*.90/16,h*.78/12),ox=(w-16*scale)/2,oy=(h-12*scale)/2;
 c.save();c.lineCap='round';
 world.rails.forEach((rail,i)=>{
  c.beginPath();c.moveTo(ox+rail.x1*scale,oy+rail.y1*scale);c.lineTo(ox+rail.x2*scale,oy+rail.y2*scale);
  c.strokeStyle=i%2?'#e842d0':'#11ccec';c.lineWidth=Math.max(2,scale*.09);c.shadowColor=c.strokeStyle;c.shadowBlur=options.glow?22+pulse*8:0;c.stroke();
  c.strokeStyle='#ecfdff';c.lineWidth=1.7;c.shadowBlur=0;c.stroke();
 });
 const colors=['#56edff','#fa5ad7','#ffe375','#a7ff7b','#bba0ff','#ffba6c'];
 world.snapshot().forEach((ball,i)=>{
  const x=ox+ball.x*scale,y=oy+ball.y*scale,r=Math.max(4,scale*.17);
  const g=c.createRadialGradient(x-r*.25,y-r*.4,0,x,y,r*1.2);g.addColorStop(0,'#ffffff');g.addColorStop(.3,colors[i%colors.length]);g.addColorStop(1,'#2035a1');
  c.fillStyle=g;c.shadowColor=colors[i%colors.length];c.shadowBlur=options.glow?27:0;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
 });c.restore();
 c.textAlign='center';c.fillStyle='#e9fdff';c.font='bold '+Math.max(19,Math.round(w*.05))+'px system-ui';c.fillText('NEON ZIGZAG',w/2,h*.09);
 c.font=Math.max(13,Math.round(w*.024))+'px system-ui';c.fillStyle='#76edff';c.fillText('BEAT RAIL   '+bpm+' BPM',w/2,h*.12);
 c.fillStyle='#4beaff';c.fillRect(w*.22,h*.14,w*.56*pulse,3);
}
export function drawPrismFallback(canvas,world,options){
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 c.fillStyle='#0b1228';c.fillRect(0,0,w,h);const data=world.snapshot(),step=Math.min(w*.82/Math.max(5,data.length),32),left=(w-data.length*step)/2;
 data.forEach((b,i)=>{const p=b.position,q=b.rotation,x=left+i*step,y=h*.67-p.y*step;
  c.save();c.translate(x,y);c.rotate(2*Math.atan2(q.z,q.w));c.fillStyle='hsl('+((i*19+195)%360)+' 90% 65%)';c.shadowColor=c.fillStyle;c.shadowBlur=options.glow?15:0;c.fillRect(-step*.27,-step*2,step*.54,step*4);c.restore();
 });
 c.fillStyle='#e9fdff';c.font='bold '+Math.max(18,w*.04)+'px system-ui';c.textAlign='center';c.fillText('PRISM CHAIN REACTION',w/2,h*.1);
}
export async function makePrismRenderer(canvas,world,options){
 const T=await import('three');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.setSize(canvas.width,canvas.height,false);
 const s=new T.Scene();s.background=new T.Color('#080e21');
 const center=(options.prismCount-1)*options.spacing/2-3,extent=options.prismCount*options.spacing,dist=Math.max(14,extent*1.2);
 const camera=new T.PerspectiveCamera(45,canvas.width/canvas.height,.1,1000);
 camera.position.set(center+dist*.2,dist*.6,dist);camera.lookAt(center,.6,0);
 s.add(new T.HemisphereLight(0x9edaff,0x3b1548,2.6));
 const light=new T.PointLight(0xa879ff,180,Math.max(20,dist*4));light.position.set(center,9,6);s.add(light);
 const planeG=new T.PlaneGeometry(Math.max(24,extent+10),16),planeM=new T.MeshStandardMaterial({color:0x172b42,metalness:.5,roughness:.35});
 const floor=new T.Mesh(planeG,planeM);floor.rotation.x=-Math.PI/2;floor.position.set(center,-.18,0);s.add(floor);
 const geo=new T.BoxGeometry(.24,1.6,.6),mat=new T.MeshStandardMaterial({color:0xffffff,metalness:.54,roughness:.2});
 const mesh=new T.InstancedMesh(geo,mat,options.prismCount);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
 for(let i=0;i<options.prismCount;i++)mesh.setColorAt(i,new T.Color().setHSL((.55+i/options.prismCount*.80)%1,.9,.58));mesh.instanceColor.needsUpdate=true;s.add(mesh);
 const dummy=new T.Object3D();let closed=false;
 return {
  render(snapshot=world.snapshot(),time=0){
   if(closed)return; snapshot.forEach((b,i)=>{if(i>=options.prismCount)return;dummy.position.set(b.position.x,b.position.y,b.position.z);dummy.quaternion.set(b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.w);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
   mesh.instanceMatrix.needsUpdate=true;if(options.orbit){camera.position.x=center+Math.sin(time*.25)*dist*.25;camera.lookAt(center,.6,0);}
   light.intensity=options.glow?170:65;renderer.render(s,camera);
  },
  dispose(){if(closed)return;closed=true;geo.dispose();mat.dispose();planeG.dispose();planeM.dispose();renderer.dispose();}
 };
}
