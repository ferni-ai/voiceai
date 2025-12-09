/**
 * Data Message Handlers
 *
 * Handles incoming data messages from the voice agent.
 * Each handler processes a specific message type (celebration, emotion, music, etc.)
 */

import type {
  DataMessage,
  CelebrationEvent,
  EmotionEvent,
  ExpressionEvent,
  MoodEvent,
  MusicEvent,
  EngagementTriggerEvent,
  WrapUpEvent,
} from '../types/events.js';
import {
  isCelebrationMessage,
  isEmotionMessage,
  isExpressionMessage,
  isMoodMessage,
  isMusicMessage,
  isEngagementTriggerMessage,
  isWrapUpMessage,
} from '../types/events.js';

import { createLogger } from '../utils/logger.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { coachUI } from '../ui/coach.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { moodUI } from '../ui/mood.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { delightService } from '../services/delight.service.js';
import { moodService } from '../services/index.js';
import { handoffService } from '../services/index.js';
import { engagementService } from '../services/index.js';
import { conversationTracker } from '../services/conversation-tracker.service.js';
import { setWrappingUp } from '../state/app.state.js';
// 🎬 Ferni Expressions - Character-level avatar expressions
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
// 🎚️ Music Audio Controller - Real-time ducking
import { getMusicAudioController } from '../services/music-audio.controller.js';
// Connection service - for music track expectation
import { connectionService } from '../services/index.js';
// 🚀 Ferni EQ - Superhuman emotional intelligence
import { ferni } from '../ui/better-than-human.ui.js';
// Tone detection for micro-expressions
import { analyzeForMicroExpression, detectAnticipatedTone, estimateEnergyFromText } from '../utils/tone-detection.js';

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
  if (isMusicMessage(message)) {
    handleMusic(message);
    return;
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

    case 'transcript':
    case 'agent_transcript':
      // Track agent message for conversation history
      if (typeof message['text'] === 'string') {
        conversationTracker.addMessage('agent', message['text'], message['personaId'] as string | undefined);
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
        log.debug('🚀 Micro-expression analysis', { tone: microParams.tone, intensity: microParams.intensity });
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
    pauseFrequency: event.pauseDuration !== undefined 
      ? Math.min(1, event.pauseDuration / 1000) // Normalize to 0-1
      : undefined,
    
    // Sighing indicated by low speech rate + breathiness
    sighing: (event.breathiness !== undefined && event.breathiness > 0.6) ||
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
  const emotionMap: Record<string, 'neutral' | 'happy' | 'excited' | 'calm' | 'thoughtful' | 'empathetic' | 'serious' | 'anxious' | 'encouraging'> = {
    'neutral': 'neutral',
    'happy': 'happy',
    'sad': 'empathetic',      // Sad → empathetic glow (supportive)
    'anxious': 'anxious',
    'excited': 'excited',
    'frustrated': 'serious',   // Frustrated → serious glow (grounded)
    'calm': 'calm',
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
 */
export function handleMusic(event: MusicEvent): void {
  log.debug('Music event:', event.state, event.trackName);

  // Import Now Playing UI dynamically to avoid circular deps
  import('../ui/now-playing.ui.js').then(({ nowPlayingUI }) => {
    if (event.state === 'playing') {
      // 🎚️ Signal ConnectionService to expect a music track soon
      // This helps identify the audio track as music for ducking
      connectionService.expectMusicTrack();
      
      // 🎚️ Unduck music - it's playing normally now
      getMusicAudioController().unduckFromBackend();
      
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

      log.debug('Music playing:', event.trackName);
    } else if (event.state === 'changing') {
      // DJ Crossfade - switching tracks smoothly
      avatarFeedback.fading();
      nowPlayingUI.updateState('changing');

      // 🎬 Pixar: Excited anticipation for new track
      ferniExpressions.curious();
      
      // Subtle haptic for track change
      delightService.haptic('light');
      
      log.debug('Music changing - DJ crossfade in progress');
    } else if (event.state === 'ducking') {
      // 🎚️ Duck music - agent is speaking over it
      getMusicAudioController().duckFromBackend();
      
      // Agent speaking over music - subtle the pulse
      avatarFeedback.ducking();
      nowPlayingUI.updateState('ducking');

      // 🎬 Pixar: Return to neutral while speaking
      // (Natural transition - avatar focuses on user)
      
      // Waveform stays in music mode but is naturally calmer during speech
      log.debug('Music ducking (agent speaking)');
    } else if (event.state === 'fading') {
      // DJ-style fade out - track ending soon
      avatarFeedback.fading();
      nowPlayingUI.updateState('fading');

      // 🎬 Pixar: Appreciative expression as music fades
      // Like savoring the last notes of a good song
      ferniExpressions.setExpression('happy', 400, 3000);

      log.debug('Music fading out...');
    } else if (event.state === 'paused') {
      avatarFeedback.stopDancing();
      nowPlayingUI.updateState('paused');

      // 🎬 Pixar: Curious expression - "paused? everything okay?"
      ferniExpressions.curious();

      log.debug('Music paused');
    } else if (event.state === 'stopped' || event.state === 'idle') {
      // Gracefully return to rest
      avatarFeedback.stopDancing();

      // Waveform: Return to normal behavior
      waveformUI.setMusicPlaying(false);

      // 🎬 Pixar: Warm, satisfied expression after music ends
      // Not sad it's over, grateful it happened
      if (!event.isAmbient) {
        ferniExpressions.setExpression('empathetic', 300, 2000);
      }

      // Hide Now Playing card
      nowPlayingUI.hide();

      log.debug('Music stopped');
    }
  }).catch(() => {
    // Now Playing UI not available - continue without it
    log.debug('Now Playing UI not available');
  });
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
