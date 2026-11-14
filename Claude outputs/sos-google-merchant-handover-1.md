# Sultan of Statues — delivery data for Google Merchant Center

Updated 14 November 2026, after the zones went live and were tested at
checkout. Store `cdsyvp-8x`, www.sultanofstatues.com.

| What you asked for | Status |
|---|---|
| 1. Postcode-to-price table | **Complete and live** — attached as CSV |
| 2. Checkout proof per band | **Tested** — five checkout tests, all passed |
| 3. What controls Google's shipping settings | **Still unverified** — reasoning only |
| 4. The delivery promise the build supports | **Complete** — with one placeholder to fix |

---

## 1. The postcode-to-price table — all ten bands LIVE

Attached: `sos-delivery-bands.csv`, `sos-delivery-exclusions.csv`.

Configured as **Shopify Local delivery zones** on the Block B location, priced
on **return** road miles from the dispatch point **SE1 0TP**.

| Band | Return road miles | Price | Postcode entries | Shopify |
|---|---|---:|---:|---|
| 1 | Up to 50 | £100.00 | 115 | LIVE |
| 2 | Over 50 to 100 | £119.00 | 150 | LIVE |
| 3 | Over 100 to 200 | £158.00 | 201 | LIVE |
| 4 | Over 200 to 300 | £196.00 | 292 | LIVE |
| 5 | Over 300 to 400 | £235.00 | 271 | LIVE |
| 6 | Over 400 to 500 | £274.00 | 229 | LIVE |
| 7 | Over 500 to 600 | £312.00 | 81 | LIVE |
| 8 | Over 600 to 800 | £390.00 | 106 | LIVE |
| 9 | Over 800 to 1,000 | £467.00 | 74 | LIVE |
| 10 | Over 1,000 to 1,400 | £621.00 | 3 (`AB*`, `IV*`, `KW*`) | LIVE |

1,522 postcode entries covering **2,733 UK mainland districts**. Every zone's
saved entry count in Shopify matches the generated list exactly, so nothing was
truncated in entry.

Entries are written `EX*`, `M1*`, `AB*`. Shopify's zone field takes complete
postcodes or a prefix followed by an asterisk; a bare outward code is rejected.

### Known imprecision

Shopify matches by prefix, so `PH1*` unavoidably captures PH13 and PH16. Where
such a group spans two bands it is priced at the **cheaper** band — the customer
is never overcharged, the business absorbs the difference. 114 such groups: most
cost £38–£39, nine Scottish ones (DD, KA, PA, PH) cost £154. This is inherent to
the feature: typing `PH1 *` with a space is normalised to `PH1*` on entry, so
"PH1 but not PH13" cannot be expressed.

### Exceptions — 136 districts get no delivery option

- **132 island or offshore**: BT (all Northern Ireland), IM, JE, GY, HS, ZE,
  PA20 and PA41–PA78, KW15–KW17, PH42–PH44, TR21–TR25. All need a ferry and no
  crossing prices have been supplied.
- **4 with no road route returned**: IV22, IV51, PH30, PH37.

Distances are from OpenRouteService (OpenStreetMap), not Google Maps, so
mileage can differ slightly. 359 districts sit within 2% of a band edge.

---

## 2. Checkout proof — five tests, all passed

One statue (Red Roc Luffy, £1,400), personal delivery, no extras. Figures read
from the live checkout.

| Test | Postcode | Expected | Checkout showed | Order total | Match |
|---|---|---:|---:|---:|---|
| Band 1, London | SE24 9DZ | £100.00 | **£100.00** | £1,500.00 | ✓ |
| Band 5, Manchester | M1 1AE | £235.00 | **£235.00** | £1,635.00 | ✓ |
| Band 10, Thurso | KW14 7AA | £621.00 | **£621.00** | £2,021.00 | ✓ |
| Unsupported, Belfast | BT1 5GS | no delivery option | **"not available for delivery to your location"** — no price offered | — | ✓ |
| Free collection | any | £0.00 | **FREE**, Block B London, "Usually ready in 24 hours" | £1,400.00 | ✓ |

The product page carries no delivery figure of its own — it points to the
Delivery & Guarantee page — so there is no product-page-versus-checkout
discrepancy to report. Checkout is the single source of the number.

No order was placed; each test stopped before payment.

### The £109 larger vehicle charge — NOT implemented, and cannot be

Specified as £109 once per delivery order of three or more statues, never per
statue, never on collection. The pricing module implements it with unit tests
covering 2 statues (no charge), 3 (one charge), 5 (still one), and collection
with 4 (no charge).

**Shopify cannot charge it.** Local delivery's conditional pricing keys off
order value only, never item count, and value is not a usable proxy. A
three-statue order goes through at the plain band price today. Intended fix is a
cart line item; not built. No checkout test can prove it until then.

---

## 3. What controls Google's shipping settings — STILL UNVERIFIED

Not tested. Reasoning only, offered as a hypothesis:

Merchant Center's shipping settings describe **shipping rates**. What this store
has is **Local delivery**, a different Shopify mechanism — not a shipping rate,
not attached to a shipping profile. The UK market remains set to **"Not
shipping"**, with no carrier accounts and no rate tables, so a sync reading
shipping profiles would find nothing.

That suggests entering the policy by hand in Merchant Center. **Verify** by
opening the Google & YouTube app in Shopify admin and checking whether it
reports importing shipping settings and lists any rates.

**Also worth checking first:** the UK market being "Not shipping" may itself be
what triggers "Missing shipping information", rather than anything about the
rate values.

---

## 4. The delivery promise — and one placeholder to fix

**There is no delivery slot selection and no customer-chosen delivery window.**
Shopify's Local delivery has no scheduling of any kind. Adding it needs an app.

**Collection timing is real and confirmed at checkout:** "Usually ready in 24
hours", matching the site copy.

**Delivery timing is a placeholder you should change before telling Google
anything.** The checkout currently labels every local delivery **"Ships next
business day"**. That is Shopify's automated estimated-delivery-date feature,
not a promise anyone wrote, and it is wrong for a personal delivery that is
driven by hand and not yet scheduled. It appears on all three passing delivery
tests. Fix it in Settings → Shipping and delivery → Estimated delivery dates
before entering any handling or transit time in Merchant Center.

---

## Kept separate

- **In-home assembly — £49 per statue selected.** Not implemented in Shopify;
  intended as a cart line item.
- **Original box storage — first month free from box collection, then £19.99
  per month per statue.** Optional, off by default, nothing due at checkout.
  Needs a subscriptions app, which is not installed.

Neither belongs in a Google shipping policy.

---

## Remaining blockers

1. **"Ships next business day"** is shown on every delivery at checkout and is
   not a promise you have made.
2. **The £109 larger vehicle charge cannot be charged** by Local delivery.
3. **No ferry crossing prices**, so 132 island districts have no price.
4. **No delivery slots or window** exist to promise.
5. **UK market is "Not shipping"** — likely relevant to the Merchant Center
   warning, unverified.
