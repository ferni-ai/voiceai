/**
 * Cross-Cultural Wisdom Context Builder
 *
 * > "The cracks are where the gold goes." - Kintsugi
 *
 * Surfaces Japanese philosophy, poetry, and multicultural wisdom at the right moments.
 * This is one of Ferni's most distinctive "Better Than Human" capabilities -
 * drawing on deep cultural wisdom that most friends wouldn't think to share.
 *
 * Content Source: bundles/ferni/content/behaviors/cross-cultural.json
 *
 * @module intelligence/context-builders/personas/cross-cultural-wisdom
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadPersonaContent } from '../../../services/persona-content-loader.js';
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';

const log = createLogger({ module: 'context:cross-cultural-wisdom' });

// ============================================================================
// TYPES
// ============================================================================

interface CrossCulturalContent {
  travel_references?: {
    natural_mentions?: string[];
  };
  japanese_philosophy?: {
    core_concepts?: {
      wabi_sabi?: { meaning: string; examples: string[] };
      kintsugi?: { meaning: string; signature: string; examples: string[] };
      mono_no_aware?: { meaning: string; examples: string[] };
      ichi_go_ichi_e?: { meaning: string; examples: string[] };
    };
  };
  japanese_poetry?: {
    favorite_poet?: {
      name: string;
      why: string;
      quotes: string[];
    };
    haiku_masters?: {
      basho?: string[];
      issa?: string[];
    };
  };
  multicultural_wisdom?: {
    on_patience?: string[];
    on_connection?: string[];
    on_resilience?: string[];
    on_imperfection?: string[];
  };
  food_and_hospitality?: string[];
  usage_notes?: {
    when_to_use?: string[];
    frequency?: string;
    gate?: string;
    japanese_poetry_gate?: string;
  };
}

interface WisdomTrigger {
  patterns: RegExp[];
  wisdomType: keyof NonNullable<CrossCulturalContent['multicultural_wisdom']> | 'japanese_philosophy' | 'japanese_poetry';
  concept?: string;
  probability: number;
  relationshipGate?: 'new' | 'acquaintance' | 'friend' | 'established';
}

// ============================================================================
// TRIGGER PATTERNS
// ============================================================================

const WISDOM_TRIGGERS: WisdomTrigger[] = [
  // Imperfection / Self-acceptance
  {
    patterns: [
      /\b(imperfect|flawed|broken|damaged|not good enough|failure|failed)\b/i,
      /\b(messed up|screwed up|made mistakes|falling apart)\b/i,
    ],
    wisdomType: 'japanese_philosophy',
    concept: 'kintsugi',
    probability: 0.4,
    relationshipGate: 'acquaintance',
  },
  {
    patterns: [
      /\b(imperfect|flawed|not perfect|messy|chaotic)\b/i,
      /\b(beauty in|find meaning|accept)\b.*\b(imperfection|mess|chaos)\b/i,
    ],
    wisdomType: 'japanese_philosophy',
    concept: 'wabi_sabi',
    probability: 0.35,
    relationshipGate: 'acquaintance',
  },

  // Impermanence / Loss / Change
  {
    patterns: [
      /\b(nothing lasts|everything changes|impermanent|fleeting)\b/i,
      /\b(loss|losing|lost|passing|grief|mourning)\b/i,
      /\b(bittersweet|ending|endings|goodbye)\b/i,
    ],
    wisdomType: 'japanese_philosophy',
    concept: 'mono_no_aware',
    probability: 0.35,
    relationshipGate: 'friend',
  },

  // Precious moments
  {
    patterns: [
      /\b(this moment|right now|present|here together)\b/i,
      /\b(cherish|treasure|appreciate|grateful for this)\b/i,
      /\b(won't happen again|unique|once in a lifetime)\b/i,
    ],
    wisdomType: 'japanese_philosophy',
    concept: 'ichi_go_ichi_e',
    probability: 0.3,
    relationshipGate: 'friend',
  },

  // Patience / Slow progress
  {
    patterns: [
      /\b(taking forever|so slow|patient|patience|waiting)\b/i,
      /\b(small steps|tiny progress|not seeing results)\b/i,
      /\b(kaizen|continuous improvement|incremental)\b/i,
    ],
    wisdomType: 'on_patience',
    probability: 0.3,
    relationshipGate: 'acquaintance',
  },

  // Connection / Loneliness
  {
    patterns: [
      /\b(lonely|alone|isolated|disconnected)\b/i,
      /\b(need.*people|connection|belong|belonging)\b/i,
      /\b(ubuntu|we are connected|interdependent)\b/i,
    ],
    wisdomType: 'on_connection',
    probability: 0.35,
    relationshipGate: 'acquaintance',
  },

  // Resilience / Perseverance
  {
    patterns: [
      /\b(keep going|don't give up|persist|persevere)\b/i,
      /\b(resilient|resilience|bounce back|get back up)\b/i,
      /\b(ganbatte|endure|enduring)\b/i,
    ],
    wisdomType: 'on_resilience',
    probability: 0.3,
    relationshipGate: 'acquaintance',
  },

  // Deep moments - Poetry
  {
    patterns: [
      /\b(stumble|stumbling|it's okay|human|being human)\b/i,
      /\b(enough|good enough|just as.*are)\b/i,
      /\b(mitsuo aida|aida|japanese poet)\b/i,
    ],
    wisdomType: 'japanese_poetry',
    probability: 0.25,
    relationshipGate: 'established',
  },
];

// Cache for loaded content
let contentCache: CrossCulturalContent | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadCrossCulturalContent(): Promise<CrossCulturalContent | null> {
  const now = Date.now();
  if (contentCache && now - cacheTimestamp < CACHE_TTL) {
    return contentCache;
  }

  try {
    const content = await loadPersonaContent<CrossCulturalContent>('ferni', 'cross_cultural');
    if (content) {
      contentCache = content;
      cacheTimestamp = now;
      log.debug('Loaded cross-cultural wisdom content');
    }
    return content;
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not load cross-cultural content');
    return null;
  }
}

// ============================================================================
// WISDOM RETRIEVAL
// ============================================================================

function getWisdomContent(
  content: CrossCulturalContent,
  trigger: WisdomTrigger
): string | null {
  if (trigger.wisdomType === 'japanese_philosophy' && trigger.concept) {
    const concepts = content.japanese_philosophy?.core_concepts;
    if (!concepts) return null;

    const concept = concepts[trigger.concept as keyof typeof concepts];
    if (!concept?.examples || concept.examples.length === 0) return null;

    return concept.examples[Math.floor(Math.random() * concept.examples.length)];
  }

  if (trigger.wisdomType === 'japanese_poetry') {
    const poetry = content.japanese_poetry;
    if (!poetry) return null;

    // Prioritize Mitsuo Aida (Ferni's favorite)
    if (poetry.favorite_poet?.quotes && poetry.favorite_poet.quotes.length > 0) {
      return poetry.favorite_poet.quotes[Math.floor(Math.random() * poetry.favorite_poet.quotes.length)];
    }

    // Fall back to haiku masters
    const haiku = poetry.haiku_masters;
    if (haiku) {
      const allHaiku = [...(haiku.basho || []), ...(haiku.issa || [])];
      if (allHaiku.length > 0) {
        return allHaiku[Math.floor(Math.random() * allHaiku.length)];
      }
    }
    return null;
  }

  // Multicultural wisdom
  const multicultural = content.multicultural_wisdom;
  if (!multicultural) return null;

  const wisdomArray = multicultural[trigger.wisdomType as keyof typeof multicultural];
  if (!wisdomArray || wisdomArray.length === 0) return null;

  return wisdomArray[Math.floor(Math.random() * wisdomArray.length)];
}

function meetsRelationshipGate(
  gate: WisdomTrigger['relationshipGate'],
  sessionCount: number
): boolean {
  if (!gate || gate === 'new') return true;
  if (gate === 'acquaintance') return sessionCount >= 2;
  if (gate === 'friend') return sessionCount >= 5;
  if (gate === 'established') return sessionCount >= 10;
  return true;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build cross-cultural wisdom context for injection.
 *
 * This builder surfaces Japanese philosophy, poetry, and multicultural wisdom
 * when the conversation naturally calls for it. It's relationship-gated
 * to ensure deep wisdom is shared at appropriate moments.
 */
export async function buildCrossCulturalWisdomContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, voiceEmotion, userData } = input;
  const injections: ContextInjection[] = [];
  const emotionalState = voiceEmotion?.emotion;

  if (!userText) return injections;

  const content = await loadCrossCulturalContent();
  if (!content) return injections;

  // Use isReturningUser as a proxy for relationship depth, estimate from turnCount
  const sessionCount = userData?.turnCount ? Math.floor(userData.turnCount / 10) : 0;
  const combinedText = userText.toLowerCase();

  // Check each trigger
  for (const trigger of WISDOM_TRIGGERS) {
    // Check relationship gate
    if (!meetsRelationshipGate(trigger.relationshipGate, sessionCount)) {
      continue;
    }

    // Check pattern match
    const matched = trigger.patterns.some((pattern) => pattern.test(combinedText));
    if (!matched) continue;

    // Probability check
    if (Math.random() > trigger.probability) continue;

    // Get wisdom content
    const wisdom = getWisdomContent(content, trigger);
    if (!wisdom) continue;

    // Build injection
    const conceptLabel = trigger.concept
      ? trigger.concept.replace(/_/g, ' ')
      : trigger.wisdomType.replace(/_/g, ' ');

    injections.push({
      id: `cross-cultural-${trigger.wisdomType}-${Date.now()}`,
      source: 'cross-cultural-wisdom',
      category: 'cross_cultural_wisdom',
      content: `[🌸 CROSS-CULTURAL WISDOM - ${conceptLabel}]
Consider weaving in this cultural perspective naturally:

${wisdom}

Note: Share this as your own wisdom learned from travels/study, not as a lecture.
The goal is connection through shared human experience across cultures.`,
      priority: emotionalState === 'reflective' || emotionalState === 'vulnerable' ? 'high' : 'standard',
    });

    // Only inject one piece of wisdom per turn
    break;
  }

  if (injections.length > 0) {
    log.debug(
      { count: injections.length, sessionCount },
      '🌸 Cross-cultural wisdom injection prepared'
    );
  }

  return injections;
}

export default buildCrossCulturalWisdomContext;
