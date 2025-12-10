/**
 * Human Listening Pipeline
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Unified pipeline that integrates all human-like listening capabilities:
 *
 * AUDIO-BASED:
 * - Breath pattern detection (sighs, held breath, deep breaths)
 * - Voice tremor/strain detection (wavering, cracking)
 * - Volume dynamics (getting quieter on vulnerable topics)
 * - Energy fade detection (voice trailing off)
 *
 * TEXT-BASED:
 * - Cognitive load indicators (fillers, pauses, restarts)
 * - Fluency analysis (stammering, self-corrections)
 * - Hedging detection (uncertainty, minimizing, protecting)
 * - Filler/subvocal patterns (um, uh, like analysis)
 * - Self-soothing detection (reassurance, dismissal)
 *
 * CONVERSATION-BASED:
 * - Narrative arc tracking (building, meandering, climax)
 * - Engagement scoring (present vs. distracted)
 *
 * This pipeline produces a comprehensive "how they're really doing"
 * assessment that goes beyond just what they say.
 *
 * @module HumanListeningPipeline
 */

import { getLogger } from '../utils/safe-logger.js';

// Audio-based analyzers
import { getBreathDetector, type BreathPatternResult } from './breath-detection.js';
import { getEnergyDynamicsTracker, type EnergyDynamicsResult } from './energy-dynamics.js';
import { getFillerAnalyzer, type FillerAnalysisResult } from './filler-analysis.js';
import { getFluencyAnalyzer, type FluencyAnalysisResult } from './fluency-analysis.js';
import { getVoiceTremorDetector, type VoiceTremorResult } from './voice-tremor.js';
import { getVolumeDynamicsTracker, type VolumeDynamicsState } from './volume-dynamics.js';

// Text-based analyzers
import {
  getCognitiveLoadDetector,
  type CognitiveLoadState,
} from '../intelligence/cognitive-load.js';
import {
  getHedgingDetector,
  type HedgingAnalysisResult,
} from '../intelligence/hedging-detection.js';
import {
  getSelfSoothingDetector,
  type SelfSoothingResult,
} from '../intelligence/self-soothing-detection.js';

// Conversation-based analyzers
import {
  getEngagementScorer,
  type EngagementScoringResult,
} from '../conversation/engagement-scoring.js';
import { getNarrativeArcTracker, type NarrativeArcResult } from '../conversation/narrative-arc.js';

