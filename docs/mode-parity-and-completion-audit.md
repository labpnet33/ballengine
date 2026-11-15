# BallEngine: 18 established modes vs. 27 experimental modes
Audit performed 15 November 2026 on the original captured React/JavaScript app.

## Key result
The 27 experimental entries **already contain genuine simulation renderers and mode-specific controls** in the captured 14 MB browser bundle. Promoting `status:"development"` to `"live"` exposes them but does not finish their behavior. The work here audits the real implementation and repairs independently verified parity gaps; it does **not** reimplement 27 independent physics engines or claim proof of every setting combination.

## Architecture found by reverse engineering

1. **Mode registry and navigation**: objects with `mode`, `slug`, metadata and release `status` drive the original Home cards, Studio mode selection, 2D/3D classification and initial config. Build-time controlled registry transformation preserves the original React UI. The release can be reverted at build time with `BALLENGINE_RELEASE_EXPERIMENTAL=0`.
2. **Common Studio shell**: one shared Play/Pause, Reset, Randomize, Save/Load, Audio, Video, Publish and Record UI. The shared settings panel reads the active engine-specific configuration. A mode can render even when one of these shared actions lacks a configuration schema.
3. **Mode-specific option models**: both groups expose per-engine sliders, selects, toggles and defaults. Most experimental settings are already editable and affect the current config; their existence does not prove every edge case of the physics engine.
4. **Simulation renderer**: real canvas updates occur over time for all 45 entries. Original workers and 2D/3D rendering libraries remain in use. Existing local MP4 export replays the actual renderer frame-by-frame using browser encoding, rather than filming pixels from the screen.
5. **Randomization**: the original curated `QP` schema governs which modes can use Randomize and its undo/redo history. Of 45 modes, 44 had a working schema; `PHONK_DROP` did not.
6. **Assets**: Phonk Drop's original public capture did not include 10 realistic-face WEBP skins (face+hands = 20). Referencing these fails despite functioning physics.

## Established vs experimental: component mapping

| Established reference | Experimental engines with related interaction patterns | What was reused |
|---|---|---|
| Rhythmic | Bloom, Phonk Drop, Marble | Timing, rhythm, ball motion, shared audio/physics configuration |
| Escape, Ghost, Breaker | Race, Targets, Colors, Lava, Plinko, Sand | Collision, layout, gravity, obstacle or particle controls |
| Glass, Glass Rush, Evolve, Grid Merge | Spin, Slice 3D, Flood 3D, Voxel | Object counts, progression, geometry, effects and transitions |
| Marble 3D, Wave 3D | Race 3D, Domino 3D, Drum 3D, Chladni 3D | 3D geometry, motion paths, time-based animation and export |
| Crush 3D, Jelly 3D, Cuts 3D, Magnet 3D | Disks 3D, Attractor 3D, Flow 3D, Blobs 3D, Galaxy 3D, Fireflies 3D, Basin 3D, Slime 3D, Evacuate 3D | 3D physics, instancing/particles, transformations and high-load options |

These groupings describe architectural relationships; they are not assertions that all engines use identical solvers.

## Independent audit results

- All **18 established modes and 27 experimental modes** selected the expected mode, exposed their original settings panel and showed no uncaught errors in the mode-control browser audit.
- All **27 experimental modes** showed changing canvas frames during their Play checks; that is evidence of animation, not complete physics correctness.
- **44/45** modes had native Randomize enabled and it changed real settings. **Phonk Drop** was the exception.
- **33 representative modes** (6 established and all 27 experimental) passed active keyboard slider-change checks in the earlier baseline. Current branch repeats them against its own rebuilt bundle.
- Three representative modes already produced downloadable short MP4s before this audit: Bloom, Flow 3D, and Domino 3D (short duration). High-body-count Domino 3D 2-second exports on software GPU have been inconsistent.
- No missing simulation JS resources were seen. Phonk Drop attempted two uncaptured default image assets, and 20 realistic optional face/hand texture assets were absent from the public capture.

## Repairs integrated on this branch

**Phonk Drop Randomize parity** — extend the ORIGINAL randomizer QP schema using Rhythmic's shared fields plus Phonk-specific build length, face scale, eye glow, climax, eye color and illustrated face selection; the native Randomize, Previous Roll, Next Roll and Record buttons remain unchanged.

**Offline Phonk face/hand compatibility** — replace uncaptured realistic WEBP references with 20 deterministic, locally encoded SVG illustrations, keep original bundled illustrated faces and custom uploads, and change the default from missing `bloodshot` texture to `grinface`. SVG fallback appearance is not pixel-identical to missing upstream assets.

**Domino 3D export performance** — reduce NEW scene default from 1,600 to 540 physics bodies. The UI's higher object-count controls remain available. Software-rendered video remains expensive: 2-second export did not complete inside 270 seconds on the CI software GPU even with a 240-body experiment. Reverted to 540 so visual detail is not reduced without measurable benefit.

