'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','extra','wget','ballengine.app','assets');
const files=['index-3pf76ICO.js'];
const apiExpr=/\/api\/(?:autopilot|automation|scheduler|brands|social|youtube|tiktok|meta|instagram|facebook|videos|video-export|published|content|jobs|platforms|connections)(?:[a-zA-Z0-9_\-\/?=&.$\x7b\x7d]*)/g;
const markers=['Publishing to {platforms} now','Publishing and scheduling come','Scheduled posts waiting','Schedule Post','Schedule posts','Publish now','Publish (7)','Publishing','Create draft','Queue a post','Auto post','Set up Autopilot','No scheduled videos'];
for(const file of files){
 const full=path.join(root,file);
 const code=fs.readFileSync(full,'utf8');let match;
 const byEndpoint=new Map();
 while((match=apiExpr.exec(code))){
   const endpoint=match[0].slice(0,130),family=endpoint.split('/').slice(0,4).join('/');
   if(!byEndpoint.has(family))byEndpoint.set(family,[]);
   const xs=byEndpoint.get(family);
   if(xs.length<25)xs.push({at:match.index,endpoint,snippet:code.slice(Math.max(0,match.index-410),Math.min(code.length,match.index+980))});
 }
 for(const [family,xs] of byEndpoint){
   console.log('AUDIT_PUBLISH_API '+JSON.stringify({file,family,totalShown:xs.length,
    examples:xs.slice(0,16).map(x=>({...x,snippet:x.snippet.slice(0,1100)}))}));
 }
 for(const term of markers){
   const start=code.indexOf(term,5500000);if(start<0)continue;
   console.log('AUDIT_PUBLISH_UI '+JSON.stringify({file,term,at:start,context:code.slice(Math.max(0,start-900),start+1400)}));
 }
}
