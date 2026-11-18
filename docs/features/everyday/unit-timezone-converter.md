---
id: F-025
slug: unit-timezone-converter
title: Unit & Timezone Converter
category: everyday
tier: client
priority: P1
status: planned
depends_on: []
---

# Unit & Timezone Converter

## 1. Summary
One smart search bar converts units ("5 km in miles", "10 GB to MB") and times ("3pm IST to PST"), with a classic form view as a fallback. Includes a world clock, a meeting planner, and shareable links. Runs offline with no network.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Remote worker | Schedules a call across Dhaka, London, New York | Overlap view of working hours, a link to share |
| Cook / traveler | Recipe in cups, oven in Fahrenheit | Instant conversions with sensible rounding |
| IT admin | Disk says 500 GB, OS shows 465 GiB | Clear decimal (GB) vs binary (GiB) explanation |
| Engineer | Mixes psi, bar, kPa; L/100km vs mpg | Exact conversions with precision control |
| Student (non-obvious) | Asks "when is 9am in Tokyo during DST next March?" | Date-specific conversion using that date's rules |

## 3. User flow
1. Empty state: large search bar with rotating examples, category chips (Length, Mass, ... Time zones), and "Try an example".
2. User types a query. Parsed live (debounce 150 ms). Result card shows the answer, a chip showing how it was understood ("5 kilometers to miles"), and other common units below.
3. Ambiguous input (e.g. "IST") shows a disambiguation chooser before showing a result.
4. Category view: two `NumberField` + unit selects with a swap button, plus a table of all units for the value.
5. Time zone view: base time + zone, a list of target zones, date picker, 12/24 h toggle. Add zones by city or IANA name search. Meeting planner: horizontal 24 h strips per zone, working hours shaded, draggable cursor.
6. Done state: Copy result, Copy link (settings and query in the hash), Swap, Reset.

## 4. Inputs and outputs
- **Inputs:** free text query; numbers with locale separators, fractions ("1/2"), scientific ("1e6"); dates ISO or picker; zone names, city names, IANA IDs, offsets ("UTC+5:30").
- **Categories:** length, mass, volume (metric, US, imperial), temperature (C, F, K, R), area, speed, time, data storage, energy, pressure, fuel economy.
- **Outputs:** converted value with unit symbol, optional formula text, full table, shareable URL `#q=5km+in+miles` or `#t=2026-03-08T15:00&from=Asia/Kolkata&to=America/Los_Angeles`. No file outputs, except optional "Copy as table".

## 5. Components and tech
- **UI (shared):** `ToolShell`, `Tabs`, `SegmentedControl`, `NumberField`, `SettingsPanel`, `CopyButton`, `EmptyState`, `Toast`, `ErrorBanner`, `HelpPopover`, `Tooltip`.
- **New:** `SmartSearchBar` (combobox with parse chips and suggestions), `UnitTable`, `ZonePicker` (searchable IANA list), `WorldClockList`, `MeetingPlannerGrid`.
- **Tech:** own unit tables with base-unit factors (BigInt/decimal-safe rounding via a small decimal helper, or `decimal.js`, verify). Time via `Intl.DateTimeFormat` with `timeZone` and `timeZoneName`; offsets computed from Intl `formatToParts`; Temporal only if shipped in all target browsers (verify; assume not, use `Intl` plus a tiny helper). City list: bundled static JSON of major cities to IANA IDs (about 100 KB, verify source license). No network.
- **Where it runs:** main thread; pure functions with unit tests.

