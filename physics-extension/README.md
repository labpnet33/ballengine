# Physics extension for the original BallEngine

**Prototype integration only; no legacy mode or original UI is replaced.**

The current production Studio is a captured static/minified browser bundle. These self-contained adapters are the correct first step before exposing new modes through its original UI: they do not patch the 45 existing mode registries, override canvas, change export, modify auth or introduce new pages.

## Engines installed (separate Node package)

- Planck.js 1.5.1 (MIT) — 2D rigid bodies, rails, collisions.
- Rapier 3D compat 0.21.0 (Apache-2.0) — WASM 3D contacts and bodies.
- Three.js 0.187.0 (MIT) — optional instanced 3D rendering.

```bash
cd physics-extension
npm install --ignore-scripts --no-audit --no-fund
npm test
```

The two **executable prototypes** are `neon-zigzag` and `prism-chain`:
```js
import { launchPrototype } from './src/registry.mjs';
import { PhysicsClock } from './src/core.mjs';
const sim = await launchPrototype('neon-zigzag',{ballCount:3},{enabled:true});
const clock = new PhysicsClock();
clock.advance(1/60,()=>sim.step());
console.log(sim.snapshot(),sim.drainContacts());
sim.dispose();
```

The opt-in adapter contract is `step()`, `snapshot()`, `drainContacts()`, `setOption(name,value)`, `dispose()`. Unknown options and changes that require rebuilding an initialized world are explicitly rejected instead of silently losing settings. Impact queues include cooldowns for short per-collision ding effects.

### Release gates

1. Physics package tests (including an actual browser-compatible Rapier WASM initialization).
2. Existing original Studio build and 45-mode registry regression on the same branch.
3. Review adapter integration with original mode-specific controls and randomization/undo/redo. Avoid fragile global DOM injection or a second Studio page.
4. Capture audio/video and high-load performance testing on desktop, then Android. Verify MP4 decoding and seek, not only file headers.
5. Only enable new mode entry in original UI after integration tests pass. Leave the default gate **off** until then.
6. No production merge/deployment without owner approval.

### Known gaps

Prototypes have physics state and contacts but are not yet selectable from the original 45-mode Studio UI. They are **not** claimed as finished browser modes, and do not inherit existing audio, Randomize or MP4 features until the original app's mode shell is wired and verified. Rapier local determinism should not be confused with cross-platform bitwise determinism.
