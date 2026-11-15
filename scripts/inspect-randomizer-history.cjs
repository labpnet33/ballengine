'use strict';
const fs=require('node:fs'),path=require('node:path');
const f=path.resolve(__dirname,'..','extra','wget','ballengine.app','assets','index-3pf76ICO.js');
const s=fs.readFileSync(f,'utf8');
for(const mode of ['RHYTHMIC','PHONK_DROP','DRUM_SORT','METABALLS','CROWD_EVACUATION','FLOW_FIELD','WAVE_3D','MAGNET_3D','BLOOM']){
 const keys=[mode+':{','QP.'+mode+'={','mode:"'+mode+'"'];
 const matches=keys.flatMap(needle=>{
   let i=-1,all=[];while((i=s.indexOf(needle,i+1))>=0&&all.length<5)all.push({needle,at:i,context:s.slice(Math.max(0,i-180),i+1050)});
   return all;
 });
 console.log('HISTORY_QP_MODE '+JSON.stringify({mode,matches:matches.slice(0,6)}));
}
for(const phrase of ['Previous roll','Next roll','randomizeHistory','randomizationHistory','randomizeRolls','rollHistory','randomizeChangeMode','canRollBack','rollBack:','rollBack(','canRollForward','randomizeOnly:']){
 const at=s.indexOf(phrase);console.log('HISTORY_UI_CONTEXT '+JSON.stringify({phrase,index:at,context:at>=0?s.slice(at-850,at+1500):''}));
}