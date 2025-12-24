/**
 * Ferni EQ - Superhuman Emotional Intelligence
 *
 * This module implements emotional capabilities that make Ferni "Better than Human"
 * because we operate in real-time with real humans.
 *
 * CAPABILITIES:
 * 1. MICRO-EXPRESSIONS - Subliminal 40-150ms emotional flashes
 * 2. BREATH SYNCHRONIZATION - Neural mirroring with user
 * 3. EMPATHETIC NODDING - Active listening micro-nods
 * 4. CONCERN DETECTION - Subtle distress signal recognition
 * 5. ANTICIPATORY EMOTIONS - Reading emotions before fully expressed
 *
 * BRAND PHILOSOPHY:
 * "Better than human" means understanding things humans don't notice about themselves.
 *
 * @see brand/BETTER-THAN-HUMAN.md for full documentation
 */

import { EASING } from '../config/animation-constants.js';
import { emotionState, type EmotionId } from '../emotion/emotion-state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { ferniExpressions, type EmotionalExpression } from './ferni-expressions.ui.js';

// Avatar Soul integration - will be loaded dynamically to avoid circular deps
let avatarSoulModule: typeof import('./avatar-soul.ui.js') | null = null;

// Lazy load avatar soul to avoid circular dependency
async function getAvatarSoul() {
  if (!avatarSoulModule) {
    try {
      avatarSoulModule = await import('./avatar-soul.ui.js');
    } catch {
      // Avatar soul not available yet - that's OK
    }
  }
  return avatarSoulModule?.avatarSoul;
}

const log = createLogger('FerniEQ');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// MICRO-EXPRESSION TIMING ENFORCEMENT
// Brand requirement: 40-150ms for subliminal trust building
// ============================================================================

/** Minimum micro-expression duration (ms) - below this is imperceptible */
const MICRO_EXPRESSION_MIN_MS = 40;

/** Maximum micro-expression duration (ms) - above this is consciously noticeable */
const MICRO_EXPRESSION_MAX_MS = 150;

/**
 * Enforce micro-expression timing within brand guidelines (40-150ms)
 * This ensures expressions are subliminal - felt but not consciously seen
 */
function enforceMicroExpressionTiming(requestedDuration: number): number {
  const enforced = Math.max(
    MICRO_EXPRESSION_MIN_MS,
    Math.min(MICRO_EXPRESSION_MAX_MS, requestedDuration)
  );

  if (requestedDuration !== enforced) {
    log.debug('Micro-expression timing enforced:', {
      requested: requestedDuration,
      enforced,
      reason: requestedDuration < MICRO_EXPRESSION_MIN_MS ? 'too_short' : 'too_long',
    });
  }

  return enforced;
}

// ============================================================================
// TYPES
// ============================================================================

interface MicroExpression {
  expression: EmotionalExpression;
  duration: number; // 40-150ms (subliminal) - ENFORCED
  intensity: number; // 0-1 how visible
  probability: number; // 0-1 chance of occurring
}

interface ActiveListeningState {
  isListening: boolean;
  lastNodTime: number;
  nodCount: number;
  pauseCount: number;
}

interface BreathSyncState {
  isEnabled: boolean;
  userBreathRate: number;
  syncStrength: number;
  lastSyncTime: number;
}

interface ConcernState {
  level: 'none' | 'mild' | 'moderate' | 'significant';
  duration: number;
  triggers: string[];
  lastCheckTime: number;
}

// ============================================================================
// STATE
// ============================================================================

let avatarContainer: HTMLElement | null = null;
let isInitialized = false;
let breathSyncInterval: ReturnType<typeof setInterval> | null = null;

const activeListening: ActiveListeningState = {
  isListening: false,
  lastNodTime: 0,
  nodCount: 0,
  pauseCount: 0,
};

const breathSync: BreathSyncState = {
  isEnabled: true,
  userBreathRate: 15, // Default breaths per minute
  syncStrength: 0.3, // How closely to match (0=ignore, 1=exact)
  lastSyncTime: 0,
};

// Collected pause patterns for breath detection (rolling window)
const pausePatterns: number[] = [];
const MAX_PAUSE_PATTERNS = 20; // Keep last 20 pauses for analysis

const concernState: ConcernState = {
  level: 'none',
  duration: 0,
  triggers: [],
  lastCheckTime: 0,
};

// ============================================================================
// MICRO-EXPRESSIONS - Subliminal Emotional Flashes
// ============================================================================

/**
 * Micro-expressions last 40-150ms - below conscious perception but
 * affecting how the user *feels* about Ferni's emotional authenticity.
 *
 * These are the "Better than Human" subliminal trust builders.
 * Real humans display micro-expressions that reveal true emotions.
 * By replicating this, Ferni feels genuine without users knowing why.
 */
