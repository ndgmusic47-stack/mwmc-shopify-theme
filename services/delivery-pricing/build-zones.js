#!/usr/bin/env node
/**
 * Builds the nine Shopify Local delivery zone lists, once, offline.
 *
 * Run this on the machine that holds the Google key. It:
 *   1. finds every UK postcode district (postcodes.io, free, no key),
 *   2. asks Google for the road distance there and back from the dispatch point,
 *   3. puts each district in its band,
 *   4. writes nine blocks of text to paste straight into Shopify, plus a short
 *      review of the only decisions a human needs to look at.
 *
 * There is no spreadsheet to audit. The review file lists compromises only —
 * typically a handful of lines, not thousands.
 *
 *   node services/delivery-pricing/build-zones.js
 *   node services/delivery-pricing/build-zones.js --areas EX,PL,TR   # a trial
 *   node services/delivery-pricing/build-zones.js --districts-only   # no Google
 *
 * Distances are cached in .cache/distances.json, so stopping and restarting
 * costs nothing and a second run is instant.
 */

const fs = require('node:fs');
const path = require('node:path');
const { roundTripMetres } = require('./routes');
const { returnMilesForMany, outcodeCoord, nearBandEdges } = require('./ors');
const { buildZones } = require('./zones');
const RATES = require('./rates.v1.json');
const { METRES_PER_MILE } = require('./quote');

const DIR = __dirname;
const CACHE = path.join(DIR, '.cache');
const OUT = path.join(DIR, 'zones-out');

function loadEnv() {
  const file = path.join(DIR, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

/** Every UK postcode area. Channel Islands and the Isle of Man included: they
 *  need a ferry, so they must be found in order to be excluded on purpose. */
const AREAS = ('AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL DN DT DY ' +
  'E EC EH EN EX FK FY G GL GU GY HA HD HG HP HR HS HU HX IG IM IP IV JE KA KT KW KY L LA LD LE LL LN LS LU ' +
  'M ME MK ML N NE NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA SE SG SK SL SM SN SO SP SR SS ST SW ' +
  'SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF WN WR WS WV YO ZE').split(/\s+/);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Run tasks with a ceiling on how many are in flight. */
async function pool(items, limit, worker, onProgress) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
      if (onProgress) onProgress(++done, items.length);
    }
  }));
  return out;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/** postcodes.io 404s an outcode that does not exist, which is how we find the real ones. */
async function discoverDistricts(areas) {
  const cacheFile = path.join(CACHE, 'districts.json');
  const cached = readJson(cacheFile, null);
  if (cached && areas.every(a => a in cached)) {
    return Object.fromEntries(areas.map(a => [a, cached[a]]));
  }

  const probes = [];
  for (const area of areas) for (let n = 1; n <= 99; n++) probes.push(`${area}${n}`);

  process.stdout.write(`Finding postcode districts (${probes.length} checks)… `);
  const found = await pool(probes, 8, async code => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://api.postcodes.io/outcodes/${code}`);
        if (r.status === 404) return null;
        if (r.ok) {
          const d = (await r.json())?.result;
          if (typeof d?.longitude !== 'number') return null;
          return { code, coord: [d.longitude, d.latitude] };
        }
        await sleep(300 * (attempt + 1));
      } catch { await sleep(300 * (attempt + 1)); }
    }
    throw new Error(`Could not check ${code} — is this machine online?`);
  });

  const byArea = Object.fromEntries(areas.map(a => [a, []]));
  for (const hit of found.filter(Boolean)) {
    byArea[hit.code.match(/^[A-Z]+/)[0]].push(hit);
  }
  writeJson(cacheFile, { ...(cached ?? {}), ...byArea });
  const total = Object.values(byArea).reduce((n, l) => n + l.length, 0);
  console.log(`${total} found.`);
  if (areas.length === AREAS.length && (total < 2500 || total > 3300)) {
    console.warn(`  ! ${total} districts is outside the expected 2,500–3,300. Check the area list.`);
  }
  return byArea;
}

/** Where the van leaves from, as [lon, lat]. */
async function dispatchCoord() {
  const pc = process.env.SOS_DISPATCH_POSTCODE;
  const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc));
  if (!r.ok) throw new Error(`Could not look up the dispatch postcode ${pc} (postcodes.io returned ${r.status}).`);
  const d = (await r.json())?.result;
  if (typeof d?.longitude !== 'number') throw new Error(`No coordinates for the dispatch postcode ${pc}.`);
  return [d.longitude, d.latitude];
}

/**
 * OpenRouteService: one matrix call covers a few hundred destinations, so the
 * whole country is a few dozen requests rather than six thousand.
 */
