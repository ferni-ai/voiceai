/**
 * Input Validation Helpers for Information Domain Tools
 *
 * Centralizes validation logic for common input types:
 * - Locations (city names, addresses)
 * - Stock symbols
 * - Sports teams
 * - Food names
 */

// ============================================================================
// LOCATION VALIDATION
// ============================================================================

/**
 * Validate and normalize a location string.
 * Returns null if invalid.
 */
export function validateLocation(location: string | undefined | null): string | null {
  if (!location) return null;

  const normalized = location.trim();

  // Too short
  if (normalized.length < 2) return null;

  // Too long (likely garbage)
  if (normalized.length > 200) return null;

  // Contains suspicious characters (potential injection)
  if (/[<>{}[\]\\]/.test(normalized)) return null;

  // Common invalid inputs
  const invalid = ['here', 'my location', 'current', 'nearby', 'local', 'undefined', 'null'];
  if (invalid.includes(normalized.toLowerCase())) return null;

  return normalized;
}

/**
 * Check if a location looks like a valid city/place name.
 */
export function isValidCityName(location: string): boolean {
  const validated = validateLocation(location);
  if (!validated) return false;

  // City names should contain letters
  if (!/[a-zA-Z]/.test(validated)) return false;

  // City names shouldn't be all numbers
  if (/^\d+$/.test(validated)) return false;

  return true;
}

// ============================================================================
// STOCK SYMBOL VALIDATION
// ============================================================================

/**
 * Validate and normalize a stock ticker symbol.
 * Returns null if invalid.
 */
export function validateStockSymbol(symbol: string | undefined | null): string | null {
  if (!symbol) return null;

  const normalized = symbol.trim().toUpperCase();

  // Stock symbols are 1-5 characters
  if (normalized.length < 1 || normalized.length > 5) return null;

  // Stock symbols are alphanumeric (some have dots like BRK.A)
  if (!/^[A-Z0-9.]+$/.test(normalized)) return null;

  return normalized;
}

/**
 * Common stock symbol aliases (user might say "Apple" instead of "AAPL").
 */
const STOCK_ALIASES: Record<string, string> = {
  apple: 'AAPL',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  microsoft: 'MSFT',
  tesla: 'TSLA',
  nvidia: 'NVDA',
  meta: 'META',
  facebook: 'META',
  netflix: 'NFLX',
  disney: 'DIS',
  walmart: 'WMT',
  'jp morgan': 'JPM',
  jpmorgan: 'JPM',
  'bank of america': 'BAC',
  boeing: 'BA',
  intel: 'INTC',
  amd: 'AMD',
  cisco: 'CSCO',
  oracle: 'ORCL',
  salesforce: 'CRM',
  paypal: 'PYPL',
  visa: 'V',
  mastercard: 'MA',
  'johnson & johnson': 'JNJ',
  'johnson and johnson': 'JNJ',
  pfizer: 'PFE',
  'coca cola': 'KO',
  'coca-cola': 'KO',
  pepsi: 'PEP',
  pepsico: 'PEP',
  starbucks: 'SBUX',
  mcdonalds: 'MCD',
  nike: 'NKE',
  spotify: 'SPOT',
  uber: 'UBER',
  lyft: 'LYFT',
  airbnb: 'ABNB',
  zoom: 'ZM',
  docusign: 'DOCU',
  snowflake: 'SNOW',
  coinbase: 'COIN',
  robinhood: 'HOOD',
};

/**
 * Resolve a stock query to a ticker symbol.
 * Handles both direct symbols and company name aliases.
 */
export function resolveStockSymbol(query: string): string | null {
  if (!query) return null;

  const normalized = query.trim().toLowerCase();

  // Check aliases first
  const alias = STOCK_ALIASES[normalized];
  if (alias) return alias;

  // Try as direct symbol
  return validateStockSymbol(query);
}

// ============================================================================
// SPORTS TEAM VALIDATION
// ============================================================================

/**
 * Common sports team name mappings.
 * Maps variations to canonical names used by ESPN API.
 */