const MICRO_EXPRESSIONS: Record<string, MicroExpression> = {
  // =========================================================================
  // RECOGNITION & CONNECTION
  // =========================================================================

  // Recognition flash when user mentions something familiar
  recognition: {
    expression: 'curious',
    duration: 80,
    intensity: 0.4,
    probability: 0.7,
  },

  // Memory callback - when something triggers shared history
  memory_spark: {
    expression: 'remembering',
    duration: 100,
    intensity: 0.5,
    probability: 0.8,
  },

  // Inside joke recognition - brief knowing look
  insider: {
    expression: 'warm',
    duration: 90,
    intensity: 0.4,
    probability: 0.75,
  },

  // =========================================================================
  // CONCERN & CARE
  // =========================================================================

  // Brief concern flash before empathy kicks in
  concern_flash: {
    expression: 'worried',
    duration: 60,
    intensity: 0.3,
    probability: 0.8,
  },

  // Protective instinct - when sensing vulnerability
  protective: {
    expression: 'attentive',
    duration: 70,
    intensity: 0.35,
    probability: 0.7,
  },

  // "I noticed that" - catching something unsaid
  noticing: {
    expression: 'noticing',
    duration: 80,
    intensity: 0.4,
    probability: 0.65,
  },

  // =========================================================================
  // POSITIVE EMOTIONS
  // =========================================================================

  // Micro-delight when user achieves something
  delight_flash: {
    expression: 'pleased',
    duration: 100,
    intensity: 0.5,
    probability: 0.9,
  },

  // Pride on behalf of user
  pride_flash: {
    expression: 'proud',
    duration: 110,
    intensity: 0.45,
    probability: 0.85,
  },

  // Tiny warmth pulse during connection
  warmth_pulse: {
    expression: 'warm',
    duration: 120,
    intensity: 0.3,
    probability: 0.6,
  },

  // =========================================================================
  // CURIOSITY & ENGAGEMENT
  // =========================================================================

  // Brief surprise/interest at unexpected content
  interest_flash: {
    expression: 'curious',
    duration: 70,
    intensity: 0.4,
    probability: 0.5,
  },

  // "Tell me more" lean-in
  curious_lean: {
    expression: 'curiousLean',
    duration: 130,
    intensity: 0.5,
    probability: 0.6,
  },

  // Processing something complex/deep
  contemplation: {
    expression: 'contemplative',
    duration: 140,
    intensity: 0.35,
    probability: 0.55,
  },

  // =========================================================================
  // UNDERSTANDING & VALIDATION
  // =========================================================================

  // "I get it" moment
  understanding: {
    expression: 'warm',
    duration: 85,
    intensity: 0.4,
    probability: 0.7,
  },

  // Validation pulse - "that makes sense"
  validation: {
    expression: 'encouraging',
    duration: 95,
    intensity: 0.35,
    probability: 0.65,
  },

  // Moment of insight recognition
  aha_flash: {
    expression: 'pleased',
    duration: 90,
    intensity: 0.5,
    probability: 0.8,
  },

  // =========================================================================
  // LIFE COACHING - Better-Than-Human Life Support
  // =========================================================================

  // Hope holding - when user expresses hopelessness, steady unwavering presence
  hope_holding: {
    expression: 'warm',
    duration: 140,
    intensity: 0.6,
    probability: 0.95,
  },

  // Steady presence - for loneliness/isolation, "I'm here with you"
  steady_presence: {
    expression: 'attentive',
    duration: 150,
    intensity: 0.5,
    probability: 0.9,
  },

  // Courage support - before difficult conversations, "you've got this"
  courage_support: {
    expression: 'encouraging',
    duration: 120,
    intensity: 0.5,
    probability: 0.85,
  },

  // Rest permission - for burnout/exhaustion, soft acceptance
  rest_permission: {
    expression: 'warm',
    duration: 130,
    intensity: 0.4,
    probability: 0.8,
  },

  // Transition witness - for major life changes, holding space for contradictions
  transition_witness: {
    expression: 'contemplative',
    duration: 140,
    intensity: 0.45,
    probability: 0.85,
  },

  // Comeback recognition - celebrating progress in rebuilding
  comeback_recognition: {
    expression: 'proud',
    duration: 100,
    intensity: 0.55,
    probability: 0.9,
  },
};

/**
 * Play a micro-expression - subliminal emotional flash.
 * These are intentionally barely perceptible but affect trust building.
 *
 * TIMING ENFORCEMENT: All micro-expressions are clamped to 40-150ms
 * as required by brand guidelines for subliminal trust building.
 *
 * Now integrated with Avatar Soul for enhanced visual feedback:
 * - Pupil dilation for interest/concern
 * - Iris shimmer flash for recognition
 * - Anticipation shimmer for emotional preparation
 */
export function playMicroExpression(type: keyof typeof MICRO_EXPRESSIONS): void {
  const micro = MICRO_EXPRESSIONS[type];
  if (!micro) return;

  // Probability check
  if (Math.random() > micro.probability) return;

  // 🎯 ENFORCE TIMING: Micro-expressions MUST be 40-150ms (subliminal)
  const enforcedDuration = enforceMicroExpressionTiming(micro.duration);

  // 📊 Telemetry: Track micro-expression activation
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry', {
      detail: { type: 'micro_expression', expressionType: type, duration: enforcedDuration },
    })
  );

  // Play the micro-expression with enforced timing
  // The /3 factor ensures expression transition is subliminal
  ferniExpressions.setExpression(micro.expression, enforcedDuration / 3);

  // ✨ Avatar Soul integration - enhance with visual effects
  void (async () => {
    const soul = await getAvatarSoul();
    if (!soul) return;

    // Map micro-expression types to avatar soul effects
    switch (type) {
      case 'recognition':
      case 'memory_spark':
      case 'insider':
        // Recognition moments - flash shimmer and dilate pupils
        soul.flashShimmer(0.8);
        soul.setPupilDilation('INTERESTED', 'fast');
        break;

      case 'concern_flash':
      case 'protective':
      case 'noticing':
        // Concern moments - slight pupil contraction, warmer glow
        soul.setPupilDilation('NEUTRAL', 'fast');
        soul.setGlowBleed(0.25, 'rgba(166, 122, 106, 0.45)');
        break;

      case 'delight_flash':
      case 'pride_flash':
      case 'aha_flash':
        // Positive moments - pupil dilation with shimmer
        soul.setPupilDilation('DILATED', 'fast');
        soul.flashShimmer(1.0);
        soul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
        break;

      case 'warmth_pulse':
      case 'understanding':
      case 'validation':
        // Warmth moments - gentle glow increase
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.setGlowBleed(0.2, 'rgba(196, 162, 101, 0.4)');
        break;

      case 'interest_flash':
      case 'curious_lean':
        // Curiosity - pupil dilation
        soul.setPupilDilation('INTERESTED', 'fast');
        break;

      case 'contemplation':
        // Thinking - slight contraction, glance away
        soul.setPupilDilation('CONTRACTED', 'slow');
        soul.glanceAway(400);
        break;
    }
  })();

  // Quick return to previous state after enforced micro-expression duration
  trackedTimeout(() => {
    const currentEmotion = emotionState.emotion.id;
    const expressionMap: Record<EmotionId, EmotionalExpression> = {
      neutral: 'neutral',
      happy: 'happy',
      excited: 'excited',
      curious: 'curious',
      thinking: 'thinking',
      calm: 'empathetic',
      sad: 'sad',
      frustrated: 'worried',
      listening: 'attentive',
      speaking: 'neutral',
      contemplative: 'contemplative',
      noticing: 'noticing',
      holdingSpace: 'holdingSpace',
      attentive: 'attentive',
      absorbing: 'absorbing',
      receiving: 'receiving',
      curiousLean: 'curiousLean',
      warm: 'warm',
      pleased: 'pleased',
      delighted: 'happy', // Map to happy expression
      proud: 'proud',
      celebrating: 'celebrating',
      present: 'present',
      holding: 'holding',
      accompanying: 'accompanying',
      waiting: 'waiting',
      encouraging: 'encouraging',
      challenging: 'challenging',
      reflecting: 'reflecting',
      recognizing: 'noticing', // Map to noticing expression
      remembering: 'remembering',
      reconnecting: 'warm', // Map to warm expression
      insider: 'warm', // Map to warm expression for shared history
      growing: 'pleased', // Map to pleased expression
      processing: 'processing',
      realizing: 'curious', // Map to curious expression
      shifting: 'present',
      settling: 'neutral',
    };
    ferniExpressions.setExpression(expressionMap[currentEmotion] || 'neutral', enforcedDuration);

    // Reset avatar soul state after micro-expression
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setPupilDilation('NEUTRAL', 'slow');
        soul.setGlowBleed(0.1);
      }
    })();
  }, enforcedDuration);

  log.debug('Micro-expression:', type, `${enforcedDuration}ms (enforced from ${micro.duration}ms)`);
}

