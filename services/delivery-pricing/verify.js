#!/usr/bin/env node
/**
 * Builds the internal test table the brief asks for, by calling Google for
 * real road distances from the dispatch point.
 *
 * Run it on the machine that holds the key. The key is read from
 * services/delivery-pricing/.env and never printed. The output is distances
 * and prices, which are safe to paste anywhere.
 *
 *   node services/delivery-pricing/verify.js
 *   node services/delivery-pricing/verify.js "M1 1AE" "EH1 1RE"
 *
 * --dry prints the destinations and the request that would be sent, and makes
 * no billable call.
 */

const fs = require('node:fs');
const path = require('node:path');
const { roundTripMetres } = require('./routes');
const { quote, selectBand, QuoteError, METRES_PER_MILE } = require('./quote');

// Minimal .env reader: no dependency, and it must not clobber a real env var.
function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

/** Public destinations, chosen to straddle band edges from a London dispatch. */
const DEFAULT_DESTINATIONS = [
  ['SE1 0TP', 'Dispatch point itself — the floor of the first band'],
  ['SW1A 1AA', 'Buckingham Palace, central London'],
  ['RH6 0NP', 'Gatwick Airport'],
  ['CB2 1TN', 'Cambridge'],
  ['B1 1BB', 'Birmingham'],
  ['EX1 1BX', 'Exeter'],
  ['M1 1AE', 'Manchester'],
  ['LS1 5AA', 'Leeds'],
  ['NE1 7RU', 'Newcastle'],
  ['EH1 1RE', 'Edinburgh'],
  ['IV2 3BW', 'Inverness'],
  ['KW1 4YT', 'Wick — expected to fall past the last band'],
  ['BT1 5GS', 'Belfast — expected to need a ferry'],
];

const money = p => '£' + (p / 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const given = args.filter(a => !a.startsWith('--'));
  const destinations = given.length ? given.map(p => [p, '']) : DEFAULT_DESTINATIONS;

  for (const name of ['SOS_DISPATCH_POSTCODE', 'GOOGLE_ROUTES_API_KEY']) {
    if (!dry && !process.env[name]) {
      console.error(`\n${name} is not set. Put it in services/delivery-pricing/.env, then run this again.\n`);
      process.exit(1);
    }
  }

  const dispatch = process.env.SOS_DISPATCH_POSTCODE || '(unset)';
  console.log(`\nDispatch point: ${dispatch}`);
  console.log(`Rate table:     ${require('./rates.v1.json').version}`);
  console.log(`Provider:       Google Routes API v2, DRIVE, TRAFFIC_UNAWARE, two calls per row\n`);

  if (dry) {
    console.log('Dry run — no calls made. Destinations that would be priced:\n');
    for (const [pc, note] of destinations) console.log(`  ${pad(pc, 10)} ${note}`);
    console.log('');
    return;
  }

  const head = [pad('Destination', 10), padL('Out mi', 8), padL('Ret mi', 8), padL('Band', 7), padL('Delivery', 10), padL('+3 statues', 11), padL('+1 assembly', 12), '  Note'];
  console.log(head.join(''));
  console.log('-'.repeat(head.join('').length));

  for (const [postcode, note] of destinations) {
    try {
      const legs = await roundTripMetres(postcode);
      const outMi = legs.outboundMetres / METRES_PER_MILE;
      const retMi = (legs.outboundMetres + legs.returnMetres) / METRES_PER_MILE;
      const band = selectBand(retMi);

      const one = quote({ method: 'delivery', postcode, statueCount: 1, assemblyCount: 0, storageCount: 0, ...legs });
      const three = quote({ method: 'delivery', postcode, statueCount: 3, assemblyCount: 0, storageCount: 0, ...legs });
      const threePlusOne = quote({ method: 'delivery', postcode, statueCount: 3, assemblyCount: 1, storageCount: 0, ...legs });

      console.log([
        pad(postcode, 10),
        padL(outMi.toFixed(1), 8),
        padL(retMi.toFixed(1), 8),
        padL('≤' + band.upperMiles, 7),
        padL(money(one.dueTodayPence), 10),
        padL(money(three.dueTodayPence), 11),
        padL(money(threePlusOne.dueTodayPence), 12),
        '  ' + note,
      ].join(''));
    } catch (e) {
      const code = e instanceof QuoteError ? e.code : 'ERROR';
      console.log(pad(postcode, 10) + padL('—', 8) + padL('—', 8) + padL('—', 7) + padL(code, 10) + padL('', 11) + padL('', 12) + '  ' + (note || e.message));
    }
  }

  console.log('\nCheck each row against maps.google.com for the same pair of postcodes.');
  console.log('Outbound should match Google\'s driving distance within a mile or so;');
  console.log('a bigger gap means the dispatch address is geocoding somewhere else.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
