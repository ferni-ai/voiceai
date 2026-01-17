/**
 * Dynamic Tool Router - Intent Detection for Tool Loading
 *
 * Analyzes user transcripts to detect intent and determine which tool domains
 * should be loaded. Used by UnifiedToolOrchestrator for intelligent tool selection.
 *
 * ARCHITECTURE:
 * - Tier 0 (Always): Core tools - memory, handoff, entertainment
 * - Tier 1 (Common): Frequently needed - information, games, awareness
 * - Tier 2 (Contextual): Loaded on-demand based on detected intent
 *
 * RESEARCH BASIS:
 * - Google recommends 10-20 tools max for reliable function calling
 * - JSPLIT paper: hierarchical tool organization reduces prompt size 3x
 * - Our testing: 56 tools breaks function calling, 20 tools works
 */

// ============================================================================
// TOOL HIERARCHY
// ============================================================================

/**
 * Tool domains organized by priority tier.
 * Used by UnifiedToolOrchestrator's alwaysDomains config.
 */
export const TOOL_TIERS = {
  /** Always loaded - essential for every conversation */
  TIER_0_ALWAYS: [
    'memory', // Remember/recall user info
    'handoff', // Team coordination
    'entertainment', // Music playback
  ] as const,

  /** Commonly needed - loaded by default but can be swapped */
  TIER_1_COMMON: [
    'information', // Weather, search, news
    'games', // Interactive games
    'awareness', // Context awareness
  ] as const,

  /** Contextual - loaded only when intent detected */
  TIER_2_CONTEXTUAL: {
    // Emotional support domains
    grief: {
      keywords: [
        'died',
        'death',
        'passed away',
        'funeral',
        'mourning',
        'grieving',
        'grief',
        'loss',
        'miss them',
        'gone',
      ],
      domains: ['grief'],
    },
    vulnerability: {
      keywords: [
        'secret',
        'never told',
        'ashamed',
        'embarrassed',
        'shame',
        'afraid to say',
        'scared to admit',
      ],
      domains: ['vulnerability'],
    },
    crisis: {
      keywords: [
        'crisis',
        'emergency',
        'panic',
        'cant cope',
        'falling apart',
        'breaking down',
        'suicidal',
        'hurt myself',
      ],
      domains: ['crisis'],
    },
    meaning: {
      keywords: [
        'purpose',
        'meaning',
        'why am i',
        'whats the point',
        'existential',
        'lost in life',
        'dont know why',
      ],
      domains: ['meaning'],
    },
    presence: {
      keywords: [
        'anxious',
        'anxiety',
        'panic',
        'overwhelmed',
        'cant breathe',
        'stressed',
        'racing thoughts',
        'calm down',
      ],
      domains: ['presence'],
    },
    // === ORPHANED EMOTIONAL DOMAINS (wired Jan 2026) ===
    envy: {
      keywords: [
        'jealous',
        'envious',
        'comparing myself',
        'they have',
        'not fair',
        'why them',
        'social media makes me feel',
        'everyone else has',
        'comparison',
      ],
      domains: ['envy'],
    },
    shame: {
      keywords: [
        'ashamed',
        'embarrassed',
        'humiliated',
        'cant tell anyone',
        'secret',
        'what would people think',
        'disgusted with myself',
        'unworthy',
        'not good enough',
      ],
      domains: ['shame'],
    },
    resentment: {
      keywords: [
        'resent',
        'grudge',
        'cant forgive',
        'still angry about',
        'they did this to me',
        'never apologized',
        'unfair',
        'bitter',
        'holding onto',
      ],
      domains: ['resentment'],
    },

    // Life situation domains
    relationships: {
      keywords: [
        'relationship',
        'partner',
        'spouse',
        'dating',
        'marriage',
        'divorce',
        'breakup',
        'boyfriend',
        'girlfriend',
      ],
      domains: ['relationships', 'connection'],
    },
    life_transitions: {
      keywords: [
        'new job',
        'moving',
        'retirement',
        'baby',
        'pregnant',
        'empty nest',
        'career change',
        'starting over',
      ],
      domains: ['life-transitions', 'second-chances'],
    },
    // === MIDLIFE & LEGACY DOMAINS (wired Jan 2026) ===
    midlife: {
      keywords: [
        'midlife',
        'turning 40',
        'turning 50',
        'half my life',
        'is this it',
        'second half',
        'what have I done',
        'midlife crisis',
        'lost years',
      ],
      domains: ['midlife'],
    },
    empty_nest: {
      keywords: [
        'empty nest',
        'kids left',
        'children moved out',
        'house is quiet',
        'all grown up',
        'on my own now',
      ],
      domains: ['empty-nest', 'midlife'],
    },
    // === IDENTITY TRANSITION DOMAINS (wired Jan 2026) ===
    coming_out: {
      keywords: [
        'coming out',
        'gay',
        'lesbian',
        'bisexual',
        'trans',
        'queer',
        'sexuality',
        'gender identity',
        'closet',
        'hiding who I am',
      ],
      domains: ['coming-out'],
    },
    faith_transition: {
      keywords: [
        'lost my faith',
        'leaving church',
        'religious doubt',
        'deconstructing',
        'dont believe anymore',
        'questioning faith',
        'spiritual crisis',
      ],
      domains: ['faith-transition'],
    },
    blended_family: {
      keywords: [
        'stepchildren',
        'stepparent',
        'blended family',
        'his kids',
        'her kids',
        'co-parenting',
        'step mom',
        'step dad',
      ],
      domains: ['blended-family'],
    },
    difficult_conversations: {
      keywords: [
        'confront',
        'boundary',
        'hard conversation',
        'tell them',
        'break up with',
        'fire',
        'apologize',
      ],
      domains: ['difficult-conversations'],
    },

    // Practical domains
    decisions: {
      keywords: [
        'decide',
        'decision',
        'choose',
        'should i',
        'pros and cons',
        'cant decide',
        'torn between',
      ],
      domains: ['decisions'],
    },
    productivity: {
      keywords: [
        'habit',
        'routine',
        'procrastinate',
        'productive',
        'schedule',
        'time management',
        'get things done',
      ],
      domains: ['simple-utilities'],
    },
    wisdom: {
      keywords: [
        'wisdom',
        'philosophy',
        'deeper meaning',
        'perspective',
        'advice',
        'guidance',
        'what would you do',
      ],
      domains: ['wisdom', 'curiosity'],
    },

    // Information domains
    weather_info: {
      keywords: [
        'weather',
        'forecast',
        'temperature',
        'rain',
        'snow',
        'sunny',
        'cloudy',
        'cold',
        'hot',
        'humid',
        'storm',
      ],
      domains: ['information'],
    },
    news_info: {
      keywords: ['news', 'headlines', 'whats happening', 'current events', 'breaking news'],
      domains: ['information'],
    },
  } as const,
} as const;

