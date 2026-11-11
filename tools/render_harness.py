#!/usr/bin/env python3
"""
Local render harness.

Shopify is not reachable from this sandbox, so Liquid cannot be rendered by
the platform. This expands the bespoke sections into static HTML using the
REAL settings from the JSON templates and the REAL assets/sos-palace.css, so
layout, type, colour and responsive behaviour can be inspected honestly.

What it proves: layout and styling.
What it cannot prove: anything that depends on live Shopify data (actual
prices from the catalogue, cart state, search results). Those are marked in
the output as harness stand-ins.

Run: python3 tools/render_harness.py
Out: a set of .html files in the scratchpad, printed at the end.
"""
import json
import os
import re
import sys
from collections import OrderedDict
from html import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("HARNESS_OUT", os.path.join(ROOT, ".harness"))


def load(path):
    raw = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.match(r"^\s*/\*.*?\*/\s*", raw, flags=re.S)
    return json.loads(raw[len(m.group(0)):] if m else raw, object_pairs_hook=OrderedDict)


def asset(name):
    return "file://" + os.path.join(ROOT, "assets", name)


def icon(name, size=20):
    svgs = {
        "arrow": '<svg width="18" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M0.5 6h18M14 1.5L18.5 6 14 10.5"/></svg>',
        "search": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
        "bag": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5.2 7.5h13.6l-1.1 12.3H6.3L5.2 7.5z"/><path d="M9 9.4V6.6a3 3 0 016 0v2.8"/></svg>',
        "account": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.9"/><path d="M4.5 20.2a7.8 7.8 0 0115 0"/></svg>',
        "menu": f'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
        "gem": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M6.6 3.6h10.8L21 9.2 12 20.6 3 9.2l3.6-5.6z"/><path d="M3 9.2h18M9.3 9.2L12 20.6l2.7-11.4M6.6 3.6l2.7 5.6m5.4 0l2.7-5.6"/></svg>',
        "layers": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M12 2.9l9 4.6-9 4.6-9-4.6 9-4.6z"/><path d="M3.4 12.3L12 16.7l8.6-4.4"/><path d="M3.4 16.6L12 21l8.6-4.4"/></svg>',
        "parcel": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.4 7.6L12 3.2l8.6 4.4v8.8L12 20.8l-8.6-4.4V7.6z"/><path d="M3.4 7.6L12 12l8.6-4.4M12 12v8.8"/></svg>',
        "shield": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M12 2.8l7.4 2.7v6c0 4.4-3 8.3-7.4 9.7-4.4-1.4-7.4-5.3-7.4-9.7v-6L12 2.8z"/><path d="M8.7 12.1l2.3 2.3 4.3-4.6" stroke-linecap="round"/></svg>',
    }
    return svgs.get(name, "")


FONTS = """
@font-face{font-family:"Cormorant Garamond";font-style:normal;font-weight:400;src:url('%s') format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-style:normal;font-weight:500;src:url('%s') format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-style:normal;font-weight:600;src:url('%s') format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-style:italic;font-weight:400;src:url('%s') format("woff2")}
@font-face{font-family:"Jost";font-style:normal;font-weight:400;src:url('%s') format("woff2")}
@font-face{font-family:"Jost";font-style:normal;font-weight:500;src:url('%s') format("woff2")}
@font-face{font-family:"Jost";font-style:normal;font-weight:600;src:url('%s') format("woff2")}
""" % (asset("sos-cormorant-400.woff2"), asset("sos-cormorant-500.woff2"),
       asset("sos-cormorant-600.woff2"), asset("sos-cormorant-400-italic.woff2"),
       asset("sos-jost-400.woff2"), asset("sos-jost-500.woff2"), asset("sos-jost-600.woff2"))


def header_html():
    g = load("sections/header-group.json")["sections"]["palace_header"]
    s, blocks = g["settings"], g["blocks"]
    nav = "".join(
        f'<li class="sos-nav__item"><a class="sos-nav__link" href="{b["settings"]["url"]}">'
        f'{escape(b["settings"]["label"])}</a></li>'
        for b in blocks.values())
    drawer = "".join(
        f'<li><a href="{b["settings"]["url"]}">{escape(b["settings"]["label"])}</a></li>'
        for b in blocks.values())
    return f"""
<div class="sos" data-sos-header>
 <header class="sos-header" role="banner"><div class="sos-wrap sos-header__bar">
  <a class="sos-logo sos-logo--lockup" href="/">
    <img class="sos-logo__emblem" src="{asset(s['emblem_asset'])}" alt="" width="295" height="320" style="height:{s['emblem_height']}px">
    <span class="sos-logo__stack">
      <span class="sos-logo__word">{s['logo_lead']} <em>{s['logo_join']}</em> {s['logo_tail']}</span>
      <span class="sos-logo__rule" aria-hidden="true"><i></i><b></b><i></i></span>
    </span>
  </a>
  <nav class="sos-nav" aria-label="Primary"><ul class="sos-nav__list">{nav}</ul></nav>
  <div class="sos-utils">
    <a class="sos-util" href="/search">{icon('search')}</a>
    <a class="sos-util" href="/account">{icon('account')}</a>
    <a class="sos-util" href="/cart">{icon('bag')}</a>
    <button type="button" class="sos-util sos-burger">{icon('menu')}</button>
  </div>
 </div></header>
 <div class="sos-drawer" data-open="false" aria-hidden="true"><div class="sos-drawer__panel">
   <ul class="sos-drawer__list">{drawer}</ul></div></div>
</div>"""


