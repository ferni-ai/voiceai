/**
 * Intelligence Hooks for Voice Agent
 *
 * Lightweight hooks that can be wired into the voice agent without
 * impacting startup time. These run AFTER session is connected.
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { IntelligenceIntegration } from './intelligence-integration.js';

const log = getLogger();

// ============================================================================
// LAZY LOADING
// ============================================================================

// Lazy load to avoid impacting startup time
let intelligenceModule: typeof import('./intelligence-integration.js') | null = null;

async function getIntelligenceModule() {
  if (!intelligenceModule) {
    intelligenceModule = await import('./intelligence-integration.js');
  }
  return intelligenceModule;
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Initialize intelligence for a voice session (call AFTER session starts)
 *
 * @param personaId - The persona ID (e.g., 'ferni')
 * @param userId - The user's ID (from participant identity or metadata)
 * @returns Intelligence integration or null if disabled/failed
 */
export async function initializeSessionIntelligence(
  personaId: string,
  userId: string | undefined
): Promise<IntelligenceIntegration | null> {
  // Skip if no user ID
  if (!userId) {
    log.debug({ personaId }, 'No userId available, skipping intelligence initialization');
    return null;
  }

  // Skip if explicitly disabled
  if (process.env.DISABLE_INTELLIGENCE === 'true') {
    log.debug({ personaId, userId }, 'Intelligence disabled via env');
    return null;
  }

  try {
    const { initializeIntelligence } = await getIntelligenceModule();
    const intelligence = await initializeIntelligence(personaId, userId, {
      autoDetectMoments: true,
      enablePredictive: true,
      enablePersistence: true,
      saveOnSessionEnd: true,
      momentConfidenceThreshold: 0.6,
    });

    intelligence.startSession();

    log.info(
      {
        personaId,
        userId,
        stage: intelligence.getRelationshipSummary().stage,
        sessions: intelligence.getRelationshipSummary().totalSessions,
      },
      'Intelligence session started'
    );

    return intelligence;
  } catch (error) {
    log.error({ error, personaId, userId }, 'Failed to initialize intelligence');
    return null;
  }
}

/**
 * Process a user message through the intelligence system
 *
 * @param intelligence - The intelligence integration
 * @param userMessage - The user's message
 * @param aiResponse - Optional AI response
 * @param topic - Optional current topic
 * @returns Processing result or null
 */
export async function processMessageWithIntelligence(
  intelligence: IntelligenceIntegration | null,
  userMessage: string,
  aiResponse?: string,
  topic?: string
): Promise<{
  shouldAcknowledge: boolean;
  concerns: Array<{ severity: string; detection: string }>;
  suggestedResponse?: string;
} | null> {
  if (!intelligence) return null;

  try {
    const result = await intelligence.processMessage(userMessage, aiResponse, topic);

    return {
      shouldAcknowledge: result.shouldAcknowledgeMoment,
      concerns: result.predictive?.concerns || [],
      suggestedResponse: result.suggestedResponse,
    };
  } catch (error) {
    log.error({ error }, 'Failed to process message with intelligence');
    return null;
  }
}

/**
 * End the intelligence session and persist memory
 *
 * @param intelligence - The intelligence integration
 * @param mood - Session mood
 * @param topics - Topics discussed
 */
export async function endSessionIntelligence(
  intelligence: IntelligenceIntegration | null,
  mood: 'positive' | 'neutral' | 'struggling' | 'crisis' = 'neutral',
  topics: string[] = []
): Promise<void> {
  if (!intelligence) return;

  try {
    await intelligence.endSession(mood, 'medium', topics);
    log.info('Intelligence session ended and memory saved');
  } catch (error) {
    log.error({ error }, 'Failed to end intelligence session');
  }
}

/**
 * Get enhanced system prompt with relationship context
 *
 * @param intelligence - The intelligence integration
 * @param basePrompt - The original system prompt
 * @param currentTopic - Optional current topic
 * @returns Enhanced prompt with relationship context
 */
export function enhanceSystemPrompt(
  intelligence: IntelligenceIntegration | null,
  basePrompt: string,
  currentTopic?: string
): string {
  if (!intelligence) return basePrompt;

  try {
    const injection = intelligence.getPromptInjection(currentTopic);
    if (injection) {
      return `${basePrompt}\n\n${injection}`;
    }
  } catch (error) {
    log.error({ error }, 'Failed to enhance system prompt');
  }

  return basePrompt;
}

/**
 * Get quick prompt enhancement (one-shot, no session tracking)
 * Useful for API calls where you want relationship context but not full session tracking
 */
export async function getQuickPromptEnhancement(
  personaId: string,
  userId: string,
  currentTopic?: string
): Promise<string> {
  try {
    const { getQuickPromptInjection } = await getIntelligenceModule();
    return await getQuickPromptInjection(personaId, userId, currentTopic);
  } catch (error) {
    log.error({ error, personaId, userId }, 'Failed to get quick prompt enhancement');
    return '';
  }
}

export default {
  initializeSessionIntelligence,
  processMessageWithIntelligence,
  endSessionIntelligence,
  enhanceSystemPrompt,
  getQuickPromptEnhancement,
};



