'use strict';
/**
 * Read/write integration test for independent Cloudflare guest project saves.
 * A new random library key is generated per run; test project is deleted.
 * Never prints the recovery key.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const endpoint='https://ballengine-project-saves.labpnet33.workers.dev';
const origin='https://ballengine.vercel.app';
const key='be1_'+crypto.randomBytes(32).toString('base64url');
const other='be1_'+crypto.randomBytes(32).toString('base64url');
let createdId=null;
async function api(route,method='GET',body,token=key){
  const response=await fetch(endpoint+route,{method,signal:AbortSignal.timeout(20000),headers:{
    Origin:origin,Authorization:'Bearer '+token,
    ...(body===undefined?{}:{'Content-Type':'application/json'})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  const content=await response.text();
  let data;
  try{data=JSON.parse(content);}catch{data={invalidResponse:content.slice(0,250)};}
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin,'CORS origin not allowed');
  return {status:response.status,data};
}
async function main(){
  const ready=await fetch(endpoint+'/health',{signal:AbortSignal.timeout(20000)});
  assert.equal(ready.status,200,'Cloudflare Worker health unavailable');
  const health=await ready.json();
  assert.equal(health.ok,true);
  const preflight=await fetch(endpoint+'/api/saves',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(20000)});
  assert.equal(preflight.status,204,'CORS preflight failed');
  const config={mode:'RHYTHMIC',numBalls:7,ballColor:'#12abcd',testMarker:'cloud-saves-e2e'};
  try{
    const create=await api('/api/saves','POST',{name:'CI Project',config,isDefault:false,scope:'personal'});
    assert.equal(create.status,201,'Create save failed: '+JSON.stringify(create.data));
    createdId=create.data.id;
    assert.match(createdId,/^[0-9a-f-]{36}$/i);
    const list=await api('/api/saves?limit=20');
    assert.equal(list.status,200);
    assert.equal(list.data.total,1);
    assert.equal(list.data.saves[0].id,createdId);
    const read=await api('/api/saves/'+createdId);
    assert.equal(read.status,200);
    assert.deepEqual(read.data.config,config,'Cloud project config was corrupted');
    const version=await api('/api/saves/check-version?id='+createdId);
    assert.equal(version.status,200);
    assert.equal(version.data.version,1);
    const hidden=await api('/api/saves?limit=20','GET',undefined,other);
    assert.equal(hidden.data.total,0,'Cross-library data leak detected');
    const foreign=await api('/api/saves/'+createdId,'GET',undefined,other);
    assert.equal(foreign.status,404,'Other library was able to read this project');
    const renamed=await api('/api/saves/'+createdId,'PUT',{name:'Renamed CI Project',isDefault:true});
    assert.equal(renamed.status,200,'Rename/default failed: '+JSON.stringify(renamed.data));
    const overwrite=await api('/api/saves/'+createdId,'PUT',{config:{...config,numBalls:12}});
    assert.equal(overwrite.status,200,'Overwrite failed: '+JSON.stringify(overwrite.data));
    assert.equal(overwrite.data.version,2,'Revision not incremented');
    const reload=await api('/api/saves/'+createdId);
    assert.equal(reload.data.config.numBalls,12);
    assert.equal(reload.data.isDefault,true);
    const revisions=await api('/api/saves/versions/'+createdId);
    assert.equal(revisions.status,200);
    assert.ok((revisions.data.versions||[]).length>=1,'Project revision was not recorded');
    const usage=await api('/api/storage/usage');
    assert.equal(usage.status,200);
    assert.equal(usage.data.total_saves,1);
    console.log('CLOUD_SAVE_API_PASS',JSON.stringify({create:true,list:true,read:true,version:true,isolation:true,rename:true,overwrite:true,revisions:true,storage:true}));
  }finally{
    if(createdId){
      const deleted=await api('/api/saves/'+createdId,'DELETE');
      assert.equal(deleted.status,200,'CI project cleanup failed');
      const after=await api('/api/saves?limit=20');
      assert.equal(after.data.total,0,'CI project still present after deletion');
    }
  }
}
main().catch(e=>{console.error('CLOUD_SAVE_API_FAILURE',e.message);process.exitCode=1;});
