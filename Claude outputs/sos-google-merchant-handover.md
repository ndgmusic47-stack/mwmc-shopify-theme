# Sultan of Statues — delivery data for Google Merchant Center

Prepared 14 November 2026. Store `cdsyvp-8x`, www.sultanofstatues.com.

**Read this first.** Of the four things you asked for, one is complete, one is
partly complete, and two cannot be answered yet without guessing. The gaps are
marked. Nothing below is inferred or filled in to look finished.

| What you asked for | Status |
|---|---|
| 1. Postcode-to-price table | **Complete** — attached as CSV |
| 2. Checkout proof per band | **Not done** — no checkout test has been run |
| 3. What controls Google's shipping settings | **Unverified** — reasoning given, not tested |
| 4. The delivery promise the build supports | **Complete** — and the answer is "none yet" |

---

## 1. The postcode-to-price table

Attached: `sos-delivery-bands.csv` and `sos-delivery-exclusions.csv`.

Ten bands, priced on **return** road miles — the drive out plus the drive back
— between the dispatch point **SE1 0TP** and the delivery address.

| Band | Return road miles | Price | Districts | In Shopify |
|---|---|---:|---:|---|
| 1 | Up to 50 | £100.00 | 115 entries | **LIVE** |
| 2 | Over 50 to 100 | £119.00 | 150 | Not configured |
| 3 | Over 100 to 200 | £158.00 | 201 | Not configured |
| 4 | Over 200 to 300 | £196.00 | 292 | Not configured |
| 5 | Over 300 to 400 | £235.00 | 271 | Not configured |
| 6 | Over 400 to 500 | £274.00 | 229 | Not configured |
| 7 | Over 500 to 600 | £312.00 | 81 | Not configured |
| 8 | Over 600 to 800 | £390.00 | 106 | Not configured |
| 9 | Over 800 to 1,000 | £467.00 | 74 | Not configured |
| 10 | Over 1,000 to 1,400 | £621.00 | 3 (`AB*`, `IV*`, `KW*`) | Not configured |

**The £621 band exists and is correct, but is not configured in Shopify.** It
replaces the owner's original 1,000–1,200 (£544) and 1,200–1,400 (£621) split,
because Shopify allows a location only ten delivery zones and nine were already
spoken for. The owner chose £621 for the merged band. A 1,400–1,600 band was
proposed and dropped: the furthest mainland district from SE1 0TP is Thurso
(KW14) at 1,338 return miles, so nothing would fall in it.

**Only band 1 is live.** Today the store offers delivery to those 115 London and
near-home-counties entries at £100 and to nowhere else. Every other UK address
sees no delivery option at checkout. **Do not publish a UK-wide shipping policy
to Google describing bands 2–10 until they are configured**, or Merchant Center
will advertise rates the checkout will not honour.

### How to read the postcode entries

Entries are written `EX*`, `M1*`, `AB*`. The asterisk is required: Shopify's
Local delivery zone field takes complete postcodes, or a prefix followed by an
asterisk, and rejects a bare outward code outright. `EX*` means the whole EX
postcode area; `M1*` means M1 and everything beginning M1, which necessarily
includes M10–M19.

### Known imprecision, stated plainly

Because Shopify matches by prefix, codes that overlap cannot be priced
separately — `PH1*` unavoidably captures PH13 and PH16. Where a group like that
spans two bands it is priced at the **cheaper** band, so the customer is never
overcharged and the business absorbs the difference. There are **114 such
groups**. Most absorb £38–£39; nine Scottish ones (DD, KA, PA, PH) absorb £154.

This is a property of Shopify's Local delivery feature, not of the data. It was
tested in the admin on 14 November 2026: typing `PH1 *` with a space is
normalised to `PH1*` on entry, so "PH1 but not PH13" cannot be expressed.

### Exceptions and uncovered districts

2,733 UK mainland districts are priced. 136 are deliberately not offered
delivery (see `sos-delivery-exclusions.csv`):

- **132 island or offshore** — all of Northern Ireland (BT), Isle of Man (IM),
  Channel Islands (JE, GY), Western Isles (HS), Shetland (ZE), the Argyll
  islands (PA20, PA41–PA78), far-north Orkney/Caithness island codes (KW15–17),
  Skye and the small isles (PH42–PH44), and Scilly (TR21–TR25). These require a
  ferry. **No approved ferry crossing prices have been supplied**, so they are
  excluded from self-checkout entirely and must be quoted by hand.
- **4 with no road route returned** by the routing provider: IV22, IV51, PH30,
  PH37. Treat as manual quote.

Distances come from OpenRouteService (OpenStreetMap data), not Google Maps, so
mileage can differ from Google's by a small margin. 359 districts sit within 2%
of a band edge where that margin could change the price.

