const RAD = Math.PI / 180;

function toVec(lat, lon) {
  const la = lat * RAD, lo = lon * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function toLatLon([x, y, z]) {
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

/** Point at fraction f (0..1) along the great circle a -> b. */
export function interpolateGreatCircle(a, b, f) {
  const va = toVec(a.lat, a.lon), vb = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return { lat: a.lat, lon: a.lon };
  const s = Math.sin(omega);
  const k1 = Math.sin((1 - f) * omega) / s, k2 = Math.sin(f * omega) / s;
  return toLatLon([0, 1, 2].map((i) => k1 * va[i] + k2 * vb[i]));
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/** Initial bearing (degrees, 0 = north, clockwise) of the great circle a -> b. */
export function bearing(a, b) {
  const la1 = a.lat * RAD, la2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}
