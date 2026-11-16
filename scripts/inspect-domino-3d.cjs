'use strict';
const fs=require('node:fs'),path=require('node:path');
const a=fs.readFileSync(path.resolve(__dirname,'..','extra/wget/ballengine.app/assets/index-3pf76ICO.js'),'utf8');
const samples=[
 ['renderer-init',9212490,3000,5400],
 ['runtime-mode-case',9501718,1600,5300],
 ['runtime-scene',9693792,2300,6200],
 ['renderer-ui',3755361,900,3500],
 ['camera-controls',1281996,500,1800],
 ['model-function',1862621,2500,2000]
];
for(const [key,pos,before,after] of samples)console.log('DOMINO_DETAIL '+JSON.stringify({key,pos,content:a.slice(pos-before,pos+after)}));
const terms=['domino3DFollowZoom','domino3DFollowCascade','domino3DColorMode','domino3DFollowFrameAll'];
for(const term of terms){
 let pos=-1,i=0;const p=[];
 while((pos=a.indexOf(term,pos+1))>=0)p.push(pos);
 console.log('DOMINO_TERM '+JSON.stringify({term,count:p.length,positions:p}));
 for(const pos of p.filter(x=>x>8500000).slice(0,12))console.log('DOMINO_LIVE '+JSON.stringify({term,pos,content:a.slice(pos-1000,pos+2200)}));
}
