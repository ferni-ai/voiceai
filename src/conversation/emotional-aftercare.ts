/**
 * Emotional Aftercare Engine
 *
 * > "We don't just hold space—we help you find solid ground again."
 *
 * After heavy emotional moments, actively guides users back to equilibrium:
 *
 * - **Debt Tracking**: Monitor accumulated emotional "debt"
 * - **Grounding Transitions**: Natural shifts to stability
 * - **Closure Signals**: Ensure conversations end on stable ground
 * - **Re-regulation Support**: Help nervous system return to baseline
 * - **Integration Pauses**: Allow processing time after intensity
 *
 * This is about CARE—not just processing emotions but ensuring recovery.
 *
 * @module @ferni/emotional-aftercare
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'EmotionalAftercare' });

// ============================================================================
// TYPES
// ============================================================================

export type EmotionalIntensity = 'low' | 'moderate' | 'high' | 'overwhelming';

export type AftercarePriority = 'none' | 'low' | 'moderate' | 'high' | 'urgent';

export type AftercarePhase =
  | 'none' // No aftercare needed
  | 'holding' // Still in the emotional moment
  | 'transitioning' // Beginning to shift
  | 'grounding' // Actively grounding
  | 'integrating' // Processing what happened
  | 'closing' // Wrapping up safely
  | 'recovered'; // Back to baseline

export interface EmotionalEvent {
  /** Turn number when event occurred */
  turn: number;

  /** Timestamp */
  timestamp: number;

  /** Intensity level */
  intensity: EmotionalIntensity;

  /** Type of emotional content */
  contentType:
    | 'vulnerability'
    | 'grief'
    | 'trauma'
    | 'fear'
    | 'anger'
    | 'shame'
    | 'overwhelm'
    | 'breakthrough';

  /** Topic if identified */
  topic?: string;

  /** Has this been addressed in aftercare? */
  addressedInAftercare: boolean;
}

export interface AftercareState {
  /** Current accumulated emotional debt (0-1) */
  emotionalDebt: number;

  /** Current aftercare phase */
  phase: AftercarePhase;

  /** Recent emotional events */
  recentEvents: EmotionalEvent[];

  /** Turns since last high-intensity moment */
  turnsSinceIntensity: number;

  /** Priority level for aftercare */
  priority: AftercarePriority;

  /** Has user shown signs of re-regulation? */
  showingRecoverySignals: boolean;
}

export interface AftercareGuidance {
  /** Current phase */
  phase: AftercarePhase;

  /** Priority level */
  priority: AftercarePriority;

  /** Suggested transition phrase (if applicable) */
  transitionPhrase: string | null;

  /** Grounding prompt (if needed) */
  groundingPrompt: string | null;

  /** Check-in question */
  checkInQuestion: string | null;

  /** Should we suggest wrapping up? */
  suggestWrapUp: boolean;

  /** Response tone adjustment */
  toneGuidance: string;

  /** Pacing guidance */
  pacingGuidance: 'slower' | 'normal' | 'gentle_pause';
}

// ============================================================================
// CONTENT
// ============================================================================

const TRANSITION_PHRASES = {
  gentle: [
    'That was a lot to share. Thank you for trusting me with that.',
    "I'm really glad you told me. How are you feeling right now?",
    "That took courage. Let's take a breath together.",
    'Thank you for going there with me. Where are you at now?',
  ],
  grounding: [
    'Before we move on—take a moment. How are you feeling in your body right now?',
    "Let's pause here. What do you need right now?",
    "That was heavy. Let's find some solid ground before we continue.",
    "I want to make sure you're okay. What would feel supportive right now?",
  ],
  closing: [
    'Before we wrap up, I want to check in—how are you feeling after everything we talked about?',
    'We covered some big stuff today. How are you doing right now?',
    "I don't want to leave you in a heavy place. What do you need before we end?",
    "Let's make sure you're leaving on solid ground. How are you feeling?",
  ],
};

const GROUNDING_PROMPTS = [
  "What's one thing you can see around you right now?",
  'Can you feel your feet on the ground?',
  'Take a breath with me. In... and out.',
  "What's something that feels stable in your life right now?",
  "What's one small thing that might feel good right now?",
  'Is there someone or something that feels safe to think about?',
];

const CHECK_IN_QUESTIONS = {
  during: [
    'How are you doing with all of this?',
    'Is this okay? Do you want to keep going?',
    'Where are you at right now?',
    'What do you need from me right now?',
  ],
  after: [
    "How are you feeling now that you've said that?",
    "What's coming up for you?",
    'Do you feel lighter or heavier after sharing that?',
    'What do you need right now?',
  ],
  closing: [
    'How are you feeling as we wrap up?',
    'Is there anything you need before we end?',
    'Are you okay to go about your day?',
    "What's one thing you can do to take care of yourself today?",
  ],
};

