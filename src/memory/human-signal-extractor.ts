/**
 * Human Signal Extractor
 *
 * Extracts human-centric memory signals from conversations.
 * These patterns are what make someone feel truly known.
 *
 * Used at session end to detect:
 * - Important dates mentioned
 * - Emotional patterns and tells
 * - Values and dreams expressed
 * - Growth moments observed
 * - Topics avoided
 * - Inside joke potential
 *
 * @module HumanSignalExtractor
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  ImportantDate,
  InsideJoke,
  RunningTheme,
  CoreValue,
  Dream,
  Fear,
  GrowthMarker,
  ChallengeProgress,
  RecurringAvoidance,
  ComfortPattern,
  StressTrigger,
  EmotionalTell,
  HumanMemory,
} from '../types/human-memory.js';

const log = getLogger().child({ module: 'HumanSignalExtractor' });

// ============================================================================
// TYPES
// ============================================================================

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface ExtractionContext {
  userId: string;
  personaId: string;
  userName?: string;
  existingMemory?: Partial<HumanMemory>;
  sessionEmotion?: string;
}

interface ExtractionResult {
  importantDates: ImportantDate[];
  insideJokes: InsideJoke[];
  runningThemes: RunningTheme[];
  values: CoreValue[];
  dreams: Dream[];
  fears: Fear[];
  growthMarkers: GrowthMarker[];
  challenges: ChallengeProgress[];
  avoidances: RecurringAvoidance[];
  comfortPatterns: ComfortPattern[];
  stressTriggers: StressTrigger[];
  emotionalTells: EmotionalTell[];
}

// ============================================================================
// DATE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting important dates in conversation
 */
