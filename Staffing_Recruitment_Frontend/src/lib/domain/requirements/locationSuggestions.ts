/**
 * Location suggestions with common abbreviations.
 * Used for autocomplete when adding locations to job demands.
 * Format: { displayName, searchTerms } - searchTerms include abbreviations like "hyd" for Hyderabad.
 */

export type LocationOption = {
  value: string;
  label: string;
  /** Lowercase search terms including abbreviations (e.g. "hyd", "hyderabad") */
  searchTerms: string[];
};

/** Common locations with abbreviations for Indian cities and global options */
const LOCATIONS: { label: string; searchTerms: string[] }[] = [
  { label: 'Hyderabad', searchTerms: ['hyderabad', 'hyd', 'secunderabad', 'sec'] },
  { label: 'Bengaluru', searchTerms: ['bengaluru', 'bangalore', 'blr', 'bengaluru'] },
  { label: 'Chennai', searchTerms: ['chennai', 'chn', 'madras'] },
  { label: 'Mumbai', searchTerms: ['mumbai', 'bombay', 'bom', 'mum'] },
  { label: 'Delhi', searchTerms: ['delhi', 'ncr', 'new delhi', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad'] },
  { label: 'Pune', searchTerms: ['pune', 'pnq', 'puna'] },
  { label: 'Kolkata', searchTerms: ['kolkata', 'calcutta', 'ccu', 'kol'] },
  { label: 'Ahmedabad', searchTerms: ['ahmedabad', 'amd', 'ahm'] },
  { label: 'Jaipur', searchTerms: ['jaipur', 'jpr'] },
  { label: 'Lucknow', searchTerms: ['lucknow', 'lko'] },
  { label: 'Kochi', searchTerms: ['kochi', 'cochin', 'coc'] },
  { label: 'Chandigarh', searchTerms: ['chandigarh', 'chd'] },
  { label: 'Indore', searchTerms: ['indore', 'idr'] },
  { label: 'Coimbatore', searchTerms: ['coimbatore', 'cbe', 'kovai'] },
  { label: 'Nagpur', searchTerms: ['nagpur', 'ngp'] },
  { label: 'Thiruvananthapuram', searchTerms: ['thiruvananthapuram', 'trivandrum', 'tvm', 'triv'] },
  { label: 'Bhopal', searchTerms: ['bhopal', 'bpl'] },
  { label: 'Visakhapatnam', searchTerms: ['visakhapatnam', 'vizag', 'vzg', 'vizag'] },
  { label: 'Mysore', searchTerms: ['mysore', 'mysuru', 'mys'] },
  { label: 'Bhubaneswar', searchTerms: ['bhubaneswar', 'bbsr', 'bbs'] },
  { label: 'Surat', searchTerms: ['surat', 'srt'] },
  { label: 'Noida', searchTerms: ['noida', 'noida'] },
  { label: 'Gurgaon', searchTerms: ['gurgaon', 'gurugram', 'ggn'] },
  { label: 'Remote', searchTerms: ['remote', 'wfh', 'work from home', 'anywhere'] },
  { label: 'Singapore', searchTerms: ['singapore', 'sg', 'sgp'] },
  { label: 'Dubai', searchTerms: ['dubai', 'dxb', 'uae'] },
  { label: 'London', searchTerms: ['london', 'ldn', 'uk'] },
  { label: 'New York', searchTerms: ['new york', 'nyc', 'ny'] },
  { label: 'San Francisco', searchTerms: ['san francisco', 'sf', 'bay area'] },
  { label: 'Austin', searchTerms: ['austin', 'atx'] },
  { label: 'Toronto', searchTerms: ['toronto', 'yyz', 'canada'] },
  { label: 'Sydney', searchTerms: ['sydney', 'syd', 'australia'] },
];

const LOCATION_OPTIONS: LocationOption[] = LOCATIONS.map((loc) => ({
  value: loc.label,
  label: loc.label,
  searchTerms: loc.searchTerms,
}));

/**
 * Get location suggestions matching the search query.
 * Matches against display name and search terms (including abbreviations).
 */
export function getLocationSuggestions(query: string): LocationOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOCATION_OPTIONS;

  return LOCATION_OPTIONS.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.searchTerms.some((term) => term.includes(q) || q.includes(term)),
  );
}
