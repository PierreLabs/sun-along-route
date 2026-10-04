import { interpolateGreatCircle, distanceKm } from "./geo.js";
import { sunElevation, horizonDip } from "./sun.js";
import { localTime } from "./tz.js";

// Elevation thresholds of the sun's centre (sunrise/sunset = refraction + semi-diameter).
export const THRESHOLDS = [
  { id: "sun", deg: -0.833, rising: "Sunrise", setting: "Sunset" },
  { id: "civil", deg: -6, rising: "Civil dawn", setting: "Civil dusk" },
];

/** Interpolated position (great circle, constant ground speed per segment) at time ms. */
export function positionAt(route, ms) {
  const pts = route.points;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= ms) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (ms - a.t) / (b.t - a.t)));
  const { lat, lon } = interpolateGreatCircle(a, b, f);
  return { lat, lon, altM: a.altM + f * (b.altM - a.altM), from: a, to: b };
}

/** Ground speed (knots) of the interpolated route at time ms, measured over ±30 s. */
export function groundSpeedKt(route, ms) {
  const t0 = route.points[0].t, t1 = route.points.at(-1).t;
  const a = Math.max(t0, ms - 30000), b = Math.min(t1, ms + 30000);
  if (b <= a) return 0;
  return (distanceKm(positionAt(route, a), positionAt(route, b)) / 1.852) / ((b - a) / 3600000);
}

/**
 * Finds where the sun crosses each threshold along the route.
 * opts.useAircraftAltitude: accounts for the lowered horizon at the aircraft's altitude.
 */
export function findSunEvents(route, { stepSec = 30, useAircraftAltitude = true, thresholds = THRESHOLDS } = {}) {
  const t0 = route.points[0].t, t1 = route.points.at(-1).t;
  const margin = (ms, th) => {
    const p = positionAt(route, ms);
    const dip = useAircraftAltitude ? horizonDip(p.altM) : 0;
    return sunElevation(ms, p.lat, p.lon, 0) - (th.deg - dip);
  };

  const events = [];
  for (const th of thresholds) {
    let prevT = t0, prev = margin(t0, th);
    for (let t = t0 + stepSec * 1000; ; t += stepSec * 1000) {
      const cur_t = Math.min(t, t1);
      const cur = margin(cur_t, th);
      if (prev * cur < 0 || (prev !== 0 && cur === 0)) {
        let a = prevT, b = cur_t, fa = prev;
        for (let i = 0; i < 30; i++) {
          const m = (a + b) / 2, fm = margin(m, th);
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        const ms = Math.round((a + b) / 2);
        events.push(buildEvent(route, th, ms, cur > prev));
      }
      if (cur_t >= t1) break;
      prevT = cur_t; prev = cur;
    }
  }
  return events.sort((x, y) => x.ms - y.ms);
}

function buildEvent(route, th, ms, rising) {
  const p = positionAt(route, ms);
  return {
    type: th.id,
    rising,
    label: rising ? th.rising : th.setting,
    ms,
    utc: new Date(ms).toISOString().slice(11, 16) + "Z",
    utcDate: new Date(ms).toISOString().slice(0, 10),
    lat: p.lat, lon: p.lon, altFt: Math.round(p.altM / 0.3048),
    between: [p.from.ident, p.to.ident],
    local: localTime(ms, p.lat, p.lon),
  };
}
