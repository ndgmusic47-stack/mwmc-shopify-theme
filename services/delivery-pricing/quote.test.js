/**
 * Band edges are where a pricing bug hides, so every boundary is tested just
 * below, exactly on, and just above. Run: node services/delivery-pricing/quote.test.js
 */
const assert = require('node:assert/strict');
const { quote, selectBand, returnMilesFromMetres, needsManualQuote, outwardCode, QuoteError, METRES_PER_MILE } = require('./quote');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}
const milesToMetres = m => m * METRES_PER_MILE;
const deliver = (miles, extra = {}) => quote({
  method: 'delivery', postcode: 'M1 1AE', statueCount: 1, assemblyCount: 0, storageCount: 0,
  outboundMetres: milesToMetres(miles) / 2, returnMetres: milesToMetres(miles) / 2, ...extra,
});

// ---- band edges -------------------------------------------------------------
const edges = [
  [50, 10000, 11900], [100, 11900, 15800], [200, 15800, 19600], [300, 19600, 23500],
  [400, 23500, 27400], [500, 27400, 31200], [600, 31200, 39000], [800, 39000, 46700],
  [1000, 46700, 62100],
];
for (const [limit, atPence, abovePence] of edges) {
  t(`${limit} mi -> ${atPence}p`, () => assert.equal(selectBand(limit).pence, atPence));
  t(`${limit - 0.01} mi -> ${atPence}p`, () => assert.equal(selectBand(limit - 0.01).pence, atPence));
  t(`${limit + 0.01} mi -> ${abovePence}p`, () => assert.equal(selectBand(limit + 0.01).pence, abovePence));
}
t('1400 mi -> 62100p (last band)', () => assert.equal(selectBand(1400).pence, 62100));
t('0 mi -> 10000p', () => assert.equal(selectBand(0).pence, 10000));

// ---- past the bands: must fail loudly, never fall back ----------------------
t('1400.01 mi throws BEYOND_BANDS', () => {
  assert.throws(() => selectBand(1400.01), e => e instanceof QuoteError && e.code === 'BEYOND_BANDS');
});
t('Thurso, the furthest mainland district, is inside the last band', () => {
  assert.equal(selectBand(1338).pence, 62100);
});
t('a beyond-bands quote yields no price at all', () => {
  assert.throws(() => deliver(1600), e => e.code === 'BEYOND_BANDS');
});

// ---- two legs are added as metres, converted once ---------------------------
t('legs sum before conversion', () => {
  assert.equal(returnMilesFromMetres(80467.2, 80467.2), 100);
});
t('asymmetric legs still sum', () => {
  const m = returnMilesFromMetres(milesToMetres(49.9), milesToMetres(0.2));
  assert.ok(Math.abs(m - 50.1) < 1e-9);
  assert.equal(selectBand(m).pence, 11900, 'just over 50 must be the second band');
});
t('a missing leg is an error, not zero', () => {
  assert.throws(() => returnMilesFromMetres(1000, null), e => e.code === 'NO_ROUTE');
});

// ---- larger vehicle: 2 vs 3 statues ----------------------------------------
t('2 statues: no larger vehicle charge', () => {
  const q = deliver(40, { statueCount: 2 });
  assert.equal(q.lines.some(l => l.code === 'larger_vehicle'), false);
  assert.equal(q.dueTodayPence, 10000);
});
t('3 statues: one larger vehicle charge', () => {
  const q = deliver(40, { statueCount: 3 });
  assert.equal(q.lines.filter(l => l.code === 'larger_vehicle').length, 1);
  assert.equal(q.dueTodayPence, 10000 + 10900);
});
t('5 statues: still only one larger vehicle charge', () => {
  const q = deliver(40, { statueCount: 5 });
  assert.equal(q.dueTodayPence, 10000 + 10900);
});
t('collection never pays for a larger vehicle', () => {
  const q = quote({ method: 'collection', statueCount: 4, assemblyCount: 0, storageCount: 0 });
  assert.equal(q.dueTodayPence, 0);
});

// ---- assembly ---------------------------------------------------------------
t('assembly is per statue ticked, not per basket', () => {
  const q = deliver(40, { statueCount: 3, assemblyCount: 2 });
  assert.equal(q.dueTodayPence, 10000 + 10900 + 4900 * 2);
});
t('cannot assemble more statues than are in the basket', () => {
  assert.throws(() => deliver(40, { statueCount: 1, assemblyCount: 2 }), e => e.code === 'BAD_EXTRAS');
});

// ---- storage: nothing today, something later --------------------------------
t('storage adds £0 today', () => {
  const q = deliver(40, { statueCount: 1, storageCount: 1 });
  assert.equal(q.dueTodayPence, 10000);
  assert.equal(q.lines.find(l => l.code === 'box_storage').pence, 0);
});
t('storage schedules £19.99 per statue per month', () => {
  const q = deliver(40, { statueCount: 2, storageCount: 2 });
  assert.equal(q.futurePence[0].pence, 3998);
  assert.equal(q.futurePence[0].recurring, 'monthly');
});
t('no storage means no future charge', () => {
  assert.equal(deliver(40).futurePence.length, 0);
});

// ---- switching to collection clears the delivery charges --------------------
t('collection costs nothing and keeps assembly', () => {
  const q = quote({ method: 'collection', statueCount: 3, assemblyCount: 1, storageCount: 0 });
  assert.equal(q.dueTodayPence, 4900);
  assert.equal(q.returnMiles, null);
});

// ---- postcodes we cannot prove a road route to ------------------------------
t('outward code parsing', () => {
  assert.equal(outwardCode('SE24 9DZ'), 'SE24');
  assert.equal(outwardCode('m11ae'), 'M1');
  assert.equal(outwardCode('EC1A 1BB'), 'EC1A');
  assert.equal(outwardCode('nonsense'), null);
});
t('Belfast is manual quote', () => assert.equal(needsManualQuote('BT1 5GS'), true));
t('Isle of Man is manual quote', () => assert.equal(needsManualQuote('IM1 1AA'), true));
t('an invalid postcode is manual quote, not mainland', () => assert.equal(needsManualQuote('XX'), true));
t('Manchester is not manual quote', () => assert.equal(needsManualQuote('M1 1AE'), false));
t('a ferry destination never produces a price', () => {
  assert.throws(() => deliver(300, { postcode: 'BT1 5GS' }), e => e.code === 'MANUAL_QUOTE');
});

// ---- money stays exact ------------------------------------------------------
t('every amount is an integer number of pence', () => {
  const q = deliver(750, { statueCount: 3, assemblyCount: 3, storageCount: 3 });
  for (const l of q.lines) assert.ok(Number.isInteger(l.pence), `${l.code} is not integer pence`);
  for (const f of q.futurePence) assert.ok(Number.isInteger(f.pence));
  assert.equal(q.dueTodayPence, 39000 + 10900 + 4900 * 3);
});

console.log(passed + ' passed' + (process.exitCode ? '' : ', 0 failed'));
