/**
 * Turning per-district mileage into nine Shopify Local delivery zones.
 *
 * Two things make this harder than sorting a list.
 *
 * 1. A zone entry is either a complete postcode or a prefix with an asterisk.
 *    A bare outward code is rejected — the admin form refuses to save and the
 *    field reads "Required" — so every entry is written "M1*", and "M1*" also
 *    captures M11 through M19. You therefore cannot put M1 in one zone and M19
 *    in another: M19 matches both, and Shopify charges whichever is cheaper.
 *    Any such collision has to be collapsed to a single band before it reaches
 *    Shopify.
 *
 *    There is no escape via the space in the middle of a UK postcode: typing
 *    "PH1 *" into the field is normalised to "PH1*" on the spot, so "PH1 but
 *    not PH13" cannot be expressed. Verified in the admin, 14 November 2026.
 *
 * 2. Each zone's list is capped at 3,000 characters. Listing every district in
 *    the country would blow that, so wherever a whole postcode area sits in one
 *    band we emit the bare area ("EX") instead of its forty districts.
 *
 * Nothing here touches the network. The runner fetches the mileage; this turns
 * it into zone lists and tells you which areas had to be compromised and what
 * that compromise costs.
 */

const RATES = require('./rates.v1.json');

const ZONE_CHAR_LIMIT = 3000;

/** "M19" -> "M", "EC1A" -> "EC" */
function areaOf(outcode) {
  const m = String(outcode).toUpperCase().match(/^([A-Z]{1,2})/);
  return m ? m[1] : null;
}

function bandFor(returnMiles) {
  return RATES.personalDelivery.bands.find(b => returnMiles <= b.upperMiles) ?? null;
}

/**
 * Within one area, group districts whose codes are prefixes of each other.
 * M1 is a prefix of M19, so {M1, M19} must share a band. M2 is not, so it is
 * free to sit elsewhere.
 */
function prefixClusters(outcodes) {
  const sorted = [...outcodes].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const parent = new Map(sorted.map(c => [c, c]));
  const find = c => (parent.get(c) === c ? c : (parent.set(c, find(parent.get(c))), parent.get(c)));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };

  for (const a of sorted) {
    for (const b of sorted) {
      if (a !== b && b.startsWith(a)) union(a, b);
    }
  }
  const groups = new Map();
  for (const c of sorted) {
    const r = find(c);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  return [...groups.values()];
}

/**
 * One band for a cluster that spans several. The rule is the band of the
 * district with the LOWEST mileage: the customer is never charged for a longer
 * journey than their own postcode implies, and Sultan absorbs the difference
 * on the far edge of the cluster. The cost of that is reported, not hidden.
 */
function collapseCluster(cluster, milesByOutcode) {
  const priced = cluster.map(c => ({ outcode: c, miles: milesByOutcode.get(c), band: bandFor(milesByOutcode.get(c)) }));
  const usable = priced.filter(p => p.band);
  if (usable.length === 0) {
    return { band: null, priced, shortfallPence: 0, unpriced: cluster.slice() };
  }

  const chosen = usable.reduce((lo, p) => (p.band.pence < lo.band.pence ? p : lo));
  const dearest = usable.reduce((hi, p) => (p.band.pence > hi.band.pence ? p : hi));
  return {
    band: chosen.band,
    priced,
    shortfallPence: dearest.band.pence - chosen.band.pence,
    unpriced: priced.filter(p => !p.band).map(p => p.outcode),
  };
}

/**
 * @param {Map<string, number>} milesByOutcode  outcode -> return road miles
 * @returns {{zones: Array, review: Array, unpriced: string[], charCounts: object}}
 */
