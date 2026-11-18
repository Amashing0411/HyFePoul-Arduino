"""Draws the two PLSP-style HyFePoul sheets as SVG.

    python docs/schematic/build_schematic.py

Writes hyfepoul-schematic-diagram.svg and hyfepoul-digital-illustration.svg
next to this file. Pin numbers follow firmware/arduino-mega/HyFePoul_Arduino/
Config.ino. Both sheets share one layout so parts sit in the same place.
"""
from pathlib import Path

W, H = 1800, 1250
OUT = Path(__file__).resolve().parent
FONT = "Arial, Helvetica, sans-serif"

TEAM = [
    "ALCANTARA, MARK JAMES L.",
    "DALIT, MYKA ELLA A.",
    "ESER JOSE, ARWIN E.",
    "HERNANDEZ, ALLENY P.",
    "RAMOS, BRYLLE EDWARD A.",
    "TOLENTINO, JOHN REI R.",
]
TITLE_LINES = [
    "HYFEPOUL: A POULTRY MANAGEMENT SYSTEM WITH",
    "WEIGHT-BASED FEED DISPENSING AND",
    "WATER LEVEL MONITORING DEVICE",
]

# Tray blocks on the left, top to bottom. Block i uses Mega A(2i) for DT and
# A(2i+1) for SCK, so tray 5 sits above tray 4 (A6/A7 vs A8/A9).
TRAY_BLOCKS = [1, 2, 3, 5, 4]


def hx_y(i):
    return 90 + 160 * i


MEGA = dict(x=640, y=80, w=240, h=820)
MEGA_RIGHT = [("D20 / SDA", 120), ("D21 / SCL", 150), ("D16 / TX2", 250),
              ("D17 / RX2", 280), ("D14 / TX3", 370), ("D15 / RX3", 460),
              ("D10", 560), ("D9", 600), ("D8", 640), ("D11", 800)]
MEGA_BOTTOM = [("D52", 655), ("D50", 685), ("D49", 745), ("D51", 805), ("D53", 860)]


class Svg:
    def __init__(self):
        self.p = []

    def add(self, s):
        self.p.append(s)

    def line(self, pts, c="#000", w=1.6, dash=None, cap="round"):
        d = " ".join(f"{x},{y}" for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="{w}" '
                 f'stroke-linejoin="round" stroke-linecap="{cap}"{da}/>')

    def rect(self, x, y, w, h, fill="none", stroke="#000", sw=1.8, rx=0, extra=""):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{sw}" {extra}/>')

    def circle(self, cx, cy, r, fill="none", stroke="#000", sw=1.6):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, s, size=11, anchor="start", weight="normal", c="#000", rot=None,
             family=FONT, ls=None):
        t = f' transform="rotate({rot} {x} {y})"' if rot is not None else ""
        l = f' letter-spacing="{ls}"' if ls else ""
        s = s.replace("&", "&amp;").replace("<", "&lt;")
        self.add(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
                 f'text-anchor="{anchor}" font-weight="{weight}" fill="{c}"{t}{l}>{s}</text>')

    def dot(self, x, y, c="#000", r=3.2):
        self.circle(x, y, r, fill=c, stroke=c, sw=0)

    def svg(self, bg="#fff", vb=(0, 0, W, H)):
        x, y, w, h = vb
        body = "\n".join(self.p)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
                f'viewBox="{x} {y} {w} {h}">\n<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>\n{body}\n</svg>\n')


# ---------------------------------------------------------------- shared bits

def title_block(s, sheet_title, sheet_no):
    x0, y0, x1, y1 = 20, 1100, 1780, 1230
    s.rect(20, 20, 1760, 1210, sw=2.4)
    s.line([(x0, y0), (x1, y0)], w=2.4)
    # school
    for x in (400, 1120, 1500):
        s.line([(x, y0), (x, y1)], w=2)
    s.text(30, 1118, "COLLEGE OF ENGINEERING", 12)
    s.line([(20, 1126), (400, 1126)], w=1.2)
    s.text(210, 1166, "P L S P", 26, "middle", "bold", family="'Times New Roman', serif")
    s.line([(90, 1182), (330, 1182)], w=1)
    s.text(210, 1206, "PAMANTASAN NG LUNGSOD NG SAN PABLO", 12, "middle")
    # project title
    s.text(410, 1118, "PROJECT TITLE", 12)
    s.line([(400, 1126), (1120, 1126)], w=1.2)
    s.text(760, 1150, sheet_title, 17, "middle", "bold")
    for i, ln in enumerate(TITLE_LINES):
        s.text(760, 1172 + i * 18, ln, 14, "middle")
    # team
    rh = 130 / len(TEAM)
    for i, n in enumerate(TEAM):
        y = y0 + rh * (i + 1)
        if i < len(TEAM) - 1:
            s.line([(1120, y), (1500, y)], w=1)
        s.text(1130, y - rh / 2 + 4.5, n, 12)
    # section / sheet
    s.text(1510, 1118, "YR./SECTION", 11)
    s.text(1640, 1150, "BSCpE 4D", 20, "middle", "bold")
    s.line([(1500, 1162), (1780, 1162)], w=1)
    s.text(1510, 1178, "SHEET", 11)
    s.text(1640, 1200, f"{sheet_no} OF 2", 15, "middle", "bold")
    s.line([(1500, 1208), (1780, 1208)], w=1)
    s.text(1510, 1223, "REMARKS:", 10)


# ------------------------------------------------------------- schematic sheet

def gnd(s, x, y, stub=8):
    s.line([(x, y), (x, y + stub)])
    y += stub
    for w, dy in ((16, 0), (10, 4), (4, 8)):
        s.line([(x - w / 2, y + dy), (x + w / 2, y + dy)])


def flag(s, x, y, label, d="up", stub=12):
    """Power net flag: stub, bar, label."""
    if d == "up":
        s.line([(x, y), (x, y - stub)]); s.line([(x - 7, y - stub), (x + 7, y - stub)], w=2)
        s.text(x, y - stub - 5, label, 10, "middle", "bold")
    elif d == "down":
        s.line([(x, y), (x, y + stub)]); s.line([(x - 7, y + stub), (x + 7, y + stub)], w=2)
        s.text(x, y + stub + 13, label, 10, "middle", "bold")
    elif d == "right":
        s.line([(x, y), (x + stub, y)]); s.line([(x + stub, y - 6), (x + stub, y + 6)], w=2)
        s.text(x + stub + 4, y + 4, label, 10, "start", "bold")
    else:
        s.line([(x, y), (x - stub, y)]); s.line([(x - stub, y - 6), (x - stub, y + 6)], w=2)
        s.text(x - stub - 4, y + 4, label, 10, "end", "bold")


def pins(s, box, side, items, stub=20, size=9.5):
    x, y, w, h = box
    for name, v in items:
        if side == "left":
            s.line([(x - stub, v), (x, v)]); s.text(x + 5, v + 3.5, name, size)
        elif side == "right":
            s.line([(x + w, v), (x + w + stub, v)]); s.text(x + w - 5, v + 3.5, name, size, "end")
        elif side == "top":
            s.line([(v, y - stub), (v, y)]); s.text(v + 3.5, y + 5, name, size, "end", rot=-90)
        else:
            s.line([(v, y + h), (v, y + h + stub)]); s.text(v + 3.5, y + h - 5, name, size, "start", rot=-90)


def block(s, x, y, w, h, title, sub=None, ty=None):
    s.rect(x, y, w, h)
    ty = ty if ty is not None else y + 18
    s.text(x + w / 2, ty, title, 11.5, "middle", "bold")
    if sub:
        s.text(x + w / 2, ty + 13, sub, 9, "middle")


def resistor_h(s, x1, x2, y, label):
    s.rect(x1, y - 6, x2 - x1, 12, fill="#fff", sw=1.6)
    s.text((x1 + x2) / 2, y - 10, label, 10, "middle", "bold")


def resistor_v(s, x, y1, y2, label):
    s.rect(x - 6, y1, 12, y2 - y1, fill="#fff", sw=1.6)
    s.text(x + 10, (y1 + y2) / 2 + 4, label, 10, "start", "bold")


def motor_sym(s, cx, cy, r=22):
    s.circle(cx, cy, r, fill="#fff", sw=1.8)
    s.text(cx, cy + 6, "M", 17, "middle", "bold")
    s.text(cx + 14, cy - r + 10, "+", 10, "middle")


def switch_v(s, x, y1, y2):
    """Normally-open switch drawn on a vertical wire."""
    s.line([(x, y1), (x, y1 + 12)])
    s.circle(x, y1 + 14, 2.5, fill="#fff")
    s.circle(x, y2 - 14, 2.5, fill="#fff")
    s.line([(x, y2 - 12), (x, y2)])
    s.line([(x, y2 - 16), (x - 12, y1 + 18)])


SC = 2.0  # schematic blocks: px per mm of the real part, so sizes compare


