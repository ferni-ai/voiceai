/**
 * Predictive Anticipation Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is our most SUPERHUMAN capability: knowing what the user needs
 * BEFORE they say it. This creates the magical "they truly understand me" feeling.
 *
 * How it works:
 *
 * 1. **Voice State Prediction**: Detect tiredness, stress, excitement from voice
 *    before they mention it. "You sound tired—rough night?"
 *
 * 2. **Topic Sequence Prediction**: Learn what topics follow what.
 *    "Usually after you mention work, you bring up your relationship..."
 *
 * 3. **Emotional Trajectory Prediction**: Anticipate where they're headed emotionally.
 *    Start adjusting tone BEFORE they get there.
 *
 * 4. **Need Prediction**: Anticipate whether they need:
 *    - Venting (let them talk)
 *    - Advice (offer solutions)
 *    - Validation (affirm their feelings)
 *    - Distraction (change topic)
 *    - Silence (just be present)
 *
 * 5. **Timing Prediction**: Know when they need us most.
 *    Proactive check-ins at historically vulnerable times.
 *
 * The magic: React to what's coming, not what's already happened.
 *
 * @module @ferni/predictive-anticipation
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'PredictiveAnticipation' });

// ============================================================================
// TYPES
// ============================================================================

export type PredictedNeed =
  | 'venting' // Let them talk, don't solve
  | 'advice' // They want solutions
  | 'validation' // Affirm their feelings
  | 'distraction' // Help them think about something else
  | 'silence' // Just be present
  | 'energy' // Lift their spirits
  | 'grounding' // Help them feel stable
  | 'connection' // They need human connection
  | 'unknown'; // Can't determine yet

export type EmotionalTrajectory =
  | 'escalating' // Getting more intense
  | 'stable' // Holding steady
  | 'de_escalating' // Calming down
  | 'cycling' // Going up and down
  | 'building_to_something'; // Leading to a reveal

export interface VoiceStatePrediction {
  /** Predicted state */
  state: 'tired' | 'stressed' | 'excited' | 'calm' | 'upset' | 'distracted' | 'normal';

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence */
  indicators: string[];

  /** Suggested acknowledgment */
  acknowledgment: string | null;
}

export interface TopicSequencePrediction {
  /** Predicted next topic */
  predictedTopic: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence: "X usually follows Y" */
  evidence: string;

  /** Should we preemptively ask about it? */
  shouldPrompt: boolean;

  /** Prompt phrase if applicable */
  promptPhrase?: string;
}

export interface NeedPrediction {
  /** Predicted primary need */
  primaryNeed: PredictedNeed;

  /** Secondary need */
  secondaryNeed?: PredictedNeed;

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence */
  evidence: string[];

  /** Guidance for response */
  responseGuidance: string;
}

export interface EmotionalPrediction {
  /** Current emotional state */
  currentState: {
    valence: number; // -1 to 1
    arousal: number; // 0 to 1
    dominantEmotion: string;
  };

  /** Predicted trajectory */
  trajectory: EmotionalTrajectory;

  /** Where are they heading? */
  predictedDirection: 'more_positive' | 'more_negative' | 'stable' | 'unknown';

  /** Confidence */
  confidence: number;

  /** Proactive adjustment suggestion */
  adjustmentSuggestion?: {
    type: 'energy' | 'pace' | 'tone' | 'topic';
    direction: 'increase' | 'decrease' | 'shift';
    reason: string;
  };
}

export interface PredictionResult {
  /** Voice state prediction */
  voiceState: VoiceStatePrediction;

  /** Topic sequence prediction */
  topicSequence: TopicSequencePrediction | null;

  /** Need prediction */
  need: NeedPrediction;

  /** Emotional prediction */
  emotional: EmotionalPrediction;

  /** Overall anticipation confidence */
  overallConfidence: number;

  /** Combined suggestions */
  suggestions: string[];
}

export interface ProsodyInput {
  pitchMean: number;
  pitchVariance: number;
  speechRate: number;
  energy: number;
  strain: number;
  breathiness: number;
}

