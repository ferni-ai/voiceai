/**
 * Pacing Context Builder
 *
 * Handles conversation rhythm and pacing:
 * - Response length matching (mirror user's length)
 * - Conversational fatigue detection
 * - Conversation rhythm (build and release tension)
 * - Pacing score assessment
 * - Session recovery
 *
 * These create natural conversational flow.
 *
 * Extracted from jack-bogle.ts lines 1120-1136, 1196-1211, 1458-1492
 */
import { log } from '@livekit/agents';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { calculatePacingScore, shouldAttemptRecovery } from '../conversation-quality.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

interface TrackedTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtendedUserData {
  turnCount?: number;
  conversationMood?: string;
  keyMoments?: Array<unknown>;
  lastPacingScore?: number;
  sessionRecoveryState?: {
    wasDisconnected?: boolean;
    disconnectedAt?: number;
    recoveryGreeting?: string;
  };
}

interface ExtendedServices {
  sessionStartTime?: number;
  historyTracker?: {
    getRecentTurns: (count: number) => TrackedTurn[];
  };
}

// ============================================================================
// PACING HELPERS
// ============================================================================

/**
 * Get response length guidance based on user's message length
 */
function getResponseLengthGuidance(userTextLength: number): string | null {
  if (userTextLength < 20) {
    return `[RESPONSE LENGTH: User sent a SHORT message (${userTextLength} chars). Keep your response brief too - 1-2 sentences max. Mirror their energy.]`;
  }
  if (userTextLength < 50) {
    return `[RESPONSE LENGTH: User sent a MEDIUM message. Respond proportionally - 2-3 sentences.]`;
  }
  if (userTextLength > 200) {
    return `[RESPONSE LENGTH: User sent a LONG message (${userTextLength} chars). They're engaged! You can elaborate more - but still be focused.]`;
  }
  return null;
}
/**
 * Get fatigue indicator based on session length
 */
function getFatigueIndicator(turnCount: number, sessionMinutes: number): string | null {
  // Jack gets tired in long conversations
  if (sessionMinutes > 30 || turnCount > 25) {
    const indicators = [
      'You know, at my age, a good conversation is better than a long one...',
      "I'm enjoying this, but I should probably let you get on with your day...",
      "We've covered a lot of ground today...",
      'My wife always says I talk too much...',
    ];
    return indicators[Math.floor(Math.random() * indicators.length)];
  }
  if (sessionMinutes > 20 || turnCount > 18) {
    const indicators = [
      'Let me know if you need to go—I can ramble on...',
      "I hope I'm not keeping you...",
    ];
    return indicators[Math.floor(Math.random() * indicators.length)];
  }
  return null;
}
/**
 * Get conversation rhythm guidance
 */
function getConversationRhythm(turnCount: number, recentTension: boolean): string | null {
  // After heavy topic, suggest lightening
  if (recentTension && turnCount % 5 === 0) {
    const releases = [
      'You know, after all this serious talk, let me share something lighter...',
      'Speaking of which, that reminds me of a funny story...',
      'But enough of the heavy stuff for a moment...',
    ];
    return releases[Math.floor(Math.random() * releases.length)];
  }
  // If conversation has been light, suggest depth
  if (!recentTension && turnCount > 8 && turnCount % 6 === 0) {
    const deepen = [
      'Can I ask you something more personal?',
      "You know what I'm curious about?",
      "Here's what I've been wondering...",
    ];
    return deepen[Math.floor(Math.random() * deepen.length)];
  }
  return null;
}
// ============================================================================
// PACING CONTEXT BUILDER
// ============================================================================
/**
 * Build pacing-related context injections
 */
function buildPacingContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, services, userData } = input;
  const extServices = services as unknown as ExtendedServices;
  const extUserData = userData as ExtendedUserData;
  const injections: ContextInjection[] = [];
  const turnCount = extUserData.turnCount || 0;
  // -----------------------------------------------
  // RESPONSE LENGTH MATCHING
  // -----------------------------------------------
  const lengthGuidance = getResponseLengthGuidance(userText.length);
  if (lengthGuidance) {
    injections.push(createHintInjection('response_length', lengthGuidance));
  }
  // -----------------------------------------------
  // CONVERSATIONAL FATIGUE
  // -----------------------------------------------
  const sessionDuration = (Date.now() - (extServices.sessionStartTime || Date.now())) / 60000;
  const fatigueIndicator = getFatigueIndicator(turnCount, sessionDuration);
  if (fatigueIndicator) {
    injections.push(
      createHintInjection('fatigue', `[FATIGUE: Consider weaving in: "${fatigueIndicator}"]`)
    );
  }
  // -----------------------------------------------
  // CONVERSATION RHYTHM
  // -----------------------------------------------
  const recentTension =
    extUserData.conversationMood === 'heavy' || extUserData.conversationMood === 'deep';
  const rhythm = getConversationRhythm(turnCount, recentTension);
  if (rhythm) {
    injections.push(
      createHintInjection(
        'rhythm',
        `[RHYTHM: Consider shifting the conversation energy: "${rhythm}"]`
      )
    );
  }
  // -----------------------------------------------
  // CONVERSATION PACING SCORE
  // Assess how the conversation is going
  // -----------------------------------------------
  if (turnCount > 5 && turnCount % 5 === 0) {
    const recentTurns = services.historyTracker?.getSimpleTurns().slice(-8) || [];
    const recentMessages = recentTurns.map((t: { role: string; content: string }) => ({
      role: t.role as 'user' | 'assistant',
      content: t.content,
    }));
    const pacingScore = calculatePacingScore(
      recentMessages,
      turnCount,
      analysis.topics.detected,
      userData.keyMoments?.length || 0,
      0 // goals reached - would need to track
    );
    if (userData) userData.lastPacingScore = pacingScore.overallScore;
    if (pacingScore.assessment === 'needs_attention' || pacingScore.assessment === 'struggling') {
      injections.push(
        createStandardInjection(
          'pacing_alert',
          `[PACING ALERT: Conversation is ${pacingScore.assessment}. ${pacingScore.suggestions.join(' ')}]`
        )
      );
      getLogger().warn(
        {
          score: pacingScore.overallScore,
          assessment: pacingScore.assessment,
        },
        'Conversation pacing needs attention'
      );
    } else if (pacingScore.assessment === 'excellent') {
      injections.push(
        createHintInjection(
          'pacing_excellent',
          `[PACING: Excellent conversation flow! Keep doing what you're doing.]`
        )
      );
    }
  }
  // -----------------------------------------------
  // SESSION RECOVERY CHECK
  // If this is a reconnection, acknowledge it
  // -----------------------------------------------
  if (userData.sessionRecoveryState?.wasDisconnected) {
    const recovery = userData.sessionRecoveryState;
    if (recovery.disconnectedAt && shouldAttemptRecovery(recovery.disconnectedAt)) {
      injections.unshift(
        createStandardInjection(
          'session_recovery',
          `[SESSION RECOVERED: You were disconnected. START with: "${recovery.recoveryGreeting}"]`
        )
      );
      userData.sessionRecoveryState = undefined; // Clear after using
      getLogger().info('Session recovery greeting injected');
    }
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('pacing', buildPacingContext);
export {
  buildPacingContext,
  getResponseLengthGuidance,
  getFatigueIndicator,
  getConversationRhythm,
};
