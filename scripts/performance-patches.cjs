'use strict';

/*
 * Targeted patches for the ORIGINAL captured BallEngine JavaScript bundle.
 * Only adaptive display effects and preview rendering are changed here:
 *   - simulation bodies, collision detection, timing and impact sounds remain intact;
 *   - recording/offline exports always keep the original effects and DPR;
 *   - manual 3D sharpness settings retain their chosen resolution;
 *   - patches fail closed when a future original bundle changes its anchors.
 */
const patches=[
  {
    name:'budget cosmetic 2D collision particles and trails at sustained low FPS',
    before:'glowSprites(){return this.tier>=qRt}trailStride(){return 1}maxCollisionEffects(){return 1/0}collisionParticleScale(){return 1}light3D(){return this.tier>=fre}',
    after:'glowSprites(){return this.tier>=qRt}trailStride(){return this.tier>=fre?3:this.tier>=$U?2:1}maxCollisionEffects(){return this.tier>=fre?64:this.tier>=$U?160:1/0}collisionParticleScale(){return this.tier>=fre?.3:this.tier>=$U?.55:1}light3D(){return this.tier>=fre}'
  },
  {
    name:'disable optional 3D post-processing only during overloaded live playback',
    before:'mot=e=>{var t;return gBt(e)!=="OFF"&&(((t=vme())==null?void 0:t.postFX)??!0)}',
    after:'mot=e=>{var t;return gBt(e)!=="OFF"&&(a0()||Jx.tier<$U)&&(((t=vme())==null?void 0:t.postFX)??!0)}'
  },
  {
    name:'disable costly 3D shadow passes only during overloaded live playback',
    before:'bBt=e=>{var t;return(e.scene3DShadows??!1)&&(((t=vme())==null?void 0:t.shadows)??!0)}',
    after:'bBt=e=>{var t;return(e.scene3DShadows??!1)&&(a0()||Jx.tier<$U)&&(((t=vme())==null?void 0:t.shadows)??!0)}'
  },
  {
    name:'disable reflective 3D render passes only during overloaded live playback',
    before:'xZn=e=>{var t;return(e.scene3DReflections??!1)&&(((t=vme())==null?void 0:t.reflections)??!0)}',
    after:'xZn=e=>{var t;return(e.scene3DReflections??!1)&&(a0()||Jx.tier<$U)&&(((t=vme())==null?void 0:t.reflections)??!0)}'
  },
  {
    name:'reduce AUTO 3D preview pixel cost when the measured frame rate stays low',
    before:'const i=Math.max(o,Math.min(r,n))*nCt();return this.applied=i,i',
    after:'const beFpsScale=!a0()&&a==="AUTO"&&Jx.tier>=$U?.72:1,i=Math.max(.5,Math.max(o,Math.min(r,n))*nCt()*beFpsScale);return this.applied=i,i'
  },
  {
    name:'reduce multisampling and retina overdraw in supplemental 3D model inspector',
    before:'const G=new O.WebGLRenderer({antialias:!0,alpha:!1,powerPreference:"default"});G.setPixelRatio(Math.min(window.devicePixelRatio||1,2))',
    after:'const G=new O.WebGLRenderer({antialias:!(DP()||wc()),alpha:!1,powerPreference:"high-performance"});G.setPixelRatio((DP()||wc())?1:Math.min(window.devicePixelRatio||1,1.5))'
  },
  {
    name:'reduce 3D inspector shadow texture size on mobile/software GPUs',
    before:'q.shadow.mapSize.set(1024,1024)',
    after:'q.shadow.mapSize.set((DP()||wc())?512:1024,(DP()||wc())?512:1024)'
  },
  {
    name:'pause hidden 3D inspector and draw it at 30 FPS on touch devices',
    before:'const re=de=>{var fe;if(Y.disposed)return;Y.raf=requestAnimationFrame(re);const ie=Y.lastFrame?Math.min(.05,(de-Y.lastFrame)/1e3):.016;Y.lastFrame=de,Y.clock+=ie,Xns(Y,ie,c.current)',
    after:'const re=de=>{var fe;if(Y.disposed)return;Y.raf=requestAnimationFrame(re);if(document.hidden||(DP()||wc())&&Y.lastFrame&&de-Y.lastFrame<32)return;const ie=Y.lastFrame?Math.min(.05,(de-Y.lastFrame)/1e3):.016;Y.lastFrame=de,Y.clock+=ie,Xns(Y,ie,c.current)'
  }
];

function applyPerformancePatches(source){
  if(typeof source!=='string'||source.length===0)throw new TypeError('Expected captured JavaScript bundle');
  let out=source;
  for(const patch of patches){
    const first=out.indexOf(patch.before);
    if(first<0||out.indexOf(patch.before,first+patch.before.length)!==-1)
      throw new Error('Original bundle performance anchor missing or repeated: '+patch.name);
    if(out.includes(patch.after))
      throw new Error('Bundle already has performance patch: '+patch.name);
    out=out.slice(0,first)+patch.after+out.slice(first+patch.before.length);
  }
  return out;
}

module.exports={applyPerformancePatches,patches};
