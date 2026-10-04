import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLandMask } from "../src/land.js";
import { setLandMask, zoneAt, nauticalZone, localTime } from "../src/tz.js";

const mask = buildLandMask(JSON.parse(readFileSync(new URL("../data/land-50m.json", import.meta.url))));
setLandMask(mask);

test("nautical time zones: 15° bands, inverted IANA sign", () => {
  assert.equal(nauticalZone(0), "Etc/GMT");
  assert.equal(nauticalZone(-47), "Etc/GMT+3");
  assert.equal(nauticalZone(-37.4), "Etc/GMT+2");
  assert.equal(nauticalZone(-37.6), "Etc/GMT+3");
  assert.equal(nauticalZone(100), "Etc/GMT-7");
  assert.equal(nauticalZone(179), "Etc/GMT-12");
});

test("land/sea mask", () => {
  assert.equal(mask(48.85, 2.35), true); // Paris
  assert.equal(mask(51.0, 1.4, 22.2), true); // Strait of Dover, within 12 nm of the coasts
  assert.equal(mask(58.6, -52.4, 22.2), false); // Labrador Sea, south of Greenland
  assert.equal(mask(50, -30, 22.2), false); // North Atlantic
  assert.equal(mask(64.1, -21.9, 22.2), true); // Reykjavik (island)
});

test("at sea: nautical time zone; on land or near coasts: civil time zone", () => {
  assert.equal(zoneAt(58.6, -52.4), "Etc/GMT+3"); // no more “Godthab” in the open sea
  assert.equal(zoneAt(50, -30), "Etc/GMT+2");
  assert.equal(zoneAt(48.85, 2.35), "Europe/Paris");
  assert.equal(zoneAt(47.45, -122.31), "America/Los_Angeles"); // KSEA
  assert.ok(!zoneAt(51.0, 1.4).startsWith("Etc/")); // Strait of Dover: land within 12 nm, civil time zone
  const l = localTime(Date.UTC(2026, 9, 4, 16, 0), 58.6, -52.4);
  assert.equal(l.time, "13:00");
  assert.equal(l.offset, "UTC-3");
});