const TEAM_ALIASES: Record<string, string> = {
  // NFL
  eagles: 'Philadelphia Eagles',
  philly: 'Philadelphia Eagles',
  birds: 'Philadelphia Eagles',
  sixers: 'Philadelphia 76ers',
  '76ers': 'Philadelphia 76ers',
  phillies: 'Philadelphia Phillies',
  flyers: 'Philadelphia Flyers',

  cowboys: 'Dallas Cowboys',
  patriots: 'New England Patriots',
  chiefs: 'Kansas City Chiefs',
  packers: 'Green Bay Packers',
  steelers: 'Pittsburgh Steelers',
  niners: 'San Francisco 49ers',
  '49ers': 'San Francisco 49ers',
  broncos: 'Denver Broncos',
  raiders: 'Las Vegas Raiders',
  seahawks: 'Seattle Seahawks',
  bills: 'Buffalo Bills',
  dolphins: 'Miami Dolphins',
  jets: 'New York Jets',
  giants: 'New York Giants',
  ravens: 'Baltimore Ravens',
  bengals: 'Cincinnati Bengals',
  browns: 'Cleveland Browns',
  titans: 'Tennessee Titans',
  colts: 'Indianapolis Colts',
  texans: 'Houston Texans',
  jaguars: 'Jacksonville Jaguars',
  chargers: 'Los Angeles Chargers',
  rams: 'Los Angeles Rams',
  cardinals: 'Arizona Cardinals',
  falcons: 'Atlanta Falcons',
  saints: 'New Orleans Saints',
  panthers: 'Carolina Panthers',
  buccaneers: 'Tampa Bay Buccaneers',
  bucs: 'Tampa Bay Buccaneers',
  commanders: 'Washington Commanders',
  lions: 'Detroit Lions',
  bears: 'Chicago Bears',
  vikings: 'Minnesota Vikings',

  // NBA
  lakers: 'Los Angeles Lakers',
  celtics: 'Boston Celtics',
  warriors: 'Golden State Warriors',
  heat: 'Miami Heat',
  bucks: 'Milwaukee Bucks',
  nets: 'Brooklyn Nets',
  knicks: 'New York Knicks',
  suns: 'Phoenix Suns',
  mavericks: 'Dallas Mavericks',
  mavs: 'Dallas Mavericks',
  nuggets: 'Denver Nuggets',
  cavaliers: 'Cleveland Cavaliers',
  cavs: 'Cleveland Cavaliers',
  thunder: 'Oklahoma City Thunder',
  blazers: 'Portland Trail Blazers',
  raptors: 'Toronto Raptors',
  spurs: 'San Antonio Spurs',
  rockets: 'Houston Rockets',
  clippers: 'Los Angeles Clippers',
  pistons: 'Detroit Pistons',
  pacers: 'Indiana Pacers',
  hawks: 'Atlanta Hawks',
  hornets: 'Charlotte Hornets',
  magic: 'Orlando Magic',
  wizards: 'Washington Wizards',
  pelicans: 'New Orleans Pelicans',
  grizzlies: 'Memphis Grizzlies',
  wolves: 'Minnesota Timberwolves',
  timberwolves: 'Minnesota Timberwolves',
  jazz: 'Utah Jazz',
  kings: 'Sacramento Kings',

  // MLB
  yankees: 'New York Yankees',
  'red sox': 'Boston Red Sox',
  dodgers: 'Los Angeles Dodgers',
  cubs: 'Chicago Cubs',
  'white sox': 'Chicago White Sox',
  astros: 'Houston Astros',
  braves: 'Atlanta Braves',
  padres: 'San Diego Padres',
  mets: 'New York Mets',
  mariners: 'Seattle Mariners',
  twins: 'Minnesota Twins',
  orioles: 'Baltimore Orioles',
  'blue jays': 'Toronto Blue Jays',
  royals: 'Kansas City Royals',
  rays: 'Tampa Bay Rays',
  reds: 'Cincinnati Reds',
  brewers: 'Milwaukee Brewers',
  rockies: 'Colorado Rockies',
  dbacks: 'Arizona Diamondbacks',
  diamondbacks: 'Arizona Diamondbacks',
  marlins: 'Miami Marlins',
  pirates: 'Pittsburgh Pirates',
  nationals: 'Washington Nationals',
  athletics: 'Oakland Athletics',
  guardians: 'Cleveland Guardians',
  angels: 'Los Angeles Angels',

  // NHL
  bruins: 'Boston Bruins',
  canadiens: 'Montreal Canadiens',
  habs: 'Montreal Canadiens',
  'maple leafs': 'Toronto Maple Leafs',
  leafs: 'Toronto Maple Leafs',
  blackhawks: 'Chicago Blackhawks',
  'red wings': 'Detroit Red Wings',
  penguins: 'Pittsburgh Penguins',
  capitals: 'Washington Capitals',
  caps: 'Washington Capitals',
  oilers: 'Edmonton Oilers',
  canucks: 'Vancouver Canucks',
  avalanche: 'Colorado Avalanche',
  avs: 'Colorado Avalanche',
  blues: 'St. Louis Blues',
  sharks: 'San Jose Sharks',
  ducks: 'Anaheim Ducks',
  sabres: 'Buffalo Sabres',
  coyotes: 'Arizona Coyotes',
  flames: 'Calgary Flames',
  kraken: 'Seattle Kraken',
  wild: 'Minnesota Wild',
  predators: 'Nashville Predators',
  preds: 'Nashville Predators',
  senators: 'Ottawa Senators',
  sens: 'Ottawa Senators',
  hurricanes: 'Carolina Hurricanes',
  canes: 'Carolina Hurricanes',
  lightning: 'Tampa Bay Lightning',
  bolts: 'Tampa Bay Lightning',
  islanders: 'New York Islanders',
  devils: 'New Jersey Devils',
  'golden knights': 'Vegas Golden Knights',
  knights: 'Vegas Golden Knights',
};

/**
 * Resolve a team query to a canonical team name.
 */
export function resolveTeamName(query: string): string {
  if (!query) return query;

  const normalized = query.trim().toLowerCase();

  // Check aliases
  const alias = TEAM_ALIASES[normalized];
  if (alias) return alias;

  // Return original with proper casing
  return query.trim();
}

// ============================================================================
// FOOD NAME VALIDATION
// ============================================================================

/**
 * Validate and normalize a food name for nutrition lookup.
 */
export function validateFoodName(food: string | undefined | null): string | null {
  if (!food) return null;

  const normalized = food.trim().toLowerCase();

  // Too short
  if (normalized.length < 2) return null;

  // Too long
  if (normalized.length > 100) return null;

  // Contains suspicious characters
  if (/[<>{}[\]\\]/.test(normalized)) return null;

  return normalized;
}

// ============================================================================
// GENERAL UTILITIES
// ============================================================================

/**
 * Sanitize a string for use in external API calls.
 * Removes potentially dangerous characters while preserving meaning.
 */
export function sanitizeForApi(input: string): string {
  return input
    .trim()
    .replace(/[<>{}[\]\\]/g, '') // Remove dangerous chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 500); // Limit length
}

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
