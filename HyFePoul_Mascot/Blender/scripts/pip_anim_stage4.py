"""PIP, HyFePoul mascot: Stage 4 animation library.

Run inside Blender on PIP_Stage3_Rig_v01.blend, then call build_all().
Every clip is its own Action on PIP_Rig (30 fps). Each clip keys the whole body
plus the face sliders, so it plays on its own in three.js (no layering needed).
Loops are in place: the website moves PIP; clips never translate the root
across the floor.

Pose values are written in *world-aligned rest space* (degrees / metres):
  rot X +  lean or nod forward          rot Z +  turn to PIP's left (viewer's right)
  rot Y +  roll the top toward PIP's left
  loc Y -  forward                      loc Z +  up
Wings: wing(side, out=deg raise sideways, fwd=deg swing forward, tip=deg curl).
"""
import bpy, math
from mathutils import Euler, Matrix, Vector
from bpy_extras import anim_utils

FPS = 30
R = math.radians
TAU = 2 * math.pi

FACE_PROPS = ("blink_L", "blink_R", "happy_eye_L", "happy_eye_R", "lid_half", "lid_sad",
              "lid_angry", "squint", "wide")

# ------------------------------------------------------------------ easing / timelines
def smooth(t):
    t = min(max(t, 0.0), 1.0); return t * t * (3 - 2 * t)
def ease_out(t):
    t = min(max(t, 0.0), 1.0); return 1 - (1 - t) ** 3
def ease_in(t):
    t = min(max(t, 0.0), 1.0); return t ** 3
def back_out(t, s=1.9):
    t = min(max(t, 0.0), 1.0) - 1; return t * t * ((s + 1) * t + s) + 1
EASE = {"s": smooth, "o": ease_out, "i": ease_in, "b": back_out, "l": lambda t: min(max(t, 0.0), 1.0)}

def tl(f, keys):
    """Piecewise timeline. keys: [(frame, value[, ease])]; value float or tuple.
    The ease of a key shapes the segment that *arrives* at it (default smooth)."""
    if f <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if f <= b[0]:
            e = EASE[b[2] if len(b) > 2 else "s"]
            t = e((f - a[0]) / (b[0] - a[0]))
            va, vb = a[1], b[1]
            if isinstance(va, tuple):
                return tuple(x + (y - x) * t for x, y in zip(va, vb))
            return va + (vb - va) * t
    return keys[-1][1]

def blink(f, at, close=3, hold=1, open_=5):
    """Blink value 0..1 for blinks starting at each frame in `at`."""
    v = 0.0
    for s in at:
        if s <= f < s + close:
            v = max(v, smooth((f - s) / close))
        elif s + close <= f < s + close + hold:
            v = 1.0
        elif s + close + hold <= f < s + close + hold + open_:
            v = max(v, 1 - smooth((f - s - close - hold) / open_))
    return v

def wave(f, period, phase=0.0):
    return math.sin(TAU * (f / period + phase))

# ------------------------------------------------------------------ pose builder
class Pose:
    def __init__(self):
        self.b = {}           # bone -> dict(rot=[x,y,z], loc=[x,y,z], scl=[x,y,z])
        self.face = {}
    def _g(self, bone):
        return self.b.setdefault(bone, {"rot": [0.0, 0.0, 0.0], "loc": [0.0, 0.0, 0.0], "scl": [1.0, 1.0, 1.0]})
    def rot(self, bone, x=0.0, y=0.0, z=0.0):
        g = self._g(bone)["rot"]; g[0] += x; g[1] += y; g[2] += z; return self
    def loc(self, bone, x=0.0, y=0.0, z=0.0):
        g = self._g(bone)["loc"]; g[0] += x; g[1] += y; g[2] += z; return self
    def scl(self, bone, x=1.0, y=None, z=None):
        y = x if y is None else y; z = x if z is None else z
        g = self._g(bone)["scl"]; g[0] *= x; g[1] *= y; g[2] *= z; return self
    def squash(self, bone, a):
        """Volume-preserving squash (a>0) / stretch (a<0) along world Z."""
        return self.scl(bone, 1 + a * 0.5, 1 + a * 0.5, 1 - a)
    def wing(self, side, out=0.0, fwd=0.0, tip=0.0, tip_fwd=0.0):
        sx = 1 if side == "L" else -1
        self.rot(f"wing.{side}", x=-fwd, y=-out * sx)
        self.rot(f"wing_tip.{side}", x=-tip_fwd, y=-tip * sx)
        return self
    def look(self, x=0.0, z=0.0):            # x + = PIP's left, z + = up (metres, ±0.04 full)
        return self.loc("look", x=x, z=z)
    def feet(self, side, x=0.0, y=0.0, z=0.0, pitch=0.0):
        self.loc(f"IK_foot.{side}", x, y, z); self.rot(f"IK_foot.{side}", x=pitch); return self
    def f(self, **kw):
        for k, v in kw.items():
            self.face[k] = max(self.face.get(k, 0.0), v) if k.startswith("blink") else v
        return self

