'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const built=path.join(root,'extra/wget/ballengine.app/assets/index-3pf76ICO.js');
const original=path.join(root,'captures/studio-browser/ballengine.app/assets/index-3pf76ICO.js');
const text=fs.readFileSync(fs.existsSync(original)?original:built,'utf8');
const names=[
  'rhythmic','escape','drawer','spawner','ghost-escape','breaker','glass-tower','flag-battle','weapon-battle','merge-evolution','glass-rush','grid-merge','wave-3d','marble-run-3d','ball-crush','jelly-3d','cut-count','magnet',
  'phase-bloom','phonk-drop','marble-run','ball-race','target-hit','falling-sand','plinko','color-match','spin-battle','lava-survival','glass-slice','flood-fill','eulers-disk','drum-sort','plinko-3d','chladni','voxel','domino-3d','marble-race-3d','attractor','flow-field','metaballs','galaxy','fireflies','pendulum-basin','slime','crowd-evacuation'
];
const active=new Set(names.slice(0,18));
const entries=[];
for(const slug of names){
  const needle='slug:"'+slug+'"',idx=text.indexOf(needle);
  const left=idx===-1?-1:text.lastIndexOf('{mode:',idx);
  const right=left<0?-1:text.indexOf('}',idx);
  const info=left>=0&&right>=0&&right-left<2500?text.slice(left,right+1):'';
  const settingsKeys=Array.from(info.matchAll(/(?:label|kind|group|status|mode|slug|name|category|description|tier|access|default|supports|engine):(?:"([^"]+)"|([a-zA-Z0-9.]+))/g)).slice(0,45).map(m=>[m[0].split(':')[0],m[1]||m[2]]);
  entries.push({slug,category:active.has(slug)?'established':'experimental',registryAt:idx,entryLength:info.length,entry:info.slice(0,1600),settingsKeys});
}
const files=fs.readdirSync(path.join(root,'extra/wget/ballengine.app/assets'));
const imageAssets=files.filter(n=>/\.(png|webp|avif|svg|jpe?g)$/i.test(n));
const missingRefs=['bloodshot.face-DQdTiO_Y.webp','bloodshot.hands-BmzUMEQm.webp'].map(name=>({name,present:files.includes(name),references:text.split(name).length-1}));
console.log('MODE_REGISTRY_AUDIT '+JSON.stringify({bundleBytes:text.length,registryEntries:entries,images:imagesAssetsSample(),missingRefs}));
function imagesAssetsSample(){
 return {count:imageAssets.length,face:imageAssets.filter(x=>/face/i.test(x)).slice(0,35),hands:imageAssets.filter(x=>/hands/i.test(x)).slice(0,35),bloodshot:imageAssets.filter(x=>/bloodshot/i.test(x)).slice(0,15)};
}