## 6. Behavior rules
- Parser grammar: `<number> <unit> (to|in|as|->) <unit>`; time: `<time> <zone> (to|in) <zone>[, <zone>...]`. Tolerates plurals, case, symbols (`°C`, `km/h`, `kph`), aliases ("kilometre", "kms", "lbs"), and common typos via fuzzy match; always shows what it understood and offers alternatives.
- Temperature uses offset formulas, not factors. Temperature differences ("a change of 10 C") are a separate hint, not auto-guessed.
- Data storage: SI (kB, MB, GB, 1000-based) and IEC (KiB, MiB, GiB, 1024-based) are separate, labeled units. "GB" always means 10^9; "GiB" 2^30. A note appears when the user converts between families.
- Time zones: IANA IDs are the source of truth. Offset math uses the rules for the chosen date, so past and future dates may differ from today (DST changes, law changes; tz data is the browser's, so very old or future dates are as accurate as the browser's database, verify).
- Ambiguous abbreviations (IST = India, Ireland, Israel; CST = US Central, China, Cuba; BST = British Summer, Bangladesh; EST = US Eastern, Australian Eastern; PST = US Pacific, Philippine; abbreviations are not IANA IDs, so any of them needs a mapping table) are never silently picked. Chooser lists candidates with city and current offset; the last choice is remembered per abbreviation (localStorage, can reset).
- Nonexistent local times (spring-forward gap) show a warning and the shifted time; repeated times (fall-back) ask which occurrence (earlier/later offset).
- Numbers formatted with `Intl.NumberFormat` in the user locale (option to force "." or ","). Precision control: auto (up to 6 significant digits), fixed decimals 0 to 12. Values below 1e-6 or above 1e12 switch to scientific notation (toggle).
- Fuel economy: L/100km and mpg (US and Imperial) are inverse; 0 input shows an error, not infinity.
- Settings remembered: precision, notation, 12/24 h, saved zones for world clock. Queries are not stored.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Examples and category chips |
| Unknown unit ("5 blorps to km") | "Unknown unit" with closest suggestions |
| Incompatible categories ("5 kg to km") | Clear message "kg is mass, km is length"; suggest same-category units |
| Negative values | Allowed (temperature, energy, signed lengths); a warning only for negative area or volume |
| Units with several definitions (cup, pint, gallon, fl oz, ton, mpg, "mil") | Variant chooser: US, imperial, metric cup; short, long, metric ton; the chosen variant is shown in the interpretation chip |
| Offline | Fully works; all data bundled; shared links open offline once the app is cached |
| Huge or tiny numbers (1e300, 1e-30) | Scientific notation; overflow to Infinity shows "too large" |
| Floating-point noise (0.1 + conversions) | Rounded display; full precision on "Copy exact" |
| "5 ft 3 in to cm" compound input | Parsed as 5 ft + 3 in; supported for length and mass (lb oz) |
| Locale decimals ("1,5 km" vs "1,500 km") | Uses user locale; if ambiguous, shows both interpretations with a chooser |
| Absolute zero (-500 C) | Error: below absolute zero |
| GB vs GiB confusion | Both shown side by side with explanatory note |
| IST/CST/BST abbreviation | Disambiguation chooser (see rules) |
| Half-hour/45-minute zones (India +5:30, Nepal +5:45) | Displayed with full offset, correct minute math |
| DST gap / overlap times | Warning and occurrence chooser |
| Dates far in past or future | Uses browser tz database; note "rules may change" for future dates |
| Zones that dropped DST or changed offset (e.g. historical changes) | Date-specific offset shown; verified in tests against known cases |
| Unsupported `Intl` zone or old browser | Feature-detect `Intl.supportedValuesOf('timeZone')`; fall back to bundled zone list and offsets-only mode with notice |
| Invalid date ("Feb 30") | Error naming the invalid part |
| RTL/Unicode input (Arabic-Indic digits, "٥ كم") | Digits normalized; unit aliases in English only in v1, others show "unknown unit" |
| Shared link with bad hash | Ignored with a toast; defaults load |
| Meeting planner with 8+ zones | Scroll horizontally; first 6 shown on mobile with "more" |
| User's device clock/zone wrong | "Now" uses device time; banner shows the detected zone so mistakes are visible |

## 8. Limits, performance, privacy
- Parse and convert under 20 ms. Up to 20 zones in the world clock; ticks once per second only while visible (pause when tab hidden; recompute from `Date.now()` on return, since hidden-tab timers are throttled).
- Network: none. Unit and city data are bundled.
- Stored locally: settings, saved zones, abbreviation choices.

## 9. Accessibility and mobile
- Search bar is an ARIA combobox; the interpreted query and result are in an `aria-live="polite"` region. Disambiguation chooser is a labeled radio group.
- Meeting planner has a keyboard alternative: a time input and a table view listing each zone's local time and whether it is in working hours (not color-only).
- Mobile: search bar first, category chips scroll horizontally, planner stacks zones vertically with a shared time slider.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] "5 km in miles" returns 3.10686 (6 significant digits) and shows the interpretation chip.
- [ ] "10 GB to MB" gives 10,000 MB and "10 GiB to MiB" gives 10,240 MiB; mixing families shows the note.
- [ ] 100 C = 212 F, 0 K = -273.15 C, and -500 C is rejected.
- [ ] "3pm IST to PST" asks which IST before answering and never guesses.
- [ ] 2026-03-08 02:30 in America/New_York (spring-forward gap) triggers a warning; 2026-11-01 01:30 asks which occurrence.
- [ ] Asia/Kathmandu (+5:45) conversions are correct to the minute.
- [ ] No network request is made at any time (verified in DevTools).
- [ ] Shared link restores the same result in a fresh browser.

## 12. Future ideas and open questions
- **Currency is intentionally excluded.** Live exchange rates were removed from scope by the owner on 2026-11-19; do not add a currency category or any rate fetching.
- Future: more units (cooking by ingredient density, shoe/clothing sizes), non-English unit aliases, calendar date difference calculator, add-to-calendar file (.ics) from the planner.
- Open: bundle a city database (size/licence) or support IANA IDs only in v1? Use Temporal when available?
