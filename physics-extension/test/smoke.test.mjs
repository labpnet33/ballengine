import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsClock,ImpactEvents,validateOptions,FIXED_DT} from '../src/core.mjs';
import {findPrototype,launchPrototype,newModePrototypes} from '../src/registry.mjs';

test('fixed timestep produces bounded finite ticks',()=>{
  let n=0; const clock=new PhysicsClock();
  for(let i=0;i<20;i++)clock.advance(1/60,()=>n++);
  assert.equal(n,40);
  assert.equal(clock.ticks,n);
  assert.equal(FIXED_DT,1/120);
  assert.ok(clock.advance(1,()=>{}).steps<=12);
  assert.throws(()=>clock.advance(-1,()=>{}),RangeError);
});
test('impact events deduplicate the same contact pair and throttle sound',()=>{
 const q=new ImpactEvents({minImpulse:.2,cooldownTicks:6});
 assert.equal(q.add('ball','wall',.9,1),true);
 assert.equal(q.add('wall','ball',.8,2),false);
 assert.equal(q.add('ball','wall',.7,7),true);
 assert.equal(q.drain().length,2);
 assert.equal(q.drain().length,0);
});
test('new mode registry never overwrites a legacy mode',()=>{
 assert.equal(newModePrototypes.length,2);
 assert.ok(newModePrototypes.every(x=>x.status==='prototype'));
 assert.ok(!findPrototype('rhythmic'));
 assert.ok(!findPrototype('domino-3d'));
 assert.ok(findPrototype('neon-zigzag'));
});
test('feature gate refuses new mode by default',async()=>{
 await assert.rejects(()=>launchPrototype('neon-zigzag'),/disabled/);
});
test('spec validation rejects invalid physical parameters',()=>{
 assert.throws(()=>validateOptions({count:30},{count:{type:'integer',min:1,max:5,default:3}}),RangeError);
});
test('Planck 2D integration changes ball positions with fixed steps',async()=>{
 const scene=await launchPrototype('neon-zigzag',{ballCount:3,railCount:6},{enabled:true});
 try{
  const before=scene.snapshot();
  for(let i=0;i<120;i++)scene.step();
  const after=scene.snapshot();
  assert.equal(after.length,3);
  assert.ok(after.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)));
  assert.ok(after.some((x,i)=>Math.abs(x.y-before[i].y)>.01));
  scene.setOption('gravity',10);
  assert.equal(scene.options.gravity,10);
 }finally{scene.dispose();}
});
test('Rapier WASM 3D integration simulates finite rigid bodies',async()=>{
 const scene=await launchPrototype('prism-chain',{prismCount:12},{enabled:true});
 try {
  const before=scene.snapshot();
  for(let i=0;i<180;i++)scene.step();
  const after=scene.snapshot();
  assert.equal(after.length,12);
  assert.ok(after.every(x=>Number.isFinite(x.position.x)&&Number.isFinite(x.rotation.w)));
  assert.ok(after.some((x,i)=>Math.abs(x.rotation.z-before[i].rotation.z)>.001 || Math.abs(x.position.y-before[i].position.y)>.001));
  scene.setOption('gravity',6);
  assert.equal(scene.options.gravity,6);
 }finally{scene.dispose();}
});
