"""Assemble per-group contact sheets from Renders/Stage4_Anim/frames (6 frames per clip).
Run with plain Python + Pillow:  python make_anim_sheets.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import re

ROOT = Path(__file__).resolve().parents[2]
FR = ROOT / "Renders" / "Stage4_Anim" / "frames"
OUT = ROOT / "Renders" / "Stage4_Anim"
BG = (232, 239, 248, 255); NAVY = (18, 48, 107, 255); GREY = (90, 104, 130, 255)

def font(sz, bold=True):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf", sz)
    except OSError:
        return ImageFont.load_default()

def main():
    clips = {}
    for p in sorted(FR.glob("*.png")):
        m = re.match(r"(.+)_(\d)_(\d{3})\.png", p.name)
        if m:
            clips.setdefault(m.group(1), []).append((int(m.group(2)), int(m.group(3)), p))
    groups = {"Locomotion": "Loco_", "Personality": "Pers_", "Website": "Web_"}
    TW, TH, LBL = 240, 276, 230
    for g, pre in groups.items():
        names = [n for n in clips if n.startswith(pre)]
        sheet = Image.new("RGBA", (LBL + 6 * TW, len(names) * (TH + 8) + 60), BG)
        d = ImageDraw.Draw(sheet)
        d.text((16, 14), f"PIP Stage 4: {g} clips (6 evenly spaced frames, 30 fps)", fill=NAVY, font=font(26))
        for r, n in enumerate(names):
            y = 60 + r * (TH + 8)
            d.text((16, y + TH // 2 - 30), n.split("_", 1)[1], fill=NAVY, font=font(24))
            for i, fr, p in sorted(clips[n]):
                im = Image.open(p).convert("RGBA").resize((TW, TH), Image.LANCZOS)
                sheet.alpha_composite(im, (LBL + i * TW, y))
                d.text((LBL + i * TW + 8, y + TH - 26), f"f{fr}", fill=GREY, font=font(18, False))
        sheet.convert("RGB").save(OUT / f"PIP_Stage4_{g}_sheet.png")
        print("wrote", g, len(names))

if __name__ == "__main__":
    main()
