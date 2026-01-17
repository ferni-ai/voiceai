/**
 * Adaptive Endpointing Integration
 *
 * Integrates context-aware pause detection into the voice agent.
 * Dynamically adjusts endpointing delays based on:
 * - Emotional intensity (heavy topics need longer pauses)
 * - Conversation phase (exploring vs closing)
 * - User's speech patterns
 *
 * @module AdaptiveEndpointingIntegration
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AdaptiveEndpointing' });

// ============================================================================
// TYPES
// ============================================================================

export interface EndpointingContext {
  userText: string;
  emotionalIntensity?: number;
  conversationPhase?: 'opening' | 'exploring' | 'supporting' | 'closing';
  turnNumber?: number;
  personaId?: string;
}

export interface EndpointingSettings {
  minDelay: number;
  maxDelay: number;
  preemptiveGeneration: boolean;
}

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

// UPDATED Dec 2024: Faster defaults for snappier conversation
// Human turn-taking gaps are 200-500ms
const DEFAULT_SETTINGS: EndpointingSettings = {
  minDelay: 250, // Was 400ms
  maxDelay: 800, // Was 1200ms
  preemptiveGeneration: true,
};

// Heavy topic indicators that need more processing time
const HEAVY_TOPIC_PATTERNS = [
  /grief|loss|died|death|passed away/i,
  /trauma|abuse|assault/i,
  /suicid|kill myself|end it/i,
  /divorce|breakup|separation/i,
  /fired|laid off|lost.*job/i,
  /diagnos|illness|cancer|terminal/i,
  /anxiety|panic|can't breathe/i,
  /depress|hopeless|worthless/i,
];

// Signals user is still thinking/formulating
const THINKING_INDICATORS = [
  /^(um+|uh+|hmm+|like|so|well|I mean)/i,
  /\.{3,}$/, // Trailing dots
  /I don't know how to/i,
  /let me think/i,
  /it's hard to explain/i,
];

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Get adaptive endpointing settings based on conversation context.
 *
 * This can be called during conversation to get recommended settings.
 * The voice agent can use these to adjust behavior.
 */
export function getAdaptiveEndpointingSettings(context: EndpointingContext): EndpointingSettings {
  const { userText, emotionalIntensity = 0.5, conversationPhase = 'exploring' } = context;

  // Start with defaults
  let { minDelay } = DEFAULT_SETTINGS;
  let { maxDelay } = DEFAULT_SETTINGS;

  // 1. HEAVY TOPICS - Need more processing time
  const isHeavyTopic = HEAVY_TOPIC_PATTERNS.some((p) => p.test(userText));
  if (isHeavyTopic) {
    minDelay = Math.max(minDelay, 600);
    maxDelay = Math.max(maxDelay, 1800);
    log.debug({ topic: 'heavy' }, 'Extended endpointing for heavy topic');
  }

  // 2. HIGH EMOTIONAL INTENSITY - Give space
  if (emotionalIntensity > 0.7) {
    minDelay = Math.max(minDelay, 550);
    maxDelay = Math.max(maxDelay, 1500);
    log.debug({ intensity: emotionalIntensity }, 'Extended endpointing for high emotion');
  }

  // 3. USER IS THINKING - Wait for them
  const isThinking = THINKING_INDICATORS.some((p) => p.test(userText));
  if (isThinking) {
    minDelay = Math.max(minDelay, 500);
    maxDelay = Math.max(maxDelay, 1400);
    log.debug('Extended endpointing - user appears to be thinking');
  }

  // 4. CONVERSATION PHASE adjustments
  // UPDATED Dec 2024: Tightened all phase timings for snappier feel
  switch (conversationPhase) {
    case 'opening':
      // Quick and responsive in opening
      minDelay = Math.min(minDelay, 200);
      maxDelay = Math.min(maxDelay, 700);
      break;
    case 'supporting':
      // Most patient during support (still reduced)
      minDelay = Math.max(minDelay, 400);
      maxDelay = Math.max(maxDelay, 1200);
      break;
    case 'closing':
      // Quicker wrap-up
      minDelay = Math.min(minDelay, 250);
      maxDelay = Math.min(maxDelay, 800);
      break;
    case 'exploring':
    default:
      // Use calculated values
      break;
  }

  // 5. SHORT MESSAGES - Quicker response (even faster now)
  if (userText.length < 20 && !isHeavyTopic && emotionalIntensity < 0.5) {
    minDelay = Math.min(minDelay, 200);
    maxDelay = Math.min(maxDelay, 600);
  }

  // Ensure min < max
  if (minDelay >= maxDelay) {
    maxDelay = minDelay + 400;
  }

  return {
    minDelay,
    maxDelay,
    preemptiveGeneration: !isHeavyTopic, // Don't preempt during heavy topics
  };
}

/**
 * Get a description of the current endpointing strategy for debugging.
 */
export function describeEndpointingStrategy(settings: EndpointingSettings): string {
  if (settings.minDelay >= 600) {
    return 'patient (giving space for heavy topics)';
  }
  if (settings.minDelay <= 350) {
    return 'responsive (quick exchanges)';
  }
  return 'balanced';
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================

/**
 * Create endpointing context from voice agent userData and analysis.
 */
export function createEndpointingContext(params: {
  userText: string;
  emotionalAnalysis?: { intensity?: number };
  turnNumber?: number;
  userData?: { conversationPhase?: string; personaId?: string };
}): EndpointingContext {
  return {
    userText: params.userText,
    emotionalIntensity: params.emotionalAnalysis?.intensity,
    conversationPhase: params.userData
      ?.conversationPhase as EndpointingContext['conversationPhase'],
    turnNumber: params.turnNumber,
    personaId: params.userData?.personaId,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const adaptiveEndpointing = {
  getSettings: getAdaptiveEndpointingSettings,
  describe: describeEndpointingStrategy,
  createContext: createEndpointingContext,
  DEFAULT: DEFAULT_SETTINGS,
};

export default adaptiveEndpointing;
