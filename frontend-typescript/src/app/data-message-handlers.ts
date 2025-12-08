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

    default:
  }
}

/**
 * Handle celebration events from the agent.
 * Zen aesthetic: warmth and breathing, not explosions.
 */
export function handleCelebration(event: CelebrationEvent): void {
  // Milestone/achievement - warm acknowledgement
  if (event.celebrationType === 'milestone' || event.celebrationType === 'achievement') {
    celebrationsUI.warmthGlow({ intensity: 'warm' });
    delightService.haptic('light');
    waveformUI.celebrate();

    if (event.message) {
      celebrationsUI.celebrateMilestone(event.message);
    }
  }

  // Aha moment / good news - gentle recognition
  if (event.celebrationType === 'aha_moment' || event.celebrationType === 'good_news') {
    celebrationsUI.gentleBounce();
    celebrationsUI.warmthGlow({ intensity: 'gentle' });
    soundUI.play('success');
    delightService.haptic('light');
    presenceUI.bounce();
    // Flash encouraging emotion for aha moments
    presenceUI.flashEmotion('encouraging', 800);
  }
}

/**
 * Handle emotion events from voice prosody analysis.
 * Updates waveform particles to reflect detected user emotion.
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
}

/**
 * Handle expression events from agents.
 * (Emoji morphing disabled for now - may revisit later)
 */
export function handleExpression(_event: ExpressionEvent): void {
  // Future: could show emoji in UI or trigger visual effect
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
 */
export function handleMusic(event: MusicEvent): void {
  log.debug('Music event:', event.state, event.trackName);

  if (event.state === 'playing') {
    // Avatar: Bass speaker pulse - music is playing
    avatarFeedback.dancing();

    // Waveform: Gentle, reflective visualization (NOT aggressive)
    waveformUI.setMusicPlaying(true);

    // Subtle haptic for music start
    delightService.haptic('light');

    // Show track info briefly
    if (event.trackName && event.artistName) {
      messageUI.show(`${event.trackName} by ${event.artistName}`, 'info', 3000);
    }

    log.debug('Music playing:', event.trackName);
  } else if (event.state === 'changing') {
    // 🎧 DJ Crossfade - switching tracks smoothly!
    // Brief fading effect during the transition
    avatarFeedback.fading();
    
    // Subtle haptic for track change
    delightService.haptic('light');
    
    log.debug('Music changing - DJ crossfade in progress');
  } else if (event.state === 'ducking') {
    // Agent speaking over music - subtle the pulse
    avatarFeedback.ducking();
    // Waveform stays in music mode but is naturally calmer during speech
    log.debug('Music ducking (agent speaking)');
  } else if (event.state === 'fading') {
    // DJ-style fade out - track ending soon
    avatarFeedback.fading();
    log.debug('Music fading out...');
  } else if (event.state === 'paused' || event.state === 'stopped' || event.state === 'idle') {
    // Gracefully return to rest
    avatarFeedback.stopDancing();

    // Waveform: Return to normal behavior
    waveformUI.setMusicPlaying(false);

    log.debug('Music stopped');
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
 * 
 * - Disconnect button becomes more prominent ("Goodbye" style)
 * - Avatar shows warm farewell animation
 * - Waveform softens
 */
export function handleWrapUp(event: WrapUpEvent): void {
  log.info('Wrap-up signal received:', event.sentiment);
  
  // Set state - this triggers UI updates across the app
  setWrappingUp(true);
  
  // Play the farewell animation
  presenceUI.farewell();
  
  // Warm visual feedback based on sentiment
  switch (event.sentiment) {
    case 'warm':
      celebrationsUI.warmthGlow({ intensity: 'gentle' });
      presenceUI.setVoiceEmotion('happy');
      break;
    case 'encouraging':
      presenceUI.setVoiceEmotion('encouraging');
      presenceUI.nod(); // Affirming nod
      break;
    case 'thoughtful':
      presenceUI.setVoiceEmotion('thoughtful');
      break;
    case 'caring':
      presenceUI.setVoiceEmotion('empathetic');
      celebrationsUI.warmthGlow({ intensity: 'warm' });
      break;
  }
  
  // Gentle haptic for the goodbye moment
  delightService.haptic('light');
  
  // If there's a custom message, show it briefly
  if (event.message) {
    messageUI.show(event.message, 'info', 3000);
  }
}
