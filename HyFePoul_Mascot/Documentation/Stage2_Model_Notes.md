# PIP: Stage 2 Model Notes

Status: **Stage 2 modelling done, waiting for review before Stage 3 (rigging).**

## Files

| What | Where |
|---|---|
| Blender model (checkpoint) | `Blender/PIP_Stage2_Model_v01.blend` |
| Build script (rebuilds the whole character) | `Blender/scripts/pip_build_stage2.py` |
| Atlas generator (Pillow) | `Blender/scripts/make_atlas.py` |
| Texture atlas, 1024×1024 | `Textures/T_PIP_Atlas.png` |
| Logo cut-out (source for the atlas) | `Textures/T_PIP_Scarf_Logo.png`, keyed from `mobile-app/assets/hyfepoul-logo.png` |
| Turnaround, transparent PNG | `Renders/Stage2_Model/PIP_S2_01_front.png` … `PIP_S2_06_rear_three_quarter.png` |
| Contact sheet | `Renders/Stage2_Model/PIP_Stage2_turnaround_sheet_v2.png` |
| Closed-eye checks | `Renders/Stage2_Model/PIP_S2_check_closed_eyes_happy.png`, `..._sleep.png` |
| Static GLB test (validation only) | `Models/PIP_Stage2_static_test.glb` (590 KB) |

To rebuild: open the .blend and run `pip_build_stage2.py` (`build()`). It deletes and recreates everything in the PIP collections and the Stage_Render collection. To regenerate the atlas: `python make_atlas.py`.

## What changed since the Stage 1 design

- **Logo is sharp.** The old version stretched the 256 px app icon. It now comes from the 1024 px app logo, keyed onto the navy bib through real UVs, and sits lower so the chicken crest and Wi-Fi arcs show below the scarf band.
- **Crest** feathers are leaf-shaped (wide middle, small soft tip), so they no longer read as spikes from behind.
- **Eyes, blush and highlights** are domes projected onto the face surface. They follow the head curve, so the far eye no longer sticks past the outline in ¾ views.
- **Beak** is two lofted halves with rounded tips. The lower half's origin sits on the hinge so it can open.
- **Wings** are a lofted wing body plus three short primary feathers with a white-to-blue gradient.
- **Legs and feet** are chunkier, with three front toes and a back toe.
- **Scarf** is a soft band with folds, the logo bib, a knot, and two tails with their own origins (for secondary motion).
- **Tail** is three compact blue feathers.
- **Scale:** PIP is now **1.0 unit tall**, feet at z = 0, facing −Y in Blender, so the glTF faces +Z (three.js default). Object scale is 1 everywhere.

## Object list and pivots (origins are set for rigging)

| Collection | Objects | Origin |
|---|---|---|
| PIP_Body | `PIP_Body`, `PIP_Head_Feathers` | body base / head centre |
| | `Crest_Main`, `Crest_Left`, `Crest_Right`, `Crest_Back` | feather base |
| | `Tail_Center`, `Tail_Left`, `Tail_Right` | feather base |
| PIP_Face | `Eye_Sclera.L/R`, `Eye_Iris.L/R`, `Eye_Highlight_Big.L/R`, `Eye_Highlight_Small.L/R` | eye centre |
| | `Blush.L/R` | blush centre |
| | `Beak_Upper`, `Beak_Lower`, `Mouth_Inner` | beak hinge |
| PIP_Face_Expressions (hidden) | `Eye_Closed_Happy.L/R` (^ ^), `Eye_Closed_Sleep.L/R` (– –) | eye centre |
| PIP_Limbs | `Wing.L/R` | shoulder |
| | `Leg.L/R` | hip |
| | `Foot.L/R` | ankle |
| PIP_Accessories | `Scarf_Ring`, `Scarf_Bib`, `Scarf_Knot` | ring centre / bib / knot |
| | `Scarf_Tail_A`, `Scarf_Tail_B` | knot |

Everything is parented to the `PIP_Root` empty. The closed-eye pieces are hidden at rest. In Stage 3 the face controls will swap them in by scale, because glTF can animate scale but not visibility.

## Materials and texture

| Material | Used by | glTF |
|---|---|---|
| `M_PIP_Main` | every opaque part (atlas colour) | base colour + sheen |
| `M_PIP_Eye` | sclera, iris (atlas colour, glossy) | clearcoat |
| `M_PIP_Highlight` | eye highlights | emissive |

There is one texture, `T_PIP_Atlas.png` (1024²): the logo region on top, then three gradient rows (blue feather, iris, wing) and a row of 16 solid swatches. Each part's UVs point at its colour, so the whole character uses 3 materials and 1 texture.

## Polygon budget

| Level | Triangles |
|---|---|
| Base meshes | ~12.9k |
| **Web (export) level**: one smoothing level only on head feathers and bib | **~22.6k** |
| Offline render (smoothing level 2) | much higher, for stills only |

The test GLB has 33 meshes, 3 materials and 1 PNG. Stage 5 will merge meshes per material (fewer draw calls) and may convert the atlas to WebP.

## Ready for Stage 3 (rigging)

Planned rig: root, body, chest, neck, head, crest (3 chain bones), tail, wing.L/R (shoulder, forearm), leg.L/R (thigh, shin, foot, toes, with IK), beak jaw, eye look target, per-eye blink scale, closed-eye swap, blush scale, scarf tail chains. Facial controls will use shape keys on the eye domes (blink, wide, squint, sad and angry lid tilt) plus bone-driven parts, covering happy, excited, curious, thinking, winking, surprised, concerned, sad, sleeping and determined.

## Known limits

- The body is a revolution mesh with poles at the top (under the head feathers) and the bottom (between the legs). Both are hidden and won't deform badly with this rig.
- Parts are separate rigid meshes (no shared skin between body and wings or legs). That fits PIP's chibi style and keeps skinning simple.
