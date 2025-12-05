/**
 * Context Building Helpers
 *
 * Simplified helper functions for building conversation context.
 * These reduce code volume in voice-agent.ts.
 *
 * Note: Uses loose typing intentionally - the underlying modules
 * provide full type safety when imported directly.
 */

import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// EASTER EGG DETECTION
// ============================================================================

export interface EasterEggResult {
  triggered: boolean;
  type: string;
  response?: string;
}

/**
 * Check for Easter eggs in user message
 */
export async function checkEasterEggs(
  userText: string,
  personaId: string,
  conversationCount: number = 0,
  createdAt?: Date
): Promise<EasterEggResult> {
  try {
    const { checkForEasterEgg } = await import('../../personas/easter-eggs.js');
    const easterEggContext = createdAt 
      ? { conversationCount, userSinceDate: createdAt }
      : { conversationCount };
    const result = checkForEasterEgg(userText, personaId, easterEggContext);

    if (result.type !== 'none' && result.response) {
      getLogger().info({ type: result.type }, '🎉 Easter egg triggered!');
      return { triggered: true, type: result.type, response: result.response };
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Easter egg check failed');
  }

  return { triggered: false, type: 'none' };
}

// ============================================================================
// RESPONSE LENGTH GUIDANCE
// ============================================================================

export interface LengthGuidance {
  length: string;
  reason: string;
}

/**
 * Get response length guidance based on conversation dynamics
 */
export async function getResponseLengthGuidance(
  userText: string,
  topics: string[]
): Promise<LengthGuidance> {
  try {
    const { getResponseDynamicsEngine } = await import('../../conversation/index.js');
    const engine = getResponseDynamicsEngine();
    engine.recordMessage('user', userText, topics);
    
    const guidance = engine.getLengthGuidance() as unknown;
    if (typeof guidance === 'string') {
      return { length: guidance, reason: '' };
    }
    if (typeof guidance === 'object' && guidance !== null) {
      const g = guidance as Record<string, unknown>;
      return {
        length: String(g.recommendedLength || g.length || 'moderate'),
        reason: String(g.reason || ''),
      };
    }
    return { length: 'moderate', reason: 'default' };
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Length guidance failed');
    return { length: 'moderate', reason: 'default' };
  }
}

// ============================================================================
// TOPIC TRANSITIONS
// ============================================================================

/**
 * Get topic transition phrase if topic changed
 */
export async function getTopicTransition(
  previousTopic: string | undefined,
  currentTopic: string | undefined
): Promise<string | undefined> {
  if (!previousTopic || !currentTopic || previousTopic === currentTopic) {
    return undefined;
  }

  try {
    const { getResponseDynamicsEngine } = await import('../../conversation/index.js');
    const engine = getResponseDynamicsEngine();
    const transition = engine.getTopicTransition(previousTopic, currentTopic);
    
    if (transition?.phrase) {
      return `[TOPIC SHIFT: Smoothly transition from ${previousTopic} to ${currentTopic}. Consider: "${transition.phrase}"]`;
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Topic transition failed');
  }

  return undefined;
}

// ============================================================================
// EMOTIONAL ARC
// ============================================================================

export interface EmotionalArcSummary {
  phase: string;
  intensity: number;
  transitionPhrase?: string;
}

/**
 * Get emotional arc summary
 */
export async function getEmotionalArcSummary(): Promise<EmotionalArcSummary> {
  try {
    const { getEmotionalArcTracker } = await import('../../conversation/index.js');
    const tracker = getEmotionalArcTracker();
    
    const arc = tracker.getArc() as unknown as Record<string, unknown> | null;
    const transition = tracker.getTransitionPhrase();
    
    const summary: EmotionalArcSummary = {
      phase: String(arc?.currentPhase || arc?.phase || 'neutral'),
      intensity: Number(arc?.currentIntensity || arc?.intensity || 0.5),
    };
    if (transition) {
      summary.transitionPhrase = transition;
    }
    return summary;
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Emotional arc failed');
    return { phase: 'neutral', intensity: 0.5 };
  }
}

// ============================================================================
// TASK CONTEXT
// ============================================================================

/**
 * Process user turn through task manager
 * Returns count of active tasks
 */
export async function getActiveTaskCount(
  userText: string,
  isReturningUser?: boolean,
  lastSummary?: string
): Promise<number> {
  try {
    const { getTaskManager } = await import('../../tasks/task-manager.js');
    const { analyzeMessage } = await import('../../intelligence/index.js');
    
    const analysisOptions: { isReturningUser?: boolean } = {};
    if (isReturningUser !== undefined) {
      analysisOptions.isReturningUser = isReturningUser;
    }
    const analysis = analyzeMessage(userText, analysisOptions);
    const taskManager = getTaskManager();
    
    const taskContext: { isReturningUser?: boolean; lastSummary?: string } = {};
    if (isReturningUser !== undefined) {
      taskContext.isReturningUser = isReturningUser;
    }
    if (lastSummary !== undefined) {
      taskContext.lastSummary = lastSummary;
    }
    taskManager.processUserTurn(analysis, userText, taskContext);
    
    const tasks = taskManager.getActiveTasks();
    if (tasks.length > 0) {
      getLogger().info({ count: tasks.length }, 'Task wisdom active');
    }
    
    return tasks.length;
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Task processing failed');
    return 0;
  }
}

// ============================================================================
// CONVERSATION STATE RESET
// ============================================================================

/**
 * Reset all conversation state for a new session
 */
export async function resetAllConversationSystems(): Promise<void> {
  try {
    const { resetAllConversationState } = await import('../../conversation/index.js');
    const { resetCatchphraseTracking } = await import('../../speech/response-naturalness.js');
    const { resetHandoffState, resetMetPersonas } = await import('../../tools/handoff/index.js');
    
    resetAllConversationState();
    resetCatchphraseTracking();
    resetHandoffState();
    resetMetPersonas();
    
    getLogger().debug('All conversation systems reset');
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to reset some systems');
  }
}

// ============================================================================
// MUSIC DUCKING
// ============================================================================

/**
 * Duck background music when agent speaks
 * Only operates if MUSIC_ENABLED=true
 */
export async function duckBackgroundMusic(): Promise<void> {
  try {
    const { isMusicEnabled } = await import('../../config/environment.js');
    if (!isMusicEnabled()) return;
    
    const { getMusicPlayer } = await import('../../audio/index.js');
    const player = getMusicPlayer();
    if (player.isPlaying()) {
      player.duck();
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Music ducking failed');
  }
}

/**
 * Unduck background music when agent stops speaking
 * Only operates if MUSIC_ENABLED=true
 */
export async function unduckBackgroundMusic(): Promise<void> {
  try {
    const { isMusicEnabled } = await import('../../config/environment.js');
    if (!isMusicEnabled()) return;
    
    const { getMusicPlayer } = await import('../../audio/index.js');
    const player = getMusicPlayer();
    if (player.getState().isDucked) {
      player.unduck();
    }
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'Music unducking failed');
  }
}
