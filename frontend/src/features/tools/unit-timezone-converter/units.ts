export type Category =
  | 'length' | 'mass' | 'volume' | 'temperature' | 'area' | 'speed' | 'time' | 'data' | 'energy' | 'pressure' | 'fuel';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'length', label: 'Length' },
  { id: 'mass', label: 'Mass' },
  { id: 'volume', label: 'Volume' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'area', label: 'Area' },
  { id: 'speed', label: 'Speed' },
  { id: 'time', label: 'Time' },
  { id: 'data', label: 'Data' },
  { id: 'energy', label: 'Energy' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'fuel', label: 'Fuel economy' },
];

export interface UnitDef {
  id: string;
  category: Category;
  symbol: string;
  label: string;
  /** Typed forms. A leading "=" means case-sensitive; others are matched case-insensitively. */
  aliases: string[];
  toBase: (v: number) => number;
  fromBase: (b: number) => number;
  /** Data units: decimal (SI), binary (IEC) or bit based, to explain mixed conversions. */
  family?: 'si' | 'iec' | 'bit';
  /** Shown when the same word means different things (cup, gallon, ton...). */
  variant?: string;
}

function lin(id: string, category: Category, symbol: string, label: string, aliases: string[], factor: number, extra: Partial<UnitDef> = {}): UnitDef {
  return { id, category, symbol, label, aliases, toBase: (v) => v * factor, fromBase: (b) => b / factor, ...extra };
}

const L = 'length';
const M = 'mass';
const V = 'volume';
const A = 'area';
const S = 'speed';
const T = 'time';
const D = 'data';
const E = 'energy';
const P = 'pressure';

const GAL_US = 3.785411784;
const GAL_IMP = 4.54609;
const MILE = 1609.344;