# ------------------------------------------------------------------ shared layers
def breathe(p, f, amp=1.0, period=60):
    s = wave(f, period)
    p.scl("chest", 1 + 0.010 * amp * s, 1 + 0.010 * amp * s, 1 + 0.018 * amp * s)
    p.loc("body", z=0.0025 * amp * (s + 0))
    p.rot("head", x=-0.8 * amp * s)
    p.wing("L", out=1.5 * amp * (s + 1)); p.wing("R", out=1.5 * amp * (s + 1))
    p.rot("crest_main.01", x=1.5 * amp * wave(f, period, -0.12))
    p.rot("crest_main.02", x=1.5 * amp * wave(f, period, -0.2))
    return p

def sway_secondary(p, f, amp=1.0, period=60):
    p.rot("tail_center", z=3 * amp * wave(f, period, 0.1))
    p.rot("tail_left", z=3 * amp * wave(f, period, 0.15)); p.rot("tail_right", z=3 * amp * wave(f, period, 0.05))
    for t in ("scarf_tail_a", "scarf_tail_b"):
        p.rot(f"{t}.01", x=3 * amp * wave(f, period, 0.2)); p.rot(f"{t}.02", x=4 * amp * wave(f, period, 0.3))
    return p

def follow(p, f, fn, lag=3, gain=1.0):
    """Crest/tail/scarf follow-through from the body's vertical speed."""
    dz = (fn(f) - fn(f - lag)) * gain
    p.rot("crest_main.01", x=-dz * 260); p.rot("crest_main.02", x=-dz * 320)
    p.rot("crest_left", x=-dz * 200); p.rot("crest_right", x=-dz * 200)
    for t in ("scarf_tail_a", "scarf_tail_b"):
        p.rot(f"{t}.01", x=dz * 300); p.rot(f"{t}.02", x=dz * 360)
    p.rot("tail_center", x=-dz * 150)
    return p

# ------------------------------------------------------------------ LOCOMOTION
def idle(f, amp=1.0):
    p = Pose(); breathe(p, f, amp); sway_secondary(p, f, 0.6 * amp, 120)
    p.rot("head", y=1.5 * amp * wave(f, 120), z=2.0 * amp * wave(f, 120, 0.25))
    p.f(blink_L=blink(f, (38, 96)), blink_R=blink(f, (38, 96)))
    return p

def blink_clip(f):
    p = idle(f, 0.4); p.f(blink_L=blink(f, (1,)), blink_R=blink(f, (1,))); return p

def look_around(f):
    p = idle(f, 0.8)
    yaw = tl(f, [(0, 0.0), (14, 26.0), (42, 26.0), (54, 0.0), (66, -26.0), (94, -26.0), (108, 0.0), (120, 0.0)])
    lk = tl(f, [(0, 0.0), (10, 0.038), (42, 0.038), (52, 0.0), (62, -0.038), (94, -0.038), (104, 0.0), (120, 0.0)])
    p.rot("head", z=yaw, y=-yaw * 0.25, x=-3 * abs(yaw) / 26)
    p.rot("chest", z=yaw * 0.25)
    p.look(x=lk, z=0.01 * abs(lk) / 0.038)
    p.rot("crest_main.01", z=-yaw * 0.25)
    p.f(blink_L=blink(f, (10, 60, 102)), blink_R=blink(f, (10, 60, 102)), wide=0.25 * abs(lk) / 0.038)
    return p

def walk_layer(p, f, period=30, stride=0.045, lift=0.042, bob=0.014, lean=4.0, arms=18.0):
    """In-place walk; contact at phase 0 (L) and 0.5 (R)."""
    ph = (f % period) / period
    for side, off in (("L", 0.0), ("R", 0.5)):
        q = (ph + off) % 1.0
        if q < 0.5:                                    # stance: slide front -> back
            u = q / 0.5
            y = -stride + 2 * stride * u; z = 0.0
            pitch = tl(u, [(0, -12.0), (0.18, 0.0), (0.8, 0.0), (1.0, 14.0)])
        else:                                          # swing: lift and come forward
            u = (q - 0.5) / 0.5
            y = stride - 2 * stride * smooth(u); z = lift * math.sin(math.pi * u) ** 1.3
            pitch = tl(u, [(0, 14.0), (0.35, 20.0), (0.8, -6.0), (1.0, -12.0)])
        p.feet(side, y=y, z=z, pitch=pitch)
    c2 = math.cos(TAU * ph * 2)                        # two bobs per cycle (low at contact)
    p.loc("body", z=-bob * 0.5 + bob * 0.5 * -c2)
    p.loc("body", x=0.008 * math.cos(TAU * ph))       # weight shift toward the stance foot
    p.rot("body", y=-lean * math.cos(TAU * ph), z=5 * math.sin(TAU * ph), x=3.0)
    p.rot("chest", z=-3 * math.sin(TAU * ph))
    p.rot("head", y=lean * 0.6 * math.cos(TAU * ph - 0.6), z=-2 * math.sin(TAU * ph))
    sw = arms * math.sin(TAU * ph)
    p.wing("L", fwd=sw, out=6); p.wing("R", fwd=-sw, out=6)
    p.wing("L", tip_fwd=sw * 0.4); p.wing("R", tip_fwd=-sw * 0.4)
    p.rot("crest_main.01", x=4 * math.cos(TAU * (ph * 2 - 0.15)))
    p.rot("crest_main.02", x=5 * math.cos(TAU * (ph * 2 - 0.25)))
    p.rot("crest_left", x=3 * math.cos(TAU * (ph * 2 - 0.2))); p.rot("crest_right", x=3 * math.cos(TAU * (ph * 2 - 0.2)))
    p.rot("tail_center", z=8 * math.sin(TAU * (ph - 0.15)))
    p.rot("tail_left", z=8 * math.sin(TAU * (ph - 0.2))); p.rot("tail_right", z=8 * math.sin(TAU * (ph - 0.1)))
    for t, k in (("scarf_tail_a", 0.0), ("scarf_tail_b", 0.08)):
        p.rot(f"{t}.01", x=6 * math.cos(TAU * (ph * 2 - 0.25 - k)), z=4 * math.sin(TAU * (ph - 0.2)))
        p.rot(f"{t}.02", x=8 * math.cos(TAU * (ph * 2 - 0.35 - k)))
    return p

