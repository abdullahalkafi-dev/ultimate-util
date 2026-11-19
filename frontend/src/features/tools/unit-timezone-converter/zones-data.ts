export interface AbbrCandidate {
  id: string;
  label: string;
}

/**
 * Abbreviations are not IANA ids. Each maps to the region's zone, so offsets follow that
 * region's rules on the chosen date (PST in July gives Pacific daylight time, as people mean it).
 * Abbreviations with more than one candidate always need a user choice.
 */
export const ABBREVIATIONS: Record<string, AbbrCandidate[]> = {
  IST: [
    { id: 'Asia/Kolkata', label: 'India Standard Time' },
    { id: 'Europe/Dublin', label: 'Irish Standard Time' },
    { id: 'Asia/Jerusalem', label: 'Israel Standard Time' },
  ],
  CST: [
    { id: 'America/Chicago', label: 'US Central Standard Time' },
    { id: 'Asia/Shanghai', label: 'China Standard Time' },
    { id: 'America/Havana', label: 'Cuba Standard Time' },
  ],
  BST: [
    { id: 'Europe/London', label: 'British Summer Time' },
    { id: 'Asia/Dhaka', label: 'Bangladesh Standard Time' },
  ],
  EST: [
    { id: 'America/New_York', label: 'US Eastern Standard Time' },
    { id: 'Australia/Sydney', label: 'Australian Eastern Standard Time' },
  ],
  PST: [
    { id: 'America/Los_Angeles', label: 'US Pacific Standard Time' },
    { id: 'Asia/Manila', label: 'Philippine Standard Time' },
  ],
  AST: [
    { id: 'America/Halifax', label: 'Atlantic Standard Time' },
    { id: 'Asia/Riyadh', label: 'Arabia Standard Time' },
  ],
  EDT: [{ id: 'America/New_York', label: 'US Eastern Daylight Time' }],
  ET: [{ id: 'America/New_York', label: 'US Eastern Time' }],
  CDT: [{ id: 'America/Chicago', label: 'US Central Daylight Time' }],
  CT: [{ id: 'America/Chicago', label: 'US Central Time' }],
  MST: [{ id: 'America/Denver', label: 'US Mountain Standard Time' }],
  MDT: [{ id: 'America/Denver', label: 'US Mountain Daylight Time' }],
  MT: [{ id: 'America/Denver', label: 'US Mountain Time' }],
  PDT: [{ id: 'America/Los_Angeles', label: 'US Pacific Daylight Time' }],
  PT: [{ id: 'America/Los_Angeles', label: 'US Pacific Time' }],
  AKST: [{ id: 'America/Anchorage', label: 'Alaska Standard Time' }],
  AKDT: [{ id: 'America/Anchorage', label: 'Alaska Daylight Time' }],
  HST: [{ id: 'Pacific/Honolulu', label: 'Hawaii Standard Time' }],
  CET: [{ id: 'Europe/Paris', label: 'Central European Time' }],
  CEST: [{ id: 'Europe/Paris', label: 'Central European Summer Time' }],
  EET: [{ id: 'Europe/Athens', label: 'Eastern European Time' }],
  EEST: [{ id: 'Europe/Athens', label: 'Eastern European Summer Time' }],
  WET: [{ id: 'Europe/Lisbon', label: 'Western European Time' }],
  WEST: [{ id: 'Europe/Lisbon', label: 'Western European Summer Time' }],
  MSK: [{ id: 'Europe/Moscow', label: 'Moscow Standard Time' }],
  JST: [{ id: 'Asia/Tokyo', label: 'Japan Standard Time' }],
  KST: [{ id: 'Asia/Seoul', label: 'Korea Standard Time' }],
  SGT: [{ id: 'Asia/Singapore', label: 'Singapore Time' }],
  HKT: [{ id: 'Asia/Hong_Kong', label: 'Hong Kong Time' }],
  PKT: [{ id: 'Asia/Karachi', label: 'Pakistan Standard Time' }],
  NPT: [{ id: 'Asia/Kathmandu', label: 'Nepal Time' }],
  BDT: [{ id: 'Asia/Dhaka', label: 'Bangladesh Standard Time' }],
  PHT: [{ id: 'Asia/Manila', label: 'Philippine Time' }],
  WIB: [{ id: 'Asia/Jakarta', label: 'Western Indonesia Time' }],
  GST: [{ id: 'Asia/Dubai', label: 'Gulf Standard Time' }],
  IRST: [{ id: 'Asia/Tehran', label: 'Iran Standard Time' }],
  AEST: [{ id: 'Australia/Sydney', label: 'Australian Eastern Standard Time' }],
  AEDT: [{ id: 'Australia/Sydney', label: 'Australian Eastern Daylight Time' }],
  ACST: [{ id: 'Australia/Adelaide', label: 'Australian Central Standard Time' }],
  AWST: [{ id: 'Australia/Perth', label: 'Australian Western Standard Time' }],
  NZST: [{ id: 'Pacific/Auckland', label: 'New Zealand Standard Time' }],
  NZDT: [{ id: 'Pacific/Auckland', label: 'New Zealand Daylight Time' }],
  SAST: [{ id: 'Africa/Johannesburg', label: 'South Africa Standard Time' }],
  WAT: [{ id: 'Africa/Lagos', label: 'West Africa Time' }],
  CAT: [{ id: 'Africa/Maputo', label: 'Central Africa Time' }],
  EAT: [{ id: 'Africa/Nairobi', label: 'East Africa Time' }],
};

