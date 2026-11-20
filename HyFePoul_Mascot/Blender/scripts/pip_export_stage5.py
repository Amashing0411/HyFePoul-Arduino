"""PIP, HyFePoul mascot: Stage 5 web export.

Open Blender/PIP_Stage4_Animation_v01.blend, run this file, call export_all().
It works on the open file and saves the result as PIP_Stage5_Export_v01.blend,
so the Stage 4 file is never overwritten.

What it does
  1. Rest pose, then bakes the web smoothing (Solidify/Subsurf) into the meshes.
  2. Joins every opaque part into one skinned mesh `PIP_Mesh` (1 material, 1 draw call).
  3. Joins the eyes, highlights and closed-eye arcs into `PIP_Face`. Shape keys are
     renamed per side (Blink_L, Blink_R, ...) so winks still work, and the face
     drivers are rebuilt on the joined mesh (the exporter bakes them per clip).
  4. Exports Models/PIP.glb: skin + morphs + every clip (Loco_*, Pers_*, Web_*, EXPR_*),
     with a JPEG atlas and constant animation channels dropped.
"""
import bpy, os

ROOT = r"C:\Users\HP\HyFePoul-Arduino\HyFePoul_Mascot"
GLB = os.path.join(ROOT, "Models", "PIP.glb")
BLEND = os.path.join(ROOT, "Blender", "PIP_Stage5_Export_v01.blend")

EYE_PARTS = ("Eye_Sclera", "Eye_Iris", "Eye_Highlight_Big", "Eye_Highlight_Small")
ARC_PARTS = {"Eye_Closed_Happy": "HappyLine", "Eye_Closed_Sleep": "SleepLine"}
EYE_KEYS = ("Blink", "LidHalf", "LidSad", "LidAngry", "Squint", "Wide",
            "LookLeft", "LookRight", "LookUp", "LookDown")

def rig():
    return bpy.data.objects["PIP_Rig"]

def select_only(objs, active):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active = active

def bake_modifiers(r):
    """Apply Solidify/Subsurf (at viewport level) in rest pose; keep the Armature modifier."""
    r.data.pose_position = "REST"
    bpy.context.view_layer.update()
    for o in [c for c in r.children if c.type == "MESH"]:
        arm = o.modifiers.get("Armature")
        if arm:
            o.modifiers.move(o.modifiers.find("Armature"), len(o.modifiers) - 1)
        for m in [m for m in o.modifiers if m.type in ("SOLIDIFY", "SUBSURF")]:
            if m.type == "SUBSURF" and m.levels == 0:
                o.modifiers.remove(m); continue
            if o.data.shape_keys:
                o.modifiers.remove(m); continue           # face parts: export at base level
            select_only([o], o)
            bpy.ops.object.modifier_apply(modifier=m.name)
    r.data.pose_position = "POSE"

def join_main(r):
    face_names = {f"{p}.{s}" for p in list(EYE_PARTS) + list(ARC_PARTS) for s in ("L", "R")}
    parts = [o for o in r.children if o.type == "MESH" and o.name not in face_names]
    body = bpy.data.objects["PIP_Body"]
    select_only(parts, body)
    bpy.ops.object.join()
    body.name = "PIP_Mesh"; body.data.name = "PIP_Mesh"
    return body

def join_face(r):
    objs = []
    for s in ("L", "R"):
        for p in EYE_PARTS:
            o = bpy.data.objects[f"{p}.{s}"]
            if o.data.shape_keys.animation_data:
                o.data.shape_keys.animation_data_clear()
            for kb in o.data.shape_keys.key_blocks[1:]:
                kb.name = f"{kb.name}_{s}"
            objs.append(o)
        for p, label in ARC_PARTS.items():
            o = bpy.data.objects[f"{p}.{s}"]
            if o.data.shape_keys.animation_data:
                o.data.shape_keys.animation_data_clear()
            o.data.shape_keys.key_blocks["Show"].name = f"{label}_{s}"
            objs.append(o)
    active = bpy.data.objects["Eye_Sclera.L"]
    select_only(objs, active)
    bpy.ops.object.join()
    active.name = "PIP_Face"; active.data.name = "PIP_Face"
    return active

