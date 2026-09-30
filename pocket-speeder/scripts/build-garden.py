# Cuts the garden background (data/garden-source.png) into four corner pieces for the page background.
# Boxes are wide enough to hold each corner's whole drawing, so the art fades out on its own;
# only the paper colour is made transparent.
import pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
src = Image.open(root / 'data' / 'garden-source.png').convert('RGBA')
W, H = src.size
PAPER = (0xfe, 0xfe, 0xf4)

PIECES = {
    'tl': (0, 0, 360, 220),
    'tr': (1360, 0, W, 270),
    'bl': (0, 590, 660, H),
    'br': (980, 560, W, H),
}


for name, box in PIECES.items():
    piece = src.crop(box)
    w, h = piece.size
    px = piece.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # paper grain differs by up to ~11, so start opacity just above that
            a = max(0, min(255, (abs(r - PAPER[0]) + abs(g - PAPER[1]) + abs(b - PAPER[2]) - 12) * 7))
            px[x, y] = (r, g, b, a)
    piece.save(root / 'public' / f'garden-{name}.webp', 'WEBP', quality=88, method=6)
    print(name, piece.size)