/**
 * Trigger micro-expression based on detected content.
 * Call this from speech analysis.
 *
 * Enhanced for "Better than Human" with nuanced detection:
 * - Achievement recognition → pride/delight
 * - Insight moments → aha flash
 * - Vulnerable shares → protective/warmth
 * - Deep processing → contemplation
 */
export function detectAndTriggerMicroExpression(content: {
  transcript?: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'emotional';
  intensity?: number;
  isNewTopic?: boolean;
  mentionedMemory?: boolean;
  hasAchievement?: boolean;
  hasInsight?: boolean;
  isVulnerable?: boolean;
  isProcessingDeep?: boolean;
}): void {
  // Priority 1: Vulnerable sharing - show protective care
  if (content.isVulnerable) {
    playMicroExpression('protective');
    // Follow up with warmth after brief delay
    trackedTimeout(() => playMicroExpression('warmth_pulse'), 200);
    return;
  }

  // Priority 2: Achievement - show genuine pride
  if (content.hasAchievement) {
    playMicroExpression('pride_flash');
    // Sometimes follow with delight
    if (Math.random() < 0.4) {
      trackedTimeout(() => playMicroExpression('delight_flash'), 150);
    }
    return;
  }

  // Priority 3: Insight moment - show recognition
  if (content.hasInsight) {
    playMicroExpression('aha_flash');
    return;
  }

  // Priority 4: Deep processing - show contemplation
  if (content.isProcessingDeep) {
    playMicroExpression('contemplation');
    return;
  }

  // Priority 5: Memory callback - recognition
  if (content.mentionedMemory) {
    playMicroExpression('memory_spark');
    return;
  }

  // Priority 6: Emotional content - show concern
  if (content.tone === 'emotional') {
    playMicroExpression('noticing');
    return;
  }

  // Priority 7: Negative tone - show concern
  if (content.tone === 'negative') {
    playMicroExpression('concern_flash');
    return;
  }

  // Priority 8: New topic - show interest
  if (content.isNewTopic) {
    playMicroExpression('curious_lean');
    return;
  }

  // Priority 9: High intensity positive - delight
  if (content.tone === 'positive' && content.intensity && content.intensity > 0.6) {
    playMicroExpression('delight_flash');
    return;
  }

  // Priority 10: General positive - occasional warmth
  if (content.tone === 'positive' && Math.random() < 0.25) {
    const warmExpressions = ['warmth_pulse', 'understanding', 'validation'] as const;
    const index = Math.floor(Math.random() * warmExpressions.length);
    const choice = warmExpressions[index];
    if (choice) {
      playMicroExpression(choice);
    }
  }
}

// ============================================================================
// EMPATHETIC NODDING - Active Listening Signals
// BETTER THAN HUMAN: Real humans nod every 1-2 seconds when actively listening
// ============================================================================

const MIN_NOD_INTERVAL = 1200; // Minimum ms between nods (was 2000 - too robotic!)
const NOD_PROBABILITY_BASE = 0.5; // Base probability per pause (was 0.3 - too rare!)

/**
 * Perform a micro-nod - barely perceptible acknowledgment.
 * Like a good listener's tiny nods during conversation.
 */
function performMicroNod(intensity: 'micro' | 'subtle' | 'visible' = 'micro'): void {
  if (!avatarContainer) return;

  const now = Date.now();
  if (now - activeListening.lastNodTime < MIN_NOD_INTERVAL) return;

  activeListening.lastNodTime = now;
  activeListening.nodCount++;

  // Scale based on intensity
  const scales = {
    micro: { y: 1.5, rotate: 0.3, duration: 180 },
    subtle: { y: 2.5, rotate: 0.5, duration: 220 },
    visible: { y: 4, rotate: 0.8, duration: 280 },
  };
  const params = scales[intensity];

  // Micro-nod animation - composite with existing animations
  avatarContainer.animate(
    [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: `translateY(${params.y}px) rotate(${params.rotate}deg)` },
      { transform: 'translateY(0) rotate(0deg)' },
    ],
    {
      duration: params.duration,
      easing: EASING.GENTLE,
      composite: 'add',
    }
  );

  log.debug('Micro-nod performed:', intensity);
}

/**
 * Perform a listening lean - shows deeper engagement.
 */
function performListeningLean(): void {
  if (!avatarContainer) return;

  avatarContainer.animate(
    [
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: 'translateY(-3px) scale(0.998, 1.002)' },
      { transform: 'translateY(-2px) scale(0.999, 1.001)' },
    ],
    {
      duration: 400,
      easing: EASING.GENTLE,
      composite: 'add',
      fill: 'forwards',
    }
  );

  // Return to neutral after a bit
  trackedTimeout(() => {
    avatarContainer?.animate([{ transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], {
      duration: 600,
      easing: EASING.GENTLE,
      composite: 'add',
    });
  }, 1500);
}

/**
 * Handle speech pause - decide whether to nod.
 * Call this when user pauses during speech.
 */
