/**
 * Both legs of the round trip, from Google Routes API v2.
 *
 * Two separate calls, out and back, because the road distance is not always
 * symmetrical — one-way systems, motorway junctions that only work in one
 * direction. The brief asks for the sum of the two, not for one leg doubled.
 *
 * Ferries: we do NOT set avoidFerries. That flag asks Google to hide ferry
 * routes, which either returns a land route that does not exist or returns
 * nothing, and in neither case have we learned whether the real journey
 * crosses water. Instead we ask for the natural route and read the step
 * maneuvers: FERRY and FERRY_TRAIN. If either appears, the journey is not
 * sellable through self-checkout and goes to a manual quote.
 *
 * Request/response shape per
 * https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
 */

const { config } = require('./config');
const { QuoteError } = require('./quote');

const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.warnings',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.navigationInstruction.maneuver',
].join(',');

const FERRY_MANEUVERS = new Set(['FERRY', 'FERRY_TRAIN']);

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;

function normalisePostcode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/\s+/g, '');
  if (!UK_POSTCODE.test(s)) return null;
  return `${s.slice(0, -3)} ${s.slice(-3)}`;
}

async function computeLeg({ from, to, apiKey, endpoint, country, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        origin: { address: `${from}, ${country}` },
        destination: { address: `${to}, ${country}` },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', // distance must not move with traffic
        units: 'IMPERIAL',
      }),
    });
  } catch (cause) {
    throw new QuoteError('ROUTE_PROVIDER_UNREACHABLE', `Could not reach the routing provider: ${cause.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new QuoteError(
      'ROUTE_PROVIDER_ERROR',
      `Routing provider returned ${res.status}. ${body.slice(0, 300)}`
    );
  }

  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route || typeof route.distanceMeters !== 'number') {
    throw new QuoteError('NO_ROUTE', `No road route from ${from} to ${to}.`);
  }

  const steps = (route.legs ?? []).flatMap(leg => leg.steps ?? []);
  const ferry = steps.some(s => FERRY_MANEUVERS.has(s?.navigationInstruction?.maneuver));

  // If the mask came back without steps we cannot prove the route is
  // ferry-free, and "cannot prove" is not the same as "is not".
  const stepsSeen = steps.length > 0;

  return { metres: route.distanceMeters, ferry, stepsSeen, warnings: route.warnings ?? [] };
}

/**
 * @returns {{outboundMetres:number, returnMetres:number, warnings:string[]}}
 * @throws QuoteError on an invalid postcode, no route, a ferry on either leg,
 *         or a route we cannot inspect.
 */
async function roundTripMetres(destinationPostcode, opts = {}) {
  const dest = normalisePostcode(destinationPostcode);
  if (!dest) {
    throw new QuoteError('INVALID_POSTCODE', `"${destinationPostcode}" is not a UK postcode we can route to.`);
  }

  const apiKey = opts.apiKey ?? config.googleRoutesApiKey;
  const dispatch = opts.dispatchPostcode ?? config.dispatchPostcode;
  const endpoint = opts.endpoint ?? config.routesEndpoint;
  const country = opts.country ?? config.country;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  const common = { apiKey, endpoint, country, fetchImpl };
  const [out, back] = await Promise.all([
    computeLeg({ from: dispatch, to: dest, ...common }),
    computeLeg({ from: dest, to: dispatch, ...common }),
  ]);

  if (out.ferry || back.ferry) {
    throw new QuoteError('FERRY_ON_ROUTE', `The road route to ${dest} uses a ferry, so it is quoted by hand.`);
  }
  if (!out.stepsSeen || !back.stepsSeen) {
    throw new QuoteError(
      'ROUTE_NOT_VERIFIABLE',
      `The routing provider returned no step detail for ${dest}, so the route cannot be shown to be ferry-free.`
    );
  }

  return {
    outboundMetres: out.metres,
    returnMetres: back.metres,
    warnings: [...out.warnings, ...back.warnings],
  };
}

module.exports = { roundTripMetres, normalisePostcode, computeLeg, FIELD_MASK, FERRY_MANEUVERS };
