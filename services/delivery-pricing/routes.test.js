/**
 * Routes are tested against a fake transport, so these run with no API key and
 * cost nothing. Run: node services/delivery-pricing/routes.test.js
 */
const assert = require('node:assert/strict');
const { roundTripMetres, normalisePostcode } = require('./routes');
const { quote } = require('./quote');

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const step = maneuver => ({ travelMode: 'DRIVE', navigationInstruction: { maneuver } });
const route = (metres, maneuvers = ['TURN_LEFT']) => ({
  routes: [{ distanceMeters: metres, legs: [{ steps: maneuvers.map(step) }], warnings: [] }],
});

/** Serves a different distance per leg so we can prove both are used. */
function fakeFetch(perCall) {
  let i = 0;
  const calls = [];
  const f = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const r = perCall[Math.min(i, perCall.length - 1)];
    i++;
    return typeof r === 'function' ? r() : r;
  };
  f.calls = calls;
  return f;
}

const opts = extra => ({
  apiKey: 'test-key', dispatchPostcode: 'SE1 0TP', country: 'United Kingdom',
  endpoint: 'https://example.invalid/compute', ...extra,
});

(async () => {
  await t('postcode normalising', () => {
    assert.equal(normalisePostcode('se10tp'), 'SE1 0TP');
    assert.equal(normalisePostcode('  M1   1AE '), 'M1 1AE');
    assert.equal(normalisePostcode('EC1A1BB'), 'EC1A 1BB');
    assert.equal(normalisePostcode('banana'), null);
    assert.equal(normalisePostcode(''), null);
    assert.equal(normalisePostcode(undefined), null);
  });

  await t('an invalid postcode never reaches the provider', async () => {
    const f = fakeFetch([ok(route(1000))]);
    await assert.rejects(
      roundTripMetres('not a postcode', opts({ fetchImpl: f })),
      e => e.code === 'INVALID_POSTCODE'
    );
    assert.equal(f.calls.length, 0, 'no billable call should have been made');
  });

  await t('both legs are requested, in both directions', async () => {
    const f = fakeFetch([ok(route(100)), ok(route(200))]);
    const r = await roundTripMetres('M1 1AE', opts({ fetchImpl: f }));
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].origin.address, 'SE1 0TP, United Kingdom');
    assert.equal(f.calls[0].destination.address, 'M1 1AE, United Kingdom');
    assert.equal(f.calls[1].origin.address, 'M1 1AE, United Kingdom');
    assert.equal(f.calls[1].destination.address, 'SE1 0TP, United Kingdom');
    assert.equal(r.outboundMetres + r.returnMetres, 300);
  });

  await t('asymmetric legs are both kept', async () => {
    const f = fakeFetch([ok(route(80000)), ok(route(90000))]);
    const r = await roundTripMetres('M1 1AE', opts({ fetchImpl: f }));
    assert.equal(r.outboundMetres, 80000);
    assert.equal(r.returnMetres, 90000);
  });

  await t('distance is requested without traffic, so a quote is stable', async () => {
    const f = fakeFetch([ok(route(100)), ok(route(100))]);
    await roundTripMetres('M1 1AE', opts({ fetchImpl: f }));
    assert.equal(f.calls[0].routingPreference, 'TRAFFIC_UNAWARE');
    assert.equal(f.calls[0].travelMode, 'DRIVE');
  });

  await t('avoidFerries is never sent', async () => {
    const f = fakeFetch([ok(route(100)), ok(route(100))]);
    await roundTripMetres('M1 1AE', opts({ fetchImpl: f }));
    assert.equal(f.calls[0].routeModifiers, undefined);
  });

  await t('a ferry on the outbound leg stops the quote', async () => {
    const f = fakeFetch([ok(route(100, ['TURN_LEFT', 'FERRY'])), ok(route(100))]);
    await assert.rejects(roundTripMetres('BT1 5GS', opts({ fetchImpl: f })), e => e.code === 'FERRY_ON_ROUTE');
  });

  await t('a ferry on the return leg stops the quote', async () => {
    const f = fakeFetch([ok(route(100)), ok(route(100, ['FERRY_TRAIN']))]);
    await assert.rejects(roundTripMetres('M1 1AE', opts({ fetchImpl: f })), e => e.code === 'FERRY_ON_ROUTE');
  });

  await t('a route with no step detail is refused, not assumed ferry-free', async () => {
    const f = fakeFetch([ok({ routes: [{ distanceMeters: 100, legs: [] }] })]);
    await assert.rejects(roundTripMetres('M1 1AE', opts({ fetchImpl: f })), e => e.code === 'ROUTE_NOT_VERIFIABLE');
  });

  await t('no route found is an error, not zero miles', async () => {
    const f = fakeFetch([ok({ routes: [] })]);
    await assert.rejects(roundTripMetres('M1 1AE', opts({ fetchImpl: f })), e => e.code === 'NO_ROUTE');
  });

  await t('a provider error surfaces, it does not become free delivery', async () => {
    const f = fakeFetch([{ ok: false, status: 403, text: async () => 'PERMISSION_DENIED' }]);
    await assert.rejects(roundTripMetres('M1 1AE', opts({ fetchImpl: f })), e => e.code === 'ROUTE_PROVIDER_ERROR');
  });

  await t('a network failure surfaces', async () => {
    const f = async () => { throw new Error('ECONNRESET'); };
    await assert.rejects(roundTripMetres('M1 1AE', opts({ fetchImpl: f })), e => e.code === 'ROUTE_PROVIDER_UNREACHABLE');
  });

  // ---- routes + quote, end to end against the fake provider ---------------
  await t('SE1 0TP to a 40-mile-each-way address lands in the 100-mile band', async () => {
    const metres = 40 * 1609.344;
    const f = fakeFetch([ok(route(metres)), ok(route(metres))]);
    const legs = await roundTripMetres('M1 1AE', opts({ fetchImpl: f }));
    const q = quote({ method: 'delivery', postcode: 'M1 1AE', statueCount: 1, assemblyCount: 0, storageCount: 0, ...legs });
    assert.equal(Math.round(q.returnMiles), 80);
    assert.equal(q.dueTodayPence, 11900);
  });

  await t('three statues and two assemblies on a 300-mile round trip', async () => {
    const metres = 150 * 1609.344;
    const f = fakeFetch([ok(route(metres)), ok(route(metres))]);
    const legs = await roundTripMetres('EX1 1BX', opts({ fetchImpl: f }));
    const q = quote({ method: 'delivery', postcode: 'EX1 1BX', statueCount: 3, assemblyCount: 2, storageCount: 1, ...legs });
    assert.equal(q.dueTodayPence, 19600 + 10900 + 4900 * 2);
    assert.equal(q.futurePence[0].pence, 1999);
  });

  console.log(passed + ' passed' + (process.exitCode ? '' : ', 0 failed'));
})();
