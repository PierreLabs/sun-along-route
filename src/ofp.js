const FT_TO_M = 0.3048;

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/**
 * Converts a SimBrief OFP (JSON v2) into a timestamped route.
 * Assumes navlog.fix[].time_total = seconds elapsed since takeoff.
 */
/** Same route with the whole flight shifted so that takeoff happens at newOffMs (durations unchanged). */
export function shiftRoute(route, newOffMs) {
  const delta = newOffMs - route.offMs;
  return { ...route, offMs: newOffMs, points: route.points.map((p) => ({ ...p, t: p.t + delta })) };
}

export function parseOfp(json) {
  const ofp = json.ofp ?? json; // the export sometimes holds the fields at the top level
  const fixes = asArray(ofp.navlog?.fix);
  if (fixes.length < 2) throw new Error("No usable navlog in this SimBrief OFP");

  const times = ofp.times ?? {};
  const offSec = Number(times.est_off ?? times.sched_off);
  if (!Number.isFinite(offSec)) throw new Error("Takeoff time (est_off/sched_off) missing from the OFP");
  const offMs = offSec * 1000;

  const points = fixes.map((f) => ({
    ident: f.ident,
    airway: f.via_airway && f.via_airway !== "DCT" ? f.via_airway : null,
    lat: Number(f.pos_lat),
    lon: Number(f.pos_long),
    t: offMs + Number(f.time_total) * 1000,
    altM: Number(f.altitude_feet ?? 0) * FT_TO_M,
  }));

  // Keep chronological order and drop points without coordinates.
  const route = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t));

  // The real navlog starts at the first fix after takeoff: add the departure airport.
  const o = ofp.origin;
  if (o && route[0].ident !== o.icao_code && Number.isFinite(Number(o.pos_lat)) && Number.isFinite(Number(o.pos_long))) {
    route.unshift({
      ident: o.icao_code, airway: null, lat: Number(o.pos_lat), lon: Number(o.pos_long),
      t: offMs, altM: Number(o.elevation ?? 0) * FT_TO_M,
    });
  }
  return {
    origin: ofp.origin?.icao_code ?? route[0].ident,
    destination: ofp.destination?.icao_code ?? route.at(-1).ident,
    offMs,
    points: route,
  };
}
