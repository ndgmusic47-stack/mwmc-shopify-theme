#!/usr/bin/env python3
"""
Build the self-hosted Cal Sans web font for the theme.

Cal Sans v2 is a variable font under the SIL Open Font License 1.1, so it can
be self-hosted and used commercially. The shipped file is 290 KB, which is too
heavy for a hero-blocking font, so this:

  1. pins the axes the design does not use (GEOM, YTAS, SHRP, ital) to their
     defaults, keeping only wght 400-700 and opsz 8-45;
  2. subsets to the characters a UK English storefront actually renders.

Optical size is kept because the brief asks for real weight and size
differences between statue names, prices and supporting information, and opsz
is what keeps small text readable while large display text stays tight.

Input : CalSansVF.woff2 from the `cal-sans` npm package
Output: assets/sos-calsans.woff2  (+ the OFL licence alongside it)

Run: python3 tools/build_calsans.py <path-to-CalSansVF.woff2> <path-to-OFL.txt>
"""
import os
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sos-calsans.woff2")
LICENCE_OUT = os.path.join(ROOT, "assets", "sos-calsans-OFL.txt")

# Everything a UK English storefront renders: basic latin, latin-1 (gives us
# £, accented names like Dracule, ×, °), plus the punctuation the copy uses.
UNICODES = (
    list(range(0x0020, 0x007F))
    + list(range(0x00A0, 0x0100))
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2122]
)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    src, licence = sys.argv[1], sys.argv[2]

    font = TTFont(src)
    before = os.path.getsize(src)

    # Pin the axes the design does not vary. Keeping them would carry their
    # whole delta sets for no benefit.
    font = instancer.instantiateVariableFont(
        font,
        {"GEOM": 25.0, "YTAS": 1440.0, "SHRP": 0.0, "ital": 0.0},
        inplace=True,
        updateFontNames=False,
    )

    opts = subset.Options()
    opts.layout_features = ["*"]          # keep kerning and ligatures
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ["DSIG"]
    opts.flavor = "woff2"

    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)

    font.flavor = "woff2"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    font.save(OUT)

    shutil.copyfile(licence, LICENCE_OUT)

    after = os.path.getsize(OUT)
    axes = [a.axisTag for a in font["fvar"].axes] if "fvar" in font else []
    print(f"  source : {before/1024:7.1f} KB")
    print(f"  output : {after/1024:7.1f} KB  ({100*after/before:.0f}% of source)")
    print(f"  axes   : {axes}")
    print(f"  glyphs : {len(font.getGlyphOrder())}")
    print(f"  wrote  : {os.path.relpath(OUT, ROOT)}")
    print(f"  licence: {os.path.relpath(LICENCE_OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
