/**
 * The zone builder, tested without a network. Run:
 *   node services/delivery-pricing/zones.test.js
 */
const assert = require('node:assert/strict');
const { buildZones, prefixClusters, areaOf, bandFor } = require('./zones');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}
const miles = obj => new Map(Object.entries(obj));
const zoneFor = (res, code) => res.zones.find(z => z.codes.includes(code));

t('area extraction', () => {
  assert.equal(areaOf('M19'), 'M');
  assert.equal(areaOf('EC1A'), 'EC');
  assert.equal(areaOf('SW1A'), 'SW');
  assert.equal(areaOf('123'), null);
});

t('prefix clustering groups M1 with M19 but not M2', () => {
  const groups = prefixClusters(['M1', 'M19', 'M2', 'M20']).map(g => g.sort().join('+')).sort();
  assert.deepEqual(groups, ['M1+M19', 'M2+M20']);
});

t('no prefix relation means no clustering', () => {
  const groups = prefixClusters(['EX1', 'EX2', 'EX3']);
  assert.equal(groups.length, 3);
});

t('a whole area in one band collapses to the bare area letter', () => {
  const res = buildZones(miles({ EX1: 310, EX2: 320, EX4: 330 }));
  const z = res.zones.find(z => z.upperMiles === 400);
  assert.deepEqual(z.codes, ['EX']);
  assert.equal(res.review.length, 0);
});

t('an area spanning two bands is listed district by district', () => {
  const res = buildZones(miles({ EX1: 290, EX2: 310 }));
  assert.equal(zoneFor(res, 'EX1').upperMiles, 300);
  assert.equal(zoneFor(res, 'EX2').upperMiles, 400);
  assert.ok(res.review.some(r => r.kind === 'area-straddles' && r.area === 'EX'));
});

t('a prefix collision is collapsed to the cheaper band, and reported', () => {
  // M1 is 290 miles (<=300, £196); M19 is 310 (<=400, £235). They overlap as
  // prefixes, so both must sit in one zone. M5 is far enough away to keep the
  // area straddling, so the output stays district-by-district.
  const res = buildZones(miles({ M1: 290, M19: 310, M5: 480 }));
  const z = zoneFor(res, 'M19');
  assert.equal(z.upperMiles, 300, 'the cluster takes the cheaper band');
  assert.equal(zoneFor(res, 'M1').upperMiles, 300);
  const r = res.review.find(r => r.kind === 'prefix-collision');
  assert.ok(r, 'the compromise must be reported');
  assert.equal(r.shortfallPence, 23500 - 19600);
});

t('emitted lists never overlap by prefix', () => {
  // buildZones throws rather than emit a silent undercharge.
  const res = buildZones(miles({ M1: 40, M19: 40, M2: 900, B1: 150 }));
  for (const a of res.zones.flatMap(z => z.codes.map(c => [c, z.upperMiles]))) {
    for (const b of res.zones.flatMap(z => z.codes.map(c => [c, z.upperMiles]))) {
      if (a[1] !== b[1]) assert.ok(!b[0].startsWith(a[0]), `${b[0]} captured by ${a[0]}`);
    }
  }
});

t('a single-letter area is never collapsed when another area extends it', () => {
  // "E" (London) would capture EN, EX and EH. Emitting it would price
  // Edinburgh as Hackney.
  const res = buildZones(miles({ E1: 20, E2: 20, EN1: 60, EH1: 800 }));
  assert.ok(!res.zones.some(z => z.codes.includes('E')), 'bare E must never be emitted');
  assert.equal(zoneFor(res, 'E1').upperMiles, 50, 'London E stays district by district');
  assert.equal(zoneFor(res, 'E2').upperMiles, 50);
  // EN and EH extend nothing, so they collapse to their own area codes.
  assert.equal(zoneFor(res, 'EN').upperMiles, 100);
  assert.equal(zoneFor(res, 'EH').upperMiles, 800);
});

t('a two-letter area with nothing extending it still collapses', () => {
  const res = buildZones(miles({ E1: 20, EN1: 60, EN2: 60, EH1: 800 }));
  assert.ok(res.zones.some(z => z.codes.includes('EN')), 'EN extends nothing, so it collapses');
});

t('an area that is a prefix of another is listed district by district', () => {
  // N swallows NE, NG, NN, NP, NR in the real data.
  const res = buildZones(miles({ N1: 20, N2: 20, NE1: 600, NR1: 200 }));
  assert.ok(!res.zones.some(z => z.codes.includes('N')));
  assert.deepEqual(zoneFor(res, 'N1').codes.sort(), ['N1', 'N2']);
});

t('a district past the last band is reported, never priced', () => {
  const res = buildZones(miles({ KW1: 1500, KW2: 1520 }));
  assert.deepEqual(res.unpriced.sort(), ['KW1', 'KW2']);
  for (const z of res.zones) assert.equal(z.codes.length, 0);
});

t('a part-unpriced area does not collapse to the bare area letter', () => {
  // IV1 is inside the bands, IV2 is past them. Emitting "IV" would quietly
  // sell a delivery to IV2 at IV1's price.
  const res = buildZones(miles({ IV1: 950, IV2: 1500 }));
  assert.equal(zoneFor(res, 'IV1').upperMiles, 1000);
  assert.ok(!res.zones.some(z => z.codes.includes('IV')));
  assert.deepEqual(res.unpriced, ['IV2']);
});

t('every zone carries its band price and a readable name', () => {
  const res = buildZones(miles({ EX1: 40 }));
  const z = res.zones.find(z => z.upperMiles === 50);
  assert.equal(z.pence, 10000);
  assert.equal(z.name, 'Up to 50 return miles');
  assert.equal(res.zones.find(z => z.upperMiles === 200).name, 'Over 100 to 200 return miles');
});

t('every emitted entry carries the wildcard Shopify requires', () => {
  const res = buildZones(miles({ EX1: 310, EX2: 320, M1: 20, M2: 20, MK1: 60 }));
  for (const z of res.zones) {
    for (const entry of z.list.split(', ').filter(Boolean)) {
      assert.ok(entry.endsWith('*'), `${entry} has no wildcard; Shopify rejects it`);
    }
  }
  assert.equal(res.zones.find(z => z.upperMiles === 400).list, 'EX*');
});

t('character count is tracked against the 3,000 limit', () => {
  const big = {};
  for (let i = 1; i <= 400; i++) big['ZZ' + i] = 40;
  const res = buildZones(miles(big));
  const z = res.zones.find(z => z.upperMiles === 50);
  assert.equal(z.codes.length, 1, 'one area, one band -> collapses to "ZZ"');
  assert.equal(z.chars, 3, 'ZZ plus the wildcard');
  assert.equal(z.overLimit, false);
});

t('ten zones are always produced, in band order', () => {
  const res = buildZones(miles({ EX1: 40 }));
  assert.equal(res.zones.length, 10, 'Shopify allows a location exactly ten');
  assert.deepEqual(res.zones.map(z => z.upperMiles), [50, 100, 200, 300, 400, 500, 600, 800, 1000, 1400]);
});

t('band selection matches the rate table', () => {
  assert.equal(bandFor(50).pence, 10000);
  assert.equal(bandFor(50.01).pence, 11900);
  assert.equal(bandFor(1400.01), null);
});

console.log(passed + ' passed' + (process.exitCode ? '' : ', 0 failed'));