def schematic():
    s = Svg()

    # ---- Arduino Mega 2560, 53.3 x 101.6 mm, drawn upright
    MX, MY, MW, MH = 700, 310, 53.3 * SC, 101.6 * SC
    RX = MX + MW + 12
    s.rect(MX, MY, MW, MH, sw=2.2)
    s.text(MX + MW / 2 + 4, MY + MH / 2, "ARDUINO MEGA 2560 · U1", 11.5, "middle", "bold", rot=-90)
    a_y = [328 + 18 * j for j in range(10)]
    pins(s, (MX, MY, MW, MH), "left", [(f"A{j}", a_y[j]) for j in range(10)], stub=12, size=8)
    right = [("D20 SDA", 328), ("D21 SCL", 346), ("D15 RX3", 364), ("D14 TX3", 382), ("D16 TX2", 400),
             ("D17 RX2", 418), ("D11", 436), ("D10", 454), ("D9", 472), ("D8", 490)]
    pins(s, (MX, MY, MW, MH), "right", right, stub=12, size=8)
    bottom = [("D52", 712), ("D50", 733), ("D49", 754), ("D51", 775), ("D53", 796)]
    pins(s, (MX, MY, MW, MH), "bottom", [("", x) for _, x in bottom], stub=12)
    for n, x in bottom:
        s.text(x - 3, MY + MH + 16, n, 7.5, "end", rot=-90)
    pins(s, (MX, MY, MW, MH), "top", [("", 725), ("", 785)], stub=12)
    flag(s, 725, MY - 12, "+5V")
    s.line([(785, MY - 12), (785, MY - 22)]); s.text(785, MY - 26, "GND", 9, "middle", "bold")

    # ---- load cells (80 x 12.7 mm) and HX711 boards (34 x 21 mm)
    colours = ("RED", "BLK", "WHT", "GRN")
    for i, tray in enumerate(TRAY_BLOCKS):
        y0 = 200 + 90 * i
        s.rect(70, y0 + 8, 80 * SC, 12.7 * SC)
        s.text(132, y0 + 24, f"LOAD CELL · TRAY {tray}", 8.5, "middle", "bold")
        bx, by = 214, y0 + 20.5
        s.add(f'<polygon points="{bx},{by - 7} {bx + 7},{by} {bx},{by + 7} {bx - 7},{by}" fill="none" stroke="#000" stroke-width="1.1"/>')
        s.rect(270, y0, 34 * SC, 21 * SC)
        s.text(304, y0 + 18, "HX711", 9, "middle", "bold")
        s.text(304, y0 + 29, f"U{2 + i}", 7.5, "middle")
        tgt = [y0 + 6, y0 + 16, y0 + 26, y0 + 36]
        pins(s, (270, y0, 68, 42), "left", list(zip(("E+", "E−", "A−", "A+"), tgt)), stub=10, size=7)
        for k in range(4):
            sy = y0 + 13 + 4 * k
            jx = 240 if k in (0, 2) else 236
            if k == 1:
                s.line([(230, sy), (260, sy)])
            else:
                s.line([(230, sy), (jx, sy), (jx, tgt[k]), (260, tgt[k])])
            s.text(258, tgt[k] - 2, colours[k], 5.5, "end")
        pins(s, (270, y0, 68, 42), "right", [("DT", y0 + 14), ("SCK", y0 + 28)], stub=12, size=7.5)
        pins(s, (270, y0, 68, 42), "bottom", [("", 285), ("", 325)], stub=8)
        flag(s, 325, y0 + 50, "+5V", "right", 8)
        gnd(s, 285, y0 + 50, 2)
        s.text(281, y0 + 60, "GND", 6, "end"); s.text(321, y0 + 60, "VCC", 6, "end")
        # DT / SCK to the analog pins
        for n, sy in ((0, y0 + 14), (1, y0 + 28)):
            j = 2 * i + n
            ty = a_y[j]
            if sy < ty:
                cx = 660 - 10 * j
            elif sy > ty:
                cx = 600 + 12 * (j - 6) if j >= 6 else 600
            else:
                cx = None
            if cx is None:
                s.line([(350, sy), (688, ty)])
            else:
                s.line([(350, sy), (cx, sy), (cx, ty), (688, ty)])

    # ---- RTC DS3231, 38 x 22 mm
    s.rect(1000, 70, 38 * SC, 22 * SC)
    s.text(1038, 64, "RTC DS3231 · U7", 8.5, "middle", "bold")
    pins(s, (1000, 70, 76, 44), "left", [("SDA", 84), ("SCL", 102)], stub=12, size=7.5)
    pins(s, (1000, 70, 76, 44), "right", [("VCC", 84), ("GND", 102)], stub=12, size=7.5)
    flag(s, 1088, 84, "+5V", "right", 8); gnd(s, 1088, 102, 0)
    # ---- ESP32 38-pin DevKit, 55 x 28 mm
    s.rect(1000, 140, 55 * SC, 28 * SC)
    s.text(1055, 134, "ESP32 38-PIN · U9", 8.5, "middle", "bold")
    pins(s, (1000, 140, 110, 56), "left", [("GPIO17 TX2", 154), ("GPIO16 RX2", 172)], stub=12, size=7)
    pins(s, (1000, 140, 110, 56), "right", [("VIN", 154), ("GND", 172)], stub=12, size=7)
    s.text(1055, 189, "Wi-Fi bridge", 7, "middle")
    flag(s, 1122, 154, "+5V", "right", 8); gnd(s, 1122, 172, 0)
    # ---- Nextion NX8048T070-011, 181 x 108 mm
    NX, NY, NW, NH = 1180, 60, 181 * SC, 108 * SC
    s.rect(NX, NY, NW, NH)
    s.rect(NX + 13.4 * SC, NY + 11 * SC, 154.2 * SC, 85.9 * SC, sw=1, extra='stroke-dasharray="5 4"')
    s.text(NX + NW / 2, NY + NH / 2 - 6, "NEXTION NX8048T070-011", 12, "middle", "bold")
    s.text(NX + NW / 2, NY + NH / 2 + 10, "7.0\" 800×480 HMI · U8", 9, "middle")
    pins(s, (NX, NY, NW, NH), "left", [("RX", 250), ("TX", 268)], stub=12, size=7.5)
    pins(s, (NX, NY, NW, NH), "right", [("+5V", 250), ("GND", 268)], stub=12, size=7.5)
    flag(s, NX + NW + 12, 250, "+5V", "right", 8); gnd(s, NX + NW + 12, 268, 0)

    # serial and I2C lines leave the Mega and turn up in order
    for (y, cx, ty, tx) in ((328, 845, 84, 988), (346, 853, 102, 988), (364, 861, 154, 988),
                            (400, 877, 250, 1168), (418, 885, 268, 1168)):
        s.line([(RX, y), (cx, y), (cx, ty), (tx, ty)])
    # D14 TX3 through the 1k / 2k divider to GPIO16
    s.line([(RX, 382), (869, 382), (869, 172), (895, 172)])
    resistor_h(s, 895, 935, 172, "R1 1kΩ")
    s.line([(935, 172), (988, 172)]); s.dot(960, 172)
    s.line([(960, 172), (960, 180)])
    s.rect(954, 180, 12, 26, fill="#fff", sw=1.6)
    s.text(950, 197, "R2 2kΩ", 9, "end", "bold")
    gnd(s, 960, 206, 4)

    # ---- buzzer module, 32 x 13 mm
    s.rect(1000, 410, 32 * SC, 13 * SC)
    s.text(1032, 404, "BUZZER · LOW TRIGGER · BZ1", 8.5, "middle", "bold")
    pins(s, (1000, 410, 64, 26), "left", [("I/O", 423)], stub=12, size=7)
    pins(s, (1000, 410, 64, 26), "right", [("VCC", 416), ("GND", 430)], stub=12, size=6.5)
    flag(s, 1076, 416, "+5V", "right", 8); gnd(s, 1076, 430, 0)
    s.line([(RX, 436), (895, 436), (895, 423), (988, 423)])

    # ---- 6-channel relay module, 138 x 56 mm
    RLX, RLY, RLW, RLH = 1000, 470, 138 * SC, 56 * SC
    s.rect(RLX, RLY, RLW, RLH)
    s.text(RLX + RLW / 2, RLY - 8, "RELAY MODULE · 6-CH, 5V, ACTIVE LOW", 9, "middle", "bold")
    pins(s, (RLX, RLY, RLW, RLH), "left", [("IN1", 486), ("IN2", 504), ("IN3", 522), ("IN4–6", 540),
                                            ("VCC", 558), ("GND", 576)], stub=12, size=8)
    s.text(985, 544, "n.c.", 8, "end")
    flag(s, 988, 558, "+5V", "left", 8); gnd(s, 988, 576, 0)
    for (y, cx, ty) in ((454, 930, 486), (472, 920, 504), (490, 910, 522)):
        s.line([(RX, y), (cx, y), (cx, ty), (988, ty)])
    contacts = [("K1 NO", 478), ("K1 COM", 490), ("K1 NC", 502), ("K2 NO", 514), ("K2 COM", 526),
                ("K2 NC", 538), ("K3 NO", 550), ("K3 COM", 562), ("K3 NC", 574)]
    pins(s, (RLX, RLY, RLW, RLH), "right", contacts, stub=12, size=7.5)
    for name, y in contacts:
        if name.endswith("NO"):
            flag(s, RLX + RLW + 12, y, "+12V", "right", 6)
        elif name.endswith("NC"):
            gnd(s, RLX + RLW + 12, y, 0)
    for k in range(6):
        x = 1050 + 30 * k
        s.rect(x, 508, 18, 18, sw=1.1)
        s.line([(x, 526), (x + 18, 508)], w=1.1)
        s.text(x + 9, 538, f"K{k + 1}", 7.5, "middle")

    # ---- worm gear motors, 105 x 40 mm (gearbox and motor)
    for (my, label, sub_) in ((440, "CHAIN MOTOR  M1", "REVERSED BY K1 / K2"), (560, "DISPENSER MOTOR  M2", "SWITCHED BY K3")):
        s.rect(1420, my, 105 * SC, 40 * SC)
        motor_sym(s, 1458, my + 40, 19)
        s.text(1486, my + 34, label, 9.5, "start", "bold")
        s.text(1486, my + 47, "12V DC WORM GEAR", 8)
        s.text(1486, my + 59, sub_, 8)
        pins(s, (1420, my, 210, 80), "left", [("+", my + 25), ("−", my + 55)], stub=12, size=8)
    s.line([(1288, 490), (1395, 490), (1395, 465), (1408, 465)])
    s.line([(1288, 526), (1385, 526), (1385, 495), (1408, 495)])
    s.line([(1288, 562), (1395, 562), (1395, 585), (1408, 585)])
    s.line([(1408, 615), (1395, 615)]); gnd(s, 1395, 615, 6)

    # ---- sensors and switches on the Mega's lower pins
    UX, UY = 687, 640
    s.rect(UX, UY, 45 * SC, 20 * SC)
    s.text(UX + 45, UY + 31, "ULTRASONIC HC-SR04", 7.5, "middle", "bold")
    pins(s, (UX, UY, 90, 40), "top", [("TRIG", 712), ("ECHO", 733)], stub=12, size=6.5)
    pins(s, (UX, UY, 90, 40), "bottom", [("", 697), ("", 767)], stub=8)
    flag(s, 697, 688, "+5V", "down", 8); gnd(s, 767, 688, 2)
    s.line([(712, 525), (712, 628)]); s.line([(733, 525), (733, 628)])
    for (px, hy, sx, title, line2) in ((754, 624, 830, "FLOAT SWITCH  S1", "RIGHT ANGLE · RESERVOIR"),
                                       (775, 612, 930, "LIMIT SW LEFT  S2", "TRAY 4 SIDE"),
                                       (796, 600, 1030, "LIMIT SW RIGHT  S3", "TRAY 1 SIDE · HOME")):
        s.line([(px, 525), (px, hy), (sx, hy), (sx, 650)])
        switch_v(s, sx, 650, 700); gnd(s, sx, 700, 8)
        s.text(sx, 736, title, 9, "middle", "bold")
        s.text(sx, 749, line2, 8, "middle")

    # ---- power: PSU charges the battery side, controller LOAD feeds +12V
    s.rect(1120, 700, 43 * SC, 21 * SC)
    s.text(1163, 694, "STEP-DOWN 12V → 5V · U10", 8.5, "middle", "bold")
    pins(s, (1120, 700, 86, 42), "left", [("IN+", 714), ("IN−", 730)], stub=12, size=7)
    pins(s, (1120, 700, 86, 42), "right", [("OUT+", 714), ("OUT−", 730)], stub=12, size=7)
    flag(s, 1108, 714, "+12V", "left", 8); gnd(s, 1108, 730, 0)
    flag(s, 1218, 714, "+5V", "right", 8); gnd(s, 1218, 730, 0)

    CCX, CCY, CCW, CCH = 1380, 700, 133 * SC, 70 * SC
    s.rect(CCX, CCY, CCW, CCH)
    s.text(CCX + CCW / 2, CCY + 64, "SOLAR CHARGE CONTROLLER", 10, "middle", "bold")
    s.text(CCX + CCW / 2, CCY + 78, "PWM · U11", 8.5, "middle")
    pins(s, (CCX, CCY, CCW, CCH), "left", [("PV+", 720), ("PV−", 738), ("BAT+", 770), ("BAT−", 790)], stub=12, size=8)
    s.text(1364, 724, "n.c.", 8, "end"); s.text(1364, 742, "n.c.", 8, "end")
    pins(s, (CCX, CCY, CCW, CCH), "right", [("LOAD+", 760), ("LOAD−", 790)], stub=12, size=8)
    flag(s, CCX + CCW + 12, 760, "+12V", "right", 8); gnd(s, CCX + CCW + 12, 790, 0)

    BX, BY, BW, BH = 1380, 870, 151 * SC, 95 * SC
    s.rect(BX, BY, BW, BH)
    for i, (h, x) in enumerate(((34, 1500), (18, 1510), (34, 1530), (18, 1540))):
        s.line([(x, 965 - h / 2), (x, 965 + h / 2)], w=2.4 if h == 18 else 1.4)
    s.line([(1470, 965), (1500, 965)]); s.line([(1540, 965), (1570, 965)])
    s.text(1531, 1010, "BATTERY BT1 · 12V 12Ah", 10, "middle", "bold")
    s.text(1531, 1024, "SEALED LEAD-ACID", 8, "middle")
    pins(s, (BX, BY, BW, BH), "left", [("−", 920), ("+", 960)], stub=12, size=9)
    s.line([(1368, 770), (1330, 770), (1330, 960), (1368, 960)])
    s.line([(1368, 790), (1340, 790), (1340, 920), (1368, 920)])

    PX, PY, PW, PH = 900, 800, 199 * SC, 98 * SC
    s.rect(PX, PY, PW, PH)
    s.text(PX + PW / 2, PY + 92, "SWITCHING POWER SUPPLY", 11, "middle", "bold")
    s.text(PX + PW / 2, PY + 108, "220V AC → 12V 12.5A (150W)", 9, "middle")
    pins(s, (PX, PY, PW, PH), "left", [("L", 840), ("N", 870)], stub=12, size=8)
    s.text(884, 859, "AC", 9, "end", "bold")
    pins(s, (PX, PY, PW, PH), "right", [("+V", 830), ("−V", 860)], stub=12, size=8)
    s.line([(1310, 830), (1330, 830)]); s.dot(1330, 830)
    s.line([(1310, 860), (1340, 860)]); s.dot(1340, 860)

    notes(s, "#000", 40, 670)
    return s.svg(vb=(30, 36, 1690, 1040))


