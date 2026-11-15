import { FIXED_DT, ImpactEvents, validateOptions } from './core.mjs';

export const prismSpec = Object.freeze({
  prismCount: { type:'integer', min:2, max:700, default:32 },
  gravity: { type:'number', min:0, max:30, default:9.81 },
  restitution: { type:'number', min:0, max:0.9, default:0.08 },
  spacing: { type:'number', min:0.3, max:1.6, default:0.55 }
});

/** 3D rigid-body chain prototype, no changes to legacy Domino mode. */
export async function createPrismWorld(config = {}) {
  const m = await import('@dimforge/rapier3d-compat');
  const R = m.default ?? m;
  await R.init();
  const options=validateOptions(config,prismSpec);
  const world=new R.World({x:0,y:-options.gravity,z:0});
  world.timestep=FIXED_DT;
  const queue=new R.EventQueue(true);
  const contacts=new ImpactEvents({minImpulse:0.1,cooldownTicks:9});
  const colliderOwners=new Map();
  const bodies=[];
  const floor=world.createCollider(R.ColliderDesc.cuboid(options.prismCount*options.spacing/2+5,.2,3)
    .setTranslation(options.prismCount*options.spacing/2-3,-.2,0)
    .setFriction(.7));
  colliderOwners.set(floor.handle,'floor');
  for(let i=0;i<options.prismCount;i++) {
    const x=i*options.spacing-3;
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,.83,0).setCcdEnabled(true));
    const collider=world.createCollider(R.ColliderDesc.cuboid(.12,.8,.3)
      .setFriction(.65).setRestitution(options.restitution)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),body);
    colliderOwners.set(collider.handle,'prism-'+i);
    bodies.push(body);
  }
  // Trigger the chain via a physical impulse, not a kinematic teleport.
  bodies[0].applyTorqueImpulse({x:0,y:0,z:-2},true);
  let tick=0;
  return {
    kind:'rapier-3d',options,
    step() {
      tick++;
      world.step(queue);
      queue.drainCollisionEvents((a,b,started)=>{
        if(started) contacts.add(colliderOwners.get(a)??a,colliderOwners.get(b)??b,1,tick);
      });
    },
    snapshot(){return bodies.map((b,i)=>({
      id:'prism-'+i,
      position:{...b.translation()},
      rotation:{...b.rotation()}
    }));},
    drainContacts(){return contacts.drain();},
    setOption(name,value){
      if(name==='gravity'){
        const updated=validateOptions({...options,gravity:value},prismSpec);
        options.gravity=updated.gravity;
        world.gravity={x:0,y:-value,z:0};
        return;
      }
      throw new Error('Option '+name+' requires rebuilding scene to preserve physical consistency');
    },
    dispose(){contacts.clear();queue.free();world.free();bodies.length=0;}
  };
}

/** Optional rendering adapter. No WebGL context is created until called. */
export async function createPrismMesh(count){
  if(!Number.isInteger(count)||count<1)throw new RangeError('count');
  const THREE=await import('three');
  const geometry=new THREE.BoxGeometry(.24,1.6,.6);
  const material=new THREE.MeshStandardMaterial({color:0x88ccff,metalness:.4,roughness:.17});
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  const dummy=new THREE.Object3D();
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return {
    mesh,
    sync(snapshot){
      for(let i=0;i<Math.min(snapshot.length,count);i++){
        const b=snapshot[i];
        dummy.position.set(b.position.x,b.position.y,b.position.z);
        dummy.quaternion.set(b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.w);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    },
    dispose(){geometry.dispose();material.dispose();}
  };
}
