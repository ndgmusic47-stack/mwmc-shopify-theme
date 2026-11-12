#!/usr/bin/env python3
"""
Local render harness for the redesign.

Shopify is not reachable from this sandbox, so Liquid cannot be rendered by
the platform. This expands the bespoke sections into static HTML using the
REAL settings from the JSON templates and the REAL assets/sos-palace.css and
self-hosted Cal Sans, so layout, type, colour and responsive behaviour can be
inspected honestly before anything is pushed.

What it proves: layout, typography, the card grouping fix, the logo at header
size, and behaviour down to 320px.
What it cannot prove: anything needing live Shopify data (real cart state,
real search). Those are marked as harness stand-ins.

Run: python3 tools/render_harness.py
"""
import json
import os
import re
from collections import OrderedDict
from html import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("HARNESS_OUT", os.path.join(ROOT, ".harness"))

PRICES = {
    "gear-5-luffy-anikingdom-jimei-palace": "£700.00",
    "dracule-mihawk-lx-studio": "£144.00",
    "king-monkey-d-studio": "£700.00",
    "trafalgar-law-monkey-d-studio": "£1,000.00",
    "red-roc-luffy-monkey-d-studio": "£1,400.00",
    "sabo-jimei-palace": "£400.00",
}


def load(path):
    raw = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.match(r"^\s*/\*.*?\*/\s*", raw, flags=re.S)
    return json.loads(raw[len(m.group(0)):] if m else raw, object_pairs_hook=OrderedDict)


def asset(name):
    return "file://" + os.path.join(ROOT, "assets", name)


def icon(name, size=20):
    s = {
        "arrow": '<svg width="18" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M0.5 6h18M14 1.5L18.5 6 14 10.5"/></svg>',
        "search": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
        "bag": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5.2 7.5h13.6l-1.1 12.3H6.3L5.2 7.5z"/><path d="M9 9.4V6.6a3 3 0 016 0v2.8"/></svg>',
        "account": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.9"/><path d="M4.5 20.2a7.8 7.8 0 0115 0"/></svg>',
        "menu": f'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
        "shield": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M12 2.8l7.4 2.7v6c0 4.4-3 8.3-7.4 9.7-4.4-1.4-7.4-5.3-7.4-9.7v-6L12 2.8z"/><path d="M8.7 12.1l2.3 2.3 4.3-4.6" stroke-linecap="round"/></svg>',
        "gem": f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M6.6 3.6h10.8L21 9.2 12 20.6 3 9.2l3.6-5.6z"/><path d="M3 9.2h18M9.3 9.2L12 20.6l2.7-11.4"/></svg>',
    }
    return s.get(name, "")


FONTS = f"""
@font-face {{
  font-family: "Cal Sans";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('{asset("sos-calsans.woff2")}') format("woff2-variations"),
       url('{asset("sos-calsans.woff2")}') format("woff2");
}}
"""


def header_html():
    g = load("sections/header-group.json")["sections"]["palace_header"]
    s, blocks = g["settings"], g["blocks"]
    nav = "".join(
        f'<li class="sos-nav__item"><a class="sos-nav__link" href="{b["settings"]["url"]}">'
        f'{escape(b["settings"]["label"])}</a></li>' for b in blocks.values())
    drawer = "".join(
        f'<li><a href="{b["settings"]["url"]}">{escape(b["settings"]["label"])}</a></li>'
        for b in blocks.values())
    return f"""
<div class="sos" data-sos-header>
 <header class="sos-header" role="banner"><div class="sos-wrap sos-header__bar">
  <a class="sos-logo sos-logo--lockup" href="/">
    <img class="sos-logo__emblem" src="{asset('sos-emblem@3x.png')}" alt=""
         width="82" height="72" style="height:{s['emblem_height']}px">
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
      <li><a href="mailto:sultan@sultanofstatues.com">sultan@sultanofstatues.com</a></li>
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
        btn2 = (f'<a class="sos-btn sos-btn--ghost" href="{s["button2_link"]}">'
                f'{escape(s["button2_label"])}</a>')
    plaque = (f'<p class="sos-hero__plaque">{escape(s["plate_caption"])}</p>'
              if s.get("plate_caption") else "")
    return f"""
<div class="sos"><section class="sos-hero">
 <div class="sos-hero__media" style="--sos-hero-m-aspect: {s['mobile_width']} / {s['mobile_height']};">
  <picture>
    <source media="(max-width: 1000px)" type="image/avif" srcset="{m_av}" sizes="100vw">
    <source type="image/avif" srcset="{d_av}" sizes="100vw">
    <img src="{asset(f'{s["desktop_stem"]}-{dw[-1]}.jpg')}" alt="{escape(s['plate_alt'])}"
         width="{s['plate_width']}" height="{s['plate_height']}" fetchpriority="high"
         style="--sos-hero-focus: {s['focal_point']};">
  </picture>{plaque}
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