def walk(f):
    p = walk_layer(Pose(), f)
    p.f(blink_L=blink(f, (20,)), blink_R=blink(f, (20,)))
    return p

def run(f):
    P_ = 18
    p = walk_layer(Pose(), f, period=P_, stride=0.07, lift=0.075, bob=0.03, lean=6.0, arms=10.0)
    ph = (f % P_) / P_
    p.loc("root", z=0.018 * max(0.0, -math.cos(TAU * ph * 2)))      # brief float between steps
    p.rot("body", x=11.0)
    p.rot("head", x=-8.0)
    p.wing("L", out=38 + 14 * math.sin(TAU * ph * 2)); p.wing("R", out=38 + 14 * math.sin(TAU * ph * 2 + 0.4))
    p.wing("L", tip=18); p.wing("R", tip=18)
    p.rot("crest_main.01", x=-16); p.rot("crest_main.02", x=-14); p.rot("crest_left", x=-12); p.rot("crest_right", x=-12)
    for t in ("scarf_tail_a", "scarf_tail_b"):
        p.rot(f"{t}.01", x=-35 + 8 * math.sin(TAU * ph * 2)); p.rot(f"{t}.02", x=-25 + 12 * math.sin(TAU * ph * 2 + 1))
    p.rot("tail_center", x=-15); p.rot("tail_left", x=-12); p.rot("tail_right", x=-12)
    p.f(squint=0.35, lid_angry=0.25)
    p.rot("jaw", x=10)
    return p

def turn(f):
    """In-place turn of 90° to PIP's left (the root ends rotated +90° about Z)."""
    p = idle(f, 0.4)
    yaw = tl(f, [(0, 0.0), (6, -6.0, "o"), (24, 90.0, "s"), (30, 90.0)])
    p.rot("root", z=yaw)
    p.rot("head", z=tl(f, [(0, 0.0), (4, 0.0), (12, 28.0), (24, 0.0, "o")]))
    p.look(x=tl(f, [(0, 0.0), (4, 0.035), (16, 0.0)]))
    p.rot("body", y=tl(f, [(0, 0.0), (6, -5.0), (16, 6.0), (26, 0.0)]))
    p.feet("L", z=tl(f, [(0, 0.0), (8, 0.0), (12, 0.04), (16, 0.0)]))
    p.feet("R", z=tl(f, [(0, 0.0), (15, 0.0), (19, 0.04), (23, 0.0)]))
    bz = lambda g: tl(g, [(0, 0.0), (6, -0.012), (12, 0.004), (18, -0.008), (26, 0.0)])
    p.loc("body", z=bz(f)); follow(p, f, bz)
    p.wing("L", out=tl(f, [(0, 0.0), (10, 18.0), (26, 0.0)])); p.wing("R", out=tl(f, [(0, 0.0), (10, 10.0), (26, 0.0)]))
    p.f(blink_L=blink(f, (2,)), blink_R=blink(f, (2,)))
    return p

def stop(f):
    """From a walking lean to a skidding stop and settle (ends at the idle pose)."""
    p = Pose(); breathe(p, f, tl(f, [(0, 0.0), (24, 1.0)]))
    p.rot("body", x=tl(f, [(0, 8.0), (5, -12.0, "o"), (12, 4.0), (18, -1.5), (24, 0.0)]))
    bz = lambda g: tl(g, [(0, 0.0), (5, -0.025, "o"), (12, 0.004), (18, -0.004), (24, 0.0)])
    p.loc("body", z=bz(f)); p.squash("body", tl(f, [(0, 0.0), (5, 0.07, "o"), (12, -0.02), (18, 0.0)]))
    p.feet("L", y=tl(f, [(0, -0.04), (5, -0.055, "o"), (24, 0.0)]), pitch=tl(f, [(0, -10.0), (5, -18.0), (14, 0.0)]))
    p.feet("R", y=tl(f, [(0, 0.035), (5, 0.03), (14, 0.0)]))
    p.wing("L", out=tl(f, [(0, 6.0), (6, 45.0, "o"), (16, 5.0), (24, 0.0)]), fwd=tl(f, [(0, -10.0), (6, 15.0), (20, 0.0)]))
    p.wing("R", out=tl(f, [(0, 6.0), (6, 45.0, "o"), (16, 5.0), (24, 0.0)]), fwd=tl(f, [(0, 10.0), (6, 15.0), (20, 0.0)]))
    p.rot("crest_main.01", x=tl(f, [(0, -6.0), (7, 22.0, "o"), (14, -8.0), (20, 3.0), (24, 0.0)]))
    p.rot("crest_main.02", x=tl(f, [(0, -6.0), (8, 20.0, "o"), (15, -8.0), (21, 2.0), (24, 0.0)]))
    for t in ("scarf_tail_a", "scarf_tail_b"):
        p.rot(f"{t}.01", x=tl(f, [(0, -10.0), (7, 25.0), (16, -6.0), (24, 0.0)]))
    p.f(wide=tl(f, [(0, 0.0), (5, 0.6), (16, 0.0)]))
    p.rot("jaw", x=tl(f, [(0, 0.0), (5, 14.0), (14, 0.0)]))
    return p

