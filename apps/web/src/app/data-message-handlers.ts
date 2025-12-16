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
  isMoodMessage,
  isMusicMessage,
  isWrapUpMessage,
  normalizeMusicMessage,
} from '../types/events.js';

import { cameoService } from '../services/cameo.service.js';
import { conversationTracker } from '../services/conversation-tracker.service.js';
import { delightService } from '../services/delight.service.js';
import { engagementService, handoffService, moodService } from '../services/index.js';
import { t } from '../i18n/index.js';
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
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
// 🎚️ Music Audio Controller - Real-time ducking
import { getMusicAudioController } from '../services/music-audio.controller.js';
// Connection service - for music track expectation
import { connectionService } from '../services/index.js';
// 🚀 Ferni EQ - Superhuman emotional intelligence
import { ferni } from '../ui/better-than-human.ui.js';
// 🎧 Now Playing UI - music state visualization
import { nowPlayingUI } from '../ui/now-playing.ui.js';
// Tone detection for micro-expressions
import {
  analyzeForMicroExpression,
  detectAnticipatedTone,
  estimateEnergyFromText,
} from '../utils/tone-detection.js';
// 🌉 Humanization Bridge - Connects backend humanization to frontend EQ
import { humanizationBridge } from '../services/humanization-bridge.service.js';
// 🎭 Persona Intro - Team member unlock modal
import { personaIntro } from '../ui/persona-intro.ui.js';
// 🔓 Team unlock service - For marking members as unlocked
// 🎉 Roster preferences - For adding members to the roster
import { addMemberToRoster, type TeamMemberId } from '../services/roster-preferences.service.js';

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

  // Try to process as persona mood update
  if (isMoodMessage(message)) {
    handleMood(message);
    return;
  }

  // Try to process as music event (for avatar dancing)
  // Backend sends 'music_state', we normalize to MusicEvent
  if (isMusicMessage(message)) {
    const normalizedMusic = normalizeMusicMessage(message);
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
        conversationTracker.addMessage('user', message['text']);

        // 🚀 Ferni EQ: Trigger micro-expressions based on user transcript content
        // This enables subliminal trust-building through authentic reactions
        const microParams = analyzeForMicroExpression(message['text']);
        ferni.detectAndTriggerMicroExpression(microParams);
        log.debug('🚀 Micro-expression analysis', {
          tone: microParams.tone,
          intensity: microParams.intensity,
        });

        // 🎬 Luxo: Check for surprising/unexpected content
        if (microParams.isSurprise) {
          document.dispatchEvent(new CustomEvent('ferni:surprise-content'));
        }

        // 🎬 Luxo: Check for insight/realization
        if (microParams.hasInsight) {
          document.dispatchEvent(new CustomEvent('ferni:user-insight'));
        }
        
        // 🎬 Luxo: Check for setback/failure (Growth Through Gentleness)
        if (microParams.hasSetback) {
          document.dispatchEvent(new CustomEvent('ferni:setback-shared'));
          log.debug('🎬 Setback detected - triggering grounding support');
        }
        
        // 🎬 Luxo: Check for humor (Authentic Personality)
        if (microParams.hasHumor) {
          document.dispatchEvent(new CustomEvent('ferni:humor-detected'));
          log.debug('🎬 Humor detected - triggering playful response');
        }
        
        // 🎬 Luxo: Check for achievement (celebrate small wins)
        if (microParams.hasAchievement) {
          document.dispatchEvent(new CustomEvent('ferni:growth-recognized'));
        }
        
        // 🎬 Luxo: Check for emotional/vulnerable content
        if (microParams.isVulnerable || microParams.isProcessingDeep) {
          document.dispatchEvent(new CustomEvent('ferni:emotional-content'));
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

    case 'trust_signal':
      // 💚 Trust Signal: "Ferni noticed..." UI cards from backend trust systems
      handleTrustSignal(message as TrustSignalEvent);
      break;

    case 'breath_sync':
      // 🫁 Ferni EQ: Breath sync quality from backend for avatar breathing animation
      handleBreathSync(message as BreathSyncEvent);
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
 */
function handlePartialTranscript(event: PartialTranscriptEvent): void {
  const { text } = event;

  // Skip very short partials
  if (text.length < 15) return;

  // Detect anticipated tone from partial speech
  const tone = detectAnticipatedTone(text);
  const energy = estimateEnergyFromText(text);

  // Trigger anticipation
  ferni.anticipateEmotion({
    transcript: text,
    tone,
    energy,
  });

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

/**
 * Handle voice prosody data from backend for Ferni EQ concern detection
 *
 * This enables "Better than Human" emotional intelligence by:
 * 1. Detecting voice strain/breaking for concern response
 * 2. Tracking pause patterns for breath synchronization
 * 3. Mapping stress levels to empathetic expressions
 */
function handleVoiceProsody(event: VoiceProsodyEvent): void {
  log.debug('🚀 Voice prosody received', {
    stressLevel: event.stressLevel,
    anxietyMarkers: event.anxietyMarkers,
    valence: event.valence,
  });

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

    // Sighing indicated by low speech rate + breathiness
    sighing:
      (event.breathiness !== undefined && event.breathiness > 0.6) ||
      (event.speechRate !== undefined && event.speechRate < 0.3),
  };

  // Run concern detection
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

/**
 * Handle celebration events from the agent.
 * Zen aesthetic: warmth and breathing, not explosions.
 * 🎬 Enhanced with Pixar emotions for character expressiveness.
 * 🎬 Luxo Jr. integration: Triggers emotional arcs and investigations.
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

    // 🎬 Luxo: Dispatch celebration for celebration arc
    document.dispatchEvent(new CustomEvent('ferni:celebration'));
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
      // 🎬 Luxo: User had an insight - trigger realization arc
      document.dispatchEvent(new CustomEvent('ferni:user-insight'));
    } else {
      // Good news: delighted expression with sparkle
      ferniExpressions.delight();
      // 🎬 Luxo: Surprise content - trigger investigation
      document.dispatchEvent(new CustomEvent('ferni:surprise-content'));
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
      // 🎬 Luxo: User sharing emotional content - trigger empathy investigation
      document.dispatchEvent(new CustomEvent('ferni:emotional-content'));
      break;

    case 'anxious':
      // Show calm, grounding presence
      // Don't mirror anxiety - show steady supportiveness
      ferniExpressions.setExpression('empathetic', 300, 2000);
      // 🎬 Luxo: User sharing emotional content - trigger empathy investigation
      document.dispatchEvent(new CustomEvent('ferni:emotional-content'));
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
// CAMEO UNLOCK: Team Member Introduction
// ============================================================================

/**
 * Message sent when Ferni introduces a new team member.
 * This is the "cameo unlock" moment - a celebration!
 */
interface CameoUnlockMessage {
  type: 'cameo_unlock';
  memberId: string;
  displayName: string;
  role: string;
  spokenIntro: string;
  timestamp: number;
  // Index signature to satisfy DataMessage compatibility
  readonly [key: string]: unknown;
}

/**
 * Type guard for cameo unlock messages.
 */
function isCameoUnlockMessage(message: DataMessage): boolean {
  return (
    message.type === 'cameo_unlock' &&
    typeof message['memberId'] === 'string' &&
    typeof message['displayName'] === 'string'
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
  if (!event.memberId || !event.displayName) {
    log.warn('Invalid cameo unlock message:', event);
    return;
  }

  // 1. Celebrate! Play unlock sound
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
