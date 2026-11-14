/**
 * OpenRouteService as the distance provider, in place of Google.
 *
 * We need road distance from one dispatch point to every UK postcode district,
 * once. That is a matrix problem, not three thousand separate route problems,
 * and ORS has a matrix endpoint: one call returns the distance from the
 * dispatch point to a few hundred destinations. Two directions, so two passes.
 *
 * ORS is OpenStreetMap data, so its mileage will not match Google's to the
 * yard. For banding that is fine almost everywhere, but it matters within a
 * mile or two of a band edge, so the caller is told which districts sit that
 * close and can check those by hand.
 *
 * Ferries: the matrix endpoint returns distances and nothing else, so it
 * cannot tell us a route crossed water. Ferry exclusion therefore stays with
 * the postcode-area list in rates.v1.json, which is the authoritative gate
 * anyway. Nothing here can quietly sell a ferry crossing, because those areas
 * never reach the matrix.
 */

const RATES = require('./rates.v1.json');
const { QuoteError } = require('./quote');

const ENDPOINT = 'https://api.openrouteservice.org/v2/matrix/driving-car';
const OUTCODE_LOOKUP = 'https://api.postcodes.io/outcodes/';

/** Kept well under any plausible per-request ceiling, and small enough that a
 *  failure costs little to retry. */
const CHUNK = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function outcodeCoord(outcode, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(OUTCODE_LOOKUP + encodeURIComponent(outcode));
  if (r.status === 404) return null;
  if (!r.ok) throw new QuoteError('GEOCODE_ERROR', `postcodes.io returned ${r.status} for ${outcode}`);
  const body = await r.json();
  const d = body?.result;
  if (typeof d?.longitude !== 'number' || typeof d?.latitude !== 'number') {
    throw new QuoteError('GEOCODE_ERROR', `No coordinates for ${outcode}`);
  }
  return [d.longitude, d.latitude];
}

/**
 * One matrix pass.
 * @param {[number,number]} origin        [lon, lat] of the dispatch point
 * @param {Array<[number,number]>} points destinations
 * @param {boolean} reverse               false: origin -> points. true: points -> origin.
 * @returns {number[]} metres, aligned with `points`; null where ORS found no route
 */
async function matrixPass(origin, points, reverse, { apiKey, fetchImpl = globalThis.fetch, endpoint = ENDPOINT }) {
  const locations = [origin, ...points];
  const indices = points.map((_, i) => i + 1);
  const body = reverse
    ? { locations, sources: indices, destinations: [0], metrics: ['distance'], units: 'm' }
    : { locations, sources: [0], destinations: indices, metrics: ['distance'], units: 'm' };

  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey, Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new QuoteError('ROUTE_PROVIDER_UNREACHABLE', `Could not reach OpenRouteService: ${cause.message}`);
  }

  if (res.status === 429) throw new QuoteError('RATE_LIMITED', 'OpenRouteService rate limit hit.');
  if (res.status === 403) throw new QuoteError('QUOTA_EXHAUSTED', 'OpenRouteService daily quota used up, or the key is wrong.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new QuoteError('ROUTE_PROVIDER_ERROR', `OpenRouteService returned ${res.status}. ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const m = data?.distances;
  if (!Array.isArray(m)) {
    throw new QuoteError('ROUTE_PROVIDER_ERROR', 'OpenRouteService returned no distances array.');
  }

  // origin -> points is one row of N. points -> origin is N rows of one.
  const flat = reverse ? m.map(row => (Array.isArray(row) ? row[0] : null)) : m[0];
  if (!Array.isArray(flat) || flat.length !== points.length) {
    throw new QuoteError('ROUTE_PROVIDER_ERROR',
      `Expected ${points.length} distances, got ${Array.isArray(flat) ? flat.length : 'none'}.`);
  }
  return flat.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}

/** Postcode areas we never route to, because we cannot prove the road route
 *  is ferry-free. Checked before any request is made. */
function isExcludedArea(outcode) {
  if (RATES.ferry.selfCheckoutEnabled) return false;
  return RATES.ferry.manualQuotePostcodeAreas.some(a => outcode.startsWith(a));
}

/**
 * Return road miles for many outcodes, in as few requests as the plan allows.
 *
 * @param {Array<{outcode:string, coord:[number,number]}>} destinations
 * @param {[number,number]} dispatchCoord
 * @returns {Map<string, {miles:number}|{error:string,message:string}>}
 */
async function returnMilesForMany(destinations, dispatchCoord, opts = {}) {
  const { apiKey, fetchImpl, endpoint, onProgress, chunk = CHUNK, pauseMs = 1500 } = opts;
  if (!apiKey) throw new QuoteError('CONFIG_MISSING', 'ORS_API_KEY is not set.');

  const out = new Map();
  const routable = [];
  for (const d of destinations) {
    if (isExcludedArea(d.outcode)) {
      out.set(d.outcode, { error: 'MANUAL_QUOTE', message: 'Island or offshore — cannot be shown to be ferry-free.' });
    } else {
      routable.push(d);
    }
  }

  for (let i = 0; i < routable.length; i += chunk) {
    const batch = routable.slice(i, i + chunk);
    const points = batch.map(d => d.coord);
    const [outbound, back] = [
      await matrixPass(dispatchCoord, points, false, { apiKey, fetchImpl, endpoint }),
      await (sleep(pauseMs).then(() => matrixPass(dispatchCoord, points, true, { apiKey, fetchImpl, endpoint }))),
    ];

    batch.forEach((d, j) => {
      const a = outbound[j], b = back[j];
      if (a == null || b == null) {
        out.set(d.outcode, { error: 'NO_ROUTE', message: 'OpenRouteService found no road route.' });
      } else {
        out.set(d.outcode, { miles: (a + b) / 1609.344 });
      }
    });

    if (onProgress) onProgress(Math.min(i + chunk, routable.length), routable.length);
    if (i + chunk < routable.length) await sleep(pauseMs);
  }

  return out;
}

/**
 * Districts whose mileage sits within `tolerance` of a band edge. OSM and
 * Google disagree by a little, so these are the ones where the disagreement
 * could change the price.
 */
function nearBandEdges(milesByOutcode, tolerancePct = 2) {
  const edges = RATES.personalDelivery.bands.map(b => b.upperMiles);
  const flagged = [];
  for (const [outcode, miles] of milesByOutcode) {
    for (const edge of edges) {
      if (Math.abs(miles - edge) <= edge * (tolerancePct / 100)) {
        flagged.push({ outcode, miles, edge, deltaMiles: +(miles - edge).toFixed(1) });
        break;
      }
    }
  }
  return flagged;
}

module.exports = { returnMilesForMany, matrixPass, outcodeCoord, nearBandEdges, isExcludedArea, ENDPOINT, CHUNK };
