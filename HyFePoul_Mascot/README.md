# PIP: the HyFePoul mascot

PIP is a 3D chick mascot for the HyFePoul website: a fluffy white chick with a blue feather crest, big glossy eyes, an orange beak and feet, and a navy scarf carrying the HyFePoul logo. He was built in Blender 5.2 in five stages, and every stage can be rebuilt from a script.

**For the website, use `Models/PIP.glb`.** Read `Documentation/Stage5_Web_Integration.md` for loading, clips, ground speeds and the event → clip mapping.

## Folders

| Folder | Contents |
|---|---|
| `Blender/` | Stage checkpoints `PIP_Stage1_Design_v01` … `PIP_Stage5_Export_v01.blend` |
| `Blender/scripts/` | `make_atlas.py`, `pip_build_stage2.py`, `pip_rig_stage3.py`, `pip_anim_stage4.py`, `pip_export_stage5.py`, plus preview and sheet helpers |
| `Models/` | `PIP.glb` (final), `viewer.html` (three.js r170 test viewer), `tests/` (earlier stage checks) |
| `Animations/Previews/` | One MP4 (ice background) and one transparent animated WebP per clip |
| `Textures/` | `T_PIP_Atlas.png` (the single texture), `T_PIP_Scarf_Logo.png` (logo cut-out) |
| `Renders/` | Turnarounds (Stage 1 and 2), expression and pose sheets (Stage 3), animation contact sheets (Stage 4). Transparent PNGs. |
| `Documentation/` | Notes for each stage |

## At a glance

- 1.0 unit tall, 23.4k triangles, 4 draw calls, 1 texture, 3 materials; 2.2 MB GLB (~0.8 MB gzipped)
- 36-bone rig with face sliders; 24 face morphs (blink, lids, squint, wide, look, closed-eye lines)
- 10 expressions: happy, excited, curious, thinking, winking, surprised, concerned, sad, sleeping, determined
- 25 animations: 8 locomotion, 8 personality, 9 website reactions

`Animations/_frames/` (raw preview render frames, ~150 MB) is only an intermediate and can be deleted.