async function measureOrs(districts) {
  const cacheFile = path.join(CACHE, 'distances.json');
  const cache = readJson(cacheFile, {});
  const todo = districts.filter(d => !(d.code in cache));
  console.log(`Road distances: ${districts.length - todo.length} cached, ${todo.length} to fetch.`);
  if (!todo.length) return cache;

  const origin = await dispatchCoord();
  const results = await returnMilesForMany(
    todo.map(d => ({ outcode: d.code, coord: d.coord })),
    origin,
    {
      apiKey: process.env.ORS_API_KEY,
      onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
    }
  );
  process.stdout.write('\n');

  for (const [code, value] of results) cache[code] = value;
  writeJson(cacheFile, cache);
  return cache;
}

/** Google, kept as a fallback: one route call per leg, so two per district. */
async function measureGoogle(districts) {
  const cacheFile = path.join(CACHE, 'distances.json');
  const cache = readJson(cacheFile, {});
  const todo = districts.filter(d => !(d.code in cache));
  console.log(`Road distances: ${districts.length - todo.length} cached, ${todo.length} to fetch (${todo.length * 2} Google calls).`);

  let saved = 0;
  await pool(todo, 6, async d => {
    try {
      const legs = await roundTripMetres(`${d.code} 1AA`);
      cache[d.code] = { miles: (legs.outboundMetres + legs.returnMetres) / METRES_PER_MILE };
    } catch (e) {
      cache[d.code] = { error: e.code ?? 'ERROR', message: e.message };
    }
    if (++saved % 50 === 0) writeJson(cacheFile, cache);
  }, (done, total) => {
    if (done % 25 === 0 || done === total) process.stdout.write(`\r  ${done}/${total}`);
  });
  if (todo.length) process.stdout.write('\n');
  writeJson(cacheFile, cache);
  return cache;
}

function writeOutput(result, excluded, borderline = []) {
  fs.mkdirSync(OUT, { recursive: true });
  const lines = [];

  lines.push('# Shopify Local delivery — zones to create\n');
  lines.push('Settings > Shipping and delivery > Local delivery > your location.');
  lines.push('Create one zone per block below. Paste the postcode list verbatim.\n');

  for (const z of result.zones) {
    const file = path.join(OUT, `zone-${String(z.upperMiles).padStart(4, '0')}.txt`);
    fs.writeFileSync(file, z.list + '\n');
    lines.push(`## ${z.name} — £${(z.pence / 100).toFixed(2)}`);
    lines.push(`${z.codes.length} entries, ${z.chars} characters${z.overLimit ? '  ** OVER THE 3,000 LIMIT **' : ''}`);
    lines.push('```');
    lines.push(z.list || '(none)');
    lines.push('```\n');
  }

  if (result.review.length) {
    lines.push('# Decisions worth your eye\n');
    for (const r of result.review) {
      if (r.kind === 'prefix-collision') {
        lines.push(`- **${r.outcodes.join(', ')}** — ${r.why} Priced at the cheaper band, ` +
          `£${(r.chosenPence / 100).toFixed(2)}. On the far edge of that group you absorb up to ` +
          `£${(r.shortfallPence / 100).toFixed(2)} per delivery.`);
      } else {
        lines.push(`- **Area ${r.area}** — ${r.why} ${r.districtCount} districts, ` +
          `£${(r.spreadPence / 100).toFixed(2)} between its cheapest and dearest band. ` +
          `Listed district by district, so nobody is over- or undercharged.`);
      }
    }
    lines.push('');
  }

  if (excluded.length) {
    lines.push('# Not offered delivery\n');
    lines.push('These are left out of every zone, so Shopify shows no delivery option and the');
    lines.push('buyer is pushed to ask for a quote. Each needs a ferry or is past the last band.\n');
    const byReason = {};
    for (const e of excluded) (byReason[e.reason] ??= []).push(e.code);
    for (const [reason, codes] of Object.entries(byReason)) {
      lines.push(`- **${reason}** (${codes.length}): ${codes.sort().join(', ')}`);
    }
    lines.push('');
  }

  if (borderline.length) {
    lines.push('# Within 2% of a band edge\n');
    lines.push('Road mileage from OpenStreetMap differs a little from Google\'s. Almost');
    lines.push('everywhere that makes no difference, but these districts sit close enough to');
    lines.push('a boundary that a small disagreement would change the price. Worth checking');
    lines.push('a couple against your own maps before you go live.\n');
    for (const b of borderline.sort((a, b) => a.outcode.localeCompare(b.outcode))) {
      lines.push(`- **${b.outcode}** — ${b.miles.toFixed(1)} return miles, ` +
        `${b.deltaMiles > 0 ? b.deltaMiles + ' over' : Math.abs(b.deltaMiles) + ' under'} the ${b.edge}-mile edge.`);
    }
    lines.push('');
  }

  // The storefront copy. Shopify gives the theme no way to ask what a local
  // delivery costs, so the product page reads this mirror of the same table.
  // Written on every run, so it cannot fall behind the zones it came from.
  const asset = {
    version: RATES.version,
    note: 'Generated by build-zones.js. Mirrors the Shopify Local delivery zones. Re-run whenever a price or a zone changes.',
    bands: RATES.personalDelivery.bands.map((b, i) => ({
      max: b.upperMiles, pence: b.pence, label: result.zones[i].name,
    })),
    collectionLabel: RATES.collection.label,
    assemblyPence: RATES.assembly.pence,
    storagePence: RATES.boxStorage.pence,
    largerVehiclePence: RATES.largerVehicle.pence,
    largerVehicleFrom: RATES.largerVehicle.appliesFromStatueCount,
    zones: result.zones.reduce((acc, z, i) => {
      for (const c of z.codes) acc[c] = i;
      return acc;
    }, {}),
  };
  const assetPath = path.join(DIR, '..', '..', 'assets', 'sos-delivery-zones.json');
  fs.writeFileSync(assetPath, JSON.stringify(asset));
  lines.push('# Storefront copy\n');
  lines.push(`assets/sos-delivery-zones.json rewritten — ${Object.keys(asset.zones).length} entries, rate table ${RATES.version}.`);
  lines.push('The product page reads this. If you change a price in Shopify by hand without re-running this, the two will disagree.\n');

  const review = lines.join('\n');
  fs.writeFileSync(path.join(OUT, 'REVIEW.md'), review);
  return review;
}