def sleep(f):
    P_ = 120
    s = wave(f, P_)
    p = Pose()
    p.rot("body", x=6.0); p.loc("body", z=-0.012 + 0.004 * s); p.squash("body", 0.03)
    p.scl("chest", 1 + 0.02 * s, 1 + 0.02 * s, 1 + 0.03 * s)
    p.rot("head", x=16.0 - 2.5 * s, y=10.0, z=4.0)
    p.rot("crest_main.01", x=22 - 2 * wave(f, P_, -0.1)); p.rot("crest_main.02", x=20 - 3 * wave(f, P_, -0.2))
    p.rot("crest_left", x=14); p.rot("crest_right", x=14); p.rot("crest_back", x=6)
    p.wing("L", out=-4, fwd=6); p.wing("R", out=-4, fwd=6)
    p.rot("tail_center", x=12); p.rot("tail_left", x=12); p.rot("tail_right", x=12)
    p.rot("jaw", x=2 + 2 * max(0.0, s))
    p.scl("blush.L", 1.1); p.scl("blush.R", 1.1)
    p.f(blink_L=1.0, blink_R=1.0)
    sway_secondary(p, f, 0.4, P_)
    return p

# ------------------------------------------------------------------ PERSONALITY
def wave_clip(f):
    p = idle(f, 0.6)
    up = tl(f, [(0, 0.0), (10, 1.0, "b"), (48, 1.0), (60, 0.0)])
    osc = math.sin(TAU * (f - 10) / 12) if 10 <= f <= 48 else 0.0
    p.wing("R", out=100 * up + 10 * osc * up, fwd=32 * up, tip=40 * up + 28 * osc * up)
    p.wing("L", out=6 * up)
    p.rot("head", y=-8 * up, z=-6 * up, x=-4 * up)
    p.rot("body", y=4 * up * math.sin(TAU * f / 24))
    p.rot("jaw", x=18 * up); p.f(squint=0.45 * up)
    p.scl("blush.L", 1 + 0.2 * up); p.scl("blush.R", 1 + 0.2 * up)
    return p

def jump_core(f, t0, height=0.14, air=16, tuck=True):
    """Anticipation, take-off, air, landing. Returns (root_z, body squash, airborne 0..1)."""
    t = f - t0
    z = 0.0
    if 8 <= t <= 8 + air:
        u = (t - 8) / air; z = height * 4 * u * (1 - u)
    sq = tl(t, [(-1, 0.0), (0, 0.0), (7, 0.10, "o"), (9, -0.10), (14, -0.03), (8 + air - 2, -0.04),
                (8 + air + 2, 0.10, "o"), (8 + air + 7, -0.03), (8 + air + 12, 0.0)])
    bz = tl(t, [(-1, 0.0), (0, 0.0), (7, -0.03, "o"), (9, 0.0), (8 + air, 0.0), (8 + air + 2, -0.03, "o"),
                (8 + air + 8, 0.004), (8 + air + 12, 0.0)])
    air_v = smooth((t - 8) / 3) * (1 - smooth((t - 8 - air + 3) / 3))
    return z, sq, bz, air_v

def apply_jump(p, f, t0, height=0.14, air=16):
    z, sq, bz, a = jump_core(f, t0, height, air)
    p.loc("root", z=z); p.squash("body", sq); p.loc("body", z=bz)
    for s in ("L", "R"):
        p.feet(s, z=0.03 * a, pitch=-22 * a)
    follow(p, f, lambda g: jump_core(g, t0, height, air)[0] + jump_core(g, t0, height, air)[2], lag=3, gain=0.6)
    return a

def happy_jump(f):
    p = idle(f, 0.4)
    a = apply_jump(p, f, 4)
    p.wing("L", out=20 + 85 * a, tip=20 * a); p.wing("R", out=20 + 85 * a, tip=20 * a)
    p.rot("head", x=-8 * a)
    hap = tl(f, [(0, 0.0), (10, 1.0), (34, 1.0), (42, 0.0)])
    p.f(blink_L=hap, blink_R=hap, happy_eye_L=1.0, happy_eye_R=1.0)
    p.rot("jaw", x=22 * hap); p.scl("blush.L", 1 + 0.3 * hap); p.scl("blush.R", 1 + 0.3 * hap)
    return p

