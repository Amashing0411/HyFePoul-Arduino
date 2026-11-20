# PIP: Stage 5 Web Export and Integration Guide

Status: **Stage 5 done.** `Models/PIP.glb` is the file the website should load.

## The file

| | |
|---|---|
| File | `Models/PIP.glb` (2.2 MB raw, **~0.8 MB gzipped**) |
| Built by | `Blender/scripts/pip_export_stage5.py` from `PIP_Stage4_Animation_v01.blend`, saved as `PIP_Stage5_Export_v01.blend` |
| Size and scale | 1.0 unit tall, feet at y = 0, faces +Z (towards a default three.js camera) |
| Geometry | 23.4k triangles; **2 skinned meshes / 4 draw calls**: `PIP_Mesh` (body, all parts, 1 material) and `PIP_Face` (eyes, highlights, closed-eye lines; 3 materials) |
| Materials | `M_PIP_Main` (atlas + sheen), `M_PIP_Eye` (atlas, clearcoat), `M_PIP_Highlight` (emissive) |
| Texture | One 1024² JPEG atlas, 42 KB (logo, gradients, colour swatches) |
| Rig | `PIP_Rig`, 36 joints (control joints included; harmless) |
| Morphs | 24 on `PIP_Face`: `Blink_L/R`, `LidHalf_L/R`, `LidSad_L/R`, `LidAngry_L/R`, `Squint_L/R`, `Wide_L/R`, `LookLeft/Right/Up/Down_L/R`, `HappyLine_L/R`, `SleepLine_L/R` |
| Clips | 36: 25 animations (`Loco_*`, `Pers_*`, `Web_*`) + 11 one-frame face poses (`EXPR_*`) at 30 fps; constant channels are dropped |
| Extensions | `KHR_materials_sheen`, `KHR_materials_clearcoat`, `KHR_materials_emissive_strength` (all supported by three.js r170's GLTFLoader) |

Checked in a browser with three.js r170 (the site's version), using `Models/viewer.html`: the file loads with no console errors, every clip is listed, and crossfades work. Wave, LowWater and HappyJump play the same way as in the Blender renders.

## Test viewer

```bash
python -m http.server 4180 --directory HyFePoul_Mascot/Models
```

Then open `http://localhost:4180/viewer.html`. It has a clip button for every animation, face-morph sliders, and draw-call and triangle stats. (There is also a `mascot` entry in `.claude/launch.json`.)

## three.js (plain, like `showcase/`)

The showcase vendors `three.module.min.js` r170 but not `GLTFLoader`. Copy `examples/jsm/loaders/GLTFLoader.js` from three r170 into `showcase/vendor/` (with `utils/BufferGeometryUtils.js`, which is already there) when PIP is integrated.

```js
import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const LOOPS = new Set(['Loco_Idle', 'Loco_LookAround', 'Loco_Walk', 'Loco_Run', 'Loco_Sleep', 'Web_RoamDashboard']);
const gltf = await new GLTFLoader().loadAsync('/assets/PIP.glb');
const pip = gltf.scene;                       // 1 unit tall; scale to taste, e.g. pip.scale.setScalar(0.6)
scene.add(pip);

const mixer = new THREE.AnimationMixer(pip);
const actions = Object.fromEntries(gltf.animations.map(c => {
  const a = mixer.clipAction(c);
  a.setLoop(LOOPS.has(c.name) ? THREE.LoopRepeat : THREE.LoopOnce);
  a.clampWhenFinished = !LOOPS.has(c.name);
  return [c.name, a];
}));

let current;
function play(name, fade = 0.25) {
  const next = actions[name];
  next.reset().play();
  if (current && current !== next) current.crossFadeTo(next, fade, false);
  current = next;
}
// one-shots go back to idle by themselves
mixer.addEventListener('finished', e => {
  if (e.action === actions.Loco_Turn) pip.rotation.y += Math.PI / 2;   // Turn ends rotated +90°
  play('Loco_Idle');
});

play('Web_Appear');
// in the render loop: mixer.update(clock.getDelta());
```

### Moving PIP around the dashboard

The walk and run cycles are **in place**. Move `pip.position` yourself at the speed that matches the feet, so they don't slide:

| Clip | Ground speed (PIP at scale 1) |
|---|---|
| `Loco_Walk`, `Web_RoamDashboard` | **0.18 units/s** |
| `Loco_Run` | **0.47 units/s** |

Multiply by `pip.scale.x` if you scale him. Face the travel direction with `pip.rotation.y = Math.atan2(dx, dz)`. When he arrives, play `Loco_Stop`, then idle.

### Driving the face directly (optional)

The clips already contain the face. To blink or look around outside a clip, set the morphs yourself:

```js
const face = pip.getObjectByName('PIP_Face');   // a Group of 3 skinned meshes (one per material)
function setMorph(name, v) {
  face.traverse(m => { if (m.morphTargetDictionary && name in m.morphTargetDictionary)
    m.morphTargetInfluences[m.morphTargetDictionary[name]] = v; });
}
// A blink also shows the closed-eye line near the end, as the Blender driver does:
function blink(v, happy = 0) {
  for (const s of ['L', 'R']) {
    setMorph(`Blink_${s}`, v);
    const line = Math.min(Math.max((v - 0.6) / 0.4, 0), 1);
    setMorph(`HappyLine_${s}`, line * happy);
    setMorph(`SleepLine_${s}`, line * (1 - happy));
  }
}
```

A playing clip overwrites these morphs, so only set them when no clip drives the face, or after `mixer.update()` each frame.

## React Three Fiber

```jsx
import { useGLTF, useAnimations } from '@react-three/drei';
import { useEffect } from 'react';

export function Pip({ clip = 'Loco_Idle', ...props }) {
  const { scene, animations } = useGLTF('/assets/PIP.glb');
  const { actions } = useAnimations(animations, scene);
  useEffect(() => {
    const a = actions[clip];
    a?.reset().fadeIn(0.25).play();
    return () => a?.fadeOut(0.25);
  }, [clip, actions]);
  return <primitive object={scene} {...props} />;
}
useGLTF.preload('/assets/PIP.glb');
```

## Suggested event → clip mapping (for the site later)

These follow the HyFePoul system data the backend already handles. The site decides when to trigger them; PIP only reacts.

| Event (from device data) | Clip | Then |
|---|---|---|
| Page or dashboard opens | `Web_Appear` | `Loco_Idle` |
| Nothing happening | `Loco_Idle` (mix in `Loco_LookAround`, `Loco_Blink`) | |
| User hovers or selects a card | `Web_LookAtComponent_L` / `_R` (by side) | hold, then `Web_ReturnToIdle` |
| Water reservoir float switch reports low | `Web_LowWater` | hold or `Pers_Concerned` |
| Hopper feed level low | `Web_LowFeed` | `Loco_Idle` |
| A feeding cycle finishes | `Web_FeedingComplete` (or `Pers_Celebrate`) | `Loco_Idle` |
| ESP32 / device stops sending updates | `Web_DeviceDisconnected` | hold until it reconnects, then `Pers_HappyJump` |
| Greeting / help tip | `Pers_Wave`, `Pers_Point`, `Pers_Think` | `Loco_Idle` |
| Night or no activity for a while | `Loco_Sleep` | `Web_ReturnToIdle` on interaction |

## Performance notes

- 4 draw calls and 23k triangles are light even on phones. Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Serve the GLB gzipped or brotli-compressed (Cloudflare does this automatically): ~0.8 MB.
- For a smaller file you can run `gltfpack -i PIP.glb -o PIP.meshopt.glb -cc -kn -km` and load it with `MeshoptDecoder`. That isn't done here, to keep loading dependency-free.
- Respect `prefers-reduced-motion`: show `Loco_Idle` (or a still frame) and skip the jumps.

## Rebuild chain

1. `make_atlas.py` (Pillow) → `Textures/T_PIP_Atlas.png`
2. `pip_build_stage2.py` → model → `PIP_Stage2_Model_v01.blend`
3. `pip_rig_stage3.py` → rig, face, expressions → `PIP_Stage3_Rig_v01.blend`
4. `pip_anim_stage4.py` → 25 clips → `PIP_Stage4_Animation_v01.blend`
5. `pip_export_stage5.py` → `Models/PIP.glb` + `PIP_Stage5_Export_v01.blend`

Each script runs inside Blender 5.2 on the previous stage's file.
