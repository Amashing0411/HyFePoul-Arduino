"""PIP, HyFePoul mascot: Stage 3 rig.

Run inside Blender on the Stage 2 model (PIP_Stage2_Model_v01.blend or a fresh
pip_build_stage2.build()). Safe to re-run: it removes the previous rig, vertex
groups, armature modifiers and shape keys first.

Result
  * PIP_Rig armature (top object; meshes are children with Armature modifiers).
  * Deform bones: body, chest, neck, head, jaw, eye.L/R, blush.L/R, crest chains,
    tail feathers, wing + wing_tip, leg, foot, scarf tail chains.
  * Controls: root, IK_foot.L/R (legs stretch to them), look (eye direction),
    face_ctrl (custom-property sliders driving the face shape keys).
  * Face shape keys (on eye parts): Blink_L/R, LidHalf, LidSad, LidAngry, Squint,
    Wide, LookLeft/Right/Up/Down. Closed-eye arcs: Show (basis is collapsed, so
    they are invisible in three.js unless the morph is on).
  * Ten expression poses as actions EXPR_* (marked as pose assets).
"""
import bpy, math
from mathutils import Vector, Matrix, Euler

S = bpy.context.scene.get("pip_build_scale", 0.36887669708139775)   # build-units -> metres
EYE_A, EYE_B = 0.158 * S, 0.198 * S

PART_COLLS = ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories")
EYE_PARTS = ("Eye_Sclera", "Eye_Iris", "Eye_Highlight_Big", "Eye_Highlight_Small")

def parts():
    return [o for c in PART_COLLS for o in bpy.data.collections[c].objects]

def O(name):
    return bpy.data.objects[name]

def wpos(o):
    return o.matrix_world.translation.copy()

# ------------------------------------------------------------------ cleanup
def cleanup():
    rig = bpy.data.objects.get("PIP_Rig")
    root = bpy.data.objects.get("PIP_Root")
    bpy.context.view_layer.update()
    for o in parts():
        mw = o.matrix_world.copy()
        for m in [m for m in o.modifiers if m.type == "ARMATURE"]:
            o.modifiers.remove(m)
        o.vertex_groups.clear()
        if o.data.shape_keys:
            kb = o.data.shape_keys.key_blocks
            if "Show" in kb:                       # closed-eye arcs: restore full shape
                for v, k in zip(o.data.vertices, kb["Show"].data):
                    v.co = k.co.copy()
            if o.data.shape_keys.animation_data:
                o.data.shape_keys.animation_data_clear()
            o.shape_key_clear()
        o.parent = None
        o.matrix_world = mw
    if rig:
        arm = rig.data
        bpy.data.objects.remove(rig, do_unlink=True)
        bpy.data.armatures.remove(arm)
    if root:
        bpy.data.objects.remove(root, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.name.startswith(("EXPR_", "TEST_"))]:
        bpy.data.actions.remove(a)
    wg = bpy.data.collections.get("PIP_Widgets")
    if wg:
        for o in list(wg.objects):
            bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------ geometry probes
def far_point(o, base):
    best, bd = base, 0.0
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        d = (p - base).length
        if d > bd:
            best, bd = p, d
    return best

def lowest_point(o):
    return min((o.matrix_world @ v.co for v in o.data.vertices), key=lambda p: p.z)

def body_hit(origin, direction):
    dg = bpy.context.evaluated_depsgraph_get()
    b = O("PIP_Body").evaluated_get(dg)
    mi = b.matrix_world.inverted()
    ok, loc, nor, _ = b.ray_cast(mi @ Vector(origin), (mi.to_3x3() @ Vector(direction)).normalized())
    if not ok:
        return None, None
    return b.matrix_world @ loc, (b.matrix_world.to_3x3() @ nor).normalized()

