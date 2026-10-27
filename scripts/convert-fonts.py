"""Convert the Pixel Operator weights the site uses to WOFF2 in public/fonts/.

Keeps the full glyph set (the font is tiny) and copies the licence alongside.
Run: python scripts/convert-fonts.py
"""
from pathlib import Path
import shutil

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "fonts"
OUT = ROOT / "public" / "fonts"
FACES = ["PixelOperator.ttf", "PixelOperator-Bold.ttf"]

OUT.mkdir(parents=True, exist_ok=True)
for name in FACES:
    font = TTFont(SRC / name)
    font.flavor = "woff2"
    target = OUT / (Path(name).stem + ".woff2")
    font.save(target)
    print(f"{name} -> {target.relative_to(ROOT)} ({target.stat().st_size} bytes)")
shutil.copy(SRC / "LICENSE.txt", OUT / "PixelOperator-LICENSE.txt")
print("copied licence")