function buildZones(milesByOutcode) {
  const byArea = new Map();
  for (const outcode of milesByOutcode.keys()) {
    const area = areaOf(outcode);
    if (!area) continue;
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(outcode);
  }

  const entriesByBand = new Map(RATES.personalDelivery.bands.map(b => [b.upperMiles, []]));
  const review = [];
  const unpriced = [];

  /**
   * Eight UK areas are a single letter — B, E, G, L, M, N, S, W — and each is
   * a prefix of several two-letter areas. Shortening London's E districts to a
   * bare "E" would capture EN, EX and EH too, pricing Edinburgh as Hackney.
   * An area may only be written as itself when no other area extends it.
   */
  const allAreas = [...byArea.keys()];
  const collapsible = new Set(
    allAreas.filter(a => !allAreas.some(other => other !== a && other.startsWith(a)))
  );

  for (const [area, outcodes] of [...byArea].sort()) {
    const clusters = prefixClusters(outcodes);
    const resolved = clusters.map(c => ({ cluster: c, ...collapseCluster(c, milesByOutcode) }));

    for (const r of resolved) {
      if (r.unpriced?.length) unpriced.push(...r.unpriced);
      if (r.shortfallPence > 0) {
        review.push({
          kind: 'prefix-collision',
          area,
          outcodes: r.cluster,
          chosenPence: r.band.pence,
          shortfallPence: r.shortfallPence,
          why: `${r.cluster.join(', ')} overlap as prefixes, so Shopify cannot price them separately.`,
        });
      }
    }

    const priceable = resolved.filter(r => r.band);
    const bands = new Set(priceable.map(r => r.band.upperMiles));

    // Whole area in one band, nothing in it unpriced, and the area's own code
    // captures nothing but itself: emit the bare area.
    if (bands.size === 1 && unpricedCount(resolved) === 0 && collapsible.has(area)) {
      entriesByBand.get([...bands][0]).push(area);
      continue;
    }

    // Area straddles: emit each cluster at its own band, and say what it would
    // have cost to flatten the area to one price instead.
    if (bands.size > 1) {
      const cheapest = Math.min(...priceable.map(r => r.band.pence));
      const dearest = Math.max(...priceable.map(r => r.band.pence));
      review.push({
        kind: 'area-straddles',
        area,
        bands: [...bands].sort((a, b) => a - b),
        spreadPence: dearest - cheapest,
        districtCount: outcodes.length,
        why: `Area ${area} spans ${bands.size} bands, so it is listed district by district.`,
      });
    }

    for (const r of priceable) {
      entriesByBand.get(r.band.upperMiles).push(...r.cluster);
    }
  }

  const zones = RATES.personalDelivery.bands.map(b => {
    const codes = (entriesByBand.get(b.upperMiles) ?? []).sort();
    // Shopify's zone field takes complete postcodes, or a prefix followed by
    // an asterisk. A bare outward code is rejected outright — the form refuses
    // to save and the field reads "Required" — so every entry carries one.
    const list = codes.map(c => c + '*').join(', ');
    return {
      upperMiles: b.upperMiles,
      pence: b.pence,
      name: zoneName(b.upperMiles),
      codes,
      list,
      chars: list.length,
      overLimit: list.length > ZONE_CHAR_LIMIT,
    };
  });

  assertDisjoint(zones);

  return { zones, review, unpriced, charLimit: ZONE_CHAR_LIMIT };
}

function unpricedCount(resolved) {
  return resolved.reduce((n, r) => n + (r.unpriced?.length ?? 0), 0);
}

function zoneName(upperMiles) {
  const i = RATES.personalDelivery.bands.findIndex(b => b.upperMiles === upperMiles);
  const lower = i === 0 ? 0 : RATES.personalDelivery.bands[i - 1].upperMiles;
  return i === 0 ? `Up to ${upperMiles} return miles` : `Over ${lower} to ${upperMiles} return miles`;
}

/**
 * Last line of defence. If any code in one zone is a prefix of a code in
 * another, Shopify would silently charge the cheaper of the two, so we refuse
 * to emit the lists at all rather than ship a quiet undercharge.
 */
function assertDisjoint(zones) {
  const all = zones.flatMap(z => z.codes.map(c => ({ code: c, zone: z.upperMiles })));
  const clashes = [];
  for (const a of all) {
    for (const b of all) {
      if (a.zone !== b.zone && b.code.startsWith(a.code)) {
        clashes.push(`${b.code} (≤${b.zone}mi) is captured by ${a.code} (≤${a.zone}mi)`);
      }
    }
  }
  if (clashes.length) {
    const e = new Error(
      'Zone lists overlap by prefix, which Shopify resolves to the cheaper zone:\n  ' + clashes.join('\n  ')
    );
    e.code = 'ZONE_PREFIX_CLASH';
    throw e;
  }
}

module.exports = { buildZones, prefixClusters, collapseCluster, areaOf, bandFor, zoneName, assertDisjoint, ZONE_CHAR_LIMIT };