const log = getLogger().child({ module: 'HumanListeningPipeline' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pre-computed prosody features from audio-prosody.ts
 * If provided, we derive audio insights from these instead of raw samples
 */
export interface ProsodyFeaturesInput {
  pitchVariance?: number;
  jitter?: number; // Tremor indicator
  shimmer?: number; // Voice strain indicator
  breathiness?: number;
  energyMean?: number;
  energyVariance?: number;
  speechRate?: number;
  pauseDuration?: number;
  pauseFrequency?: number;
  utteranceDuration?: number;
  voiceQuality?: 'clear' | 'breathy' | 'strained' | 'trembling';
}

export interface HumanListeningContext {
  /** Session ID */
  sessionId: string;

  /** User's text */
  text: string;

  /** Audio samples (if available) */
  audioSamples?: Float32Array;

  /** Audio sample rate */
  sampleRate?: number;

  /** Pre-computed prosody features from existing audio analysis */
  prosodyFeatures?: ProsodyFeaturesInput;

  /** Turn number in conversation */
  turnNumber: number;

  /** Current topic */
  currentTopic?: string;

  /** Detected emotion from other systems */
  emotion?: string;

  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;

  /** Duration of utterance (ms) */
  durationMs?: number;

  /** Pause info if available */
  pauseInfo?: { count: number; totalDurationMs: number };

  /** Time since last agent message (for engagement) */
  timeSinceAgentMessage?: number;
}

export interface AudioAnalysis {
  breath: BreathPatternResult | null;
  tremor: VoiceTremorResult | null;
  volumeDynamics: VolumeDynamicsState | null;
  energyDynamics: EnergyDynamicsResult | null;
}

export interface TextAnalysis {
  cognitiveLoad: CognitiveLoadState;
  fluency: FluencyAnalysisResult;
  hedging: HedgingAnalysisResult;
  fillers: FillerAnalysisResult;
  selfSoothing: SelfSoothingResult;
}

export interface ConversationAnalysis {
  narrativeArc: NarrativeArcResult;
  engagement: EngagementScoringResult;
}

export interface EmotionalUndercurrent {
  /** Primary underlying emotion detected */
  primary: string;

  /** Confidence in detection */
  confidence: number;

  /** Evidence sources */
  evidence: string[];

  /** Is this possibly masked by their words? */
  possiblyMasked: boolean;
}

export interface HumanListeningResult {
  /** Audio-based analysis (if audio provided) */
  audio: AudioAnalysis;

  /** Text-based analysis */
  text: TextAnalysis;

  /** Conversation-based analysis */
  conversation: ConversationAnalysis;

  /** Synthesized emotional undercurrent */
  emotionalUndercurrent: EmotionalUndercurrent;

  /** Overall assessment of how they're doing */
  overallAssessment: string;

  /** Priority signals the agent should attend to */
  prioritySignals: string[];

  /** Unified guidance for agent response */
  agentGuidance: string;

  /** Should agent slow down? */
  shouldSlowDown: boolean;

  /** Should agent give more space? */
  shouldGiveSpace: boolean;

  /** Is user possibly in distress? */
  possibleDistress: boolean;

  /** Suggested SSML adjustments */
  ssmlSuggestions: {
    speedMultiplier: number;
    pauseMultiplier: number;
    volumeLevel: 'softer' | 'normal' | 'match';
  };

  /** Overall confidence (0-1) */
  confidence: number;
}

// ============================================================================
// HUMAN LISTENING PIPELINE
// ============================================================================

export class HumanListeningPipeline {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    log.debug({ sessionId }, '🎧 Human Listening Pipeline initialized');
  }

  /**
   * Process a complete turn through all analyzers
   */
  async analyze(context: HumanListeningContext): Promise<HumanListeningResult> {
    const startTime = Date.now();

    // Run all analyses
    const [audio, text, conversation] = await Promise.all([
      this.analyzeAudio(context),
      this.analyzeText(context),
      this.analyzeConversation(context),
    ]);

    // Synthesize emotional undercurrent
    const emotionalUndercurrent = this.synthesizeEmotionalUndercurrent(audio, text, conversation);

    // Generate overall assessment
    const overallAssessment = this.generateOverallAssessment(
      audio,
      text,
      conversation,
      emotionalUndercurrent
    );

    // Identify priority signals
    const prioritySignals = this.identifyPrioritySignals(audio, text, conversation);

    // Generate unified guidance
    const agentGuidance = this.generateAgentGuidance(audio, text, conversation, prioritySignals);

    // Determine response adjustments
    const shouldSlowDown = this.determineShouldSlowDown(audio, text, conversation);
    const shouldGiveSpace = this.determineShouldGiveSpace(audio, text, conversation);
    const possibleDistress = this.determinePossibleDistress(audio, text, conversation);

    // Calculate SSML suggestions
    const ssmlSuggestions = this.calculateSsmlSuggestions(audio, text, shouldSlowDown);

    // Overall confidence
    const confidence = this.calculateOverallConfidence(audio, text, conversation);

    const result: HumanListeningResult = {
      audio,
      text,
      conversation,
      emotionalUndercurrent,
      overallAssessment,
      prioritySignals,
      agentGuidance,
      shouldSlowDown,
      shouldGiveSpace,
      possibleDistress,
      ssmlSuggestions,
      confidence,
    };

    const elapsed = Date.now() - startTime;
    log.debug(
      {
        elapsed,
        prioritySignals: prioritySignals.length,
        shouldSlowDown,
        possibleDistress,
      },
      '🎧 Human listening analysis complete'
    );

    return result;
  }

  /**
   * Quick analysis for real-time use (text only, faster)
   */
  quickAnalyze(
    text: string,
    turnNumber: number
  ): {
    cognitiveLoad: CognitiveLoadState;
    hedging: HedgingAnalysisResult;
    selfSoothing: SelfSoothingResult;
    shouldSlowDown: boolean;
  } {
    const cognitiveLoad = getCognitiveLoadDetector(this.sessionId).analyzeUtterance(text, 0);
    const hedging = getHedgingDetector(this.sessionId).analyze(text);
    const selfSoothing = getSelfSoothingDetector(this.sessionId).analyze(text);

    const shouldSlowDown =
      cognitiveLoad.level === 'high' ||
      cognitiveLoad.level === 'overloaded' ||
      hedging.elevated ||
      selfSoothing.possibleDistress;

    return { cognitiveLoad, hedging, selfSoothing, shouldSlowDown };
  }

  /**
   * Build LLM context from most recent analysis
   */
  buildLLMContext(): string | null {
    const lines: string[] = [];

    // Get latest from each analyzer
    const cognitive = getCognitiveLoadDetector(this.sessionId).getCurrentState();
    const hedging = getHedgingDetector(this.sessionId).buildContextForPrompt();
    const selfSoothing = getSelfSoothingDetector(this.sessionId).buildContextForPrompt();
    const engagement = getEngagementScorer(this.sessionId).getCurrentEngagement();

    // Cognitive load
    if (cognitive.level !== 'low') {
      lines.push(`[COGNITIVE LOAD: ${cognitive.level.toUpperCase()}] ${cognitive.guidance}`);
    }

    // Hedging
    if (hedging) {
      lines.push(hedging);
    }

    // Self-soothing
    if (selfSoothing) {
      lines.push(selfSoothing);
    }

    // Engagement
    if (engagement.level === 'low' || engagement.level === 'distracted') {
      lines.push(`[ENGAGEMENT: ${engagement.level.toUpperCase()}] ${engagement.actionGuidance}`);
    }

    return lines.length > 0 ? lines.join('\n\n') : null;
  }

  /**
   * Reset all analyzers
   */
  reset(): void {
    // Reset all session-specific analyzers
    // Audio
    getBreathDetector(this.sessionId).reset();
    getVoiceTremorDetector(this.sessionId).reset();
    getVolumeDynamicsTracker(this.sessionId).reset();
    getEnergyDynamicsTracker(this.sessionId).reset();
    getFluencyAnalyzer(this.sessionId).reset();
    getFillerAnalyzer(this.sessionId).reset();

    // Text
    getCognitiveLoadDetector(this.sessionId).reset();
    getHedgingDetector(this.sessionId).reset();
    getSelfSoothingDetector(this.sessionId).reset();

    // Conversation
    getNarrativeArcTracker(this.sessionId).reset();
    getEngagementScorer(this.sessionId).reset();

    log.debug({ sessionId: this.sessionId }, '🎧 Human Listening Pipeline reset');
  }

  // ==========================================================================
  // PRIVATE ANALYSIS METHODS
  // ==========================================================================

  private async analyzeAudio(context: HumanListeningContext): Promise<AudioAnalysis> {
    // If we have raw audio samples, use the full analyzers
    if (context.audioSamples && context.sampleRate) {
      const breath = getBreathDetector(this.sessionId).analyzeAudio(
        context.audioSamples,
        context.sampleRate
      );

      const tremor = getVoiceTremorDetector(this.sessionId).analyzeAudio(
        context.audioSamples,
        context.sampleRate
      );

      const volumeDynamics = getVolumeDynamicsTracker(this.sessionId).recordFromAudioSamples(
        context.audioSamples,
        context.sampleRate,
        context.text.slice(0, 50)
      );

      const energyDynamics = getEnergyDynamicsTracker(this.sessionId).analyzeFromAudio(
        context.audioSamples,
        context.sampleRate,
        context.text
      );

      return { breath, tremor, volumeDynamics, energyDynamics };
    }

    // If we have pre-computed prosody features, derive insights from them
    if (context.prosodyFeatures) {
      return this.deriveAudioFromProsody(context.prosodyFeatures, context.text);
    }

    // No audio data available
    return {
      breath: null,
      tremor: null,
      volumeDynamics: null,
      energyDynamics: null,
    };
  }

  /**
   * Derive audio analysis from pre-computed prosody features.
   * This allows us to get human listening insights without raw audio.
   */
  private deriveAudioFromProsody(prosody: ProsodyFeaturesInput, _text: string): AudioAnalysis {
    // Derive tremor from jitter and voice quality
    let tremor: VoiceTremorResult | null = null;
    if (prosody.jitter !== undefined || prosody.voiceQuality) {
      const jitterHigh = (prosody.jitter ?? 0) > 0.02; // Typical threshold
      const shimmerHigh = (prosody.shimmer ?? 0) > 0.1;
      const isTrembling = prosody.voiceQuality === 'trembling';
      const isStrained = prosody.voiceQuality === 'strained';

      if (jitterHigh || isTrembling || isStrained) {
        tremor = {
          detected: true,
          primaryType: isTrembling ? 'quiver' : isStrained ? 'strain' : 'tremor',
          intensity: jitterHigh ? 'noticeable' : 'subtle',
          events: [],
          emotionalIndicator: isTrembling ? 'strong emotion' : 'tension or stress',
          possibleTears: isTrembling && shimmerHigh,
          possibleAnxiety: jitterHigh || isStrained,
          suggestedResponse: isTrembling
            ? 'Voice suggests strong emotion - be gentle and give space'
            : 'Voice sounds strained - acknowledge they may be processing something difficult',
          confidence: jitterHigh ? 0.7 : 0.5,
        };
      }
    }

    // Derive breath patterns from breathiness and pause patterns
    let breath: BreathPatternResult | null = null;
    if (prosody.breathiness !== undefined || prosody.pauseDuration !== undefined) {
      const highBreathiness = (prosody.breathiness ?? 0) > 0.5;
      const longPauses = (prosody.pauseDuration ?? 0) > 500;

      if (highBreathiness || longPauses) {
        breath = {
          events: [],
          dominantPattern: highBreathiness ? 'sigh' : 'deep',
          breathingQuality: highBreathiness ? 'labored' : 'controlled',
          emotionalState: highBreathiness ? 'fatigue or overwhelm' : 'processing',
          needsSpace: highBreathiness || longPauses,
          guidance: highBreathiness
            ? 'Breathy voice - may be tired or overwhelmed'
            : 'Taking pauses - processing something',
          confidence: 0.6,
        };
      }
    }

    // Derive volume dynamics from energy features
    let volumeDynamics: VolumeDynamicsState | null = null;
    if (prosody.energyMean !== undefined || prosody.energyVariance !== undefined) {
      const lowEnergy = (prosody.energyMean ?? 50) < 40;

      volumeDynamics = {
        baseline: 50, // Assume normal baseline
        currentRelativeVolume: (prosody.energyMean ?? 50) / 50,
        currentLevel: lowEnergy ? 'soft' : 'normal',
        withinUtteranceTrend: lowEnergy ? 'getting_quieter' : 'stable',
        acrossUtterancesTrend: 'stable' as const,
        onSensitiveTopic: lowEnergy,
        intensityIncreasing: false,
        interpretation: lowEnergy
          ? 'Voice is quieter - may be on sensitive topic'
          : 'Normal volume',
        suggestedAgentVolume: lowEnergy ? 'softer' : 'match',
        confidence: 0.6, // Lower confidence since derived from prosody
      };
    }

    // Derive energy dynamics from speech rate and energy
    let energyDynamics: EnergyDynamicsResult | null = null;
    if (prosody.speechRate !== undefined || prosody.energyMean !== undefined) {
      const slowSpeech = (prosody.speechRate ?? 3) < 2;
      const lowEnergy = (prosody.energyMean ?? 50) < 40;

      if (slowSpeech || lowEnergy) {
        const interpretationText = slowSpeech
          ? 'Speech is slowing - they may be uncertain or processing'
          : "Lower energy - don't rush them";
        energyDynamics = {
          withinUtterance: lowEnergy ? 'fading' : 'steady',
          acrossSession: 'stable',
          segments: [],
          startEnergy: prosody.energyMean ?? 50,
          endEnergy: lowEnergy ? (prosody.energyMean ?? 50) * 0.7 : (prosody.energyMean ?? 50),
          fadeDetected: slowSpeech && lowEnergy,
          fadeIndicates: slowSpeech ? 'uncertainty' : 'fatigue',
          interpretation: interpretationText,
          guidance: interpretationText,
          confidence: 0.6,
        };
      }
    }

    log.debug(
      {
        hasJitter: prosody.jitter !== undefined,
        hasBreathiness: prosody.breathiness !== undefined,
        hasEnergy: prosody.energyMean !== undefined,
        derivedTremor: !!tremor,
        derivedBreath: !!breath,
      },
      '🎧 Derived audio analysis from prosody features'
    );

    return { breath, tremor, volumeDynamics, energyDynamics };
  }

  private async analyzeText(context: HumanListeningContext): Promise<TextAnalysis> {
    const cognitiveLoad = getCognitiveLoadDetector(this.sessionId).analyzeUtterance(
      context.text,
      context.durationMs ?? 0,
      context.pauseInfo
    );

    const fluency = getFluencyAnalyzer(this.sessionId).analyze(context.text);

    const hedging = getHedgingDetector(this.sessionId).analyze(context.text);

    const fillers = getFillerAnalyzer(this.sessionId).analyze(context.text);

    const selfSoothing = getSelfSoothingDetector(this.sessionId).analyze(context.text);

    return { cognitiveLoad, fluency, hedging, fillers, selfSoothing };
  }

  private async analyzeConversation(context: HumanListeningContext): Promise<ConversationAnalysis> {
    const narrativeArc = getNarrativeArcTracker(this.sessionId).analyzeUtterance({
      text: context.text,
      turn: context.turnNumber,
      emotion: context.emotion,
      emotionalIntensity: context.emotionalIntensity,
    });

    const engagement = getEngagementScorer(this.sessionId).recordResponse(context.text, {
      lastAgentMessageTime: context.timeSinceAgentMessage
        ? Date.now() - context.timeSinceAgentMessage
        : undefined,
      currentTopic: context.currentTopic,
    });

    return { narrativeArc, engagement };
  }

  // ==========================================================================
  // SYNTHESIS METHODS
  // ==========================================================================

  private synthesizeEmotionalUndercurrent(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): EmotionalUndercurrent {
    const evidence: string[] = [];
    let primaryEmotion = 'neutral';
    let confidence = 0.5;
    let possiblyMasked = false;

    // Audio signals
    if (audio.tremor?.detected) {
      if (audio.tremor.possibleTears) {
        primaryEmotion = 'sadness';
        evidence.push('voice tremor suggesting held-back tears');
        confidence += 0.2;
      } else if (audio.tremor.possibleAnxiety) {
        primaryEmotion = 'anxiety';
        evidence.push('voice tremor suggesting nervousness');
        confidence += 0.15;
      }
    }

    if (audio.volumeDynamics?.onSensitiveTopic) {
      evidence.push('voice getting quieter on sensitive content');
      possiblyMasked = true;
      confidence += 0.1;
    }

    if (audio.breath?.needsSpace) {
      evidence.push(`${audio.breath.dominantPattern} breathing detected`);
      confidence += 0.1;
    }

    // Text signals
    if (text.selfSoothing.possibleDistress) {
      evidence.push('self-soothing language detected');
      possiblyMasked = true;
      confidence += 0.15;
    }

    if (text.hedging.elevated) {
      evidence.push(`elevated hedging (${text.hedging.dominantCategory})`);
      confidence += 0.1;
    }

    if (text.cognitiveLoad.level === 'high' || text.cognitiveLoad.level === 'overloaded') {
      evidence.push('high cognitive load');
      confidence += 0.1;
    }

    if (text.fluency.pattern === 'emotional_block') {
      evidence.push('speech fluency disrupted by emotion');
      confidence += 0.15;
    }

    // Conversation signals
    if (conversation.narrativeArc.structure === 'circular') {
      evidence.push('circling around a concern');
      confidence += 0.1;
    }

    // Determine primary if still neutral
    if (primaryEmotion === 'neutral' && evidence.length > 0) {
      if (text.selfSoothing.detected) {
        primaryEmotion = text.selfSoothing.underlyingEmotionalState;
      } else if (text.hedging.dominantCategory === 'protecting') {
        primaryEmotion = 'vulnerability';
      } else if (text.cognitiveLoad.level !== 'low') {
        primaryEmotion = 'overwhelm';
      }
    }

    return {
      primary: primaryEmotion,
      confidence: Math.min(1, confidence),
      evidence,
      possiblyMasked,
    };
  }

  private generateOverallAssessment(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis,
    undercurrent: EmotionalUndercurrent
  ): string {
    const assessments: string[] = [];

    // Check for distress signals
    if (
      audio.tremor?.possibleTears ||
      text.selfSoothing.possibleDistress ||
      text.fluency.pattern === 'emotional_block'
    ) {
      assessments.push('User may be struggling with difficult emotions.');
    }

    // Check cognitive state
    if (text.cognitiveLoad.level === 'overloaded') {
      assessments.push('User is mentally overloaded - needs simpler communication.');
    } else if (text.cognitiveLoad.level === 'high') {
      assessments.push('User is processing heavily.');
    }

    // Check engagement
    if (conversation.engagement.level === 'distracted') {
      assessments.push('User seems distracted or disconnected.');
    } else if (conversation.engagement.declining) {
      assessments.push('Engagement is declining.');
    }

    // Check narrative
    if (conversation.narrativeArc.hasReachedCore) {
      assessments.push('User has reached the core of what they wanted to share.');
    } else if (conversation.narrativeArc.climaxApproaching) {
      assessments.push('User is building toward something important.');
    }

    // Check masking
    if (undercurrent.possiblyMasked) {
      assessments.push(`Words may be masking ${undercurrent.primary}.`);
    }

    if (assessments.length === 0) {
      return 'User appears to be communicating openly and naturally.';
    }

    return assessments.join(' ');
  }

  private identifyPrioritySignals(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): string[] {
    const signals: string[] = [];

    // High priority: emotional distress
    if (audio.tremor?.possibleTears) {
      signals.push('Possible tears - be gentle');
    }
    if (text.selfSoothing.possibleDistress) {
      signals.push('Self-soothing distress signals');
    }

    // Medium priority: needs adjustment
    if (text.cognitiveLoad.level === 'overloaded') {
      signals.push('Cognitive overload - simplify');
    }
    if (conversation.narrativeArc.hasReachedCore) {
      signals.push('User reached their point - validate');
    }
    if (audio.volumeDynamics?.onSensitiveTopic) {
      signals.push('Voice quieter - sensitive content');
    }

    // Lower priority: notice and adjust
    if (text.hedging.shouldProbe) {
      signals.push('Hedging detected - consider gentle probe');
    }
    if (conversation.engagement.declining) {
      signals.push('Engagement dropping');
    }

    return signals;
  }

  private generateAgentGuidance(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis,
    prioritySignals: string[]
  ): string {
    if (prioritySignals.length === 0) {
      return 'Continue conversing naturally.';
    }

    const guidances: string[] = [];

    // Add specific guidance from each system
    if (audio.tremor?.detected) {
      guidances.push(audio.tremor.suggestedResponse);
    }
    if (audio.breath?.needsSpace) {
      guidances.push(audio.breath.guidance);
    }
    if (text.cognitiveLoad.shouldSimplify) {
      guidances.push(text.cognitiveLoad.guidance);
    }
    if (text.selfSoothing.detected) {
      guidances.push(text.selfSoothing.suggestedApproach);
    }
    if (conversation.narrativeArc.hasReachedCore) {
      guidances.push(conversation.narrativeArc.interventionGuidance);
    }

    if (guidances.length === 0) {
      return 'Be attentive to the signals detected and respond with care.';
    }

    return guidances.slice(0, 2).join(' ');
  }

  private determineShouldSlowDown(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): boolean {
    return (
      text.cognitiveLoad.level === 'high' ||
      text.cognitiveLoad.level === 'overloaded' ||
      audio.tremor?.detected === true ||
      audio.breath?.needsSpace === true ||
      text.fluency.pattern === 'emotional_block' ||
      conversation.narrativeArc.climaxApproaching
    );
  }

  private determineShouldGiveSpace(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): boolean {
    return (
      audio.breath?.needsSpace === true ||
      audio.volumeDynamics?.onSensitiveTopic === true ||
      text.selfSoothing.possibleDistress ||
      conversation.narrativeArc.hasReachedCore
    );
  }

  private determinePossibleDistress(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): boolean {
    return (
      audio.tremor?.possibleTears === true ||
      text.selfSoothing.possibleDistress ||
      text.fluency.pattern === 'emotional_block' ||
      (text.hedging.dominantCategory === 'protecting' && text.hedging.elevated)
    );
  }

  private calculateSsmlSuggestions(
    audio: AudioAnalysis,
    text: TextAnalysis,
    shouldSlowDown: boolean
  ): HumanListeningResult['ssmlSuggestions'] {
    let speedMultiplier = 1.0;
    let pauseMultiplier = 1.0;
    let volumeLevel: 'softer' | 'normal' | 'match' = 'normal';

    // Speed adjustments
    if (text.cognitiveLoad.ssmlAdjustments) {
      speedMultiplier *= text.cognitiveLoad.ssmlAdjustments.speedMultiplier;
      pauseMultiplier *= text.cognitiveLoad.ssmlAdjustments.pauseMultiplier;
    }

    if (shouldSlowDown) {
      speedMultiplier *= 0.95;
      pauseMultiplier *= 1.1;
    }

    // Volume adjustments
    if (audio.volumeDynamics?.suggestedAgentVolume) {
      volumeLevel = audio.volumeDynamics.suggestedAgentVolume;
    }

    if (audio.tremor?.possibleTears || text.selfSoothing.possibleDistress) {
      volumeLevel = 'softer';
    }

    return {
      speedMultiplier: Math.max(0.8, Math.min(1.1, speedMultiplier)),
      pauseMultiplier: Math.max(1.0, Math.min(1.5, pauseMultiplier)),
      volumeLevel,
    };
  }

  private calculateOverallConfidence(
    audio: AudioAnalysis,
    text: TextAnalysis,
    conversation: ConversationAnalysis
  ): number {
    const confidences: number[] = [];

    // Audio confidence (if available)
    if (audio.breath) confidences.push(audio.breath.confidence);
    if (audio.tremor) confidences.push(audio.tremor.confidence);
    if (audio.volumeDynamics) confidences.push(audio.volumeDynamics.confidence);

    // Text confidence
    confidences.push(text.cognitiveLoad.confidence);
    confidences.push(text.fluency.confidence);
    confidences.push(text.hedging.confidence);
    confidences.push(text.selfSoothing.confidence);

    // Conversation confidence
    confidences.push(conversation.narrativeArc.confidence);
    confidences.push(conversation.engagement.confidence);

    if (confidences.length === 0) return 0.5;

    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, HumanListeningPipeline>();

export function getHumanListeningPipeline(sessionId: string): HumanListeningPipeline {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new HumanListeningPipeline(sessionId));
  }
  return instances.get(sessionId)!;
}

export function resetHumanListeningPipeline(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

export function resetAllHumanListeningPipelines(): void {
  instances.forEach((instance) => {
    instance.reset();
  });
  instances.clear();
}

export default HumanListeningPipeline;
