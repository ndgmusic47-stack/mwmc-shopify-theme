# Sultan of Statues — launch runbook

Theme work is complete and validated. What remains is Shopify admin work
that cannot be done from the repo.

Staging theme: **207040217429** (`mwmc-shopify-theme/staging`, Draft)
Preview: `https://www.mumwheresmycards.com/?preview_theme_id=207040217429`
Live theme `203190042965` (`main`) is untouched.

---

## 0. The single reason the store looks unfinished

**No products exist in the store.** Verified on the live storefront:

- all six product handles return **404**
- `/collections/all/products.json` returns **0 products**
- `/search/suggest.json?q=Luffy` returns **nothing**
- there is no product sitemap

So the six cards showing "Enquire" and a Luffy search finding nothing are
not bugs — that is the designed fallback behaving correctly while the
catalogue is empty. The handles are verified to match exactly across the
CSV, `templates/index.json` and `templates/collection.json`. Nothing in the
theme needs changing for the cards to go live; they flip to real product
cards with price, stock and Add to Bag the moment the products exist and
are published to the Online Store channel.

---

## 1. Import the products

**CSV path: `data/sultan-products.csv`** (regenerate with
`python tools/build_product_csv.py`).

1. Products → Import → upload the CSV.
2. Rows are `Status: draft`, `Published: FALSE` by design — an active
   product appears on the *live* card-shop storefront immediately.
3. Upload photographs (the CSV leaves `Image Src` empty):

   | Product handle | Photo in the repo |
   |---|---|
   | `gear-5-luffy-anikingdom-jimei-palace` | `assets/sos-statue-luffy-gear5.webp` |
   | `dracule-mihawk-lx-studio` | `assets/sos-statue-mihawk.webp` |
   | `king-monkey-d-studio` | `assets/sos-statue-king.webp` |
   | `trafalgar-law-monkey-d-studio` | `assets/sos-statue-law.webp` |
   | `red-roc-luffy-monkey-d-studio` | `assets/sos-statue-luffy-redroc.webp` |
   | `sabo-jimei-palace` | `assets/sos-statue-sabo.webp` |

4. Add all six to a collection. The gallery picks up the collection being
   viewed automatically; no theme change needed.
5. **Online Store availability** — each product must be published to the
   Online Store sales channel, or `all_products[handle]` returns nothing in
   Liquid and the card stays on the enquiry fallback. This is the step most
   easily missed: draft → active is not the same as published to a channel.

### Fields still awaiting confirmation

| Field | State | Consequence if left |
|---|---|---|
| `Variant Inventory Qty` | assumed **1** each | wrong stock count |
| `Variant Grams` | **0** on every row | weight-based delivery rates cannot compute |
| Box and inclusions | **unknown for all six** | `[CONFIRM BEFORE PUBLISHING]` marker shows to buyers |
| Condition detail | only Gear 5 Luffy has a seller note | five pieces say "Used" and nothing more |
| Delivery charge / collection | **not set** | `[CONFIRM BEFORE PUBLISHING]` marker shows to buyers |

Prices, handles, vendors, SKUs, titles, types and tags are confirmed and
need no further input.

---

## 2. Domain and URL readiness

### Theme audit result: clean

No hardcoded `mumwheresmycards.com`, `cdsyvp-8x` or `.myshopify.com`
references anywhere in the theme. No absolute internal links. Internal
navigation uses Shopify route objects (`routes.root_url`,
`routes.all_products_collection_url`, `routes.search_url`,
`routes.cart_url`, `routes.account_url`) with relative paths only for the
four content pages, which are editor-settable. The product page's enquiry
target is now a theme setting rather than a hardcoded path.

This means the theme follows whatever primary domain the store is set to —
no theme change is needed when the domain changes.

### Redirects for retired URLs

Taken from the live sitemap, so this is what is actually indexed today.
Set these up in Online Store → Navigation → URL Redirects.

| Retired URL | Redirect to | Reason |
|---|---|---|
| `/pages/consignment` | `/pages/sell-to-us` | Closest intent — we buy outright now |
| `/pages/shows-events` | `/` | No equivalent in the new business |
| `/collections/frontpage` | `/collections/all` | Shopify default collection, currently empty |
| `/blogs/news` | `/` | Blog has zero articles |

Both retired pages are **still live and indexed right now**, rendering with
the headings "Consignment" and "Shows & Events" under Sultan branding,
because their page records still exist at store level even though their
templates were removed. Redirect them, then delete or unpublish the page
records so they leave the sitemap.

No product redirects are needed — the store has never had products.

### Old-domain references outside the theme

| Where | What |
|---|---|
| Settings → Store details | Store name is still "Mum Where's My Cards" |
| Apple Pay / payment sheet | `merchantName: "Mum Where's My Cards"` — visible at the payment step |
| Shopify analytics payload | `shop.name` still the old name |
| `.myshopify.com` domain | `cdsyvp-8x.myshopify.com` — permanent, cannot be changed |
| Policies | Written for a card business |
| Order emails | Card-shop branding |

The theme already substitutes its own brand name for `<title>`, Open Graph
and the footer copyright, so staging never shows the old name in page
chrome. Checkout and email are Shopify's, not the theme's, and need the
store rename.

**If the business is moving to a new domain** (e.g. a sultanofstatues
domain), add it under Settings → Domains, set it as primary, and keep
`mumwheresmycards.com` connected and redirecting so existing links and
search results do not break. Do not remove the old domain.

---

## 3. Short activation sequence

1. **Import** `data/sultan-products.csv`; upload the six photos.
2. **Fill the gaps** — quantities, weights, box/inclusions, condition; then
   delete each `[CONFIRM BEFORE PUBLISHING]` line from the descriptions.
3. **Delivery** — Settings → Shipping and delivery. Set real statue rates or
   collection-only terms.
4. **Rewrite the shipping policy.** Settings → Policies currently states the
   **£4.99 rate and free delivery over £50**. Those are card parcel terms.
   A £1,100 resin statue cannot ship on them, and a customer who checks out
   against that published policy has a reasonable claim to it. This is the
   single most important pre-launch text change.
5. **Payments** — Settings → Payments, confirm a provider is active.
6. **Guest checkout** — Settings → Checkout → customer accounts **optional**,
   so a buyer can order without an account.
7. **Publish to Online Store** — set the six products active and published
   to the Online Store channel.
8. **Redirects** — add the four above; delete or unpublish the two retired
   pages.
9. **Test** — on the preview URL: collection → product → Add to bag → bag →
   checkout. Confirm price, delivery option, total and a payment method.
   One real low-value order verifies order creation, confirmation, merchant
   notification and stock decrement end to end; refund and restock after.
   That spends real money, so it is your call.
10. **Store rename** — Settings → Store details. This is what clears the old
    name from checkout, the payment sheet and order emails.
11. **Live switch** — publish the staging theme. Your approval only.

Customer account styling is out of scope.

---

## 4. Known theme issue

`sections/sos-hero.liquid` is not syncing to the theme from GitHub. The
committed file on `origin/staging` is correct (verified by reading the
blob), and every other file in the same commit synced, but the served HTML
lacks two markers that file contains: the `--sos-hero-m-aspect` attribute
and the `sos-hero__plaque` caption.

Impact is cosmetic — the hero caption plaque does not render. The mobile
crop itself is correct because the CSS carries
`aspect-ratio: var(--sos-hero-m-aspect, 860 / 887)` as a fallback.

It matters because no future hero change will land either. The per-file
reason is in Admin → Online Store → Themes → `207040217429` → GitHub sync
log, which cannot be read without admin access.
