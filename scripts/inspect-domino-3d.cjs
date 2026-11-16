'use strict';
const fs=require('node:fs'),path=require('node:path');
const f=path.resolve(__dirname,'..','extra/wget/ballengine.app/assets/index-3pf76ICO.js');
const a=fs.readFileSync(f,'utf8');
console.log('DOMINO_INSPECT_SIZE',a.length);
const keys=[
 'DOMINO_3D','domino3DCount','domino3DLayout','domino3DColor','domino3D',
 'Domino 3D','DOMINO_3D:', 'CIRCUIT_ROUND','domino3DGravity',
 'domino3DZoom','zoomIn','zoomOut','Zoom in','Zoom out','Camera zoom'
];
for(const k of keys){
 const pos=[];let ix=-1;
 while((ix=a.indexOf(k,ix+1))>=0&&pos.length<60)pos.push(ix);
 console.log('DOMINO_KEY',JSON.stringify({key:k,count:a.split(k).length-1,positions:pos}));
 for(const p of pos.slice(0,k==='DOMINO_3D'?10:k==='domino3DCount'?16:k==='domino3DLayout'?12:3)){
  console.log('DOMINO_CONTEXT',JSON.stringify({key:k,pos:p,before:a.slice(Math.max(0,p-750),p),after:a.slice(p,p+1400)}));
 }
}