**Original UI and build safety** — retain original browser bundle and matching assets, validate unique expected replacements, run Node syntax check on generated JS, preserve 45-mode Home catalog, and guard against accidental changes to unrelated routes.

## Acceptance matrix
| Test | Coverage | Required result |
|---|---|---|
| Mode metadata / UI | 45/45 | Native registry, sidebar and settings panel |
| Frame advancement | 27/27 experimental | Two visually different rendered frames after Play |
| Editable settings | 27/27 experimental + 6 established | Slider value updates without mode disappearing or JS errors |
| Randomize and history | Rhythmic, Bloom, Phonk; plus previous 45-mode audit | Original settings change and undo/redo works |
| Image fallback | 10 optional realistic Phonk skins | No missing WEBP requests, valid offline face/hand illustrations |
| MP4 | Bloom, Flow 3D, Phonk Drop, Domino 3D sample lengths | Downloaded MP4 with valid ftyp header |
| High-load performance | Domino 3D and particle modes at high settings | Needs hardware-specific evaluation; do not mark fully proven |
| Android | All modes and exports | Needs complete device-browser QA, not established by desktop tests |

## Not yet proven or limitations

- Every option combination, audio synchronization and collision accuracy across all 27 mode engines.
- Long 1080p/60fps exports, software-GPU speed, Android WebCodecs compatibility.
- Missing original WEBP artwork cannot be recovered from a static capture; SVG fallback is functional but stylistically different.
- Third-party cloud account features are separate from simulation engines; this audit does not invent those backends.

## Workflow commands
```bash
node scripts/build-original-studio.cjs
node scripts/audit-mode-parity-static.cjs
MODE_RANGE=0:15 node scripts/audit-all-mode-options.cjs
MODE_RANGE=0:33 node scripts/test-mode-option-interactivity.cjs
node scripts/test-phonk-mode-parity.cjs
TEST_MODE=domino-3d TEST_DURATION=2 node scripts/test-record-export.cjs
```
The Playwright tests require a browser executable and the `playwright-core` dependency; CI sets those automatically. Keep production untouched until the preview passes and an explicit deployment decision is made.

## Per-mode reverse-engineering inventory

Every entry below has its own mode-specific native UI, an animated canvas, and at least one responsive editable control. The limitations column is **not** proof of full correctness; it lists issues identified in the current audit. MP4 was sampled for selected modes rather than exhaustively exported for all 27.

| Mode | Engine type | Original mode-specific settings inspected | Issues / follow-up |
|---|---|---|---|
| Bloom | 2D | Lane count, alignment time, lane shape | None identified |
| Phonk Drop | 2D | Face, beat-drop timing, ball movement, playback speed | Native randomizer and 20 face/hand fallbacks fixed |
| Marble | 2D | Course shape, bounce style, playback speed, song matching | None identified |
| Race | 2D | Obstacle layout, racers, length, gravity | None identified |
| Targets | 2D | Target layout/size/count, bounce, gravity | None identified |
| Sand | 2D | Sand mode, grid detail, particle flow, material | None identified |
| Plinko | 2D | Peg layout, drop mode, bins, gravity | None identified |
| Colors | 2D | Brick rings, colours, speed changes | None identified |
| Spin | 2D | Win threshold, ball multipliers, spin/steal odds | None identified |
| Lava | 2D | Platform layout, rising lava, skill gap | None identified |
| Slice 3D | 3D | Fruit, slice pattern, timing, gravity, geometry | None identified |
| Flood 3D | 3D | Container, ending, ball count, gravity | None identified |
| Disks 3D | 3D | Formation, disks, drop timing | None identified |
| Drum 3D | 3D | Rotation, colour bands, object count | None identified |
| Plinko 3D | 3D | Peg rows, bin count, drop delay, lean angle | None identified |
| Chladni 3D | 3D | Pattern source, plate shape, sand amount | None identified |
| Voxels 3D | 3D | Artwork, cube resolution, build order and ending | None identified |
| Domino 3D | 3D | Run shape, spacing, timing, topple speed | Software renderer can be slow; default reduced from 1,600 to 540 bodies |
| Race 3D | 3D | Track geometry, slope, racers, identities | None identified |
| Attractor 3D | 3D | Attractor equation, particles, trail length, zoom | High particle settings need device-specific validation |
| Flow 3D | 3D | Particle count, lifetime, speed, trails | High particle settings need device-specific validation |
| Blobs 3D | 3D | Movement, material, blob count, thickness | None identified |
| Galaxy 3D | 3D | Gravity, spin, particle count, cloud thickness | High particle settings need device-specific validation |
| Fireflies 3D | 3D | Pull strength, frequency, formation, agent count | None identified |
| Basin 3D | 3D | Magnet count, friction, sampling resolution | High sampling settings need device-specific validation |
| Slime 3D | 3D | Agent count, sensor angle, trails, food nodes | High agent settings need device-specific validation |
| Evacuate 3D | 3D | Exits, people, personal space, door width | None identified |