const RECOVERY_SIGNALS = [
  /i feel (better|lighter|okay|relieved)/i,
  /thank you (for )?listening/i,
  /that (felt good|helped|was good) to (say|share|get out)/i,
  /i needed (that|to say that|to talk)/i,
  /i'?m (okay|good|alright) now/i,
  /anyway/i,
  /so,? (what|how|let'?s)/i,
  /ha(ha)?|lol/i,
  /on a (lighter|different|happier) note/i,
];

const INTENSITY_INDICATORS = {
  overwhelming: [
    /i can'?t (take|handle|deal|cope|do this)/i,
    /it'?s too much/i,
    /i'?m (falling apart|breaking|losing it)/i,
    /i don'?t know (how to|what to|if i can)/i,
    /everything is/i,
    /i can'?t (breathe|think|stop)/i,
  ],
  high: [
    /i'?ve never told anyone/i,
    /this is (really |so )?(hard|difficult|painful)/i,
    /(died|death|passed away|suicide|abuse|trauma)/i,
    /i'?m (scared|terrified|afraid)/i,
    /i can'?t stop (crying|thinking|worrying)/i,
    /since (they|he|she|it) (happened|died|left)/i,
  ],
  moderate: [
    /it'?s been (hard|difficult|tough|rough)/i,
    /i'?ve been struggling/i,
    /i feel (sad|anxious|worried|stressed)/i,
    /i'?m not (okay|doing well|great)/i,
    /i (miss|lost|regret)/i,
  ],
};

// ============================================================================
// EMOTIONAL AFTERCARE ENGINE
// ============================================================================

export class EmotionalAftercareEngine {
  private state: AftercareState = {
    emotionalDebt: 0,
    phase: 'none',
    recentEvents: [],
    turnsSinceIntensity: 0,
    priority: 'none',
    showingRecoverySignals: false,
  };

  private turnCount = 0;

  // Config
  private readonly DEBT_DECAY_RATE = 0.08; // Per turn
  private readonly HIGH_DEBT_THRESHOLD = 0.6;
  private readonly URGENT_DEBT_THRESHOLD = 0.85;
  private readonly MAX_EVENTS = 10;
  private readonly MINIMUM_GROUNDING_TURNS = 3;

  constructor() {
    logger.debug('EmotionalAftercareEngine initialized');
  }

  /**
   * Process a turn and update aftercare state
   *
   * @param userMessage - User's message
   * @param turnCount - Current turn number
   * @param detectedEmotion - Emotion detected in message
   * @returns Updated state
   */
  processTurn(userMessage: string, turnCount: number, detectedEmotion?: string): AftercareState {
    this.turnCount = turnCount;

    // Check for emotional intensity in message
    const intensity = this.detectIntensity(userMessage, detectedEmotion);

    // Record emotional event if significant
    if (intensity !== 'low') {
      const contentType = this.inferContentType(userMessage, detectedEmotion);
      this.recordEmotionalEvent(intensity, contentType);
    }

    // Check for recovery signals
    this.state.showingRecoverySignals = this.detectRecoverySignals(userMessage);

    // Update debt
    this.updateEmotionalDebt(intensity);

    // Update phase
    this.updatePhase();

    // Update priority
    this.updatePriority();

    // Emit signal if entering high-need aftercare
    if (this.state.priority === 'high' || this.state.priority === 'urgent') {
      void humanizationSignalEmitter.emit({
        signalType: 'aftercare_needed',
        intensity: this.state.emotionalDebt,
        concernLevel: this.state.priority === 'urgent' ? 'elevated' : 'moderate',
        recommendedApproach: this.state.phase,
      });
    }

    logger.debug(
      {
        turn: turnCount,
        debt: this.state.emotionalDebt.toFixed(2),
        phase: this.state.phase,
        priority: this.state.priority,
        recovery: this.state.showingRecoverySignals,
      },
      '🫂 Aftercare state updated'
    );

    return { ...this.state };
  }

  /**
   * Get guidance for response based on aftercare needs
   */
  getGuidance(): AftercareGuidance {
    const guidance: AftercareGuidance = {
      phase: this.state.phase,
      priority: this.state.priority,
      transitionPhrase: null,
      groundingPrompt: null,
      checkInQuestion: null,
      suggestWrapUp: false,
      toneGuidance: 'normal',
      pacingGuidance: 'normal',
    };

    // No aftercare needed
    if (this.state.phase === 'none' || this.state.phase === 'recovered') {
      return guidance;
    }

    // Set tone and pacing
    if (this.state.priority === 'urgent' || this.state.priority === 'high') {
      guidance.toneGuidance = 'very gentle, slow, grounded';
      guidance.pacingGuidance = 'slower';
    } else if (this.state.priority === 'moderate') {
      guidance.toneGuidance = 'warm, present, unhurried';
      guidance.pacingGuidance = 'gentle_pause';
    }

    // Phase-specific guidance
    switch (this.state.phase) {
      case 'holding':
        // Still in it - validate and check in
        guidance.checkInQuestion = this.pickRandom(CHECK_IN_QUESTIONS.during);
        guidance.toneGuidance = 'present, validating, patient';
        break;

      case 'transitioning':
        // Beginning to shift - gentle transition
        guidance.transitionPhrase = this.pickRandom(TRANSITION_PHRASES.gentle);
        guidance.checkInQuestion = this.pickRandom(CHECK_IN_QUESTIONS.after);
        break;

      case 'grounding':
        // Need active grounding
        guidance.groundingPrompt = this.pickRandom(GROUNDING_PROMPTS);
        guidance.transitionPhrase = this.pickRandom(TRANSITION_PHRASES.grounding);
        guidance.pacingGuidance = 'slower';
        break;

      case 'integrating':
        // Processing - check in
        guidance.checkInQuestion = this.pickRandom(CHECK_IN_QUESTIONS.after);
        break;

      case 'closing':
        // Wrapping up - ensure stability
        guidance.transitionPhrase = this.pickRandom(TRANSITION_PHRASES.closing);
        guidance.checkInQuestion = this.pickRandom(CHECK_IN_QUESTIONS.closing);
        guidance.suggestWrapUp = true;
        break;
    }

    return guidance;
  }

  /**
   * Check if conversation should suggest wrapping up
   */
  shouldSuggestClosing(isNearEnd: boolean): boolean {
    // If near end of conversation and still have debt, we need to close properly
    if (isNearEnd && this.state.emotionalDebt > 0.3) {
      return true;
    }

    // If in closing phase
    if (this.state.phase === 'closing') {
      return true;
    }

    return false;
  }

  /**
   * Mark that aftercare was provided for current events
   */
  acknowledgeAftercare(): void {
    for (const event of this.state.recentEvents) {
      if (!event.addressedInAftercare) {
        event.addressedInAftercare = true;
      }
    }

    // Reduce debt slightly when aftercare is acknowledged
    this.state.emotionalDebt = Math.max(0, this.state.emotionalDebt - 0.1);

    logger.debug('Aftercare acknowledged');
  }

  /**
   * Get current state
   */
  getState(): AftercareState {
    return { ...this.state };
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.state = {
      emotionalDebt: 0,
      phase: 'none',
      recentEvents: [],
      turnsSinceIntensity: 0,
      priority: 'none',
      showingRecoverySignals: false,
    };
    this.turnCount = 0;
    logger.debug('EmotionalAftercareEngine reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private detectIntensity(message: string, emotion?: string): EmotionalIntensity {
    const lowerMessage = message.toLowerCase();

    // Check overwhelming patterns
    if (INTENSITY_INDICATORS.overwhelming.some((p) => p.test(lowerMessage))) {
      return 'overwhelming';
    }

    // Check high patterns
    if (INTENSITY_INDICATORS.high.some((p) => p.test(lowerMessage))) {
      return 'high';
    }

    // Check moderate patterns
    if (INTENSITY_INDICATORS.moderate.some((p) => p.test(lowerMessage))) {
      return 'moderate';
    }

    // Check emotion
    if (emotion) {
      const highEmotions = ['grief', 'terror', 'despair', 'rage', 'shame'];
      const moderateEmotions = ['sad', 'anxious', 'angry', 'scared', 'overwhelmed'];

      if (highEmotions.includes(emotion.toLowerCase())) return 'high';
      if (moderateEmotions.includes(emotion.toLowerCase())) return 'moderate';
    }

    return 'low';
  }

  private inferContentType(message: string, emotion?: string): EmotionalEvent['contentType'] {
    const lower = message.toLowerCase();

    if (/(died|death|passed away|lost|grief|mourning)/.test(lower)) return 'grief';
    if (/(trauma|abuse|assault|ptsd|flashback)/.test(lower)) return 'trauma';
    if (/(scared|terrified|afraid|fear|panic)/.test(lower)) return 'fear';
    if (/(angry|furious|rage|hate|pissed)/.test(lower)) return 'anger';
    if (/(shame|embarrassed|humiliated|ashamed)/.test(lower)) return 'shame';
    if (/(overwhelmed|too much|can'?t cope)/.test(lower)) return 'overwhelm';
    if (/(realized|breakthrough|finally|figured out)/.test(lower)) return 'breakthrough';

    if (emotion) {
      const emotionMap: Record<string, EmotionalEvent['contentType']> = {
        grief: 'grief',
        fear: 'fear',
        anger: 'anger',
        shame: 'shame',
        overwhelmed: 'overwhelm',
      };
      if (emotionMap[emotion.toLowerCase()]) {
        return emotionMap[emotion.toLowerCase()];
      }
    }

    return 'vulnerability';
  }

  private recordEmotionalEvent(
    intensity: EmotionalIntensity,
    contentType: EmotionalEvent['contentType']
  ): void {
    const event: EmotionalEvent = {
      turn: this.turnCount,
      timestamp: Date.now(),
      intensity,
      contentType,
      addressedInAftercare: false,
    };

    this.state.recentEvents.push(event);

    // Keep only recent events
    if (this.state.recentEvents.length > this.MAX_EVENTS) {
      this.state.recentEvents.shift();
    }

    // Reset turns since intensity for high/overwhelming
    if (intensity === 'high' || intensity === 'overwhelming') {
      this.state.turnsSinceIntensity = 0;
    }
  }

  private detectRecoverySignals(message: string): boolean {
    return RECOVERY_SIGNALS.some((p) => p.test(message));
  }

  private updateEmotionalDebt(currentIntensity: EmotionalIntensity): void {
    // Add debt based on intensity
    const intensityDebt: Record<EmotionalIntensity, number> = {
      low: 0,
      moderate: 0.15,
      high: 0.35,
      overwhelming: 0.5,
    };

    this.state.emotionalDebt += intensityDebt[currentIntensity];

    // Natural decay
    this.state.emotionalDebt -= this.DEBT_DECAY_RATE;

    // Faster decay if showing recovery signals
    if (this.state.showingRecoverySignals) {
      this.state.emotionalDebt -= 0.1;
    }

    // Clamp
    this.state.emotionalDebt = Math.max(0, Math.min(1, this.state.emotionalDebt));

    // Update turns since intensity
    const lastHighEvent = [...this.state.recentEvents]
      .reverse()
      .find((e) => e.intensity === 'high' || e.intensity === 'overwhelming');

    if (lastHighEvent) {
      this.state.turnsSinceIntensity = this.turnCount - lastHighEvent.turn;
    } else {
      this.state.turnsSinceIntensity++;
    }
  }

  private updatePhase(): void {
    const debt = this.state.emotionalDebt;
    const turnsSince = this.state.turnsSinceIntensity;
    const recovering = this.state.showingRecoverySignals;

    // Determine phase based on state
    if (debt < 0.1) {
      this.state.phase = 'recovered';
    } else if (debt >= this.URGENT_DEBT_THRESHOLD) {
      this.state.phase = 'holding';
    } else if (debt >= this.HIGH_DEBT_THRESHOLD) {
      if (turnsSince < this.MINIMUM_GROUNDING_TURNS) {
        this.state.phase = 'transitioning';
      } else {
        this.state.phase = 'grounding';
      }
    } else if (debt >= 0.3) {
      if (recovering) {
        this.state.phase = 'integrating';
      } else {
        this.state.phase = 'transitioning';
      }
    } else if (debt >= 0.1) {
      this.state.phase = 'closing';
    } else {
      this.state.phase = 'none';
    }
  }

  private updatePriority(): void {
    const debt = this.state.emotionalDebt;
    const hasUnaddressed = this.state.recentEvents.some(
      (e) => !e.addressedInAftercare && (e.intensity === 'high' || e.intensity === 'overwhelming')
    );

    if (debt >= this.URGENT_DEBT_THRESHOLD || hasUnaddressed) {
      this.state.priority = 'urgent';
    } else if (debt >= this.HIGH_DEBT_THRESHOLD) {
      this.state.priority = 'high';
    } else if (debt >= 0.4) {
      this.state.priority = 'moderate';
    } else if (debt >= 0.15) {
      this.state.priority = 'low';
    } else {
      this.state.priority = 'none';
    }
  }

  private pickRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../utils/session-registry.js';

const emotionalAftercareRegistry = createSessionRegistry(
  (sessionId: string) => new EmotionalAftercareEngine(),
  { name: 'EmotionalAftercare', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(emotionalAftercareRegistry);

export function getEmotionalAftercareEngine(sessionId: string): EmotionalAftercareEngine {
  return emotionalAftercareRegistry.get(sessionId);
}

export function resetEmotionalAftercareEngine(sessionId: string): void {
  const engine = emotionalAftercareRegistry.get(sessionId);
  engine.reset();
}

export function clearEmotionalAftercareEngine(sessionId: string): void {
  emotionalAftercareRegistry.reset(sessionId);
}

export function getActiveEmotionalAftercareCount(): number {
  return emotionalAftercareRegistry.getActiveCount();
}

export default EmotionalAftercareEngine;
