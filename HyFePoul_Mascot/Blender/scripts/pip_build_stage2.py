"""PIP, HyFePoul mascot: Stage 2 model build.

Run inside Blender (Text Editor > Run Script, or exec through the Blender MCP).
Rebuilds every character object from scratch inside the PIP collections and
leaves the Stage_Render collection (camera, lights) alone.

Conventions
  * Character faces -Y (Blender front), so glTF export faces +Z (three.js default).
  * Build units: PIP is ~2.85 units tall; normalise_scale() rescales to 1.0 unit
    tall when called (done at the end of Stage 2, before rigging).
  * Every opaque part samples one atlas, T_PIP_Atlas.png (see make_atlas.py).
  * Materials: M_PIP_Main (atlas), M_PIP_Eye (atlas, glossy), M_PIP_Highlight (emissive).
  * Each object's origin sits at its pivot (hip, ankle, shoulder, beak hinge,
    crest base...) so Stage 3 can parent or skin it to bones without moving origins.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

ROOT = r"C:\Users\HP\HyFePoul-Arduino\HyFePoul_Mascot"
ATLAS = os.path.join(ROOT, "Textures", "T_PIP_Atlas.png")
Z0 = 0.24                      # body bottom height (feet stand at z=0)
HEAD_C = Vector((0, 0, 1.42 + Z0))

# ---------------------------------------------------------------- atlas UVs
def sw(i):                     # solid swatch centre
    return ((i * 64 + 32) / 1024.0, 32 / 1024.0)
SW = dict(white=0, blue=1, navy=2, orange=3, orange_dk=4, blush=5, mouth=6,
          eye_white=7, iris=8, cyan=9, light_blue=10, navy_dk=11)
def grad(row, t):              # gradient rows 1..3, t in 0..1
    t = min(max(t, 0.0), 1.0)
    return (0.004 + 0.992 * t, (row * 64 + 32) / 1024.0)
ROW_WING, ROW_IRIS, ROW_BLUE = 1, 2, 3
LOGO_W = 1.10                  # world width mapped onto the full logo region
LOGO_ZC = 0.72                 # world z of the logo region centre
def logo_uv(co):
    u = co.x / LOGO_W + 0.5
    vr = (co.z - LOGO_ZC) / (LOGO_W * 0.75) + 0.5
    return (min(max(u, 0.002), 0.998), 0.25 + 0.75 * min(max(vr, 0.004), 0.996))

# ---------------------------------------------------------------- scene setup
def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def wipe_character():
    for cname in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories", "PIP"):
        c = bpy.data.collections.get(cname)
        if c:
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for m in list(bpy.data.materials):
        if m.users == 0 or m.name.startswith("PIP_"):
            bpy.data.materials.remove(m)
    for t in ("pip_helpers.py",):
        if t in bpy.data.texts:
            bpy.data.texts.remove(bpy.data.texts[t])

def make_materials():
    img = bpy.data.images.get("T_PIP_Atlas.png")
    if img is None:
        img = bpy.data.images.load(ATLAS)
    else:
        img.filepath = ATLAS; img.reload()
    for n in ("T_PIP_Scarf_Logo.png", "app-icon.png"):
        if n in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[n])

    def base(name, rough, sheen=0.0, coat=0.0):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
        b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (100, 0)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (0.75, 0.87, 1.0, 1)
        b.inputs["Coat Weight"].default_value = coat
        nt.links.new(b.outputs[0], out.inputs[0])
        tx = nt.nodes.new("ShaderNodeTexImage"); tx.location = (-300, 0); tx.image = img
        tx.interpolation = 'Linear'
        nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
        return m, b
    main, _ = base("M_PIP_Main", 0.55, sheen=0.35)
    eye, _ = base("M_PIP_Eye", 0.06, coat=1.0)
    hl = bpy.data.materials.get("M_PIP_Highlight") or bpy.data.materials.new("M_PIP_Highlight")
    hl.use_nodes = True; nt = hl.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    b.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    b.inputs["Emission Strength"].default_value = 3.0
    nt.links.new(b.outputs[0], out.inputs[0])
    return {"main": main, "eye": eye, "hl": hl}

# ---------------------------------------------------------------- object helpers
def finish(name, bm, coll, mat, origin=None, subsurf=1, render_subsurf=2, uv_layer=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.data.collections[coll].objects.link(o)
    me.materials.append(mat)
    if origin is not None:
        origin = Vector(origin)
        me.transform(Matrix.Translation(-origin))
        o.location = origin
    if subsurf:
        s = o.modifiers.new("Subsurf", "SUBSURF")
        s.levels = subsurf; s.render_levels = render_subsurf
    return o

def set_uv(bm, fn):
    """fn(vert) -> (u, v) ; per-vertex UVs written to every loop."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = fn(l.vert)