const DATE_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // BIRTHDAYS - Personal and family members
  // ═══════════════════════════════════════════════════════════════════════════
  { pattern: /my birthday is (on )?(\w+ \d+|\d+\/\d+)/i, type: 'birthday' as const },
  { pattern: /(?:i|we) (?:turn|turned) (\d+) (?:on|in) (\w+)/i, type: 'birthday' as const },
  { pattern: /born (?:on |in )(\w+ \d+|\d+\/\d+)/i, type: 'birthday' as const },
  // Family birthdays: "my mom's birthday is June 15"
  { pattern: /(?:my |our )(\w+)'s birthday is (on )?(\w+ \d+|\d+\/\d+)/i, type: 'birthday' as const },
  // Friend birthdays: "Sarah's birthday is next week"
  { pattern: /(\w+)'s birthday is (on )?(\w+ \d+|\d+\/\d+|next \w+)/i, type: 'birthday' as const },
  // Kid birthdays: "my son turns 5 in March"
  { pattern: /(?:my |our )(?:son|daughter|kid|child) (?:turns|is turning) (\d+) (?:on|in) (\w+)/i, type: 'birthday' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANNIVERSARIES - Marriage and relationships
  // ═══════════════════════════════════════════════════════════════════════════
  { pattern: /(?:our|my) anniversary is (on )?(\w+ \d+|\d+\/\d+)/i, type: 'anniversary' as const },
  { pattern: /(?:married|got married) (?:on |in )(\w+ \d+|\d{4})/i, type: 'anniversary' as const },
  { pattern: /(\d+) years? (?:married|together)/i, type: 'anniversary' as const },
  // Dating anniversary: "we've been together since 2019"
  { pattern: /(?:been|started) (?:together|dating) (?:since|in) (\w+ \d+|\d{4})/i, type: 'anniversary' as const },
  // Wedding date: "our wedding was on June 20"
  { pattern: /(?:our |the )wedding (?:was|is) (?:on |in )(\w+ \d+|\d{4})/i, type: 'anniversary' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOSS ANNIVERSARIES - Sensitive and important
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Direct: "passed away on October 5" or "died in 2020"
    pattern: /(?:passed away|died|lost)(?: \w+)? (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // With subject: "my mom passed away on October 5"
    pattern: /(?:my |our |the )?\w+ (?:passed away|died) (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // Loss with person reference: "I lost my mom on October 5"
    pattern: /(?:i |we )lost (?:my |our )?\w+ (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // Time since loss: "it's been 5 years since she passed"
    pattern: /it(?:'s| will be| has been) (\d+) years? since (?:.*?) (?:passed|died|lost)/i,
    type: 'loss_anniversary' as const,
  },
  // Pet loss: "we lost our dog last year"
  {
    pattern: /(?:lost|put down) (?:my |our )?(?:dog|cat|pet) (?:on |in |last )(\w+ \d+|\d{4}|\w+)/i,
    type: 'loss_anniversary' as const,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MILESTONES - Recovery and personal achievements
  // ═══════════════════════════════════════════════════════════════════════════
  { pattern: /(\d+) years? sober/i, type: 'milestone' as const },
  {
    pattern: /quit (?:smoking|drinking) (\d+) (?:years?|months?) ago/i,
    type: 'milestone' as const,
  },
  { pattern: /started (?:.*) (\d+) (?:years?|months?) ago/i, type: 'milestone' as const },
  // Recovery: "clean since January 2020"
  { pattern: /(?:clean|sober) since (\w+ \d+|\d{4})/i, type: 'milestone' as const },
  // Health: "cancer-free for 2 years"
  { pattern: /(?:cancer-free|in remission) (?:for |since )(\d+) (?:years?|months?)/i, type: 'milestone' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAREER DATES - Work milestones (mapped to 'milestone' or 'recurring')
  // ═══════════════════════════════════════════════════════════════════════════
  // Start date: "I started at Google in 2020"
  { pattern: /started (?:at |working at )?(?:\w+) (?:in |on )(\w+ \d+|\d{4})/i, type: 'milestone' as const },
  // Work anniversary: "my work anniversary is March 1"
  { pattern: /(?:work|job) anniversary (?:is |on )(\w+ \d+|\d+\/\d+)/i, type: 'recurring' as const },
  // Retirement: "retiring in June"
  { pattern: /(?:retir(?:ing|e)) (?:in |on )(\w+ \d+|\d{4})/i, type: 'milestone' as const },
  // Promotion: "got promoted last month"
  { pattern: /(?:got |was )promoted (?:in |on |last )(\w+ \d+|\d{4}|\w+)/i, type: 'celebration' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // EDUCATION DATES - Academic milestones (mapped to 'celebration' or 'milestone')
  // ═══════════════════════════════════════════════════════════════════════════
  // Graduation: "graduating in May 2026"
  { pattern: /graduat(?:ed|ing|e) (?:in |on )(\w+ \d+|\d{4})/i, type: 'celebration' as const },
  // Starting school: "starts kindergarten in September"
  { pattern: /(?:start(?:s|ed|ing)) (?:school|college|university|kindergarten) (?:in |on )(\w+ \d+|\d{4})/i, type: 'milestone' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDICAL DATES - Health appointments (mapped to 'custom')
  // ═══════════════════════════════════════════════════════════════════════════
  // Surgery: "surgery scheduled for next Monday"
  { pattern: /surgery (?:scheduled |is )?(?:for |on )(\w+ \d+|next \w+)/i, type: 'custom' as const },
  // Doctor appointment: "doctor's appointment on Tuesday"
  { pattern: /(?:doctor|therapist|dentist)(?:'s)? appointment (?:on |is |scheduled )?(\w+ \d+|next \w+|this \w+)/i, type: 'custom' as const },
  // Due date: "baby due in March"
  { pattern: /(?:baby |due date |due )(?:is |in |on )(\w+ \d+|\d{4})/i, type: 'celebration' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAVEL & EVENTS - Upcoming plans (mapped to 'custom')
  // ═══════════════════════════════════════════════════════════════════════════
  // Trip: "trip to Hawaii in June"
  { pattern: /(?:trip|vacation|holiday) (?:to \w+ )?(?:in |on |scheduled )(\w+ \d+|\d{4}|next \w+)/i, type: 'custom' as const },
  // Event: "the wedding is on June 20"
  { pattern: /(?:the |my |our )(?:wedding|party|reunion|conference) (?:is |on )(\w+ \d+|\d{4})/i, type: 'celebration' as const },
  // Moving: "moving to Chicago in August"
  { pattern: /(?:moving|move) (?:to \w+ )?(?:in |on )(\w+ \d+|\d{4})/i, type: 'milestone' as const },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL DAYS - Holidays and traditions (mapped to 'recurring')
  // ═══════════════════════════════════════════════════════════════════════════
  // Christmas/Holidays: "we always spend Christmas at grandma's"
  { pattern: /(?:christmas|thanksgiving|easter|hanukkah|diwali|eid)/i, type: 'recurring' as const },
  // Family tradition: "every Thanksgiving we..."
  { pattern: /every (\w+) we/i, type: 'recurring' as const },
];

/**
 * Extract important dates from conversation
 */
function extractDates(turns: ConversationTurn[], context: ExtractionContext): ImportantDate[] {
  const dates: ImportantDate[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, type } of DATE_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        // Parse the date - check all capture groups for a valid date
        // Some patterns have optional groups so we try match[2], match[1], etc.
        let dateText: string | undefined;
        for (let i = match.length - 1; i >= 1; i--) {
          if (match[i] && isLikelyDateText(match[i])) {
            dateText = match[i];
            break;
          }
        }
        // Fallback to old behavior if no date-like text found
        if (!dateText) {
          dateText = match[2] || match[1];
        }
        const parsed = parseFlexibleDate(dateText);

        if (parsed) {
          dates.push({
            id: `date_${type}_${Date.now()}`,
            type,
            label: `${context.userName || 'User'}'s ${type.replace('_', ' ')}`,
            month: parsed.month,
            day: parsed.day,
            year: parsed.year,
            significance: type === 'loss_anniversary' ? 'major' : 'meaningful',
            wantsAcknowledgment: type !== 'loss_anniversary', // Default: don't assume for sensitive dates
            sentiment:
              type === 'loss_anniversary'
                ? 'sensitive'
                : type === 'birthday'
                  ? 'celebratory'
                  : 'neutral',
            discoveredAt: now,
          });
        }
      }
    }
  }

  return dates;
}

/**
 * Check if a string looks like date text (month name, year, or date format)
 */
function isLikelyDateText(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Month names
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];

  // Check for month name (with optional day)
  if (monthNames.some((m) => lower.includes(m))) return true;

  // Check for year (4 digits in reasonable range)
  const yearMatch = text.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1900 && year <= 2100) return true;
  }

  // Check for MM/DD or similar formats
  if (/\d+\/\d+/.test(text)) return true;

  return false;
}

/**
 * Parse a flexible date string into month/day/year
 */
function parseFlexibleDate(dateText: string): { month: number; day: number; year?: number } | null {
  // Month name + day
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthMatch = dateText.toLowerCase().match(/(\w+)\s+(\d+)/);
  if (monthMatch) {
    const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    if (monthIdx >= 0) {
      return { month: monthIdx + 1, day: parseInt(monthMatch[2], 10) };
    }
  }

  // MM/DD format
  const slashMatch = dateText.match(/(\d+)\/(\d+)/);
  if (slashMatch) {
    return { month: parseInt(slashMatch[1], 10), day: parseInt(slashMatch[2], 10) };
  }

  // Year-only (for loss anniversaries like "in 2019")
  // Use January 1st as placeholder for year-only dates
  const yearOnlyMatch = dateText.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      return { month: 1, day: 1, year };
    }
  }

  return null;
}

// ============================================================================
// VALUE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting core values
 */
const VALUE_PATTERNS = [
  { pattern: /family (?:comes?|is) first/i, value: 'family first' },
  { pattern: /(?:i|we) always (?:try to )?be honest/i, value: 'honesty' },
  { pattern: /hard work (?:pays off|is important)/i, value: 'hard work' },
  { pattern: /(?:i|we) believe in (?:being )?fair/i, value: 'fairness' },
  { pattern: /kindness (?:matters|is important)/i, value: 'kindness' },
  { pattern: /(?:my|the) word is (?:my|sacred|important)/i, value: 'integrity' },
  { pattern: /giving back (?:is important|matters)/i, value: 'generosity' },
  { pattern: /(?:i|we) value (?:my|our) independence/i, value: 'independence' },
  { pattern: /education is (?:important|everything)/i, value: 'education' },
  { pattern: /(?:i|we) prioritize (?:my|our) health/i, value: 'health' },
];

/**
 * Extract core values from conversation
 */
function extractValues(turns: ConversationTurn[]): CoreValue[] {
  const values: CoreValue[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, value } of VALUE_PATTERNS) {
      if (pattern.test(turn.content)) {
        values.push({
          id: `value_${value.replace(/\s+/g, '_')}_${Date.now()}`,
          value,
          evidence: [turn.content.slice(0, 200)],
          strength: 'mentioned',
          discoveredAt: now,
        });
      }
    }
  }

  return values;
}

// ============================================================================
// DREAM EXTRACTION
// ============================================================================

/**
 * Patterns for detecting dreams and aspirations
 */
const DREAM_PATTERNS = [
  { pattern: /(?:i|we) (?:dream|hope|wish) (?:of|to) (.+)/i, category: 'other' as const },
  { pattern: /someday (?:i|we) (?:want to|hope to) (.+)/i, category: 'other' as const },
  { pattern: /(?:i|we) always wanted to (.+)/i, category: 'other' as const },
  { pattern: /my dream (?:job|career) (?:is|would be) (.+)/i, category: 'career' as const },
  { pattern: /(?:i|we) (?:want to|hope to) travel to (.+)/i, category: 'travel' as const },
  { pattern: /(?:i|we) (?:want to|hope to) learn (.+)/i, category: 'learning' as const },
  { pattern: /(?:i|we) (?:want to|hope to) write (.+)/i, category: 'creative' as const },
  { pattern: /(?:i|we) (?:want to|hope to) start (.+)/i, category: 'career' as const },
];

/**
 * Extract dreams from conversation
 */
function extractDreams(turns: ConversationTurn[]): Dream[] {
  const dreams: Dream[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, category } of DREAM_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        dreams.push({
          id: `dream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          description: match[1].slice(0, 200),
          category,
          sentiment: 'excited',
          status: 'someday',
          firstMentioned: now,
        });
      }
    }
  }

  return dreams;
}

// ============================================================================
// FEAR EXTRACTION
// ============================================================================

/**
 * Patterns for detecting fears and worries
 */
const FEAR_PATTERNS = [
  { pattern: /(?:i'm |i am )?(?:afraid|scared) (?:of|that) (.+)/i },
  { pattern: /(?:i|we) (?:worry|worries) about (.+)/i },
  { pattern: /my (?:biggest|greatest) fear is (.+)/i },
  { pattern: /(?:what if|i'm worried) (.+)/i },
  { pattern: /(?:i|we) can't stop thinking about (.+)/i },
  { pattern: /(?:i|we) (?:dread|hate) (.+)/i },
];

/**
 * Extract fears from conversation
 */
function extractFears(turns: ConversationTurn[]): Fear[] {
  const fears: Fear[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of FEAR_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        fears.push({
          id: `fear_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          fear: match[1].slice(0, 200),
          frequency: 'occasional',
          discoveredAt: now,
          sensitivity: 'tread_carefully',
        });
      }
    }
  }

  return fears;
}