def reasons_html(sec):
    items = ""
    for b in sec["blocks"].values():
        st = b["settings"]
        link = ""
        if st.get("link_label"):
            link = (f'<a class="sos-textlink sos-reasons__link" href="{st["link"]}">'
                    f'{escape(st["link_label"])}{icon("arrow")}</a>')
        items += (f'<li class="sos-reasons__item"><h3 class="sos-reasons__h">{escape(st["title"])}</h3>'
                  f'<p class="sos-reasons__p">{escape(st["text"])}</p>{link}</li>')
    head = (f'<h2 class="sos-display sos-reasons__title">{escape(sec["settings"]["heading"])}</h2>'
            if sec["settings"].get("heading") else "")
    return f'<div class="sos"><section class="sos-reasons"><div class="sos-wrap">{head}<ul class="sos-reasons__list">{items}</ul></div></section></div>'


def card(b, sold=False, awaiting=False):
    s = b["settings"]
    h = s["product_handle"]
    price = ("<em>Enquire</em>" if awaiting else
             "<em>Sold</em>" if sold else PRICES[h])
    tag = '<span class="sos-card__tag sos-card__tag--sold">Sold</span>' if sold else ""
    cls = "sos-card" + (" sos-card--sold" if sold else "") + (" sos-card--await" if awaiting else "")
    href = f'/pages/contact?piece={s["name"].replace(" ", "+")}' if awaiting else f"/products/{h}"
    meta = (f'<span class="sos-card__scale">{escape(s["scale"])}</span>' if awaiting else
            f'<span class="sos-card__scale">Pre-owned, boxed</span>'
            f'<span class="sos-sep" aria-hidden="true">&middot;</span>'
            f'<span class="sos-card__stock">{"No longer available" if sold else "In stock"}</span>')
    return f"""
  <a class="{cls}" href="{href}">
    <div class="sos-card__frame">
      <img class="sos-card__img" src="{asset(s['image_asset'])}" alt="{escape(s['name'])}" loading="lazy">{tag}
    </div>
    <div class="sos-card__body">
      <span class="sos-card__maker">{escape(s['maker'])}</span>
      <h3 class="sos-card__name">{escape(s['name'])}</h3>
      <p class="sos-card__price">{price}</p>
      <p class="sos-card__meta">{meta}</p>
    </div></a>"""


def collection_html(sec, cards):
    s = sec["settings"]
    link = (f'<a class="sos-textlink" href="{s["link_url"]}">{escape(s["link_label"])}{icon("arrow")}</a>'
            if s.get("link_label") else "")
    return f"""
<div class="sos"><section class="sos-collection"><div class="sos-wrap">
 <div class="sos-collection__head">
  <div><p class="sos-eyebrow">{escape(s['eyebrow'])}</p>
   <h2 class="sos-display sos-collection__title">{escape(s['heading'])}</h2></div>
  {link}
 </div>
 <div class="sos-grid">{cards}</div>
</div></section></div>"""


def journey_html(sec):
    s = sec["settings"]
    steps = ""
    for i, b in enumerate(sec["blocks"].values(), 1):
        st = b["settings"]
        steps += (f'<li><span class="sos-journey__n">{i}</span><div>'
                  f'<h3 class="sos-journey__h">{escape(st["title"])}</h3>'
                  f'<p class="sos-journey__p">{escape(st["text"])}</p></div></li>')
    btn = (f'<div class="sos-journey__actions"><a class="sos-btn sos-btn--ghost" '
           f'href="{s["button_link"]}">{escape(s["button_label"])}{icon("arrow")}</a></div>'
           if s.get("button_label") else "")
    fig = ""
    if s.get("image_asset"):
        cap = f'<figcaption>{escape(s["caption"])}</figcaption>' if s.get("caption") else ""
        fig = (f'<figure class="sos-journey__figure"><img src="{asset(s["image_asset"])}" '
               f'alt="{escape(s["image_alt"])}" width="{s["image_width"]}" height="{s["image_height"]}">{cap}</figure>')
    tint = " sos-journey--tint" if s.get("tint") else ""
    return f"""
<div class="sos"><section class="sos-journey{tint}"><div class="sos-wrap"><div class="sos-journey__grid">
 <div class="sos-journey__copy">
  <p class="sos-eyebrow">{escape(s['eyebrow'])}</p>
  <h2 class="sos-display sos-journey__title">{escape(s['heading'])}</h2>
  <div class="sos-prose__body sos-journey__body">{s['body']}</div>
  <ol class="sos-journey__steps">{steps}</ol>
  {btn}
 </div>
 {fig}
</div></div></section></div>"""


