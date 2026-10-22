"""
Builds the HyFePoul icon set from the logo artwork.

    python scripts/make-brand-assets.py [assets/hyfepoul-logo-source.jpg]

The source is a flat picture: a blue rounded square (gradient) with the
text, chicken, signal arcs and waves on top, on a white page. Android
adaptive icons need those as separate layers, so this script:

  1. fits a smooth surface to the square's blue gradient (robust
     quadratic fit, ignoring the artwork), which can be extended to any
     size without white corners or JPEG noise;
  2. extracts the artwork as a soft-edged transparent layer by unmixing
     each pixel from that fitted background;
  3. cuts the rounded square out of the white page with anti-aliased
     edges for a transparent full logo.

Outputs (mobile-app/assets/):
  hyfepoul-logo.png              transparent full logo (README, docs)
  icon.png                       1024 square, opaque (iOS / Play Store);
                                 the platform applies its own rounding
  android-icon-background.png    adaptive icon background (gradient)
  android-icon-foreground.png    adaptive icon foreground (artwork,
                                 inside the 66/108 safe zone)
  android-icon-monochrome.png    themed-icon silhouette (Android 13+)
  splash-icon.png                artwork for the splash screen
  favicon.png                    48 px web icon

Re-run after changing the artwork, then rebuild the native app: icons and
the splash are compiled into the APK.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / "assets"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ASSETS / "hyfepoul-logo-source.jpg"

SIZE = 1024
# Adaptive icons are 108 dp; launchers may cut anything outside the
# central 66 dp circle, so all artwork must fit inside it.
SAFE_DIAMETER = SIZE * 66 / 108


def outside_mask(rgb):
    """True for the white page around the square (flood fill from the
    borders, so white text inside the square is not touched)."""
    h, w, _ = rgb.shape
    white = rgb.min(axis=2) > 215
    out = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        q.extend([(0, x), (h - 1, x)])
    for y in range(h):
        q.extend([(y, 0), (y, w - 1)])
    while q:
        y, x = q.popleft()
        if out[y, x] or not white[y, x]:
            continue
        out[y, x] = True
        if y > 0: q.append((y - 1, x))
        if y < h - 1: q.append((y + 1, x))
        if x > 0: q.append((y, x - 1))
        if x < w - 1: q.append((y, x + 1))
    return out


def design(xs, ys):
    """Quadratic surface terms in normalised coordinates."""
    return np.stack([np.ones_like(xs), xs, ys, xs * xs, xs * ys, ys * ys], axis=1)


def fit_background(rgb, inside):
    """Robust quadratic fit of the square's gradient, per channel."""
    h, w, _ = rgb.shape
    yy, xx = np.mgrid[0:h, 0:w]
    xn, yn = (xx / w) * 2 - 1, (yy / h) * 2 - 1
    use = inside.copy()
    for _ in range(4):
        A = design(xn[use], yn[use])
        coef = np.linalg.lstsq(A, rgb[use].astype(float), rcond=None)[0]
        pred = design(xn.ravel(), yn.ravel()) @ coef
        pred = pred.reshape(h, w, 3)
        resid = np.linalg.norm(rgb - pred, axis=2)
        use = inside & (resid < 18)
    return coef


def render_background(coef, size, scale, ox, oy, src_w, src_h):
    """The fitted gradient on a size x size canvas where the source square
    is drawn at `scale` with its top-left at (ox, oy)."""
    yy, xx = np.mgrid[0:size, 0:size]
    sx = (xx - ox) / scale
    sy = (yy - oy) / scale
    xn, yn = (sx / src_w) * 2 - 1, (sy / src_h) * 2 - 1
    bg = design(xn.ravel(), yn.ravel()) @ coef
    return np.clip(bg.reshape(size, size, 3), 0, 255)


def icon_gradient(coef, size):
    """Clean top-to-bottom gradient for icon backgrounds, using the logo's
    own colours just inside its top and bottom edges (no extrapolation)."""
    pts = design(np.array([0.0, 0.0]), np.array([-0.85, 0.85])) @ coef
    top, bottom = np.clip(pts, 0, 255)
    t = np.linspace(0, 1, size)[:, None, None]
    col = top * (1 - t) + bottom * t
    return np.repeat(col, size, axis=1)