// ============================================================================
// STRESS TRIGGER EXTRACTION
// ============================================================================

/**
 * Patterns for detecting stress triggers
 */
const STRESS_PATTERNS = [
  {
    pattern: /(?:work|my job|boss|deadline) (?:is|are) (?:stressing|killing|overwhelming)/i,
    category: 'work' as const,
  },
  {
    pattern: /(?:money|bills|finances) (?:is|are) (?:stressing|worrying|overwhelming)/i,
    category: 'financial' as const,
  },
  {
    pattern: /(?:health|doctor|medical) (?:is|are) (?:stressing|worrying)/i,
    category: 'health' as const,
  },
  {
    pattern: /(?:family|kids|parents|spouse) (?:is|are) (?:stressing|overwhelming)/i,
    category: 'relationships' as const,
  },
  {
    pattern: /(?:running late|too much to do|no time) (?:stresses|overwhelms)/i,
    category: 'time' as const,
  },
  {
    pattern: /(?:not knowing|uncertainty|waiting) (?:is|makes me) (?:anxious|stressed)/i,
    category: 'uncertainty' as const,
  },
];

/**
 * Extract stress triggers from conversation
 */
function extractStressTriggers(turns: ConversationTurn[]): StressTrigger[] {
  const triggers: StressTrigger[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, category } of STRESS_PATTERNS) {
      if (pattern.test(turn.content)) {
        triggers.push({
          id: `stress_${category}_${Date.now()}`,
          trigger: turn.content.slice(0, 150),
          category,
          intensity: 'moderate',
          discoveredAt: now,
        });
      }
    }
  }

  return triggers;
}