---

## 2. Checkout proof — NOT DONE

**No checkout test has been run.** There is no data for the product page fee,
the checkout fee, or whether they match, for any band. Treating this section as
pending is the only accurate position.

Why: nine of the ten bands are not configured, so there is nothing to test
against. Band 1 could be tested today; it has not been.

When the zones are in, the tests to run are one statue, personal delivery, no
extras, recording outward postcode, product-page fee, checkout fee, and whether
they agree — for one address in each of the ten bands, plus:

- an unsupported postcode (e.g. BT1 5GS, Belfast) — expect no delivery option;
- free London collection — expect £0;
- a boundary district (EX18, EX20 and EX35 all sit within 5 miles of the
  400-mile edge);
- two statues versus three, for the larger vehicle charge.

### The £109 larger vehicle charge

Specified as **£109 once per delivery order of three or more statues**, never
per statue, never on collection orders. That is how the pricing module
implements it and there are unit tests covering 2 statues (no charge),
3 statues (one charge), 5 statues (still one charge) and collection with 4
statues (no charge).

**It is not implemented in Shopify and cannot be.** Local delivery's conditional
pricing keys off order value only, never item count, and order value is not a
usable proxy — three inexpensive statues can be worth less than one expensive
one. So no checkout test can prove it today, and a three-statue order will
**not** be charged the £109 at checkout. The intended fix is to add it as a cart
line item rather than a delivery rate; that is not built.

---

## 3. What controls Google's shipping settings — UNVERIFIED

**I could not verify this and did not test it.** What follows is reasoning, and
should be treated as a hypothesis to check rather than an answer.

The concern is that Merchant Center's shipping settings describe **shipping
rates**, while what this store has configured is **Local delivery**, which is a
different fulfilment method in Shopify — it is not a shipping rate, it is not
attached to a shipping profile, and it appears in a separate part of Settings.
A sync that reads shipping profiles would find nothing to import, because the
UK market is currently set to **"Not shipping"** and there are no carrier
accounts and no rate tables.

That points towards entering the policy directly in Merchant Center rather than
relying on a sync. But it is a hypothesis.

**To verify:** in Shopify admin, open the Google & YouTube app, find its
shipping or Merchant Center settings, and see whether it reports importing
shipping settings and whether it lists any rates. If it shows none, enter the
policy manually.

**Also flag:** the UK market is set to "Not shipping". If Merchant Center
requires a shipping rate for the destination country and the store advertises
delivery only through Local delivery, that mismatch may be the actual cause of
the "Missing shipping information" warning rather than anything about the rate
values. Worth checking before entering rates by hand.

---

## 4. The delivery promise the build supports

**There is no delivery slot selection, and no fixed delivery window.** Neither
exists in the build or in Shopify.

- **Slots:** not built. Shopify's Local delivery has no scheduling of any kind —
  no date picker, no time windows, no availability. Customers cannot choose a
  day or a time. Adding it requires a third-party app, and "reserve the slot
  against actual availability" additionally requires a calendar that does not
  exist.
- **Fixed window:** none is displayed anywhere.
- **Timing claims currently on the site**, both of which need the owner's
  confirmation before being repeated to Google:
  - "Free collection in London. Usually ready within 24 hours." — product page.
  - "Collection from our London base costs nothing and is usually ready within
    24 hours of your order." — Delivery & Guarantee page.
- The Delivery & Guarantee page currently states that the online delivery
  calculator is not live and that delivery is quoted by hand on a postcode. That
  wording will need changing once the bands are live.

**Nothing in the build commits to a delivery timeframe.** Any delivery window
entered into the Google policy would be a new promise, not something the site
already makes.

---

## Kept separate, as requested

- **In-home assembly — £49 per statue selected.** Priced per statue ticked, not
  per order. Not implemented in Shopify; intended as a cart line item.
- **Original box storage — first month free from the day the box is collected,
  then £19.99 per month per statue.** Optional and off by default. Nothing is
  due at checkout. Requires a subscriptions app, which is not installed.

Neither belongs in a Google shipping policy.

---

## Blockers, in the order they bite

1. **Bands 2–10 are not configured in Shopify.** Until they are, the live store
   delivers to London only.
2. **No checkout test has been run**, so no figure below has been proven
   end-to-end against a real Shopify checkout.
3. **UK market is set to "Not shipping"** — likely relevant to the Merchant
   Center warning.
4. **The £109 larger vehicle charge cannot be charged** by Shopify's Local
   delivery and is not built as a line item.
5. **No ferry crossing prices supplied**, so 132 island districts have no price.
6. **No delivery slots or delivery window exist** to promise.