def body_hit(origin, direction):
    dg = bpy.context.evaluated_depsgraph_get()
    b = bpy.data.objects["PIP_Body"].evaluated_get(dg)
    mw = b.matrix_world; mi = mw.inverted()
    ok, loc, nor, _ = b.ray_cast(mi @ Vector(origin), (mi.to_3x3() @ Vector(direction)).normalized())
    if not ok:
        return None, None
    return mw @ loc, (mw.to_3x3() @ nor).normalized()

def front_hit(x, z):
    return body_hit((x, -4, z), (0, 1, 0))

def radial_hit(z, ang):        # ang: 0 = front (-Y), 90 = character's left (+X)
    a = math.radians(ang); d = Vector((math.sin(a), -math.cos(a), 0))
    return body_hit(Vector((0, 0, z)) + d * 4, -d)

def bezier(p0, p1, p2, n):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        pts.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2)
    return pts

def loft(bm, spine, rx, ry, side, segs=12, tip_rings=3, base_cap=True, uvfn=None):
    """Tube along `spine` with elliptical sections (rx along `side`, ry across it),
    a rounded tip cap and an optional closed base. Returns created verts with a
    0..1 parameter stored for UVs via uvfn(s, theta) -> (u, v)."""
    n = len(spine)
    side = Vector(side)
    frames = []
    for i in range(n):
        a = spine[max(i - 1, 0)]; b = spine[min(i + 1, n - 1)]
        T = (b - a).normalized()
        X = (side - T * side.dot(T)).normalized()
        Y = T.cross(X).normalized()
        frames.append((T, X, Y))
    rings, params = [], []
    for i in range(n):
        T, X, Y = frames[i]
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            ring.append(bm.verts.new(spine[i] + X * rx[i] * math.cos(th) + Y * ry[i] * math.sin(th)))
        rings.append(ring); params.append(i / (n - 1) * 0.9)
    T, X, Y = frames[-1]
    rt = (rx[-1] + ry[-1]) * 0.5
    for k in range(1, tip_rings + 1):
        phi = k / (tip_rings + 1) * math.pi / 2
        c = spine[-1] + T * rt * math.sin(phi)
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            ring.append(bm.verts.new(c + X * rx[-1] * math.cos(phi) * math.cos(th) + Y * ry[-1] * math.cos(phi) * math.sin(th)))
        rings.append(ring); params.append(0.9 + 0.1 * k / (tip_rings + 1))
    tip = bm.verts.new(spine[-1] + T * rt)
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    for j in range(segs):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % segs], tip))
    base = None
    if base_cap:
        T0 = frames[0][0]
        base = bm.verts.new(spine[0] - T0 * min(rx[0], ry[0]) * 0.5)
        for j in range(segs):
            bm.faces.new((rings[0][(j + 1) % segs], rings[0][j], base))
    if uvfn:
        uv = bm.loops.layers.uv.verify()
        pmap = {}
        for p, ring in zip(params, rings):
            for j, v in enumerate(ring):
                pmap[v] = (p, 2 * math.pi * j / segs)
        pmap[tip] = (1.0, 0.0)
        if base is not None:
            pmap[base] = (0.0, 0.0)
        for f in bm.faces:
            for l in f.loops:
                if l.vert in pmap:
                    l[uv].uv = uvfn(*pmap[l.vert])
    return rings

def ellipsoid(bm, center, radii, rot=Euler(), segs=16, rings=10):
    g = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    R = rot.to_matrix()
    for v in g["verts"]:
        v.co = Vector(center) + R @ Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    return g["verts"]

# ---------------------------------------------------------------- body
PROFILE = [(0, 0), (0.04, 0.27), (0.14, 0.44), (0.30, 0.54), (0.46, 0.555), (0.62, 0.53),
           (0.76, 0.53), (0.90, 0.585), (1.06, 0.665), (1.24, 0.72), (1.42, 0.73),
           (1.60, 0.69), (1.76, 0.58), (1.89, 0.40), (1.98, 0.19), (2.01, 0)]