def notes(s, c, x=1210, y=878):
    s.rect(x, y, 560, 205, sw=1.4, stroke=c)
    s.text(x + 10, y + 18, "NOTES:", 11.5, "start", "bold", c)
    lines = [
        "1. Pin numbers follow firmware Config.ino. Trays 1–5 run along the machine.",
        "2. All grounds are common (12V side and 5V side).",
        "3. Relay module is active LOW. K1 and K2 swap the chain motor's polarity;",
        "    the firmware never turns both on together.",
        "4. ESP32 RX2 is fed through R1/R2 (1k/2k) to bring 5V down to 3.3V.",
        "5. Float and limit switches close to GND; Mega uses INPUT_PULLUP.",
        "6. Water is gravity-fed from the reservoir. There is no water pump.",
        "7. The PSU charges the battery side; the controller's LOAD output is +12V.",
        "8. Blocks are drawn to the real part sizes (1 mm = 2 px).",
    ]
    for i, ln in enumerate(lines):
        s.text(x + 10, y + 38 + i * 18, ln, 10.5, c=c)


# ---------------------------------------------------------- illustration sheet
# Breadboard-style drawing. Every module is drawn from its real outline at one
# scale (K px per mm) so sizes compare truthfully. Sizes are the usual ones for
# these modules: Mega 2560 R3 101.6x53.3, ESP32 38-pin DevKit 55x28, Nextion
# 7.0" NX8048T070-011 181x108, DS3231 ZS-042 38x22, HX711 34x21, bar load cell
# 80x12.7, HC-SR04 45x20, 4-ch relay 75x55, step-down 43x21, buzzer 32x13,
# 12V 12Ah battery 151x98x95. The motors, PSU and charge controller models are
# not recorded, so they use generic outlines; the solar panel is not to scale.

K = 2.2
SIG, V5, GNDW, V12 = "#418dd9", "#d42a2a", "#3b3b3b", "#ef7d1a"
PCB_BLUE, PCB_GREEN, MEGA_TEAL = "#1d58a8", "#1f7f3b", "#0f8592"
GOLD = "#d9b85c"


def mm(v):
    return v * K


def defs(s):
    s.add("""<defs>
<linearGradient id="alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".45" stop-color="#c4cad1"/><stop offset="1" stop-color="#8f979f"/></linearGradient>
<linearGradient id="can" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f7f8"/><stop offset=".4" stop-color="#c9ced3"/><stop offset="1" stop-color="#80878f"/></linearGradient>
<linearGradient id="canv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a9198"/><stop offset=".45" stop-color="#eef0f2"/><stop offset="1" stop-color="#8a9198"/></linearGradient>
<linearGradient id="bfront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3d42"/><stop offset="1" stop-color="#1c1d20"/></linearGradient>
<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16263d"/><stop offset=".6" stop-color="#0d1828"/><stop offset="1" stop-color="#1b2f4b"/></linearGradient>
<linearGradient id="pv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c4f97"/><stop offset="1" stop-color="#132a5a"/></linearGradient>
<linearGradient id="blkc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d0d0e"/><stop offset=".42" stop-color="#4b4d51"/><stop offset=".6" stop-color="#2a2b2e"/><stop offset="1" stop-color="#0d0d0e"/></linearGradient>
<pattern id="mesh" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#2b2b2b"/><circle cx="1.5" cy="1.5" r=".8" fill="#5c5c5c"/></pattern>
<pattern id="perf" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#c9cdd1"/><circle cx="3.5" cy="3.5" r="1.7" fill="#7d838a"/></pattern>
<filter id="sh" x="-5%" y="-5%" width="115%" height="120%"><feDropShadow dx="1.5" dy="2.5" stdDeviation="2" flood-opacity=".28"/></filter>
</defs>""")


# -- small primitives -------------------------------------------------------

def WR(s, pts, c=SIG, w=2.4):
    """Breadboard wire: dark outline, colour core, round ends."""
    d = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    s.add(f'<polyline points="{d}" fill="none" stroke="#000" stroke-opacity=".35" '
          f'stroke-width="{w + 1.6}" stroke-linejoin="round" stroke-linecap="round"/>')
    s.add(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="{w}" '
          f'stroke-linejoin="round" stroke-linecap="round"/>')


def J(s, x, y, c):
    s.circle(x, y, 3.4, fill=c, stroke="#000", sw=0.6)


def pin(s, x, y, size=1.7):
    s.rect(x - size, y - size, size * 2, size * 2, fill=GOLD, stroke="#6b5520", sw=0.5)


def header(s, pts, vertical=False):
    p = mm(2.54)
    xs = [x for x, _ in pts]
    ys = [y for _, y in pts]
    s.rect(min(xs) - p / 2, min(ys) - p / 2, max(xs) - min(xs) + p, max(ys) - min(ys) + p,
           fill="#191919", stroke="#000", sw=0.6)
    for x, y in pts:
        pin(s, x, y)


def silk(s, x, y, t, size=4.6, anchor="middle", rot=None, c="#f4f4f4", weight="bold"):
    s.text(x, y, t, size, anchor, weight, c, rot=rot)


def smd(s, x, y, w, h, body="#202020", end="#c9ced3"):
    s.rect(x, y, w, h, fill=body, stroke="none", sw=0)
    s.rect(x, y, w * .22, h, fill=end, stroke="none", sw=0)
    s.rect(x + w * .78, y, w * .22, h, fill=end, stroke="none", sw=0)


def chip(s, x, y, w, h, legs_x=True, n=4):
    s.rect(x, y, w, h, fill="#1a1a1a", stroke="#000", sw=0.5)
    for i in range(n):
        f = (i + 0.5) / n
        if legs_x:
            for yy in (y - 1.6, y + h):
                s.rect(x + f * w - 0.7, yy, 1.4, 1.6, fill="#c9ced3", stroke="none", sw=0)
        else:
            for xx in (x - 1.6, x + w):
                s.rect(xx, y + f * h - 0.7, 1.6, 1.4, fill="#c9ced3", stroke="none", sw=0)
    s.circle(x + 2, y + 2, 0.8, fill="#555", stroke="none", sw=0)


def board(s, x, y, w, h, fill, edge, holes=(), r=mm(0.8)):
    s.rect(x, y, w, h, fill=fill, stroke=edge, sw=1.2, rx=r, extra='filter="url(#sh)"')
    for hx, hy, hr in holes:
        s.circle(hx, hy, hr, fill="#f2f2f2", stroke=GOLD, sw=1.4)


def label(s, x, y, title, sub=None, anchor="middle"):
    lines = [(title, 11, "bold", "#1d2733")] + [(l, 9, "normal", "#5b6672") for l in (sub or "").split("\n") if l]
    for i, (txt, size, weight, col) in enumerate(lines):
        yy = y + (0 if i == 0 else 12.5 * i)
        txt = txt.replace("&", "&amp;").replace("<", "&lt;")
        s.add(f'<text x="{x}" y="{yy}" font-family="{FONT}" font-size="{size}" text-anchor="{anchor}" '
              f'font-weight="{weight}" fill="{col}" stroke="#fff" stroke-width="3.2" '
              f'stroke-linejoin="round" paint-order="stroke">{txt}</text>')


# -- parts --------------------------------------------------------------------

