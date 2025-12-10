/**
 * Humanization Bridge Service
 *
 * Connects backend humanization signals to frontend Ferni EQ system.
 * This is the CRITICAL integration that makes the AI feel truly human by:
 *
 * 1. Backend signals (breakthrough, vulnerability, disengagement) → Frontend expressions
 * 2. Memory callbacks with specific quoted phrases → Recognition micro-expressions
 * 3. Silence-as-presence coordination → Intentional meaningful pauses
 * 4. Mood drift synchronization → Avatar energy/presence matching
 *
 * The goal: Make Ferni's avatar respond to humanization events BEFORE the words arrive,
 * creating that "they understand me" feeling.
 *
 * @module @ferni/humanization-bridge
 */

import { emotionState } from '../emotion/emotion-state.js';
import type { DataMessage } from '../types/events.js';
import { ferni, playMicroExpression } from '../ui/better-than-human.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('HumanizationBridge');

// ============================================================================
// TYPES - Humanization Signal Events from Backend
// ============================================================================

/**
 * Types of humanization signals from the backend DeepHumanizationEngine
 */
export type HumanizationSignalType =
  | 'breakthrough' // User had an insight/realization
  | 'vulnerability' // User shared something vulnerable
  | 'disengagement' // User seems checked out
  | 'high_engagement' // User is really into the conversation
  | 'mind_change' // Ferni is reconsidering based on user input
  | 'memory_callback' // Calling back to something specific
  | 'running_joke' // Inside joke/pattern reference
  | 'physical_presence' // Time/embodiment awareness
  | 'spontaneous_thought' // Unprompted sharing
  | 'mood_drift' // Energy/mood shift in conversation
  | 'silence_moment' // Intentional meaningful silence
  | 'anticipation' // Anticipating user's direction
  | 'evidence_presented' // User presented a counter-argument
  | 'topic_weight_shift' // Topic became heavier/lighter
  | 'relationship_milestone' // Relationship stage progression
  | 'emotional_arc_peak' // Conversation reached emotional climax
  | 'emotional_arc_release'; // Emotional release/resolution

/**
 * Humanization signal event from backend
 */
export interface HumanizationSignalEvent extends DataMessage {
  type: 'humanization_signal';
  signalType: HumanizationSignalType;

  // Optional context data depending on signal type
  content?: string; // For memory callbacks, the specific phrase
  memoryAge?: string; // "3 weeks ago", "last session", etc.
  topic?: string; // Related topic
  intensity?: number; // 0-1 signal strength
  mood?: {
    energy: number; // 0-1 current energy
    engagement: number; // 0-1 current engagement
    emotionalLoad: number; // 0-1 accumulated weight
  };
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  silenceDuration?: number; // For silence moments, how long in ms
  silenceReason?: 'processing' | 'emotional' | 'invitation' | 'presence';
}

/**
 * Memory callback event with specific quoted content
 */
export interface MemoryCallbackEvent extends DataMessage {
  type: 'memory_callback';
  quotedPhrase: string; // The exact phrase user said
  context: string; // What it was about
  whenMentioned: string; // "3 weeks ago", "last Tuesday", etc.
  emotionalWeight: 'light' | 'medium' | 'heavy';
}

/**
 * Conversation rhythm data from backend
 */
export interface ConversationRhythmEvent extends DataMessage {
  type: 'conversation_rhythm';
  userPacing: 'rapid' | 'moderate' | 'slow' | 'contemplative';
  avgTurnLength: number; // Average words per turn
  pausePattern: 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
  energyTrend: 'rising' | 'stable' | 'falling' | 'oscillating';
}

/**
 * Emotional arc tracking from backend
 */