export const UNITS: UnitDef[] = [
  // length (base metre)
  lin('m', L, 'm', 'metre', ['m', 'meter', 'metre'], 1),
  lin('km', L, 'km', 'kilometre', ['km', 'kms', 'kilometer', 'kilometre', 'klick'], 1000),
  lin('cm', L, 'cm', 'centimetre', ['cm', 'centimeter', 'centimetre'], 0.01),
  lin('mm', L, 'mm', 'millimetre', ['mm', 'millimeter', 'millimetre'], 0.001),
  lin('um', L, 'µm', 'micrometre', ['um', 'µm', 'μm', 'micron', 'micrometer', 'micrometre'], 1e-6),
  lin('nm', L, 'nm', 'nanometre', ['nm', 'nanometer', 'nanometre'], 1e-9),
  lin('mi', L, 'mi', 'mile', ['mi', 'mile'], MILE),
  lin('yd', L, 'yd', 'yard', ['yd', 'yard'], 0.9144),
  lin('ft', L, 'ft', 'foot', ['ft', 'foot', 'feet', "'", '′'], 0.3048),
  lin('in', L, 'in', 'inch', ['in', 'inch', 'inches', '"', '″'], 0.0254),
  lin('nmi', L, 'nmi', 'nautical mile', ['nmi', 'nautical mile'], 1852),
  lin('thou', L, 'thou', 'thou (mil)', ['thou', 'mil'], 0.0000254, { variant: 'thou, 1/1000 inch' }),
  lin('mil-sv', L, 'mil', 'Scandinavian mil', ['mil'], 10000, { variant: 'Scandinavian mil, 10 km' }),

  // mass (base kilogram)
  lin('kg', M, 'kg', 'kilogram', ['kg', 'kgs', 'kilo', 'kilogram', 'kilogramme'], 1),
  lin('g', M, 'g', 'gram', ['g', 'gram', 'gramme', 'gm'], 0.001),
  lin('mg', M, 'mg', 'milligram', ['mg', 'milligram'], 1e-6),
  lin('ug', M, 'µg', 'microgram', ['ug', 'µg', 'μg', 'mcg', 'microgram'], 1e-9),
  lin('lb', M, 'lb', 'pound', ['lb', 'lbs', 'pound'], 0.45359237),
  lin('oz', M, 'oz', 'ounce', ['oz', 'ounce'], 0.028349523125),
  lin('st', M, 'st', 'stone', ['st', 'stone'], 6.35029318),
  lin('ton-us', M, 'ton (US)', 'short ton', ['ton', 'short ton', 'us ton'], 907.18474, { variant: 'short ton (US), 2000 lb' }),
  lin('ton-uk', M, 'ton (UK)', 'long ton', ['ton', 'long ton', 'imperial ton', 'uk ton'], 1016.0469088, { variant: 'long ton (UK), 2240 lb' }),
  lin('t', M, 't', 'metric ton', ['t', 'ton', 'tonne', 'metric ton', 'metric tonne'], 1000, { variant: 'metric ton (tonne), 1000 kg' }),

  // volume (base litre)
  lin('l', V, 'L', 'litre', ['=L', 'l', 'liter', 'litre'], 1),
  lin('ml', V, 'mL', 'millilitre', ['ml', 'milliliter', 'millilitre', 'cc'], 0.001),
  lin('cl', V, 'cL', 'centilitre', ['cl', 'centiliter', 'centilitre'], 0.01),
  lin('dl', V, 'dL', 'decilitre', ['dl', 'deciliter', 'decilitre'], 0.1),
  lin('m3', V, 'm³', 'cubic metre', ['m3', 'm³', 'cubic meter', 'cubic metre'], 1000),
  lin('cm3', V, 'cm³', 'cubic centimetre', ['cm3', 'cm³', 'cubic centimeter', 'cubic centimetre'], 0.001),
  lin('tsp', V, 'tsp', 'teaspoon (US)', ['tsp', 'teaspoon'], 0.00492892159375),
  lin('tbsp', V, 'tbsp', 'tablespoon (US)', ['tbsp', 'tablespoon'], 0.01478676478125),
  lin('floz-us', V, 'fl oz (US)', 'fluid ounce (US)', ['fl oz', 'floz', 'fluid ounce'], GAL_US / 128, { variant: 'US fluid ounce' }),
  lin('floz-uk', V, 'fl oz (UK)', 'fluid ounce (UK)', ['fl oz', 'floz', 'fluid ounce'], GAL_IMP / 160, { variant: 'imperial fluid ounce' }),
  lin('cup-us', V, 'cup (US)', 'US cup', ['cup'], GAL_US / 16, { variant: 'US cup, 236.6 mL' }),
  lin('cup-metric', V, 'cup (metric)', 'metric cup', ['cup'], 0.25, { variant: 'metric cup, 250 mL' }),
  lin('cup-uk', V, 'cup (UK)', 'imperial cup', ['cup'], GAL_IMP / 16, { variant: 'imperial cup, 284.1 mL' }),
  lin('pt-us', V, 'pt (US)', 'US pint', ['pt', 'pint'], GAL_US / 8, { variant: 'US pint, 473.2 mL' }),
  lin('pt-uk', V, 'pt (UK)', 'imperial pint', ['pt', 'pint'], GAL_IMP / 8, { variant: 'imperial pint, 568.3 mL' }),
  lin('qt-us', V, 'qt (US)', 'US quart', ['qt', 'quart'], GAL_US / 4, { variant: 'US quart, 946.4 mL' }),
  lin('qt-uk', V, 'qt (UK)', 'imperial quart', ['qt', 'quart'], GAL_IMP / 4, { variant: 'imperial quart, 1.137 L' }),
  lin('gal-us', V, 'gal (US)', 'US gallon', ['gal', 'gallon'], GAL_US, { variant: 'US gallon, 3.785 L' }),
  lin('gal-uk', V, 'gal (UK)', 'imperial gallon', ['gal', 'gallon'], GAL_IMP, { variant: 'imperial gallon, 4.546 L' }),

  // temperature (base Celsius, offset formulas)
  { id: 'c', category: 'temperature', symbol: '°C', label: 'degree Celsius', aliases: ['c', 'celsius', 'centigrade'], toBase: (v) => v, fromBase: (b) => b },
  { id: 'f', category: 'temperature', symbol: '°F', label: 'degree Fahrenheit', aliases: ['f', 'fahrenheit'], toBase: (v) => ((v - 32) * 5) / 9, fromBase: (b) => (b * 9) / 5 + 32 },
  { id: 'k', category: 'temperature', symbol: 'K', label: 'kelvin', aliases: ['k', 'kelvin'], toBase: (v) => v - 273.15, fromBase: (b) => b + 273.15 },
  { id: 'r', category: 'temperature', symbol: '°R', label: 'degree Rankine', aliases: ['r', 'rankine', 'ra'], toBase: (v) => ((v - 491.67) * 5) / 9, fromBase: (b) => (b * 9) / 5 + 491.67 },

  // area (base square metre)
  lin('m2', A, 'm²', 'square metre', ['m2', 'm²', 'sqm', 'sq m', 'square meter', 'square metre'], 1),
  lin('km2', A, 'km²', 'square kilometre', ['km2', 'km²', 'sqkm', 'sq km', 'square kilometer', 'square kilometre'], 1e6),
  lin('cm2', A, 'cm²', 'square centimetre', ['cm2', 'cm²', 'sq cm', 'square centimeter', 'square centimetre'], 1e-4),
  lin('mm2', A, 'mm²', 'square millimetre', ['mm2', 'mm²', 'sq mm', 'square millimeter', 'square millimetre'], 1e-6),
  lin('ha', A, 'ha', 'hectare', ['ha', 'hectare'], 10000),
  lin('acre', A, 'ac', 'acre', ['ac', 'acre'], 4046.8564224),
  lin('ft2', A, 'ft²', 'square foot', ['ft2', 'ft²', 'sqft', 'sq ft', 'square foot', 'square feet'], 0.09290304),
  lin('in2', A, 'in²', 'square inch', ['in2', 'in²', 'sqin', 'sq in', 'square inch', 'square inches'], 0.00064516),
  lin('yd2', A, 'yd²', 'square yard', ['yd2', 'yd²', 'sqyd', 'sq yd', 'square yard'], 0.83612736),
  lin('mi2', A, 'mi²', 'square mile', ['mi2', 'mi²', 'sqmi', 'sq mi', 'square mile'], MILE * MILE),

  // speed (base m/s)
  lin('mps', S, 'm/s', 'metre per second', ['m/s', 'mps', 'meter/second', 'metre/second', 'meters/second', 'metres/second'], 1),
  lin('kmh', S, 'km/h', 'kilometre per hour', ['km/h', 'kph', 'kmh', 'kmph', 'kilometer/hour', 'kilometre/hour', 'kilometers/hour', 'kilometres/hour', 'kilometers/hr'], 1 / 3.6),
  lin('mph', S, 'mph', 'mile per hour', ['mph', 'mi/h', 'mile/hour', 'miles/hour'], MILE / 3600),
  lin('kn', S, 'kn', 'knot', ['kn', 'kt', 'kts', 'knot'], 1852 / 3600),
  lin('fps', S, 'ft/s', 'foot per second', ['ft/s', 'fps', 'foot/second', 'feet/second'], 0.3048),
  lin('mach', S, 'Mach', 'Mach (sea level, 15 °C)', ['mach'], 340.29),

  // time (base second)
  lin('s', T, 's', 'second', ['s', 'sec', 'second'], 1),
  lin('ms', T, 'ms', 'millisecond', ['ms', 'millisecond'], 0.001),
  lin('us', T, 'µs', 'microsecond', ['µs', 'μs', 'microsecond'], 1e-6),
  lin('ns', T, 'ns', 'nanosecond', ['ns', 'nanosecond'], 1e-9),
  lin('min', T, 'min', 'minute', ['min', 'mins', 'minute'], 60),
  lin('h', T, 'h', 'hour', ['h', 'hr', 'hrs', 'hour'], 3600),
  lin('d', T, 'd', 'day', ['d', 'day'], 86400),
  lin('wk', T, 'wk', 'week', ['wk', 'wks', 'week'], 604800),
  lin('mo', T, 'mo', 'month (average)', ['mo', 'mos', 'month'], 2629746),
  lin('yr', T, 'yr', 'year (365.2425 days)', ['yr', 'yrs', 'year', 'y'], 31556952),

  // data (base byte)
  lin('bit', D, 'bit', 'bit', ['=b', 'bit'], 1 / 8, { family: 'bit' }),
  lin('B', D, 'B', 'byte', ['=B', 'byte'], 1, { family: 'si' }),
  lin('kB', D, 'kB', 'kilobyte', ['=kB', '=KB', 'kb', 'kilobyte'], 1e3, { family: 'si' }),
  lin('MB', D, 'MB', 'megabyte', ['=MB', 'mb', 'megabyte'], 1e6, { family: 'si' }),
  lin('GB', D, 'GB', 'gigabyte', ['=GB', 'gb', 'gigabyte'], 1e9, { family: 'si' }),
  lin('TB', D, 'TB', 'terabyte', ['=TB', 'tb', 'terabyte'], 1e12, { family: 'si' }),
  lin('PB', D, 'PB', 'petabyte', ['=PB', 'pb', 'petabyte'], 1e15, { family: 'si' }),
  lin('KiB', D, 'KiB', 'kibibyte', ['kib', 'kibibyte'], 1024, { family: 'iec' }),
  lin('MiB', D, 'MiB', 'mebibyte', ['mib', 'mebibyte'], 1024 ** 2, { family: 'iec' }),
  lin('GiB', D, 'GiB', 'gibibyte', ['gib', 'gibibyte'], 1024 ** 3, { family: 'iec' }),
  lin('TiB', D, 'TiB', 'tebibyte', ['tib', 'tebibyte'], 1024 ** 4, { family: 'iec' }),
  lin('PiB', D, 'PiB', 'pebibyte', ['pib', 'pebibyte'], 1024 ** 5, { family: 'iec' }),
  lin('kbit', D, 'kbit', 'kilobit', ['=Kb', 'kbit', 'kilobit'], 125, { family: 'bit' }),
  lin('Mbit', D, 'Mbit', 'megabit', ['=Mb', 'mbit', 'megabit'], 125000, { family: 'bit' }),
  lin('Gbit', D, 'Gbit', 'gigabit', ['=Gb', 'gbit', 'gigabit'], 125000000, { family: 'bit' }),

  // energy (base joule)
  lin('J', E, 'J', 'joule', ['j', 'joule'], 1),
  lin('kJ', E, 'kJ', 'kilojoule', ['kj', 'kilojoule'], 1e3),
  lin('MJ', E, 'MJ', 'megajoule', ['mj', 'megajoule'], 1e6),
  lin('cal', E, 'cal', 'calorie (small)', ['=cal', 'gram calorie'], 4.184),
  lin('kcal', E, 'kcal', 'kilocalorie (food Calorie)', ['kcal', '=Cal', 'calorie', 'kilocalorie', 'food calorie'], 4184),
  lin('Wh', E, 'Wh', 'watt-hour', ['wh', 'watt hour', 'watt-hour'], 3600),
  lin('kWh', E, 'kWh', 'kilowatt-hour', ['kwh', 'kilowatt hour', 'kilowatt-hour'], 3.6e6),
  lin('BTU', E, 'BTU', 'British thermal unit', ['btu'], 1055.05585262),
  lin('eV', E, 'eV', 'electronvolt', ['ev', 'electronvolt'], 1.602176634e-19),
  lin('ftlbf', E, 'ft⋅lbf', 'foot-pound', ['ftlbf', 'ft-lbf', 'ft⋅lbf', 'ft lbf', 'foot pound', 'foot-pound'], 1.3558179483314),

  // pressure (base pascal)
  lin('Pa', P, 'Pa', 'pascal', ['pa', 'pascal'], 1),
  lin('hPa', P, 'hPa', 'hectopascal', ['hpa', 'hectopascal'], 100),
  lin('kPa', P, 'kPa', 'kilopascal', ['kpa', 'kilopascal'], 1000),
  lin('MPa', P, 'MPa', 'megapascal', ['mpa', 'megapascal'], 1e6),
  lin('bar', P, 'bar', 'bar', ['bar'], 1e5),
  lin('mbar', P, 'mbar', 'millibar', ['mbar', 'millibar'], 100),
  lin('atm', P, 'atm', 'standard atmosphere', ['atm', 'atmosphere'], 101325),
  lin('psi', P, 'psi', 'pound per square inch', ['psi'], 6894.757293168),
  lin('mmHg', P, 'mmHg', 'millimetre of mercury', ['mmhg'], 133.322387415),
  lin('inHg', P, 'inHg', 'inch of mercury', ['inhg'], 3386.389),
  lin('torr', P, 'Torr', 'torr', ['torr'], 101325 / 760),

  // fuel economy (base litres per 100 km; mpg and km/L are inverse)
  {
    id: 'l100', category: 'fuel', symbol: 'L/100km', label: 'litres per 100 km',
    aliases: ['l/100km', 'l/100 km', 'lper100km', 'litres/100km', 'liters/100km'], toBase: (v) => v, fromBase: (b) => b,
  },
  {
    id: 'mpg-us', category: 'fuel', symbol: 'mpg (US)', label: 'US miles per gallon', variant: 'US miles per gallon',
    aliases: ['mpg'], toBase: (v) => (GAL_US / (MILE / 1000)) * 100 / v, fromBase: (b) => (GAL_US / (MILE / 1000)) * 100 / b,
  },
  {
    id: 'mpg-uk', category: 'fuel', symbol: 'mpg (UK)', label: 'imperial miles per gallon', variant: 'imperial miles per gallon',
    aliases: ['mpg'], toBase: (v) => (GAL_IMP / (MILE / 1000)) * 100 / v, fromBase: (b) => (GAL_IMP / (MILE / 1000)) * 100 / b,
  },
  {
    id: 'kml', category: 'fuel', symbol: 'km/L', label: 'kilometres per litre',
    aliases: ['km/l', 'kmpl', 'kmperl'], toBase: (v) => 100 / v, fromBase: (b) => 100 / b,
  },
];

