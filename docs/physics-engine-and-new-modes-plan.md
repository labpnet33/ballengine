# BallEngine simulation physics and new mode plan (preview-only)
Date: 2026-11-15

## Baseline and guardrails
- Existing original site: 18 established modes + 27 released native experimental modes; do not replace the existing Studio, Home cards, UI, or controls.
- Source currently contains a captured, minified browser bundle and build-time transformations rather than clean per-engine application source. **Do not directly replace all 45 physics engines** or inject unverified third-party scripts into the minified bundle.
- Production remains untouched. Implement only on a development branch, with fixed-seed screenshots, behavior assertions, MP4 export tests, and Android/desktop test gates.
- Prior controls CI: 24/27 passed; Slice 3D and Drum 3D Randomize click timeouts, Flood 3D undo history unavailable. Domino 3D 2s export exceeds 270s on software GPU.

## Open-source candidates and intended use

| Library | Role | Integration rationale | Caution |
| --- | --- | --- | --- |
| [Rapier 2D/3D](https://rapier.rs/) | WASM rigid bodies, colliders, contacts, joints | Prefer for new 3D rigid-body scenes and optional isolated migration; fixed-step physics enables replay | Must initialize WASM; measure load time on Android; do not change existing deterministic scenes silently; Apache-2.0 |
| [Planck.js](https://github.com/piqnt/planck.js) | Box2D-style 2D collision solver | Good for marble and chain-reaction prototypes with accurate contacts, friction and restitution | Separate integration adapter; MIT |
| [Matter.js](https://github.com/liabru/matter-js) | 2D rigid bodies and events | Fastest way to prototype satisfying 2D demos and inspect contacts | Test accuracy at high speeds; MIT |
| [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | Render many similar 3D objects | Can reduce draw calls for Domino, Plinko, crystals and particles | Does not solve CPU/WebGL readPixels bottleneck or replace physics |
| [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js) | Alternative WASM 3D rigid-body solver | Benchmark only if Rapier fails a representative scene | Bigger integration surface; MIT |

Dependency versions must be pinned, attribution/licenses reviewed, and bundled locally rather than loaded from an untrusted CDN at runtime.

## Architecture for an isolated proof of concept
1. Keep a mode adapter boundary: `create(config, seed)`, `step(fixedDt)`, `setOption(name, value)`, `getBodies()`, `drainContacts()`, `snapshot()`, `dispose()`.
2. Use fixed physics ticks (e.g. 1/120s with capped substeps) and render interpolation. Never vary the simulation result based on frame rate.
3. For new sound effects, emit impact events with deduplication and cooldown; assign sound using contact impulse and surface category, not per-frame overlap.
4. Use seeded randomness and stable ordering for reproducible video export, with collision assertions against tunneling, resting jitter, and explosive overlaps.
5. Before any Domino optimization, profile **physics step**, **WebGL draw**, **readPixels**, and **MP4 encode** separately. Prior CI logs show SwiftShader `GPU stall due to ReadPixels`; a different physics library alone cannot fix that.
6. Benchmark native WebCodecs, worker/offscreen rendering where supported, chunked encoding and lower-quality previews; preserve 1080p output fidelity and desktop compatibility.
7. Use separate mobile and desktop performance profiles, object-count limits, and runtime warnings rather than silently changing selected project settings.

## New high-impact satisfying modes (proposals; not implemented)

| Concept | Distinct visual interaction | Suggested technology and user controls |
| --- | --- | --- |
| **Neon Zigzag Beat Rail** | Three glowing balls bounce between alternating zigzag rails, impacts snap to beat markers and create short dings and trails | Planck 2D / Rapier 2D; beat quantization, lane angle, bounce energy, trails, glow, object count |
| **Prism Chain Reaction** | Rigid colored crystal prisms topple/shatter into a cascading rainbow, with timed shockwaves | Rapier 3D + Three.js instancing; prism count, arrangement, shockwave delay, impact force, color palette |
| **Magnetic Mandala** | Hundreds of magnetic beads form evolving flower/mandala patterns and ring colliders; smooth color transitions | GPU instanced particles + analytic attractors; symmetry, pole strength, ring spacing, speed, glow |
| **Marble Paint Symphony** | Rolling marbles paint colorful paths across rotating tracks; collisions create musical ticks | Planck 2D; paint brush width, track generation, palette, sound set, beat-snap, trail fade |
| **Kinetic Gear Bloom** | Interlocking gears guide tiny balls through layered paths, each bounce lights the next segment | 2D joints and contact events; gear size/count, RPM, friction, ball count, progression |
| **Bubble Pop Cascade** | Transparent bubbles pack tightly and trigger rippling pop chains with sparkles and fluid-like highlights | Custom lightweight contact/packing simulation plus instanced shaders; bubble radius, density, pop trigger, refractive style |

## Required acceptance before calling a new mode complete
- Native selection works from existing Home -> Studio and does not add a replacement page.
- All mode-specific options have behavior (not just controls), Randomize/undo/redo and reset remain consistent.
- Animation and collisions work for 60 seconds with no JS errors at typical and stress settings.
- Export MP4 validates the ftyp header and decodes with sound (where configured) at 15s and 30s.
- Manual Android Chrome + desktop Chrome/Firefox validation, mobile fallback at realistic object loads.
- No production deploy without explicit approval.