def celebrate(f):
    p = idle(f, 0.4)
    a1 = apply_jump(p, f, 2, 0.12, 14)
    a2 = apply_jump(p, f, 30, 0.18, 18)
    a = max(a1, a2)
    p.rot("root", z=tl(f, [(0, 0.0), (38, 0.0), (54, 360.0, "s"), (75, 360.0)]))
    flap = math.sin(TAU * f / 6)
    up = tl(f, [(0, 0.0), (8, 1.0), (60, 1.0), (75, 0.0)])
    p.wing("L", out=up * (95 + 25 * flap), tip=up * 25 * flap); p.wing("R", out=up * (95 + 25 * flap), tip=up * 25 * flap)
    p.rot("head", x=-6 * up, y=6 * math.sin(TAU * f / 30) * up)
    hap = tl(f, [(0, 0.0), (6, 1.0), (66, 1.0), (75, 0.0)])
    p.f(blink_L=hap, blink_R=hap, happy_eye_L=1.0, happy_eye_R=1.0)
    p.rot("jaw", x=24 * hap); p.scl("blush.L", 1 + 0.35 * hap); p.scl("blush.R", 1 + 0.35 * hap)
    for t in ("tail_left", "tail_right"):
        p.rot(t, z=(14 if t == "tail_left" else -14) * up)
    return p

def point(f):
    p = idle(f, 0.6)
    up = tl(f, [(0, 0.0), (6, -0.15), (14, 1.0, "b"), (46, 1.0), (60, 0.0)])
    pump = 6 * math.sin(TAU * (f - 14) / 16) if 14 <= f <= 46 else 0.0
    p.wing("L", out=35 * up, fwd=80 * up + pump, tip=-10 * up)
    p.rot("head", z=18 * up, x=-4 * up); p.rot("chest", z=8 * up); p.rot("body", y=-3 * up)
    p.look(x=0.03 * max(up, 0))
    p.f(wide=0.4 * max(up, 0)); p.rot("jaw", x=12 * max(up, 0))
    p.f(blink_L=blink(f, (50,)), blink_R=blink(f, (50,)))
    return p

def think(f):
    p = idle(f, 0.5)
    up = tl(f, [(0, 0.0), (14, 1.0), (76, 1.0), (90, 0.0)])
    tap = (math.sin(TAU * (f - 26) / 10) if 26 <= f <= 56 else 0.0)
    p.wing("R", out=-32 * up, fwd=122 * up, tip=-30 * up + 12 * tap * up)
    p.rot("head", y=10 * up, z=-8 * up, x=-6 * up); p.rot("body", y=3 * up)
    p.look(x=-0.032 * up, z=0.03 * up)
    p.f(lid_half=0.35 * up, squint=0.2 * up)
    p.rot("jaw", x=3 * up)
    p.rot("crest_main.01", z=-6 * up)
    # "aha" at the end
    aha = tl(f, [(0, 0.0), (62, 0.0), (68, 1.0, "o"), (78, 0.0)])
    p.f(wide=aha * 0.7); p.rot("crest_main.01", x=-14 * aha); p.rot("crest_main.02", x=-10 * aha)
    return p

def head_tilt(f):
    p = idle(f, 0.6)
    t = tl(f, [(0, 0.0), (8, 1.15, "o"), (14, 0.95), (18, 1.0), (32, 1.0), (45, 0.0)])
    p.rot("head", y=-18 * t, x=-3 * t)
    p.rot("crest_main.01", y=tl(f, [(0, 0.0), (10, 10.0), (16, -4.0), (22, 0.0)]))
    p.look(x=-0.012 * t, z=0.012 * t); p.f(wide=0.3 * t)
    p.f(blink_L=blink(f, (24,)), blink_R=blink(f, (24,)))
    return p

def wing_flap(f):
    p = idle(f, 0.4)
    env = tl(f, [(0, 0.0), (5, 1.0), (38, 1.0), (45, 0.0)])
    flap = 0.5 + 0.5 * math.sin(TAU * f / 8 - math.pi / 2)
    p.wing("L", out=env * (20 + 75 * flap), tip=env * 30 * (flap - 0.5)); p.wing("R", out=env * (20 + 75 * flap), tip=env * 30 * (flap - 0.5))
    hop = env * 0.025 * max(0.0, math.sin(TAU * f / 8))
    p.loc("root", z=hop)
    p.squash("body", -0.03 * env * math.sin(TAU * f / 8))
    p.f(wide=0.8 * env, squint=0.2 * env); p.rot("jaw", x=22 * env)
    p.rot("crest_main.01", x=-8 * env * math.sin(TAU * f / 8 + 1)); p.rot("crest_main.02", x=-10 * env * math.sin(TAU * f / 8 + 1.5))
    p.scl("blush.L", 1 + 0.3 * env); p.scl("blush.R", 1 + 0.3 * env)
    return p

def concerned(f):
    p = idle(f, 0.8)
    c = tl(f, [(0, 0.0), (12, 1.0), (62, 1.0), (75, 0.0)])
    p.f(lid_sad=0.8 * c); p.rot("jaw", x=5 * c)
    p.wing("L", fwd=45 * c, out=-14 * c, tip=-20 * c); p.wing("R", fwd=45 * c, out=-14 * c, tip=-20 * c)
    p.scl("body", 1 - 0.03 * c); p.rot("body", x=4 * c)
    p.rot("head", x=6 * c, y=6 * c * math.sin(TAU * f / 40))
    p.look(x=0.02 * c * math.sin(TAU * f / 36), z=-0.01 * c)
    p.rot("crest_main.01", x=16 * c); p.rot("crest_main.02", x=12 * c)
    p.feet("L", z=0.012 * c * max(0.0, math.sin(TAU * f / 20))); p.feet("R", z=0.012 * c * max(0.0, -math.sin(TAU * f / 20)))
    p.f(blink_L=blink(f, (40,)), blink_R=blink(f, (40,)))
    return p

