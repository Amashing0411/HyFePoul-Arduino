# PIP: Stage 4 Animation Notes

Status: **Stage 4 animation done, waiting for review before Stage 5 (web export).**

## Files

| What | Where |
|---|---|
| Animated Blender file (checkpoint) | `Blender/PIP_Stage4_Animation_v01.blend` |
| Animation script (all clips, re-runnable) | `Blender/scripts/pip_anim_stage4.py` (`build_all()`) |
| Contact sheets (6 frames per clip) | `Renders/Stage4_Anim/PIP_Stage4_Locomotion_sheet.png`, `..._Personality_sheet.png`, `..._Website_sheet.png` |
| Preview videos | `Animations/Previews/<clip>.mp4` (ice background) and `<clip>.webp` (transparent, looping) |
| Sheet and preview tools | `Blender/scripts/make_anim_sheets.py`, `make_anim_previews.py` |

To rebuild: open `PIP_Stage3_Rig_v01.blend`, run `pip_anim_stage4.py` and call `build_all()`. You can rebuild only some clips with `build_all(only={"Pers_Wave"})`.

## Conventions

- **30 fps.** Every clip is its own Action on `PIP_Rig` (fake user, manual frame range, custom props `pip_group`, `pip_loop`, `pip_fps`).
- **Self-contained:** each clip keys the whole body *and* the face sliders (blinks included). In three.js, play one clip at a time and crossfade between them. No additive layering is needed.
- **In place:** walk, run and roam cycles never travel. The website moves the model and the clip supplies the steps. Only `Loco_Turn` ends rotated: +90° to PIP's left, applied on `root`. Add 90° to the model's yaw when it finishes.
- **Loops:** loop clips have identical first and last frames and cyclic curves, so they repeat without a hitch. Use `LoopRepeat`.
- **One-shots** start and end at (or near) the idle pose. Use `LoopOnce` with `clampWhenFinished`, then crossfade to `Loco_Idle`, or play `Web_ReturnToIdle`, which ends exactly on `Loco_Idle` frame 0.

## Clip list (25)

| Clip | Frames | Loop | What it does |
|---|---|---|---|
| **Locomotion** |
| `Loco_Idle` | 120 | yes | Breathing, gentle head sway, crest/tail/scarf follow-through, two blinks |
| `Loco_Blink` | 12 | no | Single blink over a quiet idle |
| `Loco_LookAround` | 120 | yes | Looks left, then right, leading with the eyes, with blinks on the turns |
| `Loco_Walk` | 30 | yes | In-place walk: heel-toe roll, body bob and weight shift, wing swing, bouncing crest |
| `Loco_Run` | 18 | yes | In-place run: forward lean, a moment of float, wings out, crest and scarf streaming back |
| `Loco_Turn` | 30 | no | Anticipation, head leads, two little steps, ends turned +90° |
| `Loco_Stop` | 24 | no | Skid from a walking lean, squash, wings flare, crest overshoots, settles to idle |
| `Loco_Sleep` | 120 | yes | Dozing: eyes closed, head drooped, slow deep breaths, crest flopped |
| **Personality** |
| `Pers_Wave` | 60 | no | Raises the right wing to head height and waves, smiling |
| `Pers_HappyJump` | 42 | no | Squash, jump with wings up and happy ^ ^ eyes, land, settle |
| `Pers_Celebrate` | 75 | no | Two jumps, flapping overhead, a 360° spin on the second jump |
| `Pers_Point` | 60 | no | Points with the left wing toward PIP's left (viewer's right) and looks there |
| `Pers_Think` | 90 | no | Wing to the chin, looks up, half lids, taps, then an "aha" pop |
| `Pers_HeadTilt` | 45 | no | Curious tilt with overshoot and a crest flop |
| `Pers_WingFlap` | 45 | no | Excited fast flapping with little hops |
| `Pers_Concerned` | 75 | no | Worried lids, wings held together, small shuffle, glances |
| **Website** |
| `Web_Appear` | 45 | no | Pops in from scale 0 with a bounce, wings open, happy eyes, settles |
| `Web_RoamDashboard` | 60 | yes | In-place walk while glancing around (the site moves PIP across the dashboard) |
| `Web_LookAtComponent_L` | 60 | no | Turns and leans to look at something on PIP's left (viewer's right); holds |
| `Web_LookAtComponent_R` | 60 | no | Same toward PIP's right (viewer's left) |
| `Web_LowWater` | 90 | no | Startle, wings to cheeks, head shake ("oh no"), then points to the water gauge (viewer's right) |
| `Web_LowFeed` | 90 | no | Looks down, rubs belly, sad droopy lids and crest, sighs |
| `Web_FeedingComplete` | 75 | no | Hop with wings up, then a happy belly pat with ^ ^ eyes |
| `Web_DeviceDisconnected` | 90 | no | Quick searching looks, shrug, then slumps sad; holds |
| `Web_ReturnToIdle` | 24 | no | Small exhale and settle that ends exactly on `Loco_Idle` frame 0 |

The website clips are suggestions for the matching HyFePoul events: the low-water float switch, a low feed level from the hopper ultrasonic sensor, a finished feeding cycle, and a lost ESP32 connection. When to trigger them is decided in the site code later, not here.

## Checked

- Every clip was baked and its channels counted (324 animated channels each: 36 bones plus face sliders).
- Contact sheets were rendered from Blender for all 25 clips. Wave, Think and LowWater were adjusted after the first pass: the waving wing was hidden behind the head, and the Think wing didn't reach the chin.
- Preview videos were rendered for every clip.

## Notes for Stage 5

- Export with `export_animation_mode='ACTIONS'` and sampling on. Then check whether `export_optimize_animation_keep_anim_armature=False` safely drops constant channels to shrink the file.
- Leave out `EXPR_*` actions, or keep them as short face poses. Decide in Stage 5.