def _cr(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

def build_body(M):
    P = [PROFILE[0]] + PROFILE + [PROFILE[-1]]
    S = []
    for i in range(1, len(P) - 2):
        for k in range(2):
            t = k / 2
            S.append((_cr(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0], t),
                      max(0.0, _cr(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1], t))))
    S.append(PROFILE[-1])
    SEG = 32
    bm = bmesh.new(); rings = []
    for (z, r) in S[1:-1]:
        ring = []
        for s in range(SEG):
            a = 2 * math.pi * s / SEG; ca = math.cos(a)
            x = math.sin(a) * r * 1.04; y = -ca * r * 0.96
            y -= 0.05 * math.exp(-((z - 0.40) / 0.22) ** 2) * max(0.0, ca)   # chest / belly
            y -= 0.04 * math.exp(-((z - 1.25) / 0.30) ** 2) * max(0.0, ca)   # cheeks forward
            ring.append(bm.verts.new((x, y, z + Z0)))
        rings.append(ring)
    bot = bm.verts.new((0, 0, Z0)); top = bm.verts.new((0, 0, Z0 + S[-1][0]))
    for i in range(len(rings) - 1):
        for s in range(SEG):
            bm.faces.new((rings[i][s], rings[i][(s + 1) % SEG], rings[i + 1][(s + 1) % SEG], rings[i + 1][s]))
    for s in range(SEG):
        bm.faces.new((bot, rings[0][(s + 1) % SEG], rings[0][s]))
        bm.faces.new((top, rings[-1][s], rings[-1][(s + 1) % SEG]))
    set_uv(bm, lambda v: sw(SW["white"]))
    o = finish("PIP_Body", bm, "PIP_Body", M["main"], origin=(0, 0, Z0))
    bpy.context.view_layer.update()
    return o

# ---------------------------------------------------------------- head feathers (blue cap)
def build_cap(M):
    SEG, ROWS = 48, 10
    def e_h(theta):
        phi = abs(math.atan2(math.sin(theta), math.cos(theta))); d = math.degrees(phi)
        base = 33 - 25 * (d / 90) ** 1.6 if d <= 90 else 8 - 34 * ((d - 90) / 90) ** 1.1
        sc = (0.5 + 0.5 * math.cos(8 * theta)) ** 14
        front = 1.0 + 0.7 * math.exp(-(d / 20) ** 2)
        return math.radians(base - 13 * sc * front)
    bm = bmesh.new(); grid = []; tmap = {}
    for s in range(SEG):
        th = 2 * math.pi * s / SEG; eh = e_h(th); col = []
        for r in range(ROWS):
            t = r / ROWS; e = eh + (math.radians(88) - eh) * (t ** 0.7)
            d = Vector((math.sin(th) * math.cos(e), -math.cos(th) * math.cos(e), math.sin(e)))
            loc, nor = body_hit(HEAD_C + d * 4, -d)
            v = bm.verts.new(loc + nor * (0.008 + 0.05 * min(1, t * 3) ** 0.6)); tmap[v] = t
            col.append(v)
        grid.append(col)
    tl, _ = body_hit(HEAD_C + Vector((0, 0, 4)), Vector((0, 0, -1)))
    top = bm.verts.new(tl + Vector((0, 0, 0.06))); tmap[top] = 1.0
    for s in range(SEG):
        a, b = grid[s], grid[(s + 1) % SEG]
        for r in range(ROWS - 1):
            bm.faces.new((a[r], b[r], b[r + 1], a[r + 1]))
        bm.faces.new((a[-1], b[-1], top))
    set_uv(bm, lambda v: grad(ROW_BLUE, 0.30 + 0.25 * (1 - tmap.get(v, 0.5))))
    o = finish("PIP_Head_Feathers", bm, "PIP_Body", M["main"], origin=HEAD_C)
    sol = o.modifiers.new("Solidify", "SOLIDIFY"); sol.thickness = 0.025; sol.offset = 1.0
    o.modifiers.move(1, 0)
    return o

# ---------------------------------------------------------------- feather lobes (crest, tail)
def feather(name, coll, M, base, length, width, thick, lean, roll, curl, forward=0.0,
            uv_from=0.35, uv_to=1.0):
    """Rounded paddle-shaped feather; spine leans back (+Y) and curls."""
    R = Euler((0, math.radians(roll), 0)).to_matrix()
    up = R @ Vector((0, 0, 1)); back = Vector((0, 1, 0))
    p0 = Vector((0, 0, 0))
    p1 = up * length * 0.6 - back * forward * length
    p2 = up * length * (1 - 0.35 * curl) + back * length * (lean + curl * 0.5)
    spine = bezier(p0, p1, p2, 8)
    n = len(spine)
    # leaf profile: widest at ~40 %, narrowing to a small soft tip
    prof = [(0.55 + 0.75 * math.sin(math.pi * (i / (n - 1))) ** 0.8) * (1 - 0.6 * (i / (n - 1)) ** 1.5)
            for i in range(n)]
    rx = [width * p for p in prof]
    ry = [thick * p for p in prof]
    bm = bmesh.new()
    loft(bm, spine, rx, ry, side=R @ Vector((1, 0, 0)), segs=12, tip_rings=3,
         uvfn=lambda s, th: grad(ROW_BLUE, uv_from + (uv_to - uv_from) * s))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(base))
    return finish(name, bm, coll, M["main"], origin=base)

