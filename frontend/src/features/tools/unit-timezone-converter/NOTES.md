# Unit & Timezone Converter: gaps and decisions

- Implemented: Smart natural-language search (`"5 km in miles"`, `"10 GB to GiB"`, `"5 ft 3 in to cm"`, `"3pm IST to PST"`), all 11 unit categories (length, mass, volume, temperature, area, speed, time, data SI & IEC, energy, pressure, fuel economy), variant & ambiguous-abbreviation choosers (never silently guessing `IST`/`CST`/`BST`/`EST`/`PST`), locale number disambiguation (`1,500`), DST spring-forward gap & fall-back overlap handling, fractional offsets (`Asia/Kathmandu` +05:45), live world clock, 48-slot meeting planner overlap finder, and `#q=` share links.
- **City database:** `zones-data.ts` bundles a curated mapping of ~100 major world cities and abbreviations in addition to `Intl.supportedValuesOf('timeZone')` (about 4 KB rather than a 100 KB full geonames table).
- **Meeting planner controls:** Working hours are fixed to 09:00–17:00 across zones; hover/title tooltips and the overlap summary pill convey exact hours alongside the colored blocks. `.ics` export is deferred.
- **Currency:** intentionally excluded per owner scope decision (2026-11-19).
