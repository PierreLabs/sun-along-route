import { feature } from "topojson-client";

const KM_PER_DEG = 111.195;
const RAD = Math.PI / 180;

/**
 * Land/sea mask built from the Natural Earth TopoJSON (world-atlas, land-50m).
 * Returns isNearLand(lat, lon, radiusKm): true if the point is on land
 * or within radiusKm of a coast.
 */
export function buildLandMask(topology) {
  const geo = feature(topology, topology.objects.land);
  const geom = geo.features?.[0]?.geometry ?? geo.geometry;
  const polys = geom.coordinates.map((poly) => {
    const ring = poly[0]; // outer ring only (holes = lakes, always close to land)
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { ring, minLon, maxLon, minLat, maxLat };
  });
  const cache = new Map();

  return function isNearLand(lat, lon, radiusKm = 22.224) {
    const key = `${Math.round(lat * 50)},${Math.round(lon * 50)},${radiusKm}`;
    let res = cache.get(key);
    if (res === undefined) {
      res = compute(lat, lon, radiusKm);
      cache.set(key, res);
    }
    return res;
  };

  function compute(lat, lon, radiusKm) {
    const rLat = radiusKm / KM_PER_DEG;
    const cosLat = Math.max(Math.cos(lat * RAD), 0.05);
    const rLon = rLat / cosLat;
    for (const p of polys) {
      if (lat < p.minLat - rLat || lat > p.maxLat + rLat || lon < p.minLon - rLon || lon > p.maxLon + rLon) continue;
      if (pointInRing(lat, lon, p.ring) || minEdgeDistanceDeg(lat, lon, p.ring, cosLat) < rLat) return true;
    }
    return false;
  }
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Minimum distance (in degrees of latitude) from the point to the edges, in a local equirectangular plane. */
function minEdgeDistanceDeg(lat, lon, ring, cosLat) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1][0] - lon) * cosLat, ay = ring[i - 1][1] - lat;
    const bx = (ring[i][0] - lon) * cosLat, by = ring[i][1] - lat;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}