def build_crest(M):
    T = Vector((0, 0.02, 2.16))
    feather("Crest_Main", "PIP_Body", M, T + Vector((0, -0.05, -0.02)), 0.68, 0.19, 0.10, 0.30, 0, 0.55, forward=0.15)
    feather("Crest_Left", "PIP_Body", M, T + Vector((0.14, 0.06, -0.06)), 0.52, 0.16, 0.085, 0.38, 32, 0.45, forward=0.10)
    feather("Crest_Right", "PIP_Body", M, T + Vector((-0.14, 0.06, -0.06)), 0.52, 0.16, 0.085, 0.38, -32, 0.45, forward=0.10)
    feather("Crest_Back", "PIP_Body", M, T + Vector((0, 0.26, -0.14)), 0.34, 0.15, 0.08, 1.1, 0, 0.3)

def build_tail(M):
    tl, tn = body_hit((0, 4, 0.62), (0, -1, 0))
    b = tl + Vector((0, -0.05, 0))
    def tail(name, off, length, roll):
        o = feather(name, "PIP_Body", M, b + Vector(off), length, 0.11, 0.065, 0.9, roll, 0.15,
                    uv_from=0.45, uv_to=1.0)
        return o
    tail("Tail_Center", (0, 0, 0), 0.30, 0)
    tail("Tail_Left", (0.07, 0, -0.02), 0.25, 26)
    tail("Tail_Right", (-0.07, 0, -0.02), 0.25, -26)

# ---------------------------------------------------------------- face: conforming domes
def surface_frame(x, z):
    loc, n = front_hit(x, z)
    R = Vector((0, 0, 1)).cross(n).normalized()
    U = n.cross(R).normalized()
    return loc, n, R, U

def dome(name, coll, mat, cx, cz, a, b, height, offset, uvfn, rings=8, segs=28,
         shift=(0.0, 0.0), origin=None):
    """Disc of radii a (sideways) x b (up) projected onto the body surface and raised
    into a soft dome. Conforms to the face, so it never sticks past the head outline."""
    loc, n, R, U = surface_frame(cx, cz)
    c = loc + R * shift[0] + U * shift[1]
    bm = bmesh.new(); grid = []; lmap = {}
    def place(lx, ly, r):
        p = c + R * lx + U * ly
        h, hn = body_hit(p + n * 1.0, -n)
        if h is None:
            h, hn = p, n
        return h + hn * (offset + height * max(0.0, 1 - r * r) ** 0.6)
    centre = bm.verts.new(place(0, 0, 0)); lmap[centre] = (0.0, 0.0)
    for i in range(1, rings + 1):
        r = i / rings; ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            lx, ly = a * r * math.cos(th), b * r * math.sin(th)
            v = bm.verts.new(place(lx, ly, r)); lmap[v] = (r * math.cos(th), r * math.sin(th))
            ring.append(v)
        grid.append(ring)
    for j in range(segs):
        bm.faces.new((centre, grid[0][j], grid[0][(j + 1) % segs]))
    for i in range(rings - 1):
        for j in range(segs):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][(j + 1) % segs], grid[i][(j + 1) % segs]))
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = uvfn(*lmap[l.vert])
    o = finish(name, bm, coll, mat, origin=origin if origin is not None else c, subsurf=1, render_subsurf=2)
    return o, c, n

