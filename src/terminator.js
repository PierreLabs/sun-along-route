import * as Astronomy from "astronomy-engine";

const RAD = Math.PI / 180;
const wrapLon = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

/** Subsolar point (lat = declination, lon = negated Greenwich hour angle). */
export function subsolarPoint(ms) {
  const date = new Date(ms);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, new Astronomy.Observer(0, 0, 0), true, true);
  return { lat: eq.dec, lon: wrapLon((eq.ra - Astronomy.SiderealTime(date)) * 15) };
}

/** Point at angular distance rho (°) and bearing theta (°) from (lat0, lon0). */
function destination(lat0, lon0, rho, theta) {
  const p0 = lat0 * RAD, r = rho * RAD, t = theta * RAD;
  const lat = Math.asin(Math.sin(p0) * Math.cos(r) + Math.cos(p0) * Math.sin(r) * Math.cos(t));
  const lon = lon0 * RAD + Math.atan2(Math.sin(t) * Math.sin(r) * Math.cos(p0), Math.cos(r) - Math.sin(p0) * Math.sin(lat));
  return [lat / RAD, lon / RAD];
}

/**
 * Area where the sun's geometric elevation is < thresholdDeg (negative: sun below the horizon),
 * for a flat -180..180 map. It is a circle of radius (90 + thresholdDeg)° around the antisolar point.
 * Returns a list of [lat, lon][] rings, each to be drawn as a polygon.
 */
export function nightRings(ms, thresholdDeg = 0) {
  const sun = subsolarPoint(ms);
  const lat0 = -sun.lat, lon0 = wrapLon(sun.lon + 180);
  const rho = 90 + thresholdDeg;
  const N = 720;
  const raw = Array.from({ length: N }, (_, i) => destination(lat0, lon0, rho, (i * 360) / N));

  if (Math.abs(lat0) + rho > 90) {
    // The circle encloses a pole: the boundary is a function of longitude, closed by that pole.
    const pts = raw.map(([lat, lon]) => [lat, wrapLon(lon)]).sort((a, b) => a[1] - b[1]);
    // Keep the raw points (evenly spaced along the circle, hence fine where the curve is steep)
    // and compute the boundary latitude exactly on the -180° and +180° meridians.
    const edge = (lon) => {
      const d = (lon - lon0) * RAD, A = Math.sin(lat0 * RAD), B = Math.cos(lat0 * RAD) * Math.cos(d);
      const psi = Math.atan2(B, A), x = Math.cos(rho * RAD) / Math.hypot(A, B);
      for (const base of [Math.asin(x), Math.PI - Math.asin(x)]) {
        let phi = base - psi;
        phi = ((phi + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        if (Math.abs(phi) <= Math.PI / 2 + 1e-9) return [phi / RAD, lon];
      }
      return [lat0 >= 0 ? 90 : -90, lon];
    };
    const ring = [edge(-180), ...pts, edge(180)];
    const pole = lat0 >= 0 ? 90 : -90;
    return [[...ring, [pole, 180], [pole, -180]]];
  }

  // Circle without a pole: unwrap the longitudes and duplicate at ±360° (the map only shows -180..180).
  const ring = [];
  let prev = raw[0][1];
  for (const [lat, lon] of raw) {
    prev += wrapLon(lon - prev);
    ring.push([lat, prev]);
  }
  return [0, 360, -360].map((d) => ring.map(([lat, lon]) => [lat, lon + d]));
}