def guarantee_html(variant="panel", buyback=False):
    extra = ""
    if variant != "inline":
        extra = ("<p>We'll arrange and pay for collection. If we're storing your original "
                 "packaging, we'll bring it with us.</p>"
                 "<p class='sos-guarantee__statutory'>Your statutory rights are unaffected.</p>")
    else:
        extra = ("<p class='sos-guarantee__more'>We arrange and pay for collection. "
                 "<a href='/pages/delivery-and-guarantee'>Read the guarantee</a></p>")
    out = f"""
<div class="sos-guarantee sos-guarantee--{variant}">
  <div class="sos-guarantee__mark">{icon('shield', 22)}</div>
  <div class="sos-guarantee__body">
    <h3 class="sos-guarantee__title">Hassle-Free Handover Guarantee</h3>
    <p>You'll receive the exact statue shown in the listing, in the condition described and with
       all the parts listed. If it arrives damaged, a listed part is missing, or the statue differs
       from its description, you can return it for a <strong>full refund</strong>.</p>
    {extra}
  </div></div>"""
    if buyback:
        out += f"""
<div class="sos-guarantee sos-guarantee--buyback">
  <div class="sos-guarantee__mark">{icon('gem', 22)}</div>
  <div class="sos-guarantee__body">
    <h3 class="sos-guarantee__title">A free buyback quote when you're ready to sell</h3>
    <p>Bought your statue from Sultan of Statues? Come back to us when you're ready to sell. We'll
       check its condition, what's included and its current resale value. If we can buy it back,
       we'll give you a quote showing exactly what you'd receive after any collection charge.</p>
    <p>If you accept, we'll arrange collection and bring your original boxes if we're storing them
       for you.</p>
  </div></div>"""
    return out


def prose_html(s):
    btn = (f'<div class="sos-prose__actions"><a class="sos-btn sos-btn--ghost" '
           f'href="{s["button_link"]}">{escape(s["button_label"])}{icon("arrow")}</a></div>'
           if s.get("button_label") else "")
    eyebrow = f'<p class="sos-eyebrow">{escape(s["eyebrow"])}</p>' if s.get("eyebrow") else ""
    tint = " sos-prose--tint" if s.get("tint") else ""
    return (f'<div class="sos"><section class="sos-prose{tint}"><div class="sos-wrap">{eyebrow}'
            f'<h2 class="sos-display sos-prose__title">{escape(s["heading"])}</h2>'
            f'<div class="sos-prose__body">{s["body"]}</div>{btn}</div></section></div>')