def build_eyes(M):
    out = {}
    for side, sx in (("L", 1), ("R", -1)):
        ex, ez = 0.28 * sx, 1.60
        scl, c, n = dome(f"Eye_Sclera.{side}", "PIP_Face", M["eye"], ex, ez, 0.158, 0.198, 0.030, 0.004,
                         lambda u, v: sw(SW["eye_white"]))
        dome(f"Eye_Iris.{side}", "PIP_Face", M["eye"], ex, ez, 0.136, 0.172, 0.030, 0.012,
             lambda u, v: grad(ROW_IRIS, 0.04 + 0.9 * ((v + 1) / 2) ** 0.55),
             shift=(-0.012 * sx, -0.006), origin=c)
        dome(f"Eye_Highlight_Big.{side}", "PIP_Face", M["hl"], ex, ez, 0.050, 0.060, 0.008, 0.050,
             lambda u, v: (0.5, 0.5), rings=4, segs=16, shift=(-0.050, 0.070), origin=c)
        dome(f"Eye_Highlight_Small.{side}", "PIP_Face", M["hl"], ex, ez, 0.022, 0.022, 0.005, 0.050,
             lambda u, v: (0.5, 0.5), rings=3, segs=12, shift=(0.052, -0.082), origin=c)
        dome(f"Blush.{side}", "PIP_Face", M["main"], 0.47 * sx, 1.43, 0.095, 0.055, 0.004, 0.003,
             lambda u, v: sw(SW["blush"]), rings=4, segs=20)
        out[side] = (c, n)
    return out

def arc_tube(name, coll, M, centre_x, centre_z, pts2d, radius, offset, swatch, origin):
    """Thin tube following 2D points (local x sideways, y up) laid on the face."""
    loc, n, R, U = surface_frame(centre_x, centre_z)
    spine = []
    for (lx, ly) in pts2d:
        p = loc + R * lx + U * ly
        h, hn = body_hit(p + n, -n)
        spine.append(h + hn * offset)
    bm = bmesh.new()
    loft(bm, spine, [radius] * len(spine), [radius * 0.8] * len(spine), side=n, segs=8, tip_rings=2,
         uvfn=lambda s, th: sw(swatch))
    o = finish(name, bm, coll, M["main"], origin=origin, subsurf=1)
    return o

def build_expression_parts(M, eyes):
    """Closed-eye shapes for blink-to-happy (^ ^), wink and sleep (- -).
    Hidden at rest; Stage 3 drives their scale from the face controls."""
    for side, sx in (("L", 1), ("R", -1)):
        c, n = eyes[side]
        ex = 0.28 * sx
        happy = [(-0.13 + 0.26 * i / 10, 0.02 + 0.09 * math.sin(math.pi * i / 10)) for i in range(11)]
        sleep = [(-0.13 + 0.26 * i / 10, -0.02 - 0.05 * math.sin(math.pi * i / 10)) for i in range(11)]
        for nm, pts in (("Eye_Closed_Happy", happy), ("Eye_Closed_Sleep", sleep)):
            o = arc_tube(f"{nm}.{side}", "PIP_Face_Expressions", M, ex, 1.60, pts, 0.020, 0.03, SW["iris"], origin=c)
            o.hide_render = True; o.hide_set(True)

# ---------------------------------------------------------------- beak
def build_beak(M):
    loc, n = front_hit(0, 1.41)
    hinge = loc + Vector((0, 0.06, 0.0))
    fwd = Vector((0, -1, 0))
    # upper beak
    sp = bezier(hinge + Vector((0, 0, 0.03)), hinge + Vector((0, -0.15, 0.035)), hinge + Vector((0, -0.25, -0.01)), 7)
    k = len(sp)
    rx = [0.20 * (1 - 0.78 * (i / (k - 1)) ** 1.3) for i in range(k)]
    ry = [0.085 * (1 - 0.62 * (i / (k - 1)) ** 1.3) for i in range(k)]
    bm = bmesh.new()
    loft(bm, sp, rx, ry, side=(1, 0, 0), segs=16, tip_rings=3, uvfn=lambda s, th: sw(SW["orange"]))
    finish("Beak_Upper", bm, "PIP_Face", M["main"], origin=hinge)
    # lower beak (jaw) — origin at hinge so it rotates open
    sp = bezier(hinge + Vector((0, 0, -0.045)), hinge + Vector((0, -0.11, -0.06)), hinge + Vector((0, -0.18, -0.065)), 6)
    k = len(sp)
    rx = [0.15 * (1 - 0.75 * (i / (k - 1)) ** 1.3) for i in range(k)]
    ry = [0.055 * (1 - 0.5 * (i / (k - 1)) ** 1.3) for i in range(k)]
    bm = bmesh.new()
    loft(bm, sp, rx, ry, side=(1, 0, 0), segs=16, tip_rings=3, uvfn=lambda s, th: sw(SW["orange"]))
    finish("Beak_Lower", bm, "PIP_Face", M["main"], origin=hinge)
    bm = bmesh.new()
    ellipsoid(bm, hinge + Vector((0, -0.07, -0.02)), (0.12, 0.08, 0.04), segs=16, rings=8)
    set_uv(bm, lambda v: sw(SW["mouth"]))
    finish("Mouth_Inner", bm, "PIP_Face", M["main"], origin=hinge)

