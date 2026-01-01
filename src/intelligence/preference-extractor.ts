/**
 * Preference Extractor
 *
 * Extracts user preferences from natural conversation.
 * Supports: sports teams, stocks, news interests, locations, allergies, health conditions.
 *
 * TODO: Full implementation with NLP patterns
 *
 * @module intelligence/preference-extractor
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'preference-extractor' });

// ============================================================================
// TYPES
// ============================================================================

export type PreferenceCategory =
  // Core preferences
  | 'sports_team'
  | 'stock_watchlist'
  | 'news_interest'
  | 'avoid_topic'
  | 'home_location'
  | 'work_location'
  | 'allergy'
  | 'health_condition'
  // Music preferences
  | 'music_genre'
  | 'music_artist'
  // Entertainment preferences
  | 'movie_genre'
  | 'tv_show'
  // Food preferences
  | 'cuisine_preference'
  | 'dietary_restriction'
  | 'drink_preference'
  | 'restaurant_favorite'
  // Wellness preferences
  | 'exercise_routine'
  | 'wellness_practice'
  | 'sleep_pattern'
  // Travel preferences
  | 'travel_style'
  | 'bucket_list_destination'
  | 'favorite_place'
  // Learning preferences
  | 'learning_goal'
  | 'skill_building'
  // Social preferences
  | 'communication_preference'
  | 'social_style'
  | 'pet_preference'
  // Productivity preferences
  | 'productivity_style'
  | 'morning_routine'
  | 'shopping_preference';

export interface ExtractedPreference {
  category: PreferenceCategory;
  value: string;
  confidence: number;
  context?: string;
  isNegative?: boolean;
  rawText: string;
}

// ============================================================================
// PATTERNS
// ============================================================================

// NFL Teams
const NFL_TEAMS: Record<string, string> = {
  eagles: 'eagles',
  cowboys: 'cowboys',
  giants: 'giants',
  commanders: 'commanders',
  redskins: 'commanders',
  patriots: 'patriots',
  chiefs: 'chiefs',
  bills: 'bills',
  dolphins: 'dolphins',
  jets: 'jets',
  '49ers': '49ers',
  niners: '49ers',
  seahawks: 'seahawks',
  rams: 'rams',
  cardinals: 'cardinals',
  packers: 'packers',
  bears: 'bears',
  vikings: 'vikings',
  lions: 'lions',
  saints: 'saints',
  buccaneers: 'buccaneers',
  bucs: 'buccaneers',
  falcons: 'falcons',
  panthers: 'panthers',
  steelers: 'steelers',
  ravens: 'ravens',
  browns: 'browns',
  bengals: 'bengals',
  titans: 'titans',
  colts: 'colts',
  texans: 'texans',
  jaguars: 'jaguars',
  broncos: 'broncos',
  raiders: 'raiders',
  chargers: 'chargers',
};

// NBA Teams
const NBA_TEAMS: Record<string, string> = {
  lakers: 'lakers',
  warriors: 'warriors',
  celtics: 'celtics',
  sixers: 'sixers',
  '76ers': 'sixers',
  nets: 'nets',
  knicks: 'knicks',
  bucks: 'bucks',
  heat: 'heat',
  bulls: 'bulls',
  suns: 'suns',
  mavericks: 'mavericks',
  mavs: 'mavericks',
  nuggets: 'nuggets',
  clippers: 'clippers',
  spurs: 'spurs',
  rockets: 'rockets',
  thunder: 'thunder',
  blazers: 'blazers',
  jazz: 'jazz',
  kings: 'kings',
  pelicans: 'pelicans',
  grizzlies: 'grizzlies',
  timberwolves: 'timberwolves',
  wolves: 'timberwolves',
  hawks: 'hawks',
  hornets: 'hornets',
  cavaliers: 'cavaliers',
  cavs: 'cavaliers',
  pistons: 'pistons',
  pacers: 'pacers',
  raptors: 'raptors',
  wizards: 'wizards',
  magic: 'magic',
};

// MLB Teams
const MLB_TEAMS: Record<string, string> = {
  phillies: 'phillies',
  yankees: 'yankees',
  mets: 'mets',
  'red sox': 'red sox',
  redsox: 'red sox',
  dodgers: 'dodgers',
  cubs: 'cubs',
  'white sox': 'white sox',
  braves: 'braves',
  astros: 'astros',
  padres: 'padres',
  mariners: 'mariners',
  guardians: 'guardians',
  indians: 'guardians',
  twins: 'twins',
  brewers: 'brewers',
  cardinals: 'cardinals',
  reds: 'reds',
  pirates: 'pirates',
  royals: 'royals',
  tigers: 'tigers',
  orioles: 'orioles',
  rays: 'rays',
  bluejays: 'blue jays',
  'blue jays': 'blue jays',
  athletics: 'athletics',
  angels: 'angels',
  rangers: 'rangers',
  rockies: 'rockies',
  diamondbacks: 'diamondbacks',
  dbacks: 'diamondbacks',
  giants: 'giants',
  nationals: 'nationals',
  marlins: 'marlins',
};

// NHL Teams
const NHL_TEAMS: Record<string, string> = {
  flyers: 'flyers',
  penguins: 'penguins',
  rangers: 'rangers',
  devils: 'devils',
  islanders: 'islanders',
  bruins: 'bruins',
  blackhawks: 'blackhawks',
  'maple leafs': 'maple leafs',
  leafs: 'maple leafs',
  canadiens: 'canadiens',
  habs: 'canadiens',
  capitals: 'capitals',
  caps: 'capitals',
  hurricanes: 'hurricanes',
  lightning: 'lightning',
  panthers: 'panthers',
  senators: 'senators',
  sabres: 'sabres',
  'blue jackets': 'blue jackets',
  predators: 'predators',
  blues: 'blues',
  jets: 'jets',
  wild: 'wild',
  avalanche: 'avalanche',
  stars: 'stars',
  flames: 'flames',
  oilers: 'oilers',
  canucks: 'canucks',
  kraken: 'kraken',
  knights: 'knights',
  ducks: 'ducks',
  sharks: 'sharks',
  kings: 'kings',
  coyotes: 'coyotes',
};

// Stock ticker mappings
const STOCK_TICKERS: Record<string, string> = {
  apple: 'AAPL',
  aapl: 'AAPL',
  google: 'GOOGL',
  googl: 'GOOGL',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  amzn: 'AMZN',
  tesla: 'TSLA',
  tsla: 'TSLA',
  microsoft: 'MSFT',
  msft: 'MSFT',
  nvidia: 'NVDA',
  nvda: 'NVDA',
  meta: 'META',
  facebook: 'META',
  netflix: 'NFLX',
  nflx: 'NFLX',
  disney: 'DIS',
  dis: 'DIS',
  paypal: 'PYPL',
  pypl: 'PYPL',
  amd: 'AMD',
  intel: 'INTC',
  intc: 'INTC',
  salesforce: 'CRM',
  crm: 'CRM',
  oracle: 'ORCL',
  orcl: 'ORCL',
  ibm: 'IBM',
  adobe: 'ADBE',
  adbe: 'ADBE',
};

// News topics
const NEWS_TOPICS = [
  'tech',
  'finance',
  'science',
  'sports',
  'business',
  'health',
  'entertainment',
  'world',
];

// Avoid topics
const AVOID_PATTERNS = ['politics', 'political', 'religion', 'religious'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function findTeam(text: string): { team: string; league: string } | null {
  const lowerText = text.toLowerCase();

  // Check NFL
  for (const [pattern, team] of Object.entries(NFL_TEAMS)) {
    if (lowerText.includes(pattern)) {
      return { team, league: 'NFL' };
    }
  }

  // Check NBA
  for (const [pattern, team] of Object.entries(NBA_TEAMS)) {
    if (lowerText.includes(pattern)) {
      return { team, league: 'NBA' };
    }
  }

  // Check MLB
  for (const [pattern, team] of Object.entries(MLB_TEAMS)) {
    if (lowerText.includes(pattern)) {
      return { team, league: 'MLB' };
    }
  }

  // Check NHL
  for (const [pattern, team] of Object.entries(NHL_TEAMS)) {
    if (lowerText.includes(pattern)) {
      return { team, league: 'NHL' };
    }
  }

  return null;
}

function findStock(text: string): string | null {
  const lowerText = text.toLowerCase();

  for (const [pattern, ticker] of Object.entries(STOCK_TICKERS)) {
    if (lowerText.includes(pattern)) {
      return ticker;
    }
  }

  return null;
}

function isFanContext(text: string): boolean {
  const lowerText = text.toLowerCase();
  const fanPatterns = [
    /i('m| am) (a|an|huge|big)? ?fan/,
    /i love the/,
    /i root for/,
    /i support/,
    /i follow/,
    /my (favorite )?team/,
    /we('re| are) (huge|big)? ?fans?/,
    /go \w+!/i,
    /\w+ (is|are) my team/,
  ];

  return fanPatterns.some((p) => p.test(lowerText));
}

function isStockContext(text: string): boolean {
  const lowerText = text.toLowerCase();
  const stockPatterns = [
    /i own/,
    /i bought/,
    /i have (invested|shares|stock)/,
    /i('m| am) (watching|following|invested)/,
    /i invested/,
    /my (portfolio|stocks|investments)/,
  ];

  return stockPatterns.some((p) => p.test(lowerText));
}

function isLocationContext(text: string): 'home' | 'work' | null {
  const lowerText = text.toLowerCase();

  if (/i (live|reside|stay) in|my home is|i('m| am) from/.test(lowerText)) {
    return 'home';
  }

  if (/i work in|my office is|i commute to/.test(lowerText)) {
    return 'work';
  }

  return null;
}

function extractLocation(text: string): string | null {
  // Simple city extraction - in production, would use NLP
  const cityPatterns = [
    /in ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
    /from ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
    /to ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
  ];

  for (const pattern of cityPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

function isAllergyContext(text: string): boolean {
  const lowerText = text.toLowerCase();
  return /allerg(y|ies|ic)|i('m| am) allergic/.test(lowerText);
}

function extractAllergen(text: string): string | null {
  const lowerText = text.toLowerCase();
  const allergens = [
    'peanut',
    'peanuts',
    'shellfish',
    'dairy',
    'gluten',
    'eggs',
    'soy',
    'wheat',
    'fish',
    'tree nuts',
    'sesame',
    'seasonal',
  ];

  for (const allergen of allergens) {
    if (lowerText.includes(allergen)) {
      return allergen.replace(/s$/, ''); // Normalize plural
    }
  }

  return null;
}

function isHealthContext(text: string): boolean {
  const lowerText = text.toLowerCase();
  return /i have|i('m| am) (diagnosed|living) with|suffer from/.test(lowerText);
}

function extractHealthCondition(text: string): string | null {
  const lowerText = text.toLowerCase();
  const conditions = [
    'asthma',
    'diabetes',
    'hypertension',
    'arthritis',
    'anxiety',
    'depression',
    'insomnia',
    'migraines',
    'adhd',
  ];

  for (const condition of conditions) {
    if (lowerText.includes(condition)) {
      return condition;
    }
  }

  return null;
}

function isAvoidContext(text: string): boolean {
  const lowerText = text.toLowerCase();
  return /don('t| not) want|avoid|skip|stresses? me|keep.*away/.test(lowerText);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Check if text contains any preference-related content
 */
