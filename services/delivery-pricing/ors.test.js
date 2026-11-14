/**
 * OpenRouteService adapter, against a fake transport. No key, no network.
 *   node services/delivery-pricing/ors.test.js
 */
const assert = require('node:assert/strict');
const { returnMilesForMany, matrixPass, nearBandEdges, isExcludedArea } = require('./ors');

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const DISPATCH = [-0.0956, 51.5033]; // SE1 0TP, roughly
const dest = (outcode, lon = -2, lat = 53) => ({ outcode, coord: [lon, lat] });
const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

/** Records every request and answers with canned distance matrices. */
function fake(responders) {
  const calls = [];
  let i = 0;
  const f = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const r = responders[Math.min(i, responders.length - 1)];
    i++;
    return typeof r === 'function' ? r(calls[calls.length - 1]) : r;
  };
  f.calls = calls;
  return f;
}

(async () => {
  await t('excluded areas never reach the provider', async () => {
    const f = fake([ok({ distances: [[1]] })]);
    const res = await returnMilesForMany(
      [dest('BT1'), dest('IM1'), dest('HS1')], DISPATCH,
      { apiKey: 'k', fetchImpl: f, pauseMs: 0 }
    );
    assert.equal(f.calls.length, 0, 'no request should have been made');
    for (const code of ['BT1', 'IM1', 'HS1']) {
      assert.equal(res.get(code).error, 'MANUAL_QUOTE');
    }
  });

  await t('both directions are requested, and summed', async () => {
    // outbound: one row of two. return: two rows of one.
    const f = fake([
      ok({ distances: [[80467.2, 160934.4]] }),
      ok({ distances: [[80467.2], [160934.4]] }),
    ]);
    const res = await returnMilesForMany([dest('M1'), dest('EX1')], DISPATCH,
      { apiKey: 'k', fetchImpl: f, pauseMs: 0 });

    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.calls[0].sources, [0], 'first pass goes out from the dispatch point');
    assert.deepEqual(f.calls[0].destinations, [1, 2]);
    assert.deepEqual(f.calls[1].destinations, [0], 'second pass comes back to it');
    assert.deepEqual(f.calls[0].metrics, ['distance']);

    assert.ok(Math.abs(res.get('M1').miles - 100) < 0.01);
    assert.ok(Math.abs(res.get('EX1').miles - 200) < 0.01);
  });

  await t('the dispatch point is location 0 in every request', async () => {
    const f = fake([ok({ distances: [[1]] }), ok({ distances: [[1]] })]);
    await returnMilesForMany([dest('M1')], DISPATCH, { apiKey: 'k', fetchImpl: f, pauseMs: 0 });
    assert.deepEqual(f.calls[0].locations[0], DISPATCH);
  });

  await t('a null distance is no route, not zero miles', async () => {
    const f = fake([ok({ distances: [[null]] }), ok({ distances: [[1000]] })]);
    const res = await returnMilesForMany([dest('M1')], DISPATCH, { apiKey: 'k', fetchImpl: f, pauseMs: 0 });
    assert.equal(res.get('M1').error, 'NO_ROUTE');
    assert.equal(res.get('M1').miles, undefined);
  });

  await t('destinations are chunked', async () => {
    const many = Array.from({ length: 5 }, (_, i) => dest('ZZ' + (i + 1)));
    const f = fake([req => ok({
      distances: req.destinations.length === 1
        ? req.sources.map(() => [1609.344])
        : [req.destinations.map(() => 1609.344)],
    })]);
    await returnMilesForMany(many, DISPATCH, { apiKey: 'k', fetchImpl: f, chunk: 2, pauseMs: 0 });
    // 5 destinations, chunks of 2 -> 3 chunks -> 6 calls
    assert.equal(f.calls.length, 6);
  });

  await t('a short matrix is an error, not silently padded', async () => {
    const f = fake([ok({ distances: [[1000]] })]);
    await assert.rejects(
      returnMilesForMany([dest('M1'), dest('M2')], DISPATCH, { apiKey: 'k', fetchImpl: f, pauseMs: 0 }),
      e => e.code === 'ROUTE_PROVIDER_ERROR'
    );
  });

  await t('quota and rate-limit responses are distinguishable', async () => {
    const quota = { ok: false, status: 403, text: async () => '' };
    await assert.rejects(
      matrixPass(DISPATCH, [[-2, 53]], false, { apiKey: 'k', fetchImpl: fake([quota]) }),
      e => e.code === 'QUOTA_EXHAUSTED'
    );
    const limited = { ok: false, status: 429, text: async () => '' };
    await assert.rejects(
      matrixPass(DISPATCH, [[-2, 53]], false, { apiKey: 'k', fetchImpl: fake([limited]) }),
      e => e.code === 'RATE_LIMITED'
    );
  });

  await t('a missing key fails before any request', async () => {
    await assert.rejects(
      returnMilesForMany([dest('M1')], DISPATCH, { apiKey: '', fetchImpl: fake([]), pauseMs: 0 }),
      e => e.code === 'CONFIG_MISSING'
    );
  });

  await t('exclusion list covers the island areas', () => {
    assert.equal(isExcludedArea('BT1'), true);
    assert.equal(isExcludedArea('ZE1'), true);
    assert.equal(isExcludedArea('PA20'), true);
    assert.equal(isExcludedArea('M1'), false);
    assert.equal(isExcludedArea('PA1'), false, 'Paisley is mainland');
  });

  await t('districts close to a band edge are flagged for a hand check', () => {
    const flagged = nearBandEdges(new Map([
      ['A1', 99],    // 1 under the 100 edge
      ['A2', 101],   // 1 over it
      ['A3', 150],   // nowhere near
      ['A4', 1000],  // exactly on the last edge
    ]), 2);
    assert.deepEqual(flagged.map(f => f.outcode).sort(), ['A1', 'A2', 'A4']);
    assert.equal(flagged.find(f => f.outcode === 'A1').edge, 100);
    assert.equal(flagged.find(f => f.outcode === 'A2').deltaMiles, 1);
  });

  console.log(passed + ' passed' + (process.exitCode ? '' : ', 0 failed'));
})();