export interface EmotionalArcEvent extends DataMessage {
  type: 'emotional_arc';
  phase: 'opening' | 'building' | 'peak' | 'release' | 'closing';
  intensity: number; // 0-1 current emotional intensity
  dominantEmotion: string; // What emotion is driving the arc
  turnsSincePeak?: number; // How many turns since emotional peak
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// Track recent signals to avoid over-responding
const recentSignals = new Map<HumanizationSignalType, number>();
const SIGNAL_COOLDOWN_MS = 3000; // Minimum time between same signal type

// Track conversation state for contextual responses
let currentMood = {
  energy: 0.7,
  engagement: 0.7,
  emotionalLoad: 0,
};

let currentRhythm: ConversationRhythmEvent['userPacing'] = 'moderate';
let currentArcPhase: EmotionalArcEvent['phase'] = 'opening';

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

/**
 * Handle a humanization signal from the backend
 */
function handleHumanizationSignal(event: HumanizationSignalEvent): void {
  const { signalType, intensity = 0.7 } = event;

  // Check cooldown
  const lastTime = recentSignals.get(signalType) || 0;
  if (Date.now() - lastTime < SIGNAL_COOLDOWN_MS) {
    log.debug('Signal on cooldown:', signalType);
    return;
  }
  recentSignals.set(signalType, Date.now());

  log.info('🌉 Humanization signal:', signalType, { intensity, mood: event.mood });

  // Update mood state if provided
  if (event.mood) {
    currentMood = event.mood;
  }

  // Route to appropriate handler
  switch (signalType) {
    case 'breakthrough':
      handleBreakthrough(intensity);
      break;
    case 'vulnerability':
      handleVulnerability(intensity);
      break;
    case 'disengagement':
      handleDisengagement();
      break;
    case 'high_engagement':
      handleHighEngagement(intensity);
      break;
    case 'mind_change':
      handleMindChange();
      break;
    case 'memory_callback':
      handleMemoryCallback(event.content, event.memoryAge);
      break;
    case 'running_joke':
      handleRunningJoke();
      break;
    case 'physical_presence':
      handlePhysicalPresence();
      break;
    case 'spontaneous_thought':
      handleSpontaneousThought();
      break;
    case 'mood_drift':
      handleMoodDrift(event.mood);
      break;
    case 'silence_moment':
      handleSilenceMoment(event.silenceDuration, event.silenceReason);
      break;
    case 'anticipation':
      handleAnticipation();
      break;
    case 'evidence_presented':
      handleEvidencePresented();
      break;
    case 'topic_weight_shift':
      handleTopicWeightShift(intensity);
      break;
    case 'relationship_milestone':
      handleRelationshipMilestone(event.relationshipStage);
      break;
    case 'emotional_arc_peak':
      handleEmotionalArcPeak(intensity);
      break;
    case 'emotional_arc_release':
      handleEmotionalArcRelease();
      break;
  }
}

// ============================================================================
// INDIVIDUAL SIGNAL HANDLERS
// ============================================================================

/**
 * User had a breakthrough/insight moment
 * Show genuine excitement and recognition
 */
function handleBreakthrough(intensity: number): void {
  log.debug('💡 Breakthrough detected');

  // Micro-expression first (subliminal)
  playMicroExpression('aha_flash');

  // Then visible expression
  setTimeout(() => {
    if (intensity > 0.7) {
      ferniExpressions.realization();
    } else {
      ferniExpressions.setExpression('pleased', 400);
    }
  }, 100);

  // Dispatch for other systems to react
  document.dispatchEvent(new CustomEvent('ferni:breakthrough'));
}

/**
 * User shared something vulnerable
 * Show protective care and warmth
 */
function handleVulnerability(intensity: number): void {
  log.debug('💙 Vulnerability detected');

  // Protective micro-expression
  playMicroExpression('protective');

  // Warmth follows
  setTimeout(() => {
    playMicroExpression('warmth_pulse');
  }, 150);

  // Set holding/present emotion state
  if (intensity > 0.6) {
    emotionState.setEmotion('holding');
    ferniExpressions.holdSpace();
  } else {
    emotionState.setEmotion('attentive');
    ferniExpressions.setExpression('empathetic', 400);
  }

  // Slow down any animations
  document.dispatchEvent(
    new CustomEvent('ferni:slow-presence', {
      detail: { reason: 'vulnerability' },
    })
  );
}

/**
 * User seems disengaged
 * Show gentle check-in energy
 */
function handleDisengagement(): void {
  log.debug('😴 Disengagement detected');

  // Curious/concerned micro-expression
  playMicroExpression('noticing');

  // Show attentive but not pushy
  setTimeout(() => {
    ferniExpressions.curious();
  }, 200);

  // Dispatch for potential re-engagement prompt
  document.dispatchEvent(new CustomEvent('ferni:user-disengaged'));
}

/**
 * User is highly engaged
 * Match their energy
 */
function handleHighEngagement(intensity: number): void {
  log.debug('🔥 High engagement detected');

  // Recognition that we're in flow
  playMicroExpression('delight_flash');

  // Match their energy level
  if (intensity > 0.8) {
    ferniExpressions.excited();
    emotionState.setEmotion('excited');
  } else {
    ferniExpressions.setExpression('warm', 400);
    emotionState.setEmotion('warm');
  }
}

/**
 * Ferni is changing their mind based on user input
 * Show the process of reconsidering
 */
function handleMindChange(): void {
  log.debug('🔄 Mind change happening');

  // Show contemplation/processing
  playMicroExpression('contemplation');

  // Then shift to understanding
  setTimeout(() => {
    playMicroExpression('understanding');
    ferniExpressions.contemplative();
  }, 300);
}

/**
 * Memory callback - referencing something specific from the past
 * This is where "hyper-specific memory" creates magic
 */
function handleMemoryCallback(content?: string, memoryAge?: string): void {
  log.debug('🧠 Memory callback:', { content, memoryAge });

  // Recognition micro-expression
  playMicroExpression('memory_spark');

  // Show remembering state
  emotionState.setEmotion('remembering');
  ferniExpressions.setExpression('remembering', 400);

  // If it's an older memory, show deeper recognition
  if (memoryAge?.includes('week') || memoryAge?.includes('month')) {
    setTimeout(() => {
      playMicroExpression('warmth_pulse');
    }, 400);
  }
}

/**
 * Running joke/inside reference
 * Show playful recognition
 */
function handleRunningJoke(): void {
  log.debug('😄 Running joke callback');

  // Insider recognition
  playMicroExpression('insider');

  // Brief playful expression
  setTimeout(() => {
    ferniExpressions.setExpression('pleased', 300);
  }, 100);
}

/**
 * Physical presence awareness (time of day, settling in, etc.)
 */
function handlePhysicalPresence(): void {
  log.debug('🏠 Physical presence moment');

  // Grounded, present feeling
  emotionState.setEmotion('present');
  ferniExpressions.setExpression('present', 500);
}

/**
 * Spontaneous thought - Ferni having an unprompted idea
 */
function handleSpontaneousThought(): void {
  log.debug('💭 Spontaneous thought');

  // Show thinking/processing
  playMicroExpression('interest_flash');

  setTimeout(() => {
    ferniExpressions.contemplation(1500);
  }, 150);
}

/**
 * Mood drift - conversation energy shifting
 */
function handleMoodDrift(mood?: HumanizationSignalEvent['mood']): void {
  if (!mood) return;

  log.debug('🌊 Mood drift:', mood);

  currentMood = mood;

  // Adjust avatar presence based on energy
  if (mood.energy < 0.4) {
    // Low energy - slower, calmer presence
    document.dispatchEvent(
      new CustomEvent('ferni:energy-shift', {
        detail: { level: 'low', emotionalLoad: mood.emotionalLoad },
      })
    );
  } else if (mood.energy > 0.8) {
    // High energy - more animated
    document.dispatchEvent(
      new CustomEvent('ferni:energy-shift', {
        detail: { level: 'high', engagement: mood.engagement },
      })
    );
  }
}

/**
 * Intentional silence moment
 * This is where "silence as communication" happens
 */
function handleSilenceMoment(duration?: number, reason?: string): void {
  log.debug('🤫 Silence moment:', { duration, reason });

  // Set appropriate presence state based on reason
  switch (reason) {
    case 'emotional':
      // Heavy moment - just be present
      emotionState.setEmotion('holding');
      ferniExpressions.holdSpace();
      break;
    case 'processing':
      // Give space to think
      emotionState.setEmotion('waiting');
      ferniExpressions.setExpression('contemplative', 500);
      break;
    case 'invitation':
      // Gentle invitation to share more
      emotionState.setEmotion('receiving');
      ferniExpressions.setExpression('attentive', 400);
      break;
    case 'presence':
    default:
      // Just being here
      emotionState.setEmotion('present');
      ferniExpressions.setExpression('present', 500);
  }

  // Dispatch for breath sync to slow down
  document.dispatchEvent(
    new CustomEvent('ferni:silence-moment', {
      detail: { duration, reason },
    })
  );
}

/**
 * Anticipation - reading where the user is going
 */
function handleAnticipation(): void {
  log.debug('🔮 Anticipation');

  // Show attentive anticipation
  playMicroExpression('interest_flash');
  emotionState.setEmotion('curiousLean');
}

/**
 * User presented evidence/counter-argument
 * Show genuine consideration
 */
function handleEvidencePresented(): void {
  log.debug('📊 Evidence presented');

  // Show that we're really taking this in
  playMicroExpression('contemplation');

  setTimeout(() => {
    ferniExpressions.contemplative();
  }, 200);
}

/**
 * Topic weight shifted (heavier or lighter)
 */
function handleTopicWeightShift(intensity: number): void {
  log.debug('⚖️ Topic weight shift:', intensity);

  if (intensity > 0.6) {
    // Getting heavier
    emotionState.setEmotion('holdingSpace');
    ferni.setBreathSyncStrength(0.5); // Sync more closely when heavy
  } else if (intensity < 0.4) {
    // Getting lighter
    emotionState.setEmotion('warm');
    ferni.setBreathSyncStrength(0.2); // More independent when light
  }
}

/**
 * Relationship milestone reached
 */
function handleRelationshipMilestone(
  stage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
): void {
  log.debug('🎯 Relationship milestone:', stage);

  // This is a big deal - show genuine warmth
  playMicroExpression('warmth_pulse');

  setTimeout(() => {
    playMicroExpression('delight_flash');
    emotionState.setEmotion('growing');
    ferniExpressions.warmthSparkle();
  }, 200);

  // Dispatch for celebration systems
  document.dispatchEvent(
    new CustomEvent('ferni:relationship-milestone', {
      detail: { stage },
    })
  );
}

/**
 * Emotional arc reached peak
 */
function handleEmotionalArcPeak(intensity: number): void {
  log.debug('📈 Emotional arc peak:', intensity);

  currentArcPhase = 'peak';

  // This is the climax - full presence
  emotionState.setEmotion('holding');
  ferniExpressions.heldPose('empathetic', 800);

  // Sync breathing more closely
  ferni.setBreathSyncStrength(0.6);
}

/**
 * Emotional arc release/resolution
 */
function handleEmotionalArcRelease(): void {
  log.debug('📉 Emotional arc release');

  currentArcPhase = 'release';

  // Gentle release - like exhaling together
  playMicroExpression('warmth_pulse');

  setTimeout(() => {
    emotionState.setEmotion('settling');
    ferniExpressions.setExpression('warm', 500);
  }, 300);

  // Relax breath sync
  ferni.setBreathSyncStrength(0.3);
}

// ============================================================================
// RHYTHM & ARC HANDLERS
// ============================================================================

/**
 * Handle conversation rhythm updates
 */
function handleConversationRhythm(event: ConversationRhythmEvent): void {
  log.debug('🥁 Conversation rhythm:', event.userPacing);

  currentRhythm = event.userPacing;

  // Dispatch for animation systems to adapt
  document.dispatchEvent(
    new CustomEvent('ferni:rhythm-change', {
      detail: {
        pacing: event.userPacing,
        pausePattern: event.pausePattern,
        energyTrend: event.energyTrend,
      },
    })
  );
}

/**
 * Handle emotional arc updates
 */
function handleEmotionalArc(event: EmotionalArcEvent): void {
  log.debug('🎭 Emotional arc:', event.phase, event.intensity);

  currentArcPhase = event.phase;

  // Dispatch for narrative systems
  document.dispatchEvent(
    new CustomEvent('ferni:arc-update', {
      detail: {
        phase: event.phase,
        intensity: event.intensity,
        dominantEmotion: event.dominantEmotion,
      },
    })
  );
}

// ============================================================================
// MESSAGE ROUTING
// ============================================================================

/**
 * Check if a message is a humanization signal
 */
export function isHumanizationSignal(message: DataMessage): message is HumanizationSignalEvent {
  return message.type === 'humanization_signal';
}

/**
 * Check if a message is a memory callback
 */
export function isMemoryCallback(message: DataMessage): message is MemoryCallbackEvent {
  return message.type === 'memory_callback';
}

/**
 * Check if a message is a conversation rhythm update
 */
export function isConversationRhythm(message: DataMessage): message is ConversationRhythmEvent {
  return message.type === 'conversation_rhythm';
}

/**
 * Check if a message is an emotional arc update
 */
export function isEmotionalArc(message: DataMessage): message is EmotionalArcEvent {
  return message.type === 'emotional_arc';
}

/**
 * Process a data message - returns true if handled
 */
export function processHumanizationMessage(message: DataMessage): boolean {
  if (isHumanizationSignal(message)) {
    handleHumanizationSignal(message);
    return true;
  }

  if (isMemoryCallback(message)) {
    handleMemoryCallback(message.quotedPhrase, message.whenMentioned);
    return true;
  }

  if (isConversationRhythm(message)) {
    handleConversationRhythm(message);
    return true;
  }

  if (isEmotionalArc(message)) {
    handleEmotionalArc(message);
    return true;
  }

  return false;
}

// ============================================================================
// STATE GETTERS
// ============================================================================

/**
 * Get current mood state
 */
export function getCurrentMood(): typeof currentMood {
  return { ...currentMood };
}

/**
 * Get current conversation rhythm
 */
export function getCurrentRhythm(): ConversationRhythmEvent['userPacing'] {
  return currentRhythm;
}

/**
 * Get current emotional arc phase
 */
export function getCurrentArcPhase(): EmotionalArcEvent['phase'] {
  return currentArcPhase;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the humanization bridge
 */
export function initHumanizationBridge(): void {
  if (isInitialized) return;

  // Listen for silence moments to coordinate breath
  document.addEventListener('ferni:silence-moment', ((e: CustomEvent) => {
    const { duration, reason } = e.detail;
    if (reason === 'emotional' && duration > 2000) {
      // Deep breath during emotional silences
      ferni.syncBreathing();
    }
  }) as EventListener);

  // Listen for energy shifts to adjust presence
  document.addEventListener('ferni:energy-shift', ((e: CustomEvent) => {
    const { level } = e.detail;
    // Could adjust animation speeds, glow intensity, etc.
    log.debug('Energy shift to:', level);
  }) as EventListener);

  isInitialized = true;
  log.info('✅ Humanization bridge initialized');
}

/**
 * Dispose the humanization bridge
 */
export function disposeHumanizationBridge(): void {
  recentSignals.clear();
  isInitialized = false;
  log.info('Humanization bridge disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const humanizationBridge = {
  // Message processing
  processMessage: processHumanizationMessage,
  isHumanizationSignal,
  isMemoryCallback,
  isConversationRhythm,
  isEmotionalArc,

  // State
  getMood: getCurrentMood,
  getRhythm: getCurrentRhythm,
  getArcPhase: getCurrentArcPhase,

  // Lifecycle
  init: initHumanizationBridge,
  dispose: disposeHumanizationBridge,
};

export default humanizationBridge;