def drive(o, key, r, expr, props=None, transforms=None):
    kb = o.data.shape_keys.key_blocks[key]
    d = kb.driver_add("value").driver
    d.type = "SCRIPTED"; d.expression = expr
    for name, prop in (props or {}).items():
        v = d.variables.new(); v.name = name; v.type = "SINGLE_PROP"
        v.targets[0].id = r; v.targets[0].data_path = f'pose.bones["face_ctrl"]["{prop}"]'
    for name, (bone, tt) in (transforms or {}).items():
        v = d.variables.new(); v.name = name; v.type = "TRANSFORMS"
        t = v.targets[0]; t.id = r; t.bone_target = bone; t.transform_type = tt; t.transform_space = "LOCAL_SPACE"

def face_drivers(face, r):
    LOOK = 0.04
    for s in ("L", "R"):
        drive(face, f"Blink_{s}", r, "b", {"b": f"blink_{s}"})
        for k, p in (("LidHalf", "lid_half"), ("LidSad", "lid_sad"), ("LidAngry", "lid_angry"),
                     ("Squint", "squint"), ("Wide", "wide")):
            drive(face, f"{k}_{s}", r, "v", {"v": p})
        drive(face, f"LookLeft_{s}", r, f"clamp(x/{LOOK},0,1)", transforms={"x": ("look", "LOC_X")})
        drive(face, f"LookRight_{s}", r, f"clamp(-x/{LOOK},0,1)", transforms={"x": ("look", "LOC_X")})
        drive(face, f"LookUp_{s}", r, f"clamp(y/{LOOK},0,1)", transforms={"y": ("look", "LOC_Y")})
        drive(face, f"LookDown_{s}", r, f"clamp(-y/{LOOK},0,1)", transforms={"y": ("look", "LOC_Y")})
        drive(face, f"HappyLine_{s}", r, "clamp((b-0.6)/0.4,0,1)*h", {"b": f"blink_{s}", "h": f"happy_eye_{s}"})
        drive(face, f"SleepLine_{s}", r, "clamp((b-0.6)/0.4,0,1)*(1-h)", {"b": f"blink_{s}", "h": f"happy_eye_{s}"})

def tidy():
    for n in ("PIP_Widgets",):
        c = bpy.data.collections.get(n)
        if c:
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(c)
    for c in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories"):
        col = bpy.data.collections.get(c)
        if col and not col.objects:
            bpy.data.collections.remove(col)
    for p in rig().pose.bones:
        p.custom_shape = None

def export_glb(path=GLB):
    r = rig()
    r.animation_data.action = None
    for p in r.pose.bones:
        p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
    for k in ("blink_L", "blink_R", "happy_eye_L", "happy_eye_R", "lid_half", "lid_sad", "lid_angry", "squint", "wide"):
        r.pose.bones["face_ctrl"][k] = 0.0
    objs = [r, bpy.data.objects["PIP_Mesh"], bpy.data.objects["PIP_Face"]]
    select_only(objs, r)
    bpy.context.scene.render.fps = 30
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=90, export_image_quality=90,
        export_skins=True, export_all_influences=False, export_def_bones=False,
        export_morph=True, export_morph_normal=False, export_morph_animation=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_frame_step=1, export_anim_slide_to_zero=True, export_reset_pose_bones=True,
        export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=False,
        export_extras=False, export_cameras=False, export_lights=False)
    return os.path.getsize(path)

def export_all():
    r = rig()
    bake_modifiers(r)
    join_main(r)
    face = join_face(r)
    face_drivers(face, r)
    tidy()
    size = export_glb()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, relative_remap=True)
    return size
