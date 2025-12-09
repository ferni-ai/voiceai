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
import { ferniExpressions, type EmotionalExpression } from './ferni-expressions.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FerniEQ');

// ============================================================================
// TYPES
// ============================================================================

interface MicroExpression {
  expression: EmotionalExpression;
  duration: number;      // 40-150ms (subliminal)
  intensity: number;     // 0-1 how visible
  probability: number;   // 0-1 chance of occurring
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

const activeListening: ActiveListeningState = {
  isListening: false,
  lastNodTime: 0,
  nodCount: 0,
  pauseCount: 0,
};

const breathSync: BreathSyncState = {
  isEnabled: true,
  userBreathRate: 15, // Default breaths per minute
  syncStrength: 0.3,  // How closely to match (0=ignore, 1=exact)
  lastSyncTime: 0,
};

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
 */
const MICRO_EXPRESSIONS: Record<string, MicroExpression> = {
  // Recognition flash when user mentions something familiar
  recognition: {
    expression: 'curious',
    duration: 80,
    intensity: 0.4,
    probability: 0.7,
  },
  
  // Brief concern flash before empathy kicks in
  concern_flash: {
    expression: 'worried',
    duration: 60,
    intensity: 0.3,
    probability: 0.8,
  },
  
  // Micro-delight when user achieves something
  delight_flash: {
    expression: 'pleased',
    duration: 100,
    intensity: 0.5,
    probability: 0.9,
  },
  
  // Tiny warmth pulse during connection
  warmth_pulse: {
    expression: 'warm',
    duration: 120,
    intensity: 0.3,
    probability: 0.6,
  },
  
  // Brief surprise/interest at unexpected content
  interest_flash: {
    expression: 'curious',
    duration: 70,
    intensity: 0.4,
    probability: 0.5,
  },
};

/**
 * Play a micro-expression - subliminal emotional flash.
 * These are intentionally barely perceptible but affect trust building.
 */
export function playMicroExpression(type: keyof typeof MICRO_EXPRESSIONS): void {
  const micro = MICRO_EXPRESSIONS[type];
  if (!micro) return;
  
  // Probability check
  if (Math.random() > micro.probability) return;
  
  // Play the micro-expression with intensity scaling
  ferniExpressions.setExpression(micro.expression, micro.duration / 3);
  
  // Quick return to previous state
  setTimeout(() => {
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
    ferniExpressions.setExpression(expressionMap[currentEmotion] || 'neutral', micro.duration);
  }, micro.duration);
  
  log.debug('Micro-expression:', type, micro.duration + 'ms');
}

/**
 * Trigger micro-expression based on detected content.
 * Call this from speech analysis.
 */
export function detectAndTriggerMicroExpression(content: {
  transcript?: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'emotional';
  intensity?: number;
  isNewTopic?: boolean;
  mentionedMemory?: boolean;
}): void {
  // Recognition when topic is familiar
  if (content.mentionedMemory) {
    playMicroExpression('recognition');
    return;
  }
  
  // Concern flash for emotional content
  if (content.tone === 'negative' || content.tone === 'emotional') {
    playMicroExpression('concern_flash');
    return;
  }
  
  // Interest flash for new topics
  if (content.isNewTopic) {
    playMicroExpression('interest_flash');
    return;
  }
  
  // Delight for positive achievements
  if (content.tone === 'positive' && content.intensity && content.intensity > 0.6) {
    playMicroExpression('delight_flash');
    return;
  }
  
  // Random warmth during positive conversation
  if (content.tone === 'positive' && Math.random() < 0.2) {
    playMicroExpression('warmth_pulse');
  }
}

// ============================================================================
// EMPATHETIC NODDING - Active Listening Signals
// ============================================================================

const MIN_NOD_INTERVAL = 2000; // Minimum ms between nods
const NOD_PROBABILITY_BASE = 0.3; // Base probability per pause

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
  avatarContainer.animate([
    { transform: 'translateY(0) rotate(0deg)' },
    { transform: `translateY(${params.y}px) rotate(${params.rotate}deg)` },
    { transform: 'translateY(0) rotate(0deg)' },
  ], {
    duration: params.duration,
    easing: EASING.GENTLE,
    composite: 'add',
  });
  