# ---------------------------------------------------------------- wings
def build_wings(M):
    for side, sx in (("L", 1), ("R", -1)):
        sl, sn = body_hit((sx * 4, 0.02, 0.98), (-sx, 0, 0))
        shoulder = sl + Vector((-sx * 0.03, 0, 0))
        bm = bmesh.new()
        # main wing body (flattened: thin along X, wide along Y)
        sp = bezier(Vector((0, 0, 0.02)), Vector((0, 0.02, -0.22)), Vector((0, 0.07, -0.40)), 7)
        k = len(sp)
        rx = [0.085 * (1 - 0.35 * i / (k - 1)) for i in range(k)]
        ry = [0.24 * (0.80 + 0.25 * math.sin(math.pi * i / (k - 1))) for i in range(k)]
        loft(bm, sp, rx, ry, side=(1, 0, 0), segs=14, tip_rings=3,
             uvfn=lambda s, th: grad(ROW_WING, 0.30 * s))
        # three short, overlapping primary feathers that soften the wing tip
        for dy, ln in ((-0.10, 0.16), (0.0, 0.20), (0.10, 0.17)):
            b0 = Vector((0, 0.07 + dy * 0.8, -0.32))
            fs = bezier(b0, b0 + Vector((0, 0.01, -ln * 0.6)), b0 + Vector((0, 0.04 + dy * 0.5, -ln)), 6)
            kk = len(fs)
            wv = [0.10 * (0.85 + 0.3 * math.sin(math.pi * i / (kk - 1))) * (1 - 0.45 * (i / (kk - 1)) ** 2) for i in range(kk)]
            loft(bm, fs, [0.040] * kk, wv, side=(1, 0, 0), segs=10, tip_rings=3,
                 uvfn=lambda s, th: grad(ROW_WING, 0.40 + 0.55 * s))
        if sx < 0:
            for v in bm.verts:
                v.co.x = -v.co.x
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bmesh.ops.translate(bm, verts=bm.verts, vec=shoulder)
        o = finish(f"Wing.{side}", bm, "PIP_Limbs", M["main"], origin=shoulder)
        o.rotation_euler = Euler((math.radians(4), math.radians(-20 * sx), math.radians(-8 * sx)))

# ---------------------------------------------------------------- legs and feet
def build_legs(M):
    for side, sx in (("L", 1), ("R", -1)):
        hip = Vector((0.20 * sx, -0.02, 0.36))
        ankle = Vector((0.21 * sx, -0.03, 0.075))
        bm = bmesh.new()
        sp = [hip.lerp(ankle, t / 5) for t in range(6)]
        loft(bm, sp, [0.088, 0.086, 0.084, 0.082, 0.082, 0.082], [0.088, 0.086, 0.084, 0.082, 0.082, 0.082],
             side=(1, 0, 0), segs=12, tip_rings=2, uvfn=lambda s, th: sw(SW["orange"]))
        finish(f"Leg.{side}", bm, "PIP_Limbs", M["main"], origin=hip)
        bm = bmesh.new()
        yaw0 = -10 * sx
        for yaw, ln in ((-32, 0.21), (0, 0.25), (32, 0.21), (180, 0.10)):
            a = math.radians(yaw * sx + yaw0)
            d = Vector((-math.sin(a), -math.cos(a), 0))
            p0 = ankle + Vector((0, 0, -0.025))
            fs = bezier(p0, p0 + d * ln * 0.55, p0 + d * ln + Vector((0, 0, -0.02)), 5)
            loft(bm, fs, [0.062, 0.064, 0.060, 0.055, 0.050], [0.050, 0.050, 0.045, 0.040, 0.036],
                 side=(0, 0, 1), segs=8, tip_rings=2, uvfn=lambda s, th: sw(SW["orange"]))
        ellipsoid(bm, ankle + Vector((0, -0.01, -0.02)), (0.105, 0.10, 0.055), segs=14, rings=8)
        set_uv(bm, lambda v: sw(SW["orange"]))
        finish(f"Foot.{side}", bm, "PIP_Limbs", M["main"], origin=ankle)

