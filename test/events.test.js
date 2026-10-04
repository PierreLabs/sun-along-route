import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOfp } from "../src/ofp.js";
import { findSunEvents, positionAt } from "../src/events.js";
import { sunElevation } from "../src/sun.js";
import { zoneAt, localTime } from "../src/tz.js";

const sample = JSON.parse(readFileSync(new URL("../sample/sample-ofp.json", import.meta.url)));

test("parseOfp reads the points and timestamps them from takeoff", () => {
  const r = parseOfp(sample);
  assert.equal(r.origin, "KJFK");
  assert.equal(r.points.length, 15);
  assert.equal(r.points[0].t, r.offMs);
});

test("positionAt interpolates between two fixes", () => {
  const r = parseOfp(sample);
  const mid = (r.points[0].t + r.points[1].t) / 2;
  const p = positionAt(r, mid);
  assert.ok(p.lat > r.points[0].lat && p.lat < r.points[1].lat + 1);
});

test("sun elevation: solar noon at the equator/prime meridian on the equinox ≈ 90°", () => {
  const e = sunElevation(Date.UTC(2026, 2, 20, 12, 0), 0, 0);
  assert.ok(e > 85, `elevation ${e}`);
});

test("civil time zones: Paris, New York, Atlantic Ocean", () => {
  assert.equal(zoneAt(48.85, 2.35), "Europe/Paris");
  assert.equal(zoneAt(40.64, -73.78), "America/New_York");
  assert.match(zoneAt(50, -30), /^Etc\/GMT/);
  const l = localTime(Date.UTC(2026, 9, 5, 12, 0), 48.85, 2.35);
  assert.equal(l.time, "14:00"); // CEST en octobre
  assert.equal(l.offset, "UTC+2");
});

test("JFK->ATH overnight: sunset then sunrise detected, in order, with consistent elevation", () => {
  const ev = findSunEvents(parseOfp(sample), { useAircraftAltitude: false });
  const labels = ev.map((e) => e.label);
  assert.ok(labels.includes("Sunset"), labels.join(" | "));
  assert.ok(labels.includes("Sunrise"), labels.join(" | "));
  const sunset = ev.find((e) => e.label === "Sunset");
  const sunrise = ev.find((e) => e.label === "Sunrise");
  assert.ok(sunset.ms < sunrise.ms);
  // at the detected instant, the elevation must be -0.833° (without horizon dip)
  assert.ok(Math.abs(sunElevation(sunset.ms, sunset.lat, sunset.lon) + 0.833) < 0.05);
  assert.ok(Math.abs(sunElevation(sunrise.ms, sunrise.lat, sunrise.lon) + 0.833) < 0.05);
});

test("altitude delays sunset and advances sunrise (lowered horizon)", () => {
  const r = parseOfp(sample);
  const ground = findSunEvents(r, { useAircraftAltitude: false }), alt = findSunEvents(r);
  const pick = (ev, l) => ev.find((e) => e.label === l);
  assert.ok(pick(alt, "Sunset").ms >= pick(ground, "Sunset").ms);
  assert.ok(pick(alt, "Sunrise").ms <= pick(ground, "Sunrise").ms);
});

test("parseOfp adds the departure airport when the navlog starts after takeoff", () => {
  const ofp = structuredClone(sample.ofp);
  ofp.origin = { icao_code: "KJFK", pos_lat: "40.6398", pos_long: "-73.7789", elevation: "13" };
  ofp.navlog.fix = ofp.navlog.fix.slice(1).map((f) => ({ ...f, time_total: String(Number(f.time_total) + 60) }));
  const r = parseOfp(ofp); // without the "ofp" wrapper
  assert.equal(r.points[0].ident, "KJFK");
  assert.equal(r.points[0].t, r.offMs);
  assert.ok(r.points[1].t > r.offMs);
});

test("ground speed: consistent with distance/time over a segment", async () => {
  const { groundSpeedKt } = await import("../src/events.js");
  const { distanceKm } = await import("../src/geo.js");
  const r = parseOfp(sample);
  const [a, b] = [r.points[5], r.points[6]];
  const expected = distanceKm(a, b) / 1.852 / ((b.t - a.t) / 3600000);
  const mid = (a.t + b.t) / 2;
  assert.ok(Math.abs(groundSpeedKt(r, mid) - expected) < 1, `${groundSpeedKt(r, mid)} vs ${expected}`);
  assert.ok(expected > 400 && expected < 700); // order of magnitude of an airliner
});
