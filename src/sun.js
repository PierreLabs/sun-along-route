import * as Astronomy from "astronomy-engine";

/** Geometric elevation of the sun's centre (degrees), without refraction. */
export function sunElevation(ms, lat, lon, altM = 0) {
  const date = new Date(ms);
  const obs = new Astronomy.Observer(lat, lon, altM);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, obs, true, true);
  return Astronomy.Horizon(date, obs, eq.ra, eq.dec, null).altitude;
}

/** Horizon dip (degrees) seen from a given altitude. */
export function horizonDip(altM) {
  return (1.76 / 60) * Math.sqrt(Math.max(0, altM));
}