export const UNIT_BY_ID: ReadonlyMap<string, UnitDef> = new Map(UNITS.map((u) => [u.id, u]));

// ---------- alias lookup ----------

const exactMap = new Map<string, string[]>();
const lowerMap = new Map<string, string[]>();

function add(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key);
  if (!list) map.set(key, [id]);
  else if (!list.includes(id)) list.push(id);
}

/** Lowercase, drop degree signs and "degrees", normalise slashes and "per". */
export function normalizeUnitText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/\bdegrees?\b|\bdeg\b/g, '')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+per\s+/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
}

for (const u of UNITS) {
  for (const raw of u.aliases) {
    if (raw.startsWith('=')) {
      add(exactMap, raw.slice(1), u.id);
      continue;
    }
    const key = normalizeUnitText(raw);
    add(lowerMap, key, u.id);
    if (/[a-z]$/.test(key) && key.length >= 3 && !key.endsWith('s')) add(lowerMap, key + 's', u.id);
  }
}

export interface UnitMatch {
  ids: string[];
  /** Normalised word used for variant choices. */
  key: string;
  /** Set when a near-miss spelling was accepted. */
  fuzzyFrom?: string;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

export function findUnit(text: string): UnitMatch | null {
  const raw = text.trim().replace(/^[°º]/, '');
  const exact = exactMap.get(raw);
  if (exact) return { ids: exact, key: raw };
  const key = normalizeUnitText(text);
  if (!key) return null;
  const hit = lowerMap.get(key);
  if (hit) return { ids: hit, key };
  // Typo tolerance: only for longer words, one edit away, and only when the match is unique.
  if (key.length >= 5) {
    const near = new Set<string>();
    let target = '';
    for (const [k, ids] of lowerMap) {
      if (Math.abs(k.length - key.length) <= 1 && k.length >= 5 && editDistance(k, key) === 1) {
        ids.forEach((id) => near.add(id));
        target = k;
      }
    }
    if (near.size === 1 || (near.size > 1 && target)) return { ids: [...near], key: target, fuzzyFrom: key };
  }
  return null;
}

/** Closest known words, for "Unknown unit" messages. */
export function suggestUnits(text: string, limit = 4): string[] {
  const key = normalizeUnitText(text);
  const scored: { word: string; score: number }[] = [];
  for (const [k, ids] of lowerMap) {
    if (k.length < 2 || k.endsWith('s') && lowerMap.has(k.slice(0, -1))) continue;
    const d = editDistance(k, key);
    const starts = k.startsWith(key) || key.startsWith(k);
    if (d <= 2 || (starts && key.length >= 2)) scored.push({ word: UNIT_BY_ID.get(ids[0]!)!.symbol, score: d + (starts ? -1 : 0) });
  }
  scored.sort((a, b) => a.score - b.score);
  return [...new Set(scored.map((s) => s.word))].slice(0, limit);
}

export function unitsIn(category: Category): UnitDef[] {
  return UNITS.filter((u) => u.category === category);
}

export function categoryLabel(c: Category): string {
  return CATEGORIES.find((x) => x.id === c)!.label.toLowerCase();
}

export const ABSOLUTE_ZERO_C = -273.15;