export function hasPreferenceContent(text: string): boolean {
  if (!text || text.length < 5) return false;

  const lowerText = text.toLowerCase();

  // Fan context
  if (isFanContext(text)) return true;

  // Stock context
  if (isStockContext(text)) return true;

  // Location context
  if (isLocationContext(text)) return true;

  // Allergy context
  if (isAllergyContext(text)) return true;

  // Health context
  if (isHealthContext(text)) return true;

  // News interest
  if (/i (like|love|want|prefer|enjoy)/.test(lowerText)) {
    for (const topic of NEWS_TOPICS) {
      if (lowerText.includes(topic)) return true;
    }
  }

  // Avoid context
  if (isAvoidContext(text)) {
    for (const pattern of AVOID_PATTERNS) {
      if (lowerText.includes(pattern)) return true;
    }
  }

  return false;
}

/**
 * Extract preferences from natural conversation text
 */
export function extractPreferences(text: string): ExtractedPreference[] {
  if (!text || text.length < 3) return [];

  const preferences: ExtractedPreference[] = [];
  const lowerText = text.toLowerCase();

  // Sports team extraction
  if (isFanContext(text)) {
    const teamResult = findTeam(text);
    if (teamResult) {
      preferences.push({
        category: 'sports_team',
        value: teamResult.team,
        confidence: 0.9,
        context: teamResult.league,
        rawText: text,
      });
    }
  }

  // Stock extraction
  if (isStockContext(text)) {
    const ticker = findStock(text);
    if (ticker) {
      preferences.push({
        category: 'stock_watchlist',
        value: ticker,
        confidence: 0.85,
        rawText: text,
      });
    }
  }

  // Location extraction
  const locationType = isLocationContext(text);
  if (locationType) {
    const location = extractLocation(text);
    if (location) {
      preferences.push({
        category: locationType === 'home' ? 'home_location' : 'work_location',
        value: location,
        confidence: 0.8,
        rawText: text,
      });
    }
  }

  // Allergy extraction
  if (isAllergyContext(text)) {
    const allergen = extractAllergen(text);
    if (allergen) {
      preferences.push({
        category: 'allergy',
        value: allergen,
        confidence: 0.9,
        rawText: text,
      });
    }
  }

  // Health condition extraction
  if (isHealthContext(text)) {
    const condition = extractHealthCondition(text);
    if (condition) {
      preferences.push({
        category: 'health_condition',
        value: condition,
        confidence: 0.85,
        rawText: text,
      });
    }
  }

  // News interest extraction
  for (const topic of NEWS_TOPICS) {
    if (lowerText.includes(topic) && /i (like|love|want|prefer|enjoy|interested)/.test(lowerText)) {
      preferences.push({
        category: 'news_interest',
        value: topic,
        confidence: 0.75,
        rawText: text,
      });
      break;
    }
  }

  // Avoid topic extraction
  if (isAvoidContext(text)) {
    for (const pattern of AVOID_PATTERNS) {
      if (lowerText.includes(pattern)) {
        preferences.push({
          category: 'avoid_topic',
          value: pattern,
          confidence: 0.85,
          isNegative: true,
          rawText: text,
        });
        break;
      }
    }
  }

  if (preferences.length > 0) {
    log.debug({ count: preferences.length, text: text.substring(0, 50) }, 'Extracted preferences');
  }

  return preferences;
}

export default {
  extractPreferences,
  hasPreferenceContent,
};