/** Major cities to IANA ids, so people can type a city instead of an id. */
export const CITIES: Record<string, string> = {
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York', washington: 'America/New_York',
  toronto: 'America/Toronto', chicago: 'America/Chicago', houston: 'America/Chicago', dallas: 'America/Chicago', 'mexico city': 'America/Mexico_City',
  denver: 'America/Denver', phoenix: 'America/Phoenix', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver', anchorage: 'America/Anchorage',
  honolulu: 'Pacific/Honolulu', halifax: 'America/Halifax', 'sao paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', santiago: 'America/Santiago', bogota: 'America/Bogota', lima: 'America/Lima',
  caracas: 'America/Caracas', havana: 'America/Havana',
  london: 'Europe/London', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', madrid: 'Europe/Madrid', paris: 'Europe/Paris',
  berlin: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam', brussels: 'Europe/Brussels', rome: 'Europe/Rome', zurich: 'Europe/Zurich',
  vienna: 'Europe/Vienna', stockholm: 'Europe/Stockholm', oslo: 'Europe/Oslo', copenhagen: 'Europe/Copenhagen', warsaw: 'Europe/Warsaw',
  prague: 'Europe/Prague', athens: 'Europe/Athens', helsinki: 'Europe/Helsinki', kyiv: 'Europe/Kyiv', kiev: 'Europe/Kyiv',
  istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow', reykjavik: 'Atlantic/Reykjavik',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  casablanca: 'Africa/Casablanca', accra: 'Africa/Accra', 'addis ababa': 'Africa/Addis_Ababa',
  dubai: 'Asia/Dubai', riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar', tehran: 'Asia/Tehran', baghdad: 'Asia/Baghdad', jerusalem: 'Asia/Jerusalem',
  'tel aviv': 'Asia/Jerusalem', karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi', delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', mumbai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', calcutta: 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata', chennai: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata', kathmandu: 'Asia/Kathmandu', dhaka: 'Asia/Dhaka',
  colombo: 'Asia/Colombo', yangon: 'Asia/Yangon', bangkok: 'Asia/Bangkok', hanoi: 'Asia/Ho_Chi_Minh', 'ho chi minh': 'Asia/Ho_Chi_Minh',
  jakarta: 'Asia/Jakarta', 'kuala lumpur': 'Asia/Kuala_Lumpur', singapore: 'Asia/Singapore', manila: 'Asia/Manila',
  'hong kong': 'Asia/Hong_Kong', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', taipei: 'Asia/Taipei', seoul: 'Asia/Seoul',
  tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', tashkent: 'Asia/Tashkent', almaty: 'Asia/Almaty', kabul: 'Asia/Kabul',
  perth: 'Australia/Perth', adelaide: 'Australia/Adelaide', darwin: 'Australia/Darwin', brisbane: 'Australia/Brisbane',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland', wellington: 'Pacific/Auckland', fiji: 'Pacific/Fiji',
};

/** Used when Intl.supportedValuesOf('timeZone') is missing. */
export const FALLBACK_ZONES: string[] = [...new Set(Object.values(CITIES)), 'UTC'].sort();