# ---------------------------------------------------------------- scarf
def build_scarf(M):
    N, Mr, zc = 48, 10, 1.08
    ring = []
    for i in range(N):
        a = 2 * math.pi * i / N; d = Vector((math.sin(a), -math.cos(a), 0))
        z = zc - 0.05 * max(0.0, math.cos(a)) + 0.02 * max(0.0, -math.cos(a))
        loc, nor = body_hit(Vector((0, 0, z)) + d * 4, -d)
        ring.append((loc, nor))
    bm = bmesh.new(); circles = []
    for i, (loc, nor) in enumerate(ring):
        tang = (ring[(i + 1) % N][0] - ring[i - 1][0]).normalized()
        nh = Vector((nor.x, nor.y, 0)).normalized(); up = tang.cross(nh).normalized()
        if up.z < 0:
            up = -up
        wob = 0.012 * math.sin(i * 2 * math.pi / N * 7)
        c = []
        for j in range(Mr):
            b = 2 * math.pi * j / Mr
            c.append(bm.verts.new(loc + nh * (0.025 + wob * 0.5) + nh * math.cos(b) * 0.045 + up * math.sin(b) * (0.10 + wob)))
        circles.append(c)
    for i in range(N):
        a, b = circles[i], circles[(i + 1) % N]
        for j in range(Mr):
            bm.faces.new((a[j], a[(j + 1) % Mr], b[(j + 1) % Mr], b[j]))
    set_uv(bm, lambda v: sw(SW["navy"]))
    finish("Scarf_Ring", bm, "PIP_Accessories", M["main"], origin=(0, 0, zc))

    # bib with logo
    bm = bmesh.new(); W, H = 14, 12; vs = []
    for r in range(H + 1):
        v = r / H; half = 0.50 * math.cos(v * math.pi / 2) ** 0.75 + 0.02; zz = 1.07 - v * 0.60
        row = []
        for c in range(W + 1):
            u = c / W; x = (u - 0.5) * 2 * half
            zb = zz - 0.05 * (1 - (2 * u - 1) ** 2) * v
            loc, nor = front_hit(x, zb)
            row.append(bm.verts.new(loc + nor * 0.03))
        vs.append(row)
    for r in range(H):
        for c in range(W):
            bm.faces.new((vs[r][c], vs[r][c + 1], vs[r + 1][c + 1], vs[r + 1][c]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    set_uv(bm, lambda v: logo_uv(v.co))
    o = finish("Scarf_Bib", bm, "PIP_Accessories", M["main"], origin=(0, -0.5, 1.0))
    sol = o.modifiers.new("Solidify", "SOLIDIFY"); sol.thickness = 0.03; sol.offset = -1
    o.modifiers.move(1, 0)

    # knot + two tails at the back-left (tails get their own origins for secondary motion)
    kl, kn = radial_hit(1.10, 140)
    knot_c = kl + kn * 0.09
    bm = bmesh.new()
    ellipsoid(bm, knot_c, (0.09, 0.075, 0.075), rot=Euler((0, 0, math.radians(140))), segs=14, rings=8)
    set_uv(bm, lambda v: sw(SW["navy"]))
    finish("Scarf_Knot", bm, "PIP_Accessories", M["main"], origin=knot_c)
    for nm, end, w in (("Scarf_Tail_A", Vector((0.05, 0.10, -0.36)), 0.075), ("Scarf_Tail_B", Vector((0.16, 0.0, -0.28)), 0.065)):
        p0 = knot_c + kn * 0.02
        sp = bezier(p0, p0 + end * 0.5 + kn * 0.06, p0 + end, 6)
        bm = bmesh.new()
        loft(bm, sp, [w * (1 + 0.25 * i / 5) for i in range(6)], [0.022] * 6, side=kn.cross(Vector((0, 0, 1))),
             segs=10, tip_rings=2, uvfn=lambda s, th: sw(SW["navy"]))
        finish(nm, bm, "PIP_Accessories", M["main"], origin=p0)

# ---------------------------------------------------------------- final tidy
def parent_all_to_root():
    root = bpy.data.objects.get("PIP_Root")
    if root is None:
        root = bpy.data.objects.new("PIP_Root", None)
        root.empty_display_type = 'PLAIN_AXES'
    if root.name not in bpy.data.collections["PIP"].objects:
        bpy.data.collections["PIP"].objects.link(root)
    bpy.context.view_layer.update()          # matrix_world must be current before re-parenting
    for c in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories"):
        for o in bpy.data.collections[c].objects:
            if o.parent is None:
                mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
    return root

def normalise_scale(target_height=1.0):
    """Scale the built character so it stands `target_height` units tall (feet at z=0).
    Mesh data is scaled (object scale stays 1) and solidify thickness follows,
    so rigging starts from clean unit-scale transforms."""
    bpy.context.view_layer.update()
    objs = [o for c in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories")
            for o in bpy.data.collections[c].objects]
    top = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.hide_render:
            continue
        ev = o.evaluated_get(dg)
        for v in ev.to_mesh().vertices:
            top = max(top, (o.matrix_world @ v.co).z)
        ev.to_mesh_clear()
    s = target_height / top
    S = Matrix.Scale(s, 4)
    for o in objs:
        o.data.transform(S)
        o.location = o.location * s
        for m in o.modifiers:
            if m.type == "SOLIDIFY":
                m.thickness *= s
    bpy.context.scene["pip_build_scale"] = s
    bpy.context.scene["pip_height"] = target_height
    return s

def setup_stage(height=1.0):
    """Turnaround camera and lights, sized to the character. CAM_Pivot Z rotation picks the view."""
    st = collection("Stage_Render")
    for o in list(st.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    k = bpy.context.scene.get("pip_build_scale", height / 2.85)   # values below were tuned at build size
    piv = bpy.data.objects.new("CAM_Pivot", None); st.objects.link(piv)
    cam = bpy.data.objects.new("CAM_Turnaround", bpy.data.cameras.get("CAM_Turnaround") or bpy.data.cameras.new("CAM_Turnaround"))
    st.objects.link(cam); cam.parent = piv
    cam.data.lens = 100; cam.data.clip_start = 0.01 * k; cam.data.clip_end = 100 * k
    cam.location = (0, -9.2 * k, 1.43 * k); cam.rotation_euler = (math.radians(89), 0, 0)
    bpy.context.scene.camera = cam
    def light(name, loc, energy, size, rgb):
        L = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
        L.type = "AREA"; L.energy = energy * k * k; L.size = size * k; L.color = rgb
        o = bpy.data.objects.new(name, L); st.objects.link(o); o.parent = piv
        o.location = Vector(loc) * k
        d = Vector((0, 0, 1.2 * k)) - o.location
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    light("LGT_Key", (-3.5, -4.5, 4.0), 520, 3.0, (1.0, 0.965, 0.925))
    light("LGT_Fill", (4.5, -3.5, 1.8), 200, 4.0, (0.86, 0.91, 1.0))
    light("LGT_Rim", (1.5, 4.5, 3.5), 500, 2.5, (0.56, 0.84, 1.0))
    light("LGT_Rim2", (-3.0, 4.0, 2.0), 260, 2.5, (0.31, 0.55, 1.0))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"; sc.render.film_transparent = True
    sc.render.resolution_x = 1000; sc.render.resolution_y = 1150
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"; sc.view_settings.exposure = -0.2
    sc.eevee.taa_render_samples = 128
    sc.unit_settings.system = "METRIC"; sc.unit_settings.scale_length = 1.0

WEB_SUBSURF = {"PIP_Head_Feathers": 1, "Scarf_Bib": 1}   # everything else exports at base level

def set_web_levels():
    """Viewport subsurf level = what the glTF export bakes (about 23k triangles).
    Render level stays 2 for offline preview renders."""
    for c in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories"):
        for o in bpy.data.collections[c].objects:
            m = o.modifiers.get("Subsurf")
            if m:
                m.levels = WEB_SUBSURF.get(o.name, 0)
                m.render_levels = 2

def stats():
    dg = bpy.context.evaluated_depsgraph_get(); tris = 0; per = {}
    for c in ("PIP_Body", "PIP_Face", "PIP_Limbs", "PIP_Accessories"):
        for o in bpy.data.collections[c].objects:
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles(); n = len(me.loop_triangles); tris += n; per[o.name] = n
            o.evaluated_get(dg).to_mesh_clear()
    return tris, per

def build():
    P = collection("PIP")
    for c in ("PIP_Body", "PIP_Face", "PIP_Face_Expressions", "PIP_Limbs", "PIP_Accessories"):
        collection(c, P)
    wipe_character()
    M = make_materials()
    build_body(M)
    build_cap(M)
    build_crest(M)
    build_tail(M)
    eyes = build_eyes(M)
    build_expression_parts(M, eyes)
    build_beak(M)
    build_wings(M)
    build_legs(M)
    build_scarf(M)
    normalise_scale(1.0)
    parent_all_to_root()
    setup_stage(1.0)
    set_web_levels()
    return stats()

if __name__ == "__main__":
    print(build())
