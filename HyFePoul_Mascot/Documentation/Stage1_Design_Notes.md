# PIP: Stage 1 Design Notes

Status: **proposed design, waiting for approval.** Stage 2 (final modelling) has not started.

## Files

| What | Where |
|---|---|
| Blender design file | `Blender/PIP_Stage1_Design_v01.blend` |
| Turnaround, transparent PNG, 1000×1150 each | `Renders/Stage1_Turnaround/PIP_01_front.png` … `PIP_06_rear_three_quarter.png` |
| Contact sheet (ice background) | `Renders/Stage1_Turnaround/PIP_Stage1_turnaround_sheet.png` |

Sheet order: top row front, front three-quarter, left. Bottom row right, rear, rear three-quarter.

## Design choices

- **Silhouette:** big round head over a smaller pear-shaped body, roughly 55/45, matching the concept sheet. The head carries the expressions. The body stays simple so a web canvas can show it small and it still reads as a chick.
- **Blue feather cap:** the top of the head is electric blue (#1f63e8) with a feathered, scalloped hairline and a forelock dipping onto the forehead. The face stays white so the eyes and beak have a clean area. The hairline sits low at the back, so the rear view is mostly blue and the turnaround still reads from behind.
- **Crest:** three swept tufts plus a small back tuft, curling backward. This gives a clear side profile and a strong signal for animation (crest bounce on jumps, droop when concerned).
- **Eyes:** large glossy eyes with a white rim, a dark navy iris that fades to blue at the bottom, and two emissive highlights. These are separate objects so Stage 3 can drive blink, squash, look and highlight with bones or shape keys, with no remodelling.
- **Beak and feet:** the only warm colour (#ffa31a), as the brief asks. The beak is split into upper and lower parts with a mouth interior, ready for open, close and smile controls.
- **Scarf:** navy (#12306b, the site's heading colour), a soft band with a rounded bandana bib and a knot with two tails at the back-left. The bib carries the HyFePoul wordmark, projected from `showcase/img/app-icon.png` so it matches the current logo.
- **Wings:** white with an electric-blue to cyan gradient at the tips, short enough for wave, point and flap poses.
- **Tail:** three small blue tufts, which add rear-view interest and give secondary motion.
- **No robot or armour parts.** Recognisably a chicken.

## Palette

| Role | Hex |
|---|---|
| Feathers | #f5f8fd (cool white, light-blue sheen) |
| Cap, crest, tail, wing tips | #1f63e8 electric blue, cyan sheen #7fd8ff |
| Scarf | #12306b navy |
| Iris | deep navy into #0a2bb3 blue |
| Beak and feet | #ffa31a |
| Blush | #ff9fb4 (small) |

## Known issues to fix in Stage 2 (final modelling)

- Seen from behind, the crest tips still look slightly pointy. Stage 2 will model them as rounded feather lobes.
- In three-quarter views the far eye pushes a little past the head outline. Stage 2 will seat the eyes deeper.
- The design file is built from separate primitives with modifiers (block-out quality). Stage 2 will make one clean quad body mesh with edge loops around the eyes, beak, wing roots and legs for deformation, and will reduce the materials (target: one feather/body material using vertex colours or a small atlas, plus eye, beak and scarf-logo materials).
- The logo is projected in the shader at the moment. Stage 2 will bake it into a small texture (≤512 px) on the bib's UVs for glTF export.

## Questions for approval

1. Is the overall look and silhouette approved?
2. Crest: keep it as three swept tufts, or make it bigger and curlier like the concept?
3. Blush: keep it, or drop it to stay strictly within the palette?
4. Scarf knot at the back-left: keep it?