export interface UserBaseline {
  avgValence: number;
  avgArousal: number;
  typicalTopicFlow: Map<string, string[]>;
  preferredNeed: PredictedNeed;
  speechRateBaseline: number;
  energyBaseline: number;
}

export interface EmotionalHistoryEntry {
  valence: number;
  arousal: number;
  emotion: string;
  turn: number;
  timestamp: number;
}

// ============================================================================
// TOPIC SEQUENCE PATTERNS
// ============================================================================

interface TopicTransition {
  from: string;
  to: string;
  count: number;
  contexts?: string[];
}

// ============================================================================
// NEED DETECTION PATTERNS
// ============================================================================

/** Patterns indicating need for venting */
const VENTING_PATTERNS = [
  /let me (tell you|just say)/i,
  /i (just )?need to (get this off|talk about|vent)/i,
  /can i just/i,
  /you won('t| will not) believe/i,
  /so (frustrated|annoyed|angry|upset)/i,
  /i can('t|not) believe/i,
  /i('m| am) (so |really )?done/i,
];

/** Patterns indicating need for advice */
const ADVICE_PATTERNS = [
  /what (should|would|do you think) i/i,
  /how (should|would|do) i/i,
  /what would you (do|suggest|recommend)/i,
  /i (don't|do not) know what to do/i,
  /any (advice|suggestions|ideas)/i,
  /help me (figure|decide|think)/i,
  /should i/i,
];

/** Patterns indicating need for validation */
const VALIDATION_PATTERNS = [
  /am i (crazy|wrong|being|overreacting)/i,
  /is it (normal|okay|weird) (to|that)/i,
  /does (this|that) make sense/i,
  /i feel like (maybe )?i('m| am)/i,
  /i('m| am) not (crazy|wrong|overreacting),? (right|am i)/i,
  /tell me i('m| am) not/i,
];

/** Patterns indicating need for distraction */
const DISTRACTION_PATTERNS = [
  /can we talk about something else/i,
  /i (don't|do not) (want to|wanna) think about/i,
  /change (the )?subject/i,
  /anyway/i,
  /let('s| us) (just )?move on/i,
  /i('m| am) tired of (talking|thinking) about/i,
];

/** Patterns indicating need for connection */
const CONNECTION_PATTERNS = [
  /i (just )?needed (to talk|someone)/i,
  /i('m| am) glad (you('re| are) here|i have you)/i,
  /thanks for (listening|being here)/i,
  /i feel (so )?(alone|lonely|isolated)/i,
  /no one (else )?(understands|gets it)/i,
];

// ============================================================================
// PREDICTIVE ANTICIPATION ENGINE
// ============================================================================

export class PredictiveAnticipationEngine {
  // Topic sequence learning
  private topicTransitions: TopicTransition[] = [];
  private currentTopic: string | null = null;
  private topicHistory: string[] = [];

  // Emotional state tracking
  private emotionalHistory: EmotionalHistoryEntry[] = [];

  // Need pattern learning
  private needHistory: Array<{
    need: PredictedNeed;
    wasCorrect?: boolean;
    turn: number;
  }> = [];

  // Voice state tracking
  private voiceStateHistory: Array<{
    state: VoiceStatePrediction['state'];
    turn: number;
  }> = [];

  // Session tracking
  private turnCount = 0;
  private sessionStartTime: Date;
  private userId: string;

  // Baseline metrics (learned)
  private userBaseline: UserBaseline = {
    avgValence: 0,
    avgArousal: 0.5,
    typicalTopicFlow: new Map<string, string[]>(),
    preferredNeed: 'unknown',
    speechRateBaseline: 1.0,
    energyBaseline: 0.5,
  };

  constructor(sessionId: string, userId?: string) {
    this.userId = userId || sessionId;
    this.sessionStartTime = new Date();
    logger.debug({ sessionId, userId: this.userId }, 'PredictiveAnticipationEngine initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Process a turn and get predictions
   * This is the main entry point
   */
  predict(
    userMessage: string,
    context: {
      turnCount: number;
      topic?: string;
      emotion?: string;
      valence?: number;
      arousal?: number;
      prosody?: ProsodyInput;
    }
  ): PredictionResult {
    this.turnCount = context.turnCount;

    // Update state
    if (context.topic) {
      this.recordTopicTransition(context.topic);
    }
    if (context.emotion || context.valence !== undefined) {
      this.recordEmotionalState(
        context.valence ?? 0,
        context.arousal ?? 0.5,
        context.emotion ?? 'neutral'
      );
    }

    // Generate predictions
    const voiceState = this.predictVoiceState(context.prosody);
    const topicSequence = this.predictNextTopic();
    const need = this.predictNeed(userMessage, context);
    const emotional = this.predictEmotionalTrajectory();

    // Combine into result
    const result: PredictionResult = {
      voiceState,
      topicSequence,
      need,
      emotional,
      overallConfidence: this.calculateOverallConfidence(voiceState, need, emotional),
      suggestions: this.generateSuggestions(voiceState, topicSequence, need, emotional),
    };

    // Emit signals for high-confidence predictions
    if (result.overallConfidence > 0.7) {
      void humanizationSignalEmitter.emit({
        signalType: 'anticipation',
        intensity: result.overallConfidence,
      });
    }

    logger.debug(
      {
        voiceState: voiceState.state,
        predictedNeed: need.primaryNeed,
        trajectory: emotional.trajectory,
        confidence: result.overallConfidence.toFixed(2),
      },
      '🔮 Prediction generated'
    );

    return result;
  }

  /**
   * Record whether a prediction was correct (for learning)
   */
  recordPredictionOutcome(
    predictionType: 'need' | 'topic' | 'emotional',
    wasCorrect: boolean
  ): void {
    if (predictionType === 'need' && this.needHistory.length > 0) {
      this.needHistory[this.needHistory.length - 1].wasCorrect = wasCorrect;
    }
    // Adjust confidence based on outcomes
    logger.debug({ predictionType, wasCorrect }, 'Prediction outcome recorded');
  }

  /**
   * Update user baseline from cross-session data
   */
  updateBaseline(baseline: Partial<typeof this.userBaseline>): void {
    Object.assign(this.userBaseline, baseline);
    logger.debug('User baseline updated');
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.topicHistory = [];
    this.emotionalHistory = [];
    this.voiceStateHistory = [];
    this.currentTopic = null;
    this.turnCount = 0;
    this.sessionStartTime = new Date();
    // Note: Keep topicTransitions and baseline - they're learned
    logger.debug('PredictiveAnticipationEngine reset');
  }

  // ==========================================================================
  // VOICE STATE PREDICTION
  // ==========================================================================

  private predictVoiceState(prosody?: ProsodyInput): VoiceStatePrediction {
    if (!prosody) {
      return {
        state: 'normal',
        confidence: 0.3,
        indicators: [],
        acknowledgment: null,
      };
    }

    const indicators: string[] = [];
    let state: VoiceStatePrediction['state'] = 'normal';
    let confidence = 0.5;

    // Low energy + slow speech = tired
    if (prosody.energy < 0.35 && prosody.speechRate < 0.85) {
      state = 'tired';
      confidence = 0.7 + (0.35 - prosody.energy) + (0.85 - prosody.speechRate) / 2;
      indicators.push('low energy', 'slower speech');
    }
    // High strain + fast speech = stressed
    else if (prosody.strain > 0.6 && prosody.speechRate > 1.15) {
      state = 'stressed';
      confidence = 0.6 + prosody.strain * 0.3;
      indicators.push('voice strain', 'rapid speech');
    }
    // High energy + fast speech + high pitch variance = excited
    else if (prosody.energy > 0.7 && prosody.speechRate > 1.1 && prosody.pitchVariance > 0.4) {
      state = 'excited';
      confidence = 0.65;
      indicators.push('high energy', 'varied pitch');
    }
    // High strain + low energy = upset
    else if (prosody.strain > 0.5 && prosody.energy < 0.4) {
      state = 'upset';
      confidence = 0.6;
      indicators.push('strained voice', 'low energy');
    }
    // Low energy + breathiness = calm/tired
    else if (prosody.energy < 0.4 && prosody.breathiness > 0.4) {
      state = 'calm';
      confidence = 0.55;
      indicators.push('relaxed breathing', 'low energy');
    }
    // High pitch variance + irregular speech = distracted
    else if (prosody.pitchVariance > 0.5 && prosody.speechRate < 0.9) {
      state = 'distracted';
      confidence = 0.5;
      indicators.push('irregular speech');
    }

    // Generate acknowledgment for notable states
    let acknowledgment: string | null = null;
    if (confidence > 0.6) {
      const acknowledgments: Record<VoiceStatePrediction['state'], string[]> = {
        tired: [
          'You sound tired—rough night?',
          'You sound like you could use some rest.',
          'Long day?',
        ],
        stressed: [
          'I can hear the tension in your voice.',
          "Sounds like you've got a lot on your plate.",
          "You sound stressed—what's going on?",
        ],
        excited: ['I can hear the excitement in your voice!', 'Something good happening?'],
        upset: ["You sound upset. I'm here.", "I can hear something's bothering you."],
        calm: ['You sound relaxed today.'],
        distracted: ["You seem like you've got something on your mind."],
        normal: [],
      };

      const options = acknowledgments[state];
      if (options.length > 0) {
        acknowledgment = options[Math.floor(Math.random() * options.length)];
      }
    }

    // Track for patterns
    this.voiceStateHistory.push({ state, turn: this.turnCount });
    if (this.voiceStateHistory.length > 20) {
      this.voiceStateHistory.shift();
    }

    return {
      state,
      confidence: Math.min(1, confidence),
      indicators,
      acknowledgment,
    };
  }

  // ==========================================================================
  // TOPIC SEQUENCE PREDICTION
  // ==========================================================================

  private recordTopicTransition(newTopic: string): void {
    if (this.currentTopic && this.currentTopic !== newTopic) {
      // Record transition
      const existing = this.topicTransitions.find(
        (t) => t.from === this.currentTopic && t.to === newTopic
      );

      if (existing) {
        existing.count++;
      } else {
        this.topicTransitions.push({
          from: this.currentTopic,
          to: newTopic,
          count: 1,
          contexts: [],
        });
      }
    }

    this.topicHistory.push(newTopic);
    if (this.topicHistory.length > 30) {
      this.topicHistory.shift();
    }
    this.currentTopic = newTopic;
  }

  private predictNextTopic(): TopicSequencePrediction | null {
    if (!this.currentTopic || this.topicTransitions.length < 3) {
      return null;
    }

    // Find most common next topic from current
    const transitionsFromCurrent = this.topicTransitions
      .filter((t) => t.from === this.currentTopic)
      .sort((a, b) => b.count - a.count);

    if (transitionsFromCurrent.length === 0) {
      return null;
    }

    const mostLikely = transitionsFromCurrent[0];
    const totalFromCurrent = transitionsFromCurrent.reduce((sum, t) => sum + t.count, 0);
    const confidence = mostLikely.count / totalFromCurrent;

    // Only predict if we have enough data and confidence
    if (mostLikely.count < 2 || confidence < 0.4) {
      return null;
    }

    // Should we preemptively ask about it?
    const shouldPrompt = confidence > 0.6 && mostLikely.count >= 3;

    let promptPhrase: string | undefined;
    if (shouldPrompt) {
      const phrases = [
        `Speaking of which... how's ${mostLikely.to} going?`,
        `I had a feeling you might want to talk about ${mostLikely.to}.`,
        `This usually leads to ${mostLikely.to} for you—want to go there?`,
      ];
      promptPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    }

    return {
      predictedTopic: mostLikely.to,
      confidence,
      evidence: `After ${this.currentTopic}, you often talk about ${mostLikely.to} (${mostLikely.count} times)`,
      shouldPrompt,
      promptPhrase,
    };
  }

  // ==========================================================================
  // NEED PREDICTION
  // ==========================================================================

  private predictNeed(
    userMessage: string,
    context: { emotion?: string; valence?: number }
  ): NeedPrediction {
    const evidence: string[] = [];
    let primaryNeed: PredictedNeed = 'unknown';
    let secondaryNeed: PredictedNeed | undefined;
    let confidence = 0.4;

    // Check linguistic patterns
    if (VENTING_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'venting';
      confidence = 0.75;
      evidence.push('Venting language detected');
    } else if (ADVICE_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'advice';
      confidence = 0.8;
      evidence.push('Advice-seeking language');
    } else if (VALIDATION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'validation';
      confidence = 0.85;
      evidence.push('Validation-seeking language');
    } else if (DISTRACTION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'distraction';
      confidence = 0.7;
      evidence.push('Distraction language');
    } else if (CONNECTION_PATTERNS.some((p) => p.test(userMessage))) {
      primaryNeed = 'connection';
      confidence = 0.75;
      evidence.push('Connection-seeking language');
    }

    // Augment with emotional context
    if (context.emotion) {
      const emotionNeeds: Record<string, PredictedNeed> = {
        angry: 'venting',
        frustrated: 'venting',
        sad: 'validation',
        anxious: 'grounding',
        overwhelmed: 'grounding',
        lonely: 'connection',
        exhausted: 'silence',
        excited: 'energy',
      };

      const emotionNeed = emotionNeeds[context.emotion.toLowerCase()];
      if (emotionNeed) {
        if (primaryNeed === 'unknown') {
          primaryNeed = emotionNeed;
          confidence = 0.6;
          evidence.push(`Emotional state: ${context.emotion}`);
        } else if (emotionNeed !== primaryNeed) {
          secondaryNeed = emotionNeed;
          evidence.push(`Secondary need from emotion: ${context.emotion}`);
        }
      }
    }

    // Check message length for clues
    const wordCount = userMessage.split(/\s+/).length;
    if (wordCount > 80 && primaryNeed === 'unknown') {
      primaryNeed = 'venting';
      confidence = 0.5;
      evidence.push('Long message (likely venting)');
    } else if (wordCount < 10 && primaryNeed === 'unknown') {
      // Short message could mean many things
      if (context.valence !== undefined && context.valence < -0.3) {
        primaryNeed = 'silence';
        confidence = 0.5;
        evidence.push('Brief + negative (may need space)');
      }
    }

    // Generate guidance
    const guidance = this.generateNeedGuidance(primaryNeed, secondaryNeed);

    // Track for learning
    this.needHistory.push({
      need: primaryNeed,
      turn: this.turnCount,
    });
    if (this.needHistory.length > 20) {
      this.needHistory.shift();
    }

    return {
      primaryNeed,
      secondaryNeed,
      confidence: Math.min(1, confidence),
      evidence,
      responseGuidance: guidance,
    };
  }

  private generateNeedGuidance(primary: PredictedNeed, secondary?: PredictedNeed): string {
    const guidance: Record<PredictedNeed, string> = {
      venting:
        "They need to be heard, not fixed. Listen actively. Use short acknowledgments. Don't offer solutions unless asked.",
      advice:
        'They want practical input. After validating, offer concrete suggestions. Ask clarifying questions if needed.',
      validation:
        'They need to know their feelings are okay. Normalize their experience. "Of course you feel that way."',
      distraction:
        "They want to think about something else. Offer to change topics. Don't force them to stay on hard subjects.",
      silence: 'Less is more. Be present without filling space. Short, warm acknowledgments only.',
      energy:
        "Match their energy! Be enthusiastic. Celebrate with them. Don't dampen their excitement.",
      grounding:
        "Help them feel stable. Slow your pace. Ask concrete questions. Focus on what's certain.",
      connection: "Your presence matters more than your words. Let them know you're here. Be warm.",
      unknown: 'Stay curious and open. Ask what would be most helpful.',
    };

    let result = guidance[primary];
    if (secondary && secondary !== primary) {
      result += ` Also consider: ${guidance[secondary].split('.')[0].toLowerCase()}.`;
    }
    return result;
  }

  // ==========================================================================
  // EMOTIONAL TRAJECTORY PREDICTION
  // ==========================================================================

  private recordEmotionalState(valence: number, arousal: number, emotion: string): void {
    this.emotionalHistory.push({
      valence,
      arousal,
      emotion,
      turn: this.turnCount,
      timestamp: Date.now(),
    });

    if (this.emotionalHistory.length > 15) {
      this.emotionalHistory.shift();
    }
  }

  private predictEmotionalTrajectory(): EmotionalPrediction {
    if (this.emotionalHistory.length < 2) {
      return {
        currentState: {
          valence: 0,
          arousal: 0.5,
          dominantEmotion: 'neutral',
        },
        trajectory: 'stable',
        predictedDirection: 'unknown',
        confidence: 0.3,
      };
    }

    // Get recent history
    const recent = this.emotionalHistory.slice(-5);
    const current = recent[recent.length - 1];

    // Calculate trends
    const valences = recent.map((e) => e.valence);
    const arousals = recent.map((e) => e.arousal);

    const valenceSlope = this.calculateSlope(valences);
    const arousalSlope = this.calculateSlope(arousals);

    // Determine trajectory
    let trajectory: EmotionalTrajectory;
    let predictedDirection: EmotionalPrediction['predictedDirection'];
    let confidence = 0.5;

    const absValenceSlope = Math.abs(valenceSlope);
    const absArousalSlope = Math.abs(arousalSlope);

    if (absValenceSlope < 0.05 && absArousalSlope < 0.05) {
      trajectory = 'stable';
      predictedDirection = 'stable';
      confidence = 0.7;
    } else if (arousalSlope > 0.1 && absValenceSlope < 0.1) {
      trajectory = 'escalating';
      predictedDirection = valenceSlope >= 0 ? 'more_positive' : 'more_negative';
      confidence = 0.6 + arousalSlope;
    } else if (arousalSlope < -0.1) {
      trajectory = 'de_escalating';
      predictedDirection = 'more_positive'; // Usually calming is positive
      confidence = 0.6;
    } else if (this.detectCycling(valences, arousals)) {
      trajectory = 'cycling';
      predictedDirection = 'unknown';
      confidence = 0.5;
    } else if (arousalSlope > 0.05 && current.valence < -0.2) {
      trajectory = 'building_to_something';
      predictedDirection = 'more_negative';
      confidence = 0.55;
    } else {
      trajectory = 'stable';
      predictedDirection =
        valenceSlope > 0 ? 'more_positive' : valenceSlope < 0 ? 'more_negative' : 'stable';
      confidence = 0.5;
    }

    // Generate adjustment suggestion
    let adjustmentSuggestion: EmotionalPrediction['adjustmentSuggestion'];

    if (trajectory === 'escalating' && predictedDirection === 'more_negative') {
      adjustmentSuggestion = {
        type: 'pace',
        direction: 'decrease',
        reason: 'Slow down to help them regulate',
      };
    } else if (trajectory === 'de_escalating' && current.arousal > 0.6) {
      adjustmentSuggestion = {
        type: 'energy',
        direction: 'decrease',
        reason: 'Match their calming energy',
      };
    } else if (trajectory === 'building_to_something') {
      adjustmentSuggestion = {
        type: 'tone',
        direction: 'shift',
        reason: 'Prepare for emotional disclosure',
      };
    }

    return {
      currentState: {
        valence: current.valence,
        arousal: current.arousal,
        dominantEmotion: current.emotion,
      },
      trajectory,
      predictedDirection,
      confidence: Math.min(1, confidence),
      adjustmentSuggestion,
    };
  }

  private calculateSlope(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private detectCycling(valences: number[], arousals: number[]): boolean {
    if (valences.length < 4) return false;

    // Check for direction changes
    let directionChanges = 0;
    for (let i = 2; i < valences.length; i++) {
      const prev = valences[i - 1] - valences[i - 2];
      const curr = valences[i] - valences[i - 1];
      if (prev * curr < 0) directionChanges++;
    }

    return directionChanges >= 2;
  }

  // ==========================================================================
  // SUGGESTION GENERATION
  // ==========================================================================

  private generateSuggestions(
    voiceState: VoiceStatePrediction,
    topicSequence: TopicSequencePrediction | null,
    need: NeedPrediction,
    emotional: EmotionalPrediction
  ): string[] {
    const suggestions: string[] = [];

    // Voice state suggestion
    if (voiceState.acknowledgment && voiceState.confidence > 0.65) {
      suggestions.push(`Acknowledge: "${voiceState.acknowledgment}"`);
    }

    // Topic sequence suggestion
    if (topicSequence?.shouldPrompt && topicSequence.promptPhrase) {
      suggestions.push(`Anticipate topic: "${topicSequence.promptPhrase}"`);
    }

    // Need-based suggestion
    if (need.confidence > 0.6) {
      suggestions.push(`Need: ${need.responseGuidance.split('.')[0]}`);
    }

    // Emotional trajectory suggestion
    if (emotional.adjustmentSuggestion) {
      suggestions.push(
        `Adjust: ${emotional.adjustmentSuggestion.direction} ${emotional.adjustmentSuggestion.type} - ${emotional.adjustmentSuggestion.reason}`
      );
    }

    return suggestions;
  }

  private calculateOverallConfidence(
    voiceState: VoiceStatePrediction,
    need: NeedPrediction,
    emotional: EmotionalPrediction
  ): number {
    // Weight by importance and reliability
    const weights = {
      voice: 0.2,
      need: 0.5,
      emotional: 0.3,
    };

    return (
      voiceState.confidence * weights.voice +
      need.confidence * weights.need +
      emotional.confidence * weights.emotional
    );
  }

  // ==========================================================================
  // DATA EXPORT/IMPORT
  // ==========================================================================

  /**
   * Export learned patterns for persistence
   */
  exportLearning(): {
    topicTransitions: TopicTransition[];
    baseline: UserBaseline;
  } {
    return {
      topicTransitions: this.topicTransitions.filter((t) => t.count >= 2),
      baseline: { ...this.userBaseline },
    };
  }

  /**
   * Import learned patterns from persistence
   */
  importLearning(data: {
    topicTransitions?: TopicTransition[];
    baseline?: Partial<UserBaseline>;
  }): void {
    if (data.topicTransitions) {
      this.topicTransitions = data.topicTransitions;
    }
    if (data.baseline) {
      Object.assign(this.userBaseline, data.baseline);
    }
    logger.debug('Learning imported');
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    turnCount: number;
    currentTopic: string | null;
    topicHistory: string[];
    emotionalHistory: EmotionalHistoryEntry[];
    topicTransitions: TopicTransition[];
  } {
    return {
      turnCount: this.turnCount,
      currentTopic: this.currentTopic,
      topicHistory: [...this.topicHistory],
      emotionalHistory: [...this.emotionalHistory],
      topicTransitions: [...this.topicTransitions],
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

// Note: This uses userId as key for cross-session learning when available
const predictiveAnticipationRegistry = createSessionRegistry(
  (key: string) => {
    // Key format: "sessionId" or "sessionId:userId"
    const [sessionId, userId] = key.includes(':') ? key.split(':') : [key, undefined];
    return new PredictiveAnticipationEngine(sessionId, userId);
  },
  { name: 'PredictiveAnticipation', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(predictiveAnticipationRegistry);

export function getPredictiveAnticipationEngine(
  sessionId: string,
  userId?: string
): PredictiveAnticipationEngine {
  // Use userId for cross-session learning, fall back to sessionId
  const key = userId || sessionId;
  return predictiveAnticipationRegistry.get(key);
}

export function resetPredictiveAnticipationEngine(sessionId: string, userId?: string): void {
  const key = userId || sessionId;
  const engine = predictiveAnticipationRegistry.get(key);
  engine.reset();
}

export function clearPredictiveAnticipationEngine(sessionId: string, userId?: string): void {
  const key = userId || sessionId;
  predictiveAnticipationRegistry.reset(key);
}

export function getActivePredictiveAnticipationCount(): number {
  return predictiveAnticipationRegistry.getActiveCount();
}

export default PredictiveAnticipationEngine;