# ------------------------------------------------------------------ WEBSITE
def appear(f):
    p = idle(f, tl(f, [(0, 0.0), (30, 1.0)]))
    s = tl(f, [(0, 0.0), (10, 1.15, "o"), (15, 0.94), (20, 1.03), (25, 1.0)])
    p.scl("root", max(s, 0.0001))
    p.loc("root", z=tl(f, [(0, 0.0), (8, 0.06, "o"), (14, 0.0, "i"), (45, 0.0)]))
    p.squash("body", tl(f, [(0, -0.1), (8, -0.08), (14, 0.08), (20, -0.02), (26, 0.0)]))
    open_ = tl(f, [(0, 0.0), (8, 1.0, "o"), (30, 1.0), (45, 0.0)])
    p.wing("L", out=80 * open_, tip=15 * open_); p.wing("R", out=80 * open_, tip=15 * open_)
    hap = tl(f, [(0, 1.0), (24, 1.0), (32, 0.0)])
    p.f(blink_L=hap, blink_R=hap, happy_eye_L=1.0, happy_eye_R=1.0)
    p.rot("jaw", x=20 * open_)
    p.rot("crest_main.01", x=tl(f, [(0, -20.0), (12, -20.0), (18, 12.0), (24, -4.0), (30, 0.0)]))
    p.rot("crest_main.02", x=tl(f, [(0, -18.0), (13, -18.0), (20, 12.0), (26, -3.0), (32, 0.0)]))
    return p

def roam(f):
    p = walk_layer(Pose(), f)
    yaw = 20 * math.sin(TAU * f / 60)
    p.rot("head", z=yaw); p.look(x=0.03 * math.sin(TAU * f / 60 + 0.4))
    p.f(blink_L=blink(f, (28,)), blink_R=blink(f, (28,)), wide=0.15)
    return p

def look_at_component(side):
    sx = 1 if side == "L" else -1                 # "L" = toward PIP's left (viewer's right)
    def fn(f):
        p = idle(f, 0.6)
        t = tl(f, [(0, 0.0), (12, 1.0, "b"), (60, 1.0)])
        p.rot("head", z=34 * sx * t, x=12 * t, y=6 * sx * t)
        p.rot("chest", z=10 * sx * t); p.rot("body", x=6 * t, z=6 * sx * t)
        p.look(x=0.034 * sx * t, z=-0.02 * t)
        p.f(wide=tl(f, [(0, 0.0), (10, 0.6), (30, 0.3)]))
        p.wing("L" if side == "L" else "R", out=25 * t, fwd=45 * t)
        p.rot("crest_main.01", x=tl(f, [(0, 0.0), (10, 12.0), (18, -4.0), (26, 0.0)]))
        p.f(blink_L=blink(f, (34,)), blink_R=blink(f, (34,)))
        return p
    return fn

def low_water(f):
    p = idle(f, 0.6)
    st = tl(f, [(0, 0.0), (4, 1.0, "o"), (12, 0.6), (50, 0.6), (90, 0.4)])
    p.loc("root", z=tl(f, [(0, 0.0), (3, 0.03, "o"), (8, 0.0, "i")]))
    p.squash("body", tl(f, [(0, 0.0), (3, -0.06), (9, 0.05), (14, 0.0)]))
    # hands to cheeks, then shake head "oh no"
    ch = tl(f, [(0, 0.0), (8, 1.0, "o"), (44, 1.0), (54, 0.0)])
    p.wing("L", out=20 * ch, fwd=120 * ch, tip=-40 * ch); p.wing("R", out=20 * ch, fwd=120 * ch, tip=-40 * ch)
    shake = 14 * math.sin(TAU * (f - 14) / 12) if 14 <= f <= 44 else 0.0
    p.rot("head", z=shake * tl(f, [(14, 0.0), (18, 1.0), (40, 1.0), (44, 0.0)]))
    p.f(wide=tl(f, [(0, 0.0), (4, 1.0), (16, 0.2)]), lid_sad=tl(f, [(0, 0.0), (10, 0.0), (20, 0.85)]))
    p.rot("jaw", x=tl(f, [(0, 0.0), (4, 24.0), (14, 8.0), (90, 6.0)]))
    p.rot("crest_main.01", x=tl(f, [(0, 0.0), (4, -18.0), (14, 14.0), (90, 14.0)]))
    p.rot("crest_main.02", x=tl(f, [(0, 0.0), (5, -14.0), (15, 12.0), (90, 12.0)]))
    # point at the water gauge (to PIP's left)
    pt = tl(f, [(0, 0.0), (52, 0.0), (62, 1.0, "b"), (90, 1.0)])
    p.wing("L", out=35 * pt, fwd=80 * pt)
    p.rot("head", z=20 * pt); p.look(x=0.032 * pt)
    p.f(blink_L=blink(f, (70,)), blink_R=blink(f, (70,)))
    return p

