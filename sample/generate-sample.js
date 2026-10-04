// Generates a *synthetic* SimBrief OFP (JFK -> ATH, great circle, 9 h) for testing without a SimBrief account.
import { writeFileSync } from "node:fs";
import { interpolateGreatCircle } from "../src/geo.js";

const A = { lat: 40.6398, lon: -73.7789 }, B = { lat: 37.9364, lon: 23.9445 };
const OFF = Date.UTC(2026, 9, 5, 21, 0) / 1000;
const TOTAL = 9 * 3600, N = 14;
const alt = (f) => (f < 0.12 ? f / 0.12 * 36000 : f > 0.9 ? (1 - f) / 0.1 * 36000 : 36000);

const fix = Array.from({ length: N + 1 }, (_, i) => {
  const f = i / N, p = interpolateGreatCircle(A, B, f);
  const ident = i === 0 ? "KJFK" : i === N ? "LGAV" : `WPT${String(i).padStart(2, "0")}`;
  return { ident, via_airway: "DCT", pos_lat: p.lat.toFixed(5), pos_long: p.lon.toFixed(5),
           time_total: String(Math.round(f * TOTAL)), altitude_feet: String(Math.round(alt(f))) };
});

writeFileSync(new URL("./sample-ofp.json", import.meta.url), JSON.stringify({
  ofp: { origin: { icao_code: "KJFK" }, destination: { icao_code: "LGAV" },
         times: { est_off: String(OFF) }, navlog: { fix } },
}, null, 2));
