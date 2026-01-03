/**
 * Data Message Handlers
 *
 * Handles incoming data messages from the voice agent.
 * Each handler processes a specific message type (celebration, emotion, music, etc.)
 */

import type {
  CelebrationEvent,
  ConversationEndEvent,
  DataMessage,
  EmotionEvent,
  EngagementTriggerEvent,
  ExpressionEvent,
  ExpressionUpdateEvent,
  MoodEvent,
  MusicEvent,
  WrapUpEvent,
} from '../types/events.js';
import {
  isCelebrationMessage,
  isConversationEndMessage,
  isEmotionMessage,
  isEngagementTriggerMessage,
  isExpressionMessage,
  isExpressionUpdateMessage,
  isMoodMessage,
  isMusicMessage,
  isWrapUpMessage,
  normalizeMusicMessage,
} from '../types/events.js';

import { cameoService } from '../services/cameo.service.js';
import { conversationTracker } from '../services/conversation-tracker.service.js';
import { delightService } from '../services/delight.service.js';
import { t, setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/index.js';
// 🌱 Smart Vote Prompts - Track user mentions for feature recommendations
import { smartPromptTracker } from '../services/roadmap.service.js';
import { engagementService, handoffService, moodService } from '../services/index.js';
import { setWrappingUp } from '../state/app.state.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { coachUI } from '../ui/coach.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { moodUI } from '../ui/mood.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { createLogger } from '../utils/logger.js';
// 🎬 Ferni Expressions - Character-level avatar expressions
import { ferniExpressions, type EmotionalExpression } from '../ui/ferni-expressions.ui.js';
// 🎭 Luxo Expressions - 100+ expression system from design tokens
import * as luxoExpressions from '../ui/luxo-expressions.ui.js';
import type { ExpressionId } from '../config/expressions.generated.js';
// 🎚️ Music Audio Controller - Real-time ducking
import { getMusicAudioController } from '../services/music-audio.controller.js';
// Connection service - for music track expectation
import { connectionService } from '../services/index.js';
// 🚀 Ferni EQ - Superhuman emotional intelligence
import { ferni } from '../ui/better-than-human.ui.js';
// 🎧 Now Playing UI - music state visualization
import { nowPlayingUI } from '../ui/now-playing.ui.js';
// 💭 Proactive Outreach UI - "Better than Human" thinking of you
import { proactiveOutreachUI, type ProactiveOutreachData } from '../ui/proactive-outreach.ui.js';
// Tone detection for micro-expressions
import {
  analyzeForMicroExpression,
  detectAnticipatedTone,
  estimateEnergyFromText,
} from '../utils/tone-detection.js';
// 🌉 Humanization Bridge - Connects backend humanization to frontend EQ
import { humanizationBridge } from '../services/humanization-bridge.service.js';
// 🔄 Behavior Signal Service - Bidirectional behavior system
import { behaviorSignalService } from '../services/behavior-signal.service.js';
// 🎭 Persona Intro - Team member unlock modal
import { personaIntro } from '../ui/persona-intro.ui.js';
// 🔓 Team unlock service - For marking members as unlocked
// 🎉 Roster preferences - For adding members to the roster
import { addMemberToRoster, type TeamMemberId } from '../services/roster-preferences.service.js';
// 🌟 Winter Solstice - Cinematic holiday experience
import { winterSolsticeMoment, type SolsticeContext } from '../ui/winter-solstice.ui.js';
// 📔 Journal Capture - Auto-capture meaningful moments
import { 
  isCaptureEnabled, 
  mightContainMoment, 
  queueMoment,
  estimateMomentType,
  type CapturedMoment,
} from '../services/journal-capture.service.js';
// 🧠 Semantic Router Observability - Dev panel stats
import {
  routingStatsUI,
  type SemanticRoutingData,
} from '../ui/routing-stats.ui.js';

const log = createLogger('DataMessageHandlers');

// Callback for showing team huddle (set by app.ts)
let showTeamHuddleCallback: (() => void) | null = null;

/**
 * Set the callback for showing team huddle.
 */
export function setShowTeamHuddleCallback(callback: () => void): void {
  showTeamHuddleCallback = callback;
}

/**
 * Handle incoming data messages from the agent.
 * Routes to appropriate handler based on message type.
 */
export function handleDataMessage(message: DataMessage): void {
  // Try to process as handoff (async - fire and forget)
  void handoffService.processDataMessage(message);

  // 🎬 Try to process as cameo (team member pop-in)
  if (cameoService.processDataMessage(message)) {
    log.info('🎬 Cameo message processed:', { type: (message as { type?: string }).type });
    return;
  }

  // 🌉 Try to process as humanization signal (breakthrough, vulnerability, etc.)
  // This is the bridge that makes Ferni feel truly human
  if (humanizationBridge.processMessage(message)) {
    return;
  }

  // 🔄 Try to process as behavior signal (bidirectional behavior system)
  // These signals change HOW Ferni appears (avatar mode, pacing, expressions)
  if (behaviorSignalService.isBehaviorSignalMessage(message)) {
    behaviorSignalService.processBehaviorSignal(message);
    return;
  }

  // Try to process as mood update (from humanizing system)
  if (moodService.isMoodUpdate(message)) {
    moodService.processMoodUpdate(message);
    return;
  }

  // Try to process as celebration
  if (isCelebrationMessage(message)) {
    handleCelebration(message);
    return;
  }

  // Try to process as emotion update
  if (isEmotionMessage(message)) {
    handleEmotion(message);
    return;
  }

  // Try to process as expression (emoji morph)
  if (isExpressionMessage(message)) {
    handleExpression(message);
    return;
  }

  // 🎭 Try to process as Luxo expression update (100+ expressions)
  if (isExpressionUpdateMessage(message)) {
    handleExpressionUpdate(message);
    return;
  }

  // Try to process as persona mood update
  if (isMoodMessage(message)) {
    handleMood(message);
    return;
  }

  // Try to process as music event (for avatar dancing)
  // Backend sends 'music_state', we normalize to MusicEvent
  // 🎧 DEBUG: Log all incoming messages to trace music state flow
  if ((message as { type?: string }).type === 'music_state') {
    log.info('🎧 [FRONTEND] Received music_state message', {
      rawMessage: JSON.stringify(message).slice(0, 500),
    });
  }

  if (isMusicMessage(message)) {
    log.info('🎧 [FRONTEND] isMusicMessage passed, normalizing...');
    const normalizedMusic = normalizeMusicMessage(message);
    log.info('🎧 [FRONTEND] Normalized music message', {
      hasNormalized: !!normalizedMusic,
      state: normalizedMusic?.state,
      trackName: normalizedMusic?.trackName,
    });
    if (normalizedMusic) {
      handleMusic(normalizedMusic);
      return;
    }
  }

  // Try to process as engagement update
  if (engagementService.handleDataMessage(message)) {
    return;
  }

  // Try to process as engagement trigger
  if (isEngagementTriggerMessage(message)) {
    handleEngagementTrigger(message);
    return;
  }

  // 💭 Try to process as proactive outreach ("Better than Human" thinking of you)
  if (isProactiveOutreachMessage(message)) {
    handleProactiveOutreach(message);
    return;
  }

  // Try to process as wrap-up signal (conversation ending)
  if (isWrapUpMessage(message)) {
    handleWrapUp(message);
    return;
  }

  // Try to process as conversation end signal (auto-disconnect)
  if (isConversationEndMessage(message)) {
    handleConversationEnd(message);
    return;
  }

  // Handle other message types
  switch (message.type) {
    case 'spotify':
      // Spotify-related message
      break;

    case 'status':
      // Status update
      if (typeof message['text'] === 'string') {
        messageUI.show(message['text'], 'info');
      }
      break;

    case 'set_language':
      // 🌐 VOICE-TRIGGERED LANGUAGE CHANGE
      // Ferni can change the app language without disconnecting the call
      handleSetLanguage(message as SetLanguageMessage);
      break;

    case 'cameo_unlock':
      // 🎭 CAMEO UNLOCK: Ferni just introduced a new team member!
      // This is triggered when Ferni uses the introduceMember tool
      handleCameoUnlock(message as unknown as CameoUnlockMessage);
      break;

    case 'transcript':
    case 'agent_transcript':
      // Track agent message for conversation history
      if (typeof message['text'] === 'string') {
        conversationTracker.addMessage(
          'agent',
          message['text'],
          message['personaId'] as string | undefined
        );
      }
      break;

    case 'user_transcript':
      // Track user message for conversation history
      if (typeof message['text'] === 'string') {
        const userText = message['text'];
        conversationTracker.addMessage('user', userText);

        // 🚀 Ferni EQ: Trigger micro-expressions based on user transcript content
        // This enables subliminal trust-building through authentic reactions
        const microParams = analyzeForMicroExpression(userText);
        ferni.detectAndTriggerMicroExpression(microParams);
        log.debug('🚀 Micro-expression analysis', {
          tone: microParams.tone,
          intensity: microParams.intensity,
        });

        // 🌱 Smart Vote Prompts: Analyze user text for feature recommendations
        // This tracks mentions of keywords related to upcoming features
        smartPromptTracker.analyzeText(userText);

        // 📔 Journal Capture: Detect meaningful moments for auto-journaling
        // Only runs if user has enabled auto-capture
        if (isCaptureEnabled() && mightContainMoment(userText)) {
          const momentType = estimateMomentType(userText);
          if (momentType) {
            const moment: CapturedMoment = {
              id: `moment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: momentType,
              content: userText,
              themes: [], // Backend will analyze for themes
              intensity: microParams.intensity ?? 0.7,
              timestamp: new Date().toISOString(),
              conversationId: message['conversationId'] as string | undefined,
              personaId: message['personaId'] as string | undefined,
            };
            queueMoment(moment);
            log.info('📔 Meaningful moment detected', { type: momentType });
          }
        }
      }
      break;

    case 'insight':
    case 'memory':
      // Track insights for conversation history
      if (typeof message['content'] === 'string') {
        conversationTracker.addInsight(message['content']);
      }
      break;

    case 'topic':
      // Track topics discussed
      if (typeof message['topic'] === 'string') {
        conversationTracker.addTopic(message['topic']);
      }
      break;

    case 'voice_prosody':
      // 🚀 Ferni EQ: Voice prosody data for concern detection & breath sync
      handleVoiceProsody(message as VoiceProsodyEvent);
      break;

    case 'partial_transcript':
      // 🚀 Ferni EQ: Partial transcript for anticipation - "reading the future"
      handlePartialTranscript(message as PartialTranscriptEvent);
      break;

    case 'avatar_cue':
      // 🔮 BETTER THAN HUMAN: Avatar cues from anticipatory trigger engine
      // Shows empathy BEFORE user finishes speaking - "reading the future"
      handleAvatarCue(message as AvatarCueEvent);
      break;

    case 'trust_signal':
      // 💚 Trust Signal: "Ferni noticed..." UI cards from backend trust systems
      handleTrustSignal(message as TrustSignalEvent);
      break;

    case 'breath_sync':
      // 🫁 Ferni EQ: Breath sync quality from backend for avatar breathing animation
      handleBreathSync(message as BreathSyncEvent);
      break;

    case 'cinematic_experience':
      // 🌟 Cinematic Experience: Full-screen visual moments (Winter Solstice, etc.)
      handleCinematicExperience(message as CinematicExperienceEvent);
      break;

    case 'humanization_signal':
      // 🚀 BETTER THAN HUMAN: Emotion signals from backend for EQ responses
      // This is the CRITICAL bridge between backend emotion analysis and frontend avatar
      handleHumanizationSignal(message as HumanizationSignalEvent);
      break;

    case 'speech_state':
      // 🎭 BETTER THAN HUMAN: Real-time speech state events for active listening
      // This enables the avatar to show moment-to-moment engagement (micro-nods, breath sync)
      handleSpeechState(message as SpeechStateEvent);
      break;

    case 'anticipation_signal':
      // 🚀 BETTER THAN HUMAN: Anticipation signals BEFORE turn completes
      // This enables the avatar to respond emotionally while user is still speaking
      handleAnticipationSignal(message as AnticipationSignalEvent);
      break;

    case 'laughter_detected':
      // 😄 BETTER THAN HUMAN: User laughed → Avatar smiles/laughs along!
      // This makes Ferni feel like a friend who shares in your joy
      handleLaughterDetected(message as LaughterDetectedEvent);
      break;

    case 'semantic_routing':
      // 🧠 SEMANTIC ROUTER: Tool routing decision for dev panel observability
      // This helps us understand how the semantic router is performing
      handleSemanticRouting(message as SemanticRoutingEvent);
      break;

    case 'on_behalf_call_complete':
      // 📞 ON-BEHALF CALL: Call completed, show result to user
      handleOnBehalfCallComplete(message as OnBehalfCallCompleteEvent);
      break;

    default:
  }
}

// ============================================================================
// PARTIAL TRANSCRIPT HANDLER - Ferni EQ "Reading the Future"
// ============================================================================

/**
 * Partial transcript event from backend
 */
interface PartialTranscriptEvent extends DataMessage {
  type: 'partial_transcript';
  text: string;
  isFinal: boolean;
}

/**
 * Handle partial transcript for anticipation
 *
 * This enables the "Better than Human" capability of anticipating
 * emotions before the user finishes speaking.
 *
 * BETTER THAN HUMAN: We detect emotional signals DURING speech and
 * respond immediately - before the user even finishes their thought.
 */
function handlePartialTranscript(event: PartialTranscriptEvent): void {
  const { text } = event;

  // Skip very short partials
  if (text.length < 15) return;

  // Detect anticipated tone from partial speech
  const tone = detectAnticipatedTone(text);
  const energy = estimateEnergyFromText(text);

  // Trigger anticipation (handles emotion word detection)
  ferni.anticipateEmotion({
    transcript: text,
    tone,
    energy,
  });

  // =========================================================================
  // BETTER THAN HUMAN: Run concern detection on partials too!
  // This lets us respond to distress signals DURING speech, not after.
  // =========================================================================
  const concernPatterns = [
    /\b(can't|cannot) (take|handle|do|deal)/i,
    /\b(hate|worst|terrible|awful|horrible)\b/i,
    /\b(failing|failed|failure|mess|disaster)\b/i,
    /\bi('m| am) (so )?(tired|exhausted|done|over it)\b/i,
    /\b(hopeless|pointless|why bother|give up)\b/i,
    /\bno one (understands|cares|listens)\b/i,
  ];

  // Check for quick concern patterns (lighter than full analyzeConcern)
  const hasConcernSignal = concernPatterns.some((p) => p.test(text));

  if (hasConcernSignal) {
    // Run full concern analysis for avatar response
    ferni.analyzeConcern({ transcript: text });
    log.debug('🛡️ Concern signal detected in partial:', { textLength: text.length });
  }

  log.debug('🔮 Anticipation from partial:', { tone, energy, textLength: text.length });
}

// ============================================================================
// TRUST SIGNAL HANDLER - "Ferni noticed..." UI Cards
// ============================================================================

/**
 * Trust signal event from backend trust systems
 */
interface TrustSignalEvent extends DataMessage {
  type: 'trust_signal';
  signalType:
    | 'growth'
    | 'boundary'
    | 'callback'
    | 'small_win'
    | 'thinking_of_you'
    | 'reading_lines';
  title: string;
  message: string;
  personaId?: string;
  timing: 'immediate' | 'after_response' | 'end_of_turn';
  metadata?: Record<string, unknown>;
}

/**
 * Handle trust signal from backend
 *
 * Dispatches a custom event that the trust-signals.ui.ts listens for.
 * This creates the "Ferni noticed..." floating cards.
 */
function handleTrustSignal(event: TrustSignalEvent): void {
  log.info('💚 Trust signal received', {
    type: event.signalType,
    title: event.title,
    timing: event.timing,
  });

  // Dispatch custom event for the trust signals UI
  // The progressive-features.service.ts listens for 'ferni:backend-trust-signal'
  window.dispatchEvent(
    new CustomEvent('ferni:backend-trust-signal', {
      detail: {
        type: event.signalType,
        title: event.title,
        message: event.message,
        personaId: event.personaId,
      },
    })
  );
}

// ============================================================================
// VOICE PROSODY HANDLER - Ferni EQ "Better Than Human"
// ============================================================================

/**
 * Voice prosody event from backend audio analysis
 */
interface VoiceProsodyEvent extends DataMessage {
  type: 'voice_prosody';
  stressLevel: number;
  anxietyMarkers: boolean;
  valence: number;
  arousal: number;
  dominance: number;
  pitchVariance?: number;
  pauseDuration?: number;
  speechRate?: number;
  voiceQuality?: number;
  breathiness?: number;
}

// ============================================================================
// AVATAR CUE HANDLER - Anticipatory Emotional Intelligence
// ============================================================================

/**
 * Avatar cue event from anticipatory trigger engine
 *
 * Sent when the Speech Orchestrator predicts emotion BEFORE the user finishes
 * speaking. This is the "reading the future" capability.
 */
interface AvatarCueEvent extends DataMessage {
  type: 'avatar_cue';
  /** Always 'anticipatory_response' from anticipation engine */
  anticipatoryType: 'anticipatory_response';
  /** Expression to show: soften, concern, warmth, excitement, attentive, neutral */
  expression: 'soften' | 'concern' | 'warmth' | 'excitement' | 'attentive' | 'neutral';
  /** Gesture hint: micro-nod, lean-in, open-hands, gentle-smile, none */
  gesture: 'micro-nod' | 'lean-in' | 'open-hands' | 'gentle-smile' | 'none';
  /** Eye contact mode */
  eyeContact: 'maintain' | 'soften' | 'give-space';
  /** What the engine predicted (for debugging/analytics) */
  anticipatedOutcome?: string;
}

/**
 * Handle avatar cue from anticipatory trigger engine
 *
 * BETTER THAN HUMAN: This is the "reading the future" capability - showing
 * empathy BEFORE the user finishes speaking. Maps backend cues to frontend
 * micro-expressions for subliminal trust building.
 */
function handleAvatarCue(event: AvatarCueEvent): void {
  log.info('🔮 Avatar cue received (anticipatory)', {
    expression: event.expression,
    gesture: event.gesture,
    anticipatedOutcome: event.anticipatedOutcome,
  });

  const { playMicroExpression } = ferni;

  // Map backend expressions to frontend micro-expressions
  switch (event.expression) {
    case 'concern':
      playMicroExpression('concern_flash');
      break;
    case 'warmth':
      playMicroExpression('warmth_pulse');
      break;
    case 'soften':
      playMicroExpression('warmth_pulse'); // soften maps to warmth
      break;
    case 'excitement':
      playMicroExpression('interest_flash');
      break;
    case 'attentive':
      playMicroExpression('protective'); // attentive = protective presence
      break;
    case 'neutral':
      playMicroExpression('noticing'); // subtle acknowledgment
      break;
  }

  // Handle gestures - these enhance the expression
  if (event.gesture === 'lean-in') {
    playMicroExpression('curious_lean');
  } else if (event.gesture === 'gentle-smile') {
    playMicroExpression('warmth_pulse');
  } else if (event.gesture === 'micro-nod') {
    // Micro-nods handled by active listening system
    ferni.onUserSpeechPause(200); // Simulates pause that triggers nod
  }

  // Track for analytics (anticipation worked!)
  log.debug('🔮 Anticipatory avatar cue triggered', {
    expression: event.expression,
    gesture: event.gesture,
    outcome: event.anticipatedOutcome,
  });
}

/**
 * Handle voice prosody data from backend for Ferni EQ concern detection
 *
 * BETTER THAN HUMAN: This enables instant emotional intelligence by:
 * 1. Triggering micro-expressions IMMEDIATELY on voice distress signals
 * 2. Detecting voice strain/breaking for concern response
 * 3. Tracking pause patterns for breath synchronization
 * 4. Mapping stress levels to empathetic expressions
 *
 * Key insight: Real humans unconsciously respond to voice tone changes.
 * We make this visible through immediate avatar feedback.
 */
function handleVoiceProsody(event: VoiceProsodyEvent): void {
  log.debug('🚀 Voice prosody received', {
    stressLevel: event.stressLevel,
    anxietyMarkers: event.anxietyMarkers,
    valence: event.valence,
  });

  // =========================================================================
  // BETTER THAN HUMAN: Instant micro-expressions on voice signals
  // These trigger BEFORE concern analysis for immediate visual feedback
  // =========================================================================

  const { playMicroExpression } = ferni;

  // HIGH STRESS: Immediate protective response
  if (event.stressLevel > 0.7) {
    playMicroExpression('protective');
    log.debug('🛡️ High stress detected - protective micro-expression');
  }

  // ANXIETY MARKERS: Show we notice
  if (event.anxietyMarkers && event.stressLevel > 0.5) {
    playMicroExpression('concern_flash');
    log.debug('💚 Anxiety markers detected - concern flash');
  }

  // VOICE BREAKING: Strong empathetic response
  if (event.stressLevel > 0.7 && event.anxietyMarkers) {
    playMicroExpression('warmth_pulse');
    log.debug('💛 Voice breaking detected - warmth pulse');
  }

  // LOW VALENCE (negative emotion): Show attentive presence
  if (event.valence < 0.3) {
    playMicroExpression('noticing');
    log.debug('👀 Low valence detected - noticing');
  }

  // HIGH AROUSAL + HIGH VALENCE: Match excitement
  if (event.arousal > 0.7 && event.valence > 0.6) {
    playMicroExpression('delight_flash');
    log.debug('✨ High excitement detected - delight flash');
  }

  // SIGHING (breathiness + low speech rate): Gentle presence
  const isSighing =
    (event.breathiness !== undefined && event.breathiness > 0.6) ||
    (event.speechRate !== undefined && event.speechRate < 0.3);
  if (isSighing) {
    playMicroExpression('warmth_pulse');
    log.debug('😮‍💨 Sighing detected - warmth pulse');
  }

  // =========================================================================
  // CONCERN DETECTION (existing logic enhanced)
  // =========================================================================

  // Map backend prosody to concern detection parameters
  const concernParams: Parameters<typeof ferni.analyzeConcern>[0] = {
    // Voice strain is indicated by high stress + low valence
    voiceStrain: event.stressLevel,

    // Voice breaking is indicated by high stress + anxiety markers
    voiceBreaking: event.stressLevel > 0.7 && event.anxietyMarkers,

    // Pause frequency indicates processing difficulty
    pauseFrequency:
      event.pauseDuration !== undefined
        ? Math.min(1, event.pauseDuration / 1000) // Normalize to 0-1
        : undefined,

    // Sighing
    sighing: isSighing,
  };

  // Run concern detection (triggers more sustained avatar responses)
  const concernLevel = ferni.analyzeConcern(concernParams);

  if (concernLevel !== 'none') {
    log.info('🚀 Ferni EQ concern detected', { concernLevel, stressLevel: event.stressLevel });
  }

  // Track pause duration for breath sync
  if (event.pauseDuration !== undefined && event.pauseDuration > 200) {
    ferni.detectUserBreathRate([event.pauseDuration]);
  }
}

// ============================================================================
// BREATH SYNC HANDLER - Ferni EQ Avatar Breathing Synchronization
// ============================================================================

/**
 * Breath sync event from backend
 */
interface BreathSyncEvent extends DataMessage {
  type: 'breath_sync';
  syncQuality: number; // 0-1, how well synced with user
  pacing: number; // 0.5-2, overall pacing adjustment
  hasBreathMarkers: boolean; // Whether breath markers were inserted in speech
  adjustedBreaks: number; // Number of adjusted breaks
}

/**
 * Handle breath sync data from backend for Ferni EQ avatar breathing
 *
 * This enables "Better than Human" breathing synchronization:
 * 1. Avatar breathing matches user's detected breath rate
 * 2. Creates subconscious calming effect through mirror neurons
 * 3. Enhances feeling of presence and connection
 */
function handleBreathSync(event: BreathSyncEvent): void {
  log.debug('🫁 Breath sync received', {
    syncQuality: event.syncQuality,
    pacing: event.pacing,
    hasBreathMarkers: event.hasBreathMarkers,
  });

  // Only apply if sync quality is meaningful (> 30%)
  if (event.syncQuality < 0.3) {
    log.debug('🫁 Breath sync quality too low, skipping');
    return;
  }

  // Enable breath sync on the Ferni EQ system
  ferni.setBreathSyncEnabled(true);

  // Convert pacing to breath rate
  // Pacing of 1.0 = normal (15 BPM), 1.2 = faster (18 BPM), 0.8 = slower (12 BPM)
  const baseBreathRate = 15; // breaths per minute
  const adjustedRate = baseBreathRate * event.pacing;

  // Generate synthetic pause durations to simulate detected breath pattern
  // Backend pacing guides us, we create consistent intervals
  const msPerBreath = 60000 / adjustedRate;
  const pauseDurations = [
    msPerBreath * 0.95,
    msPerBreath * 1.02,
    msPerBreath * 0.98,
    msPerBreath * 1.01,
    msPerBreath * 0.97,
  ];

  // Feed the breath rate to Ferni EQ
  ferni.detectUserBreathRate(pauseDurations);

  // Trigger sync if quality is good
  if (event.syncQuality > 0.6) {
    ferni.syncBreathing();
    log.info('🫁 Breath sync activated', {
      rate: adjustedRate.toFixed(1),
      quality: event.syncQuality.toFixed(2),
    });
  }

  // Dispatch event for presence UI to adjust avatar breathing
  window.dispatchEvent(
    new CustomEvent('ferni:breath-sync', {
      detail: {
        rate: adjustedRate,
        depth: event.syncQuality > 0.7 ? 'deep' : event.syncQuality > 0.5 ? 'medium' : 'shallow',
      },
    })
  );
}

// ============================================================================
// HUMANIZATION SIGNAL HANDLER - "Better Than Human" Emotion Bridge (CRITICAL!)
// ============================================================================

/**
 * Humanization signal types from backend emotion dispatcher
 */
type HumanizationSignalType =
  | 'concern_detected'
  | 'voice_state_detected'
  | 'emotional_trajectory'
  | 'vulnerability'
  | 'breakthrough'
  | 'high_engagement'
  | 'disengagement';

/**
 * Humanization signal event from backend
 * This is the CRITICAL bridge that enables "Better Than Human" emotional intelligence!
 */
interface HumanizationSignalEvent extends DataMessage {
  type: 'humanization_signal';
  signalType: HumanizationSignalType;
  intensity?: number;
  concernLevel?: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
  concernType?: string;
  voiceState?: string;
  emotionalTrajectory?: 'de_escalating' | 'escalating' | 'volatile';
  mismatchType?: string;
  timestamp: number;
}

/**
 * Handle humanization signals from the backend emotion dispatcher
 * 
 * CRITICAL: This is the main bridge between backend emotion analysis and frontend EQ!
 * Without this, all the backend's emotional intelligence has no way to affect the avatar.
 * 
 * Signals handled:
 * - concern_detected: User is distressed → protective mode
 * - voice_state_detected: Voice-text mismatch → extra care
 * - emotional_trajectory: Mood is changing → adapt presence
 * - high_engagement: User is excited → match energy
 * - disengagement: User is drifting → gentle reconnection
 * - vulnerability: User shared something hard → holding space
 * - breakthrough: User had realization → celebrate subtly
 */
function handleHumanizationSignal(event: HumanizationSignalEvent): void {
  const { signalType, intensity = 0.7 } = event;

  log.info('🚀 BETTER THAN HUMAN: Humanization signal received', {
    signalType,
    intensity,
    concernLevel: event.concernLevel,
  });

  const { playMicroExpression } = ferni;

  switch (signalType) {
    case 'concern_detected':
      // User is showing distress signals - activate protective presence
      if (event.concernLevel === 'crisis') {
        // Crisis level - full protective mode
        playMicroExpression('protective');
        ferniExpressions.setExpression('holdingSpace', 800, 5000);
        ferni.analyzeConcern({ voiceStrain: 1.0, voiceBreaking: true });
      } else if (event.concernLevel === 'elevated') {
        // Elevated concern - strong empathy
        playMicroExpression('concern_flash');
        ferniExpressions.setExpression('attentive', 500, 3000);
        ferni.analyzeConcern({ voiceStrain: 0.8 });
      } else if (event.concernLevel === 'moderate') {
        // Moderate concern - gentle attention
        playMicroExpression('warmth_pulse');
        ferniExpressions.setExpression('attentive', 400, 2000);
        ferni.analyzeConcern({ voiceStrain: 0.5 });
      } else {
        // Mild concern - subtle acknowledgment
        playMicroExpression('noticing');
      }
      break;

    case 'voice_state_detected':
      // Voice-text mismatch detected (e.g., says "I'm fine" but voice says otherwise)
      playMicroExpression('concern_flash');
      // This triggers the "protective instinct" - noticing what's NOT being said
      ferniExpressions.setExpression('contemplative', 400, 2500);
      log.info('🛡️ Voice-text mismatch detected:', event.mismatchType);
      break;

    case 'emotional_trajectory':
      if (event.emotionalTrajectory === 'escalating') {
        // Emotional intensity rising - increase empathy presence
        playMicroExpression('warmth_pulse');
        ferniExpressions.setExpression('attentive', 400, 3000);
      } else if (event.emotionalTrajectory === 'de_escalating') {
        // Calming down - gentle supportive presence
        playMicroExpression('recognition');
        ferniExpressions.setExpression('present', 300, 2000);
      } else if (event.emotionalTrajectory === 'volatile') {
        // High variability - extra patience and steadiness
        playMicroExpression('noticing');
        ferniExpressions.setExpression('holdingSpace', 500, 4000);
      }
      break;

    case 'high_engagement':
      // User is excited and engaged - match their energy!
      playMicroExpression('delight_flash');
      if (intensity > 0.8) {
        ferniExpressions.setExpression('excited', 300, 1500);
      } else {
        ferniExpressions.setExpression('happy', 300, 1500);
      }
      break;

    case 'disengagement':
      // User is drifting - gentle attempt to reconnect
      playMicroExpression('interest_flash');
      ferniExpressions.setExpression('curious', 400, 2000);
      break;

    case 'vulnerability':
      // User shared something vulnerable - honor it with gentle presence
      playMicroExpression('warmth_pulse');
      ferniExpressions.setExpression('holdingSpace', 600, 4000);
      break;

    case 'breakthrough':
      // User had a realization or breakthrough - celebrate subtly!
      playMicroExpression('delight_flash');
      setTimeout(() => {
        playMicroExpression('recognition');
      }, 100);
      ferniExpressions.setExpression('pleased', 500, 2000);
      break;
  }
}

// ============================================================================
// ANTICIPATION SIGNAL HANDLER - "Better Than Human" Reading the Future
// ============================================================================

/**
 * Anticipation signal event from backend - sent BEFORE turn completes
 */
interface AnticipationSignalEvent extends DataMessage {
  type: 'anticipation_signal';
  /** Predicted intent (question, emotional_share, celebration, etc.) */
  intent: string;
  intentConfidence: number;
  /** Emotional trajectory (rising, falling, volatile) */
  emotionTrajectory: 'rising' | 'falling' | 'stable' | 'volatile';
  /** Predicted primary emotion */
  predictedEmotion: string;
  emotionConfidence: number;
  /** Response urgency */
  urgency: 'high' | 'normal' | 'low';
  timestamp: number;
}

/**
 * Handle anticipation signals from the backend
 *
 * BETTER THAN HUMAN: We respond emotionally BEFORE the user finishes speaking.
 * This creates the feeling that Ferni truly understands, even predicts,
 * what you're going to say. No human friend can do this consistently.
 *
 * When we detect high confidence anticipation of emotion:
 * - Show micro-expression matching the anticipated emotion
 * - Adjust avatar posture/presence
 * - Prepare for the predicted emotional need
 */
function handleAnticipationSignal(event: AnticipationSignalEvent): void {
  const { intent, emotionTrajectory, predictedEmotion, emotionConfidence, urgency } = event;

  // Only act on high-confidence anticipations
  if (emotionConfidence < 0.6) {
    log.debug('🔮 Anticipation below threshold:', { emotionConfidence });
    return;
  }

  log.info('🔮 BETTER THAN HUMAN: Anticipation signal received', {
    intent,
    emotionTrajectory,
    predictedEmotion,
    urgency,
  });

  const { playMicroExpression } = ferni;

  // Trigger anticipation through the Ferni EQ system
  // Map emotion trajectory to tone - default to 'flat' if trajectory is not provided
  const toneFromTrajectory: 'rising' | 'falling' | 'flat' =
    emotionTrajectory === 'rising' ? 'rising' :
    emotionTrajectory === 'falling' ? 'falling' : 'flat';

  ferni.anticipateEmotion({
    transcript: '', // No transcript needed - we have direct emotion prediction
    tone: toneFromTrajectory,
    energy: urgency === 'high' ? 0.9 : urgency === 'low' ? 0.3 : 0.6,
  });

  // Respond based on predicted emotion
  switch (predictedEmotion) {
    case 'sad':
    case 'distressed':
    case 'anxious':
      // Emotional pain detected early - show care BEFORE they finish
      playMicroExpression('warmth_pulse');
      if (emotionConfidence > 0.7) {
        ferniExpressions.setExpression('attentive', 400, 2000);
      }
      break;

    case 'excited':
    case 'happy':
    case 'hopeful':
      // Positive emotion rising - match their energy early
      playMicroExpression('delight_flash');
      if (emotionTrajectory === 'rising') {
        ferniExpressions.setExpression('excited', 300, 1500);
      }
      break;

    case 'angry':
    case 'frustrated':
      // Frustration detected - show steady presence
      playMicroExpression('noticing');
      ferniExpressions.setExpression('attentive', 500, 3000);
      break;

    case 'contemplative':
    case 'thoughtful':
      // Deep thought - mirror the contemplation
      playMicroExpression('contemplation');
      ferniExpressions.setExpression('contemplative', 400, 2500);
      break;

    default:
      // General anticipation - subtle acknowledgment
      playMicroExpression('recognition');
  }

  // Handle trajectory-based responses
  if (emotionTrajectory === 'volatile') {
    // Emotions fluctuating - provide steady anchor
    ferniExpressions.setExpression('holdingSpace', 500, 4000);
  } else if (emotionTrajectory === 'falling') {
    // Mood declining - increase warmth
    playMicroExpression('warmth_pulse');
  }

  // Handle urgency
  if (urgency === 'high') {
    // High urgency - show full presence immediately
    ferni.analyzeConcern({ transcript: predictedEmotion });
  }
}

// ============================================================================
// SPEECH STATE HANDLER - "Better Than Human" Active Listening
// ============================================================================

/**
 * Speech state event from backend for active listening
 */
interface SpeechStateEvent extends DataMessage {
  type: 'speech_state';
  /** Inner event type */
  innerType: 'speech_start' | 'speech_pause' | 'speech_end' | 'breath_detected';
  /** Duration in ms (for pauses, speech segments) */
  durationMs?: number;
  /** Pause type */
  pauseType?: 'breath' | 'thinking' | 'emphasis' | 'hesitation';
  /** Nod type */
  nodType?: 'micro' | 'subtle' | 'visible';
  /** Estimated breath rate (breaths per minute) */
  breathRate?: number;
  /** Speech rate (words per minute) */
  speechRateWPM?: number;
  /** Current emotion */
  emotion?: string;
  timestamp: number;
}

/**
 * Handle speech state events for active listening
 *
 * BETTER THAN HUMAN: Real-time active listening feedback during user speech.
 * When the user pauses (breath, thinking), the avatar shows micro-nods to
 * demonstrate moment-to-moment presence - something human listeners often fail to do.
 */
function handleSpeechState(event: SpeechStateEvent): void {
  // The event might come with type as the inner type directly
  const eventType = (event as unknown as { type: string }).type;
  const innerType = eventType === 'speech_state'
    ? event.innerType
    : eventType as SpeechStateEvent['innerType'];

  log.debug('🎭 Speech state event received', {
    innerType,
    pauseType: event.pauseType,
    nodType: event.nodType,
    durationMs: event.durationMs,
  });

  switch (innerType) {
    case 'speech_start':
      // User started speaking - start active listening
      ferni.startActiveListening();
      log.debug('🎭 Active listening started');
      break;

    case 'speech_pause':
      // User paused - show acknowledgment nod based on pause type
      if (event.nodType === 'visible') {
        // Longer pause - clear nod
        ferni.playMicroExpression('understanding');
      } else if (event.nodType === 'subtle') {
        // Medium pause - subtle acknowledgment
        ferni.playMicroExpression('noticing');
      } else {
        // Micro pause - barely perceptible nod
        ferni.playMicroExpression('recognition');
      }

      // If this was a thinking pause, also show contemplation
      if (event.pauseType === 'thinking' || event.pauseType === 'emphasis') {
        ferni.playMicroExpression('contemplation');
      }
      break;

    case 'speech_end':
      // User finished speaking - transition to attentive waiting
      // The breath rate can be used for avatar breath sync
      if (event.breathRate) {
        ferni.setBreathSyncEnabled(true);
        // Store breath rate for sync (the EQ system will use this)
        (window as unknown as { __ferniBreathRate?: number }).__ferniBreathRate = event.breathRate;
      }
      break;

    case 'breath_detected':
      // Breath pattern detected - sync avatar breathing
      if (event.breathRate) {
        ferni.setBreathSyncEnabled(true);
        (window as unknown as { __ferniBreathRate?: number }).__ferniBreathRate = event.breathRate;
        log.debug('🫁 Breath sync updated', { breathRate: event.breathRate });
      }
      break;
  }
}

// ============================================================================
// LAUGHTER DETECTION HANDLER - "Better Than Human" Shared Joy
// ============================================================================

/**
 * Laughter detection event from backend
 */
interface LaughterDetectedEvent extends DataMessage {
  type: 'laughter_detected';
  laughType: 'chuckle' | 'giggle' | 'laugh' | 'hearty' | 'nervous' | 'polite' | 'unknown';
  socialFunction: 'amusement' | 'relief' | 'affiliation' | 'nervous' | 'polite' | 'unknown';
  confidence: number;
  suggestedResponse: 'join' | 'acknowledge' | 'smile' | 'wait' | 'none';
  timestamp: number;
}

/**
 * Handle laughter detection from backend
 * 
 * BETTER THAN HUMAN: When the user laughs, Ferni's avatar laughs along!
 * This is one of the most powerful ways to build connection - shared joy.
 * 
 * Response varies by laugh type:
 * - Hearty laugh → Full delighted expression, maybe join in
 * - Chuckle/giggle → Warm smile, pleased expression  
 * - Nervous laugh → Gentle warmth, supportive presence
 * - Polite laugh → Subtle smile, acknowledgment
 */
function handleLaughterDetected(event: LaughterDetectedEvent): void {
  log.info('😄 BETTER THAN HUMAN: User laughter detected!', {
    laughType: event.laughType,
    socialFunction: event.socialFunction,
    confidence: event.confidence,
  });

  const { playMicroExpression } = ferni;

  // Only respond to confident detections
  if (event.confidence < 0.6) {
    log.debug('Laughter confidence too low, subtle response only');
    playMicroExpression('warmth_pulse');
    return;
  }

  switch (event.laughType) {
    case 'hearty':
      // Full hearty laugh - join in the joy!
      playMicroExpression('delight_flash');
      setTimeout(() => {
        ferniExpressions.setExpression('delighted', 400, 2500);
      }, 50);
      // Maybe add laughter sound effect or [laughter] response
      break;

    case 'laugh':
      // Regular laugh - show genuine delight
      playMicroExpression('delight_flash');
      ferniExpressions.setExpression('happy', 350, 2000);
      break;

    case 'chuckle':
    case 'giggle':
      // Light amusement - warm smile
      playMicroExpression('warmth_pulse');
      ferniExpressions.setExpression('pleased', 300, 1500);
      break;

    case 'nervous':
      // Nervous laugh - supportive, not judgmental
      playMicroExpression('recognition');
      ferniExpressions.setExpression('warm', 400, 2000);
      // The user might be uncomfortable - show gentle presence
      break;

    case 'polite':
      // Social/polite laugh - subtle acknowledgment
      playMicroExpression('warmth_pulse');
      ferniExpressions.setExpression('pleased', 250, 1000);
      break;

    default:
      // Unknown type - default to warm response
      playMicroExpression('warmth_pulse');
      ferniExpressions.setExpression('warm', 300, 1500);
  }

  // Based on social function, maybe adjust response
  if (event.socialFunction === 'relief') {
    // Relief laughter - extra warmth
    setTimeout(() => {
      playMicroExpression('warmth_pulse');
    }, 300);
  } else if (event.socialFunction === 'affiliation') {
    // Bonding laughter - we're connecting!
    setTimeout(() => {
      playMicroExpression('recognition');
    }, 200);
  }
}

// ============================================================================
// CINEMATIC EXPERIENCE HANDLER - Full-screen visual moments
// ============================================================================

/**
 * Cinematic experience event from backend
 */
interface CinematicExperienceEvent extends DataMessage {
  type: 'cinematic_experience';
  experience: 'winter-solstice' | 'new-year';
  context?: {
    userName?: string;
    conversationsThisYear?: number;
    daysSinceFirstChat?: number;
    relationshipStage?: string;
    topTopics?: string[];
    unlockedTeamMembers?: string[];
  };
}

/**
 * Handle cinematic experience events from the agent.
 *
 * These are special full-screen visual moments that tell a story.
 * They go beyond simple celebrations to create meaningful, memorable experiences.
 *
 * Current experiences:
 * - winter-solstice: Dec 20-21, a Pixar-quality reflection on the year
 */
function handleCinematicExperience(event: CinematicExperienceEvent): void {
  log.info('🌟 Cinematic experience triggered', { experience: event.experience });

  switch (event.experience) {
    case 'winter-solstice':
      // Build context for personalized content
      const solsticeContext: SolsticeContext = {
        userName: event.context?.userName,
        conversationsThisYear: event.context?.conversationsThisYear,
        daysSinceFirstChat: event.context?.daysSinceFirstChat,
        relationshipStage: event.context?.relationshipStage,
        topTopics: event.context?.topTopics,
        unlockedTeamMembers: event.context?.unlockedTeamMembers,
      };

      // Play the cinematic experience
      void winterSolsticeMoment.play(solsticeContext);
      break;

    case 'new-year':
      // Future: New Year's Eve countdown experience
      log.warn('New Year experience not yet implemented');
      break;

    default:
      log.warn({ experience: event.experience }, 'Unknown cinematic experience');
  }
}

/**
 * Handle celebration events from the agent.
 * Zen aesthetic: warmth and breathing, not explosions.
 * 🎬 Enhanced with Pixar emotions for character expressiveness.
 */
export function handleCelebration(event: CelebrationEvent): void {
  // Milestone/achievement - warm acknowledgement with held pose
  if (event.celebrationType === 'milestone' || event.celebrationType === 'achievement') {
    celebrationsUI.warmthGlow({ intensity: 'warm' });
    delightService.haptic('light');
    waveformUI.celebrate();

    // 🎬 Pixar: Held pose at peak excitement
    ferniExpressions.heldPose('excited', 600);

    if (event.message) {
      celebrationsUI.celebrateMilestone(event.message);
    }
  }

  // Aha moment / good news - double-take for surprise, then delight
  if (event.celebrationType === 'aha_moment' || event.celebrationType === 'good_news') {
    celebrationsUI.gentleBounce();
    celebrationsUI.warmthGlow({ intensity: 'gentle' });
    soundUI.play('success');
    delightService.haptic('light');
    presenceUI.bounce();
    // Flash encouraging emotion for aha moments
    presenceUI.flashEmotion('encouraging', 800);

    // 🎬 Pixar: Double-take for "aha!" moments (like WALL-E noticing something)
    if (event.celebrationType === 'aha_moment') {
      ferniExpressions.realization();
    } else {
      // Good news: delighted expression with sparkle
      ferniExpressions.delight();
    }
  }
}

/**
 * Handle emotion events from voice prosody analysis.
 * Updates waveform particles to reflect detected user emotion.
 * 🎬 Enhanced with Pixar eye lid expressions for empathetic response.
 */
export function handleEmotion(event: EmotionEvent): void {
  // Lower threshold (40%) for more responsive emotion display
  if (event.confidence < 0.4) return;

  // Update waveform with emotion shape (smile, frown, etc.)
  waveformUI.setEmotion(event.emotion, event.intensity);

  // Update coach avatar glow based on emotion
  coachUI.setEmotion?.(event.emotion);

  // Update presence glow to reflect voice emotion (design system integration)
  // Map event emotions to design system voice emotions
  const emotionMap: Record<
    string,
    | 'neutral'
    | 'happy'
    | 'excited'
    | 'calm'
    | 'thoughtful'
    | 'empathetic'
    | 'serious'
    | 'anxious'
    | 'encouraging'
  > = {
    neutral: 'neutral',
    happy: 'happy',
    sad: 'empathetic', // Sad → empathetic glow (supportive)
    anxious: 'anxious',
    excited: 'excited',
    frustrated: 'serious', // Frustrated → serious glow (grounded)
    calm: 'calm',
  };
  const voiceEmotion = emotionMap[event.emotion] || 'neutral';
  presenceUI.setVoiceEmotion(voiceEmotion);

  // Also update intensity based on event intensity
  if (event.intensity > 0.8) {
    presenceUI.setSpeakingIntensity('exclamation');
  } else if (event.intensity > 0.6) {
    presenceUI.setSpeakingIntensity('emphasis');
  } else if (event.intensity < 0.3) {
    presenceUI.setSpeakingIntensity('whisper');
  } else {
    presenceUI.setSpeakingIntensity('normal');
  }

  // 🎬 Pixar Emotions: Respond to user's emotional state with eye lid expressions
  // Only trigger for strong emotions (high confidence + intensity)
  if (event.confidence > 0.6 && event.intensity > 0.5) {
    triggerPixarEmotionResponse(event.emotion, event.intensity);
  }
}

/**
 * 🎬 Trigger appropriate Pixar eye lid expression based on detected user emotion.
 * The avatar responds empathetically to show it understands.
 */
function triggerPixarEmotionResponse(emotion: EmotionEvent['emotion'], intensity: number): void {
  // Map user emotions to empathetic avatar responses
  // When user is happy → avatar shows delight (mirroring)
  // When user is sad → avatar shows empathy (support)
  // When user is anxious → avatar shows calm (grounding)

  switch (emotion) {
    case 'happy':
      // Mirror their joy
      if (intensity > 0.7) {
        ferniExpressions.delight();
      } else {
        ferniExpressions.happy(800);
      }
      break;

    case 'excited':
      // Share their excitement
      ferniExpressions.excited();
      break;

    case 'sad':
      // Show empathetic understanding (soft, supportive expression)
      ferniExpressions.empathy();
      break;

    case 'anxious':
      // Show calm, grounding presence
      // Don't mirror anxiety - show steady supportiveness
      ferniExpressions.setExpression('empathetic', 300, 2000);
      break;

    case 'frustrated':
      // Show understanding but stay grounded
      // Slight head tilt shows "I hear you"
      ferniExpressions.curious();
      break;

    case 'calm':
      // Match their peaceful energy
      ferniExpressions.setExpression('empathetic', 400, 1500);
      break;

    case 'neutral':
    default:
      // Return to neutral (no dramatic reaction needed)
      // Let existing expressions fade naturally
      break;
  }
}

/**
 * Handle expression events from agents.
 * 🎬 Re-enabled with Pixar eye lid expressions!
 * Agent can now request specific avatar expressions for emphasis.
 *
 * The agent sends an emoji which we map to Pixar expressions.
 */
export function handleExpression(event: ExpressionEvent): void {
  // Map agent emoji/expression requests to Pixar emotions
  // Can be emoji like "😊" or text like "happy"
  const expressionType = (event.emoji || '').toLowerCase();

  log.debug('Expression event:', expressionType);

  // Handle various expression types the agent might send
  // Supports both text keywords AND emoji characters
  switch (expressionType) {
    // Positive expressions (text + emoji)
    case 'happy':
    case 'joy':
    case 'smile':
    case '😊':
    case '😄':
    case '🙂':
      ferniExpressions.happy(800);
      break;

    case 'excited':
    case 'enthusiasm':
    case '🎉':
    case '🥳':
      ferniExpressions.excited();
      break;

    case 'delight':
    case 'delighted':
    case '✨':
    case '🌟':
      ferniExpressions.delight();
      break;

    // Thinking/curious expressions
    case 'thinking':
    case 'pondering':
    case 'considering':
    case '🤔':
    case '💭':
      ferniExpressions.contemplation(2000);
      break;

    case 'curious':
    case 'interested':
    case 'intrigued':
    case '🧐':
      ferniExpressions.curious();
      break;

    // Surprise expressions
    case 'surprised':
    case 'wow':
    case 'amazed':
    case '😮':
    case '😲':
    case '🤯':
      ferniExpressions.surprise();
      break;

    case 'doubletake':
    case 'waitwhat':
    case '👀':
      ferniExpressions.realization();
      break;

    // Empathetic expressions
    case 'empathy':
    case 'understanding':
    case 'compassion':
    case '🫂':
    case '💙':
      ferniExpressions.empathy();
      break;

    case 'sad':
    case 'concerned':
    case '😢':
    case '😔':
      ferniExpressions.sad();
      break;

    case 'worried':
    case 'concern':
    case '😟':
    case '😰':
      ferniExpressions.worry();
      break;

    // Skeptical/questioning
    case 'skeptical':
    case 'hmm':
    case 'really':
    case '🤨':
      ferniExpressions.skeptical();
      break;

    // Sleepy/tired
    case 'sleepy':
    case 'tired':
    case 'yawn':
    case '😴':
    case '🥱':
      ferniExpressions.sleepy();
      break;

    // Love/appreciation
    case 'love':
    case 'heart':
    case '❤️':
    case '💕':
      ferniExpressions.delight();
      break;

    // Lightbulb/idea moment
    case 'idea':
    case 'lightbulb':
    case '💡':
      ferniExpressions.realization(); // "Aha!" moment
      break;

    default:
      // Unknown expression - log but don't error
      if (expressionType) {
        log.debug('Unknown expression type:', expressionType);
      }
  }
}

// ============================================================================
// LUXO EXPRESSION UPDATE HANDLER (100+ Expression System)
// ============================================================================

/**
 * Handle expression update events from the backend.
 *
 * This directly sets Luxo expressions from the 100+ expression system defined
 * in design-system/tokens/expressions.json. Unlike emoji-based expressions,
 * these use the full expression ID (e.g., 'joyful', 'contemplating', 'supportive').
 *
 * ARCHITECTURE:
 * - Backend dispatches: { type: 'expression_update', expression: 'joyful', ... }
 * - Frontend receives and sets via luxoExpressions.setExpression()
 * - CSS rules defined in expressions.generated.css apply the transforms
 *
 * @see design-system/tokens/expressions.json - Source of truth for 100+ expressions
 * @see apps/web/src/ui/luxo-expressions.ui.ts - Expression controller
 * @see apps/web/src/config/expressions.generated.css - CSS rules
 */
export function handleExpressionUpdate(event: ExpressionUpdateEvent): void {
  const { expression, duration = 300, hold = 0 } = event;

  log.info('🎭 Expression update received:', { expression, duration, hold });

  // Validate the expression exists in the Luxo system
  if (!luxoExpressions.hasExpression(expression)) {
    log.warn('Unknown Luxo expression:', expression);
    // Fall back to legacy system if expression not found
    // Type cast is intentional - legacy system will handle unknown expressions gracefully
    ferniExpressions.setExpression(expression as EmotionalExpression, duration, hold);
    return;
  }

  // Set the expression using the Luxo system
  luxoExpressions.setExpression(expression as ExpressionId, {
    duration,
    hold,
  });

  // Dispatch custom event for other systems to react
  window.dispatchEvent(
    new CustomEvent('ferni:expression-update', {
      detail: {
        expression,
        duration,
        hold,
        timestamp: event.timestamp,
      },
    })
  );

  log.debug('🎭 Luxo expression set:', expression);
}

/**
 * Handle persona mood events from the humanizing system.
 * Creates subtle UI changes to reflect the AI's "emotional" state.
 */
export function handleMood(event: MoodEvent): void {
  // Update mood UI with new state
  moodUI.setPersonaMood(
    event.state,
    event.energyLevel,
    event.relationshipStage,
    event.hasTransition || false
  );

  // If there's a relationship transition, also show a delight moment
  if (event.hasTransition) {
    delightService.haptic('medium');
  }
}

// ============================================================================
// PROACTIVE OUTREACH ("Better than Human" - Thinking of You)
// ============================================================================

/**
 * Type guard for proactive outreach messages.
 * These are "thinking of you" moments from the backend trust systems.
 */
function isProactiveOutreachMessage(message: DataMessage): message is DataMessage & { data: ProactiveOutreachData } {
  return (
    message.type === 'proactive_outreach' &&
    typeof message.data === 'object' &&
    message.data !== null
  );
}

/**
 * Handle proactive outreach events from the backend.
 * Shows a notification that Ferni was thinking about them.
 * 
 * "Better than Human" - The most meaningful check-ins aren't triggered by actions,
 * they're the random "I was thinking about you" moments that show someone genuinely cares.
 */
function handleProactiveOutreach(message: DataMessage & { data: ProactiveOutreachData }): void {
  const outreach = message.data;
  
  log.info({ type: outreach.type, personaId: outreach.personaId }, '💭 BETTER THAN HUMAN: Proactive outreach received');

  // =========================================================================
  // BETTER THAN HUMAN: Enhanced EQ response to proactive outreach
  // This is a genuine care moment - the avatar should reflect warmth
  // =========================================================================

  // Show the outreach notification
  proactiveOutreachUI.show(outreach);

  // Play a subtle warm sound
  soundUI.play('message');

  // Trigger MULTIPLE expressions for maximum warmth perception
  const { playMicroExpression } = ferni;
  
  // First: Quick recognition micro-expression (subliminal)
  playMicroExpression('recognition');
  
  // Then: Warm expression held longer
  setTimeout(() => {
    ferniExpressions.setExpression('warm', 400, 2000);
  }, 100);
  
  // Type-specific expressions based on outreach type
  // Types: 'thinking_of_you' | 'growth_reflection' | 'celebration' | 'life_event' | 'random_warmth'
  if (outreach.type === 'life_event') {
    // They may be going through something difficult or significant
    setTimeout(() => {
      playMicroExpression('concern_flash');
      ferniExpressions.setExpression('holdingSpace', 500, 2500);
    }, 300);
    
    // 🤲 Sidekick: Check if this is a birthday or anniversary reminder
    const contextLower = (outreach.context || '').toLowerCase();
    const messageLower = (outreach.message || '').toLowerCase();
    if (contextLower.includes('birthday') || messageLower.includes('birthday')) {
      document.dispatchEvent(new CustomEvent('ferni:birthday-reminder'));
    } else if (contextLower.includes('anniversary') || messageLower.includes('anniversary')) {
      document.dispatchEvent(new CustomEvent('ferni:anniversary-reminder'));
    }
  } else if (outreach.type === 'celebration' || outreach.type === 'growth_reflection') {
    // Something good happened - celebrate!
    setTimeout(() => {
      playMicroExpression('delight_flash');
    }, 200);
  } else if (outreach.type === 'thinking_of_you' || outreach.type === 'random_warmth') {
    // Pure warmth without agenda - the most "Better than Human" moment
    setTimeout(() => {
      playMicroExpression('warmth_pulse');
    }, 200);
  }

  // Dispatch event for other systems
  document.dispatchEvent(new CustomEvent('ferni:data-message', {
    detail: message
  }));
}

/**
 * Handle music events from the agent.
 * The avatar is the speaker - warm and human, not flashy.
 * The waveform responds gently and reflectively.
 * Now Playing card shows track info with visualization.
 *
 * 🎬 Enhanced with Pixar emotions - avatar shows emotional engagement with music!
 * - Playing: Delighted, grooving expression
 * - Fading: Appreciative, content expression
 * - Stopped: Warm acknowledgment
 *
 * 🎧 IMPORTANT: This function uses a synchronous import of nowPlayingUI
 * to ensure the UI is ALWAYS hidden when music stops. The previous
 * dynamic import could fail silently.
 */
export function handleMusic(event: MusicEvent): void {
  log.info('🎧 Music event received:', { state: event.state, track: event.trackName });

  // 🐛 FIX: Signal music track expectation IMMEDIATELY
  // This reduces the race window where audio arrives before we're ready to identify it
  if (event.state === 'playing') {
    connectionService.expectMusicTrack();
    getMusicAudioController().unduckFromBackend();
  }

  // 🤲 Sidekick: Dispatch music state event for avatar sidekick
  document.dispatchEvent(new CustomEvent('ferni:music-state', {
    detail: { state: event.state, isAmbient: event.isAmbient, trackName: event.trackName }
  }));

  // Handle each state with direct UI calls (no async import - more reliable)
  if (event.state === 'playing') {
    // Avatar: Warm presence pulse - music is playing
    avatarFeedback.musicPresence();

    // Waveform: Gentle, reflective visualization (NOT aggressive)
    waveformUI.setMusicPlaying(true);

    // Subtle haptic for music start
    delightService.haptic('light');

    // 🎬 Pixar: Show enjoyment when music starts
    // Different expressions for ambient vs user-requested music
    if (event.isAmbient) {
      // Ambient: calm, present
      ferniExpressions.setExpression('empathetic', 300, 3000);
    } else {
      // User-requested: show delight and engagement
      ferniExpressions.delight();
      // Follow up with sustained happy expression while music plays
      setTimeout(() => {
        // Show happy expression for the duration of the typical track intro
        ferniExpressions.happy(5000);
      }, 1000);
    }

    // Show Now Playing card with track info
    if (event.trackName) {
      nowPlayingUI.show({
        name: event.trackName,
        artist: event.artistName || 'Unknown Artist',
        duration: event.duration,
        isAmbient: event.isAmbient,
        isOurSong: event.isOurSong,
        ourSongContext: event.ourSongContext,
      });
    }

    log.info('🎧 Music playing:', { track: event.trackName, isAmbient: event.isAmbient });
  } else if (event.state === 'changing') {
    // DJ Crossfade - switching tracks smoothly
    avatarFeedback.fading();
    nowPlayingUI.updateState('changing');

    // 🎬 Pixar: Excited anticipation for new track
    ferniExpressions.curious();

    // Subtle haptic for track change
    delightService.haptic('light');

    log.info('🎧 Music changing - DJ crossfade in progress');
  } else if (event.state === 'ducking') {
    // 🎚️ Duck music - agent is speaking over it
    getMusicAudioController().duckFromBackend();

    // Agent speaking over music - subtle the pulse
    avatarFeedback.ducking();
    nowPlayingUI.updateState('ducking');

    // 🎬 Pixar: Return to neutral while speaking
    // (Natural transition - avatar focuses on user)

    // Waveform stays in music mode but is naturally calmer during speech
    log.debug('🎧 Music ducking (agent speaking)');
  } else if (event.state === 'fading') {
    // DJ-style fade out - track ending soon
    avatarFeedback.fading();
    nowPlayingUI.updateState('fading');

    // 🎬 Pixar: Appreciative expression as music fades
    // Like savoring the last notes of a good song
    ferniExpressions.setExpression('happy', 400, 3000);

    log.info('🎧 Music fading out - DJ outro starting');
  } else if (event.state === 'paused') {
    avatarFeedback.stopDancing();
    nowPlayingUI.updateState('paused');

    // 🎬 Pixar: Curious expression - "paused? everything okay?"
    ferniExpressions.curious();

    log.info('🎧 Music paused');
  } else if (event.state === 'stopped' || event.state === 'idle') {
    // 🎧 CRITICAL: Always hide the Now Playing UI when music stops
    log.info('🎧 Music stopped/idle - hiding Now Playing UI', {
      state: event.state,
      wasAmbient: event.isAmbient,
    });

    // Gracefully return to rest
    avatarFeedback.stopDancing();

    // Waveform: Return to normal behavior
    waveformUI.setMusicPlaying(false);

    // 🎬 Pixar: Warm, satisfied expression after music ends
    // Not sad it's over, grateful it happened
    if (!event.isAmbient) {
      ferniExpressions.setExpression('empathetic', 300, 2000);
    }

    // Hide Now Playing card - this MUST happen
    nowPlayingUI.hide();

    log.info('🎧 Now Playing UI hidden');
  } else {
    // Unknown state - log and hide for safety
    log.warn('🎧 Unknown music state received:', { state: event.state });
    nowPlayingUI.updateState(event.state as 'idle'); // Will trigger hide
  }
}

/**
 * Handle engagement triggers from the agent.
 * These are natural conversation prompts about rituals, streaks, predictions.
 */
export function handleEngagementTrigger(event: EngagementTriggerEvent): void {
  log.debug('Engagement trigger:', event.triggerType, event.message);

  // Update badge state based on trigger type
  switch (event.triggerType) {
    case 'streak_due':
      engagementTriggerUI.updateBadges({ ritualsdue: 1, streakAtRisk: event.priority === 'high' });
      engagementTriggerUI.pulseEngagement();
      break;
    case 'streak_milestone':
      // Show a warm acknowledgement
      celebrationsUI.warmthGlow({ intensity: 'gentle' });
      delightService.haptic('medium');
      break;
    case 'prediction_result':
      engagementTriggerUI.updateBadges({ predictionsReady: 1 });
      break;
    case 'ritual_reminder':
      engagementTriggerUI.pulseEngagement();
      break;
    case 'team_suggestion':
      // Show team huddle when the agent suggests it
      showTeamHuddleCallback?.();
      break;
  }

  // For high-priority triggers, show a subtle message
  if (event.priority === 'high' && event.message) {
    messageUI.show(event.message, 'info', 4000);
  }
}

/**
 * Handle wrap-up events from the agent.
 * This signals that the conversation is ending and UI should adapt.
 * 🎬 Enhanced with Pixar farewell expressions.
 *
 * - Disconnect button becomes more prominent ("Goodbye" style)
 * - Avatar shows warm farewell animation with emotional expression
 * - Waveform softens
 */
export function handleWrapUp(event: WrapUpEvent): void {
  log.info('Wrap-up signal received:', event.sentiment);

  // Set state - this triggers UI updates across the app
  setWrappingUp(true);

  // Play the farewell animation
  presenceUI.farewell();

  // 🎬 Pixar: Show appropriate emotional expression for farewell
  // Warm farewell with soft, happy expression that lingers
  ferniExpressions.setExpression('happy', 400, 0); // Hold until conversation ends

  // Warm visual feedback based on sentiment
  switch (event.sentiment) {
    case 'warm':
      celebrationsUI.warmthGlow({ intensity: 'gentle' });
      presenceUI.setVoiceEmotion('happy');
      // 🎬 Extra warmth: gentle sparkle
      ferniExpressions.warmthSparkle();
      break;
    case 'encouraging':
      presenceUI.setVoiceEmotion('encouraging');
      presenceUI.nod(); // Affirming nod
      // 🎬 Supportive held pose
      ferniExpressions.heldPose('happy', 400);
      break;
    case 'thoughtful':
      presenceUI.setVoiceEmotion('thoughtful');
      // 🎬 Gentle thinking expression (like "I'm here if you need me")
      ferniExpressions.setExpression('empathetic', 400, 0);
      break;
    case 'caring':
      presenceUI.setVoiceEmotion('empathetic');
      celebrationsUI.warmthGlow({ intensity: 'warm' });
      // 🎬 Soft, caring expression
      ferniExpressions.empathy();
      break;
  }

  // Gentle haptic for the goodbye moment
  delightService.haptic('light');

  // If there's a custom message, show it briefly
  if (event.message) {
    messageUI.show(event.message, 'info', 3000);
  }
}

// ============================================================================
// VOICE-TRIGGERED LANGUAGE CHANGE
// ============================================================================

/**
 * Message sent when Ferni changes the app language via voice command.
 */
interface SetLanguageMessage extends DataMessage {
  readonly type: 'set_language';
  readonly language: string;
  readonly timestamp: number;
}

/**
 * Handle voice-triggered language changes.
 *
 * This enables Ferni to change the app language WITHOUT disconnecting
 * the voice call. The key insight: we use { reload: false } which
 * dispatches a 'ferni:locale-changed' event instead of reloading.
 *
 * UI components that care about language changes listen for this event
 * and re-render themselves. The LiveKit connection stays alive!
 */
async function handleSetLanguage(event: SetLanguageMessage): Promise<void> {
  const requestedLocale = event.language;

  // Validate the locale
  const isValid = SUPPORTED_LOCALES.some((l) => l.code === requestedLocale);
  if (!isValid) {
    log.warn('🌐 Invalid language requested:', requestedLocale);
    messageUI.show(t('errors.invalidLanguage'), 'warning');
    return;
  }

  const locale = requestedLocale as SupportedLocale;
  const localeInfo = SUPPORTED_LOCALES.find((l) => l.code === locale);

  log.info('🌐 Voice-triggered language change', {
    locale,
    name: localeInfo?.nativeName,
  });

  // Show a brief confirmation (in the NEW language after change)
  // We show this before the change so it's visible immediately
  messageUI.show(`Switching to ${localeInfo?.nativeName || locale}...`, 'info', 1500);

  // Change locale WITHOUT reloading - keeps LiveKit connection alive!
  await setLocale(locale, { reload: false });

  // Play a subtle sound for feedback
  soundUI.play('message');

  // Show Ferni expression - friendly acknowledgment
  ferniExpressions.setExpression('happy', 400, 1500);
}

// ============================================================================
// CAMEO UNLOCK: Team Member Introduction
// ============================================================================

/**
 * Message sent when Ferni introduces a new team member.
 * This is the "cameo unlock" moment - a celebration!
 */
interface CameoUnlockMessage {
  readonly type: 'cameo_unlock';
  readonly memberId: string;
  readonly displayName: string;
  readonly role: string;
  readonly spokenIntro: string;
  readonly timestamp: number;
  readonly [key: string]: unknown;
}

/**
 * Type guard for cameo unlock messages.
 */
function isCameoUnlockMessage(message: DataMessage): message is CameoUnlockMessage {
  return (
    message.type === 'cameo_unlock' &&
    typeof (message as CameoUnlockMessage).memberId === 'string' &&
    typeof (message as CameoUnlockMessage).displayName === 'string'
  );
}

/**
 * Handle cameo unlock events from the voice agent.
 *
 * CAMEO UNLOCK SYSTEM: This is triggered when Ferni uses the introduceMember tool
 * to formally introduce a new team member to the user.
 *
 * Flow:
 * 1. Ferni speaks the introduction aloud (handled by voice agent)
 * 2. This data message arrives after Ferni has spoken
 * 3. We mark the member as unlocked
 * 4. We add them to the user's roster
 * 5. We show the beautiful intro modal
 * 6. Play celebration sound
 */
export function handleCameoUnlock(event: CameoUnlockMessage): void {
  log.info('🎭 Cameo unlock event received!', {
    memberId: event.memberId,
    displayName: event.displayName,
    role: event.role,
  });

  // Validate the message
  if (!isCameoUnlockMessage(event)) {
    log.warn('Invalid cameo unlock message:', event);
    return;
  }

  // 1. Celebrate! Play team unlock sound
  soundUI.play('teamUnlock');

  // 2. Show warm expression - Ferni is introducing a friend!
  ferniExpressions.delight();

  // 3. Mark the member as unlocked and add to roster
  // This persists the unlock so it survives page refresh
  try {
    // Add to the visible roster
    addMemberToRoster(event.memberId as TeamMemberId);
    log.info('🎭 Added team member to roster:', event.memberId);
  } catch (err) {
    log.warn('Failed to add member to roster:', err);
  }

  // 4. Show the intro modal after a brief moment for sound/expression to register
  // NOTE: The backend now handles speech timing - it waits for Ferni's TTS
  // to finish before sending this message. So we just need a tiny buffer
  // for the celebration sound and expression to play before the modal.
  setTimeout(() => {
    // Show the beautiful 3-screen intro modal
    personaIntro.show(event.memberId);
    log.info('🎭 Showing persona intro modal for:', event.memberId);
  }, 300); // 300ms - just enough for sound/expression to register

  // 5. Dispatch event for other UI components (e.g., team roster refresh)
  window.dispatchEvent(
    new CustomEvent('ferni:team-member-unlocked', {
      detail: {
        memberId: event.memberId,
        displayName: event.displayName,
        role: event.role,
      },
    })
  );
}

/**
 * Handle conversation end events from the agent.
 * This triggers the auto-disconnect after the agent has said goodbye.
 *
 * Flow:
 * 1. Play appropriate sound based on reason
 * 2. Wait for sound to complete (or delay)
 * 3. Disconnect from the room
 */
export function handleConversationEnd(event: ConversationEndEvent): void {
  log.info('Conversation end signal received:', {
    reason: event.reason,
    exitType: event.exitType,
    delay: event.disconnectDelay,
  });

  // 📞 AGENT EXIT - When Ferni chooses to hang up
  // More tactile, quicker, like placing a phone receiver down firmly
  if (event.reason === 'agent_exit') {
    log.info('🛑 Agent-initiated exit:', event.exitType);

    // Play the phone click sound - satisfying, tactile finality
    soundUI.play('phoneClick');

    // Brief, respectful message - no cheerful "see you!"
    messageUI.show(t('session.takeCare'), 'info', 1500);

    // 🌟 Neutral/settling expression - not warm farewell
    ferniExpressions.setExpression('settling', 400, 1000);

    // Dispatch with agent_exit flag for different UI treatment
    const delay = event.disconnectDelay ?? 1500;
    setTimeout(() => {
      log.info('Agent-initiated disconnect');
      window.dispatchEvent(
        new CustomEvent('ferni:conversation-end-disconnect', {
          detail: { agentInitiated: true, exitType: event.exitType },
        })
      );
    }, delay);
    return;
  }

  // 🌅 NORMAL GOODBYE - Warm farewell ceremony
  // Play warm goodbye sound (different from abrupt disconnect)
  soundUI.play('goodbye');

  // Show a brief "See you!" message
  messageUI.show('See you next time!', 'info', 2000);

  // 🌟 Superhuman: Warm farewell expression - gentle smile with sparkle
  ferniExpressions.setExpression('farewell', 600, 2500);

  // Disconnect after delay (allows sound and animation to play)
  const delay = event.disconnectDelay ?? 2000;
  setTimeout(() => {
    log.info('Auto-disconnecting after conversation end');

    // Dispatch disconnect event - the app.ts will handle the actual disconnect
    window.dispatchEvent(new CustomEvent('ferni:conversation-end-disconnect'));
  }, delay);
}

// ============================================================================
// ON-BEHALF CALL COMPLETE HANDLER - Call Result Notification
// ============================================================================

/**
 * On-behalf call complete event from backend
 * Sent when an on-behalf call (calling someone on behalf of the user) completes.
 */
interface OnBehalfCallCompleteEvent extends DataMessage {
  type: 'on_behalf_call_complete';
  callId: string;
  contactName: string;
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
  objectiveAchieved: boolean;
  outcome: string;
  callbackRequired: boolean;
  actionItems?: string[];
  timestamp: number;
}

/**
 * Handle on-behalf call completion events.
 *
 * BETTER THAN HUMAN: When Ferni makes a call on your behalf and returns,
 * it should feel like a friend coming back with news. The avatar should
 * show appropriate emotion based on the outcome.
 *
 * This is triggered when:
 * 1. Ferni calls mom to say good morning → comes back with "She loved it!"
 * 2. Ferni calls the doctor → comes back with "Rescheduled for Thursday"
 * 3. Ferni calls a restaurant → comes back with "Got you a 7pm reservation"
 */
function handleOnBehalfCallComplete(event: OnBehalfCallCompleteEvent): void {
  log.info('📞 BETTER THAN HUMAN: On-behalf call complete!', {
    contactName: event.contactName,
    status: event.status,
    objectiveAchieved: event.objectiveAchieved,
  });

  const { playMicroExpression } = ferni;

  // Show different expressions based on outcome
  if (event.objectiveAchieved) {
    // Success! Show delight
    playMicroExpression('delight_flash');
    ferniExpressions.setExpression('pleased', 400, 2500);

    // Celebratory sound
    soundUI.play('success');

    // Show warm message
    messageUI.show(`✓ ${event.outcome}`, 'success', 5000);
  } else if (event.status === 'voicemail') {
    // Left voicemail - not ideal but okay
    playMicroExpression('noticing');
    ferniExpressions.setExpression('contemplative', 400, 2000);

    // Informational sound
    soundUI.play('message');

    // Show status
    messageUI.show(`📞 Left voicemail for ${event.contactName}`, 'info', 4000);
  } else if (event.status === 'no_answer' || event.status === 'busy') {
    // Couldn't reach them - slight concern, offer to retry
    playMicroExpression('concern_flash');
    ferniExpressions.setExpression('curious', 400, 2000);

    // Show retry option
    messageUI.show(`📞 Couldn't reach ${event.contactName}. Want me to try again later?`, 'warning', 5000);
  } else if (event.status === 'failed') {
    // Call failed - apologetic
    playMicroExpression('concern_flash');
    ferniExpressions.setExpression('contemplative', 400, 2500);

    // Show apology
    messageUI.show(`Sorry, the call to ${event.contactName} didn't go through`, 'warning', 4000);
  }

  // If callback is required, show a more prominent notification
  if (event.callbackRequired) {
    setTimeout(() => {
      messageUI.show(`📅 ${event.contactName} wants you to call back`, 'info', 4000);
    }, 2000);
  }

  // Dispatch event for other UI components (e.g., call history)
  window.dispatchEvent(
    new CustomEvent('ferni:call-complete', {
      detail: {
        callId: event.callId,
        contactName: event.contactName,
        status: event.status,
        outcome: event.outcome,
        objectiveAchieved: event.objectiveAchieved,
        callbackRequired: event.callbackRequired,
        actionItems: event.actionItems,
      },
    })
  );
}

// ============================================================================
// SEMANTIC ROUTING HANDLER - Dev Panel Observability
// ============================================================================

/**
 * Semantic routing event from backend
 */
interface SemanticRoutingEvent extends DataMessage {
  type: 'semantic_routing';
  toolId?: string;
  confidence?: number;
  bypassed_llm?: boolean;
  routing_path?: string;
}

/**
 * Handle semantic routing events for dev panel observability.
 * This lets us see how the semantic router is performing in real-time.
 */
function handleSemanticRouting(event: SemanticRoutingEvent): void {
  log.debug('Semantic routing event received', {
    toolId: event.toolId,
    confidence: event.confidence,
    bypassedLlm: event.bypassed_llm,
    routingPath: event.routing_path,
  });

  // Update routing stats UI (dev panel)
  routingStatsUI.handleRoutingData({
    toolId: event.toolId,
    confidence: event.confidence,
    bypassed_llm: event.bypassed_llm,
    routing_path: event.routing_path as SemanticRoutingData['routing_path'],
  });
}