def mega(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    w, h = mm(101.6), mm(53.3)
    # USB-B and barrel jack sit over the board edge, like the real board
    s.rect(x0 - mm(6.3), y0 + mm(9.0), mm(16.0), mm(12.0), fill="url(#can)", stroke="#6f767d", sw=1)
    board(s, x0, y0, w, h, MEGA_TEAL, "#06525b",
          [(*P(14.0, 2.5), mm(1.6)), (*P(15.3, 50.7), mm(1.6)), (*P(66.1, 7.6), mm(1.6)),
           (*P(66.1, 35.5), mm(1.6)), (*P(90.2, 50.7), mm(1.6))])
    s.rect(x0 - mm(6.3), y0 + mm(9.0), mm(16.0), mm(12.0), fill="url(#can)", stroke="#6f767d", sw=1)
    s.rect(x0 - mm(5.3), y0 + mm(11.5), mm(5), mm(7), fill="#9aa1a8", stroke="#6f767d", sw=0.6)
    s.rect(x0 - mm(1.8), y0 + mm(38.5), mm(13.5), mm(9.0), fill="#1d1d1d", stroke="#000", sw=1, rx=2)
    s.circle(*P(1.8, 43), mm(2.2), fill="#3a3a3a", stroke="#000", sw=0.6)
    # reset, 16U2, crystal, regulator, caps
    s.rect(*P(3.0, 1.6), mm(5.8), mm(5.8), fill="#d7dade", stroke="#80878f", sw=0.6)
    s.circle(*P(5.9, 4.5), mm(1.8), fill="#2a2a2a", stroke="none", sw=0)
    chip(s, *P(20.0, 12.5), mm(5), mm(5), n=4)
    s.rect(*P(33.5, 35.0), mm(10), mm(4), fill="url(#can)", stroke="#6f767d", sw=0.6, rx=mm(2))
    s.rect(*P(13.0, 30.5), mm(6.5), mm(5), fill="#1c1c1c", stroke="#000", sw=0.6)
    for cx, cy in ((21.5, 40.5), (21.5, 47.0)):
        s.circle(*P(cx, cy), mm(3.0), fill="url(#can)", stroke="#6f767d", sw=0.8)
        s.line([P(cx - 1.6, cy), P(cx + 1.6, cy)], c="#7a8189", w=0.8)
        s.line([P(cx, cy - 1.6), P(cx, cy + 1.6)], c="#7a8189", w=0.8)
    # ATmega2560, TQFP-100, mounted at 45 degrees
    cx, cy = P(61.0, 27.5)
    g = f'transform="rotate(45 {cx} {cy})"'
    s.rect(cx - mm(8), cy - mm(8), mm(16), mm(16), fill="#c9ced3", stroke="none", sw=0, extra=g)
    s.rect(cx - mm(7), cy - mm(7), mm(14), mm(14), fill="#1b1b1b", stroke="#000", sw=0.6, extra=g)
    s.text(cx, cy + 2, "ATMEGA2560", 5.2, "middle", "bold", "#9da3a9")
    # ICSP and LEDs
    header(s, [P(84.0 + c * 2.54, 24.0 + r * 2.54) for r in range(3) for c in range(2)])
    for i, (t, col) in enumerate((("L", "#f2c230"), ("TX", "#f2c230"), ("RX", "#f2c230"))):
        s.rect(*P(27.0, 8.5 + i * 2.6), mm(2.2), mm(1.3), fill=col, stroke="none", sw=0)
        silk(s, x0 + mm(30.5), y0 + mm(9.7 + i * 2.6), t, 3.8, "start")
    s.rect(*P(78.5, 31.5), mm(2.2), mm(1.3), fill="#44d06a", stroke="none", sw=0)
    silk(s, x0 + mm(81.5), y0 + mm(32.7), "ON", 3.8, "start")
    # logo and name
    silk(s, x0 + mm(40.5), y0 + mm(19.5), "∞", 15, "middle", c="#ffffff")
    silk(s, x0 + mm(40.5), y0 + mm(24.5), "ARDUINO", 8.5, "middle", c="#ffffff")
    silk(s, x0 + mm(40.5), y0 + mm(30.5), "MEGA 2560", 8.5, "middle", c="#ffffff")

    pins = {}
    top = y0 + mm(2.5)
    names10 = ["SCL", "SDA", "AREF", "GND", "13", "12", "11", "10", "9", "8"]
    names8 = ["7", "6", "5", "4", "3", "2", "1", "0"]
    comm = ["14", "15", "16", "17", "18", "19", "20", "21"]
    for names, start in ((names10, 17.5), (names8, 44.5), (comm, 66.0)):
        pts = [(x0 + mm(start + 2.54 * i), top) for i in range(len(names))]
        header(s, pts)
        for (x, y), n in zip(pts, names):
            pins["D" + n if n.isdigit() else n] = (x, y)
            silk(s, x + 1.6, y0 + mm(5.2), n, 3.9, "end", rot=-90)
    silk(s, x0 + mm(34), y0 + mm(12.5), "DIGITAL", 4.2)
    silk(s, x0 + mm(76), y0 + mm(12.5), "COMMUNICATION", 4.2)
    bot = y0 + mm(50.8)
    pw = ["NC", "IOREF", "RESET", "3V3", "5V", "GND", "GND", "VIN"]
    an = [f"A{i}" for i in range(16)]
    for names, start in ((pw, 27.9), (an[:8], 50.8), (an[8:], 73.7)):
        pts = [(x0 + mm(start + 2.54 * i), bot) for i in range(len(names))]
        header(s, pts)
        for (x, y), n in zip(pts, names):
            pins.setdefault(n, (x, y))
            silk(s, x + 1.6, y0 + mm(48.3), n, 3.9, "start", rot=-90)
    silk(s, x0 + mm(36.8), y0 + mm(40.5), "POWER", 4.2)
    silk(s, x0 + mm(71.5), y0 + mm(40.5), "ANALOG IN", 4.2)
    # 36-pin double header at the far end
    pts = []
    for r in range(18):
        for c in range(2):
            x, y = x0 + mm(93.4 + c * 2.54), y0 + mm(4.0 + r * 2.54)
            pts.append((x, y))
            if r == 0:
                n = "5V"
            elif r == 17:
                n = "GND"
            else:
                n = f"D{22 + 2 * (r - 1) + c}"
            pins[f"{n}_{c}" if r in (0, 17) else n] = (x, y)
    header(s, pts)
    for r in range(1, 17):
        silk(s, x0 + mm(91.6), y0 + mm(4.0 + r * 2.54) + 1.5, str(22 + 2 * (r - 1)), 3.6, "end")
    return pins


def hx711(s, x0, y0, tray):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(34), mm(21), PCB_GREEN, "#11502a",
          [(*P(31.5, 2.5), mm(1.2)), (*P(31.5, 18.5), mm(1.2))])
    chip(s, *P(13.5, 6.5), mm(6.2), mm(9.5), legs_x=False, n=8)
    silk(s, x0 + mm(16.6), y0 + mm(4.6), "HX711", 5)
    for i in range(4):
        smd(s, *P(22.5, 4.0 + i * 3.4), mm(3), mm(1.6))
    smd(s, *P(7.0, 4.0), mm(1.6), mm(3), body="#b98a4c")
    smd(s, *P(7.0, 14.0), mm(1.6), mm(3), body="#b98a4c")
    left = ["E+", "E-", "A-", "A+", "B-", "B+"]
    right = ["GND", "DT", "SCK", "VCC"]
    pins = {}
    lp = [(x0 + mm(2.0), y0 + mm(10.5 + (i - 2.5) * 2.54)) for i in range(6)]
    rp = [(x0 + mm(28.0), y0 + mm(10.5 + (i - 1.5) * 2.54)) for i in range(4)]
    for (x, y), n in zip(lp, left):
        pin(s, x, y); pins[n] = (x, y)
        silk(s, x + 4, y + 1.6, n, 3.8, "start")
    for (x, y), n in zip(rp, right):
        pin(s, x, y); pins[n] = (x, y)
        silk(s, x - 4, y + 1.6, n, 3.8, "end")
    return pins


def load_cell(s, x0, y0):
    w, h = mm(80), mm(12.7)
    s.rect(x0, y0, w, h, fill="url(#alu)", stroke="#7c848c", sw=1, rx=1.5, extra='filter="url(#sh)"')
    for a in (5.5, 15.5, 64.5, 74.5):
        s.circle(x0 + mm(a), y0 + h / 2, mm(2.2), fill="#5d646b", stroke="#9ba3ab", sw=0.8)
    # strain gauges under clear potting in the bending zone
    s.rect(x0 + mm(29), y0 + mm(2.2), mm(22), mm(8.3), fill="#f3ecd2", stroke="#c9b98a", sw=0.6, rx=mm(4))
    s.rect(x0 + mm(35), y0 + mm(4.2), mm(10), mm(4.3), fill="#c98f3f", stroke="none", sw=0, rx=1)
    return (x0 + w, y0 + h / 2)


def esp32(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(55), mm(28), "#1b1c1f", "#000",
          [(*P(1.8, 1.8), mm(1.0)), (*P(1.8, 26.2), mm(1.0)), (*P(53.2, 1.8), mm(1.0)), (*P(53.2, 26.2), mm(1.0))])
    s.rect(*P(-1.5, 10.5), mm(7.5), mm(7.0), fill="url(#can)", stroke="#6f767d", sw=0.8, rx=mm(2.5))
    for by in (5.0, 19.5):
        s.rect(*P(8.0, by), mm(3.5), mm(3.5), fill="#d7dade", stroke="#80878f", sw=0.5)
        s.circle(*P(9.75, by + 1.75), mm(1.0), fill="#2a2a2a", stroke="none", sw=0)
    chip(s, *P(14.5, 11.5), mm(5), mm(5), n=4)
    smd(s, *P(21.5, 9.0), mm(3.0), mm(2.0)); smd(s, *P(21.5, 17.0), mm(3.0), mm(2.0))
    s.rect(*P(26.0, 4.2), mm(29.0), mm(19.6), fill="#25272b", stroke="#000", sw=0.6)
    s.rect(*P(26.6, 5.0), mm(17.5), mm(18.0), fill="url(#can)", stroke="#7b838b", sw=0.8, rx=1)
    s.text(x0 + mm(35.3), y0 + mm(13.3), "ESP32-WROOM-32", 4.6, "middle", "bold", "#4c535a")
    s.line([P(46.0, 7), P(53.5, 7), P(53.5, 10), P(46.5, 10), P(46.5, 13), P(53.5, 13),
            P(53.5, 16), P(46.5, 16), P(46.5, 19), P(53.5, 19)], c=GOLD, w=1.4)
    top = ["5V", "CMD", "SD3", "SD2", "13", "GND", "12", "14", "27", "26", "25", "33", "32", "35", "34", "VN", "VP", "EN", "3V3"]
    bot = ["CLK", "SD0", "SD1", "15", "2", "0", "4", "16", "17", "5", "18", "19", "GND", "21", "RX0", "TX0", "22", "23", "GND"]
    pins = {}
    for row, names, ty in (("T", top, 1.5), ("B", bot, 26.5)):
        pts = [(x0 + mm(4.5 + 2.54 * i), y0 + mm(ty)) for i in range(19)]
        for (x, y), n in zip(pts, names):
            pin(s, x, y, 1.5)
            pins[f"{row}{n}" if n == "GND" and f"{row}GND" not in pins else f"{row}{n}"] = pins.get(f"{row}{n}", (x, y))
            silk(s, x, y + (6.5 if row == "T" else -4.0), n, 3.0)
    pins["VIN"] = (x0 + mm(4.5), y0 + mm(1.5))
    pins["GND_T"] = (x0 + mm(4.5 + 2.54 * 5), y0 + mm(1.5))
    pins["G16"] = (x0 + mm(4.5 + 2.54 * 7), y0 + mm(26.5))
    pins["G17"] = (x0 + mm(4.5 + 2.54 * 8), y0 + mm(26.5))
    return pins


