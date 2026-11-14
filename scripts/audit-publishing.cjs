'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app','assets');
const files=['index-3pf76ICO.js',...fs.readdirSync(root).filter(x=>x.endsWith('.js')&&x!=='index-3pf76ICO.js')];
const terms=[
  'Publish (7)','Publish to','Schedule','schedule','automation','Automation','publishing','Publishing','post to',
  'Scheduled posts','Publish project','Content pipeline','/api/publish','/api/schedule','/api/automation',
  '/api/social','/api/posts','/api/exports','/api/videos','/api/connections',
  'TikTok','YouTube','Instagram','Share video','Download MP4','Post now','Calendar','Publishing queue'
];
const results={files:files.length,matches:[]};
for(const file of files){
 const p=path.join(root,file);if(fs.statSync(p).size>30000000)continue;
 const text=fs.readFileSync(p,'utf8');
 for(const term of terms){
   let offset=0,n=0;const positions=[];
   while((offset=text.indexOf(term,offset))!==-1&&positions.length<10){
     const start=Math.max(0,offset-440),end=Math.min(text.length,offset+650);
     positions.push({offset,context:text.slice(start,end)});
     offset+=term.length;
   }
   if(positions.length)results.matches.push({file,term,positions});
 }
}
for(const item of results.matches)console.log('PUBLISH_AUDIT '+JSON.stringify(item));
console.log('PUBLISH_SUMMARY '+JSON.stringify({files:results.files,termCount:results.matches.length}));