def page(title, body):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<style>{FONTS}</style>
<link rel="stylesheet" href="{asset('sos-palace.css')}">
<style>body{{margin:0;background:#f7f1e7}}</style>
</head><body>{header_html()}{body}{footer_html()}</body></html>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    idx = load("templates/index.json")["sections"]
    blocks = list(idx["gallery"]["blocks"].values())
    written = []

    def w(name, title, body):
        p = os.path.join(OUT, name)
        open(p, "w", encoding="utf-8").write(page(title, body))
        written.append(p)

    # 1. Homepage
    cards = "".join(card(b, sold=(i == 2)) for i, b in enumerate(blocks))
    w("home.html", "Sultan of Statues",
      hero_html(idx["palace_hero"]["settings"])
      + reasons_html(idx["reasons"])
      + collection_html(idx["gallery"], cards)
      + journey_html(idx["journey"])
      + prose_html(idx["guarantee_route"]["settings"])
      + prose_html(idx["sell"]["settings"]))

    # 2. Collection
    col = load("templates/collection.json")["sections"]
    cb = list(col["pieces"]["blocks"].values())
    w("collection.html", "The Collection",
      collection_html(col["pieces"], "".join(card(b) for b in cb)))

    # 3. Red Roc Luffy product page
    b = next(x for x in blocks if x["settings"]["product_handle"] == "red-roc-luffy-monkey-d-studio")
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
    <h1 class="sos-display sos-product__title">{escape(s['name'])}</h1>
    <div class="sos-product__priceline"><span class="sos-product__price">£1,400.00</span></div>
    <p class="sos-product__avail"><span class="sos-dot"></span>In stock — one only</p>
    <form class="sos-product__form">
      <button type="submit" class="sos-btn sos-btn--primary sos-product__add">Add to bag{icon('arrow')}</button>
    </form>
    <ul class="sos-product__fulfil">
      <li><strong>Free collection in London.</strong> Usually ready within 24 hours.</li>
      <li><strong>Not in London?</strong> <a href="#">Check delivery price</a> before you order and we'll quote your address.</li>
    </ul>
    <a class="sos-textlink sos-product__ask" href="#">Ask a question about this piece{icon('arrow')}</a>
    <div class="sos-product__guarantee">{guarantee_html('inline')}</div>

    <section class="sos-spec">
      <h2 class="sos-spec__h">Will it fit?</h2>
      <p class="sos-spec__p">We haven't published measurements for this piece yet.
        <a href="#">Ask us for its dimensions</a> and we'll measure it and send them before you buy.</p>
    </section>

    <section class="sos-spec">
      <h2 class="sos-spec__h">What's included</h2>
      <div class="sos-prose__body sos-spec__body"><p>The statue and its original box and inner
         packaging. Anything else specific to this piece is listed on the product above.</p></div>
    </section>

    <section class="sos-spec">
      <h2 class="sos-spec__h">Questions, damage or missing parts</h2>
      <p class="sos-spec__p">One contact for everything: email us at
        <a href="mailto:sultan@sultanofstatues.com">sultan@sultanofstatues.com</a>.
        Tell us your order number and we'll sort it.</p>
    </section>
  </div></div>
 </div>
</div></section></div>"""
    w("product.html", "Red Roc Luffy", prod)

    # 4. Bag with the guarantee beside checkout
    bag = f"""
<div class="sos"><section class="sos-cart"><div class="sos-wrap">
 <p class="sos-eyebrow">Your bag</p><h1 class="sos-display sos-cart__title">Your bag</h1>
 <form class="sos-cart__form"><ul class="sos-cart__list">
  <li class="sos-cart__line">
    <a class="sos-cart__thumb" href="#"><img src="{asset(s['image_asset'])}" alt="{escape(s['name'])}"></a>
    <div class="sos-cart__info">
      <span class="sos-cart__maker">{escape(s['maker'])}</span>
      <h2 class="sos-cart__name"><a href="#">{escape(s['name'])}</a></h2>
      <p class="sos-cart__unit">£1,400.00</p>
      <p class="sos-cart__next">Free London collection — usually ready in 24 hours</p>
    </div>
    <div class="sos-cart__qty"><input type="number" value="1" min="0" max="1"><a class="sos-cart__remove" href="#">Remove</a></div>
    <p class="sos-cart__line-total">£1,400.00</p>
  </li>
 </ul>
 <div class="sos-cart__foot">
   <div class="sos-cart__totals">
     <div class="sos-cart__row"><span>Subtotal</span><strong>£1,400.00</strong></div>
     <p class="sos-cart__note">Taxes included where applicable.</p>
     <p class="sos-cart__note">Free collection in London, chosen at checkout. Not in London? Ask us for a delivery price before you pay.</p>
   </div>
   <div class="sos-cart__actions">
     <button type="submit" class="sos-btn sos-btn--ghost">Update</button>
     <button type="submit" class="sos-btn sos-btn--primary sos-cart__checkout">Checkout{icon('arrow')}</button>
     <div class="sos-cart__guarantee">{guarantee_html('inline')}</div>
   </div>
 </div></form>
</div></section></div>"""
    w("bag.html", "Your bag", bag)

    # 5. Delivery & Guarantee
    gp = load("templates/page.delivery-and-guarantee.json")["sections"]["main"]
    gs = gp["settings"]
    body = ""
    for blk in gp["blocks"].values():
        st = blk["settings"]
        status = f'<p class="sos-gpage__status">{escape(st["status"])}</p>' if st.get("status") else ""
        body += (f'<section class="sos-gpage__block"><h2 class="sos-gpage__h">{escape(st["title"])}</h2>'
                 f'<div class="sos-prose__body">{st["text"]}</div>{status}</section>')
    gpage = f"""
<div class="sos"><section class="sos-gpage"><div class="sos-wrap">
 <header class="sos-gpage__head">
  <p class="sos-eyebrow">{escape(gs['eyebrow'])}</p>
  <h1 class="sos-display sos-gpage__title">{escape(gs['heading'])}</h1>
  <p class="sos-lede">{escape(gs['lede'])}</p>
 </header>
 <div class="sos-gpage__grid">
  <div class="sos-gpage__main">{body}</div>
  <aside class="sos-gpage__aside">
    {guarantee_html('full', buyback=True)}
    <p class="sos-gpage__support">Questions about delivery, damage or missing parts?
      <a href="mailto:{gs['support_email']}">{gs['support_email']}</a></p>
    <div class="sos-gpage__cta"><a class="sos-btn sos-btn--primary" href="/collections/all">Explore the collection{icon('arrow')}</a></div>
  </aside>
 </div>
</div></section></div>"""
    w("guarantee.html", "Delivery & Guarantee", gpage)

    for p in written:
        print(p)


if __name__ == "__main__":
    main()
