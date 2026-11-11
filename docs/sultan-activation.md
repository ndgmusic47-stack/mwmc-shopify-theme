# Sultan of Statues — activation sequence

Everything in the theme is done and validated. What remains is Shopify
admin work that cannot be done from the theme repo. This is the shortest
path from here to taking a guest order.

Staging theme: **207040217429** (`mwmc-shopify-theme/staging`, Draft)
Preview: `https://www.mumwheresmycards.com/?preview_theme_id=207040217429`

Live theme `203190042965` (`main`) is untouched.

---

## Step 1 — Import the six products

1. Products → Import → upload `data/sultan-products.csv`.
2. The CSV sets `Status: draft` and `Published: FALSE` on every row **on
   purpose**: the live storefront is still the card shop, and an active
   product appears on `/collections/all` there immediately. Keep them draft
   until you are ready.
3. Upload the photographs (the CSV leaves `Image Src` empty so nothing
   depends on a public URL). Mapping:

   | Product handle | Photo in the repo |
   |---|---|
   | `gear-5-luffy-anikingdom-jimei-palace` | `assets/sos-statue-luffy-gear5.webp` |
   | `dracule-mihawk-lx-studio` | `assets/sos-statue-mihawk.webp` |
   | `king-monkey-d-studio` | `assets/sos-statue-king.webp` |
   | `trafalgar-law-monkey-d-studio` | `assets/sos-statue-law.webp` |
   | `red-roc-luffy-monkey-d-studio` | `assets/sos-statue-luffy-redroc.webp` |
   | `sabo-jimei-palace` | `assets/sos-statue-sabo.webp` |

   In your clone these are at
   `C:\Users\ncpow\Downloads\New folder\label_in_a_box\mwmc-shopify-theme\assets\`.

4. Add all six to a collection so `/collections/all` and the collection page
   fill. The theme needs no change for this — the gallery picks up the
   collection being viewed automatically.

The handles above are what the theme's homepage and collection cards point
at. Do not rename them; if you do, change `product_handle` in
`templates/index.json` and `templates/collection.json` to match.

## Step 2 — Fill the three gaps before publishing

Each product description carries a visible `[CONFIRM BEFORE PUBLISHING]`
marker. That is deliberate — it fails loudly rather than quietly shipping a
claim nothing supports. Resolve all three per piece:

1. **Quantity.** The CSV sets 1 each with tracking on and overselling
   denied. Correct any that are not 1.
2. **Box and inclusions.** No source listing stated this. Five of the six
   have no condition detail at all beyond "Used"; only Gear 5 Luffy carries
   a seller note ("Opened and assembled only to check for issues. No
   flaws.").
3. **Weight.** Every row has `Variant Grams: 0`. Weight-based delivery rates
   cannot compute correctly until these are real. Weigh each boxed piece.

## Step 3 — Delivery or collection

Nothing in the theme states a delivery price, because nothing confirmed one.
Set up in Settings → Shipping and delivery, then remove the
`[CONFIRM BEFORE PUBLISHING]` delivery line from each description.

Note: the inherited shipping policy still describes **card** parcel rates,
including the £4.99 charge and the free-shipping threshold. Those terms do
not fit a £1,100 resin statue and must be rewritten before any statue is
purchasable. See the store-wide list below.

## Step 4 — Payments

Settings → Payments. Confirm a provider is active and accepts guest
payment. This could not be verified from here (admin requires sign-in).

## Step 5 — Guest checkout check

Settings → Checkout → set customer accounts to optional, so a guest can buy
without an account.

Then, with the six products temporarily set to Active, on the staging
preview URL:

1. Collection → open a piece → Add to bag.
2. Check the bag shows the right price and the right line total.
3. Checkout → confirm the delivery or collection option appears, the final
   total is right, and a payment method is offered.
4. Place one real low-value test order if you want order creation, order
   confirmation, merchant notification and stock decrement verified
   end to end — then refund and restock it. **This spends real money on a
   real payment method, so it is your call, not something to run
   automatically.**
5. Confirm the sold piece now shows "Sold" and is not orderable.

---

## Store-wide items a buyer would still see

These are shared with the live store. None can be changed from the theme,
and each is visible to a customer at checkout or in email.

| What | Where | Currently |
|---|---|---|
| Store name | Settings → Store details | "Mum Where's My Cards" — appears in checkout, order emails, and Shopify's own copyright |
| Store contact / sender email | Settings → Store details and Notifications | Unverified. **The enquiry forms post to Shopify's native contact form, so they deliver to whatever address is set here — possibly the old card-shop inbox.** Check before relying on enquiries. |
| Shipping policy | Settings → Policies | Card parcel rates, £4.99, free-shipping threshold |
| Refund / privacy / terms | Settings → Policies | Written for a card business |
| Order confirmation emails | Settings → Notifications | Card-shop branding |
| Main menu + footer menu | Navigation | Still contain the card-shop and consignment links |
| Homepage SEO title | Online Store → Preferences | Pokémon storefront title |

The theme already works around the three that would otherwise show on
staging: it carries its own navigation, its own footer with its own
copyright, and its own brand name for `<title>` and Open Graph. Those
workarounds can be removed once the store itself is renamed — the header's
"Navigation source" setting switches back to the Shopify menu, and the
`Sultan of Statues branding` theme settings can be cleared.

## Not done tonight, by scope

- Customer account styling (explicitly out of scope).
- Live switch — the draft stays unpublished until you approve it.
