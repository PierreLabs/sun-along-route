import tzlookup from "tz-lookup";

/** Territorial waters: 12 nautical miles. Beyond that, the nautical time zone applies. */
export const TERRITORIAL_WATERS_KM = 22.224;

let isNearLand = null;

/** Plugs in a land/sea mask (see land.js). Without a mask, tz-lookup decides alone, including at sea. */
export function setLandMask(fn) {
  isNearLand = fn;
}

const wrapLon = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

/** Nautical time zone: 15° bands centred on multiples of 15° (Etc/GMT±N, sign inverted in IANA). */
export function nauticalZone(lon) {
  const n = Math.round(wrapLon(lon) / 15);
  return n === 0 ? "Etc/GMT" : `Etc/GMT${n > 0 ? "-" : "+"}${Math.abs(n)}`;
}

/** Civil (IANA) time zone being flown over; nautical time zone beyond territorial waters. */
export function zoneAt(lat, lon) {
  lon = wrapLon(lon);
  if (isNearLand && !isNearLand(lat, lon, TERRITORIAL_WATERS_KM)) return nauticalZone(lon);
  try {
    return tzlookup(lat, lon);
  } catch {
    return nauticalZone(lon);
  }
}

/** Local time at the given point, e.g. { zone, time: "19:42", offset: "UTC+2", date: "2026-10-05" }. */
export function localTime(ms, lat, lon, locale = "en-GB") {
  const zone = zoneAt(lat, lon);
  const d = new Date(ms);
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: zone, ...opts }).format(d);
  const offsetPart = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return {
    zone,
    time: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    date: new Intl.DateTimeFormat("en-CA", { timeZone: zone, day: "2-digit", month: "2-digit", year: "numeric" }).format(d), // ISO style: 2026-10-05
    offset: (offsetPart ?? "").replace("GMT", "UTC") || "UTC",
  };
}
