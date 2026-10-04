import { parseOfp, shiftRoute } from "./src/ofp.js";
import { findSunEvents, positionAt, groundSpeedKt, THRESHOLDS } from "./src/events.js";
import { horizonDip } from "./src/sun.js";
import { bearing } from "./src/geo.js";
import { nightRings } from "./src/terminator.js";
import { localTime, setLandMask } from "./src/tz.js";
import { buildLandMask } from "./src/land.js";

const $ = (id) => document.getElementById(id);
let map, layer, dynLayer, twilight, night, plane, baseRoute, lastRoute, lastEvents = [], pendingMs = null;

// Land/sea mask (nautical time zone beyond territorial waters): loaded once at startup.
const landReady = fetch("data/land-50m.json")
  .then((r) => r.json())
  .then((topo) => setLandMask(buildLandMask(topo)))
  .catch(() => status("Land/sea mask unavailable: civil time zones only (including at sea).", true));

// SimBrief username remembered in the browser (storage may be unavailable: private browsing, etc.).
const USER_KEY = "sun-along-route:simbrief-username";
const savedUser = () => { try { return localStorage.getItem(USER_KEY) ?? ""; } catch { return ""; } };
const saveUser = (u) => { try { localStorage.setItem(USER_KEY, u); } catch { /* not important */ } };
$("username").value = savedUser();

function status(msg, err = false) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", err); }