# ------------------------------------------------------------------ armature
def build_armature():
    arm = bpy.data.armatures.new("PIP_Rig")
    rig = bpy.data.objects.new("PIP_Rig", arm)
    bpy.data.collections["PIP"].objects.link(rig)
    arm.display_type = "OCTAHEDRAL"
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    B = {}

    def bone(name, head, tail, parent=None, deform=True, roll=0.0, connect=False):
        b = eb.new(name)
        b.head = Vector(head); b.tail = Vector(tail); b.roll = roll
        b.use_deform = deform
        if parent:
            b.parent = B[parent]; b.use_connect = connect
        B[name] = b
        return b

    bone("root", (0, 0, 0), (0, 0.12, 0), deform=False)
    bone("body", (0, 0, 0.09), (0, 0, 0.22), "root")
    bone("chest", (0, 0, 0.22), (0, 0, 0.37), "body", connect=True)
    bone("neck", (0, 0, 0.37), (0, 0, 0.415), "chest", connect=True)
    bone("head", (0, 0, 0.415), (0, 0, 0.86), "neck", connect=True)

    # crest chains
    for nm, cnt in (("Crest_Main", 2), ("Crest_Left", 1), ("Crest_Right", 1), ("Crest_Back", 1)):
        o = O(nm); base = wpos(o); tip = far_point(o, base)
        bn = nm.lower()
        if cnt == 2:
            mid = base.lerp(tip, 0.5) + Vector((0, -0.01, 0.015))
            bone(bn + ".01", base, mid, "head")
            bone(bn + ".02", mid, tip, bn + ".01", connect=True)
        else:
            bone(bn, base, tip, "head")
    # tail
    tb = wpos(O("Tail_Center"))
    bone("tail_root", tb + Vector((0, -0.03, 0.0)), tb, "body")
    for nm in ("Tail_Center", "Tail_Left", "Tail_Right"):
        o = O(nm); base = wpos(o)
        bone(nm.lower(), base, far_point(o, base), "tail_root")
    # face
    jaw = wpos(O("Beak_Lower"))
    bone("jaw", jaw, jaw + Vector((0, -0.085, -0.012)), "head")
    for s in ("L", "R"):
        c = wpos(O(f"Eye_Sclera.{s}"))
        _, n = body_hit((c.x, -2, c.z), (0, 1, 0))
        bone(f"eye.{s}", c, c + n * 0.05, "head")
        bc = wpos(O(f"Blush.{s}"))
        _, bn_ = body_hit((bc.x, -2, bc.z), (0, 1, 0))
        bone(f"blush.{s}", bc, bc + bn_ * 0.03, "head")
    # wings
    for s in ("L", "R"):
        o = O(f"Wing.{s}"); sh = wpos(o); tip = lowest_point(o)
        mid = sh.lerp(tip, 0.55)
        bone(f"wing.{s}", sh, mid, "chest")
        bone(f"wing_tip.{s}", mid, tip, f"wing.{s}", connect=True)
    # legs: leg stretches to IK_foot; foot follows IK_foot
    for s, sx in (("L", 1), ("R", -1)):
        hip = wpos(O(f"Leg.{s}")); ank = wpos(O(f"Foot.{s}"))
        bone(f"leg.{s}", hip, ank, "body")
        bone(f"IK_foot.{s}", Vector((ank.x, ank.y, 0.0)), Vector((ank.x, ank.y + 0.08, 0.0)), "root", deform=False)
        bone(f"foot.{s}", ank, ank + Vector((0.01 * sx, -0.085, -0.02)), f"IK_foot.{s}")
    # scarf
    k = wpos(O("Scarf_Knot"))
    bone("scarf_knot", k, k + Vector((0.03, 0.04, 0)), "neck")
    for nm in ("Scarf_Tail_A", "Scarf_Tail_B"):
        o = O(nm); base = wpos(o); tip = far_point(o, base); mid = base.lerp(tip, 0.5)
        bn = nm.lower()
        bone(bn + ".01", base, mid, "scarf_knot")
        bone(bn + ".02", mid, tip, bn + ".01", connect=True)
    # controls
    eye_c = (wpos(O("Eye_Sclera.L")) + wpos(O("Eye_Sclera.R"))) * 0.5
    bone("look", Vector((0, -0.55, eye_c.z)), Vector((0, -0.55, eye_c.z + 0.06)), "head", deform=False)
    bone("face_ctrl", (0.30, -0.05, 0.80), (0.30, -0.05, 0.86), "head", deform=False)

    bpy.ops.object.mode_set(mode="OBJECT")
    return rig