// ============================================================================
// GROWTH MARKER EXTRACTION
// ============================================================================

/**
 * Patterns for detecting growth
 */
const GROWTH_PATTERNS = [
  { pattern: /(?:i|we) used to (?:be|think|feel) (.+?) but now (.+)/i },
  { pattern: /(?:i|we) (?:finally|actually) (.+?) (?:for the first time|after)/i },
  { pattern: /(?:i|we) (?:never thought|didn't think) (?:i|we) could (.+)/i },
  { pattern: /(?:i|we) (?:overcame|got over|moved past) (.+)/i },
  { pattern: /(?:i|we)'ve (?:grown|changed|improved) (?:a lot|so much)/i },
];

/**
 * Extract growth markers from conversation
 */
function extractGrowthMarkers(turns: ConversationTurn[]): GrowthMarker[] {
  const markers: GrowthMarker[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of GROWTH_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        markers.push({
          id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          description: turn.content.slice(0, 200),
          before: match[1]?.slice(0, 100) || 'previous state',
          after: match[2]?.slice(0, 100) || 'current state',
          observedAt: now,
          acknowledged: false,
        });
      }
    }
  }

  return markers;
}

// ============================================================================
// CHALLENGE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting challenges
 */
const CHALLENGE_PATTERNS = [
  { pattern: /(?:i'm|i am|we're|we are) (?:struggling|working on|trying to) (.+)/i },
  { pattern: /(?:it's|it is) (?:hard|difficult|challenging) to (.+)/i },
  { pattern: /(?:i|we) (?:keep|can't) (?:failing|struggling) (?:to|with) (.+)/i },
  { pattern: /(?:my|our) (?:biggest|greatest) challenge is (.+)/i },
];

/**
 * Extract challenges from conversation
 */
function extractChallenges(turns: ConversationTurn[]): ChallengeProgress[] {
  const challenges: ChallengeProgress[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of CHALLENGE_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        challenges.push({
          id: `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          challenge: match[1].slice(0, 200),
          status: 'working_on_it',
          milestones: [],
          startedAt: now,
          lastUpdate: now,
        });
      }
    }
  }

  return challenges;
}

// ============================================================================
// COMFORT PATTERN EXTRACTION
// ============================================================================

/**
 * Patterns for detecting what helps/comforts
 */
const COMFORT_PATTERNS = [
  { pattern: /(?:it helps|helps me) (?:when|to) (.+)/i, type: 'validation' as const },
  { pattern: /(?:i|we) (?:feel better|calm down) when (.+)/i, type: 'validation' as const },
  {
    pattern: /(?:just|i just) (?:need|want) someone to (?:listen|hear)/i,
    type: 'presence' as const,
  },
  { pattern: /(?:talking|venting) (?:helps|makes me feel)/i, type: 'validation' as const },
  {
    pattern: /(?:i|we) (?:need|want) (?:a solution|to fix|to solve)/i,
    type: 'problem_solving' as const,
  },
  { pattern: /(?:make|makes) me laugh/i, type: 'humor' as const },
  {
    pattern: /(?:distract|change the subject|think about something else)/i,
    type: 'distraction' as const,
  },
];

/**
 * Extract comfort patterns from conversation
 */
function extractComfortPatterns(
  turns: ConversationTurn[],
  context: ExtractionContext
): ComfortPattern[] {
  const patterns: ComfortPattern[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, type } of COMFORT_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        patterns.push({
          id: `comfort_${type}_${Date.now()}`,
          type,
          effectiveFor: context.sessionEmotion || 'general stress',
          evidence: turn.content.slice(0, 150),
          discoveredAt: now,
        });
      }
    }
  }

  return patterns;
}

// ============================================================================
// INSIDE JOKE DETECTION
// ============================================================================

/**
 * Detect potential inside jokes (when user references something shared with laughter)
 */
function detectInsideJokePotential(turns: ConversationTurn[]): InsideJoke[] {
  const jokes: InsideJoke[] = [];
  const now = new Date();

  // Look for laughter indicators followed by callbacks
  const laughIndicators = /(?:haha|lol|😂|🤣|that's funny|that's hilarious|made me laugh)/i;
  const callbackIndicators = /(?:remember when|like that time|just like|reminds me of)/i;

  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const nextTurn = turns[i + 1];

    // User found something funny
    if (turn.role === 'user' && laughIndicators.test(turn.content)) {
      // Check if they're referencing something shared
      if (
        callbackIndicators.test(turn.content) ||
        callbackIndicators.test(nextTurn?.content || '')
      ) {
        // Extract the reference
        const refMatch = turn.content.match(/(?:remember when|like that time) (.+)/i);
        if (refMatch) {
          jokes.push({
            id: `joke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            reference: refMatch[1].slice(0, 100),
            origin: turn.content.slice(0, 200),
            originatedAt: now,
            usageCount: 1,
            status: 'fresh',
          });
        }
      }
    }
  }

  return jokes;
}

// ============================================================================
// AVOIDANCE DETECTION
// ============================================================================

/**
 * Patterns for detecting topic avoidance
 */
function detectAvoidances(turns: ConversationTurn[]): RecurringAvoidance[] {
  const avoidances: RecurringAvoidance[] = [];
  const now = new Date();

  // Look for deflection patterns
  const deflectionPatterns = [
    /(?:i'd rather not|let's not|can we talk about something else)/i,
    /(?:i don't want to talk about|i don't like talking about) (.+)/i,
    /(?:that's|it's) (?:a sensitive|a difficult|hard to talk about)/i,
    /(?:i'm not ready to|i can't) (?:talk about|discuss) (.+)/i,
  ];

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const pattern of deflectionPatterns) {
      const match = turn.content.match(pattern);
      if (match) {
        avoidances.push({
          id: `avoid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          topic: match[1]?.slice(0, 100) || 'sensitive topic',
          avoidanceStyle: 'deflects',
          observations: 1,
          approach: 'only_if_they_do',
          firstNoticed: now,
        });
      }
    }
  }

  return avoidances;
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract all human-centric memory signals from a conversation
 *
 * @param turns - Conversation turns
 * @param context - Extraction context (userId, existing memory, etc.)
 * @returns Extracted signals for each domain
 */
export function extractHumanSignals(
  turns: ConversationTurn[],
  context: ExtractionContext
): ExtractionResult {
  log.debug({ userId: context.userId, turnCount: turns.length }, 'Extracting human signals');

  const result: ExtractionResult = {
    importantDates: extractDates(turns, context),
    insideJokes: detectInsideJokePotential(turns),
    runningThemes: [], // Requires cross-session analysis
    values: extractValues(turns),
    dreams: extractDreams(turns),
    fears: extractFears(turns),
    growthMarkers: extractGrowthMarkers(turns),
    challenges: extractChallenges(turns),
    avoidances: detectAvoidances(turns),
    comfortPatterns: extractComfortPatterns(turns, context),
    stressTriggers: extractStressTriggers(turns),
    emotionalTells: [], // Requires voice/pattern analysis
  };

  const totalSignals = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
  log.info(
    {
      userId: context.userId,
      totalSignals,
      dates: result.importantDates.length,
      values: result.values.length,
      dreams: result.dreams.length,
      fears: result.fears.length,
      growth: result.growthMarkers.length,
      challenges: result.challenges.length,
      comfortPatterns: result.comfortPatterns.length,
      stressTriggers: result.stressTriggers.length,
    },
    'Human signal extraction complete'
  );

  return result;
}

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Check if two dates are essentially the same
 */
function isDuplicateDate(a: ImportantDate, b: ImportantDate): boolean {
  return a.month === b.month && a.day === b.day && a.type === b.type;
}

/**
 * Check if two values are essentially the same
 */
function isDuplicateValue(a: CoreValue, b: CoreValue): boolean {
  return a.value.toLowerCase() === b.value.toLowerCase();
}

/**
 * Check if two dreams are similar (fuzzy match)
 */
function isDuplicateDream(a: Dream, b: Dream): boolean {
  const aWords = new Set(a.description.toLowerCase().split(/\s+/));
  const bWords = new Set(b.description.toLowerCase().split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w) && w.length > 3);
  return (
    intersection.length > 3 || a.description.toLowerCase().includes(b.description.toLowerCase())
  );
}

/**
 * Check if two fears are similar
 */
function isDuplicateFear(a: Fear, b: Fear): boolean {
  const aWords = new Set(a.fear.toLowerCase().split(/\s+/));
  const bWords = new Set(b.fear.toLowerCase().split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w) && w.length > 3);
  return intersection.length > 2;
}

/**
 * Check if two stress triggers are similar
 */
function isDuplicateTrigger(a: StressTrigger, b: StressTrigger): boolean {
  return (
    a.category === b.category &&
    a.trigger.toLowerCase().includes(b.trigger.toLowerCase().slice(0, 30))
  );
}

/**
 * Check if two comfort patterns are similar
 */
function isDuplicateComfort(a: ComfortPattern, b: ComfortPattern): boolean {
  return a.type === b.type && a.effectiveFor.toLowerCase() === b.effectiveFor.toLowerCase();
}

/**
 * Deduplicate array using similarity function
 */
function dedupeArray<T>(existing: T[], newItems: T[], isDuplicate: (a: T, b: T) => boolean): T[] {
  const result = [...existing];

  for (const item of newItems) {
    const exists = result.some((e) => isDuplicate(e, item));
    if (!exists) {
      result.push(item);
    }
  }

  return result;
}

// ============================================================================
// MERGE WITH DEDUPLICATION
// ============================================================================

/**
 * Merge extracted signals into existing human memory with deduplication
 */
export function mergeSignalsIntoMemory(
  existing: Partial<HumanMemory> | undefined,
  extracted: ExtractionResult
): Partial<HumanMemory> {
  const now = new Date();

  return {
    // Dedupe dates by month/day/type
    importantDates: dedupeArray(
      existing?.importantDates || [],
      extracted.importantDates,
      isDuplicateDate
    ),
    // Dedupe inside jokes by reference text similarity
    insideJokes: [
      ...(existing?.insideJokes || []),
      ...extracted.insideJokes.filter(
        (newJoke) =>
          !(existing?.insideJokes || []).some(
            (e) => e.reference.toLowerCase() === newJoke.reference.toLowerCase()
          )
      ),
    ],
    runningThemes: existing?.runningThemes || [],
    userTeachings: existing?.userTeachings || [],
    identity: {
      // Dedupe values by value text
      values: dedupeArray(existing?.identity?.values || [], extracted.values, isDuplicateValue),
      // Dedupe dreams by description similarity
      dreams: dedupeArray(existing?.identity?.dreams || [], extracted.dreams, isDuplicateDream),
      // Dedupe fears by text similarity
      fears: dedupeArray(existing?.identity?.fears || [], extracted.fears, isDuplicateFear),
      formativeExperiences: existing?.identity?.formativeExperiences || [],
      updatedAt: now,
    },
    emotionalSignature: {
      humor: existing?.emotionalSignature?.humor || {
        appreciates: [],
        avoids: [],
        successfulMoments: [],
        overallLevel: 'enjoys_moderately',
      },
      // Dedupe comfort patterns by type + effectiveFor
      comfortPatterns: dedupeArray(
        existing?.emotionalSignature?.comfortPatterns || [],
        extracted.comfortPatterns,
        isDuplicateComfort
      ),
      tells: existing?.emotionalSignature?.tells || [],
      // Dedupe stress triggers by category + trigger text
      stressTriggers: dedupeArray(
        existing?.emotionalSignature?.stressTriggers || [],
        extracted.stressTriggers,
        isDuplicateTrigger
      ),
      updatedAt: now,
    },
    growthArc: {
      // Growth markers are unique events, but dedupe by description similarity
      markers: dedupeArray(existing?.growthArc?.markers || [], extracted.growthMarkers, (a, b) =>
        a.description.toLowerCase().includes(b.description.toLowerCase().slice(0, 50))
      ),
      // Challenges dedupe by challenge text
      challenges: dedupeArray(existing?.growthArc?.challenges || [], extracted.challenges, (a, b) =>
        a.challenge.toLowerCase().includes(b.challenge.toLowerCase().slice(0, 30))
      ),
      updatedAt: now,
    },
    unspoken: {
      // Avoidances - merge observations if same topic
      avoidances: mergeAvoidances(existing?.unspoken?.avoidances || [], extracted.avoidances),
      reachOutPatterns: existing?.unspoken?.reachOutPatterns || [],
      energyPatterns: existing?.unspoken?.energyPatterns || [],
      updatedAt: now,
    },
    temporal: existing?.temporal,
    updatedAt: now,
  };
}

/**
 * Merge avoidances - if same topic exists, increment observations
 */
function mergeAvoidances(
  existing: RecurringAvoidance[],
  newAvoidances: RecurringAvoidance[]
): RecurringAvoidance[] {
  const result = [...existing];

  for (const newAvoid of newAvoidances) {
    const existingIdx = result.findIndex(
      (e) => e.topic.toLowerCase() === newAvoid.topic.toLowerCase()
    );

    if (existingIdx >= 0) {
      // Same topic - increment observations
      result[existingIdx] = {
        ...result[existingIdx],
        observations: result[existingIdx].observations + 1,
      };
    } else {
      // New topic
      result.push(newAvoid);
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractHumanSignals,
  mergeSignalsIntoMemory,
};
