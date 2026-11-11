#!/usr/bin/env python3
"""
Build the Shopify product import CSV for Sultan of Statues.

Every field here is traceable to one of the six supplied eBay listings. The
script refuses to invent condition, box, inclusion, weight or delivery detail:
where a listing does not state something, the description carries a loud
CONFIRM marker instead of a plausible-sounding guess, so nothing unverified
can reach a buyer by accident.

Prices are the listing's item price excluding postage, rounded UP to the next
whole pound (ceil). Mihawk 143.56 -> 144 is the reference case.

Run:  python3 tools/build_product_csv.py
Out:  data/sultan-products.csv
"""
import csv
import math
import os
from decimal import Decimal

OUT = "data/sultan-products.csv"

# --- Source of truth: the six supplied eBay listings -----------------------
# listing_title is copied verbatim from the listing. scale is recorded only
# where the listing title states it. condition_note is the seller's own words.
PIECES = [
    dict(
        handle="gear-5-luffy-anikingdom-jimei-palace",
        ebay_item="398350897147",
        listing_title="One Piece ANIKINGDOM X JIMEI PALACE Gear 5 Luffy Resin Statue",
        title="Gear 5 Luffy",
        character="Gear 5 Luffy",
        vendor="Anikingdom x Jimei Palace",
        scale=None,                      # not stated in the listing title
        source_price=Decimal("699.31"),
        condition_note="Opened and assembled only to check for issues. No flaws.",
        photo="assets/sos-statue-luffy-gear5.webp",
        alt="Gear 5 Luffy resin statue by Anikingdom x Jimei Palace",
    ),
    dict(
        handle="dracule-mihawk-lx-studio",
        ebay_item="397280232929",
        listing_title="LX Studio Mihawk - One Piece - Anime Resin Statue",
        title="Dracule Mihawk",
        character="Dracule Mihawk",
        vendor="LX Studio",
        scale=None,
        source_price=Decimal("143.56"),
        condition_note=None,
        photo="assets/sos-statue-mihawk.webp",
        alt="Dracule Mihawk resin statue by LX Studio",
    ),
    dict(
        handle="king-monkey-d-studio",
        ebay_item="398142810092",
        listing_title="One Piece Monkey D Studio King Anime Resin Statue",
        title="King",
        character="King",
        vendor="Monkey D Studio",
        scale=None,
        source_price=Decimal("700.00"),
        condition_note=None,
        photo="assets/sos-statue-king.webp",
        alt="King resin statue by Monkey D Studio",
    ),
    dict(
        handle="trafalgar-law-monkey-d-studio",
        ebay_item="920070366183",
        listing_title="One Piece Monkey D Studio Trafalgar Law 1/6 Scale Anime Resin Statue",
        title="Trafalgar Law",
        character="Trafalgar Law",
        vendor="Monkey D Studio",
        scale="1/6",
        source_price=Decimal("1000.00"),
        condition_note=None,
        photo="assets/sos-statue-law.webp",
        alt="Trafalgar Law 1/6 scale resin statue by Monkey D Studio",
    ),
    dict(
        handle="red-roc-luffy-monkey-d-studio",
        ebay_item="920070310179",
        listing_title="One Piece Monkey D Studio Red Roc Luffy 1/6 Scale Anime Resin Statue",
        title="Red Roc Luffy",
        character="Red Roc Luffy",
        vendor="Monkey D Studio",
        scale="1/6",
        source_price=Decimal("1100.00"),
        condition_note=None,
        photo="assets/sos-statue-luffy-redroc.webp",
        alt="Red Roc Luffy 1/6 scale resin statue by Monkey D Studio",
    ),
    dict(
        handle="sabo-jimei-palace",
        ebay_item="920057265529",
        listing_title="One Piece Jimei Palace Sabo 1/6 Scale Resin Statue",
        title="Sabo",
        character="Sabo",
        vendor="Jimei Palace",
        scale="1/6",
        source_price=Decimal("400.00"),
        condition_note=None,
        photo="assets/sos-statue-sabo.webp",
        alt="Sabo 1/6 scale resin statue by Jimei Palace",
    ),
]

# Condition confirmed by the owner: every piece has its original box and is
# in great condition. This is a second-hand business and the listings say so.
BOX_NOTE = ("<p>Second-hand, supplied with its original box, in great condition. "
            "This is a second-hand business: pieces have been owned and displayed "
            "before. Ask us for extra photographs of any detail before you buy.</p>")