// ============================================================================
// INTENT DETECTION
// ============================================================================

export interface DetectedIntent {
  /** Which contextual categories were detected */
  categories: string[];
  /** Specific domains to load */
  domains: string[];
  /** Confidence score 0-1 */
  confidence: number;
  /** Keywords that triggered detection */
  triggerKeywords: string[];
}

/**
 * Detect user intent from transcript to determine which tools to load.
 *
 * Used by UnifiedToolOrchestrator for intent-based domain loading.
 * Extend TIER_2_CONTEXTUAL keywords to improve tool detection accuracy.
 *
 * @param userTranscript - The user's speech transcript
 * @returns Detected intent with categories, domains, and confidence
 *
 * @example
 * const intent = detectToolIntent("What's the weather like today?");
 * // { categories: ['weather_info'], domains: ['information'], confidence: 0.33, ... }
 */
export function detectToolIntent(userTranscript: string): DetectedIntent {
  const transcript = userTranscript.toLowerCase();
  const detected: DetectedIntent = {
    categories: [],
    domains: [],
    confidence: 0,
    triggerKeywords: [],
  };

  // Check each contextual category
  for (const [category, config] of Object.entries(TOOL_TIERS.TIER_2_CONTEXTUAL)) {
    for (const keyword of config.keywords) {
      if (transcript.includes(keyword.toLowerCase())) {
        if (!detected.categories.includes(category)) {
          detected.categories.push(category);
          detected.domains.push(...config.domains);
          detected.triggerKeywords.push(keyword);
        }
      }
    }
  }

  // Dedupe domains
  detected.domains = [...new Set(detected.domains)];

  // Calculate confidence based on number of triggers
  detected.confidence = Math.min(detected.triggerKeywords.length / 3, 1);

  return detected;
}
