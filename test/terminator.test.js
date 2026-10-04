import test from "node:test";
import assert from "node:assert/strict";
import { subsolarPoint, nightRings } from "../src/terminator.js";
import { sunElevation } from "../src/sun.js";

test("the subsolar point has the sun at the zenith", () => {
  const ms = Date.UTC(2026, 9, 5, 15, 0);
  const p = subsolarPoint(ms);
  assert.ok(sunElevation(ms, p.lat, p.lon) > 89.9);
  assert.ok(Math.abs(p.lat) < 23.5);
});

// Several seasons: circle enclosing a pole (solstices) or not (equinoxes).
for (const [label, date] of [["March equinox", [2026, 2, 20, 9]], ["June solstice", [2026, 5, 21, 3]],
  ["October", [2026, 9, 4, 12]], ["December solstice", [2026, 11, 21, 18]]]) {
  for (const h of [0, -0.833, -3.7]) {
    test(`${label}, threshold ${h}°: every boundary point has an elevation ≈ threshold`, () => {
      const ms = Date.UTC(...date);
      const rings = nightRings(ms, h);
      let n = 0;
      for (const ring of rings) {
        for (const [lat, lon] of ring) {
          if (Math.abs(lat) === 90) continue; // closing corners at the pole
          assert.ok(Math.abs(sunElevation(ms, lat, ((lon + 180) % 360 + 360) % 360 - 180) - h) < 0.06, `${lat},${lon}`);
          n++;
        }
      }
      assert.ok(n > 300);
    });
  }
}

test("in October (southern declination) the night encloses the north pole: boundary far north under the sun", () => {
  const ms = Date.UTC(2026, 9, 4, 12);
  const sun = subsolarPoint(ms);
  const [ring] = nightRings(ms, -3.7);
  const [lat] = ring.filter(([la]) => Math.abs(la) < 90).reduce((best, p) => (Math.abs(p[1] - sun.lon) < Math.abs(best[1] - sun.lon) ? p : best));
  assert.ok(lat > 80, String(lat));
});
