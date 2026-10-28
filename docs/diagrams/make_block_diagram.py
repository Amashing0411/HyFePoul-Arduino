"""HyFePoul hardware block diagram (moving-hopper revision, R-47).

Draws the same diagram as SVG (editable, scalable) and PNG from one list of
boxes and connections, in the style of the original block diagram.

    python docs/diagrams/make_block_diagram.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
W, H = 1330, 1990
SCALE = 2  # PNG supersampling
FONT_FILE = "C:/Windows/Fonts/segoeui.ttf"
FONT_ITALIC = "C:/Windows/Fonts/segoeuii.ttf"
FONT_SIZE = 17
LINE_GAP = 22
STROKE = 3
ARROW = 13

# id: (x, y, w, h, label lines, dashed)
BOXES = {
    "ac":      (40, 20, 188, 188, ["220V AC Source"], False),
    "solar":   (300, 20, 188, 188, ["Solar Charger", "Controller"], False),
    "battery": (560, 20, 188, 188, ["12V 12Ah Battery"], False),
    "switch":  (560, 280, 188, 188, ["Main Power Switch"], False),
    "buck1":   (390, 640, 188, 188, ["DC - DC Buck", "Converter"], False),
    "buck2":   (710, 640, 188, 188, ["DC - DC Buck", "Converter"], False),

    "cells":   (4, 640, 188, 188, ["5 Load Cells", "(one under each tray)"], False),
    "hx711":   (4, 905, 188, 188, ["5 × HX711", "(SCK/DT per tray)"], False),
    "float":   (4, 1115, 188, 160, ["Float Switch", "(water reservoir)"], False),
    "home":    (4, 1295, 188, 145, ["Home Limit Switch"], False),
    "end":     (4, 1460, 188, 145, ["End Limit Switch"], False),
    "estop":   (4, 1650, 188, 170, ["Emergency Stop"], False),
    "ultra":   (250, 1790, 188, 175, ["Ultrasonic Sensor", "(hopper level)"], False),

    "mega":    (262, 915, 188, 820, ["Arduino Mega 2560", "microcontroller"], False),

    "esp32":   (500, 915, 188, 190, ["ESP32 WiFi Module", "(to Firebase)"], False),
    "nextion": (710, 915, 188, 190, ['Nextion 7" Display'], False),
    "sd":      (500, 1275, 188, 160, ["SD Card Module"], False),
    "rtc":     (500, 1455, 188, 150, ["RTC Module"], False),
    "buzzer":  (500, 1640, 188, 150, ["Buzzer"], False),

    "relay":   (830, 1140, 188, 188, ["6 - Channel Relay", "Module"], False),
    "chain":   (1120, 1000, 205, 188, ["Chain Motor", "(moves the hopper)", "relays CH1 fwd / CH2 rev"], False),
    "disp":    (1120, 1290, 205, 188, ["Dispenser Motor", "relay CH3"], False),
}

# Connections: list of points; "end" draws an arrowhead at the last point,
# "both" at both ends. Labels: (text, x, y).
LINKS = [
    ([(228, 114), (300, 114)], "end"),
    ([(488, 114), (560, 114)], "both"),
    ([(654, 208), (654, 280)], "end"),
    # main switch -> both buck converters
    ([(654, 468), (654, 550), (484, 550), (484, 640)], "end"),
    ([(654, 550), (804, 550), (804, 640)], "end"),
    # main switch -> relay module (motor supply)
    ([(748, 374), (924, 374), (924, 1140)], "end"),
    # buck 1 -> Mega, buck 2 -> Nextion
    ([(484, 828), (484, 870), (356, 870), (356, 915)], "end"),
    ([(804, 828), (804, 915)], "end"),

    # inputs -> Mega
    ([(98, 828), (98, 905)], "end"),
    ([(192, 999), (262, 999)], "end"),
    ([(192, 1195), (262, 1195)], "end"),
    ([(192, 1367), (262, 1367)], "end"),
    ([(192, 1532), (262, 1532)], "end"),
    ([(192, 1700), (262, 1700)], "end"),
    ([(344, 1790), (344, 1735)], "end"),

    # Mega <-> peripherals
    ([(450, 1010), (500, 1010)], "both"),
    ([(450, 1170), (804, 1170), (804, 1105)], "both"),
    ([(450, 1355), (500, 1355)], "both"),
    ([(450, 1530), (500, 1530)], "both"),
    ([(450, 1715), (500, 1715)], "end"),
    # Mega -> relay module
    ([(450, 1234), (830, 1234)], "end"),
    # relay -> motors
    ([(1018, 1234), (1068, 1234), (1068, 1094), (1120, 1094)], "end"),
    ([(1068, 1234), (1068, 1384), (1120, 1384)], "end"),
]

LABELS = []  # (text, x, y) captions, none needed at the moment

NOTE = ("Water: gravity-fed reservoir on top of the drinker (no pump);",
        "the Mega only reads its float switch.")
NOTE_POS = (720, 1880)

def arrow_head(p_from, p_to):
    (x0, y0), (x1, y1) = p_from, p_to
    dx, dy = x1 - x0, y1 - y0
    length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
    ux, uy = dx / length, dy / length
    bx, by = x1 - ux * ARROW, y1 - uy * ARROW
    px, py = -uy * ARROW * 0.55, ux * ARROW * 0.55
    return [(x1, y1), (bx + px, by + py), (bx - px, by - py)]


def build_svg():
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
             '<rect width="100%" height="100%" fill="#ffffff"/>',
             '<g font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#111" text-anchor="middle">']
    for x, y, w, h, lines, dashed in BOXES.values():
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="#111" stroke-width="{STROKE}"{dash}/>')
        y0 = y + h / 2 - (len(lines) - 1) * LINE_GAP / 2 + 6
        for i, line in enumerate(lines):
            parts.append(f'<text x="{x + w / 2}" y="{y0 + i * LINE_GAP}">{line.replace("&", "&amp;")}</text>')
    for pts, heads in LINKS:
        d = " ".join(f"{x},{y}" for x, y in pts)
        parts.append(f'<polyline points="{d}" fill="none" stroke="#111" stroke-width="{STROKE}"/>')
        if heads in ("end", "both"):
            tri = arrow_head(pts[-2], pts[-1])
            parts.append('<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in tri) + '" fill="#111"/>')
        if heads == "both":
            tri = arrow_head(pts[1], pts[0])
            parts.append('<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in tri) + '" fill="#111"/>')
    for text, x, y in LABELS:
        parts.append(f'<text x="{x}" y="{y}" font-size="15" fill="#333">{text}</text>')
    for i, line in enumerate(NOTE):
        parts.append(f'<text x="{NOTE_POS[0]}" y="{NOTE_POS[1] + i * LINE_GAP}" text-anchor="start" font-style="italic" font-size="16" fill="#333">{line}</text>')
    parts.append("</g></svg>")
    (OUT / "hyfepoul-block-diagram.svg").write_text("\n".join(parts), encoding="utf-8")


def build_png():
    s = SCALE
    img = Image.new("RGB", (W * s, H * s), "white")
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT_FILE, FONT_SIZE * s)
    fl = ImageFont.truetype(FONT_FILE, 15 * s)
    fi = ImageFont.truetype(FONT_ITALIC, 16 * s)
    for x, y, w, h, lines, dashed in BOXES.values():
        d.rectangle([x * s, y * s, (x + w) * s, (y + h) * s], outline="#111111", width=STROKE * s, fill="white")
        y0 = y + h / 2 - (len(lines) - 1) * LINE_GAP / 2
        for i, line in enumerate(lines):
            d.text(((x + w / 2) * s, (y0 + i * LINE_GAP) * s), line, font=f, fill="#111111", anchor="mm")
    for pts, heads in LINKS:
        d.line([(x * s, y * s) for x, y in pts], fill="#111111", width=STROKE * s, joint="curve")
        if heads in ("end", "both"):
            d.polygon([(x * s, y * s) for x, y in arrow_head(pts[-2], pts[-1])], fill="#111111")
        if heads == "both":
            d.polygon([(x * s, y * s) for x, y in arrow_head(pts[1], pts[0])], fill="#111111")
    for text, x, y in LABELS:
        d.text((x * s, y * s), text, font=fl, fill="#333333", anchor="mm")
    for i, line in enumerate(NOTE):
        d.text((NOTE_POS[0] * s, (NOTE_POS[1] + i * LINE_GAP) * s), line, font=fi, fill="#333333", anchor="ls")
    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT / "hyfepoul-block-diagram.png")


if __name__ == "__main__":
    build_svg()
    build_png()
    print("wrote", OUT / "hyfepoul-block-diagram.svg", "and .png")
