'use strict';
const fs=require('fs'),path=require('path');
const f=path.resolve(__dirname,'../extra/wget/ballengine.app/assets/index-3pf76ICO.js');
const s=fs.readFileSync(f,'utf8');
const patterns=[
 '/api/saves','/api/library','/api/studio/saves','/api/studio/projects',
 'Save project','Save preset','Save as','My saves','Your saves','Load save',
 'Autosave','autoSave','localStorage','indexedDB',
 'Save failed','Couldn\\x27t save','Save to cloud','Cloud saves','Save to library',
 'LibraryService','Saves',
];
console.log('SOURCE_LENGTH',s.length);
for(const term of patterns){
  let at=0,n=0;
  while((at=s.indexOf(term,at))>=0&&n<12){
    console.log('AUDIT_SNIPPET',JSON.stringify({term,num:n,pos:at,before:s.slice(Math.max(0,at-1100),at),after:s.slice(at+term.length,at+term.length+1350)}));
    at+=term.length;n++;
  }
  console.log('AUDIT_TERM_SUMMARY',JSON.stringify({term,matchesCaptured:n}));
}

const regions=[
 ['save-service',2995700,3012900],
 ['save-ui',6712000,6756000],
 ['local-save-service',2924000,2990000]
];
for(const [name,start,end] of regions){
  const slice=s.slice(start,end);
  for(let off=0;off<slice.length;off+=5000){
    console.log('AUDIT_DETAIL',JSON.stringify({name,at:start+off,content:slice.slice(off,off+5000)}));
  }
}