def footer_html():
    g = load("sections/footer-group.json")["sections"]["sos_footer"]
    s, blocks = g["settings"], g["blocks"]
    links = "".join(f'<li><a href="{b["settings"]["url"]}">{escape(b["settings"]["label"])}</a></li>'
                    for b in blocks.values())
    policies = "".join(f"<li><a href='#'>{t}</a></li>" for t in
                       ["Refund policy", "Privacy policy", "Terms of service", "Shipping policy"])
    return f"""
<div class="sos"><footer class="sos-footer" role="contentinfo"><div class="sos-wrap">
 <div class="sos-footer__grid">
  <div class="sos-footer__brand">
    <span class="sos-logo__word sos-footer__word">{s['logo_lead']} <em>{s['logo_join']}</em> {s['logo_tail']}</span>
    <p class="sos-footer__desc">{escape(s['description'])}</p>
    <p class="sos-footer__note">{escape(s['location_note'])}</p>
  </div>
  <nav class="sos-footer__col"><h2 class="sos-footer__h">{s['nav_heading']}</h2>
    <ul class="sos-footer__list">{links}</ul></nav>
  <div class="sos-footer__col"><h2 class="sos-footer__h">{s['contact_heading']}</h2>
    <ul class="sos-footer__list">
      <li><a href="{s['contact_link']}">{escape(s['contact_link_label'])}</a></li>
      <li><a href="{s['sell_link']}">{escape(s['sell_link_label'])}</a></li>
    </ul></div>
 </div>
 <div class="sos-footer__base">
   <p class="sos-footer__copy">&copy; 2026 {escape(s['business_name'])}</p>
   <ul class="sos-footer__policies">{policies}</ul>
 </div>
</div></footer></div>"""


def hero_html(s):
    dw = [w.strip() for w in s["desktop_widths"].split(",")]
    mw = [w.strip() for w in s["mobile_widths"].split(",")]
    d_av = ", ".join(f'{asset(f"{s["desktop_stem"]}-{w}.avif")} {w}w' for w in dw)
    m_av = ", ".join(f'{asset(f"{s["mobile_stem"]}-{w}.avif")} {w}w' for w in mw)
    btn2 = ""
    if s.get("button2_label"):
        btn2 = f'<a class="sos-btn sos-btn--ghost" href="{s["button2_link"]}">{escape(s["button2_label"])}</a>'
    return f"""
<div class="sos"><section class="sos-hero">
 <div class="sos-hero__media" style="--sos-hero-m-aspect: {s['mobile_width']} / {s['mobile_height']};">
  <picture>
    <source media="(max-width: 1000px)" type="image/avif" srcset="{m_av}" sizes="100vw">
    <source type="image/avif" srcset="{d_av}" sizes="100vw">
    <img src="{asset(f'{s["desktop_stem"]}-{dw[-1]}.jpg')}" alt="{escape(s['plate_alt'])}"
         width="{s['plate_width']}" height="{s['plate_height']}" fetchpriority="high"
         style="--sos-hero-focus: {s['focal_point']};">
  </picture>
  <p class="sos-hero__plaque">{escape(s['plate_caption'])}</p>
 </div>
 <div class="sos-hero__copywrap"><div class="sos-hero__copy">
   <p class="sos-eyebrow">{escape(s['eyebrow'])}</p>
   <h1 class="sos-display sos-hero__title">{escape(s['heading'])}</h1>
   <p class="sos-lede">{escape(s['body'])}</p>
   <div class="sos-hero__actions">
     <a class="sos-btn sos-btn--primary" href="{s['button_link']}">{escape(s['button_label'])}{icon('arrow')}</a>
     {btn2}
   </div>
 </div></div>
</section></div>"""