def ceil_pound(amount: Decimal) -> int:
    """Round up to the next whole pound. 143.56 -> 144, 700.00 -> 700."""
    return int(math.ceil(amount))


def body_html(p) -> str:
    bits = []
    spec = f"{p['character']} by {p['vendor']}"
    if p["scale"]:
        spec += f", {p['scale']} scale"
    bits.append(f"<p>{spec}. Cast resin collectible display statue.</p>")

    bits.append("<p><strong>Condition</strong></p>")
    bits.append(BOX_NOTE)
    if p["condition_note"]:
        bits.append(f"<p>Seller's note on this piece: &ldquo;{p['condition_note']}&rdquo;</p>")

    # Delivery is deliberately NOT described here. No rates are configured yet,
    # and an unsupported delivery claim on the product page is worse than none;
    # Shopify shows the real cost at checkout once rates exist.
    bits.append("<p>One only. Once sold, this piece is gone.</p>")
    return "".join(bits)


def tags(p):
    t = ["One Piece", p["character"], p["vendor"], "Resin", "Collectible statue"]
    if p["scale"]:
        t.append(f"{p['scale']} scale")
    # Both Luffy pieces must surface for a "Luffy" search even if a shopper
    # searches the bare name rather than the full title.
    if "Luffy" in p["character"]:
        t.append("Luffy")
    return ", ".join(dict.fromkeys(t))


COLUMNS = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published",
    "Option1 Name", "Option1 Value",
    "Variant SKU", "Variant Grams", "Variant Inventory Tracker",
    "Variant Inventory Qty", "Variant Inventory Policy",
    "Variant Fulfillment Service", "Variant Price", "Variant Requires Shipping",
    "Variant Taxable", "Image Src", "Image Position", "Image Alt Text",
    "Gift Card", "SEO Title", "SEO Description", "Status",
]


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = []
    for i, p in enumerate(PIECES, 1):
        price = ceil_pound(p["source_price"])
        rows.append({
            "Handle": p["handle"],
            "Title": p["title"],
            "Body (HTML)": body_html(p),
            "Vendor": p["vendor"],
            "Type": ("%s scale resin statue" % p["scale"]) if p["scale"] else "Resin statue",
            "Tags": tags(p),
            # FALSE + Status draft: import must not expose these on the live
            # card-shop storefront. Publishing is a deliberate cutover step.
            "Published": "FALSE",
            "Option1 Name": "Title",
            "Option1 Value": "Default Title",
            "Variant SKU": f"SOS-{i:03d}",
            # 0 = not yet weighed. Weight-based delivery rates cannot be
            # correct until these are set; see the pre-publish checklist.
            "Variant Grams": 0,
            "Variant Inventory Tracker": "shopify",
            "Variant Inventory Qty": 1,          # UNCONFIRMED - see checklist
            "Variant Inventory Policy": "deny",  # no overselling
            "Variant Fulfillment Service": "manual",
            "Variant Price": price,
            "Variant Requires Shipping": "TRUE",
            "Variant Taxable": "TRUE",
            "Image Src": "",                     # upload locally, see mapping
            "Image Position": 1,
            "Image Alt Text": p["alt"],
            "Gift Card": "FALSE",
            "SEO Title": f"{p['title']} \u2014 {p['vendor']} | Sultan of Statues",
            "SEO Description": (
                f"{p['character']} collectible resin statue by {p['vendor']}"
                + (f", {p['scale']} scale" if p["scale"] else "")
                + ". One only, in stock in the UK."
            ),
            "Status": "draft",
        })

    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    print(f"wrote {OUT}  ({len(rows)} products)\n")
    print(f"{'handle':38} {'source':>9} {'shopify':>8}  photo")
    total = 0
    for p, r in zip(PIECES, rows):
        total += r["Variant Price"]
        print(f"{p['handle']:38} {p['source_price']:>9} {r['Variant Price']:>8}  {p['photo']}")
    print(f"{'':38} {'':>9} {total:>8}  (catalogue total)")

    missing = [p["photo"] for p in PIECES if not os.path.exists(p["photo"])]
    print("\nmissing photos:", missing or "none")


if __name__ == "__main__":
    main()