  log.debug('Micro-nod performed:', intensity);
}

/**
 * Perform a listening lean - shows deeper engagement.
 */
function performListeningLean(): void {
  if (!avatarContainer) return;
  
  avatarContainer.animate([
    { transform: 'translateY(0) scale(1, 1)' },
    { transform: 'translateY(-3px) scale(0.998, 1.002)' },
    { transform: 'translateY(-2px) scale(0.999, 1.001)' },
  ], {
    duration: 400,
    easing: EASING.GENTLE,
    composite: 'add',
    fill: 'forwards',
  });
  
  // Return to neutral after a bit
  setTimeout(() => {
    avatarContainer?.animate([
      { transform: 'translateY(-2px)' },
      { transform: 'translateY(0)' },
    ], {
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
  
  if (pauseDuration > 300 && pauseDuration < 800) {
    // Short pause - maybe micro-nod
    if (Math.random() < NOD_PROBABILITY_BASE + (activeListening.pauseCount * 0.05)) {
      performMicroNod('micro');
    }
  } else if (pauseDuration > 800 && pauseDuration < 1500) {
    // Medium pause - subtle acknowledgment
    performMicroNod('subtle');
    // Maybe lean in
    if (Math.random() < 0.3) {
      performListeningLean();
    }
  } else if (pauseDuration > 1500 && pauseDuration < 3000) {
    // Long pause - they're thinking, show patience
    ferniExpressions.setExpression('contemplative', 300);
  } else if (pauseDuration > 3000) {
    // Very long pause - gentle concern check
    ferniExpressions.setExpression('attentive', 400);
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
}

/**
 * Stop active listening mode.
 */
export function stopActiveListening(): void {
  activeListening.isListening = false;
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
  const breathPauses = pausePatterns.filter(p => p > 200 && p < 800);
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
  document.dispatchEvent(new CustomEvent('ferni:breath-sync', {
    detail: breathingUpdate,
  }));
  
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
  }
  
  return level;
}

/**
 * Respond to detected concern with appropriate expression.
 */
function respondToConcern(level: ConcernState['level'], triggers: string[]): void {
  log.debug('Concern detected:', level, triggers);
  
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
      document.dispatchEvent(new CustomEvent('ferni:gentle-checkin', {
        detail: { triggers, level },
      }));
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
 */
export function anticipateEmotion(partial: {
  transcript: string;
  tone: 'rising' | 'falling' | 'flat';
  energy: number;
  context?: string[];
}): EmotionId | null {
  // "I've been thinking about..." + falling tone = reflective/sad
  if (/i('ve| have) been (thinking|wondering)/i.test(partial.transcript) && partial.tone === 'falling') {
    ferniExpressions.setExpression('contemplative', 300);
    return 'contemplative';
  }
  
  // "Guess what!" + rising tone = excitement incoming
  if (/guess what/i.test(partial.transcript) && partial.tone === 'rising') {
    ferniExpressions.setExpression('curious', 200);
    return 'curious';
  }
  
  // "Remember when..." = nostalgia/emotional
  if (/remember (when|that time)/i.test(partial.transcript)) {
    ferniExpressions.setExpression('remembering', 300);
    return 'remembering';
  }
  
  // "I need to tell you..." = something important
  if (/i need to (tell you|say|share)/i.test(partial.transcript)) {
    ferniExpressions.setExpression('attentive', 250);
    return 'attentive';
  }
  
  // "Actually..." = reconsideration
  if (/^actually/i.test(partial.transcript.trim())) {
    ferniExpressions.setExpression('curious', 200);
    return 'curious';
  }
  
  return null;
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
  
  // Periodic breath sync
  setInterval(() => {
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
  
  // Lifecycle
  init: initFerniEQ,
  dispose: disposeFerniEQ,
};

// Backward compatibility aliases (will be removed in future)
export const beyondPixarUI = ferni;
export const initBeyondPixarUI = initFerniEQ;
export const beyondPixar = ferni;
export const initBeyondPixar = initFerniEQ;