def setup_pose(rig):
    pb = rig.pose.bones
    for p in pb:
        p.rotation_mode = "XYZ"
    # legs stretch to the ankle (foot bone head); the foot follows IK_foot on the ground,
    # so the body can bob, squash and jump while the feet stay planted
    for s in ("L", "R"):
        c = pb[f"leg.{s}"].constraints.new("STRETCH_TO")
        c.target = rig; c.subtarget = f"foot.{s}"; c.head_tail = 0.0
        c.volume = "VOLUME_XZX"; c.bulge = 1.0
        c.rest_length = rig.data.bones[f"leg.{s}"].length
    # bone collections + colours
    arm = rig.data
    cols = {}
    for nm in ("Deform", "Controls", "Face"):
        cols[nm] = arm.collections.get(nm) or arm.collections.new(nm)
    for b in arm.bones:
        if b.name in ("root", "look", "face_ctrl") or b.name.startswith("IK_"):
            cols["Controls"].assign(b)
            pb[b.name].color.palette = "THEME09" if b.name.startswith("IK_") else "THEME04"
        elif b.name.startswith(("eye", "blush", "jaw")):
            cols["Face"].assign(b)
        else:
            cols["Deform"].assign(b)
    # face sliders
    fc = pb["face_ctrl"]
    for prop in FACE_PROPS:
        fc[prop] = 0.0
        ui = fc.id_properties_ui(prop)
        ui.update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, default=0.0,
                  description=FACE_PROPS[prop])
    # lock what should not move
    pb["look"].lock_location[2] = True
    for ax in range(3):
        pb["face_ctrl"].lock_location[ax] = True
        pb["face_ctrl"].lock_rotation[ax] = True
        pb["face_ctrl"].lock_scale[ax] = True

FACE_PROPS = {
    "blink_L": "Close the left eye; a closed-eye line fades in near the end",
    "blink_R": "Close the right eye; a closed-eye line fades in near the end",
    "happy_eye_L": "Closed left eye shows the happy ^ arc instead of the sleepy line",
    "happy_eye_R": "Closed right eye shows the happy ^ arc instead of the sleepy line",
    "lid_half": "Lower both upper lids halfway (sleepy, bored, thinking)",
    "lid_sad": "Upper lids slope down to the outside (sad, concerned)",
    "lid_angry": "Upper lids slope down to the inside (determined)",
    "squint": "Raise the lower lids (smiling eyes)",
    "wide": "Open the eyes wide (surprised, excited)",
}

# ------------------------------------------------------------------ skin weights
def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)

def assign(o, weights_fn, groups):
    vg = {g: o.vertex_groups.new(name=g) for g in groups}
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        w = weights_fn(p)
        tot = sum(w.values()) or 1.0
        for g, x in w.items():
            if x > 1e-4:
                vg[g].add([v.index], x / tot, "REPLACE")

def rigid(o, bone):
    o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1.0, "REPLACE")

def chain(o, bones, rig):
    """Blend along a bone chain by projection onto the chain."""
    bs = [rig.data.bones[b] for b in bones]
    base, tip = bs[0].head_local, bs[-1].tail_local
    L = (tip - base).length
    def fn(p):
        t = (p - base).dot((tip - base).normalized()) / L
        if len(bones) == 1:
            return {bones[0]: 1.0}
        w2 = smooth(0.38, 0.62, t)
        return {bones[0]: 1 - w2, bones[1]: w2}
    assign(o, fn, bones)