def low_feed(f):
    p = idle(f, 0.6)
    d = tl(f, [(0, 0.0), (14, 1.0), (90, 1.0)])
    p.rot("head", x=20 * d, y=8 * d); p.rot("body", x=5 * d)
    p.look(z=-0.03 * d)
    rub = math.sin(TAU * f / 16) if 16 <= f <= 56 else 0.0
    belly = tl(f, [(0, 0.0), (14, 1.0), (56, 1.0), (66, 0.3)])
    p.wing("L", fwd=50 * belly, out=-18 * belly + 6 * rub * belly); p.wing("R", fwd=50 * belly, out=-18 * belly - 6 * rub * belly)
    p.f(lid_sad=0.9 * d, lid_half=0.3 * d)
    p.rot("crest_main.01", x=22 * d); p.rot("crest_main.02", x=18 * d); p.rot("crest_left", x=12 * d); p.rot("crest_right", x=12 * d)
    sigh = tl(f, [(0, 0.0), (60, 0.0), (68, 1.0), (82, -0.4), (90, 0.0)])
    p.scl("chest", 1 + 0.03 * sigh, 1 + 0.03 * sigh, 1 + 0.05 * sigh); p.loc("body", z=0.006 * sigh)
    p.rot("jaw", x=tl(f, [(0, 0.0), (64, 0.0), (70, 10.0), (82, 0.0)]))
    p.f(blink_L=blink(f, (36,)), blink_R=blink(f, (36,)))
    return p

def feeding_complete(f):
    p = idle(f, 0.4)
    a = apply_jump(p, f, 2, 0.11, 14)
    up = tl(f, [(0, 0.0), (10, 1.0), (28, 1.0), (36, 0.0)])
    p.wing("L", out=110 * up, tip=20 * up); p.wing("R", out=110 * up, tip=20 * up)
    # satisfied belly pat afterwards
    pat = tl(f, [(0, 0.0), (34, 0.0), (42, 1.0), (68, 1.0), (75, 0.0)])
    tap = math.sin(TAU * (f - 42) / 8) if 42 <= f <= 66 else 0.0
    p.wing("L", fwd=48 * pat, out=-16 * pat + 5 * tap * pat); p.wing("R", fwd=48 * pat, out=-16 * pat + 5 * tap * pat)
    p.rot("head", x=-6 * up + 4 * pat * math.sin(TAU * f / 20), y=6 * pat)
    hap = tl(f, [(0, 0.0), (8, 1.0), (68, 1.0), (75, 0.0)])
    p.f(blink_L=hap, blink_R=hap, happy_eye_L=1.0, happy_eye_R=1.0)
    p.rot("jaw", x=20 * hap); p.scl("blush.L", 1 + 0.4 * hap); p.scl("blush.R", 1 + 0.4 * hap)
    return p

def disconnected(f):
    p = idle(f, 0.6)
    # quick looks around (searching for signal)
    lk = tl(f, [(0, 0.0), (6, 0.036), (16, 0.036), (22, -0.036), (32, -0.036), (38, 0.0), (90, 0.0)])
    p.look(x=lk, z=0.012)
    p.rot("head", z=tl(f, [(0, 0.0), (8, 22.0), (16, 22.0), (24, -22.0), (32, -22.0), (40, 0.0)]),
          y=tl(f, [(0, 0.0), (40, 0.0), (48, -14.0, "o"), (90, -12.0)]))
    p.f(wide=tl(f, [(0, 0.0), (6, 0.7), (36, 0.5), (48, 0.0)]))
    # shrug, then slump with a sad face
    sh = tl(f, [(0, 0.0), (40, 0.0), (48, 1.0, "o"), (60, 1.0), (68, 0.0)])
    p.wing("L", out=55 * sh, fwd=-20 * sh, tip=30 * sh); p.wing("R", out=55 * sh, fwd=-20 * sh, tip=30 * sh)
    p.loc("chest", z=0.01 * sh)
    sad = tl(f, [(0, 0.0), (56, 0.0), (70, 1.0), (90, 1.0)])
    p.f(lid_sad=0.9 * sad, lid_half=0.2 * sad); p.look(z=-0.025 * sad)
    p.rot("body", x=5 * sad); p.squash("body", 0.03 * sad); p.rot("head", x=10 * sad)
    p.rot("crest_main.01", x=24 * sad); p.rot("crest_main.02", x=20 * sad)
    p.rot("crest_left", x=14 * sad); p.rot("crest_right", x=14 * sad)
    p.rot("tail_center", x=12 * sad)
    p.f(blink_L=blink(f, (52,)), blink_R=blink(f, (52,)))
    return p

def return_to_idle(f):
    """A settle (small exhale and bob) ending exactly on Loco_Idle frame 0."""
    w = tl(f, [(0, 1.0), (24, 0.0)])
    p = idle(f * 0, 1.0 - w)          # idle frame 0, faded in
    bz = lambda g: tl(g, [(0, 0.0), (6, -0.012, "o"), (14, 0.003), (20, -0.001), (24, 0.0)])
    p.loc("body", z=bz(f)); p.squash("body", tl(f, [(0, 0.0), (6, 0.04), (14, -0.01), (24, 0.0)]))
    p.scl("chest", 1 - 0.015 * tl(f, [(0, 0.0), (6, 1.0), (16, 0.0)]))
    follow(p, f, bz)
    p.wing("L", out=tl(f, [(0, 8.0), (8, 14.0), (24, 0.0)])); p.wing("R", out=tl(f, [(0, 8.0), (8, 14.0), (24, 0.0)]))
    p.f(blink_L=blink(f, (4,)), blink_R=blink(f, (4,)))
    return p

