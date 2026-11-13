/**
 * Server-side configuration. Nothing in here may be inlined into the theme:
 * the dispatch point is the owner's address and the API key is billable.
 *
 * Set these in the environment of whatever hosts the rate service. For local
 * work, copy .env.example to .env and fill it in; .env is gitignored.
 */

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    const e = new Error(
      `${name} is not set. The rate service refuses to start without it — a missing dispatch point or key must stop the quote, never produce a default one.`
    );
    e.code = 'CONFIG_MISSING';
    throw e;
  }
  return v.trim();
}

const config = {
  /** Where every delivery leaves from and returns to. */
  get dispatchPostcode() {
    return required('SOS_DISPATCH_POSTCODE');
  },
  get googleRoutesApiKey() {
    return required('GOOGLE_ROUTES_API_KEY');
  },
  /** Google bills per request; the same postcode is quoted many times a day. */
  routeCacheTtlSeconds: Number(process.env.SOS_ROUTE_CACHE_TTL ?? 60 * 60 * 24 * 7),
  country: process.env.SOS_COUNTRY ?? 'United Kingdom',
  routesEndpoint: process.env.GOOGLE_ROUTES_ENDPOINT
    ?? 'https://routes.googleapis.com/directions/v2:computeRoutes',
};

module.exports = { config, required };
