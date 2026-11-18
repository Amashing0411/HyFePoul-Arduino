# PIP: Stage 3 Rig Notes

Status: **Stage 3 rigging done, waiting for review before Stage 4 (animation).**

## Files

| What | Where |
|---|---|
| Rigged Blender file (checkpoint) | `Blender/PIP_Stage3_Rig_v01.blend` |
| Rig script (re-runnable on the Stage 2 file) | `Blender/scripts/pip_rig_stage3.py` (`rig_all()`) |
| Expression sheet (10 expressions) | `Renders/Stage3_Rig/PIP_Stage3_expressions_sheet.png` |
| Single expressions, transparent PNG | `Renders/Stage3_Rig/PIP_expr_*.png` |
| Body pose tests (wave, squash, jump, walk step) | `Renders/Stage3_Rig/PIP_Stage3_pose_tests_sheet.png`, `PIP_pose_*.png` |
| Rigged GLB test (rig + morphs + 11 expression animations) | `Models/PIP_Stage3_rig_test.glb` (~1 MB, validation only) |

To rebuild the rig: open `PIP_Stage2_Model_v01.blend`, then run `pip_rig_stage3.py` and call `rig_all()`. The script deletes any earlier rig, weights and shape keys first.

## Armature: `PIP_Rig` (36 bones)

`PIP_Rig` is the top object. Every mesh is its child, with an Armature modifier placed first in the stack.

| Group | Bones | Notes |
|---|---|---|
| Spine | `root` (control), `body`, `chest`, `neck`, `head` | Body mesh blends body → chest → neck → head. The blend sits under the scarf so head turns and tilts don't crease. |
| Crest | `crest_main.01/.02`, `crest_left`, `crest_right`, `crest_back` | Rotate X: + flops forward (droop), − sweeps back (perk up). |
| Tail | `tail_root`, `tail_center`, `tail_left`, `tail_right` | Fan or wag. |
| Face | `jaw`, `eye.L/R`, `blush.L/R`, `look` (control), `face_ctrl` (control) | Jaw rotate X + opens the beak. Eye bones scale for a pop. Blush bones scale to show more or less blush. |
| Wings | `wing.L/R`, `wing_tip.L/R` | Flap outward: rotate Z − on L, + on R. Rotate X + swings the tip back. |
| Legs | `leg.L/R` (Stretch To), `IK_foot.L/R` (control), `foot.L/R` | Move `IK_foot` to step. Legs stretch and squash to the foot, so the body can bob, land and jump while the feet stay planted. |
| Scarf | `scarf_knot`, `scarf_tail_a.01/.02`, `scarf_tail_b.01/.02` | For secondary motion. |

Bone collections are Deform, Face and Controls, with coloured, circle-shaped controls. Every pose bone uses XYZ Euler rotation.

## Facial controls

The face is driven by **sliders on the `face_ctrl` bone** (custom properties, 0–1, keyable) and by the `look` bone:

| Slider | Effect |
|---|---|
| `blink_L`, `blink_R` | Closes the eye. In the last 40 % of a blink a closed-eye line fades in. |
| `happy_eye_L`, `happy_eye_R` | When closed, that eye shows a happy ^ arc instead of the sleepy line. |
| `lid_half` | Upper lids halfway down (sleepy, thinking) |
| `lid_sad` | Upper lids slope down toward the outside (sad, concerned) |
| `lid_angry` | Upper lids slope down toward the inside (determined) |
| `squint` | Lower lids rise (smiling eyes) |
| `wide` | Eyes open wide (surprised, excited) |
| `look` bone, move X/Y | Irises and highlights slide (±4 cm of control travel = full look) |

These drive shape keys on `Eye_Sclera`, `Eye_Iris`, `Eye_Highlight_Big` and `Eye_Highlight_Small` (per eye): `Blink, LidHalf, LidSad, LidAngry, Squint, Wide, LookLeft, LookRight, LookUp, LookDown`. The closed-eye arcs (`Eye_Closed_Happy`, `Eye_Closed_Sleep`) have a single `Show` key. Their basis is folded away inside the head, so they are invisible in three.js unless the morph is on.

The glTF exporter samples these drivers into every animation's morph-weight channels. This was checked in the test GLB: `EXPR_Happy` turns `Eye_Closed_Happy.L` to 1, and `EXPR_Sleeping` turns `Eye_Closed_Sleep.L` to 1.

## Expressions (pose library)

There are 11 actions, all marked as pose assets: `EXPR_Neutral` plus the ten requested expressions, `EXPR_Happy`, `EXPR_Excited`, `EXPR_Curious`, `EXPR_Thinking`, `EXPR_Winking`, `EXPR_Surprised`, `EXPR_Concerned`, `EXPR_Sad`, `EXPR_Sleeping` and `EXPR_Determined`. Each one keys only the face sliders, `look`, `head`, `jaw`, the eyes, the blush and the crest, so it can be layered over any body animation in Stage 4.

## Using the face in three.js (for later integration)

Expressions arrive as animation clips, so you can play them with an `AnimationMixer`. For direct control at runtime, set morph influences by name:

```js
const iris = pip.getObjectByName('Eye_Iris.L');
iris.morphTargetInfluences[iris.morphTargetDictionary.Blink] = 1;
// The closed-eye arc follows the same rule as the Blender driver:
// Show = clamp((blink - 0.6) / 0.4, 0, 1) * happyEye
```

## Checked

- All ten expressions rendered from Blender, see the expression sheet.
- Body poses (wave, landing squash with planted feet, jump with tucked feet, walk step) rendered and deforming cleanly.
- GLB export: 1 skin with 36 joints, morph targets with names, 11 animations with translation, rotation, scale and morph-weight channels.

## Notes for Stage 5 export

- The test export used `export_apply=False`, so the head feathers and bib went out without their web smoothing level. Stage 5 will apply the subsurf on those two meshes (they have no shape keys) before export.
- Control bones (`root`, `IK_foot`, `look`, `face_ctrl`) are exported as joints too. That's harmless, and it keeps the hierarchy simple.