def assurance_html(sec):
    items = "".join(f"""
      <div class="sos-assurance__item">{icon(b['settings']['icon'], 26)}
        <h3>{escape(b['settings']['title'])}</h3>
        <p>{escape(b['settings']['note'])}</p></div>"""
                    for b in sec["blocks"].values())
    return f'<div class="sos"><section class="sos-assurance"><div class="sos-wrap"><div class="sos-assurance__grid">{items}</div></div></section></div>'


def card_await(b):
    s = b["settings"]
    return f"""
  <a class="sos-card sos-card--await" href="{s['link']}?piece={s['name'].replace(' ', '+')}">
    <div class="sos-card__frame">
      <img class="sos-card__img" src="{asset(s['image_asset'])}" alt="{escape(s['name'])}" loading="lazy">
      <span class="sos-card__veil" aria-hidden="true"></span>
    </div>
    <div class="sos-card__body">
      <span class="sos-card__maker">{escape(s['maker'])}</span>
      <h3 class="sos-card__name">{escape(s['name'])}</h3>
      <div class="sos-card__meta">
        <span class="sos-card__scale">{escape(s['scale'])}</span>
        <span class="sos-card__price"><em>{escape(s['price_note'])}</em></span>
      </div>
    </div></a>"""


def card_real(b, price, sold=False):
    """Harness stand-in for an imported product card."""
    s = b["settings"]
    tag = '<span class="sos-card__tag sos-card__tag--sold">Sold</span>' if sold else ""
    price_html = "<em>Sold</em>" if sold else f"&pound;{price:,}"
    return f"""
  <a class="sos-card{' sos-card--sold' if sold else ''}" href="/products/{s['product_handle']}">
    <div class="sos-card__frame">
      <img class="sos-card__img" src="{asset(s['image_asset'])}" alt="{escape(s['name'])}" loading="lazy">
      <span class="sos-card__veil" aria-hidden="true"></span>{tag}
    </div>
    <div class="sos-card__body">
      <span class="sos-card__maker">{escape(s['maker'])}</span>
      <h3 class="sos-card__name">{escape(s['name'])}</h3>
      <div class="sos-card__meta">
        <span class="sos-card__scale">Collectible statue</span>
        <span class="sos-card__price">{price_html}</span>
      </div>
    </div></a>"""


def collection_html(sec, cards):
    s = sec["settings"]
    return f"""
<div class="sos"><section class="sos-collection"><div class="sos-wrap">
 <div class="sos-collection__head">
  <div><p class="sos-eyebrow">{escape(s['eyebrow'])}</p>
   <h2 class="sos-display sos-collection__title">{escape(s['heading'])}</h2></div>
  <a class="sos-textlink" href="{s['link_url']}">{escape(s['link_label'])}{icon('arrow')}</a>
 </div>
 <div class="sos-grid">{cards}</div>
</div></section></div>"""


def prose_html(s):
    btn = ""
    if s.get("button_label"):
        btn = (f'<div class="sos-prose__actions"><a class="sos-btn sos-btn--ghost" '
               f'href="{s["button_link"]}">{escape(s["button_label"])}{icon("arrow")}</a></div>')
    eyebrow = f'<p class="sos-eyebrow">{escape(s["eyebrow"])}</p>' if s.get("eyebrow") else ""
    tint = " sos-prose--tint" if s.get("tint") else ""
    return f"""
<div class="sos"><section class="sos-prose{tint}"><div class="sos-wrap">
 {eyebrow}<h2 class="sos-display sos-prose__title">{escape(s['heading'])}</h2>
 <div class="sos-prose__body">{s['body']}</div>{btn}
</div></section></div>"""


