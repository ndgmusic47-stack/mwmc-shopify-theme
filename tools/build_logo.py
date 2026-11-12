#!/usr/bin/env python3
"""
Build the Sultan emblem web assets from the supplied V2 artwork.

The source is a 1024x1024 JPEG of an ivory marble Sultan holding a pink
dragon, shot on near-black. Two jobs:

  1. CUT OUT the black. A plain luminance threshold punches holes in the dark
     shadow crevices inside the robe and leaves a black fringe on the
     semi-transparent edge pixels, which shows as dirt against the espresso
     header. So: threshold, fill interior holes, keep the largest component,
     feather by a pixel, then un-mix the edge colour (the edge pixels are the
     subject blended with black, so dividing by alpha restores the true hue).

  2. CROP so the thing is still readable at ~56 px tall. Measured features:
       turban top      y ~ 10        face        y 180-400, x 420-640
       dragon + horns  x 60-420, y 225-600       brooch      x 641-721, y 509-587
     Two crops are produced so the choice can be made at actual size rather
     than by argument:
       tight  - turban, face, dragon, hand. Brooch excluded.
       brooch - wider, keeps the green brooch, at the cost of ~25% of the
                rendered face size.

Outputs 1x/2x/3x PNGs for each crop.

Run: python3 tools/build_logo.py <source.jpg>
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# Measured from the source artwork (see module docstring).
#
# One crop, not two. Anything narrower than x=735 slices the green brooch
# (x 641-721) in half, which reads as a rendering fault rather than a design
# choice, and the turban itself runs to x=710 so it cannot be avoided by
# cropping tighter. The full crop keeps turban, both faces, the dragon's
# horns, body and tail, the hand, and the whole brooch.
CROPS = {
    # name:        (x0, y0,  x1,  y1)
    "sos-emblem": (55, 4, 762, 628),
}

# The cutout has to end somewhere; a hard horizontal slice through the robe
# looks accidental. Dissolving the last sliver reads as a deliberate vignette.
BOTTOM_FADE = 0.13
HEIGHTS = {"": 1, "@2x": 2, "@3x": 3}
BASE_H = 72          # 1x emblem height in CSS px; header renders it smaller


def cutout(img: Image.Image) -> Image.Image:
    """Return RGBA with the black background removed and edges de-fringed."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float64)
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    # Soft alpha ramp across the matte edge.
    lo, hi = 6.0, 36.0
    soft = np.clip((lum - lo) / (hi - lo), 0.0, 1.0)

    # Solid interior: threshold low, fill holes so shadow crevices inside the
    # figure stay opaque, then keep only the largest blob (drops stray specks).
    soliddef = lum > 14
    solid = ndimage.binary_fill_holes(soliddef)
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        solid = lab == (int(np.argmax(sizes)) + 1)

    alpha = np.maximum(soft, solid.astype(np.float64))

    # Feather a touch so the edge is not aliased at small sizes.
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.6)
    )
    alpha = np.asarray(alpha_img).astype(np.float64) / 255.0

    # Un-mix: edge pixels are subject*alpha + black*(1-alpha). Recover subject.
    safe = np.clip(alpha, 0.35, 1.0)[:, :, None]
    straight = np.clip(rgb / safe, 0, 255)

    out = np.dstack([straight, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = sys.argv[1]
    img = Image.open(src)
    print(f"source: {img.size[0]}x{img.size[1]}  {src}")

    cut = cutout(img)
    os.makedirs(ASSETS, exist_ok=True)

    for name, box in CROPS.items():
        region = cut.crop(box)
        w, h = region.size

        # Dissolve the bottom edge into the header instead of slicing it.
        a = np.asarray(region.getchannel("A")).astype(np.float64) / 255.0
        fade_px = int(h * BOTTOM_FADE)
        if fade_px > 1:
            ramp = np.ones(h)
            ramp[h - fade_px:] = np.linspace(1.0, 0.0, fade_px) ** 1.6
            a *= ramp[:, None]
            region.putalpha(Image.fromarray((a * 255).astype(np.uint8), "L"))

        print(f"\n{name}: crop {box} -> {w}x{h} (aspect {w/h:.3f})")
        for suffix, mult in HEIGHTS.items():
            th = BASE_H * mult
            tw = max(1, round(w * th / h))
            r = region.resize((tw, th), Image.LANCZOS)
            path = os.path.join(ASSETS, f"{name}{suffix}.png")
            r.save(path, optimize=True)
            print(f"   {os.path.basename(path):28} {tw:4}x{th:<4} {os.path.getsize(path)/1024:6.1f} KB")

    # A large master for anything that needs it later (favicon, social, print).
    master = cut.crop(CROPS["sos-emblem"])
    master.save(os.path.join(ASSETS, "sos-emblem-master.png"), optimize=True)
    print(f"\n   sos-emblem-master.png        {master.size[0]}x{master.size[1]} "
          f"{os.path.getsize(os.path.join(ASSETS,'sos-emblem-master.png'))/1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