def extract_artwork(rgb, bg, inside):
    """Soft alpha + unmixed colour for the artwork: P = a*F + (1-a)*B.
    Only pixels near clearly-drawn shapes count, so the soft glow behind
    the chicken and the square's rim shading are left in the background."""
    diff = rgb.astype(float) - bg
    dist = np.linalg.norm(diff, axis=2)
    strong = (dist > 55) & inside
    near = np.array(
        Image.fromarray((strong * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    ) > 0
    lo, hi = 22.0, 70.0
    alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
    alpha[~(near & inside)] = 0
    a = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip(bg + diff / a, 0, 255)
    # For the themed silhouette: only shapes lighter than the background
    # (the chicken's dark head becomes a cut-out, as it reads in colour).
    lighter = (rgb.mean(axis=2) - bg.mean(axis=2) - 18) / 40
    light_alpha = np.clip(lighter, 0, 1) * (near & inside)
    return fg, alpha, light_alpha


def edge_alpha(rgb, outside, coef):
    """Anti-aliased alpha for the square on the white page: 1 inside,
    0 on the page, and on the boundary band the mix between white and the
    local blue."""
    h, w, _ = rgb.shape
    band = np.array(
        Image.fromarray((outside * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    ) > 0
    band &= ~np.array(
        Image.fromarray((outside * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))
    ).astype(bool)
    blue = render_background(coef, max(h, w), 1.0, 0, 0, w, h)[:h, :w]
    white = np.array([255.0, 255.0, 255.0])
    num = ((white - rgb) * (white - blue)).sum(axis=2)
    den = ((white - blue) ** 2).sum(axis=2) + 1e-6
    soft = np.clip(num / den, 0, 1)
    alpha = np.where(outside, 0.0, 1.0)
    alpha = np.where(band, soft, alpha)
    return alpha


def to_image(rgb, alpha=None):
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    if alpha is None:
        return Image.fromarray(rgb, "RGB")
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


def main():
    rgb = np.array(Image.open(SRC).convert("RGB")).astype(float)
    outside = outside_mask(rgb.astype(np.uint8))

    # Crop to the square.
    ys, xs = np.where(~outside)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, outside = rgb[t:b, l:r], outside[t:b, l:r]
    h, w, _ = rgb.shape

    # Pixels safely inside the square, away from its rim and the edge
    # highlight along it (the artwork stays ~100 px clear of the edges).
    # Pad with "outside" first: after the tight crop the square touches the
    # image border, and the rim must grow inward from there too.
    pad = 40
    rim = Image.fromarray((np.pad(outside, pad, constant_values=True) * 255).astype(np.uint8))
    for _ in range(4):
        rim = rim.filter(ImageFilter.MaxFilter(9))
    inside = ~np.array(rim).astype(bool)[pad:-pad, pad:-pad]

    coef = fit_background(rgb, inside)
    bg_src = render_background(coef, max(h, w), 1.0, 0, 0, w, h)[:h, :w]
    fg_rgb, fg_alpha, light_alpha = extract_artwork(rgb, bg_src, inside)

    # Artwork bounds and centre, to size it into the safe zone.
    ays, axs = np.where(fg_alpha > 0.05)
    at, ab, al, ar = ays.min(), ays.max() + 1, axs.min(), axs.max() + 1
    art_cx, art_cy = (al + ar) / 2, (at + ab) / 2
    # Radius of the artwork around its centre (it must fit the circle).
    radius = np.sqrt(((axs - art_cx) ** 2 + (ays - art_cy) ** 2).max())

    def layered(size, diameter, alpha_src=None):
        """Foreground artwork scaled so it fits a circle of `diameter`,
        centred, plus the matching background."""
        scale = (diameter / 2) / radius
        # Crop to the artwork plus a margin first, so the resampled layer's
        # own border (which picks up resize artefacts) stays transparent.
        m = 24
        ct, cb = max(at - m, 0), min(ab + m, h)
        cl, cr = max(al - m, 0), min(ar + m, w)
        src_a = fg_alpha if alpha_src is None else alpha_src
        crop = to_image(fg_rgb[ct:cb, cl:cr], src_a[ct:cb, cl:cr])
        fg = crop.resize((round((cr - cl) * scale), round((cb - ct) * scale)), Image.LANCZOS)
        ox = size / 2 - (art_cx - cl) * scale
        oy = size / 2 - (art_cy - ct) * scale
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.alpha_composite(fg, (round(ox), round(oy)))
        bg = to_image(icon_gradient(coef, size))
        return canvas, bg

    # Adaptive icon layers.
    fg, bg = layered(SIZE, SAFE_DIAMETER)
    fg.save(ASSETS / "android-icon-foreground.png")
    bg.save(ASSETS / "android-icon-background.png")

    # Themed icons are a flat silhouette, so JPEG noise on the source edges
    # shows; blur and re-threshold the alpha for smooth, solid shapes.
    light, _ = layered(SIZE, SAFE_DIAMETER, light_alpha)
    soft = np.array(light.getchannel("A").filter(ImageFilter.GaussianBlur(1.5))) / 255.0
    solid = np.clip((soft - 0.4) / 0.2, 0, 1)
    white = Image.new("RGBA", fg.size, (255, 255, 255, 255))
    white.putalpha(Image.fromarray((solid * 255).astype(np.uint8)))
    white.save(ASSETS / "android-icon-monochrome.png")

    # Square icon: the artwork a little larger than the adaptive one, on
    # the full-bleed gradient.
    ifg, ibg = layered(SIZE, SIZE * 0.82)
    icon = ibg.convert("RGBA")
    icon.alpha_composite(ifg)
    icon.convert("RGB").save(ASSETS / "icon.png")
    icon.convert("RGB").resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")

    # Splash: artwork only; the splash background colour comes from
    # app.json. Android 12+ shows it inside a circle of 2/3 its size.
    sfg, _ = layered(SIZE, SIZE * 2 / 3)
    sfg.save(ASSETS / "splash-icon.png")

    # Transparent full logo with anti-aliased rounded corners.
    alpha = edge_alpha(rgb, outside, coef)
    logo = to_image(np.where(outside[..., None], bg_src, rgb), alpha)
    logo.resize((SIZE, round(SIZE * h / w)), Image.LANCZOS).save(ASSETS / "hyfepoul-logo.png")

    grad = icon_gradient(coef, SIZE)
    top, bottom = grad[0, 0].astype(int), grad[-1, 0].astype(int)
    print("icon gradient top #%02X%02X%02X, bottom #%02X%02X%02X" % (*top, *bottom))


if __name__ == "__main__":
    main()