def ds3231(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(38), mm(22), PCB_BLUE, "#0f3166",
          [(*P(34.5, 3.0), mm(1.4)), (*P(34.5, 19.0), mm(1.4))])
    chip(s, *P(9.5, 5.0), mm(10.3), mm(7.5), n=8)
    silk(s, x0 + mm(14.6), y0 + mm(9.6), "DS3231", 4.2, c="#9aa1a8")
    chip(s, *P(13.5, 14.5), mm(5), mm(4), n=4)
    for i in range(3):
        smd(s, *P(22.5, 5.5 + i * 3.0), mm(3), mm(1.6))
    s.rect(*P(22.5, 16.0), mm(1.6), mm(1.0), fill="#ff4a3d", stroke="none", sw=0)
    left = ["32K", "SQW", "SCL", "SDA", "VCC", "GND"]
    right = ["SCL", "SDA", "VCC", "GND"]
    pins = {}
    lp = [(x0 + mm(2.2), y0 + mm(11 + (i - 2.5) * 2.54)) for i in range(6)]
    rp = [(x0 + mm(30.8), y0 + mm(11 + (i - 1.5) * 2.54)) for i in range(4)]
    header(s, lp)
    header(s, rp)
    for (x, y), n in zip(lp, left):
        pins["L" + n] = (x, y); silk(s, x + 4, y + 1.5, n, 3.6, "start")
    for (x, y), n in zip(rp, right):
        pins["R" + n] = (x, y); silk(s, x - 4, y + 1.5, n, 3.6, "end")
    return pins


def nextion(s, x0, y0):
    """Nextion NX8048T070-011, 7.0" 800x480 basic HMI, 181 x 108 mm.
    The screen shows the HyFePoul home page (nextion-home.jpg)."""
    import base64
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    s.rect(x0, y0, mm(181), mm(108), fill="#2b2d31", stroke="#111", sw=1.4, rx=mm(1.5), extra='filter="url(#sh)"')
    for a, b in ((3.5, 3.5), (177.5, 3.5), (3.5, 104.5), (177.5, 104.5)):
        s.circle(*P(a, b), mm(1.6), fill="#e9e9e9", stroke=GOLD, sw=1.2)
    s.rect(*P(8.5, 6.0), mm(164), mm(96), fill="#0b0b0c", stroke="#000", sw=1)
    sx, sy = P(13.4, 11.0)
    sw_, sh_ = mm(154.2), mm(85.9)
    data = base64.b64encode((OUT / "nextion-home.jpg").read_bytes()).decode()
    s.add(f'<image href="data:image/jpeg;base64,{data}" x="{sx}" y="{sy}" width="{sw_}" height="{sh_}" '
          f'preserveAspectRatio="none"/>')
    s.add(f'<polygon points="{sx},{sy} {sx + sw_ * .45},{sy} {sx + sw_ * .2},{sy + sh_} {sx},{sy + sh_}" fill="#fff" opacity=".05"/>')
    cx0, cy0 = P(10.0, 104.0)
    s.rect(cx0, cy0, mm(11.5), mm(4.0), fill="#f1efe6", stroke="#9b978a", sw=0.8)
    names = ["GND", "RX", "TX", "+5V"]
    pins = {}
    for i, n in enumerate(names):
        x = cx0 + mm(2.0 + i * 2.5)
        pins[n] = (x, y0 + mm(108))
        s.text(x, cy0 - 3, n, 5, "middle", "bold", "#cfd3d7")
    return pins


def hcsr04(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(45), mm(20), PCB_BLUE, "#0f3166",
          [(*P(1.8, 1.8), mm(0.9)), (*P(43.2, 1.8), mm(0.9)), (*P(1.8, 18.2), mm(0.9)), (*P(43.2, 18.2), mm(0.9))])
    for cx, t in ((10.0, "T"), (35.0, "R")):
        s.circle(*P(cx, 10), mm(8.0), fill="url(#can)", stroke="#6f767d", sw=1)
        s.circle(*P(cx, 10), mm(6.2), fill="url(#mesh)", stroke="#555", sw=0.8)
        silk(s, x0 + mm(cx), y0 + mm(19.2), t, 4.2)
    s.rect(*P(18.5, 2.0), mm(8.0), mm(3.2), fill="url(#can)", stroke="#6f767d", sw=0.6, rx=mm(1.6))
    silk(s, x0 + mm(22.5), y0 + mm(9.0), "HC-SR04", 4.6)
    names = ["VCC", "Trig", "Echo", "Gnd"]
    pins = {}
    pts = [(x0 + mm(22.5 + (i - 1.5) * 2.54), y0 + mm(18.6)) for i in range(4)]
    for (x, y), n in zip(pts, names):
        s.rect(x - 1.4, y, 2.8, mm(4.0), fill="#c9ced3", stroke="#7a8189", sw=0.4)
        pins[n] = (x, y + mm(4.0))
        silk(s, x + 1.4, y - 1.5, n, 3.4, "start", rot=-90)
    s.rect(pts[0][0] - mm(1.27), pts[0][1] - mm(1.2), mm(10.16), mm(2.4), fill="#191919", stroke="#000", sw=0.5)
    return pins


