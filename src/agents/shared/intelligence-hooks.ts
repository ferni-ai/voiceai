/**
 * Intelligence Hooks for Voice Agent
 *
 * NOTE: The old intelligence system (persona-intelligence.ts, predictive-intelligence.ts)
 * has been deprecated and removed. The new intelligence system is in src/intelligence/.
 *
 * This file provides stub implementations for backward compatibility.
 * The functions return null to indicate no intelligence processing.
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES (stub for backward compatibility)
// ============================================================================

/**
 * @deprecated Use new intelligence system in src/intelligence/
 */
export interface IntelligenceIntegration {
  startSession: () => void;
  endSession: (mood: string, engagement: string, topics: string[]) => Promise<void>;
  processMessage: (
    userMessage: string,
    aiResponse?: string,
    topic?: string
  ) => Promise<{
    shouldAcknowledgeMoment: boolean;
    predictive?: { concerns: Array<{ severity: string; detection: string }> };
    suggestedResponse?: string;
  }>;
  getPromptInjection: (topic?: string) => string | null;
  getRelationshipSummary: () => { stage: string; totalSessions: number };
}

// ============================================================================
// SESSION HOOKS (stubs - always return null)
// ============================================================================

/**
 * Initialize intelligence for a voice session
 * @deprecated Use new intelligence system in src/intelligence/relationship/
 */
export async function initializeSessionIntelligence(
  personaId: string,
  userId: string | undefined
): Promise<IntelligenceIntegration | null> {
  log.debug(
    { personaId, userId },
    'Old intelligence system removed - use src/intelligence/ instead'
  );
  return null;
}

/**
 * Process a user message through the intelligence system
 * @deprecated Use new intelligence system
 */
export async function processMessageWithIntelligence(
  _intelligence: IntelligenceIntegration | null,
  _userMessage: string,
  _aiResponse?: string,
  _topic?: string
): Promise<{
  shouldAcknowledge: boolean;
  concerns: Array<{ severity: string; detection: string }>;
  suggestedResponse?: string;
} | null> {
  return null;
}

/**
 * End the intelligence session and persist memory
 * @deprecated Use new intelligence system
 */
export async function endSessionIntelligence(
  _intelligence: IntelligenceIntegration | null,
  _mood: 'positive' | 'neutral' | 'struggling' | 'crisis' = 'neutral',
  _topics: string[] = []
): Promise<void> {
  // No-op - old system removed
}

/**
 * Get enhanced system prompt with relationship context
 * @deprecated Use new intelligence context builders
 */
export function enhanceSystemPrompt(
  _intelligence: IntelligenceIntegration | null,
  basePrompt: string,
  _currentTopic?: string
): string {
  return basePrompt;
}

/**
 * Get quick prompt enhancement
 * @deprecated Use new intelligence context builders
 */
export async function getQuickPromptEnhancement(
  _personaId: string,
  _userId: string,
  _currentTopic?: string
): Promise<string> {
  return '';
}

export default {
  initializeSessionIntelligence,
  processMessageWithIntelligence,
  endSessionIntelligence,
  enhanceSystemPrompt,
  getQuickPromptEnhancement,
};
