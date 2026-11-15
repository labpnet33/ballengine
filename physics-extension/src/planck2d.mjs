import { FIXED_DT, ImpactEvents, validateOptions } from './core.mjs';

// Keep the same simulation state API as the 3D adapter.
export const zigzagSpec = Object.freeze({
  ballCount: { type: 'integer', min: 1, max: 80, default: 3 },
  gravity: { type: 'number', min: 0, max: 30, default: 12 },
  bounce: { type: 'number', min: 0, max: 1, default: 0.82 },
  railCount: { type: 'integer', min: 2, max: 16, default: 7 },
  tilt: { type: 'number', min: 0.03, max: 0.5, default: 0.16 }
});

/** First proposed mode: neon zigzag beat rail. Y-axis grows downward. */
export async function createZigzagWorld(config = {}) {
  // Intentional lazy import; the existing 45 modes do not load Planck.
  const pkg = await import('planck');
  const p = pkg.default ?? pkg;
  const options = validateOptions(config, zigzagSpec);
  const world = new p.World(p.Vec2(0, options.gravity));
  const impact = new ImpactEvents({ minImpulse: 0.2, cooldownTicks: 8 });
  const rails = [];
  let tick = 0;
  function rail(x1,y1,x2,y2) {
    const body = world.createBody();
    body.createFixture(p.Edge(p.Vec2(x1,y1),p.Vec2(x2,y2)), { friction: 0.18, restitution: options.bounce });
    rails.push({ x1,y1,x2,y2 });
  }
  rail(0,0,0,12); rail(16,0,16,12); rail(0,11.8,16,11.8);
  for (let i = 0; i < options.railCount; i++) {
    const y = 2 + i * (8.6 / options.railCount);
    const descendingRight = i % 2 === 0;
    const x1 = descendingRight ? 0.8 : 15.2;
    const x2 = descendingRight ? 15.2 : 0.8;
    rail(x1, y, x2, y + options.tilt * 14.4);
  }
  const balls = [];
  for (let i = 0; i < options.ballCount; i++) {
    const body = world.createDynamicBody(p.Vec2(3 + (i%9)*0.35, 0.6 - Math.floor(i/9)*0.6));
    body.setUserData({id:'ball-'+i});
    const fixture = body.createFixture(p.Circle(0.17), {density:1, friction:0.06, restitution:options.bounce});
    fixture.setUserData?.({id:'ball-'+i});
    balls.push(body);
  }
  world.on('post-solve',(contact, impulse)=>{
    const bodyA=contact.getFixtureA().getBody(),bodyB=contact.getFixtureB().getBody();
    const idA=bodyA.getUserData()?.id ?? 'rail', idB=bodyB.getUserData()?.id ?? 'rail';
    if(idA==='rail' && idB==='rail') return;
    const force=Math.max(0,...(impulse.normalImpulses || []));
    impact.add(idA,idB,force,tick);
  });
  return {
    kind:'planck-2d',options,rails,
    step() { tick++; world.step(FIXED_DT, 8, 3); },
    snapshot() { return balls.map((b,i)=>({id:'ball-'+i,x:b.getPosition().x,y:b.getPosition().y,angle:b.getAngle()})); },
    drainContacts() { return impact.drain(); },
    setOption(name,value) {
      if(name==='gravity') {
        const updated=validateOptions({...options,gravity:value},zigzagSpec);
        options.gravity=updated.gravity;world.setGravity(p.Vec2(0,value));return;
      }
      throw new Error('Option '+name+' requires rebuilding scene to maintain stable collisions');
    },
    dispose(){ impact.clear(); balls.length=0; }
  };
}
