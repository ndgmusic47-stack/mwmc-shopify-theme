/**
 * Sultan of Statues — delivery quote.
 *
 * Pure arithmetic, no network, no Shopify. Money is in pence throughout and
 * never touches a float: the only division in here is metres -> miles, and
 * that result is used solely to pick a band, never to compute a price.
 *
 * The same module backs the storefront quote and the Shopify carrier-service
 * response, so the two cannot drift. If they ever disagree, one of them is not
 * calling this.
 */

const RATES = require('./rates.v1.json');

const METRES_PER_MILE = 1609.344;

class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QuoteError';
    this.code = code;
  }
}

/**
 * Both legs, added as metres, converted once. Converting each leg separately
 * and adding the miles would round twice and can land the wrong side of a band
 * edge.
 */
function returnMilesFromMetres(outboundMetres, returnMetres) {
  for (const [name, v] of [['outbound', outboundMetres], ['return', returnMetres]]) {
    if (!Number.isFinite(v) || v < 0) {
      throw new QuoteError('NO_ROUTE', `No ${name} road route was returned, so there is no distance to price.`);
    }
  }
  return (outboundMetres + returnMetres) / METRES_PER_MILE;
}

/** First band whose upper limit covers the distance. Inclusive upper bound. */
function selectBand(returnMiles) {
  if (!Number.isFinite(returnMiles) || returnMiles < 0) {
    throw new QuoteError('NO_ROUTE', 'No usable return distance.');
  }
  const band = RATES.personalDelivery.bands.find(b => returnMiles <= b.upperMiles);
  if (!band) {
    throw new QuoteError(
      'BEYOND_BANDS',
      `${returnMiles.toFixed(1)} return miles is past the published bands (max ${RATES.limits.maxReturnMiles}). This address needs a manual quote.`
    );
  }
  return band;
}

/** Outward postcode, e.g. "SE24 9DZ" -> "SE24". Returns null if unparseable. */
function outwardCode(postcode) {
  if (typeof postcode !== 'string') return null;
  const cleaned = postcode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/);
  return m ? m[1] : null;
}

/**
 * True when the destination is somewhere we cannot prove a ferry-free road
 * route to. Conservative by design: an unparseable postcode counts as needing
 * a human, never as mainland.
 */
function needsManualQuote(postcode) {
  const out = outwardCode(postcode);
  if (!out) return true;
  if (RATES.ferry.selfCheckoutEnabled) return false;
  return RATES.ferry.manualQuotePostcodeAreas.some(area => out.startsWith(area));
}

/**
 * @param {object} o
 * @param {'collection'|'delivery'} o.method
 * @param {number} o.statueCount       statues in the basket
 * @param {number} o.assemblyCount     statues ticked for in-home assembly
 * @param {number} o.storageCount      statues whose box we will store
 * @param {number} [o.outboundMetres]  delivery only
 * @param {number} [o.returnMetres]    delivery only
 * @param {string} [o.postcode]        delivery only
 * @returns {{lines: Array, dueTodayPence: number, futurePence: Array, returnMiles: number|null, rateVersion: string}}
 */
function quote(o) {
  const statueCount = Math.trunc(o.statueCount ?? 0);
  const assemblyCount = Math.trunc(o.assemblyCount ?? 0);
  const storageCount = Math.trunc(o.storageCount ?? 0);

  if (statueCount < 1) throw new QuoteError('EMPTY_BASKET', 'No statues in the basket.');
  if (assemblyCount < 0 || assemblyCount > statueCount) {
    throw new QuoteError('BAD_EXTRAS', 'More statues ticked for assembly than are in the basket.');
  }
  if (storageCount < 0 || storageCount > statueCount) {
    throw new QuoteError('BAD_EXTRAS', 'More boxes ticked for storage than there are statues.');
  }
  if (o.method !== 'collection' && o.method !== 'delivery') {
    throw new QuoteError('BAD_METHOD', 'Fulfilment must be collection or delivery.');
  }

  const lines = [];
  let returnMiles = null;

  if (o.method === 'collection') {
    lines.push({ code: 'collection', label: RATES.collection.label, pence: RATES.collection.pence });
  } else {
    if (needsManualQuote(o.postcode)) {
      throw new QuoteError(
        'MANUAL_QUOTE',
        'We price this address by hand — tell us your postcode and we will confirm the figure before you pay.'
      );
    }
    returnMiles = returnMilesFromMetres(o.outboundMetres, o.returnMetres);
    const band = selectBand(returnMiles);
    lines.push({
      code: 'personal_delivery',
      label: RATES.personalDelivery.label,
      pence: band.pence,
      bandUpperMiles: band.upperMiles,
    });

    if (statueCount >= RATES.largerVehicle.appliesFromStatueCount) {
      lines.push({ code: 'larger_vehicle', label: RATES.largerVehicle.label, pence: RATES.largerVehicle.pence });
    }
  }

  if (assemblyCount > 0) {
    lines.push({
      code: 'assembly',
      label: RATES.assembly.label,
      pence: RATES.assembly.pence * assemblyCount,
      quantity: assemblyCount,
    });
  }

  // Storage is never due today: the first month is free from box collection.
  const futurePence = [];
  if (storageCount > 0) {
    lines.push({
      code: 'box_storage',
      label: RATES.boxStorage.label,
      pence: 0,
      quantity: storageCount,
      note: 'First month free from the day we collect the box.',
    });
    futurePence.push({
      code: 'box_storage_monthly',
      label: RATES.boxStorage.label,
      pence: RATES.boxStorage.pence * storageCount,
      startsAfter: 'one month from box collection',
      recurring: 'monthly',
    });
  }

  return {
    lines,
    dueTodayPence: lines.reduce((sum, l) => sum + l.pence, 0),
    futurePence,
    returnMiles,
    rateVersion: RATES.version,
  };
}

module.exports = { quote, selectBand, returnMilesFromMetres, needsManualQuote, outwardCode, QuoteError, RATES, METRES_PER_MILE };
