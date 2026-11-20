"""Turn Animations/_frames/<clip>/####.png (transparent, 30 fps) into previews:
  Animations/Previews/<clip>.mp4   on the site's ice background (#e8eff8), H.264
  Animations/Previews/<clip>.webp  animated WebP with transparency (loops forever)
Needs ffmpeg on PATH and Pillow.  python make_anim_previews.py"""
from pathlib import Path
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FR = ROOT / "Animations" / "_frames"
OUT = ROOT / "Animations" / "Previews"
FPS = 30

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for d in sorted(p for p in FR.iterdir() if p.is_dir()):
        frames = sorted(d.glob("*.png"))
        if not frames:
            continue
        mp4 = OUT / f"{d.name}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "color=c=0xe8eff8:s=360x414:r=30",
            "-framerate", str(FPS), "-i", str(d / "%04d.png"),
            "-filter_complex", "[0][1]overlay=shortest=1,format=yuv420p",
            "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", str(mp4)], check=True)
        ims = [Image.open(f).convert("RGBA") for f in frames]
        ims[0].save(OUT / f"{d.name}.webp", save_all=True, append_images=ims[1:],
                    duration=round(1000 / FPS), loop=0, lossless=False, quality=80, method=4)
        print(d.name, len(frames))

if __name__ == "__main__":
    main()