function render({ refit = true, elapsedMs = 0 } = {}) {
  if (!lastRoute) return;
  const events = findSunEvents(lastRoute);
  $("result").hidden = false;
  $("title").textContent = `${lastRoute.origin} → ${lastRoute.destination} — takeoff ${new Date(lastRoute.offMs).toISOString().slice(0, 16).replace("T", " ")}Z`;
  $("none").hidden = events.length > 0;

  $("rows").innerHTML = events.map((e) => `
    <tr data-ms="${e.ms}" title="Show the terminator at this time">
      <td>${e.rising ? "🌅" : "🌇"} ${e.label}</td>
      <td class="utc">${e.utc}<small>${e.utcDate}</small></td>
      <td class="local">${e.local.time}<small>${e.local.date} · ${e.local.offset}</small></td>
      <td>${e.local.zone}</td>
      <td>${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}<small>between ${e.between.join(" and ")}</small></td>
      <td>FL${String(Math.round(e.altFt / 100)).padStart(3, "0")}</td>
    </tr>`).join("");

  if (!map) {
    map = L.map("map", { minZoom: 2, maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", noWrap: true }).addTo(map);
  }
  layer?.remove();
  layer = L.layerGroup().addTo(map);
  const line = L.polyline(lastRoute.points.map((p) => [p.lat, p.lon]), { color: "#d9730d", weight: 3 }).addTo(layer);
  events.forEach((e) => L.circleMarker([e.lat, e.lon], { radius: 6, color: e.rising ? "#e0a400" : "#7a3ea1", fillOpacity: 0.9 })
    .bindTooltip(`${e.label}<br>${e.utc} UTC · ${e.local.time} (${e.local.offset})`).addTo(layer));
  if (refit) map.fitBounds(line.getBounds(), { padding: [20, 20] });

  // Dynamic objects are created once and then updated (no re-creation on every slider move).
  dynLayer?.remove();
  dynLayer = L.layerGroup().addTo(map);
  // Two stacked shades: civil twilight (light) and night (darker, on top of the twilight shade).
  const shade = (opacity) => L.polygon([], { stroke: false, fillColor: "#0a1030", fillOpacity: opacity, interactive: false }).addTo(dynLayer);
  twilight = shade(0.22);
  night = shade(0.26);
  plane = L.marker([0, 0], {
    icon: L.divIcon({
      className: "plane-icon", iconSize: [26, 26], iconAnchor: [13, 13],
      html: '<div class="plane"><svg viewBox="0 0 26 26"><polygon points="13,2 23,23 3,23"/></svg></div>',
    }),
    interactive: false, keyboard: false, zIndexOffset: 1000,
  }).bindTooltip("", { permanent: true, direction: "top", offset: [0, -14] }).addTo(dynLayer);

  lastEvents = events;
  const t0 = lastRoute.points[0].t, t1 = lastRoute.points.at(-1).t;
  const slider = $("time");
  slider.min = t0; slider.max = t1; slider.step = 60000;
  slider.value = Math.min(t1, t0 + elapsedMs); // same elapsed flight time after a takeoff shift
  drawAt(Number(slider.value));
}

/** Aircraft heading at time ms (towards the position 30 s ahead, or reversed at the end of the flight). */
function headingAt(ms, p) {
  const t1 = lastRoute.points.at(-1).t;
  if (ms + 30000 <= t1) return bearing(p, positionAt(lastRoute, ms + 30000));
  return bearing(positionAt(lastRoute, ms - 30000), p);
}

/** Day/night terminator + aircraft position at time ms. */
function drawNow(ms) {
  const p = positionAt(lastRoute, ms);
  // Same thresholds as the table events (sunrise/sunset and civil dawn/dusk), as seen from the aircraft's altitude.
  const dip = horizonDip(p.altM);
  twilight.setLatLngs(nightRings(ms, THRESHOLDS[0].deg - dip).map((ring) => [ring]));
  night.setLatLngs(nightRings(ms, THRESHOLDS[1].deg - dip).map((ring) => [ring]));
  const loc = localTime(ms, p.lat, p.lon);
  plane.setLatLng([p.lat, p.lon]);
  const el = plane.getElement()?.firstChild;
  if (el) el.style.transform = `rotate(${headingAt(ms, p).toFixed(1)}deg)`;
  const zulu = new Date(ms).toISOString().slice(11, 16);
  plane.setTooltipContent(`${zulu}Z · ${loc.time} local (${loc.offset})<br>GS ${Math.round(groundSpeedKt(lastRoute, ms))} kt · FL${String(Math.round(p.altM / 0.3048 / 100)).padStart(3, "0")}`);
  $("time-label").textContent = `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}Z · ${loc.time} local (${loc.offset}) · ${loc.zone}`;
}

/** At most one redraw per frame, always using the latest slider value. */
function drawAt(ms) {
  if (pendingMs === null) requestAnimationFrame(() => { const m = pendingMs; pendingMs = null; drawNow(m); });
  pendingMs = ms;
}

/** Elapsed flight time currently shown by the slider. */
const currentElapsed = () => (lastRoute ? Math.max(0, Number($("time").value) - lastRoute.points[0].t) : 0);

/** Shifts the whole flight so that takeoff is at offMs (UTC) and refreshes everything. */
function setTakeoff(offMs, { refit = false } = {}) {
  const elapsedMs = refit ? 0 : currentElapsed();
  lastRoute = shiftRoute(baseRoute, offMs);
  $("off-input").value = new Date(offMs).toISOString().slice(0, 16);
  render({ refit, elapsedMs });
}

async function load(json) {
  await landReady;
  try {
    baseRoute = parseOfp(json);
    status(`${baseRoute.points.length} route points loaded.`);
    setTakeoff(baseRoute.offMs, { refit: true });
    return true;
  } catch (err) {
    status(err.message, true);
    return false;
  }
}

$("fetch-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const user = $("username").value.trim();
  if (!user) return;
  status("Loading from SimBrief…");
  try {
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(user)}&json=1`);
    if (res.status === 400) { status(`Unknown SimBrief username, or no OFP available for “${user}”.`, true); return; }
    if (!res.ok) throw new Error(`SimBrief replied ${res.status}`);
    if (await load(await res.json())) saveUser(user);
  } catch (err) {
    status(`Could not reach SimBrief from the browser (${err.message}). Import the OFP .json file instead.`, true);
  }
});

$("file").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (f) try { load(JSON.parse(await f.text())); } catch { status("Invalid JSON file.", true); }
});

$("sample").addEventListener("click", async () => load(await (await fetch("sample/sample-ofp.json")).json()));

$("off-input").addEventListener("change", (ev) => {
  const ms = Date.parse(`${ev.target.value}:00Z`); // the field is in UTC
  if (Number.isFinite(ms) && baseRoute) setTakeoff(ms);
});
$("off-minus").addEventListener("click", () => baseRoute && setTakeoff(lastRoute.offMs - 3600000));
$("off-plus").addEventListener("click", () => baseRoute && setTakeoff(lastRoute.offMs + 3600000));
$("off-reset").addEventListener("click", () => baseRoute && setTakeoff(baseRoute.offMs));

$("time").addEventListener("input", (ev) => drawAt(Number(ev.target.value)));
$("rows").addEventListener("click", (ev) => {
  const tr = ev.target.closest("tr[data-ms]");
  if (!tr) return;
  $("time").value = tr.dataset.ms;
  drawAt(Number(tr.dataset.ms));
});