def page(title, body, extra=""):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<style>{FONTS}</style>
<link rel="stylesheet" href="{asset('sos-palace.css')}">
<style>body{{margin:0;background:#f7f1e7}}{extra}</style>
</head><body>{header_html()}{body}{footer_html()}</body></html>"""


PRICES = {
    "gear-5-luffy-anikingdom-jimei-palace": 700,
    "dracule-mihawk-lx-studio": 144,
    "king-monkey-d-studio": 700,
    "trafalgar-law-monkey-d-studio": 1000,
    "red-roc-luffy-monkey-d-studio": 1100,
    "sabo-jimei-palace": 400,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    idx = load("templates/index.json")["sections"]
    blocks = list(idx["gallery"]["blocks"].values())
    written = []

    # 1. Homepage, cards awaiting import (today's real state)
    body = (hero_html(idx["palace_hero"]["settings"])
            + assurance_html(idx["assurance"])
            + collection_html(idx["gallery"], "".join(card_await(b) for b in blocks))
            + prose_html(idx["sell"]["settings"]))
    p = os.path.join(OUT, "home-await.html")
    open(p, "w", encoding="utf-8").write(page("Home — awaiting import", body))
    written.append(p)

    # 2. Homepage, products imported (one sold, to show that state)
    cards = []
    for i, b in enumerate(blocks):
        h = b["settings"]["product_handle"]
        cards.append(card_real(b, PRICES[h], sold=(i == 2)))
    body = (hero_html(idx["palace_hero"]["settings"])
            + assurance_html(idx["assurance"])
            + collection_html(idx["gallery"], "".join(cards))
            + prose_html(idx["sell"]["settings"]))
    p = os.path.join(OUT, "home-live.html")
    open(p, "w", encoding="utf-8").write(page("Home — products live", body))
    written.append(p)

    # 3. Product page
    b = blocks[0]
    s = b["settings"]
    prod = f"""
<div class="sos"><section class="sos-product"><div class="sos-wrap">
 <nav class="sos-crumb"><a href="/collections/all">The Collection</a><span>/</span><span>{escape(s['name'])}</span></nav>
 <div class="sos-product__grid">
  <div class="sos-product__media">
    <figure class="sos-product__shot is-lead"><img src="{asset(s['image_asset'])}" alt="{escape(s['name'])}"></figure>
  </div>
  <div class="sos-product__panel"><div class="sos-product__sticky">
    <p class="sos-eyebrow">{escape(s['maker'])}</p>
    <h1 class="sos-display sos-product__title">{escape(s['name'])} &mdash; {escape(s['maker'])}</h1>
    <div class="sos-product__priceline"><span class="sos-product__price">&pound;700.00</span></div>
    <p class="sos-product__avail"><span class="sos-dot"></span>In stock &mdash; one only</p>
    <form class="sos-product__form">
      <button type="submit" class="sos-btn sos-btn--primary sos-product__add">Add to bag{icon('arrow')}</button>
    </form>
    <a class="sos-textlink sos-product__ask" href="/pages/contact">Ask a question about this piece{icon('arrow')}</a>
    <div class="sos-product__desc sos-prose__body">
      <p>Gear 5 Luffy by Anikingdom x Jimei Palace. Cast resin collectible display statue.</p>
      <p><strong>Condition</strong></p>
      <p>Used. Seller's description: &ldquo;Opened and assembled only to check for issues. No flaws.&rdquo;</p>
      <p><strong>[CONFIRM BEFORE PUBLISHING]</strong> Original box and inner packaging, and exactly what is included.</p>
    </div>
  </div></div>
 </div>
</div></section></div>"""
    p = os.path.join(OUT, "product.html")
    open(p, "w", encoding="utf-8").write(page("Product", prod))
    written.append(p)

    # 4. Search for "Luffy" — two matches, count must agree
    luffy = [b for b in blocks if "Luffy" in b["settings"]["name"]]
    cards = "".join(card_real(b, PRICES[b["settings"]["product_handle"]]) for b in luffy)
    srch = f"""
<div class="sos"><section class="sos-search"><div class="sos-wrap">
 <p class="sos-eyebrow">Search</p>
 <h1 class="sos-display sos-search__title">Results for &ldquo;Luffy&rdquo;</h1>
 <form class="sos-search__form"><input type="search" value="Luffy" placeholder="Character, studio or scale">
   <button class="sos-btn sos-btn--primary">Search{icon('arrow')}</button></form>
 <p class="sos-search__count">{len(luffy)} pieces found.</p>
 <div class="sos-grid sos-search__grid">{cards}</div>
</div></section></div>"""
    p = os.path.join(OUT, "search.html")
    open(p, "w", encoding="utf-8").write(page("Search", srch))
    written.append(p)

    # 5. Empty bag — must offer a route back
    bag = f"""
<div class="sos"><section class="sos-cart"><div class="sos-wrap">
 <p class="sos-eyebrow">Your bag</p><h1 class="sos-display sos-cart__title">Your bag</h1>
 <div class="sos-empty sos-cart__empty">
   <h2>Your bag is empty</h2>
   <p>Nothing here yet. The collection is a good place to start.</p>
   <div class="sos-cart__emptyactions">
     <a class="sos-btn sos-btn--primary" href="/collections/all">Browse the collection{icon('arrow')}</a>
     <a class="sos-btn sos-btn--ghost" href="/">Back to the homepage</a>
   </div>
 </div>
</div></section></div>"""
    p = os.path.join(OUT, "cart-empty.html")
    open(p, "w", encoding="utf-8").write(page("Bag", bag))
    written.append(p)

    for w in written:
        print(w)


if __name__ == "__main__":
    main()