def skin(rig):
    def body_w(p):
        z = p.z
        return {"body": 1 - smooth(0.18, 0.26, z),
                "chest": smooth(0.18, 0.26, z) * (1 - smooth(0.33, 0.39, z)),
                "neck": smooth(0.33, 0.39, z) * (1 - smooth(0.40, 0.445, z)),
                "head": smooth(0.40, 0.445, z)}
    assign(O("PIP_Body"), body_w, ["body", "chest", "neck", "head"])
    rigid(O("PIP_Head_Feathers"), "head")
    chain(O("Crest_Main"), ["crest_main.01", "crest_main.02"], rig)
    for nm in ("Crest_Left", "Crest_Right", "Crest_Back"):
        rigid(O(nm), nm.lower())
    for nm in ("Tail_Center", "Tail_Left", "Tail_Right"):
        rigid(O(nm), nm.lower())
    rigid(O("Beak_Upper"), "head"); rigid(O("Mouth_Inner"), "head"); rigid(O("Beak_Lower"), "jaw")
    for s in ("L", "R"):
        for p in EYE_PARTS + ("Eye_Closed_Happy", "Eye_Closed_Sleep"):
            rigid(O(f"{p}.{s}"), f"eye.{s}")
        rigid(O(f"Blush.{s}"), f"blush.{s}")
        chain(O(f"Wing.{s}"), [f"wing.{s}", f"wing_tip.{s}"], rig)
        rigid(O(f"Leg.{s}"), f"leg.{s}")
        rigid(O(f"Foot.{s}"), f"foot.{s}")
    assign(O("Scarf_Ring"), lambda p: {"head": 0.35, "neck": 0.45, "chest": 0.20}, ["head", "neck", "chest"])
    rigid(O("Scarf_Bib"), "chest")
    rigid(O("Scarf_Knot"), "scarf_knot")
    chain(O("Scarf_Tail_A"), ["scarf_tail_a.01", "scarf_tail_a.02"], rig)
    chain(O("Scarf_Tail_B"), ["scarf_tail_b.01", "scarf_tail_b.02"], rig)
    for o in parts():
        o.parent = rig
        o.matrix_parent_inverse = Matrix.Identity(4)
        m = o.modifiers.new("Armature", "ARMATURE"); m.object = rig
        o.modifiers.move(len(o.modifiers) - 1, 0)          # deform before subsurf / solidify

# ------------------------------------------------------------------ face shape keys
def eye_frame(side):
    c = wpos(O(f"Eye_Sclera.{side}"))
    _, n = body_hit((c.x, -2, c.z), (0, 1, 0))
    R = Vector((0, 0, 1)).cross(n).normalized()
    U = n.cross(R).normalized()
    return c, n, R, U

# key specs: T/B are top/bottom lid lines in eye-normalised coords (X outward = +1)
def KEYS(sx):
    return {
        "Blink": dict(hide=-0.27),      # squash to a line at Y=-0.27 and tuck under the skin
        "LidHalf": dict(T=lambda X: 0.08),
        "LidSad": dict(T=lambda X: 0.40 - 0.55 * X),
        "LidAngry": dict(T=lambda X: 0.40 + 0.55 * X),
        "Squint": dict(B=lambda X: -0.42 + 0.22 * (1 - X * X)),
        "Wide": dict(scale=1.14),
        "LookLeft": dict(shift=(0.16 * sx, 0.0)),       # toward the character's left (+X)
        "LookRight": dict(shift=(-0.16 * sx, 0.0)),
        "LookUp": dict(shift=(0.0, 0.14)),
        "LookDown": dict(shift=(0.0, -0.14)),
    }

