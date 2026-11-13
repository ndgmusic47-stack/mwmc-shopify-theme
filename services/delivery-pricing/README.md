# Delivery pricing

The price a buyer is shown and the price Shopify charges must be the same
number. That only holds if both come from one place, so everything that
decides a delivery price lives here and nowhere else — not in the theme, not
in a Shopify shipping rate typed by hand.

```
rates.v1.json   the rate table. Versioned; a price change means a new version.
quote.js        pure arithmetic: bands, extras, what is due today, what later.
routes.js       Google Routes API v2, both legs of the round trip.
config.js       dispatch point and API key, from the environment only.
```

## Run the tests

```
node services/delivery-pricing/quote.test.js    # 48 tests, no network
node services/delivery-pricing/routes.test.js   # 14 tests, fake transport
```

Neither needs an API key or costs anything.

## Decisions worth not relitigating

**Pence, always.** Every amount in the rate table and every amount out of
`quote()` is an integer number of pence. The only division in the module is
metres to miles, and that result is used to pick a band, never to compute an
amount.

**Legs are summed before conversion.** `(outbound + return) / 1609.344`, not
`outbound/1609.344 + return/1609.344`. Converting twice rounds twice, which
can put a journey the wrong side of a band edge. The tests pin the boundaries
at −0.01, exactly, and +0.01 miles for all eight of them.

**Two route calls, not one doubled.** Road distance is not symmetrical. One-way
systems and motorway junctions make the drive back a different length from the
drive out, and the brief prices the real round trip.

**`avoidFerries` is never sent.** Asking Google to hide ferry routes returns
either a land route that does not exist or no route at all, and in neither case
have we learned whether the real journey crosses water. We request the natural
route and read the step maneuvers: `FERRY` and `FERRY_TRAIN`. Either one, on
either leg, and the journey is manual-quote. A route that comes back with no
step detail is also refused — not being able to prove a route is ferry-free is
not the same as it being ferry-free.

**Failures are loud.** Past 1,000 return miles, no route, an unreachable
provider, a 403, an unparseable postcode: each throws. None of them falls back
to the top band, to zero, or to free delivery. A `QuoteError` carries a `code`
so the storefront can say something useful.

**Storage is never due today.** The first month is free from box collection, so
it is a £0 line now and a scheduled £19.99 per statue per month later.

## Not built yet, and why

The quote cannot reach Shopify's checkout until three things exist:

1. **Carrier-calculated rates** on the Shopify plan — Plus, or the annual-plan
   add-on. Without it Shopify cannot ask an external service for a price.
2. **A host** for this code at a public HTTPS endpoint Shopify can call.
3. **A subscriptions app** for the box storage renewal.

UK delivery is also switched off at the store level right now — the store is
collection-only — so re-enabling it is a prerequisite, and a shipping-settings
change to make deliberately.

Until then the storefront quotes by hand: the Delivery & Guarantee page
publishes the bands, and the buyer sends a postcode.