# ------------------------------------------------------------------ clip table
CLIPS = [
    # name, frames, fn, loop, group
    ("Loco_Idle", 120, idle, True, "Locomotion"),
    ("Loco_Blink", 12, blink_clip, False, "Locomotion"),
    ("Loco_LookAround", 120, look_around, True, "Locomotion"),
    ("Loco_Walk", 30, walk, True, "Locomotion"),
    ("Loco_Run", 18, run, True, "Locomotion"),
    ("Loco_Turn", 30, turn, False, "Locomotion"),
    ("Loco_Stop", 24, stop, False, "Locomotion"),
    ("Loco_Sleep", 120, sleep, True, "Locomotion"),
    ("Pers_Wave", 60, wave_clip, False, "Personality"),
    ("Pers_HappyJump", 42, happy_jump, False, "Personality"),
    ("Pers_Celebrate", 75, celebrate, False, "Personality"),
    ("Pers_Point", 60, point, False, "Personality"),
    ("Pers_Think", 90, think, False, "Personality"),
    ("Pers_HeadTilt", 45, head_tilt, False, "Personality"),
    ("Pers_WingFlap", 45, wing_flap, False, "Personality"),
    ("Pers_Concerned", 75, concerned, False, "Personality"),
    ("Web_Appear", 45, appear, False, "Website"),
    ("Web_RoamDashboard", 60, roam, True, "Website"),
    ("Web_LookAtComponent_L", 60, look_at_component("L"), False, "Website"),
    ("Web_LookAtComponent_R", 60, look_at_component("R"), False, "Website"),
    ("Web_LowWater", 90, low_water, False, "Website"),
    ("Web_LowFeed", 90, low_feed, False, "Website"),
    ("Web_FeedingComplete", 75, feeding_complete, False, "Website"),
    ("Web_DeviceDisconnected", 90, disconnected, False, "Website"),
    ("Web_ReturnToIdle", 24, return_to_idle, False, "Website"),
]

# ------------------------------------------------------------------ baking
def rig():
    return bpy.data.objects["PIP_Rig"]

def apply_pose(r, p, prev=None):
    pb = r.pose.bones
    for b in pb:
        b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale = (1, 1, 1)
    for prop in FACE_PROPS:
        pb["face_ctrl"][prop] = min(max(float(p.face.get(prop, 0.0)), 0.0), 1.0)
    for name, g in p.b.items():
        bone = r.data.bones[name]
        Rr = bone.matrix_local.to_3x3().normalized()
        Ri = Rr.inverted()
        Rw = Euler([R(a) for a in g["rot"]], "XYZ").to_matrix()
        m = Ri @ Rw @ Rr
        e = m.to_euler("XYZ", prev[name]) if (prev is not None and name in prev) else m.to_euler("XYZ")
        pb[name].rotation_euler = e
        if prev is not None:
            prev[name] = e.copy()
        pb[name].location = Ri @ Vector(g["loc"])
        # world-axis scale -> local axis scale (all bones are axis-aligned enough)
        sc = []
        for i in range(3):
            col = Rr.col[i]
            ax = max(range(3), key=lambda k: abs(col[k]))
            sc.append(g["scl"][ax])
        pb[name].scale = sc

KEY_BONES = None

def bake(name, frames, fn, loop, group, step=2):
    global KEY_BONES
    r = rig()
    if KEY_BONES is None:
        KEY_BONES = [b.name for b in r.data.bones if b.name != "face_ctrl"]
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    r.animation_data_create()
    r.animation_data.action = act
    samples = list(range(0, frames + 1, step))
    if samples[-1] != frames:
        samples.append(frames)
    pb = r.pose.bones
    prev = {}
    for fr in samples:
        apply_pose(r, fn(fr), prev)
        for b in KEY_BONES:
            pb[b].keyframe_insert("location", frame=fr, group=b)
            pb[b].keyframe_insert("rotation_euler", frame=fr, group=b)
            pb[b].keyframe_insert("scale", frame=fr, group=b)
        for prop in FACE_PROPS:
            pb["face_ctrl"].keyframe_insert(f'["{prop}"]', frame=fr, group="face_ctrl")
    act.use_frame_range = True
    act.frame_start = 0; act.frame_end = frames
    act.use_cyclic = loop
    slot = r.animation_data.action_slot
    cb = anim_utils.action_get_channelbag_for_slot(act, slot)
    if cb is not None:
        for fc in cb.fcurves:
            if loop:
                fc.modifiers.new("CYCLES")
            fc.update()
    act["pip_group"] = group
    act["pip_loop"] = loop
    act["pip_fps"] = FPS
    return act

def build_all(only=None):
    sc = bpy.context.scene
    sc.render.fps = FPS; sc.render.fps_base = 1.0
    out = []
    for name, frames, fn, loop, group in CLIPS:
        if only and name not in only:
            continue
        bake(name, frames, fn, loop, group)
        out.append(name)
    r = rig()
    r.animation_data.action = bpy.data.actions["Loco_Idle"]
    sc.frame_start = 0; sc.frame_end = 120
    return out