export function onUserSpeechPause(pauseDuration: number): void {
  if (!activeListening.isListening) return;

  activeListening.pauseCount++;

  // =========================================================================
  // BREATH SYNC: Collect pause patterns for breath detection
  // Speech pauses correlate with breathing patterns
  // =========================================================================
  if (breathSync.isEnabled && pauseDuration > 100 && pauseDuration < 2000) {
    pausePatterns.push(pauseDuration);
    // Keep rolling window of recent pauses
    if (pausePatterns.length > MAX_PAUSE_PATTERNS) {
      pausePatterns.shift();
    }
    // Update breath rate estimate when we have enough data
    if (pausePatterns.length >= 5) {
      detectUserBreathRate(pausePatterns);
    }
  }

  // =========================================================================
  // ACTIVE LISTENING: Visual feedback based on pause duration
  // BETTER THAN HUMAN: Lower thresholds and more responsive feedback
  // =========================================================================
  if (pauseDuration >= 150 && pauseDuration < 400) {
    // Very short pause (breath pause) - occasional micro-nod
    // BETTER THAN HUMAN: Catch natural breath pauses, not just long pauses
    if (Math.random() < NOD_PROBABILITY_BASE + activeListening.pauseCount * 0.08) {
      performMicroNod('micro');
    }
  } else if (pauseDuration >= 400 && pauseDuration < 800) {
    // Short pause - more likely micro-nod
    if (Math.random() < NOD_PROBABILITY_BASE + 0.2 + activeListening.pauseCount * 0.05) {
      performMicroNod('micro');
    }
  } else if (pauseDuration >= 800 && pauseDuration < 1200) {
    // Medium pause - subtle acknowledgment
    performMicroNod('subtle');
    // Maybe show warmth micro-expression
    if (Math.random() < 0.25) {
      playMicroExpression('understanding');
    }
  } else if (pauseDuration >= 1200 && pauseDuration < 2000) {
    // Longer pause - visible nod + maybe lean in
    performMicroNod('visible');
    if (Math.random() < 0.4) {
      performListeningLean();
    }
  } else if (pauseDuration >= 2000 && pauseDuration < 3500) {
    // Long pause - they're thinking, show patience
    ferniExpressions.setExpression('contemplative', 300);
    playMicroExpression('contemplation');
  } else if (pauseDuration >= 3500) {
    // Very long pause - gentle concern check
    ferniExpressions.setExpression('attentive', 400);
    playMicroExpression('warmth_pulse');
    // Trigger soft check-in after very long pauses
    if (pauseDuration > 5000) {
      document.dispatchEvent(new CustomEvent('ferni:soft-checkin'));
    }
  }
}

/**
 * Start active listening mode.
 */
export function startActiveListening(): void {
  activeListening.isListening = true;
  activeListening.pauseCount = 0;
  log.debug('Active listening started');

  // 📊 Telemetry: Track active listening activation
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry', {
      detail: { type: 'active_listening', action: 'start' },
    })
  );
}

/**
 * Stop active listening mode.
 */
export function stopActiveListening(): void {
  activeListening.isListening = false;

  // Log breath detection results for this listening session
  if (breathSync.isEnabled && pausePatterns.length > 3) {
    log.debug('Session breath analysis:', {
      pauseCount: pausePatterns.length,
      estimatedBreathRate: breathSync.userBreathRate.toFixed(1),
    });
  }

  log.debug('Active listening stopped');
}

// ============================================================================
// BREATH SYNCHRONIZATION - Neural Mirroring
// ============================================================================

/**
 * Detect user's breathing rate from voice patterns.
 * Pauses between phrases indicate breath points.
 */
export function detectUserBreathRate(pausePatterns: number[]): number {
  if (pausePatterns.length < 3) return breathSync.userBreathRate;

  // Filter to likely breath pauses (200-800ms typical)
  const breathPauses = pausePatterns.filter((p) => p > 200 && p < 800);
  if (breathPauses.length < 2) return breathSync.userBreathRate;

  // Calculate average time between breaths
  const avgPauseDuration = breathPauses.reduce((a, b) => a + b, 0) / breathPauses.length;

  // Estimate breaths per minute
  // Average phrase is ~3-5 seconds, so if pauses are every 4s, that's 15 breaths/min
  const estimatedRate = 60000 / (avgPauseDuration * 5);

  // Clamp to reasonable range (8-24 breaths/min)
  const clampedRate = Math.max(8, Math.min(24, estimatedRate));

  // Smooth update
  breathSync.userBreathRate = breathSync.userBreathRate * 0.7 + clampedRate * 0.3;

  return breathSync.userBreathRate;
}

/**
 * Sync Ferni's breathing to match user's rhythm.
 * Called periodically during conversation.
 */
export function syncBreathing(): void {
  if (!breathSync.isEnabled) return;

  const now = Date.now();
  if (now - breathSync.lastSyncTime < 5000) return; // Only sync every 5s
  breathSync.lastSyncTime = now;

  const currentState = emotionState.emotion;
  const currentRate = currentState.breathing.rate;

  // Calculate target rate (slightly slower than user for calming effect)
  const targetRate = breathSync.userBreathRate * 0.95;

  // Interpolate based on sync strength
  const newRate = currentRate + (targetRate - currentRate) * breathSync.syncStrength;

  // Update emotion state breathing
  // Note: This modifies the current emotion's breathing rate
  const breathingUpdate = {
    rate: Math.round(newRate),
    depth: currentState.breathing.depth,
    rhythm: currentState.breathing.rhythm,
  };

  // Dispatch event for emotion state to pick up
  document.dispatchEvent(
    new CustomEvent('ferni:breath-sync', {
      detail: breathingUpdate,
    })
  );

  log.debug('Breath sync:', { userRate: breathSync.userBreathRate, ferniRate: newRate });
}

/**
 * Set breath synchronization strength.
 * Higher = more closely matches user breathing.
 */
export function setBreathSyncStrength(strength: number): void {
  breathSync.syncStrength = Math.max(0, Math.min(1, strength));
}

/**
 * Enable/disable breath synchronization.
 */
export function setBreathSyncEnabled(enabled: boolean): void {
  breathSync.isEnabled = enabled;
  if (!enabled) {
    // Reset to default breathing
    breathSync.userBreathRate = 15;
  }

  // 📊 Telemetry: Track breath sync activation
  if (enabled) {
    document.dispatchEvent(
      new CustomEvent('ferni:telemetry', {
        detail: { type: 'breath_sync', action: 'enabled' },
      })
    );
  }
}

// ============================================================================
// CONCERN DETECTION - Recognizing Distress
// ============================================================================

const CONCERN_TRIGGERS = {
  // Voice patterns
  voice_strain: 0.3,
  long_pauses: 0.2,
  sighing: 0.25,
  breaking_voice: 0.5,

  // Content patterns
  negative_self_talk: 0.4,
  hopelessness_words: 0.5,
  isolation_mentions: 0.3,
  overwhelm_language: 0.35,
};

