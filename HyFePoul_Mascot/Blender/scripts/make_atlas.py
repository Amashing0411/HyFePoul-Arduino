"""Build PIP's single colour atlas (1024x1024) used by every opaque part.

Layout (UV origin bottom-left, matches pip_build_stage2.py):
  v 0.25-1.00  logo region: navy fill with the HyFePoul wordmark centred
  v 0.1875-0.25  row 3: blue feather gradient (deep blue -> electric blue -> cyan)
  v 0.125-0.1875 row 2: iris gradient (bright blue -> deep navy)
  v 0.0625-0.125 row 1: wing gradient (white -> light blue -> electric blue -> deep blue)
  v 0.0-0.0625   row 0: 16 solid swatches, 64 px each

Run with plain Python + Pillow:  python make_atlas.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]          # HyFePoul_Mascot/
TEX = ROOT / "Textures"
SIZE = 1024
LOGO_SCALE = 0.47                                   # logo width as a share of the region width

def hx(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)

SWATCHES = [  # index -> colour (keep in sync with SW in pip_build_stage2.py)
    "#f5f8fd",  # 0 feather white
    "#1f63e8",  # 1 feather blue
    "#12306b",  # 2 scarf navy
    "#ffa31a",  # 3 beak / feet orange
    "#f08a00",  # 4 orange dark
    "#ff9fb4",  # 5 blush
    "#8c1a2a",  # 6 mouth
    "#ffffff",  # 7 eye white
    "#0b1f5c",  # 8 iris navy / closed-eye line
    "#3fc8ff",  # 9 cyan
    "#8fd0ff",  # 10 light blue
    "#0a2052",  # 11 navy dark
    "#ffffff", "#ffffff", "#ffffff", "#ffffff",
]

def gradient(stops, n=SIZE):
    xs = np.linspace(0, 1, n)
    pos = [s[0] for s in stops]
    cols = np.stack([hx(s[1]) for s in stops])
    return np.stack([np.interp(xs, pos, cols[:, c]) for c in range(3)], -1)

def main():
    img = np.zeros((SIZE, SIZE, 3), np.float32)
    navy = hx("#12306b")
    # logo region: image rows 0..767 (top)
    img[0:768] = navy
    logo = Image.open(TEX / "T_PIP_Scarf_Logo.png").convert("RGBA")
    w = int(SIZE * LOGO_SCALE); h = int(w * logo.height / logo.width)
    logo = np.asarray(logo.resize((w, h), Image.LANCZOS)).astype(np.float32)
    x0 = (SIZE - w) // 2; y0 = (768 - h) // 2
    a = np.clip((logo[..., 3:4] / 255.0 - 0.3) / 0.7, 0, 1)   # drop faint background haze from the keying
    region = img[y0:y0 + h, x0:x0 + w]
    img[y0:y0 + h, x0:x0 + w] = logo[..., :3] * a + region * (1 - a)
    # gradient rows (image y = 1024 - (row+1)*64 .. 1024 - row*64)
    def row(r, data):
        img[SIZE - (r + 1) * 64: SIZE - r * 64] = data[None, :, :]
    row(1, gradient([(0, "#f5f8fd"), (0.40, "#f5f8fd"), (0.62, "#8fd0ff"), (0.82, "#1f63e8"), (1, "#0d3fb8")]))
    row(2, gradient([(0, "#2a7dff"), (0.30, "#123fa8"), (0.60, "#050f3a"), (1, "#050f3a")]))
    row(3, gradient([(0, "#1450c8"), (0.55, "#1f63e8"), (0.85, "#3f9dff"), (1, "#6fd6ff")]))
    for i, c in enumerate(SWATCHES):
        img[SIZE - 64: SIZE, i * 64:(i + 1) * 64] = hx(c)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(TEX / "T_PIP_Atlas.png", optimize=True)
    print("wrote", TEX / "T_PIP_Atlas.png")

if __name__ == "__main__":
    main()
