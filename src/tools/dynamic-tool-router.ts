/**
 * Dynamic Tool Router (JSPLIT-style)
 *
 * Instead of loading 50+ tools at once (which overwhelms Gemini's function calling),
 * this router analyzes user intent and injects only relevant tools.
 *
 * ARCHITECTURE:
 * - Tier 0 (Always): Core tools (~10) - memory, handoff basics, music, weather
 * - Tier 1 (Common): Frequently needed (~10) - search, news, games
 * - Tier 2 (Contextual): Loaded on-demand based on detected intent
 *
 * RESEARCH BASIS:
 * - Google recommends 10-20 tools max for reliable function calling
 * - JSPLIT paper: hierarchical tool organization reduces prompt size 3x
 * - Our testing: 56 tools breaks function calling, 20 tools works
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TOOL HIERARCHY
// ============================================================================

/**
 * Tool domains organized by priority tier
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
 * Detect user intent from transcript to determine which tools to load
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

// ============================================================================
// DYNAMIC TOOL SET BUILDER
// ============================================================================

export interface DynamicToolSetConfig {
  /** User's current transcript (for intent detection) */
  transcript?: string;
  /** Recent conversation context (for better detection) */
  conversationContext?: string[];
  /** Force include specific domains */
  forceInclude?: string[];
  /** Max tools to load (default: 25) */
  maxTools?: number;
  /** Include tier 1 common tools (default: true) */
  includeTier1?: boolean;
}

/**
 * Get the domains to load based on context
 */
export function getDynamicDomains(config: DynamicToolSetConfig = {}): {
  domains: string[];
  intent: DetectedIntent | null;
  totalEstimatedTools: number;
} {
  const domains: string[] = [];
  let intent: DetectedIntent | null = null;

  // Always include Tier 0
  domains.push(...TOOL_TIERS.TIER_0_ALWAYS);

  // Include Tier 1 if enabled (default)
  if (config.includeTier1 !== false) {
    domains.push(...TOOL_TIERS.TIER_1_COMMON);
  }

  // Detect intent from transcript
  if (config.transcript) {
    intent = detectToolIntent(config.transcript);
    if (intent.domains.length > 0) {
      log.debug(
        {
          categories: intent.categories,
          domains: intent.domains,
          triggers: intent.triggerKeywords,
        },
        '🎯 Dynamic tool intent detected'
      );
      domains.push(...intent.domains);
    }
  }

  // Also check conversation context for broader patterns
  if (config.conversationContext?.length) {
    const contextText = config.conversationContext.join(' ');
    const contextIntent = detectToolIntent(contextText);
    if (contextIntent.domains.length > 0) {
      domains.push(...contextIntent.domains);
    }
  }

  // Add forced includes
  if (config.forceInclude?.length) {
    domains.push(...config.forceInclude);
  }

  // Dedupe
  const uniqueDomains = [...new Set(domains)];

  // Estimate tool count (rough: ~5 tools per domain average)
  const estimatedTools = uniqueDomains.length * 5;

  return {
    domains: uniqueDomains,
    intent,
    totalEstimatedTools: estimatedTools,
  };
}

// ============================================================================
// CONVERSATION CONTEXT TRACKER
// ============================================================================

/**
 * Tracks conversation context for better intent detection across turns
 */
export class ConversationToolContext {
  private recentTranscripts: string[] = [];
  private activeContextualDomains = new Set<string>();
  private maxHistoryLength = 5;

  /**
   * Add a user transcript to context
   */
  addTranscript(transcript: string): void {
    this.recentTranscripts.push(transcript);
    if (this.recentTranscripts.length > this.maxHistoryLength) {
      this.recentTranscripts.shift();
    }

    // Detect and cache domains
    const intent = detectToolIntent(transcript);
    for (const domain of intent.domains) {
      this.activeContextualDomains.add(domain);
    }
  }

  /**
   * Get domains to load for current context
   */
  getDomainsForContext(): string[] {
    return [...this.activeContextualDomains];
  }

  /**
   * Get recent transcripts for context
   */
  getRecentTranscripts(): string[] {
    return [...this.recentTranscripts];
  }

  /**
   * Clear context (e.g., on session end)
   */
  clear(): void {
    this.recentTranscripts = [];
    this.activeContextualDomains.clear();
  }

  /**
   * Check if a specific domain category is active
   */
  hasActiveCategory(category: string): boolean {
    const config =
      TOOL_TIERS.TIER_2_CONTEXTUAL[category as keyof typeof TOOL_TIERS.TIER_2_CONTEXTUAL];
    if (!config) return false;
    return config.domains.some((d) => this.activeContextualDomains.has(d));
  }
}

// ============================================================================
// INTEGRATION WITH TOOL BUILDER
// ============================================================================

/**
 * Build a dynamic tool spec for use with buildAgentTools
 */
export function buildDynamicToolSpec(config: DynamicToolSetConfig = {}): {
  domains: string[];
  intent: DetectedIntent | null;
} {
  const result = getDynamicDomains(config);

  log.info(
    {
      domainCount: result.domains.length,
      domains: result.domains,
      estimatedTools: result.totalEstimatedTools,
      detectedCategories: result.intent?.categories || [],
    },
    '🔧 Dynamic tool spec built'
  );

  return {
    domains: result.domains,
    intent: result.intent,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TOOL_TIERS,
  detectToolIntent,
  getDynamicDomains,
  buildDynamicToolSpec,
  ConversationToolContext,
};