def make_eye_keys():
    body = O("PIP_Body"); ss = body.modifiers.get("Subsurf"); old = ss.levels if ss else 0
    if ss:
        ss.levels = 1                  # eye domes were projected on the level-1 surface
    bpy.context.view_layer.update()
    for side, sx in (("L", 1), ("R", -1)):
        c, n, R, U = eye_frame(side)
        specs = KEYS(1)                 # R already points to world +X for both eyes
        for part in EYE_PARTS:
            o = O(f"{part}.{side}")
            mw = o.matrix_world; mi = mw.inverted()
            o.shape_key_add(name="Basis", from_mix=False)
            # eye-normalised coords + height above the face for every vertex
            data = []
            for v in o.data.vertices:
                p = mw @ v.co; rel = p - c
                X = rel.dot(R) / EYE_A; Y = rel.dot(U) / EYE_B
                hp, hn = body_hit(c + R * rel.dot(R) + U * rel.dot(U) + n * 0.5, -n)
                h = (p - hp).dot(hn) if hp is not None else 0.0
                data.append((X, Y, h))
            Xs = [d[0] for d in data]; Ys = [d[1] for d in data]
            xc = sum(Xs) / len(Xs); yc = sum(Ys) / len(Ys)
            hh = (max(Ys) - min(Ys)) / 2
            is_hl = part.startswith("Eye_Highlight")
            for kname, spec in specs.items():
                kb = o.shape_key_add(name=kname, from_mix=False)
                # outward X for lids: +X is outward on L, inward on R
                for i, (X, Y, h) in enumerate(data):
                    Xo = X * sx
                    nX, nY, collapse = X, Y, False
                    if "hide" in spec:
                        q0 = c + R * (X * 0.9 * EYE_A) + U * (spec["hide"] * EYE_B)
                        hq, hnq = body_hit(q0 + n * 0.5, -n)
                        kb.data[i].co = mi @ ((hq - hnq * 0.006) if hq is not None else q0)
                        continue
                    if "scale" in spec:
                        nX, nY = X * spec["scale"], Y * spec["scale"]
                    if "shift" in spec:
                        f = 0.0 if part == "Eye_Sclera" else (0.65 if is_hl else 1.0)
                        nX, nY = X + spec["shift"][0] * f, Y + spec["shift"][1] * f
                    T = spec.get("T"); Bf = spec.get("B")
                    if (T or Bf) and not is_hl:
                        if T:
                            nY = min(nY, T(Xo))
                        if Bf:
                            nY = max(nY, Bf(Xo))
                    elif (T or Bf) and is_hl:
                        top = T(xc * sx) - 0.05 if T else 9
                        bot = Bf(xc * sx) + 0.05 if Bf else -9
                        if top - bot < 2 * hh + 0.02:
                            collapse = True
                        else:
                            dy = 0.0
                            if yc + hh > top:
                                dy = top - (yc + hh)
                            if yc - hh + dy < bot:
                                dy = bot - (yc - hh)
                            nY = Y + dy
                    if collapse:
                        q = c - n * 0.012
                    else:
                        q0 = c + R * (nX * EYE_A) + U * (nY * EYE_B)
                        hq, hnq = body_hit(q0 + n * 0.5, -n)
                        q = (hq + hnq * h) if hq is not None else q0
                    kb.data[i].co = mi @ q
    # closed-eye arcs: basis collapsed inside the head, "Show" = modelled arc
    for side in ("L", "R"):
        c, n, R, U = eye_frame(side)
        for part in ("Eye_Closed_Happy", "Eye_Closed_Sleep"):
            o = O(f"{part}.{side}")
            mw = o.matrix_world; mi = mw.inverted()
            o.shape_key_add(name="Basis", from_mix=False)
            show = o.shape_key_add(name="Show", from_mix=False)
            cen = sum((mw @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
            hidden = mi @ (cen - n * 0.02)
            basis = o.data.shape_keys.key_blocks["Basis"]
            for i, v in enumerate(o.data.vertices):
                show.data[i].co = v.co.copy()
                basis.data[i].co = hidden
                v.co = hidden
            o.hide_render = False; o.hide_set(False)
    if ss:
        ss.levels = old

def drive(o, key, rig, expr, props=None, transforms=None):
    kb = o.data.shape_keys.key_blocks[key]
    fc = kb.driver_add("value"); d = fc.driver
    d.type = "SCRIPTED"; d.expression = expr
    for name, prop in (props or {}).items():
        v = d.variables.new(); v.name = name; v.type = "SINGLE_PROP"
        v.targets[0].id = rig; v.targets[0].data_path = f'pose.bones["face_ctrl"]["{prop}"]'
    for name, (bone, ttype) in (transforms or {}).items():
        v = d.variables.new(); v.name = name; v.type = "TRANSFORMS"
        t = v.targets[0]; t.id = rig; t.bone_target = bone
        t.transform_type = ttype; t.transform_space = "LOCAL_SPACE"
    return fc

def make_drivers(rig):
    LOOK = 0.04                         # metres of look-control travel for a full look
    for side in ("L", "R"):
        for part in EYE_PARTS:
            o = O(f"{part}.{side}")
            drive(o, "Blink", rig, "b", {"b": f"blink_{side}"})
            for k, p in (("LidHalf", "lid_half"), ("LidSad", "lid_sad"), ("LidAngry", "lid_angry"),
                         ("Squint", "squint"), ("Wide", "wide")):
                drive(o, k, rig, "v", {"v": p})
            drive(o, "LookLeft", rig, f"clamp(x/{LOOK},0,1)", transforms={"x": ("look", "LOC_X")})
            drive(o, "LookRight", rig, f"clamp(-x/{LOOK},0,1)", transforms={"x": ("look", "LOC_X")})
            drive(o, "LookUp", rig, f"clamp(y/{LOOK},0,1)", transforms={"y": ("look", "LOC_Y")})
            drive(o, "LookDown", rig, f"clamp(-y/{LOOK},0,1)", transforms={"y": ("look", "LOC_Y")})
        # the closed-eye line appears over the last 40 % of a blink; style picks ^ or –
        drive(O(f"Eye_Closed_Happy.{side}"), "Show", rig, "clamp((b-0.6)/0.4,0,1)*h",
              {"b": f"blink_{side}", "h": f"happy_eye_{side}"})
        drive(O(f"Eye_Closed_Sleep.{side}"), "Show", rig, "clamp((b-0.6)/0.4,0,1)*(1-h)",
              {"b": f"blink_{side}", "h": f"happy_eye_{side}"})

# ------------------------------------------------------------------ widgets
def widgets(rig):
    wg = bpy.data.collections.get("PIP_Widgets") or bpy.data.collections.new("PIP_Widgets")
    if wg.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(wg)
    lc = bpy.context.view_layer.layer_collection.children.get("PIP_Widgets")
    if lc:
        lc.exclude = True
    def circle(name, r=1.0, n=24):
        me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
        me.clear_geometry()
        vs = [(r * math.cos(2 * math.pi * i / n), 0, r * math.sin(2 * math.pi * i / n)) for i in range(n)]
        me.from_pydata(vs, [(i, (i + 1) % n) for i in range(n)], [])
        o = bpy.data.objects.new(name, me); wg.objects.link(o)
        return o
    wc = circle("WGT_Circle")
    pb = rig.pose.bones
    for b, sc in (("root", 4.0), ("body", 2.2), ("head", 1.0), ("IK_foot.L", 0.8), ("IK_foot.R", 0.8),
                  ("look", 0.5), ("face_ctrl", 0.6), ("neck", 3.0), ("chest", 1.8)):
        pb[b].custom_shape = wc
        pb[b].custom_shape_scale_xyz = (sc, sc, sc)
    for b in ("root", "IK_foot.L", "IK_foot.R"):
        pb[b].custom_shape_rotation_euler = (math.radians(90), 0, 0)

# ------------------------------------------------------------------ expressions
# Each: face sliders + bone poses (Euler degrees in bone local space / location in metres)
EXPRESSIONS = {
    "Neutral": dict(props={}, bones={}),
    "Happy": dict(props=dict(blink_L=1, blink_R=1, happy_eye_L=1, happy_eye_R=1),
                  bones={"jaw": dict(rot=(22, 0, 0)), "head": dict(rot=(-4, 0, 6)),
                         "blush.L": dict(scale=1.25), "blush.R": dict(scale=1.25),
                         "crest_main.01": dict(rot=(-6, 0, 0))}),
    "Excited": dict(props=dict(wide=1.0, squint=0.25),
                    bones={"jaw": dict(rot=(30, 0, 0)), "head": dict(rot=(-8, 0, 0)),
                           "blush.L": dict(scale=1.35), "blush.R": dict(scale=1.35),
                           "crest_main.01": dict(rot=(-14, 0, 0)), "crest_main.02": dict(rot=(-10, 0, 0)),
                           "eye.L": dict(scale=1.06), "eye.R": dict(scale=1.06)}),
    "Curious": dict(props=dict(wide=0.35),
                    bones={"look": dict(loc=(0.03, 0.025, 0)), "head": dict(rot=(-4, 8, -14)),
                           "crest_main.01": dict(rot=(0, 0, -10))}),
    "Thinking": dict(props=dict(lid_half=0.45, squint=0.2),
                     bones={"look": dict(loc=(-0.035, 0.035, 0)), "head": dict(rot=(-6, 6, 10)),
                            "jaw": dict(rot=(4, 0, 0))}),
    "Winking": dict(props=dict(blink_R=1, happy_eye_R=1, squint=0.3),
                    bones={"jaw": dict(rot=(18, 0, 0)), "head": dict(rot=(0, 0, -8)),
                           "blush.L": dict(scale=1.15), "blush.R": dict(scale=1.15)}),
    "Surprised": dict(props=dict(wide=1.0),
                      bones={"jaw": dict(rot=(30, 0, 0)), "head": dict(rot=(-6, 0, 0)),
                             "eye.L": dict(scale=1.1), "eye.R": dict(scale=1.1),
                             "crest_main.01": dict(rot=(-18, 0, 0)), "crest_main.02": dict(rot=(-12, 0, 0)),
                             "crest_left": dict(rot=(-12, 0, 0)), "crest_right": dict(rot=(-12, 0, 0)),
                             "blush.L": dict(scale=0.6), "blush.R": dict(scale=0.6)}),
    "Concerned": dict(props=dict(lid_sad=0.75),
                      bones={"look": dict(loc=(0.015, -0.015, 0)), "jaw": dict(rot=(6, 0, 0)),
                             "head": dict(rot=(4, 0, 6)), "crest_main.01": dict(rot=(12, 0, 0))}),
    "Sad": dict(props=dict(lid_sad=1.0, lid_half=0.25),
                bones={"look": dict(loc=(0, -0.03, 0)), "head": dict(rot=(10, 0, 4)),
                       "crest_main.01": dict(rot=(22, 0, 0)), "crest_main.02": dict(rot=(18, 0, 0)),
                       "crest_left": dict(rot=(14, 0, 0)), "crest_right": dict(rot=(14, 0, 0)),
                       "blush.L": dict(scale=0.7), "blush.R": dict(scale=0.7)}),
    "Sleeping": dict(props=dict(blink_L=1, blink_R=1),
                     bones={"head": dict(rot=(12, 0, 10)), "crest_main.01": dict(rot=(16, 0, 0)),
                            "crest_main.02": dict(rot=(14, 0, 0))}),
    "Determined": dict(props=dict(lid_angry=0.85, squint=0.45),
                       bones={"head": dict(rot=(6, 0, 0)), "jaw": dict(rot=(3, 0, 0)),
                              "crest_main.01": dict(rot=(-10, 0, 0))}),
}

def reset_pose(rig):
    for p in rig.pose.bones:
        p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
    for prop in FACE_PROPS:
        rig.pose.bones["face_ctrl"][prop] = 0.0

def apply_expression(rig, name):
    reset_pose(rig)
    e = EXPRESSIONS[name]
    for k, v in e["props"].items():
        rig.pose.bones["face_ctrl"][k] = float(v)
    for b, t in e["bones"].items():
        p = rig.pose.bones[b]
        if "rot" in t:
            p.rotation_euler = [math.radians(a) for a in t["rot"]]
        if "loc" in t:
            p.location = t["loc"]
        if "scale" in t:
            p.scale = (t["scale"],) * 3

FACE_BONES = ("head", "jaw", "look", "eye.L", "eye.R", "blush.L", "blush.R",
              "crest_main.01", "crest_main.02", "crest_left", "crest_right")

def key_face(rig, frame):
    pb = rig.pose.bones
    for prop in FACE_PROPS:
        pb["face_ctrl"].keyframe_insert(f'["{prop}"]', frame=frame, group="face_ctrl")
    for b in FACE_BONES:
        pb[b].keyframe_insert("location", frame=frame, group=b)
        pb[b].keyframe_insert("rotation_euler", frame=frame, group=b)
        pb[b].keyframe_insert("scale", frame=frame, group=b)

def make_expression_actions(rig):
    rig.animation_data_create()
    for name in EXPRESSIONS:
        act = bpy.data.actions.new(f"EXPR_{name}")
        act.use_fake_user = True
        rig.animation_data.action = act
        apply_expression(rig, name)
        key_face(rig, 1)
        try:
            act.asset_mark()
            act.asset_data.description = f"PIP face pose: {name}"
            act.asset_data.tags.new("PIP"); act.asset_data.tags.new("expression")
        except Exception:
            pass
    rig.animation_data.action = None
    reset_pose(rig)

# ------------------------------------------------------------------ main
def rig_all():
    cleanup()
    rig = build_armature()
    setup_pose(rig)
    skin(rig)
    make_eye_keys()
    make_drivers(rig)
    widgets(rig)
    make_expression_actions(rig)
    bpy.context.view_layer.update()
    return rig

if __name__ == "__main__":
    rig_all()