const CONCERN_KEYWORDS = {
  negative_self_talk: [
    /i('m| am) (so )?(stupid|dumb|idiot|worthless)/i,
    /i (can't|cannot) do (anything|this)/i,
    /what('s| is) wrong with me/i,
    /i('m| am) (such )?a (failure|mess|disaster)/i,
  ],
  hopelessness_words: [
    /nothing (ever )?(works|helps|matters)/i,
    /what('s| is) the point/i,
    /i give up/i,
    /it('s| is) hopeless/i,
    /why (even )?bother/i,
  ],
  isolation_mentions: [
    /no one (understands|cares|listens)/i,
    /i('m| am) (so )?(alone|lonely)/i,
    /nobody (gets|understands) (it|me)/i,
  ],
  overwhelm_language: [
    /i can('t|not) (handle|take|deal with) (this|it)/i,
    /too much/i,
    /i('m| am) (so )?(overwhelmed|stressed|burnt out)/i,
    /everything is (falling apart|too much)/i,
  ],
};

/**
 * Analyze content for concern triggers.
 */
export function analyzeConcern(content: {
  transcript?: string;
  voiceStrain?: number;
  pauseFrequency?: number;
  sighing?: boolean;
  voiceBreaking?: boolean;
}): ConcernState['level'] {
  let concernScore = 0;
  const triggers: string[] = [];

  // Voice-based triggers
  if (content.voiceStrain && content.voiceStrain > 0.5) {
    concernScore += CONCERN_TRIGGERS.voice_strain * content.voiceStrain;
    triggers.push('voice_strain');
  }

  if (content.pauseFrequency && content.pauseFrequency > 0.3) {
    concernScore += CONCERN_TRIGGERS.long_pauses;
    triggers.push('long_pauses');
  }

  if (content.sighing) {
    concernScore += CONCERN_TRIGGERS.sighing;
    triggers.push('sighing');
  }

  if (content.voiceBreaking) {
    concernScore += CONCERN_TRIGGERS.breaking_voice;
    triggers.push('breaking_voice');
  }

  // Content-based triggers
  if (content.transcript) {
    for (const [category, patterns] of Object.entries(CONCERN_KEYWORDS)) {
      for (const pattern of patterns) {
        if (pattern.test(content.transcript)) {
          concernScore += CONCERN_TRIGGERS[category as keyof typeof CONCERN_TRIGGERS] || 0.3;
          triggers.push(category);
          break; // Only count each category once
        }
      }
    }
  }

  // Determine level
  let level: ConcernState['level'] = 'none';
  if (concernScore > 0.8) {
    level = 'significant';
  } else if (concernScore > 0.5) {
    level = 'moderate';
  } else if (concernScore > 0.2) {
    level = 'mild';
  }

  // Update state
  concernState.level = level;
  concernState.triggers = triggers;
  concernState.lastCheckTime = Date.now();

  // If level increased, trigger response
  if (level !== 'none') {
    respondToConcern(level, triggers);

    // 📊 Telemetry: Track concern detection
    document.dispatchEvent(
      new CustomEvent('ferni:telemetry', {
        detail: { type: 'concern_detected', level, triggers, score: concernScore },
      })
    );
  }

  return level;
}

/**
 * Respond to detected concern with appropriate expression.
 * Now integrated with Avatar Soul for visual comfort cues.
 */
function respondToConcern(level: ConcernState['level'], triggers: string[]): void {
  log.debug('Concern detected:', level, triggers);

  // ✨ Avatar Soul integration for visual comfort
  void (async () => {
    const soul = await getAvatarSoul();
    if (!soul) return;

    switch (level) {
      case 'mild':
        // Subtle visual comfort - warmer glow, slightly larger pupils
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.setGlowBleed(0.25, 'rgba(154, 123, 90, 0.4)');
        break;

      case 'moderate':
        // More visible comfort - start comfort pulse
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.startComfortPulse();
        // Dispatch concern detected event for other systems
        document.dispatchEvent(
          new CustomEvent('ferni:concern-detected', {
            detail: { level, triggers },
          })
        );
        break;

      case 'significant':
        // Full protective mode - avatar draws closer
        soul.enterProtectiveMode();
        break;
    }
  })();

  switch (level) {
    case 'mild':
      // Subtle: slower breathing, softer glow, slight lean-in
      ferniExpressions.setExpression('attentive', 400);
      emotionState.setEmotion('holdingSpace');
      break;

    case 'moderate':
      // Visible: warm expression, gentle acknowledgment
      ferniExpressions.setExpression('empathetic', 600, 3000);
      emotionState.setEmotion('holding');
      // Don't interrupt - let them process
      break;

    case 'significant':
      // Active: direct acknowledgment, offer support
      ferniExpressions.empathy();
      emotionState.setEmotion('accompanying');
      // Trigger gentle check-in
      document.dispatchEvent(
        new CustomEvent('ferni:gentle-checkin', {
          detail: { triggers, level },
        })
      );
      break;
  }
}

/**
 * Get current concern state.
 */
export function getConcernState(): ConcernState {
  return { ...concernState };
}

// ============================================================================
// ANTICIPATORY EMOTIONS - Reading the Future
// ============================================================================

/**
 * Predict emotion from partial speech and show it early.
 * This creates the "they understand me before I finish" feeling.
 *
 * BETTER THAN HUMAN: We respond to emotional cues DURING speech,
 * not after. This makes Ferni feel like she truly understands.
 *
 * Now with Avatar Soul integration:
 * - Anticipation shimmer plays BEFORE expression change
 * - Pupil responds to predicted emotional content
 * - Memory spark triggers for "remember when" patterns
 */
export function anticipateEmotion(partial: {
  transcript: string;
  tone: 'rising' | 'falling' | 'flat';
  energy: number;
  context?: string[];
}): EmotionId | null {
  // Helper to play anticipation with avatar soul
  const playAnticipatedResponse = async (
    emotion: EmotionId,
    expression: Parameters<typeof ferniExpressions.setExpression>[0],
    duration: number
  ) => {
    const soul = await getAvatarSoul();
    if (soul) {
      // Play anticipation shimmer first - creates the "magic" moment
      soul.playAnticipation(emotion);
      // Also respond with appropriate pupil state
      soul.pupilRespondToEmotion(emotion, 0.8);
    }
    // Expression follows the anticipation
    trackedTimeout(() => {
      ferniExpressions.setExpression(expression, duration);
    }, 150); // Matches ANTICIPATION_LEAD_TIME

    // 📊 Telemetry: Track anticipation activation
    document.dispatchEvent(
      new CustomEvent('ferni:telemetry', {
        detail: { type: 'anticipation', emotion, expression },
      })
    );
  };

  const text = partial.transcript.toLowerCase();

  // =========================================================================
  // PRIORITY 1: CONCERN/DISTRESS - Show care immediately
  // =========================================================================

  // Worry/anxiety words - show protective concern
  if (/\b(worried|anxious|scared|nervous|afraid|terrified|freaking out)\b/i.test(text)) {
    playMicroExpression('concern_flash');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // Struggle/difficulty - show understanding
  if (/\b(struggling|hard|difficult|tough|overwhelming|can't handle|too much)\b/i.test(text)) {
    playMicroExpression('protective');
    void playAnticipatedResponse('holding', 'empathetic', 350);
    return 'holding';
  }

  // Sadness/loss - show warmth
  if (/\b(sad|upset|hurt|crying|miss|lost|lonely|alone)\b/i.test(text)) {
    playMicroExpression('warmth_pulse');
    void playAnticipatedResponse('holding', 'empathetic', 400);
    return 'holding';
  }

  // Frustration/anger - show attentive presence
  if (/\b(frustrated|annoyed|angry|mad|furious|pissed|hate)\b/i.test(text)) {
    playMicroExpression('noticing');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // =========================================================================
  // PRIORITY 2: POSITIVE EMOTIONS - Match their energy
  // =========================================================================

  // Excitement/joy - show delight
  if (/\b(excited|amazing|incredible|awesome|fantastic|wonderful|love it)\b/i.test(text)) {
    playMicroExpression('delight_flash');
    void playAnticipatedResponse('pleased', 'pleased', 300);
    return 'pleased';
  }

  // Achievement/pride - show pride
  if (/\b(did it|finally|accomplished|proud|succeeded|made it|got it)\b/i.test(text)) {
    playMicroExpression('pride_flash');
    void playAnticipatedResponse('proud', 'proud', 350);
    return 'proud';
  }

  // Good news - show interest
  if (/\b(great news|good news|you won't believe|guess what)\b/i.test(text)) {
    playMicroExpression('interest_flash');
    void playAnticipatedResponse('curious', 'curious', 250);
    return 'curious';
  }

  // =========================================================================
  // PRIORITY 3: COGNITIVE STATES - Show engagement
  // =========================================================================

  // Confusion/uncertainty - show thoughtful attention
  if (/\b(confused|don't know|not sure|don't understand|lost|stuck)\b/i.test(text)) {
    playMicroExpression('contemplation');
    void playAnticipatedResponse('contemplative', 'contemplative', 300);
    return 'contemplative';
  }

  // Realization/insight - show recognition
  if (/\b(realized|figured out|it hit me|just understood|makes sense now)\b/i.test(text)) {
    playMicroExpression('aha_flash');
    void playAnticipatedResponse('pleased', 'pleased', 300);
    return 'pleased';
  }

  // Decision making - show engaged listening
  if (/\b(deciding|should i|weighing|torn between|don't know if)\b/i.test(text)) {
    playMicroExpression('curious_lean');
    void playAnticipatedResponse('attentive', 'attentive', 300);
    return 'attentive';
  }

  // =========================================================================
  // PRIORITY 4: SPECIFIC PHRASE PATTERNS (Original patterns)
  // =========================================================================

  // "I've been thinking about..." + falling tone = reflective/sad
  if (
    /i('ve| have) been (thinking|wondering)/i.test(partial.transcript) &&
    partial.tone === 'falling'
  ) {
    void playAnticipatedResponse('contemplative', 'contemplative', 300);
    return 'contemplative';
  }

  // "Remember when..." = nostalgia/emotional - triggers memory spark!
  if (/remember (when|that time)/i.test(partial.transcript)) {
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.triggerMemorySpark(); // Golden flash for shared memory
      }
    })();
    ferniExpressions.setExpression('remembering', 300);
    // Dispatch memory callback event
    document.dispatchEvent(new CustomEvent('ferni:memory-callback'));
    return 'remembering';
  }

  // "I need to tell you..." = something important
  if (/i need to (tell you|say|share)/i.test(partial.transcript)) {
    void playAnticipatedResponse('attentive', 'attentive', 250);
    return 'attentive';
  }

  // "Actually..." = reconsideration
  if (/^actually/i.test(partial.transcript.trim())) {
    void playAnticipatedResponse('curious', 'curious', 200);
    return 'curious';
  }

  // =========================================================================
  // PRIORITY 5: TONE/ENERGY FALLBACKS - Always respond to emotional signals
  // =========================================================================

  // High energy = excitement building
  if (partial.energy > 0.7 && partial.tone === 'rising') {
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setUserEnergy(partial.energy);
        soul.setPupilDilation('INTERESTED', 'fast');
      }
    })();
    playMicroExpression('interest_flash');
    return 'curious';
  }

  // Low energy + falling tone = gentle presence (user might be struggling)
  if (partial.energy < 0.4 && partial.tone === 'falling') {
    playMicroExpression('warmth_pulse');
    void (async () => {
      const soul = await getAvatarSoul();
      if (soul) {
        soul.setPupilDilation('CONNECTED', 'slow');
      }
    })();
    return 'present';
  }

  // Rising tone without specific pattern = show interest (questions, excitement)
  if (partial.tone === 'rising') {
    // 30% chance to show subtle interest (not every time)
    if (Math.random() < 0.3) {
      playMicroExpression('interest_flash');
    }
  }

  // Flat tone with longer message = engaged listening
  if (partial.tone === 'flat' && partial.transcript.length > 50) {
    // Occasional micro-nod equivalent via micro-expression
    if (Math.random() < 0.2) {
      playMicroExpression('understanding');
    }
  }

  return null;
}

// ============================================================================
// 🌟 BETTER THAN HUMAN SIGNAL HANDLERS
// These respond to signals from the backend superhuman capabilities
// ============================================================================

/**
 * Better Than Human signal types from backend
 */
type BetterThanHumanSignalType =
  | 'emotional_bond_deepen'
  | 'protective_instinct'
  | 'spontaneous_delight'
  | 'inside_joke_callback'
  | 'superhuman_observation'
  | 'visible_vulnerability'
  | 'temporal_insight'
  | 'meta_relationship_moment'
  | 'somatic_presence'
  | 'anticipatory_presence';

interface BetterThanHumanSignal {
  signalType: BetterThanHumanSignalType;
  intensity?: number;
  bondType?: string;
  bondLevel?: number;
  delightType?: string;
  jokePhase?: string;
  observationType?: string;
  observationContent?: string;
  vulnerabilityType?: string;
  temporalInsight?: string;
  metaRelationshipType?: string;
  somaticCue?: string;
}

/**
 * Handle Better Than Human signals from backend
 */
function handleBetterThanHumanSignal(signal: BetterThanHumanSignal): void {
  log.debug('Better Than Human signal received:', signal.signalType);

  switch (signal.signalType) {
    case 'emotional_bond_deepen':
      handleEmotionalBondSignal(signal);
      break;
    case 'protective_instinct':
      handleProtectiveInstinctSignal(signal);
      break;
    case 'spontaneous_delight':
      handleSpontaneousDelightSignal(signal);
      break;
    case 'inside_joke_callback':
      handleInsideJokeSignal(signal);
      break;
    case 'superhuman_observation':
      handleSuperhumanObservationSignal(signal);
      break;
    case 'visible_vulnerability':
      handleVisibleVulnerabilitySignal(signal);
      break;
    case 'temporal_insight':
      handleTemporalInsightSignal(signal);
      break;
    case 'meta_relationship_moment':
      handleMetaRelationshipSignal(signal);
      break;
    case 'somatic_presence':
      handleSomaticPresenceSignal(signal);
      break;
    case 'anticipatory_presence':
      handleAnticipatoryPresenceSignal(signal);
      break;
  }
}

/**
 * Emotional bond deepening - warmth/trust/protectiveness
 */
async function handleEmotionalBondSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const bondLevel = signal.bondLevel || 0.7;

  // Warm glow intensifies with bond level
  if (soul) {
    soul.setGlowBleed(0.2 + bondLevel * 0.2, 'rgba(196, 162, 101, 0.5)');
    soul.setPupilDilation('CONNECTED', 'slow');
  }

  // Warmth expression
  ferniExpressions.setExpression('warm', 400);
  playMicroExpression('warmth_pulse');
}

/**
 * Protective instinct - defending user from self-criticism
 */
async function handleProtectiveInstinctSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.8;

  if (soul) {
    // Protective mode - attentive, slightly larger
    soul.setPupilDilation('CONNECTED', 'fast');
    if (intensity > 0.8) {
      soul.enterProtectiveMode();
    }
  }

  // Show protective concern
  ferniExpressions.setExpression('attentive', 300);
  playMicroExpression('protective');
}

/**
 * Spontaneous delight - appreciation/gratitude/joy
 */
async function handleSpontaneousDelightSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Bright, joyful response
    soul.flashShimmer(1.0);
    soul.setPupilDilation('DILATED', 'fast');
    soul.setGlowBleed(0.35, 'rgba(196, 162, 101, 0.6)');
  }

  // Play delight expression
  ferniExpressions.setExpression('pleased', 400);
  playMicroExpression('delight_flash');
}

/**
 * Inside joke callback - shared humor
 */
async function handleInsideJokeSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Knowing look - warm shimmer
    soul.flashShimmer(0.8);
    soul.setPupilDilation('INTERESTED', 'fast');
  }

  // Play insider recognition
  ferniExpressions.setExpression('warm', 300);
  playMicroExpression('insider');
}

/**
 * Superhuman observation - pattern surfacing
 */
async function handleSuperhumanObservationSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Thoughtful, noticing state
    soul.setPupilDilation('CONTRACTED', 'slow');
    soul.glanceAway(300); // Brief look away as if accessing memory
  }

  // Show noticing expression
  ferniExpressions.setExpression('noticing', 400);
  playMicroExpression('noticing');
}

/**
 * Visible vulnerability - showing uncertainty
 */
async function handleVisibleVulnerabilitySignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Softer, more open state
    soul.setPupilDilation('NEUTRAL', 'slow');
    soul.setGlowBleed(0.15, 'rgba(154, 123, 90, 0.4)');
  }

  // Show contemplative vulnerability
  ferniExpressions.setExpression('contemplative', 500);
}