async function main() {
  const args = process.argv.slice(2);
  const areaArg = args.find(a => a.startsWith('--areas='))?.split('=')[1]
    ?? (args.includes('--areas') ? args[args.indexOf('--areas') + 1] : null);
  const areas = areaArg ? areaArg.toUpperCase().split(',').map(s => s.trim()) : AREAS;
  const districtsOnly = args.includes('--districts-only');
  const provider = (args.find(a => a.startsWith('--provider='))?.split('=')[1] ?? 'ors').toLowerCase();

  if (!districtsOnly) {
    const keyName = provider === 'google' ? 'GOOGLE_ROUTES_API_KEY' : 'ORS_API_KEY';
    for (const name of ['SOS_DISPATCH_POSTCODE', keyName]) {
      if (!process.env[name]) {
        console.error(`\n${name} is not set. Put it in services/delivery-pricing/.env and run this again.\n`);
        process.exit(1);
      }
    }
    console.log(`Dispatch point: ${process.env.SOS_DISPATCH_POSTCODE}`);
    console.log(`Provider:       ${provider === 'google' ? 'Google Routes' : 'OpenRouteService'}\n`);
  }

  const byArea = await discoverDistricts(areas);
  const districts = Object.values(byArea).flat().sort((a, b) => a.code.localeCompare(b.code));
  if (districtsOnly) {
    console.log(`${districts.length} districts across ${areas.length} areas. Stopping before any routing call.`);
    return;
  }

  const distances = provider === 'google' ? await measureGoogle(districts) : await measureOrs(districts);

  const milesByOutcode = new Map();
  const excluded = [];
  for (const { code } of districts) {
    const d = distances[code];
    if (d?.miles != null) milesByOutcode.set(code, d.miles);
    else excluded.push({ code, reason: reasonFor(d?.error) });
  }

  const result = buildZones(milesByOutcode);
  for (const code of result.unpriced) excluded.push({ code, reason: 'Past the last band (over 1,000 return miles)' });

  const borderline = nearBandEdges(milesByOutcode, 2);
  const review = writeOutput(result, excluded, borderline);
  console.log('\n' + review.split('\n').slice(0, 4).join('\n'));
  console.log(`Written to ${OUT}`);
  console.log(`  REVIEW.md          everything below, to read once`);
  console.log(`  zone-*.txt         ${result.zones.length} paste-ready lists\n`);
  const collisions = result.review.filter(r => r.kind === 'prefix-collision');
  const straddles = result.review.filter(r => r.kind === 'area-straddles');
  const worst = collisions.reduce((n, c) => Math.max(n, c.shortfallPence), 0);
  console.log(collisions.length
    ? `${collisions.length} prefix collision${collisions.length === 1 ? '' : 's'} cost you money — up to £${(worst / 100).toFixed(2)} per delivery on the worst. Listed first in REVIEW.md.`
    : 'No prefix collisions — every district is priced at its own band.');
  if (straddles.length) {
    console.log(`${straddles.length} area${straddles.length === 1 ? '' : 's'} span more than one band and were split district by district. Nothing lost; no action needed.`);
  }
  console.log(`${excluded.length} districts are not offered delivery; they are listed at the end of REVIEW.md.\n`);
}

function reasonFor(code) {
  switch (code) {
    case 'FERRY_ON_ROUTE': return 'Needs a ferry';
    case 'BEYOND_BANDS': return 'Past the last band (over 1,000 return miles)';
    case 'NO_ROUTE': return 'No road route found';
    case 'MANUAL_QUOTE': return 'Island or offshore — quoted by hand';
    case 'ROUTE_NOT_VERIFIABLE': return 'Route could not be shown to be ferry-free';
    default: return code ? `Lookup failed (${code})` : 'Not measured';
  }
}

main().catch(e => { console.error('\n' + (e.stack ?? e.message)); process.exit(1); });