def relay6(s, x0, y0):
    """6-channel 5V relay module (Chapter IV, Figure 4.6), 138 x 56 mm."""
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(138), mm(56), PCB_BLUE, "#0f3166",
          [(*P(2.5, 2.5), mm(1.5)), (*P(135.5, 2.5), mm(1.5)), (*P(2.5, 53.5), mm(1.5)), (*P(135.5, 53.5), mm(1.5))])
    pins = {}
    for k in range(6):
        c = 11.5 + 23.0 * k
        s.rect(*P(c - 7.5, 0.6), mm(15), mm(8.2), fill="#2a6cc8", stroke="#123d7a", sw=0.8)
        for j, tname in enumerate(("NO", "COM", "NC")):
            px, py = P(c - 5 + 5 * j, 3.0)
            s.circle(px, py, mm(1.7), fill="url(#can)", stroke="#555", sw=0.6)
            s.line([(px - 2.6, py - 2.6), (px + 2.6, py + 2.6)], c="#555", w=0.8)
            pins[f"K{k + 1}{tname}"] = (px, y0)
            silk(s, px, y0 + mm(8.0), tname, 3.4, c="#e9f1ff")
        s.rect(*P(c - 7.8, 10.0), mm(15.6), mm(19.2), fill="#2f73dc", stroke="#174a9b", sw=1, rx=1)
        s.rect(*P(c - 6.0, 12.0), mm(12.0), mm(8.0), fill="none", stroke="#7fb0f5", sw=0.6)
        s.text(x0 + mm(c), y0 + mm(16.6), "5VDC", 5.2, "middle", "bold", "#e6f0ff")
        silk(s, x0 + mm(c), y0 + mm(25.5), f"K{k + 1}", 6.5, c="#ffffff")
        s.rect(*P(c - 7.0, 32.0), mm(2.4), mm(1.2), fill="#ff4a3d", stroke="none", sw=0)
        smd(s, *P(c - 7.0, 35.0), mm(2.6), mm(1.4)); smd(s, *P(c - 7.0, 38.0), mm(2.6), mm(1.4))
        s.rect(*P(c - 2.5, 33.5), mm(6.6), mm(5.0), fill="#202020", stroke="#000", sw=0.5)
        s.rect(*P(c + 5.0, 34.0), mm(2.6), mm(2.4), fill="#1c1c1c", stroke="none", sw=0)
        silk(s, x0 + mm(c - 5.5), y0 + mm(44.5), f"DS{k + 1}", 3.2)
        s.rect(*P(c - 7.0, 41.0), mm(2.6), mm(1.4), fill="#ffffff", stroke="#999", sw=0.3)
    names = ["GND", "IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "VCC"]
    pts = [(x0 + mm(45.0 + 2.54 * i), y0 + mm(53.5)) for i in range(8)]
    header(s, pts)
    for (x, y), n in zip(pts, names):
        pins[n] = (x, y)
        silk(s, x + 1.4, y - 3.5, n, 3.5, "start", rot=-90)
    jp = [(x0 + mm(121.0 + 2.54 * i), y0 + mm(53.5)) for i in range(3)]
    header(s, jp)
    s.rect(jp[1][0] - mm(1.3), jp[1][1] - mm(2.0), mm(5.1), mm(4.0), fill="#f2c230", stroke="#7a6014", sw=0.6)
    silk(s, jp[1][0], jp[1][1] - mm(3.4), "JD-VCC", 3.4)
    return pins


def stepdown(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(43), mm(21), PCB_BLUE, "#0f3166")
    for cx, cy in ((7.0, 10.5), (36.0, 10.5)):
        s.circle(*P(cx, cy), mm(4.0), fill="url(#can)", stroke="#6f767d", sw=0.8)
        s.line([P(cx - 2, cy), P(cx + 2, cy)], c="#7a8189", w=0.8)
        s.line([P(cx, cy - 2), P(cx, cy + 2)], c="#7a8189", w=0.8)
    s.rect(*P(14.5, 3.0), mm(12), mm(12), fill="#1b1b1b", stroke="#000", sw=0.6, rx=1)
    s.circle(*P(20.5, 9.0), mm(4.6), fill="#2d2d2d", stroke="#444", sw=0.6)
    s.text(x0 + mm(20.5), y0 + mm(10.0), "330", 5, "middle", "bold", "#bbb")
    s.rect(*P(28.0, 2.0), mm(5.5), mm(5.5), fill="#2f73dc", stroke="#174a9b", sw=0.6)
    s.circle(*P(30.75, 4.75), mm(1.5), fill=GOLD, stroke="#7a6014", sw=0.5)
    chip(s, *P(26.5, 11.5), mm(7.5), mm(6.5), legs_x=False, n=3)
    pins = {}
    for n, a, b in (("IN+", 1.6, 2.5), ("IN-", 1.6, 18.5), ("OUT+", 41.4, 2.5), ("OUT-", 41.4, 18.5)):
        x, y = P(a, b)
        s.circle(x, y, mm(1.2), fill=GOLD, stroke="#7a6014", sw=0.6)
        pins[n] = (x, y)
        silk(s, x + (5 if a < 20 else -5), y + 1.6, n, 3.6, "start" if a < 20 else "end")
    return pins


def buzzer(s, x0, y0):
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    board(s, x0, y0, mm(32), mm(13), PCB_BLUE, "#0f3166", [(*P(29.5, 6.5), mm(1.4))])
    s.circle(*P(17.0, 6.5), mm(6.0), fill="#1a1a1a", stroke="#000", sw=0.8)
    s.circle(*P(17.0, 6.5), mm(1.2), fill="#4a4a4a", stroke="none", sw=0)
    s.text(x0 + mm(17.0) - 7, y0 + mm(6.5) - 5, "+", 6, "middle", "bold", "#888")
    s.rect(*P(7.0, 2.0), mm(2.6), mm(2.4), fill="#1c1c1c", stroke="none", sw=0)
    names = ["VCC", "I/O", "GND"]
    pts = [(x0 + mm(2.0), y0 + mm(6.5 + (i - 1) * 2.54)) for i in range(3)]
    header(s, pts)
    pins = {}
    for (x, y), n in zip(pts, names):
        pins[n] = (x, y); silk(s, x + 4, y + 1.5, n, 3.4, "start")
    return pins


def limit_switch(s, x0, y0):
    """Micro switch with roller lever, side view: body 28x16 mm."""
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    s.line([P(3, 0.5), P(25, -5.0)], c="#bfc5cb", w=mm(1.0))
    s.circle(*P(26, -5.4), mm(2.2), fill="#d0d4d8", stroke="#6f767d", sw=0.8)
    s.rect(*P(13.0, -1.6), mm(2.2), mm(1.8), fill="#e5e5e5", stroke="#999", sw=0.4)
    s.rect(x0, y0, mm(28), mm(16), fill="#202124", stroke="#000", sw=1, rx=1.5, extra='filter="url(#sh)"')
    for a in (6.5, 21.5):
        s.circle(*P(a, 8.0), mm(1.4), fill="#d9d9d9", stroke="#555", sw=0.6)
    pins = {}
    for n, a in (("C", 4.5), ("NC", 14.0), ("NO", 23.5)):
        x = x0 + mm(a)
        s.rect(x - mm(1.6), y0 + mm(16), mm(3.2), mm(4.0), fill="#c9ced3", stroke="#7a8189", sw=0.5)
        pins[n] = (x, y0 + mm(20))
        s.text(x, y0 + mm(14.6), n, 4.4, "middle", "bold", "#cfcfcf")
    return pins


def float_switch(s, x0, y0):
    """Right-angle float switch (Chapter IV, Figure 4.14), side view.
    Threaded stem goes through the reservoir wall; the float hangs inside.
    Leads leave from the outer (left) end."""
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    s.rect(*P(0, 0), mm(26), mm(9), fill="#f4f5f6", stroke="#a6abb0", sw=1, rx=2, extra='filter="url(#sh)"')
    for i in range(9):
        s.line([P(2.5 + i * 1.4, 0.4), P(3.2 + i * 1.4, 8.6)], c="#c3c8cc", w=0.8)
    for a in (4.5, 11.0):
        s.rect(*P(a, -2.5), mm(3.6), mm(14), fill="#e3e6e9", stroke="#9aa0a6", sw=1, rx=1)
    s.rect(*P(18, 7), mm(8), mm(9), fill="#f4f5f6", stroke="#a6abb0", sw=1)
    s.rect(*P(8, 15), mm(20), mm(17), fill="#fafafa", stroke="#a6abb0", sw=1, rx=mm(4), extra='filter="url(#sh)"')
    for yy in (19.5, 23.5, 27.5):
        s.line([P(10, yy), P(26, yy)], c="#dfe2e5", w=1)
    for yy in (3.0, 6.0):
        s.line([P(0, yy), P(-3, yy)], c="#e3c21b", w=2.2)
    return {"a": P(-3, 3.0), "b": P(-3, 6.0)}


def worm_motor(s, x0, y0):
    """12V DC worm gear motor with 8 mm D-shaft (Chapter IV, Figure 4.15),
    top view: 58 x 40 mm gearbox, 31 mm motor can 47 mm long, leads at the end."""
    P = lambda a, b: (x0 + mm(a), y0 + mm(b))
    s.rect(*P(4.5, 55), mm(31), mm(48), fill="url(#blkc)", stroke="#000", sw=1, rx=3, extra='filter="url(#sh)"')
    s.rect(*P(4.5, 55), mm(31), mm(3), fill="#c3c8cd", stroke="#7b838b", sw=0.6)
    s.rect(*P(5.5, 100.5), mm(29), mm(3.5), fill="#1a1a1a", stroke="#000", sw=0.6, rx=2)
    s.rect(x0, y0, mm(40), mm(58), fill="url(#canv)", stroke="#7b838b", sw=1.2, rx=3, extra='filter="url(#sh)"')
    s.line([P(1.2, 1.5), P(1.2, 56.5)], c="#f4f5f6", w=1)
    for a, b in ((3.5, 3.5), (36.5, 3.5), (3.5, 54.5), (36.5, 54.5)):
        cx, cy = P(a, b)
        s.circle(cx, cy, mm(1.6), fill="#dfe2e5", stroke="#666", sw=0.6)
        s.line([(cx - 2, cy), (cx + 2, cy)], c="#555", w=0.7)
        s.line([(cx, cy - 2), (cx, cy + 2)], c="#555", w=0.7)
    for a, b in ((8.5, 30.5), (31.5, 30.5)):
        s.circle(*P(a, b), mm(2.2), fill="#6d747b", stroke="#9aa1a8", sw=0.8)
    s.circle(*P(20, 15), mm(9.0), fill="url(#can)", stroke="#7b838b", sw=1)
    s.circle(*P(20, 15), mm(4.0), fill="#e8eaec", stroke="#6f767d", sw=1)
    s.line([P(17.2, 13.0), P(22.8, 13.0)], c="#6f767d", w=1.2)
    for a, b in ((33.0, 10.5), (33.0, 19.5)):
        s.circle(*P(a, b), mm(2.3), fill="url(#can)", stroke="#7b838b", sw=0.8)
    s.rect(*P(7.0, 38.0), mm(26), mm(13), fill="#f7f7f2", stroke="#9b978a", sw=0.6)
    s.text(x0 + mm(20), y0 + mm(43.0), "DC 12V", 8.5, "middle", "bold", "#333")
    s.text(x0 + mm(20), y0 + mm(48.3), "WORM GEAR", 7, "middle", "bold", "#555")
    plus, minus = P(16, 104), P(24, 104)
    s.line([plus, (plus[0], plus[1] + 9)], c="#c0392b", w=2.4)
    s.line([minus, (minus[0], minus[1] + 9)], c="#222", w=2.4)
    return {"+": (plus[0], plus[1] + 9), "-": (minus[0], minus[1] + 9)}


def battery(s, x0, y0):
    """12V 12Ah sealed battery, 151 x 98 x 95 mm, front and top faces."""
    w, h = mm(151), mm(95)
    dx, dy = 16, -14
    s.add(f'<polygon points="{x0},{y0} {x0 + dx},{y0 + dy} {x0 + w + dx},{y0 + dy} {x0 + w},{y0}" '
          f'fill="#4a4e54" stroke="#1a1a1a" stroke-width="1"/>')
    s.add(f'<polygon points="{x0 + w},{y0} {x0 + w + dx},{y0 + dy} {x0 + w + dx},{y0 + h + dy} {x0 + w},{y0 + h}" '
          f'fill="#202226" stroke="#111" stroke-width="1"/>')
    s.rect(x0, y0, w, h, fill="url(#bfront)", stroke="#111", sw=1.2, extra='filter="url(#sh)"')
    s.rect(x0, y0 + h * .34, w, h * .3, fill="#e8e8e8", stroke="none", sw=0)
    s.text(x0 + w / 2, y0 + h * .34 + h * .3 / 2 + 8, "12V  12Ah", 24, "middle", "bold", "#1e1e1e")
    s.text(x0 + w / 2, y0 + h * .22, "Rechargeable Sealed Lead-Acid", 10, "middle", "bold", "#c9ccd0")
    pins = {}
    for n, a, col in (("+", 20, "#c0392b"), ("-", 131, "#1b1b1b")):
        bx = x0 + mm(a) + dx * .45
        by = y0 + dy * .45
        s.rect(bx - 9, by - 7, 18, 9, fill=col, stroke="#000", sw=0.8)
        s.rect(bx - 4, by - 12, 8, 6, fill="#d0d4d8", stroke="#6f767d", sw=0.6)
        s.text(bx, by + 14, n, 12, "middle", "bold", "#e6e6e6" if n == "-" else "#ff6b5e")
        pins[n] = (bx, by - 12)
    return pins


def charge_controller(s, x0, y0):
    """PWM solar charge controller with LCD and dual USB (Chapter IV,
    Figure 4.11), front view, 133 x 70 mm body."""
    w, h = mm(133), mm(70)
    s.rect(x0 - 18, y0 + 16, w + 36, h - 32, fill="#5a5e63", stroke="#2a2c2f", sw=1, rx=3)
    for hx in (x0 - 9, x0 + w + 9):
        for hy in (y0 + 30, y0 + h - 30):
            s.circle(hx, hy, 4, fill="#fff", stroke="#2a2c2f", sw=0.8)
    s.rect(x0, y0, w, h, fill="#1d1f22", stroke="#000", sw=1.4, rx=6, extra='filter="url(#sh)"')
    fy, fh = y0 + 8, h * .58
    s.rect(x0 + 12, fy, w - 24, fh, fill="#2f86d6", stroke="#0f3f7a", sw=1, rx=3)
    lx, ly, lw, lh = x0 + w * .30, fy + 10, w * .36, fh * .58
    s.rect(lx, ly, lw, lh, fill="#cfdbe6", stroke="#2b2b2b", sw=1.4, rx=2)
    s.text(lx + lw * .55, ly + lh * .55, "12.8", 24, "middle", "bold", "#1f6fd0", family="Consolas, monospace")
    s.text(lx + lw * .88, ly + lh * .3, "V", 9, "middle", "bold", "#1f6fd0")
    s.rect(lx + 8, ly + lh - 16, 14, 10, fill="none", stroke="#1f6fd0", sw=1)
    s.rect(lx + lw * .45, ly + lh - 16, 18, 10, fill="none", stroke="#1f6fd0", sw=1)
    for i in range(2):
        ux, uy = x0 + w - 70, fy + 10 + i * 18
        s.rect(ux, uy, 40, 15, fill="url(#can)", stroke="#6f767d", sw=0.8)
        s.rect(ux + 5, uy + 5, 30, 5, fill="#1b1b1b", stroke="none", sw=0)
    for i in range(3):
        s.circle(x0 + w / 2 + (i - 1) * 34, fy + fh - 12, 8, fill="#e7d5d8", stroke="#6b5a5d", sw=1.2)
        s.circle(x0 + w / 2 + (i - 1) * 34, fy + fh - 12, 4, fill="#c7a7ad", stroke="none", sw=0)
    ty = y0 + h - 44
    s.rect(x0 + 12, ty, w - 24, 38, fill="#2a2c2f", stroke="#111", sw=1, rx=3)
    pins = {}
    names = ["PV+", "PV-", "BAT+", "BAT-", "LOAD+", "LOAD-"]
    xs = [x0 + w * (.22 + .112 * i) for i in range(6)]
    for g in range(3):
        cxg = (xs[2 * g] + xs[2 * g + 1]) / 2
        s.text(xs[2 * g], ty + 10, "+", 9, "middle", "bold", "#cfd3d7")
        s.text(xs[2 * g + 1], ty + 10, "−", 9, "middle", "bold", "#cfd3d7")
        if g == 0:
            s.rect(cxg - 7, ty + 2, 14, 9, fill="none", stroke="#cfd3d7", sw=0.8)
            s.line([(cxg - 2.3, ty + 2), (cxg - 2.3, ty + 11)], c="#cfd3d7", w=0.6)
            s.line([(cxg + 2.3, ty + 2), (cxg + 2.3, ty + 11)], c="#cfd3d7", w=0.6)
        elif g == 1:
            s.rect(cxg - 7, ty + 3, 14, 8, fill="none", stroke="#cfd3d7", sw=0.8)
            s.rect(cxg - 4, ty + 1.5, 2, 1.5, fill="#cfd3d7", stroke="none", sw=0)
            s.rect(cxg + 2, ty + 1.5, 2, 1.5, fill="#cfd3d7", stroke="none", sw=0)
        else:
            s.circle(cxg, ty + 6, 4, fill="none", stroke="#cfd3d7", sw=0.8)
    for x, n in zip(xs, names):
        s.circle(x, ty + 25, 7, fill="url(#can)", stroke="#555", sw=0.8)
        s.line([(x - 4, ty + 21), (x + 4, ty + 29)], c="#555", w=1)
        pins[n] = (x, y0 + h)
    return pins


def psu(s, x0, y0):
    """12V 12.5A (150W) enclosed switching power supply (Chapter IV,
    Figure 4.8), top view, 98 x 199 mm, terminal block at the bottom end."""
    w, h = mm(98), mm(199)
    s.rect(x0, y0, w, h, fill="#c7ccd1", stroke="#7b8289", sw=1.4, rx=2, extra='filter="url(#sh)"')
    s.rect(x0 + 8, y0 + 8, w - 16, h - 78, fill="url(#perf)", stroke="#8d939a", sw=0.8)
    sx, sy = x0 + w * .22, y0 + h * .34
    s.rect(sx, sy, w * .44, 40, fill="#f2d33a", stroke="#a88f12", sw=0.8,
           extra=f'transform="rotate(-28 {sx + w * .22} {sy + 20})"')
    s.text(sx + w * .22, sy + 24, "CAUTION", 9, "middle", "bold", "#3a3000")
    s.rect(x0 + 8, y0 + h - 66, w - 16, 16, fill="#eceef0", stroke="#8d939a", sw=0.6)
    names = ["L", "N", "⏚", "-V", "-V", "+V", "+V"]
    xs = [x0 + 4 + (w - 8) * (i + .5) / 7 for i in range(7)]
    for x, n in zip(xs, names):
        s.text(x, y0 + h - 54, n, 8.5, "middle", "bold", "#333")
    s.rect(x0 + 4, y0 + h - 46, w - 8, 42, fill="#1d1d1d", stroke="#000", sw=1)
    pins = {}
    for i, (x, n) in enumerate(zip(xs, names)):
        s.rect(x - 11, y0 + h - 40, 22, 30, fill="#2b2b2b", stroke="#000", sw=0.6)
        s.circle(x, y0 + h - 25, 7, fill="url(#can)", stroke="#555", sw=0.8)
        s.line([(x - 4, y0 + h - 29), (x + 4, y0 + h - 21)], c="#555", w=1)
        pins[n + str(i)] = (x, y0 + h)
    s.circle(x0 + w - 18, y0 + h - 84, 6, fill="#f2f2f2", stroke="#777", sw=0.8)
    s.text(x0 + w - 32, y0 + h - 81, "V.ADJ", 7, "end", "bold", "#333")
    s.circle(x0 + 18, y0 + h - 84, 3, fill="#4ade80", stroke="#1f7a3f", sw=0.6)
    s.text(x0 + w / 2, y0 + 30, "12V 12.5A · 150W", 11, "middle", "bold", "#333")
    return pins


# -- sheet --------------------------------------------------------------------

def illustration():
    s = Svg()
    defs(s)
    MX, MY = 640, 560

    # Parts first (wires are drawn on top, like the reference).
    rows = []
    for i, tray in enumerate(TRAY_BLOCKS):
        y0 = 70 + 175 * i
        end = load_cell(s, 40, y0)
        hp = hx711(s, 290, y0 - 9, tray)
        label(s, 40 + mm(40), y0 + mm(12.7) + 16, f"LOAD CELL · TRAY {tray}")
        label(s, 290 + mm(17), y0 - 9 + mm(21) + 14, "HX711", f"DT A{2 * i} · SCK A{2 * i + 1}")
        rows.append((end, hp))
    mp = mega(s, MX, MY)
    label(s, MX, MY + mm(53.3) + 18, "ARDUINO MEGA 2560", None, "start")
    rp = relay6(s, 613, 352.3)
    label(s, 606, 392, "6-CH RELAY", "5V · active LOW\nIN1 D10 · IN2 D9 · IN3 D8", "end")
    cm = worm_motor(s, 640, 40)
    label(s, 630, 110, "CHAIN MOTOR", "12V DC worm gear\nK1 / K2 COM", "end")
    dm = worm_motor(s, 760, 40)
    label(s, 858, 110, "DISPENSER MOTOR", "12V DC worm gear\nK3 COM", "start")
    ep = esp32(s, 950, 385)
    label(s, 1080, 405, "ESP32 38-PIN", "Wi-Fi bridge\nGPIO16 ← D14 TX3\nGPIO17 → D15 RX3", "start")
    tp = ds3231(s, 1150, 580)
    label(s, 1128, 598, "RTC DS3231", "SDA D20 · SCL D21", "end")
    npn = nextion(s, 1350, 30)
    label(s, 1350 + mm(90.5), 30 + mm(108) + 18, "NEXTION NX8048T070-011",
          "7.0\" 800×480 · RX ← D16 TX2 · TX → D17 RX2")
    sd = stepdown(s, 1150, 225)
    label(s, 1150 + mm(21.5), 218, "DC-DC BUCK 12V → 5V")
    bz = buzzer(s, 515, 500)
    label(s, 592, 512, "BUZZER", "low trigger · I/O D11", "start")
    us = hcsr04(s, 880, 760)
    label(s, 952, 724, "ULTRASONIC HC-SR04", "Trig D52 · Echo D50")
    fs = float_switch(s, 1190, 750)
    label(s, 1222, 750 + mm(32) + 18, "FLOAT SWITCH", "right angle · D49")
    l1 = limit_switch(s, 1000, 775)
    label(s, 1000 + mm(14), 775 + mm(20) + 30, "LIMIT SW", "left · D51")
    l2 = limit_switch(s, 1095, 775)
    label(s, 1095 + mm(14), 775 + mm(20) + 30, "LIMIT SW", "right · D53")
    cc = charge_controller(s, 1010, 905)
    label(s, 984, 985, "SOLAR CHARGE CONTROLLER", "PWM · PV input not connected", "end")
    bt = battery(s, 1420, 862)
    label(s, 1420 + mm(75.5), 862 + mm(95) + 16, "BATTERY", "12V 12Ah sealed lead-acid")
    ps = psu(s, 1540, 312)
    label(s, 1532, 420, "SWITCHING POWER SUPPLY", "12V 12.5A · 150W\n220V AC in · charges battery side", "end")

    # ---- power rails
    LR, LB, RR, RB = 396, 404, 1268, 1275
    WR(s, [(LR, 60), (LR, 885)], V5, 3); WR(s, [(LB, 60), (LB, 892)], GNDW, 3)
    WR(s, [(LR, 885), (RR, 885)], V5, 3); WR(s, [(LB, 892), (RB, 892)], GNDW, 3)
    WR(s, [(RR, sd["OUT+"][1]), (RR, 885)], V5, 3); WR(s, [(RB, sd["OUT-"][1]), (RB, 892)], GNDW, 3)
    WR(s, [sd["OUT+"], (RR, sd["OUT+"][1])], V5); J(s, RR, sd["OUT+"][1], V5)
    WR(s, [sd["OUT-"], (RB, sd["OUT-"][1])], GNDW)

    # ---- load cells -> HX711 -> Mega analog pins
    cols = ["#d42a2a", "#222222", "#f4f4f4", "#1e9a4a"]
    for i, (end, hp) in enumerate(rows):
        ex, ey = end
        for k, n in enumerate(("E+", "E-", "A-", "A+")):
            px, py = hp[n]
            fx = ex + 14 + k * 6
            pts = [(ex, ey - 4.5 + k * 3), (fx, ey - 4.5 + k * 3), (fx, py), (px, py)]
            if cols[k] == "#f4f4f4":
                WR(s, pts, "#9a9a9a", 2.6)
            WR(s, pts, cols[k], 1.8)
        for j, n in ((2 * i, "DT"), (2 * i + 1, "SCK")):
            px, py = hp[n]
            cx, hy = 492 - 7 * j, 712 + 7 * j
            ax, ay = mp[f"A{j}"]
            WR(s, [(px, py), (cx, py), (cx, hy), (ax, hy), (ax, ay)])
        vx, vy = hp["VCC"]; gx, gy = hp["GND"]
        WR(s, [(vx, vy), (LR, vy)], V5, 2); J(s, LR, vy, V5)
        WR(s, [(gx, gy), (LB, gy)], GNDW, 2); J(s, LB, gy, GNDW)

    # ---- relay inputs straight up from D10, D9, D8
    for n, d in (("IN1", "D10"), ("IN2", "D9"), ("IN3", "D8")):
        WR(s, [mp[d], rp[n]])
    gx, gy = rp["GND"]; vx, vy = rp["VCC"]
    WR(s, [(gx, gy), (gx, gy + 10), (LB, gy + 10)], GNDW, 2); J(s, LB, gy + 10, GNDW)
    WR(s, [(vx, vy), (vx, gy + 18), (LR, gy + 18)], V5, 2); J(s, LR, gy + 18, V5)
    # buzzer on D11
    dx, dy = mp["D11"]
    bx, by = bz["I/O"]
    WR(s, [(dx, dy), (dx, 548), (bx - 10, 548), (bx - 10, by), (bx, by)])
    WR(s, [bz["VCC"], (LR, bz["VCC"][1])], V5, 2); J(s, LR, bz["VCC"][1], V5)
    WR(s, [bz["GND"], (LB, bz["GND"][1])], GNDW, 2); J(s, LB, bz["GND"][1], GNDW)

    # ---- 12V side: relay contacts and motors
    OR, OB = 1328, 1320
    WR(s, [rp["K1NO"], (rp["K1NO"][0], 290), (OR, 290)], V12, 2.8)
    for k in (2, 3):
        x, y = rp[f"K{k}NO"]; WR(s, [(x, y), (x, 290)], V12, 2.4); J(s, x, 290, V12)
    WR(s, [rp["K1NC"], (rp["K1NC"][0], 300), (OB, 300)], GNDW, 2.8)
    for k in (2, 3):
        x, y = rp[f"K{k}NC"]; WR(s, [(x, y), (x, 300)], GNDW, 2.4); J(s, x, 300, GNDW)
    c1, c2, c3 = rp["K1COM"], rp["K2COM"], rp["K3COM"]
    WR(s, [c1, (c1[0], 284), (cm["+"][0], 284), cm["+"]], "#c0392b", 2.4)
    WR(s, [c2, (c2[0], 286), (cm["-"][0], 286), cm["-"]], "#7a4bc2", 2.4)
    WR(s, [c3, (c3[0], 284), (dm["+"][0], 284), dm["+"]], "#c0392b", 2.4)
    WR(s, [dm["-"], (dm["-"][0], 300)], GNDW, 2.4); J(s, dm["-"][0], 300, GNDW)
    # 12V bus down to the charge controller load terminals
    WR(s, [(OR, 290), (OR, 1066), (cc["LOAD+"][0], 1066), cc["LOAD+"]], V12, 2.8)
    WR(s, [(OB, 300), (OB, 1074), (cc["LOAD-"][0], 1074), cc["LOAD-"]], GNDW, 2.8)
    # buck converter input from the 12V bus
    WR(s, [sd["IN+"], (1132, sd["IN+"][1]), (1132, 290)], V12, 2.2); J(s, 1132, 290, V12)
    WR(s, [sd["IN-"], (1140, sd["IN-"][1]), (1140, 300)], GNDW, 2.2); J(s, 1140, 300, GNDW)
    # power supply output joins the 12V bus; mains in on L and N
    pv, nv = ps["+V5"], ps["-V3"]
    WR(s, [pv, (pv[0], 790), (1412, 790), (1412, 828)], V12, 2.6); J(s, 1412, 828, V12)
    WR(s, [nv, (nv[0], 782), (1420, 782), (1420, 820)], GNDW, 2.6); J(s, 1420, 820, GNDW)
    WR(s, [ps["L0"], (ps["L0"][0], 762), (1500, 762)], "#7b4a21", 2.4)
    WR(s, [ps["N1"], (ps["N1"][0], 772), (1500, 772)], "#2f6fd6", 2.4)
    s.rect(1468, 752, 32, 30, fill="#2b2b2b", stroke="#000", sw=1, rx=5)
    s.rect(1458, 759, 10, 4, fill="#c9ced3", stroke="#777", sw=0.5)
    s.rect(1458, 771, 10, 4, fill="#c9ced3", stroke="#777", sw=0.5)
    s.text(1484, 746, "220V AC", 9, "middle", "bold", "#3c4248")
    # battery to the controller
    WR(s, [cc["BAT+"], (cc["BAT+"][0], 1082), (1412, 1082), (1412, 828), (bt["+"][0], 828), bt["+"]], V12, 2.6)
    WR(s, [cc["BAT-"], (cc["BAT-"][0], 1088), (1420, 1088), (1420, 820), (bt["-"][0], 820), bt["-"]], GNDW, 2.6)

    # ---- ESP32 on Serial3 with the 1k/2k divider on its RX
    tx3, rx3 = mp["D14"], mp["D15"]
    g16, g17 = ep["G16"], ep["G17"]
    WR(s, [tx3, (tx3[0], 520), (900, 520)])
    s.rect(900, 514, 20, 12, fill="#e3cfa0", stroke="#9b8452", sw=0.8, rx=5)
    for k, c in enumerate(("#6b3e1f", "#111", "#d42a2a")):
        s.rect(903 + k * 4.5, 514, 2.4, 12, fill=c, stroke="none", sw=0)
    s.text(918, 509, "1kΩ", 9, "end", "bold", "#333")
    WR(s, [(920, 520), (g16[0], 520), g16]); J(s, 935, 520, SIG)
    WR(s, [(935, 520), (935, 512)])
    s.rect(929, 492, 12, 20, fill="#e3cfa0", stroke="#9b8452", sw=0.8, rx=5)
    for k, c in enumerate(("#d42a2a", "#111", "#d42a2a")):
        s.rect(929, 495 + k * 4.5, 12, 2.4, fill=c, stroke="none", sw=0)
    s.text(945, 505, "2kΩ", 9, "start", "bold", "#333")
    WR(s, [(935, 492), (935, 370), (ep["GND_T"][0], 370), ep["GND_T"]], GNDW, 2)
    WR(s, [rx3, (rx3[0], 528), (g17[0], 528), g17])
    WR(s, [ep["VIN"], (ep["VIN"][0], 362), (RR, 362)], V5, 2); J(s, RR, 362, V5)
    WR(s, [(ep["GND_T"][0], 370), (RB, 370)], GNDW, 2); J(s, RB, 370, GNDW)

    # ---- RTC on I2C
    sda, scl = mp["D20"], mp["D21"]
    WR(s, [sda, (sda[0], 550), (1142, 550), (1142, tp["LSDA"][1]), tp["LSDA"]])
    WR(s, [scl, (scl[0], 556), (1136, 556), (1136, tp["LSCL"][1]), tp["LSCL"]])
    WR(s, [tp["RVCC"], (RR, tp["RVCC"][1])], V5, 2); J(s, RR, tp["RVCC"][1], V5)
    WR(s, [tp["RGND"], (RB, tp["RGND"][1])], GNDW, 2); J(s, RB, tp["RGND"][1], GNDW)

    # ---- Nextion on Serial2 (cable colours as wired: RX yellow, TX blue)
    tx2, rx2 = mp["D16"], mp["D17"]
    fan = {"GND": (1284, 318), "RX": (1292, 324), "TX": (1300, 330), "+5V": (1308, 336)}
    for n, c in (("GND", GNDW), ("RX", "#e8c21b"), ("TX", SIG), ("+5V", V5)):
        x, y = npn[n]; fx, fy = fan[n]
        WR(s, [(x, y), (x, fy), (fx, fy)], c, 2.2)
    WR(s, [(1284, 318), (RB, 318)], GNDW, 2.2); J(s, RB, 318, GNDW)
    WR(s, [(1308, 336), (1308, 344), (RR, 344)], V5, 2.2); J(s, RR, 344, V5)
    WR(s, [(1292, 324), (1292, 536), (tx2[0], 536), tx2], "#e8c21b", 2.2)
    WR(s, [(1300, 330), (1300, 542), (rx2[0], 542), rx2], SIG, 2.2)

    # ---- Mega power from the double header
    v5, g = mp["5V_1"], mp["GND_1"]
    WR(s, [v5, (878, v5[1]), (878, 885)], V5, 2.2); J(s, 878, 885, V5)
    WR(s, [g, (870, g[1]), (870, 892)], GNDW, 2.2); J(s, 870, 892, GNDW)

    # ---- ultrasonic, float and limit switches on the double header
    p50, p52 = mp["D50"], mp["D52"]
    WR(s, [p52, (838, p52[1] + 10), (838, 822), (us["Trig"][0], 822), us["Trig"]])
    WR(s, [p50, (830, p50[1] + 14), (830, 830), (us["Echo"][0], 830), us["Echo"]])
    WR(s, [us["VCC"], (us["VCC"][0], 860), (905, 860), (905, 885)], V5, 2); J(s, 905, 885, V5)
    WR(s, [us["Gnd"], (us["Gnd"][0], 870), (950, 870), (950, 892)], GNDW, 2); J(s, 950, 892, GNDW)
    p49, p51, p53 = mp["D49"], mp["D51"], mp["D53"]
    WR(s, [p49, (1180, p49[1]), (1180, fs["a"][1]), fs["a"]])
    WR(s, [fs["b"], (1170, fs["b"][1]), (1170, 892)], GNDW, 2); J(s, 1170, 892, GNDW)
    for p, sw, side in ((p51, l1, 992), (p53, l2, 1087)):
        cx, cy = sw["C"]
        WR(s, [p, (side, p[1]), (side, cy + 10), (cx, cy + 10), (cx, cy)])
        x, y = sw["NO"]
        WR(s, [(x, y), (x, y + 10), (side + 66, y + 10), (side + 66, 892)], GNDW, 2); J(s, side + 66, 892, GNDW)

    legend(s)
    return s.svg(vb=(18, 22, 1764, 1092))


def legend(s):
    x, y = 40, 905
    s.rect(x, y, 330, 168, fill="#fff", stroke="#9aa3ad", sw=1, rx=4)
    s.text(x + 12, y + 20, "WIRE COLOURS", 11, "start", "bold", "#1d2733")
    for i, (c, txt) in enumerate(((V5, "+5V"), (V12, "+12V (power supply and battery)"),
                                  (GNDW, "GND (all grounds common)"), (SIG, "signal"),
                                  ("#e8c21b", "Nextion RX (cable colour)"))):
        yy = y + 40 + i * 19
        WR(s, [(x + 14, yy), (x + 44, yy)], c, 2.6)
        s.text(x + 54, yy + 4, txt, 10, "start", "normal", "#2b333c")
    s.text(x + 12, y + 148, "Modules drawn to one scale (1 mm = 2.2 px).", 9, "start", "normal", "#5b6672")
    s.text(x + 12, y + 161, "Part models as listed in Chapter IV.", 9, "start", "normal", "#5b6672")


if __name__ == "__main__":
    (OUT / "hyfepoul-schematic-diagram.svg").write_text(schematic(), encoding="utf-8")
    (OUT / "hyfepoul-digital-illustration.svg").write_text(illustration(), encoding="utf-8")
    print("wrote", OUT)
