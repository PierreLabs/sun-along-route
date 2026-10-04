# Sun Along Route

Sunrise, sunset and civil twilight along a **SimBrief** flight plan, shown in **UTC** and in **civil local time of the time zone you are flying over**, with a day/night terminator you can scrub along the flight.

## Run it

```
npm install
npm start        # http://localhost:8080
npm test
```

In the app: type your SimBrief username (it is remembered in your browser), import an OFP `.json` file, or try the synthetic example (`sample/`).

## How it works

- `src/ofp.js`: SimBrief OFP JSON v2 → timestamped points (`est_off`/`sched_off` + `navlog.fix[].time_total`). The departure airport is prepended because the real navlog starts at the first fix after takeoff.
- `src/events.js`: great-circle interpolation, 30 s sampling, bisection on the crossings of −0.833° (sunrise/sunset) and −6° (civil twilight). Also gives ground speed along the interpolated route.
- `src/sun.js`: sun elevation via `astronomy-engine`; the view is always "from the aircraft": the horizon is lowered by 1.76′·√h at the aircraft's altitude.
- `src/tz.js`: civil time zone via `tz-lookup` over land and within 12 NM of a coast; nautical time zone (`Etc/GMT±N`, 15° bands) beyond. Daylight saving handled by `Intl`.
- `src/land.js` + `data/land-50m.json`: land/sea mask (Natural Earth 50 m via `world-atlas`, public domain).
- Takeoff time: the "Takeoff (UTC)" field (or the ±1 h buttons) shifts the whole flight to find the best departure time for a sunrise or sunset; the OFP's durations are kept (no new wind/route computation).
- `src/terminator.js`: subsolar point + shaded area = circle around the antisolar point, with the same threshold as the table (sunrise/sunset as seen from the aircraft's altitude). Time slider under the map; click a table row to jump to that event.

## Known limitations / ideas

- `time_total` is assumed to be seconds since takeoff (consistent with the real OFP checked so far).
- Ground speed shown in the tooltip is measured on the interpolated route (average per segment between waypoints), so it differs slightly from the per-fix values in the OFP and changes in steps at waypoints.
- In enclosed seas (e.g. the Irish Sea) the nautical zone can apply for a few minutes, which makes local time jump back an hour compared with the surrounding coasts.
- Routes crossing the antimeridian are not handled specially on the map.
- Not yet: other input formats (ICAO route string, GPX, FPL).

## License

[MIT](LICENSE). Third-party data and libraries keep their own licenses (see Credits).

## Credits

- Flight plans: [SimBrief](https://www.simbrief.com/) API (unofficial hobby tool, not affiliated with SimBrief).
- Map: [Leaflet](https://leafletjs.com/), tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Sun position: [astronomy-engine](https://github.com/cosinekitty/astronomy). Time zones: [tz-lookup](https://github.com/darkskyapp/tz-lookup-oss). Coastlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain).