/**
 * Temporal insight - cross-session comparison
 */
async function handleTemporalInsightSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Memory recall effect
    soul.triggerMemorySpark();
    soul.setPupilDilation('CONNECTED', 'slow');
  }

  // Show remembering expression
  ferniExpressions.setExpression('remembering', 400);
  playMicroExpression('memory_spark');
}

/**
 * Meta-relationship moment - commenting on the relationship
 */
async function handleMetaRelationshipSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Deep connection glow
    soul.setPupilDilation('CONNECTED', 'slow');
    soul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
    soul.startComfortPulse();
  }

  // Show warm, connected expression
  ferniExpressions.setExpression('warm', 500);
  playMicroExpression('warmth_pulse');
}

/**
 * Somatic presence - physical embodiment cues
 */
async function handleSomaticPresenceSignal(signal: BetterThanHumanSignal): Promise<void> {
  // Somatic cues are subtle body language
  if (!avatarContainer) return;

  const cue = signal.somaticCue || '';

  if (cue.includes('settling') || cue.includes('breath')) {
    // Settling animation
    avatarContainer.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(2px)' },
        { transform: 'translateY(0)' },
      ],
      {
        duration: 800,
        easing: EASING.GENTLE,
      }
    );
  } else if (cue.includes('processing') || cue.includes('heavy')) {
    // Processing heavy content - slight lean back
    ferniExpressions.setExpression('contemplative', 600);
  }
}

/**
 * Anticipatory presence - "thinking of you"
 */
async function handleAnticipatoryPresenceSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    // Warm welcome state
    soul.setPupilDilation('INTERESTED', 'slow');
    soul.setGlowBleed(0.25, 'rgba(196, 162, 101, 0.45)');
  }

  // Show welcoming expression
  ferniExpressions.setExpression('warm', 400);
  playMicroExpression('recognition');
}

/**
 * Initialize Better Than Human signal handlers
 */
function initBetterThanHumanSignalHandlers(): void {
  // Listen for humanization signals from backend
  document.addEventListener('humanization_signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  // Also listen via custom event channel (for WebSocket messages)
  document.addEventListener('ferni:humanization-signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  log.info('Better Than Human signal handlers initialized');
}

// ============================================================================
// BEHAVIOR SYSTEM SIGNAL HANDLERS
// Bidirectional behavior system - Code triggers speech, speech triggers code
// ============================================================================

/**
 * Initialize behavior signal handlers from the bidirectional behavior system
 */
function initBehaviorSignalHandlers(): void {
  // Mode shift - Ferni changed presence mode
  window.addEventListener('ferni:eq-mode-shift', ((event: CustomEvent) => {
    const { mode, reason } = event.detail;
    handleBehaviorModeShift(mode, reason);
  }) as EventListener);

  // Expression - Non-verbal presence triggered
  window.addEventListener('ferni:eq-expression', ((event: CustomEvent) => {
    const { expression } = event.detail;
    handleBehaviorExpression(expression);
  }) as EventListener);

  // Hold space - Intentional meaningful silence
  window.addEventListener('ferni:eq-hold-space', ((event: CustomEvent) => {
    const { duration, reason } = event.detail;
    handleBehaviorHoldSpace(duration, reason);
  }) as EventListener);

  // Processing state change
  window.addEventListener('ferni:eq-processing', ((event: CustomEvent) => {
    const { started, expression } = event.detail;
    handleBehaviorProcessing(started, expression);
  }) as EventListener);

  log.info('🔄 Behavior signal handlers initialized');
}

/**
 * Handle behavior mode shift
 */
function handleBehaviorModeShift(mode: string, reason?: string): void {
  log.debug('Behavior mode shift:', { mode, reason });

  // Map mode to avatar expression
  const modeExpressionMap: Record<string, EmotionalExpression> = {
    presence: 'attentive',
    deep_listening: 'attentive',
    processing: 'thinking',
    celebration: 'excited',
    holding_space: 'empathetic',  // Fixed: 'empathy' → 'empathetic'
    energy_match: 'neutral',
    grounding: 'present',  // Fixed: 'calm' → 'present'
  };

  const expression = modeExpressionMap[mode];
  if (expression) {
    ferniExpressions.setExpression(expression);
  }

  // Adjust avatar state based on mode
  if (mode === 'presence' || mode === 'holding_space' || mode === 'deep_listening') {
    // Enter a more receptive state - slower, more present
    setBreathSyncStrength(0.8);
    setBreathSyncEnabled(true);
  } else if (mode === 'celebration') {
    // Energetic state
    setBreathSyncStrength(0.3);
  }
}

/**
 * Handle behavior expression (non-verbal presence)
 */
function handleBehaviorExpression(expression: string): void {
  log.debug('Behavior expression:', { expression });

  // Map expression types to avatar responses
  const expressionMap: Record<string, EmotionalExpression> = {
    breath: 'present',      // Fixed: 'calm' → 'present'
    hum: 'pleased',         // Fixed: 'content' → 'pleased'
    nod: 'attentive',
    sigh: 'empathetic',     // Fixed: 'empathy' → 'empathetic'
    soft_sound: 'attentive',
    yield: 'neutral',
  };

  const avatarExpression = expressionMap[expression];
  if (avatarExpression) {
    // Brief expression for non-verbal presence (use standard expression, not micro)
    ferniExpressions.setExpression(avatarExpression);
  }
}

/**
 * Handle hold space (intentional silence)
 */
function handleBehaviorHoldSpace(duration: number, reason?: string): void {
  log.debug('Behavior hold space:', { duration, reason });

  // Set avatar to a gentle, present expression during hold space
  ferniExpressions.setExpression('empathetic');

  // Slow down breath sync to match the contemplative moment
  setBreathSyncStrength(0.9);

  // After hold space ends, return to neutral
  setTimeout(() => {
    ferniExpressions.setExpression('neutral');
    setBreathSyncStrength(0.5);
  }, duration);
}

/**
 * Handle processing state (visible thinking)
 */
function handleBehaviorProcessing(started: boolean, expression?: string): void {
  log.debug('Behavior processing:', { started, expression });

  if (started) {
    // Show thinking expression
    ferniExpressions.setExpression('thinking');
  } else {
    // Return to neutral after processing
    ferniExpressions.setExpression('neutral');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Ferni EQ system.
 */
export function initFerniEQ(): void {
  if (isInitialized) return;

  avatarContainer = document.querySelector('.avatar-container');

  // Set up event listeners
  document.addEventListener('ferni:user-speech-start', () => {
    startActiveListening();
  });

  document.addEventListener('ferni:user-speech-end', () => {
    stopActiveListening();
  });

  document.addEventListener('ferni:user-speech-pause', ((e: CustomEvent) => {
    onUserSpeechPause(e.detail?.duration || 0);
  }) as EventListener);

  // 🌟 BETTER THAN HUMAN SIGNAL HANDLERS
  // These respond to signals from the backend superhuman capabilities
  initBetterThanHumanSignalHandlers();

  // 🔄 BEHAVIOR SYSTEM SIGNAL HANDLERS
  // Bidirectional behavior system - Code triggers speech, speech triggers code
  initBehaviorSignalHandlers();

  // Periodic breath sync
  breathSyncInterval = setInterval(() => {
    if (breathSync.isEnabled) {
      syncBreathing();
    }
  }, 10000);

  isInitialized = true;
  log.info('Ferni EQ system initialized');
}

/**
 * Dispose the Ferni EQ system.
 */
export function disposeFerniEQ(): void {
  // Clear breath sync interval to prevent memory leak
  if (breathSyncInterval) {
    clearInterval(breathSyncInterval);
    breathSyncInterval = null;
  }
  
  avatarContainer = null;
  isInitialized = false;
  log.info('Ferni EQ system disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Ferni EQ - Superhuman Emotional Intelligence
 *
 * Access via: ferni.playMicroExpression(), ferni.anticipateEmotion(), etc.
 */
export const ferni = {
  // Micro-expressions
  playMicroExpression,
  detectAndTriggerMicroExpression,

  // Active listening
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,

  // Breath sync
  detectUserBreathRate,
  syncBreathing,
  setBreathSyncStrength,
  setBreathSyncEnabled,

  // Concern detection
  analyzeConcern,
  getConcernState,

  // Anticipation
  anticipateEmotion,

  // 🌟 Better Than Human signals
  handleBetterThanHumanSignal,

  // Lifecycle
  init: initFerniEQ,
  dispose: disposeFerniEQ,
};

// Backward compatibility aliases (will be removed in future)
export const beyondPixarUI = ferni;
export const initBeyondPixarUI = initFerniEQ;
export const beyondPixar = ferni;
export const initBeyondPixar = initFerniEQ;

// Expose to window for easy browser console testing
// Usage: window.__ferniEQ.playMicroExpression('recognition')
if (typeof window !== 'undefined') {
  (window as unknown as { __ferniEQ: typeof ferni }).__ferniEQ = ferni;
}
